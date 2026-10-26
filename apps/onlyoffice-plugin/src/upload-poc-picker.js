const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const trustedPendingReply = (event, hostWindow, options, pending) => {
  const message = event.data;
  return Boolean(
    options &&
    pending &&
    event.source === hostWindow.top &&
    event.origin === options.parentOrigin &&
    isRecord(message) &&
    message.source === "folio-upload-poc-host" &&
    message.type === "pending-file-result" &&
    message.bridgeId === options.bridgeId &&
    message.documentKey === options.documentKey &&
    message.requestId === pending.requestId
  );
};

export const uploadPocPickerTarget = (data) => {
  const value = typeof data === "string" ? JSON.parse(data) : data;
  if (
    !isRecord(value) ||
    value.kind !== "folio-upload-poc" ||
    value.version !== 1 ||
    !/^folio_[A-Za-z0-9_]+$/u.test(value.bindingId) ||
    typeof value.tag !== "string"
  ) {
    throw new Error("ข้อมูลปุ่มเลือกไฟล์ไม่ถูกต้อง กรุณาเปิดแบบฟอร์มใหม่");
  }
  return {
    bindingId: value.bindingId,
    rowIndex:
      Number.isSafeInteger(value.rowIndex) && value.rowIndex >= 0
        ? value.rowIndex
        : null,
    tag: value.tag,
  };
};

/** Files stay in the host page's memory; this plugin never uploads or writes workbook data. */
export const initializeUploadPocPicker = (hostWindow, document, plugin) => {
  const input = document.querySelector("#attachment");
  const status = document.querySelector("#status");
  const filename = document.querySelector("#filename");
  const filesize = document.querySelector("#filesize");
  const retry = document.querySelector("#retry");
  let options;
  let target;
  let pending = null;
  let selected = null;
  let sequence = 0;
  const notify = (text, error = false) => {
    status.textContent = text;
    status.dataset.error = String(error);
  };
  const request = (type, file) => {
    if (pending) {
      return;
    }
    sequence += 1;
    const requestId = `picker-${sequence}`;
    input.disabled = true;
    retry.hidden = true;
    const timeout = hostWindow.setTimeout(() => {
      pending = null;
      retry.hidden = false;
      notify("ยังยืนยันไฟล์ในหน้านี้ไม่ได้ กรุณาลองอีกครั้งก่อนปิดหน้าต่าง", true);
    }, 15_000);
    pending = { requestId, timeout, type };
    hostWindow.top.postMessage(
      {
        ...target,
        bridgeId: options.bridgeId,
        documentKey: options.documentKey,
        ...(file ? { file } : {}),
        requestId,
        scopeIdentity: options.scopeIdentity,
        source: "folio-upload-poc",
        type,
      },
      options.parentOrigin
    );
  };
  hostWindow.addEventListener("message", (event) => {
    const message = event.data;
    if (!trustedPendingReply(event, hostWindow, options, pending)) {
      return;
    }
    hostWindow.clearTimeout(pending.timeout);
    const requestType = pending.type;
    pending = null;
    if (message.error || message.allowed === false) {
      if (requestType === "pending-file-set") {
        // A rejected replacement leaves the host's accepted file untouched.
        // Clear only the rejected native input so another file can be chosen.
        selected = null;
        input.value = "";
        input.disabled = false;
        retry.hidden = true;
      } else {
        retry.hidden = false;
      }
      notify(
        String(message.error || "ยังเลือกไฟล์ที่ตำแหน่งนี้ไม่ได้ กรุณาเปิดแบบฟอร์มใหม่"),
        true
      );
      return;
    }
    if (
      message.filename !== null &&
      message.filename !== undefined &&
      typeof message.filename !== "string"
    ) {
      retry.hidden = false;
      notify("อ่านชื่อไฟล์ที่เลือกไม่ได้ กรุณาลองอีกครั้ง", true);
      return;
    }
    filename.textContent = message.filename || "ยังไม่ได้เลือกไฟล์";
    filesize.textContent =
      message.filename &&
      Number.isSafeInteger(message.size) &&
      message.size >= 0
        ? `${message.size} ไบต์`
        : "";
    selected = null;
    input.disabled = false;
    notify(
      message.filename
        ? "เก็บไฟล์ไว้ในหน่วยความจำของหน้านี้แล้ว ยังไม่ได้อัปโหลดหรือบันทึกถาวร"
        : "เลือกไฟล์ได้หนึ่งไฟล์ และเลือกใหม่เพื่อเปลี่ยนไฟล์ได้"
    );
  });
  input.addEventListener("change", () => {
    const [file] = input.files;
    if (!file || pending || !target || !options) {
      return;
    }
    selected = file;
    notify("กำลังเก็บไฟล์ไว้ในหน่วยความจำของหน้านี้…");
    request("pending-file-set", file);
  });
  retry.addEventListener("click", () =>
    request(selected ? "pending-file-set" : "pending-file-get", selected)
  );
  plugin.init = (data) => {
    try {
      options = plugin.info?.options || {};
      if (typeof options === "string") {
        options = JSON.parse(options);
      }
      if (
        !isRecord(options) ||
        typeof options.parentOrigin !== "string" ||
        new URL(options.parentOrigin).origin !== options.parentOrigin ||
        typeof options.bridgeId !== "string" ||
        !options.bridgeId ||
        typeof options.documentKey !== "string" ||
        !options.documentKey ||
        typeof options.scopeIdentity !== "string" ||
        !options.scopeIdentity
      ) {
        throw new Error("ยังเชื่อมต่อหน้ากรอกแบบฟอร์มไม่ได้ กรุณาเปิดแบบฟอร์มใหม่");
      }
      target = uploadPocPickerTarget(data);
      if (target.tag.includes(".") && target.rowIndex === null) {
        throw new Error(
          "ปุ่มตารางนี้ยังไม่มีรหัสแถวสำหรับเลือกไฟล์ กรุณาบันทึกและเปิดแบบฟอร์มใหม่"
        );
      }
      notify("กำลังอ่านไฟล์ที่เลือกไว้ในหน้านี้…");
      request("pending-file-get");
    } catch (error) {
      notify(error.message, true);
    }
  };
  plugin.button = () => {
    if (pending) {
      notify("กรุณารอยืนยันไฟล์ในหน้านี้ก่อนปิดหน้าต่าง", true);
      return;
    }
    plugin.executeCommand("close", "");
  };
};
