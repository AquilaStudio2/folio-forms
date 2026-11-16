// oxlint-disable complexity prefer-destructuring -- Keep scope, request and pinned-frame checks together at the relay boundary.
import { isNonEmptyString, isRecord } from "./editor-protocol";

export interface AttachmentCategoryPopupScope {
  channelId: string;
  documentKey: string;
}

interface CategoryState {
  target: string;
  currentCategory: string | null;
  status: "loading" | "ready" | "empty" | "error";
  categories: string[];
  error: string | null;
}

const parseState = (value: unknown): CategoryState | null => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.target) ||
    (value.currentCategory !== null &&
      typeof value.currentCategory !== "string") ||
    !["loading", "ready", "empty", "error"].includes(String(value.status)) ||
    !Array.isArray(value.categories) ||
    !value.categories.every(isNonEmptyString) ||
    (value.error !== null && typeof value.error !== "string")
  ) {
    return null;
  }
  return {
    categories: value.categories,
    currentCategory: value.currentCategory,
    error: value.error,
    status: value.status as CategoryState["status"],
    target: value.target,
  };
};

/** Display-only channel; capabilities and editor actions stay on the primary bridge. */
export const createAttachmentCategoryPopupRelay = ({
  bridgeId,
  pluginOrigin,
  scope,
  getPrimary,
  isLive,
}: {
  bridgeId: string;
  pluginOrigin: string;
  scope?: AttachmentCategoryPopupScope;
  getPrimary: () => MessageEventSource | null;
  isLive: (source: MessageEventSource | null) => source is Window;
}) => {
  let primary: Window | null = null;
  let popup: Window | null = null;
  let instanceId: string | null = null;
  let requestId: string | null = null;
  let state: CategoryState | null = null;
  let closed = false;
  const retiredRequests = new Set<string>();
  const post = (target: Window, message: Record<string, unknown>) => {
    try {
      target.postMessage(
        {
          ...message,
          ...scope,
          bridgeId,
          source: "folio-attachment-category-popup-host",
        },
        pluginOrigin
      );
    } catch {
      // A native frame can disappear between validation and delivery.
    }
  };
  const endRequest = (cancel: boolean) => {
    if (!requestId) {
      return;
    }
    // Pinned frames still need teardown after React detaches the editor surface.
    if (cancel && primary) {
      post(primary, { requestId, type: "cancel" });
    }
    if (popup) {
      post(popup, { instanceId, requestId, type: "close" });
    }
    retiredRequests.add(requestId);
    requestId = null;
    state = null;
  };
  const primaryReady = () => {
    if (closed) {
      return;
    }
    const candidate = getPrimary();
    const current = isLive(candidate) ? candidate : null;
    if (current !== primary) {
      endRequest(true);
      primary = current;
    }
  };
  return {
    close() {
      endRequest(true);
      closed = true;
      popup = null;
      primary = null;
    },
    handle(event: MessageEvent<unknown>) {
      const message = event.data;
      if (
        closed ||
        !scope ||
        event.origin !== pluginOrigin ||
        !isRecord(message) ||
        message.bridgeId !== bridgeId ||
        message.channelId !== scope.channelId ||
        message.documentKey !== scope.documentKey ||
        !isLive(event.source)
      ) {
        return;
      }
      primaryReady();
      if (message.source === "form-bridge") {
        if (event.source !== primary || !isNonEmptyString(message.requestId)) {
          return;
        }
        if (message.type === "attachment-category-popup-close") {
          if (message.requestId === requestId) {
            endRequest(false);
          }
          return;
        }
        if (
          message.type !== "attachment-category-popup-state" ||
          retiredRequests.has(message.requestId)
        ) {
          return;
        }
        const next = parseState(message.state);
        if (!next) {
          return;
        }
        if (requestId !== message.requestId) {
          endRequest(true);
        }
        requestId = message.requestId;
        state = next;
        if (isLive(popup)) {
          post(popup, { instanceId, requestId, state, type: "state" });
        }
        return;
      }
      if (
        message.source !== "folio-attachment-category-popup" ||
        event.source === primary ||
        !isNonEmptyString(message.instanceId)
      ) {
        return;
      }
      if (message.type === "ready") {
        if (
          popup &&
          (popup !== event.source || instanceId !== message.instanceId)
        ) {
          return;
        }
        popup = event.source;
        instanceId = message.instanceId;
        post(popup, { instanceId, type: "connected" });
        if (requestId && state) {
          post(popup, { instanceId, requestId, state, type: "state" });
        }
        return;
      }
      if (
        event.source !== popup ||
        message.instanceId !== instanceId ||
        !requestId ||
        message.requestId !== requestId ||
        !isLive(primary) ||
        !["shown", "retry", "cancel", "choose"].includes(String(message.type))
      ) {
        return;
      }
      if (
        message.type === "choose" &&
        (!isNonEmptyString(message.category) ||
          state?.status !== "ready" ||
          !state.categories.includes(message.category))
      ) {
        return;
      }
      post(primary, {
        requestId,
        type: message.type,
        ...(message.type === "choose" ? { category: message.category } : {}),
      });
    },
    isPopupSource(source: MessageEventSource | null) {
      return popup !== null && source === popup;
    },
    primaryReady,
  };
};
