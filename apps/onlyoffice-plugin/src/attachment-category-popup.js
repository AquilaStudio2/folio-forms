// oxlint-disable complexity no-nested-ternary -- Keep display-only state and native helper lifecycle together.
export const initializeAttachmentCategoryPopup = (
  host,
  document,
  plugin,
  options
) => {
  const instanceId = host.crypto.randomUUID();
  let connected = false;
  let destroyed = false;
  let requestId = null;
  let state = null;
  const container = document.createElement("main");
  container.hidden = true;
  const heading = document.createElement("h2");
  heading.id = "attachment-category-heading";
  heading.textContent = "เลือกหมวดหมู่จัดเก็บเอกสาร";
  container.setAttribute("aria-labelledby", heading.id);
  const description = document.createElement("p");
  const saved = document.createElement("p");
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = "หมวดหมู่จัดเก็บเอกสาร";
  const select = document.createElement("select");
  label.append(caption, select);
  const templateLabel = document.createElement("label");
  const templateCaption = document.createElement("span");
  templateCaption.textContent = "แม่แบบจัดเก็บเอกสาร";
  const templateSelect = document.createElement("select");
  templateLabel.append(templateCaption, templateSelect);
  const status = document.createElement("p");
  status.id = "attachment-category-status";
  status.setAttribute("role", "status");
  select.setAttribute("aria-describedby", status.id);
  templateSelect.setAttribute("aria-describedby", status.id);
  const actions = document.createElement("div");
  actions.className = "actions";
  const button = (text) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    return element;
  };
  const retry = button("ลองใหม่");
  const cancel = button("ยกเลิก");
  const confirm = button("ยืนยันและบันทึก");
  actions.append(retry, cancel, confirm);
  container.append(
    heading,
    description,
    saved,
    label,
    templateLabel,
    status,
    actions
  );
  document.body.append(container);
  const post = (type, extra = {}) =>
    host.top.postMessage(
      {
        bridgeId: options.bridgeId,
        channelId: options.attachmentCategoryPopupChannelId,
        documentKey: options.documentKey,
        instanceId,
        source: "folio-attachment-category-popup",
        type,
        ...(requestId ? { requestId } : {}),
        ...extra,
      },
      options.parentOrigin
    );
  const hide = () => {
    requestId = null;
    state = null;
    container.hidden = true;
    plugin.executeMethod("UnShowInputHelper", [plugin.info.guid, false]);
  };
  const cancelChoice = () => {
    if (requestId) {
      post("cancel");
      hide();
    }
  };
  const selectedTemplate = () =>
    state?.templates.find(
      (entry) =>
        entry.id === templateSelect.value &&
        String(entry.document_category_id) === select.value
    );
  const updateTemplates = (currentId = "") => {
    templateSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "เลือกแม่แบบจัดเก็บเอกสาร";
    templateSelect.append(placeholder);
    for (const entry of state?.templates ?? []) {
      if (String(entry.document_category_id) !== select.value) {
        continue;
      }
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.template_name;
      templateSelect.append(option);
    }
    templateSelect.value = currentId;
    templateSelect.disabled = select.disabled || !select.value;
    confirm.disabled = !selectedTemplate();
  };
  const update = (message) => {
    const fresh = requestId !== message.requestId;
    const previousStatus = state?.status;
    ({ requestId, state } = message);
    description.textContent = `${state.target} ยืนยันเพื่อบันทึกช่องแนบและต้นแบบ ไฟล์ยังไม่อัปโหลด`;
    saved.textContent = state.currentChoice?.template_name
      ? `แม่แบบเดิม: ${state.currentChoice.template_name}`
      : "ยังไม่ได้เลือกแม่แบบ";
    if (fresh || previousStatus !== state.status || state.status !== "ready") {
      select.replaceChildren();
      for (const entry of [
        { id: "", type: "เลือกหมวดหมู่" },
        ...state.categories,
      ]) {
        const option = document.createElement("option");
        option.value = String(entry.id);
        option.textContent = entry.type;
        select.append(option);
      }
      select.value = state.categories.some(
        (entry) => entry.id === state.currentChoice?.document_category_id
      )
        ? String(state.currentChoice.document_category_id)
        : "";
    }
    select.disabled = state.status !== "ready";
    updateTemplates(state.currentChoice?.storage_template_id);
    retry.hidden = state.status !== "empty" && state.status !== "error";
    status.textContent =
      state.status === "loading"
        ? "กำลังโหลดหมวดหมู่จัดเก็บเอกสาร…"
        : state.status === "error"
          ? `โหลดหมวดหมู่ไม่ได้: ${state.error || "กรุณาลองใหม่"} ข้อมูลเดิมยังคงอยู่`
          : state.status === "empty"
            ? "ไม่พบหมวดหมู่จัดเก็บเอกสาร ยังเพิ่มหรือเปลี่ยนหมวดไม่ได้"
            : "เลือกหมวดแล้วกดยืนยันและบันทึก หรือยกเลิกเพื่อคงข้อมูลเดิม";
    container.hidden = false;
    if (fresh) {
      const opening = requestId;
      plugin.executeMethod(
        "ShowInputHelper",
        [plugin.info.guid, 430, 430, true],
        () => {
          if (!destroyed && requestId === opening) {
            cancel.focus();
            post("shown");
          }
        }
      );
    }
  };
  select.addEventListener("change", () => updateTemplates());
  templateSelect.addEventListener("change", () => {
    confirm.disabled = !selectedTemplate();
  });
  confirm.addEventListener("click", () => {
    const entry = selectedTemplate();
    if (requestId && !confirm.disabled && entry) {
      post("choose", {
        choice: {
          document_category_id: entry.document_category_id,
          storage_template_id: entry.id,
          template_name: entry.template_name,
        },
      });
    }
  });
  retry.addEventListener("click", () => {
    if (requestId && !retry.hidden) {
      post("retry");
    }
  });
  cancel.addEventListener("click", cancelChoice);
  // Hiding Retry can move keyboard focus to BODY outside the popup content.
  const handleKey = (event) => {
    if (!destroyed && requestId && event.key === "Escape") {
      event.preventDefault();
      cancelChoice();
    }
  };
  const handle = (event) => {
    const message = event.data;
    if (
      destroyed ||
      event.source !== host.top ||
      event.origin !== options.parentOrigin ||
      message?.source !== "folio-attachment-category-popup-host" ||
      message.bridgeId !== options.bridgeId ||
      message.channelId !== options.attachmentCategoryPopupChannelId ||
      message.documentKey !== options.documentKey ||
      message.instanceId !== instanceId
    ) {
      return;
    }
    if (message.type === "connected") {
      connected = true;
    } else if (
      connected &&
      message.type === "state" &&
      typeof message.requestId === "string" &&
      message.state &&
      typeof message.state.target === "string" &&
      ["loading", "ready", "empty", "error"].includes(message.state.status) &&
      Array.isArray(message.state.categories) &&
      Array.isArray(message.state.templates) &&
      message.state.categories.every(
        (entry) =>
          Number.isSafeInteger(entry.id) && typeof entry.type === "string"
      ) &&
      message.state.templates.every(
        (entry) =>
          typeof entry.id === "string" &&
          Number.isSafeInteger(entry.document_category_id) &&
          typeof entry.template_name === "string"
      )
    ) {
      update(message);
    } else if (
      connected &&
      message.type === "close" &&
      message.requestId === requestId
    ) {
      hide();
    }
  };
  const destroy = () => {
    if (destroyed) {
      return;
    }
    cancelChoice();
    destroyed = true;
    host.removeEventListener("message", handle);
    host.removeEventListener("keydown", handleKey);
    host.removeEventListener("beforeunload", destroy);
  };
  host.addEventListener("message", handle);
  host.addEventListener("keydown", handleKey);
  host.addEventListener("beforeunload", destroy);
  post("ready");
  return { destroy };
};
