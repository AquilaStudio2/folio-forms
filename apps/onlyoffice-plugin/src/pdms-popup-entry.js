import { initializePdmsPopup } from "./pdms-popup.js";

let popup;
window.Asc.plugin.init = () => {
  let options = window.Asc.plugin.info?.options;
  if (typeof options === "string") {
    try {
      options = JSON.parse(options);
    } catch {
      return;
    }
  }
  if (
    !options?.pdmsPopupChannelId ||
    !options.bridgeId ||
    !options.parentOrigin ||
    !options.documentKey
  ) {
    return;
  }
  if (!popup) {
    popup = initializePdmsPopup(window, document, window.Asc.plugin, options);
  }
  popup.locate();
};
