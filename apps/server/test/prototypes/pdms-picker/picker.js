import { saveDocumentCommand } from "../../../../onlyoffice-plugin/src/document-commands.js";
// oxlint-disable avoid-new no-await-in-loop prefer-destructuring -- ONLYOFFICE callbacks and bounded sequential operation polling.
import { createOffice } from "../../../../onlyoffice-plugin/src/office.js";
/* global Asc, Api */
// Test-only plugin, using supported callCommand/Office API with no protection credential.
const { session } = document.body.dataset;
const office = createOffice({ documentKind: "xlsx" });
const status = document.querySelector("#status");
const query = document.querySelector("#query");
const results = document.querySelector("#results");
let names = [];
let revision = 0;
let shown = 100;
let active = 0;
let composing = false;
const request = async (path, body) => {
  const response = await fetch(`/prototype/${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Prototype-Session": session,
    },
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) {
    throw new Error(value.error || `HTTP ${response.status}`);
  }
  return value;
};
const recordEvent = (value) => request("event", value);
const command = (fn) =>
  new Promise((resolve) => {
    Asc.plugin.callCommand(fn, false, true, resolve);
  });
// oxlint-disable-next-line func-style -- ONLYOFFICE serializes this function into its sandbox.
function readPrototypeValues() {
  const sheet = Api.GetActiveSheet();
  return JSON.stringify({
    merged: sheet.GetRange("A1:B1").GetValue(),
    note: sheet.GetRange("C1").GetValue(),
    rowNote: sheet.GetRange("B4").GetValue(),
    table: sheet.GetRange("A4").GetValue(),
  });
}
const readInputs = async () => JSON.parse(await command(readPrototypeValues));
const read = async () => {
  const value = await readInputs();
  status.textContent = JSON.stringify(value);
  await recordEvent({ kind: "read", value });
};
const freeze = async () => {
  await office.freezeEditor();
  if ((await office.callCommandResult(saveDocumentCommand)) !== true) {
    throw new Error("Native save unavailable; workbook retained");
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error("Native save acknowledgment timed out; workbook retained")
        ),
      45_000
    );
    const nonce = crypto.randomUUID();
    const listener = (event) => {
      if (
        event.origin === location.origin &&
        event.data?.type === "frozen" &&
        event.data.nonce === nonce
      ) {
        window.removeEventListener("message", listener);
        clearTimeout(timeout);
        resolve();
      }
    };
    window.addEventListener("message", listener);
    window.top.postMessage({ nonce, type: "freeze" }, location.origin);
  });
};
const completeSave = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await request("poll");
    if (state.operation?.status === "completed") {
      const saved = await request("result");
      await recordEvent({ kind: "saved-result", saved });
      window.top.postMessage({ type: "reload" }, location.origin);
      return;
    }
    if (state.operation?.status === "failed") {
      throw new Error(JSON.stringify(state));
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  throw new Error(
    "Save timed out; workbook retained. Retry after checking the save result."
  );
};
const choose = async (name) => {
  try {
    await freeze();
    const started = performance.now();
    const selected = await request("select", {
      expected: await readInputs(),
      name,
      revision,
      target: document.querySelector("#target").value,
    });
    revision = selected.revision;
    status.textContent = "กำลังบันทึกและเปิดเอกสารอีกครั้ง";
    await recordEvent({
      elapsedMs: performance.now() - started,
      kind: "selection",
      name,
    });
    await completeSave();
  } catch (error) {
    status.textContent = error.message;
    await office.executeMethodResult("SetEditingRestrictions", ["none"]);
    window.top.postMessage({ type: "unfreeze" }, location.origin);
  }
};
const render = () => {
  const matches = names.filter((name) => name.includes(query.value));
  const visible = matches.slice(0, shown);
  active = Math.min(active, Math.max(0, visible.length - 1));
  results.replaceChildren(
    ...visible.map((name, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = name;
      button.id = `project-${index}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(active === index));
      button.addEventListener("click", () => choose(name));
      return button;
    })
  );
  document.querySelector("#count").textContent =
    `${matches.length} โครงการ · แสดง ${visible.length}`;
  document.querySelector("#more").hidden = visible.length >= matches.length;
  query.setAttribute(
    "aria-activedescendant",
    visible.length ? `project-${active}` : ""
  );
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
query.addEventListener("keydown", (event) => {
  if (composing || event.isComposing) {
    return;
  }
  if (event.key === "Escape") {
    query.value = "";
    active = 0;
    shown = 100;
    render();
    return;
  }
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    const count = results.children.length;
    active = Math.max(
      0,
      Math.min(count - 1, active + (event.key === "ArrowDown" ? 1 : -1))
    );
    render();
    results.children[active]?.scrollIntoView({ block: "nearest" });
  }
  if (event.key === "Enter") {
    event.preventDefault();
    results.children[active]?.click();
  }
});
document.querySelector("#more").addEventListener("click", () => {
  shown += 100;
  render();
});
document.querySelector("#cancel").addEventListener("click", () => {
  query.value = "";
  shown = 100;
  active = 0;
  render();
  query.focus();
});
document.querySelector("#read").addEventListener("click", read);
document.querySelector("#save").addEventListener("click", async () => {
  try {
    await freeze();
    await request("save", await readInputs());
    await completeSave();
  } catch (error) {
    status.textContent = error.message;
    await office.executeMethodResult("SetEditingRestrictions", ["none"]);
    window.top.postMessage({ type: "unfreeze" }, location.origin);
  }
});
Asc.plugin.init = async () => {
  try {
    const started = performance.now();
    const catalog = await request("catalog");
    names = catalog.names;
    revision = catalog.revision;
    render();
    await recordEvent({
      count: names.length,
      elapsedMs: performance.now() - started,
      kind: "catalog",
    });
    Asc.plugin.executeMethod("ActivateWindow", [Asc.plugin.guid]);
  } catch (error) {
    status.textContent = error.message;
  }
};
Asc.plugin.button = () => {
  /* empty */
};

document.querySelector("#row").addEventListener("click", async () => {
  try {
    await freeze();
    await request("row", await readInputs());
    await completeSave();
  } catch (error) {
    status.textContent = error.message;
    await office.executeMethodResult("SetEditingRestrictions", ["none"]);
    window.top.postMessage({ type: "unfreeze" }, location.origin);
  }
});
