import { ACTIONS } from "./constants.js";

/** Search lives in the plugin; only a committed choice enters the existing native-save action. */
export const createPdmsProjectPicker = (
  options,
  bindings,
  panel,
  operations,
  setStatus
) => {
  const columns = (bindings?.table?.columns || []).filter(
    (field) => field.source === "pdms-project-name"
  );
  const fields = [...(bindings?.fields || []), ...columns].filter(
    (field) => field.source === "pdms-project-name"
  );
  if (!fields.length) {
    return null;
  }
  const preview = options.action === ACTIONS.TEMPLATE_EDIT;
  let catalog = options.pdmsProjectCatalog;
  const section = document.createElement("section");
  section.className = "pdms-project-picker";
  section.setAttribute("aria-label", "เลือกชื่อโครงการ PDMS");
  const labelled = (caption, control) => {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = caption;
    label.className = "field-label";
    label.append(text, control);
    section.append(label);
    return control;
  };
  const target = labelled("ช่องโครงการ", document.createElement("select"));
  for (const field of fields) {
    const option = document.createElement("option");
    option.value = field.id;
    option.textContent = `${columns.includes(field) ? `${bindings.table.label} · ` : ""}${field.label} (${field.key})`;
    target.append(option);
  }
  target.value = fields[0].id;
  const row = labelled("แถวโครงการ", document.createElement("select"));
  const body = bindings?.locations?.[bindings.table?.anchor];
  if (body) {
    for (let index = 0; index <= body.lastRow - body.firstRow; index += 1) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `รายการ ${index + 1} · แถว ${body.firstRow + index + 1}`;
      row.append(option);
    }
    row.value = "0";
  }
  const isColumn = () => columns.some((field) => field.id === target.value);
  const updateRow = () => {
    row.parentNode.hidden = !isColumn();
  };
  target.addEventListener("change", updateRow);
  updateRow();
  const query = labelled("ค้นหาชื่อโครงการ", document.createElement("input"));
  query.type = "search";
  query.autocomplete = "off";
  query.setAttribute("role", "combobox");
  query.setAttribute("aria-autocomplete", "list");
  query.setAttribute("aria-expanded", "true");
  query.setAttribute("aria-controls", "pdms-project-results");
  const count = document.createElement("p");
  count.setAttribute("role", "status");
  const results = document.createElement("div");
  results.id = "pdms-project-results";
  results.className = "pdms-project-results";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "ชื่อโครงการที่พบ");
  const more = document.createElement("button");
  more.type = "button";
  more.textContent = "แสดงเพิ่ม 100 โครงการ";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "ยกเลิกการค้นหา";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "ลองโหลดรายการอีกครั้ง";
  section.append(count, results, more, cancel, retry);
  panel.append(section);
  let shown = 100;
  let active = 0;
  let composing = false;
  let busy = false;
  let retrying = false;
  const setBusy = (value) => {
    busy = value;
    retry.disabled = value || retrying;
    for (const control of [
      target,
      row,
      query,
      more,
      cancel,
      ...results.children,
    ]) {
      control.disabled =
        value ||
        retrying ||
        catalog?.status !== "ready" ||
        (preview && control.parentNode === results);
    }
  };
  const choose = async (name) => {
    if (busy || preview || catalog?.status !== "ready") {
      return;
    }
    if (isColumn() && (!body || !row.children.length)) {
      throw new Error("ไม่พบแถวโครงการ กรุณาเปิดตัวแก้ไขใหม่");
    }
    setBusy(true);
    const outcome = await operations.runAction(ACTIONS.SAVE_DRAFT, "", null, {
      pdmsSelection: {
        bindingId: target.value,
        name,
        sessionId: catalog.sessionId,
        ...(isColumn()
          ? {
              row: {
                documentKey: options.documentKey,
                index: Number(row.value),
              },
            }
          : {}),
      },
    });
    if (!outcome.ok) {
      setBusy(false);
    }
  };
  const render = () => {
    const names = catalog?.status === "ready" ? catalog.names : [];
    const matches = names.filter((name) => name.includes(query.value));
    const visible = matches.slice(0, shown);
    active = Math.min(active, Math.max(0, visible.length - 1));
    results.replaceChildren(
      ...visible.map((name, index) => {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.id = `pdms-project-${index}`;
        choice.textContent = name;
        choice.setAttribute("role", "option");
        choice.setAttribute("aria-selected", String(index === active));
        choice.addEventListener("click", async () => {
          try {
            await choose(name);
          } catch (error) {
            setBusy(false);
            setStatus(error.message, "error");
          }
        });
        return choice;
      })
    );
    retry.hidden = catalog?.status === "ready";
    if (retrying || catalog?.status === "loading") {
      count.textContent = "กำลังโหลดรายการโครงการ";
    } else if (catalog?.status === "ready") {
      count.textContent = `${matches.length} โครงการ · แสดง ${visible.length}${preview ? " · ตัวอย่างรายการ" : ""}`;
    } else {
      count.textContent = "โหลดรายการโครงการไม่สำเร็จ ยังบันทึกแบบร่างได้";
    }
    more.hidden = visible.length >= matches.length;
    query.setAttribute(
      "aria-activedescendant",
      visible.length ? `pdms-project-${active}` : ""
    );
    setBusy(busy);
  };
  query.addEventListener("compositionstart", () => {
    composing = true;
  });
  query.addEventListener("compositionend", () => {
    composing = false;
    shown = 100;
    active = 0;
    render();
  });
  query.addEventListener("input", () => {
    if (!composing) {
      shown = 100;
      active = 0;
      render();
    }
  });
  const cancelSearch = () => {
    query.value = "";
    shown = 100;
    active = 0;
    render();
    query.focus();
  };
  query.addEventListener("keydown", (event) => {
    if (composing || event.isComposing || busy) {
      return;
    }
    if (event.key === "Escape") {
      cancelSearch();
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      active = Math.max(
        0,
        Math.min(
          results.children.length - 1,
          active + (event.key === "ArrowDown" ? 1 : -1)
        )
      );
      render();
      results.children[active]?.scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter") {
      event.preventDefault();
      results.children[active]?.click();
    }
  });
  more.addEventListener("click", () => {
    shown += 100;
    render();
  });
  cancel.addEventListener("click", cancelSearch);
  retry.addEventListener("click", async () => {
    if (busy || retrying || catalog?.status === "ready") {
      return;
    }
    retrying = true;
    render();
    try {
      catalog = await operations.retryPdmsCatalog();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      retrying = false;
      render();
    }
  });
  render();
  return {
    setBusy,
    updateCatalog(value) {
      catalog = value;
      render();
    },
  };
};
