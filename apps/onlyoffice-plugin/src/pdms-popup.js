// oxlint-disable no-use-before-define complexity prefer-destructuring -- DOM handlers share the current popup state and are installed before events can run.
/** One opening's background iframe. It never writes cells, requests capabilities or fetches names. */
export const initializePdmsPopup = (host, document, plugin, options) => {
  const instanceId = host.crypto.randomUUID();
  let sequence = 0;
  let connected = false;
  let destroyed = false;
  let state = null;
  let collapsed = false;
  let composing = false;
  let active = 0;
  let start = 0;
  let matches = [];
  const container = document.createElement("main");
  container.setAttribute("aria-label", "เลือกชื่อโครงการ PDMS");
  container.hidden = true;
  const title = document.createElement("p");
  title.className = "target-title";
  const searchLabel = document.createElement("label");
  searchLabel.textContent = "ค้นหาชื่อโครงการ";
  const query = document.createElement("input");
  query.type = "search";
  query.autocomplete = "off";
  query.setAttribute("role", "combobox");
  query.setAttribute("aria-autocomplete", "list");
  query.setAttribute("aria-controls", "pdms-popup-results");
  searchLabel.append(query);
  const count = document.createElement("p");
  count.setAttribute("role", "status");
  count.setAttribute("aria-live", "polite");
  const results = document.createElement("div");
  results.id = "pdms-popup-results";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "ชื่อโครงการที่พบ");
  const button = (text) => {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = text;
    return control;
  };
  const previous = button("แสดงก่อนหน้า 100 โครงการ");
  const next = button("แสดงถัดไป 100 โครงการ");
  const retry = button("ลองโหลดรายการอีกครั้ง");
  const cancel = button("ยกเลิกการค้นหา");
  const reopen = button("เปิดรายการโครงการ");
  container.append(
    title,
    searchLabel,
    count,
    results,
    previous,
    next,
    retry,
    cancel,
    reopen
  );
  document.body.append(container);
  const post = (type, extra = {}) =>
    host.top.postMessage(
      {
        bridgeId: options.bridgeId,
        channelId: options.pdmsPopupChannelId,
        documentKey: options.documentKey,
        instanceId,
        sequence,
        source: "folio-pdms-popup",
        type,
        ...extra,
      },
      options.parentOrigin
    );
  const show = (compact = false) => {
    plugin.executeMethod(
      "ShowInputHelper",
      [plugin.info.guid, compact ? 240 : 430, compact ? 44 : 360, !compact],
      () => {
        if (!compact && !destroyed && !collapsed && state?.target) {
          query.focus();
        }
      }
    );
    if (compact) {
      plugin.executeMethod("FocusEditor", []);
    }
  };
  const hide = () => {
    container.hidden = true;
    searchLabel.hidden = true;
    results.replaceChildren();
    query.setAttribute("aria-expanded", "false");
    plugin.executeMethod("UnShowInputHelper", [plugin.info.guid, false]);
  };
  const choose = (name) => {
    if (
      composing ||
      collapsed ||
      state?.busy ||
      state?.preview ||
      !state?.target ||
      state.catalog?.status !== "ready"
    ) {
      return;
    }
    const { token } = state.target;
    state = { ...state, busy: true };
    render();
    post("choose", { name, token });
  };
  const render = () => {
    if (!state?.target) {
      hide();
      return;
    }
    container.hidden = false;
    for (const element of [
      title,
      searchLabel,
      count,
      results,
      previous,
      next,
      retry,
      cancel,
    ]) {
      element.hidden = collapsed;
    }
    reopen.hidden = !collapsed;
    query.setAttribute("aria-expanded", String(!collapsed));
    if (collapsed) {
      results.replaceChildren();
      return;
    }
    title.textContent = `${state.target.label} (${state.target.key})${state.target.rowLabel ? ` · ${state.target.rowLabel}` : ""}`;
    matches =
      state.catalog?.status === "ready"
        ? state.catalog.names.filter((name) => name.includes(query.value))
        : [];
    active = Math.min(active, Math.max(0, matches.length - 1));
    start = Math.floor(active / 100) * 100;
    const visible = matches.slice(start, start + 100);
    results.replaceChildren(
      ...visible.map((name, offset) => {
        const index = start + offset;
        const choice = button(name);
        choice.id = `pdms-popup-${index}`;
        choice.setAttribute("role", "option");
        choice.setAttribute("aria-selected", String(index === active));
        choice.disabled = Boolean(state.busy || state.preview);
        choice.addEventListener("click", () => choose(name));
        return choice;
      })
    );
    const ready = state.catalog?.status === "ready";
    query.disabled = Boolean(state.busy || !ready);
    previous.hidden = start === 0;
    next.hidden = start + 100 >= matches.length;
    retry.hidden = ready;
    for (const control of [previous, next, retry, cancel]) {
      control.disabled = Boolean(state.busy);
    }
    if (state.busy) {
      count.textContent = "กำลังดำเนินการ";
    } else if (ready) {
      count.textContent = `${matches.length} โครงการ · แสดง ${visible.length ? start + 1 : 0}–${start + visible.length}${state.preview ? " · ตัวอย่างรายการ" : ""}`;
    } else if (state.catalog?.status === "loading") {
      count.textContent = "กำลังโหลดรายการโครงการ";
    } else {
      count.textContent = "โหลดรายการโครงการไม่สำเร็จ ยังบันทึกแบบร่างได้";
    }
    query.setAttribute(
      "aria-activedescendant",
      matches.length ? `pdms-popup-${active}` : ""
    );
  };
  const locate = () => {
    if (destroyed) {
      return;
    }
    sequence += 1;
    state = null;
    collapsed = false;
    composing = false;
    query.value = "";
    active = 0;
    start = 0;
    hide();
    post("ready");
    if (connected) {
      post("locate");
    }
  };
  const cancelSearch = () => {
    if (state?.busy || !state?.target) {
      return;
    }
    // Keep only a reopen affordance beside this same selected cell; no query or choice survives cancellation.
    collapsed = true;
    query.value = "";
    composing = false;
    render();
    show(true);
    post("cancel");
  };
  query.addEventListener("compositionstart", () => {
    composing = true;
  });
  query.addEventListener("compositionend", () => {
    composing = false;
    active = 0;
    render();
  });
  query.addEventListener("input", () => {
    if (!composing) {
      active = 0;
      render();
    }
  });
  query.addEventListener("keydown", (event) => {
    if (composing || event.isComposing || state?.busy) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelSearch();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (matches[active]) {
        choose(matches[active]);
      }
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Home") {
        active = 0;
      } else if (event.key === "End") {
        active = Math.max(0, matches.length - 1);
      } else {
        active = Math.min(
          matches.length - 1,
          Math.max(0, active + (event.key === "ArrowDown" ? 1 : -1))
        );
      }
      render();
      results.children[active - start]?.scrollIntoView({ block: "nearest" });
    }
  });
  previous.addEventListener("click", () => {
    active = Math.max(0, start - 100);
    render();
  });
  next.addEventListener("click", () => {
    active = Math.min(matches.length - 1, start + 100);
    render();
  });
  cancel.addEventListener("click", cancelSearch);
  reopen.addEventListener("click", locate);
  container.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      event.target !== query &&
      !event.isComposing &&
      !composing
    ) {
      event.preventDefault();
      cancelSearch();
    }
  });
  retry.addEventListener("click", () => {
    if (!state?.target || state.busy) {
      return;
    }
    const { token } = state.target;
    state = { ...state, busy: true };
    render();
    post("retry", { token });
  });
  const listener = (event) => {
    const message = event.data;
    if (
      destroyed ||
      event.source !== host.top ||
      event.origin !== options.parentOrigin ||
      message?.source !== "folio-pdms-popup-host" ||
      message.bridgeId !== options.bridgeId ||
      message.channelId !== options.pdmsPopupChannelId ||
      message.documentKey !== options.documentKey ||
      message.instanceId !== instanceId
    ) {
      return;
    }
    if (message.type === "connected") {
      if (!connected) {
        connected = true;
        post("locate");
      }
      return;
    }
    if (message.type === "relocate") {
      locate();
      return;
    }
    if (
      message.type !== "state" ||
      message.sequence !== sequence ||
      !message.state
    ) {
      return;
    }
    // A cancel acknowledgement invalidates the old target; the compact control always re-resolves it.
    if (
      collapsed &&
      message.state.cancelled &&
      !message.state.target &&
      !message.state.busy
    ) {
      return;
    }
    state = message.state;
    render();
    if (state.target && !state.busy) {
      show(collapsed);
    }
  };
  host.addEventListener("message", listener);
  const destroy = () => {
    hide();
    destroyed = true;
    host.removeEventListener("message", listener);
  };
  host.addEventListener("pagehide", destroy);
  host.addEventListener("unload", destroy);
  return { locate };
};
