// oxlint-disable no-use-before-define -- Message and timeout callbacks share cleanup after registration.
let sequence = 0;

/** Guard saves in the file-selection POC without sending selected bytes to an API. */
export const checkUploadPocPending = (
  hostWindow,
  options,
  action,
  rowChange
) => {
  if (!options.scopeIdentity) {
    return Promise.resolve();
  }
  // oxlint-disable-next-line promise/avoid-new -- postMessage is a browser callback boundary.
  return new Promise((resolve, reject) => {
    sequence += 1;
    const requestId = `pending-check-${sequence}`;
    const cleanup = () => {
      hostWindow.clearTimeout(timeout);
      hostWindow.removeEventListener("message", receive);
    };
    const receive = (event) => {
      const message = event.data;
      if (
        event.source !== hostWindow.top ||
        event.origin !== options.parentOrigin ||
        message?.source !== "folio-upload-poc-host" ||
        message.type !== "pending-file-result" ||
        message.bridgeId !== options.bridgeId ||
        message.documentKey !== options.documentKey ||
        message.requestId !== requestId
      ) {
        return;
      }
      cleanup();
      if (message.error || message.allowed !== true) {
        reject(
          new Error(
            message.error ||
              "มีไฟล์ที่ยังไม่อัปโหลดหรือบันทึกถาวร จึงยังดำเนินการนี้ไม่ได้ใน POC"
          )
        );
      } else {
        resolve();
      }
    };
    hostWindow.addEventListener("message", receive);
    const timeout = hostWindow.setTimeout(() => {
      cleanup();
      reject(new Error("ยังตรวจสอบไฟล์ที่เลือกไม่ได้ กรุณาเก็บหน้านี้ไว้แล้วลองอีกครั้ง"));
    }, 15_000);
    try {
      let requestedAction = action;
      if (rowChange) {
        requestedAction =
          rowChange.action === "insert" ? "append-row" : "delete-row";
      }
      hostWindow.top.postMessage(
        {
          action: requestedAction,
          bridgeId: options.bridgeId,
          documentKey: options.documentKey,
          requestId,
          ...(rowChange ? { rowIndex: rowChange.index } : {}),
          scopeIdentity: options.scopeIdentity,
          source: "folio-upload-poc",
          type: "pending-file-check",
        },
        options.parentOrigin
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
};
