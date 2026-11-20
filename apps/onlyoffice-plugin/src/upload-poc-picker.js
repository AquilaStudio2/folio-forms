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

const validSelectionReply = (message, type, file) => {
  if (message.filename !== null && typeof message.filename !== "string") {
    return false;
  }
  if (
    message.size !== null &&
    (!Number.isSafeInteger(message.size) || message.size < 0)
  ) {
    return false;
  }
  if (typeof message.removal !== "boolean") {
    return false;
  }
  switch (type) {
    case "pending-file-set": {
      return (
        message.filename === file?.name &&
        message.size === file?.size &&
        !message.removal
      );
    }
    case "pending-file-cancel": {
      return (
        message.filename === null &&
        !message.removal &&
        !message.validationError
      );
    }
    case "pending-file-remove": {
      return message.filename === null && message.removal;
    }
    default: {
      return true;
    }
  }
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
  const choose = document.querySelector("#choose");
  const status = document.querySelector("#status");
  const filename = document.querySelector("#filename");
  const filesize = document.querySelector("#filesize");
  const selectedFile = document.querySelector("#selected-file");
  const selectionHint = document.querySelector("#selection-hint");
  const retry = document.querySelector("#retry");
  const selection = document.querySelector("#selection");
  const savedFile = document.querySelector("#saved-file");
  const savedLink = document.querySelector("#saved-link");
  const savedSize = document.querySelector("#saved-size");
  const remove = document.querySelector("#remove");
  const removal = document.querySelector("#removal");
  const cleanupWarning = document.querySelector("#cleanup-warning");
  let hasSaved = false;
  let options;
  let target;
  let baseline = null;
  let pending = null;
  let selected = null;
  let operation = null;
  let uncertain = false;
  let unavailable = false;
  let sequence = 0;
  const reportCandidate = (dirty) => {
    if (!options || !target) {
      return;
    }
    hostWindow.top.postMessage(
      {
        ...target,
        bridgeId: options.bridgeId,
        dirty,
        documentKey: options.documentKey,
        requestId: "picker-candidate",
        scopeIdentity: options.scopeIdentity,
        source: "folio-upload-poc",
        type: "pending-file-candidate",
      },
      options.parentOrigin
    );
  };
  const notify = (text, error = false) => {
    const warnings = [baseline?.mutationNotice, baseline?.commitNotice]
      .filter(Boolean)
      .join("\n");
    const validationError = !operation && baseline?.validationError;
    status.textContent = [warnings, text || validationError]
      .filter(Boolean)
      .join("\n");
    status.dataset.error = String(
      error || Boolean(warnings) || Boolean(validationError)
    );
    status.hidden = !status.textContent;
    selectionHint.hidden = Boolean(warnings);
  };
  const renderRemoveAction = () => {
    selectionHint.textContent = "ยืนยันที่นี่ แล้วบันทึกแบบฟอร์มที่หน้าหลักเพื่ออัปโหลด";
    if (operation) {
      selectionHint.textContent = "เลือกในกล่อง — ยังไม่บันทึก";
    } else if (baseline?.filename || baseline?.removal) {
      selectionHint.textContent = "ยืนยันไฟล์แล้ว — รอบันทึกแบบฟอร์ม";
    }
    const canCancel =
      baseline?.filename || baseline?.removal || baseline?.validationError;
    remove.hidden = !operation && !canCancel && !hasSaved;
    if (operation) {
      remove.textContent = selected ? "ล้างไฟล์ที่เลือก" : "ยกเลิกการเปลี่ยนแปลง";
    } else if (!canCancel) {
      remove.textContent = "นำไฟล์ออก";
    } else if (baseline.removal) {
      remove.textContent = "ยกเลิกนำไฟล์ออก";
    } else {
      remove.textContent = hasSaved ? "คืนไฟล์เดิม" : "ล้างไฟล์ที่เลือก";
    }
  };
  const render = () => {
    const reset = operation === "pending-file-cancel";
    const removing = operation === "pending-file-remove";
    let name = baseline?.filename;
    if (selected) {
      ({ name } = selected);
    } else if (reset || removing) {
      name = null;
    }
    const size = selected ? selected.size : baseline?.size;
    filename.textContent = name || "ยังไม่ได้เลือกไฟล์";
    filesize.textContent =
      name && Number.isSafeInteger(size) && size >= 0 ? `${size} ไบต์` : "";
    selectedFile.hidden = hasSaved && !name;
    removal.hidden = !(removing || (!operation && baseline?.removal === true));
    const locked = Boolean(pending || uncertain || unavailable || !baseline);
    input.disabled = locked;
    choose.disabled = locked;
    remove.disabled = locked;
    renderRemoveAction();
    notify("");
  };
  const request = (type, file) => {
    if (pending || unavailable) {
      return;
    }
    sequence += 1;
    const requestId = `picker-${sequence}`;
    retry.hidden = true;
    const timeout = hostWindow.setTimeout(() => {
      if (!pending || pending.requestId !== requestId) {
        return;
      }
      pending.timedOut = true;
      uncertain ||= type !== "pending-file-get";
      retry.hidden = false;
      render();
      notify("ยังยืนยันผลไม่ได้ กรุณาลองอีกครั้งก่อนปิดหน้าต่าง", true);
    }, 15_000);
    pending = { requestId, timedOut: false, timeout, type };
    render();
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
  const renderSavedAttachment = (message) => {
    const { saved } = message;
    const url =
      isRecord(saved) &&
      typeof saved.file_link === "string" &&
      URL.canParse(saved.file_link)
        ? new URL(saved.file_link)
        : null;
    const valid =
      url &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password;
    hasSaved = Boolean(valid);
    savedFile.hidden = !valid;
    if (valid) {
      savedLink.href = url.href;
      savedLink.textContent =
        typeof saved.original_name === "string"
          ? saved.original_name
          : "เปิดไฟล์ที่บันทึกแล้ว";
      savedSize.textContent = Number.isSafeInteger(saved.size_bytes)
        ? `${saved.size_bytes} ไบต์`
        : "";
    }
    cleanupWarning.hidden =
      typeof message.cleanupWarning !== "string" || !message.cleanupWarning;
    cleanupWarning.textContent =
      typeof message.cleanupWarning === "string" ? message.cleanupWarning : "";
  };
  hostWindow.addEventListener("message", (event) => {
    const message = event.data;
    if (!trustedPendingReply(event, hostWindow, options, pending)) {
      return;
    }
    if (
      (message.error !== undefined && typeof message.error !== "string") ||
      (message.allowed !== undefined && typeof message.allowed !== "boolean") ||
      (message.unavailable !== undefined &&
        typeof message.unavailable !== "boolean")
    ) {
      return;
    }
    if (
      !message.error &&
      message.allowed !== false &&
      message.unavailable !== true &&
      !validSelectionReply(message, pending.type, selected)
    ) {
      return;
    }
    hostWindow.clearTimeout(pending.timeout);
    const requestType = pending.type;
    pending = null;
    if (message.unavailable === true) {
      unavailable = true;
      render();
      retry.hidden = true;
      selection.hidden = true;
      status.className = "notice";
      notify(
        String(
          message.error || "ฟอร์มนี้ไม่รองรับแนบไฟล์ กรุณาประสาน Admin ใช้ Form ใหม่"
        ),
        true
      );
      return;
    }
    if (message.error || message.allowed === false) {
      render();
      retry.hidden = requestType !== "pending-file-get" && !uncertain;
      notify(
        String(message.error || "ยังเลือกไฟล์ที่ตำแหน่งนี้ไม่ได้ กรุณาเปิดแบบฟอร์มใหม่"),
        true
      );
      return;
    }
    if (requestType !== "pending-file-get") {
      reportCandidate(false);
      plugin.executeCommand("close", "");
      return;
    }
    baseline = message;
    renderSavedAttachment(message);
    retry.hidden = true;
    render();
  });
  choose.addEventListener("click", () => {
    if (!choose.disabled) {
      input.click();
    }
  });
  input.addEventListener("change", () => {
    const [file] = input.files;
    input.value = "";
    if (!file || pending || uncertain || unavailable || !baseline) {
      return;
    }
    const slotLabel = `ช่อง ${target.tag}${target.rowIndex === null ? "" : ` / แถว ${target.rowIndex + 1}`}`;
    if (
      !Number.isSafeInteger(file.size) ||
      file.size < 2 ||
      file.size > 10_000_000
    ) {
      notify(
        `${slotLabel}: รองรับการอัปโหลดไฟล์ที่มีขนาดมากกว่า 1 bytes และไม่เกิน 10 MB`,
        true
      );
      return;
    }
    const dot = file.name.lastIndexOf(".");
    if (
      dot <= 0 ||
      !["pdf", "docx", "xlsx", "png", "txt"].includes(
        file.name.slice(dot + 1).toLowerCase()
      )
    ) {
      notify(`${slotLabel}: รองรับเฉพาะไฟล์ PDF, DOCX, XLSX, PNG และ TXT`, true);
      return;
    }
    selected = file;
    operation = "pending-file-set";
    render();
    reportCandidate(true);
  });
  retry.addEventListener("click", () => {
    if (pending && !pending.timedOut) {
      return;
    }
    const type = pending?.type || (uncertain ? operation : "pending-file-get");
    if (pending) {
      hostWindow.clearTimeout(pending.timeout);
      pending = null;
    }
    request(type, selected);
  });
  remove.addEventListener("click", () => {
    if (remove.disabled) {
      return;
    }
    if (operation) {
      operation = null;
      selected = null;
    } else {
      operation =
        baseline.filename || baseline.removal || baseline.validationError
          ? "pending-file-cancel"
          : "pending-file-remove";
    }
    render();
    reportCandidate(Boolean(operation));
  });
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
      if (options.action === "correction") {
        selectionHint.textContent =
          "ยืนยันไฟล์ที่นี่ แล้วบันทึก Correction ที่หน้าหลักเพื่ออัปโหลด ไฟล์ที่ยังไม่บันทึกจะหายเมื่อปิดหน้าเว็บหรือรีเฟรช";
      }
      target = uploadPocPickerTarget(data);
      if (target.tag.includes(".") && target.rowIndex === null) {
        throw new Error(
          "ปุ่มตารางนี้ยังไม่มีรหัสแถวสำหรับเลือกไฟล์ กรุณาบันทึกและเปิดแบบฟอร์มใหม่"
        );
      }
      notify("กำลังอ่านไฟล์…");
      request("pending-file-get");
    } catch (error) {
      notify(error.message, true);
    }
  };
  plugin.button = (index) => {
    if ((pending && pending.type !== "pending-file-get") || uncertain) {
      const waiting = pending && !pending.timedOut;
      notify(
        waiting
          ? "กำลังยืนยันการเลือก กรุณารอสักครู่"
          : "กรุณายืนยันผลด้วยปุ่มลองอีกครั้งก่อนปิดหน้าต่าง",
        !waiting
      );
      return;
    }
    if (index === 0 && operation && !unavailable) {
      request(operation, selected);
      return;
    }
    if (index === 0 && pending) {
      return;
    }
    if (pending) {
      hostWindow.clearTimeout(pending.timeout);
      pending = null;
    }
    reportCandidate(false);
    plugin.executeCommand("close", "");
  };
};
