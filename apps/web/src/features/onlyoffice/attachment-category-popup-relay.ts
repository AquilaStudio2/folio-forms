// oxlint-disable complexity prefer-destructuring -- Keep scope, request and pinned-frame checks together at the relay boundary.
import { isNonEmptyString, isRecord } from "./editor-protocol";

export interface AttachmentCategoryPopupScope {
  channelId: string;
  documentKey: string;
}

interface CategoryState {
  target: string;
  currentChoice: {
    document_category_id: number | null;
    storage_template_id: string | null;
    template_name: string | null;
  } | null;
  status: "loading" | "ready" | "empty" | "error";
  categories: { id: number; type: string }[];
  templates: {
    id: string;
    document_category_id: number;
    template_name: string;
  }[];
  error: string | null;
}

const parseState = (value: unknown): CategoryState | null => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.target) ||
    (value.currentChoice !== null &&
      (!isRecord(value.currentChoice) ||
        (value.currentChoice.document_category_id !== null &&
          !Number.isSafeInteger(value.currentChoice.document_category_id)) ||
        (value.currentChoice.storage_template_id !== null &&
          typeof value.currentChoice.storage_template_id !== "string") ||
        (value.currentChoice.template_name !== null &&
          typeof value.currentChoice.template_name !== "string"))) ||
    !["loading", "ready", "empty", "error"].includes(String(value.status)) ||
    !Array.isArray(value.categories) ||
    !value.categories.every(
      (entry) =>
        isRecord(entry) &&
        Number.isSafeInteger(entry.id) &&
        isNonEmptyString(entry.type)
    ) ||
    !Array.isArray(value.templates) ||
    !value.templates.every(
      (entry) =>
        isRecord(entry) &&
        isNonEmptyString(entry.id) &&
        Number.isSafeInteger(entry.document_category_id) &&
        isNonEmptyString(entry.template_name)
    ) ||
    (value.error !== null && typeof value.error !== "string")
  ) {
    return null;
  }
  return {
    categories: value.categories as CategoryState["categories"],
    currentChoice: value.currentChoice as CategoryState["currentChoice"],
    error: value.error,
    status: value.status as CategoryState["status"],
    target: value.target,
    templates: value.templates as CategoryState["templates"],
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
        (!isRecord(message.choice) ||
          state?.status !== "ready" ||
          !state.categories.some(
            (entry) =>
              entry.id ===
              (message.choice as Record<string, unknown>).document_category_id
          ) ||
          !state.templates.some(
            (entry) =>
              entry.id ===
                (message.choice as Record<string, unknown>)
                  .storage_template_id &&
              entry.document_category_id ===
                (message.choice as Record<string, unknown>)
                  .document_category_id &&
              entry.template_name ===
                (message.choice as Record<string, unknown>).template_name
          ))
      ) {
        return;
      }
      post(primary, {
        requestId,
        type: message.type,
        ...(message.type === "choose" && isRecord(message.choice)
          ? {
              choice: {
                document_category_id: message.choice.document_category_id,
                storage_template_id: message.choice.storage_template_id,
                template_name: message.choice.template_name,
              },
            }
          : {}),
      });
    },
    isPopupSource(source: MessageEventSource | null) {
      return popup !== null && source === popup;
    },
    primaryReady,
  };
};
