// oxlint-disable no-use-before-define complexity -- One chooser owns scoped messages, request generations and settlement cleanup.
export const chooseAttachmentCategory = ({
  options,
  loadCategories,
  currentCategory,
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
        currentCategory: currentCategory || null,
        error: categoryError,
        status,
        target,
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
    status = "loading";
    categoryError = null;
    send();
    try {
      const result = await loadCategories();
      if (closed || generation !== current) {
        return;
      }
      if (
        !Array.isArray(result) ||
        result.some((name) => typeof name !== "string" || !name.trim())
      ) {
        throw new Error("รายการหมวดหมู่ไม่ถูกต้อง");
      }
      categories = result;
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
      categories.includes(message.category)
    ) {
      finish(message.category);
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
