import { buildPlugin } from "../../server/src/plugin-bundle.ts";
import { createHarness } from "./harness.js";

const artifact = await buildPlugin(
  `${import.meta.dir}/..`,
  "attachment-category-popup-entry.js"
);
const entrySource = await artifact.text();
export const attachCategoryPopup = (primary) => {
  const popup = createHarness({
    attachmentCategoryPopupChannelId: "category-channel",
    documentKind: "xlsx",
    entrySource,
  });
  const ready = popup.messages.find(
    ({ message }) => message.type === "ready"
  ).message;
  const deliver = (frame, message) =>
    frame.dispatch({
      data: {
        ...message,
        instanceId: ready.instanceId,
        source: "folio-attachment-category-popup-host",
      },
      origin: frame.parentOrigin,
      source: frame.parentWindow,
    });
  const primaryPost = primary.parentWindow.postMessage;
  primary.parentWindow.postMessage = (message, origin) => {
    primaryPost(message, origin);
    if (message.type === "attachment-category-popup-state") {
      deliver(popup, { ...message, type: "state" });
    } else if (message.type === "attachment-category-popup-close") {
      deliver(popup, { ...message, type: "close" });
    }
  };
  const popupPost = popup.parentWindow.postMessage;
  popup.parentWindow.postMessage = (message, origin) => {
    popupPost(message, origin);
    if (["shown", "choose", "cancel", "retry"].includes(message.type)) {
      deliver(primary, message);
    }
  };
  deliver(popup, { ...ready, type: "connected" });
  primary.categoryPopup = popup;
  return popup;
};
