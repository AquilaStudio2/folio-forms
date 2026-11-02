// oxlint-disable complexity prefer-destructuring -- Keep scope, pinned-frame and generation checks together at the relay boundary.
import { isNonEmptyString, isRecord } from "./editor-protocol";

export interface PdmsProjectPopupScope {
  channelId: string;
  documentKey: string;
}

/** Relays fixed popup messages; the existing primary bridge retains all action authority. */
export const createPdmsPopupRelay = ({
  bridgeId,
  pluginOrigin,
  scope,
  getPrimary,
  isLive,
}: {
  bridgeId: string;
  pluginOrigin: string;
  scope?: PdmsProjectPopupScope;
  getPrimary: () => MessageEventSource | null;
  isLive: (source: MessageEventSource | null) => source is Window;
}) => {
  let popup: Window | null = null;
  let instanceId: string | null = null;
  let sequence = 0;
  let pendingLocate: Record<string, unknown> | null = null;
  let closed = false;
  const post = (target: Window, message: Record<string, unknown>) => {
    try {
      target.postMessage(
        { ...message, ...scope, bridgeId, source: "folio-pdms-popup-host" },
        pluginOrigin
      );
    } catch {
      // A native frame can disappear between validation and delivery.
    }
  };
  const primaryReady = () => {
    const primary = getPrimary();
    if (!closed && sequence > 0 && isLive(primary) && isLive(popup)) {
      post(primary, pendingLocate || { instanceId, sequence, type: "locate" });
      pendingLocate = null;
    }
  };
  return {
    close() {
      closed = true;
      pendingLocate = null;
      popup = null;
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
      const primary = getPrimary();
      if (
        message.source === "form-bridge" &&
        message.type === "pdms-popup-owner-ready"
      ) {
        if (event.source === primary && isLive(popup)) {
          post(popup, { instanceId, type: "relocate" });
        }
        return;
      }
      if (
        message.source === "form-bridge" &&
        message.type === "pdms-popup-state"
      ) {
        if (
          event.source === primary &&
          isLive(popup) &&
          message.instanceId === instanceId &&
          message.sequence === sequence &&
          isRecord(message.state)
        ) {
          post(popup, {
            instanceId,
            sequence,
            state: message.state,
            type: "state",
          });
        }
        return;
      }
      if (
        message.source !== "folio-pdms-popup" ||
        event.source === primary ||
        !isNonEmptyString(message.instanceId) ||
        !Number.isSafeInteger(message.sequence) ||
        (message.sequence as number) < 0
      ) {
        return;
      }
      if (message.type === "ready") {
        // A replacement iframe must receive a new editor config/bridge, never take over an opening.
        if (
          popup &&
          (popup !== event.source || instanceId !== message.instanceId)
        ) {
          return;
        }
        popup = event.source;
        instanceId = message.instanceId;
        post(popup, { instanceId, type: "connected" });
        return;
      }
      if (
        event.source !== popup ||
        message.instanceId !== instanceId ||
        !["locate", "choose", "retry", "cancel"].includes(String(message.type))
      ) {
        return;
      }
      if (message.type === "locate") {
        if ((message.sequence as number) <= sequence) {
          return;
        }
        sequence = message.sequence as number;
      } else if (message.sequence !== sequence) {
        return;
      }
      if (
        message.type === "choose" &&
        (!isNonEmptyString(message.token) || typeof message.name !== "string")
      ) {
        return;
      }
      const forwarded = {
        instanceId,
        sequence,
        type: message.type,
        ...(message.type === "choose"
          ? { name: message.name, token: message.token }
          : {}),
        ...(message.type === "retry" ? { token: message.token } : {}),
      };
      if (isLive(primary)) {
        post(primary, forwarded);
      } else if (message.type === "locate") {
        pendingLocate = forwarded;
      }
    },
    isPopupSource(source: MessageEventSource | null) {
      return popup !== null && source === popup;
    },
    primaryReady,
  };
};
