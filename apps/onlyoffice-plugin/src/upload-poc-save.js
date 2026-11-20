let sequence = 0;

/** The original plugin requests a frozen native snapshot; only its trusted host holds Files. */
export const saveUploadPocSnapshot = (hostWindow, options, request) => {
  const { promise, resolve, reject } = Promise.withResolvers();
  sequence += 1;
  const requestId = `attachment-save-${sequence}`;
  // oxlint-disable no-use-before-define -- Cleanup runs only after both listener and timer are initialized.
  const cleanup = () => {
    hostWindow.clearTimeout(timeout);
    hostWindow.removeEventListener("message", receive);
  };
  // oxlint-enable no-use-before-define
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
    if (message.error) {
      const error = new Error(message.error);
      error.attachmentCommitUnresolved = message.attachmentCommitUnresolved;
      reject(error);
    } else {
      resolve(message);
    }
  };
  hostWindow.addEventListener("message", receive);
  const timeout = hostWindow.setTimeout(() => {
    cleanup();
    reject(
      new Error(
        "ยังยืนยันผลบันทึกเดิมไม่ได้ กรุณาเก็บหน้านี้ไว้แล้วตรวจผลเดิมอีกครั้ง ห้ามเลือกส่งไฟล์ซ้ำ"
      )
    );
  }, 60_000);
  try {
    hostWindow.top.postMessage(
      {
        ...request,
        bridgeId: options.bridgeId,
        documentKey: options.documentKey,
        requestId,
        scopeIdentity: options.scopeIdentity,
        source: "folio-upload-poc",
        type: "pending-file-save",
      },
      options.parentOrigin
    );
  } catch (error) {
    cleanup();
    reject(error);
  }
  return promise;
};
