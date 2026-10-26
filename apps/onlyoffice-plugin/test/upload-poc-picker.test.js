// oxlint-disable prefer-await-to-callbacks node/callback-return -- Test doubles dispatch browser message and timer callbacks synchronously.
import { expect, test } from "bun:test";

import { checkUploadPocPending } from "../src/upload-poc-pending.js";
import {
  initializeUploadPocPicker,
  uploadPocPickerTarget,
} from "../src/upload-poc-picker.js";

const options = {
  bridgeId: "bridge-1",
  documentKey: "document-1",
  parentOrigin: "https://forms.test",
  scopeIdentity: "response-1",
};
const data = {
  bindingId: "folio_file",
  kind: "folio-upload-poc",
  rowIndex: 2,
  tag: "items.file",
  version: 1,
};

const harness = () => {
  const messages = [];
  const listeners = new Set();
  const timers = new Map();
  let timerId = 0;
  const top = {
    postMessage: (message, origin) => messages.push({ message, origin }),
  };
  const hostWindow = {
    addEventListener: (_type, callback) => listeners.add(callback),
    clearTimeout: (id) => timers.delete(id),
    removeEventListener: (_type, callback) => listeners.delete(callback),
    setTimeout: (callback) => {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    top,
  };
  const elements = new Map(
    ["attachment", "status", "filename", "filesize", "retry"].map((id) => {
      const callbacks = new Map();
      return [
        id,
        {
          addEventListener: (type, callback) => callbacks.set(type, callback),
          dataset: {},
          disabled: true,
          files: [],
          hidden: true,
          textContent: "",
          trigger: (type) => callbacks.get(type)?.(),
        },
      ];
    })
  );
  const plugin = {
    executeCommand: () => messages.push({ close: true }),
    info: { options },
  };
  const receive = (message, overrides = {}) => {
    for (const callback of listeners) {
      callback({
        data: message,
        origin: options.parentOrigin,
        source: top,
        ...overrides,
      });
    }
  };
  const ack = (extra = {}, overrides = {}) => {
    const request = messages.at(-1).message;
    receive(
      {
        bridgeId: options.bridgeId,
        documentKey: options.documentKey,
        filename: null,
        requestId: request.requestId,
        source: "folio-upload-poc-host",
        type: "pending-file-result",
        ...extra,
      },
      overrides
    );
  };
  initializeUploadPocPicker(
    hostWindow,
    { querySelector: (selector) => elements.get(selector.slice(1)) },
    plugin
  );
  return {
    ack,
    elements,
    hostWindow,
    listeners,
    messages,
    plugin,
    receive,
    timers,
  };
};

test("picker validates OLE metadata and refuses ambiguous legacy table row", () => {
  expect(() => uploadPocPickerTarget("{} ")).toThrow("ข้อมูลปุ่ม");
  const h = harness();
  h.plugin.init(JSON.stringify({ ...data, rowIndex: undefined }));
  expect(h.messages).toHaveLength(0);
  expect(h.elements.get("attachment").disabled).toBe(true);
  expect(h.elements.get("status").textContent).toContain("รหัสแถว");
});

test("picker sends a real File through structured clone only, replaces it and preserves cancellation", async () => {
  const h = harness();
  h.plugin.init(JSON.stringify(data));
  expect(h.messages[0].message.type).toBe("pending-file-get");
  h.ack();
  expect(h.elements.get("attachment").disabled).toBe(false);
  const first = new File(["real proof bytes"], "proof.txt", {
    type: "text/plain",
  });
  h.elements.get("attachment").files = [first];
  h.elements.get("attachment").trigger("change");
  expect(h.messages.at(-1).message.file).toBe(first);
  expect(await h.messages.at(-1).message.file.text()).toBe("real proof bytes");
  expect(h.messages.at(-1).message.rowIndex).toBe(2);
  h.ack({ filename: first.name, size: first.size });
  expect(h.elements.get("filename").textContent).toBe("proof.txt");
  expect(h.elements.get("filesize").textContent).toBe(`${first.size} ไบต์`);
  expect(h.elements.get("status").textContent).toContain("ยังไม่ได้อัปโหลด");
  const replacement = new File(["replacement"], "replacement.txt");
  h.elements.get("attachment").files = [replacement];
  h.elements.get("attachment").trigger("change");
  h.ack({ filename: replacement.name, size: replacement.size });
  expect(h.elements.get("filename").textContent).toBe("replacement.txt");
  const count = h.messages.length;
  h.elements.get("attachment").files = [];
  h.elements.get("attachment").trigger("change");
  expect(h.messages).toHaveLength(count);
  expect(h.elements.get("filename").textContent).toBe("replacement.txt");
});

test("picker ignores forged and stale host acknowledgements", () => {
  const h = harness();
  h.plugin.init(JSON.stringify(data));
  h.ack({ filename: "forged.txt" }, { origin: "https://other.test" });
  h.ack({ filename: "forged.txt" }, { source: {} });
  h.ack({ documentKey: "different", filename: "forged.txt" });
  h.ack({ filename: "stale.txt", requestId: "stale" });
  expect(h.elements.get("attachment").disabled).toBe(true);
  h.ack({ filename: "trusted.txt" });
  h.receive({
    bridgeId: options.bridgeId,
    documentKey: options.documentKey,
    source: "folio-upload-poc-host",
    type: "pending-file-result",
  });
  expect(h.elements.get("filename").textContent).toBe("trusted.txt");
});

test("oversized rejection preserves accepted filename and allows a valid replacement", () => {
  const h = harness();
  h.plugin.init(JSON.stringify(data));
  h.ack({ filename: "accepted.txt", size: 8 });
  const oversized = new File(
    [new Uint8Array(10 * 1024 * 1024 + 1)],
    "oversized.bin"
  );
  h.elements.get("attachment").files = [oversized];
  h.elements.get("attachment").trigger("change");
  h.ack({ error: "POC เลือกได้หนึ่งไฟล์ต่อปุ่ม ขนาดไม่เกิน 10 MB" });
  expect(h.elements.get("attachment").disabled).toBe(false);
  expect(h.elements.get("attachment").value).toBe("");
  expect(h.elements.get("filename").textContent).toBe("accepted.txt");
  expect(h.elements.get("filesize").textContent).toBe("8 ไบต์");
  const valid = new File(["valid"], "valid.txt");
  h.elements.get("attachment").files = [valid];
  h.elements.get("attachment").trigger("change");
  expect(h.messages.at(-1).message.file).toBe(valid);
  h.ack({ filename: valid.name, size: valid.size });
  expect(h.elements.get("filename").textContent).toBe("valid.txt");
  expect(h.elements.get("filesize").textContent).toBe("5 ไบต์");
});

test("picker retains pending selection on timeout and retries without network upload", () => {
  const h = harness();
  h.plugin.init(JSON.stringify(data));
  h.ack();
  const file = new File(["pending"], "pending.txt");
  h.elements.get("attachment").files = [file];
  h.elements.get("attachment").trigger("change");
  h.plugin.button();
  expect(h.messages.at(-1).close).toBeUndefined();
  for (const callback of h.timers.values()) {
    callback();
  }
  expect(h.elements.get("retry").hidden).toBe(false);
  h.elements.get("retry").trigger("click");
  expect(h.messages.at(-1).message.file).toBe(file);
  h.ack({ filename: file.name });
  h.plugin.button();
  expect(h.messages.at(-1).close).toBe(true);
});

test("pending guard blocks explicit saves, allows trusted append and removes listeners", async () => {
  const h = harness();
  const before = h.listeners.size;
  const save = checkUploadPocPending(h.hostWindow, options, "save-draft");
  h.ack({ allowed: false, error: "ไฟล์ยังไม่อัปโหลด" });
  await expect(save).rejects.toThrow("ยังไม่อัปโหลด");
  expect(h.listeners.size).toBe(before);
  const append = checkUploadPocPending(h.hostWindow, options, "save-draft", {
    action: "insert",
    index: 3,
  });
  expect(h.messages.at(-1).message.action).toBe("append-row");
  expect(h.messages.at(-1).message.rowIndex).toBe(3);
  h.ack({ allowed: true });
  await expect(append).resolves.toBeUndefined();
  expect(h.listeners.size).toBe(before);
});

test("pending guard ignores forged acknowledgements and fails closed on timeout", async () => {
  const h = harness();
  const before = h.listeners.size;
  const check = checkUploadPocPending(h.hostWindow, options, "submit");
  h.ack({ allowed: true }, { origin: "https://other.test" });
  h.ack({ allowed: true, documentKey: "old-document" });
  expect(h.listeners.size).toBe(before + 1);
  for (const callback of h.timers.values()) {
    callback();
  }
  await expect(check).rejects.toThrow("ยังตรวจสอบไฟล์");
  expect(h.listeners.size).toBe(before);
});
