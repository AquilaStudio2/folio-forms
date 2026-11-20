// oxlint-disable no-use-before-define complexity -- One chooser owns scoped messages, request generations and settlement cleanup.
export const chooseAttachmentCategory = ({
  options,
  loadCategories,
  currentChoice,
  target,
}) => {
  if (!options?.attachmentCategoryPopupChannelId) {
    return Promise.reject(new Error("เปิดหน้าต่างเลือกหมวดไม่ได้ กรุณาเปิดตัวแก้ไขใหม่"));
  }
  const { promise, resolve, reject } = Promise.withResolvers();
  const requestId = window.crypto.randomUUID();
  let closed = false;
  let generation = 0;
  let categories = [];
  let templates = [];
  let status = "loading";
  let categoryError = null;
  let shown = false;
  const post = (type, extra = {}) =>
    window.top.postMessage(
      {
        bridgeId: options.bridgeId,
        channelId: options.attachmentCategoryPopupChannelId,
        documentKey: options.documentKey,
        requestId,
        source: "form-bridge",
        type,
        ...extra,
      },
      options.parentOrigin
    );
  const send = () =>
    post("attachment-category-popup-state", {
      state: {
        categories,
        currentChoice: currentChoice || null,
        error: categoryError,
        status,
        target,
        templates,
      },
    });
  const finish = (value, failure) => {
    if (closed) {
      return;
    }
    closed = true;
    generation += 1;
    window.clearTimeout(timer);
    window.removeEventListener("message", handle);
    window.removeEventListener("beforeunload", unload);
    post("attachment-category-popup-close");
    if (failure) {
      reject(failure);
    } else {
      resolve(value);
    }
  };
  const load = async () => {
    generation += 1;
    const current = generation;
    categories = [];
    templates = [];
    status = "loading";
    categoryError = null;
    send();
    try {
      const result = await loadCategories();
      if (closed || generation !== current) {
        return;
      }
      if (
        !Array.isArray(result?.categories) ||
        !Array.isArray(result?.templates) ||
        result.categories.some(
          (entry) =>
            !Number.isSafeInteger(entry.id) || typeof entry.type !== "string"
        ) ||
        result.templates.some(
          (entry) =>
            typeof entry.id !== "string" ||
            !Number.isSafeInteger(entry.document_category_id) ||
            typeof entry.template_name !== "string"
        )
      ) {
        throw new Error("รายการหมวดหมู่ไม่ถูกต้อง");
      }
      categories = result.categories.filter((category) =>
        result.templates.some(
          (entry) => entry.document_category_id === category.id
        )
      );
      templates = result.templates.filter((entry) =>
        categories.some(
          (category) => category.id === entry.document_category_id
        )
      );
      status = categories.length ? "ready" : "empty";
    } catch (error) {
      if (closed || generation !== current) {
        return;
      }
      status = "error";
      categoryError = error?.message || "กรุณาลองใหม่";
    }
    send();
  };
  const handle = (event) => {
    const message = event.data;
    if (
      closed ||
      event.source !== window.top ||
      event.origin !== options.parentOrigin ||
      message?.source !== "folio-attachment-category-popup-host" ||
      message.bridgeId !== options.bridgeId ||
      message.channelId !== options.attachmentCategoryPopupChannelId ||
      message.documentKey !== options.documentKey ||
      message.requestId !== requestId
    ) {
      return;
    }
    if (message.type === "shown") {
      shown = true;
      window.clearTimeout(timer);
    } else if (message.type === "cancel") {
      finish(null);
    } else if (message.type === "retry") {
      void load();
    } else if (
      message.type === "choose" &&
      shown &&
      status === "ready" &&
      categories.some(
        (entry) => entry.id === message.choice?.document_category_id
      ) &&
      templates.some(
        (entry) =>
          entry.id === message.choice?.storage_template_id &&
          entry.document_category_id === message.choice.document_category_id &&
          entry.template_name === message.choice.template_name
      )
    ) {
      finish({ category: null, mode: "template", ...message.choice });
    }
  };
  const unload = () => finish(null);
  const timer = window.setTimeout(
    () => finish(null, new Error("เปิดหน้าต่างเลือกหมวดไม่ได้ กรุณาเปิดตัวแก้ไขใหม่")),
    5000
  );
  window.addEventListener("message", handle);
  window.addEventListener("beforeunload", unload);
  void load();
  return promise;
};
