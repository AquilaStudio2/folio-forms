// oxlint-disable prefer-await-to-callbacks node/callback-return -- Browser boundary doubles dispatch message and timer callbacks synchronously.
import { expect, test } from "bun:test";

import { UploadPocPendingFiles } from "../../web/src/features/onlyoffice/upload-poc-pending.ts";
import { checkUploadPocPending } from "../src/upload-poc-pending.js";
import {
  initializeUploadPocPicker,
  uploadPocPickerTarget,
} from "../src/upload-poc-picker.js";

const options = {
  action: "draft",
  bridgeId: "bridge-1",
  documentKey: "document-1",
  parentOrigin: "https://forms.test",
  scopeIdentity: "response-1",
  spreadsheetBindings: {
    fields: [
      {
        attachment: { category: "หลักฐาน" },
        id: "folio_scalar",
        key: "document",
        type: "text",
      },
    ],
    locations: { folio_body: { firstRow: 6, lastRow: 8 } },
    table: {
      anchor: "folio_body",
      columns: [
        {
          attachment: { category: "หลักฐาน" },
          id: "folio_file",
          key: "file",
          type: "text",
        },
      ],
      id: "folio_body",
      key: "items",
    },
  },
};
const data = {
  bindingId: "folio_file",
  kind: "folio-upload-poc",
  rowIndex: 2,
  tag: "items.file",
  version: 1,
};
const scalar = {
  ...data,
  bindingId: "folio_scalar",
  rowIndex: null,
  tag: "document",
};
const saved = {
  file_link: "https://files.test/original.bin",
  original_name: "original.bin",
  size_bytes: 0,
};

// Only the browser transport, DOM and clock are doubled; every accepted choice uses the real host store.
const harness = ({
  store = new UploadPocPendingFiles(),
  host = options,
} = {}) => {
  const messages = [];
  const candidates = [];
  const listeners = new Set();
  const timers = new Map();
  const replies = new Map();
  let timerId = 0;
  let closes = 0;
  const top = {
    postMessage: (message, origin) =>
      (message.type === "pending-file-candidate" ? candidates : messages).push({
        message,
        origin,
      }),
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
    [
      "attachment",
      "choose",
      "selected-file",
      "selection-hint",
      "status",
      "filename",
      "filesize",
      "retry",
      "selection",
      "saved-file",
      "saved-link",
      "saved-size",
      "remove",
      "removal",
      "cleanup-warning",
    ].map((id) => {
      const callbacks = new Map();
      return [
        id,
        {
          addEventListener: (type, callback) => callbacks.set(type, callback),
          click: () => callbacks.get("click")?.(),
          dataset: {},
          disabled: true,
          files: [],
          hidden: id !== "selection",
          textContent: "",
          trigger: (type) => callbacks.get(type)?.(),
        },
      ];
    })
  );
  const plugin = {
    executeCommand: () => {
      closes += 1;
    },
    info: { options: host },
  };
  const receive = (message, overrides = {}) => {
    for (const callback of listeners) {
      callback({
        data: message,
        origin: host.parentOrigin,
        source: top,
        ...overrides,
      });
    }
  };
  const process = () => {
    const { message } = messages.at(-1);
    if (!replies.has(message.requestId)) {
      let result;
      try {
        result = store.handle(message, host);
      } catch (error) {
        result = { error: error.message };
      }
      replies.set(message.requestId, {
        ...result,
        bridgeId: host.bridgeId,
        documentKey: host.documentKey,
        requestId: message.requestId,
        source: "folio-upload-poc-host",
        type: "pending-file-result",
      });
    }
    return replies.get(message.requestId);
  };
  const ack = (extra = {}, overrides = {}) =>
    receive({ ...process(), ...extra }, overrides);
  const choose = (file) => {
    elements.get("attachment").files = file ? [file] : [];
    elements.get("attachment").trigger("change");
  };
  const expire = () => {
    for (const [id, callback] of timers) {
      timers.delete(id);
      callback();
    }
  };
  initializeUploadPocPicker(
    hostWindow,
    { querySelector: (selector) => elements.get(selector.slice(1)) },
    plugin
  );
  return {
    ack,
    candidates,
    choose,
    closed: () => closes,
    elements,
    expire,
    hostWindow,
    listeners,
    messages,
    plugin,
    process,
    receive,
    store,
  };
};
const open = (configuration, target = data) => {
  const h = harness(configuration);
  h.plugin.init(JSON.stringify(target));
  h.ack();
  return h;
};
const savedHost = () => ({ ...options, savedData: { document: { ...saved } } });

test("candidate navigation warning clears on Cancel without clearing confirmed baseline", () => {
  const store = new UploadPocPendingFiles();
  store.handle(
    {
      ...scalar,
      ...options,
      file: new File(["old"], "confirmed.txt"),
      requestId: "confirmed-baseline",
      source: "folio-upload-poc",
      type: "pending-file-set",
    },
    options
  );
  const h = open({ store }, scalar);
  h.choose(new File(["new"], "candidate.txt"));
  expect(h.candidates.at(-1).message.dirty).toBe(true);
  expect([...store.snapshot().values()][0].name).toBe("confirmed.txt");
  h.plugin.button(1);
  expect(h.candidates.at(-1).message.dirty).toBe(false);
  expect([...store.snapshot().values()][0].name).toBe("confirmed.txt");
});

test("picker validates OLE metadata and refuses ambiguous legacy table row", () => {
  expect(() => uploadPocPickerTarget("{} ")).toThrow();
  const h = harness();
  h.plugin.init(JSON.stringify({ ...data, rowIndex: undefined }));
  expect(h.messages).toHaveLength(0);
  expect(h.elements.get("attachment").disabled).toBe(true);
});

test.each([1, -1, undefined])(
  "choose then Cancel/X (%s) leaves original and host pending state untouched",
  (button) => {
    const host = savedHost();
    const h = open({ host }, scalar);
    h.choose(new File(["private"], "private.txt"));
    expect(h.messages).toHaveLength(1);
    expect(h.store.snapshot().size).toBe(0);
    h.plugin.button(button);
    expect(h.closed()).toBe(1);
    expect(h.messages).toHaveLength(1);
    expect(h.store.hasPending()).toBe(false);
    expect(host.savedData.document).toEqual(saved);
  }
);

test("initial lookup can be canceled without waiting for its reply", () => {
  const h = harness();
  h.plugin.init(JSON.stringify(data));
  h.plugin.button();
  expect(h.closed()).toBe(1);
  expect(h.store.hasPending()).toBe(false);
  expect(h.messages.map(({ message }) => message.type)).toEqual([
    "pending-file-get",
  ]);
});

test.each([data, scalar])(
  "A then B selects B locally; Save confirms only after trusted host acknowledgement: $tag",
  async (target) => {
    const h = open(undefined, target);
    const first = new File(["first"], "A.txt");
    const replacement = new File(["replacement"], "B.txt");
    h.choose(first);
    h.choose(replacement);
    h.choose(null);
    expect(h.elements.get("filename").textContent).toBe("B.txt");
    expect(h.messages).toHaveLength(1);
    expect(h.store.snapshot().size).toBe(0);
    h.plugin.button(0);
    expect(h.closed()).toBe(0);
    expect(h.messages.at(-1).message).toMatchObject({
      file: replacement,
      rowIndex: target.rowIndex,
      type: "pending-file-set",
    });
    expect(await h.messages.at(-1).message.file.text()).toBe("replacement");
    expect([...h.store.snapshot().values()]).toEqual([]);
    h.process();
    expect([...h.store.snapshot().values()]).toEqual([replacement]);
    expect(h.closed()).toBe(0);
    h.ack();
    expect(h.closed()).toBe(1);
  }
);

test("reopening and canceling a replacement preserves the previously confirmed pending File", () => {
  const first = open();
  const accepted = new File(["accepted"], "accepted.txt");
  first.choose(accepted);
  first.plugin.button(0);
  first.ack();
  const next = open({ store: first.store });
  expect(next.elements.get("filename").textContent).toBe(accepted.name);
  next.choose(new File(["discarded"], "discarded.txt"));
  next.plugin.button(1);
  expect([...first.store.snapshot().values()]).toEqual([accepted]);
  expect(next.messages).toHaveLength(1);
});

test("contextual action discards a local candidate and restores the opening pending selection", () => {
  const first = open();
  const accepted = new File(["accepted"], "accepted.txt");
  first.choose(accepted);
  first.plugin.button(0);
  first.ack();
  const next = open({ store: first.store });
  next.choose(new File(["discarded"], "discarded.txt"));
  next.elements.get("remove").trigger("click");
  expect(next.elements.get("filename").textContent).toBe(accepted.name);
  next.plugin.button(0);
  expect(next.closed()).toBe(1);
  expect(next.messages).toHaveLength(1);
  expect([...next.store.snapshot().values()]).toEqual([accepted]);
});

test("canonical removal and undo are staged until Save, while originals remain available", () => {
  const host = savedHost();
  const h = open({ host }, scalar);
  expect(h.elements.get("saved-link").href).toBe(saved.file_link);
  expect(h.elements.get("saved-link").textContent).toBe("original.bin");
  h.elements.get("remove").trigger("click");
  expect(h.messages).toHaveLength(1);
  expect(h.store.hasPending()).toBe(false);
  h.plugin.button(0);
  expect(h.closed()).toBe(0);
  h.ack();
  expect(h.store.hasPending()).toBe(true);
  expect(h.store.snapshot().size).toBe(0);
  expect(host.savedData.document).toEqual(saved);
  const canceledUndo = open({ host, store: h.store }, scalar);
  expect(canceledUndo.elements.get("removal").hidden).toBe(false);
  canceledUndo.elements.get("remove").trigger("click");
  canceledUndo.plugin.button(1);
  expect(h.store.hasPending()).toBe(true);
  const undo = open({ host, store: h.store }, scalar);
  undo.elements.get("remove").trigger("click");
  expect(undo.messages).toHaveLength(1);
  expect(h.store.hasPending()).toBe(true);
  undo.plugin.button(0);
  undo.ack();
  expect(undo.closed()).toBe(1);
  expect(h.store.hasPending()).toBe(false);
  expect(host.savedData.document).toEqual(saved);
});

test("undoing a previously confirmed pending File needs Save and restores the canonical original", () => {
  const host = savedHost();
  const first = open({ host }, scalar);
  const accepted = new File(["accepted"], "accepted.txt");
  first.choose(accepted);
  first.plugin.button(0);
  first.ack();
  const undo = open({ host, store: first.store }, scalar);
  undo.elements.get("remove").trigger("click");
  expect([...undo.store.snapshot().values()]).toEqual([accepted]);
  expect(undo.messages).toHaveLength(1);
  undo.plugin.button(0);
  undo.ack();
  expect(undo.store.hasPending()).toBe(false);
  expect(host.savedData.document).toEqual(saved);
});

test.each([2, 10_000_000])(
  "a %s-byte File is confirmed without uploading",
  (size) => {
    const h = open();
    const file = new File([new Uint8Array(size)], "boundary.txt");
    h.choose(file);
    expect(h.messages).toHaveLength(1);
    h.plugin.button(0);
    h.ack();
    expect(h.closed()).toBe(1);
    expect([...h.store.snapshot().values()]).toEqual([file]);
    expect(h.messages.map(({ message }) => message.type)).toEqual([
      "pending-file-get",
      "pending-file-set",
    ]);
  }
);

test.each([data, scalar])(
  "invalid sizes report the slot without poisoning the prior choice: $tag",
  (target) => {
    const first = open(undefined, target);
    const accepted = new File(["accepted"], "accepted.txt");
    first.choose(accepted);
    first.plugin.button(0);
    first.ack();
    const next = open({ store: first.store }, target);
    const valid = new File(["valid"], "valid.txt");
    next.choose(valid);
    for (const size of [0, 1, 10_000_001]) {
      next.choose(new File([new Uint8Array(size)], `invalid-${size}.txt`));
      const status = next.elements.get("status");
      expect(status.hidden).toBe(false);
      expect(status.dataset.error).toBe("true");
      expect(status.textContent).toBe(
        `ช่อง ${target.tag}${target.rowIndex === null ? "" : ` / แถว ${target.rowIndex + 1}`}: รองรับการอัปโหลดไฟล์ที่มีขนาดมากกว่า 1 bytes และไม่เกิน 10 MB`
      );
      expect(next.elements.get("filename").textContent).toBe(valid.name);
    }
    expect(next.messages).toHaveLength(1);
    expect([...next.store.snapshot().values()]).toEqual([accepted]);
    expect(next.candidates).toHaveLength(1);
    next.plugin.button(0);
    next.ack();
    expect([...next.store.snapshot().values()]).toEqual([valid]);
  }
);

test("unsupported names leave both the uppercase candidate and confirmed File intact", () => {
  const first = open();
  const confirmed = new File(["confirmed"], "confirmed.txt");
  first.choose(confirmed);
  first.plugin.button(0);
  first.ack();

  const next = open({ store: first.store });
  const candidate = new File(["candidate"], "candidate.PDF");
  next.choose(candidate);
  for (const name of ["report.pdf.zip", ".pdf", "report", "report.pdf "]) {
    next.choose(new File(["invalid"], name, { type: "application/pdf" }));
    const status = next.elements.get("status");
    expect(status.hidden).toBe(false);
    expect(status.dataset.error).toBe("true");
    expect(status.textContent).toBe(
      "ช่อง items.file / แถว 3: รองรับเฉพาะไฟล์ PDF, DOCX, XLSX, PNG และ TXT"
    );
    expect(next.elements.get("filename").textContent).toBe("candidate.PDF");
    expect([...first.store.snapshot().values()]).toEqual([confirmed]);
  }
  expect(next.messages).toHaveLength(1);
  expect(next.candidates).toHaveLength(1);
  next.plugin.button(0);
  next.ack();
  expect([...first.store.snapshot().values()]).toEqual([candidate]);
});

test("forged, stale and malformed replies cannot confirm Save or close the picker", () => {
  const h = open();
  const file = new File(["proof"], "proof.txt");
  h.choose(file);
  h.plugin.button(0);
  const reply = h.process();
  for (const [change, event] of [
    [{}, { origin: "https://other.test" }],
    [{}, { source: {} }],
    [{ documentKey: "old-document" }, {}],
    [{ bridgeId: "old-bridge" }, {}],
    [{ requestId: "stale" }, {}],
    [{ source: "forged-host" }, {}],
    [{ type: "other-result" }, {}],
    [{ filename: 42 }, {}],
    [{ size: -1 }, {}],
    [{ error: { forged: true } }, {}],
  ]) {
    h.receive({ ...reply, ...change }, event);
    expect(h.closed()).toBe(0);
  }
  h.receive(null);
  expect(h.closed()).toBe(0);
  h.receive(reply);
  expect(h.closed()).toBe(1);
  expect([...h.store.snapshot().values()]).toEqual([file]);
});

test("Save pending or timed out cannot be reported canceled; retry keeps the same choice", () => {
  const h = open();
  const file = new File(["proof"], "proof.txt");
  h.choose(file);
  h.plugin.button(0);
  // Host may accept before its acknowledgement reaches the dialog.
  h.process();
  for (const button of [1, -1, undefined]) {
    h.plugin.button(button);
  }
  expect(h.closed()).toBe(0);
  expect(h.elements.get("status").dataset.error).toBe("false");
  expect(h.elements.get("retry").hidden).toBe(true);
  h.expire();
  for (const button of [1, -1, undefined]) {
    h.plugin.button(button);
  }
  expect(h.closed()).toBe(0);
  expect(h.elements.get("retry").hidden).toBe(false);
  expect([...h.store.snapshot().values()]).toEqual([file]);
  h.elements.get("retry").trigger("click");
  expect(h.messages.at(-1).message).toMatchObject({
    file,
    type: "pending-file-set",
  });
  h.ack();
  expect(h.closed()).toBe(1);
  expect([...h.store.snapshot().values()]).toEqual([file]);
});

test("a malformed reply cannot suppress the Save timeout or its retry", () => {
  const h = open();
  const file = new File(["proof"], "proof.txt");
  h.choose(file);
  h.plugin.button(0);
  const reply = h.process();
  h.receive({ ...reply, size: -1 });
  h.expire();
  expect(h.closed()).toBe(0);
  expect(h.elements.get("retry").hidden).toBe(false);
  h.elements.get("retry").trigger("click");
  h.ack();
  expect(h.closed()).toBe(1);
  expect([...h.store.snapshot().values()]).toEqual([file]);
});

test("late trusted success after timeout closes safely without another mutation", () => {
  const h = open();
  const file = new File(["proof"], "proof.txt");
  h.choose(file);
  h.plugin.button(0);
  const reply = h.process();
  h.expire();
  h.receive(reply);
  expect(h.closed()).toBe(1);
  expect(h.messages).toHaveLength(2);
  expect([...h.store.snapshot().values()]).toEqual([file]);
});

test.each(["mutationNotice", "commitNotice"])(
  "%s and cleanup disclosure survive a local replacement",
  (key) => {
    const notice = "ไฟล์อาจส่งแล้ว ยังยืนยันผลรอบเดิมไม่ได้ ห้ามส่งไฟล์ซ้ำ";
    const warning = "ข้อมูลใหม่บันทึกแล้ว แต่ URL เก่าอาจยังเปิดได้";
    const host = {
      ...savedHost(),
      cleanupWarning: warning,
      ...(key === "mutationNotice" ? { mutationNotice: notice } : {}),
    };
    const h = harness({ host });
    h.plugin.init(JSON.stringify(scalar));
    // Commit recovery is a host reply boundary; no operation is admitted or uploaded in this picker test.
    h.ack({ [key]: notice });
    h.choose(new File(["candidate"], "candidate.txt"));
    expect(h.elements.get("status").textContent).toContain(notice);
    expect(h.elements.get("status").textContent).not.toContain("ยังไม่ได้อัปโหลด");
    expect(h.elements.get("cleanup-warning").textContent).toContain(warning);
    expect(h.elements.get("saved-link").href).toBe(saved.file_link);
    expect(h.elements.get("selection-hint").hidden).toBe(true);
    expect(h.store.hasPending()).toBe(false);
    h.plugin.button(0);
    h.plugin.button(1);
    expect(h.elements.get("status").textContent).toContain(notice);
    h.expire();
    expect(h.elements.get("status").textContent).toContain(notice);
    expect(h.elements.get("cleanup-warning").textContent).toContain(warning);
  }
);

// oxlint-disable-next-line no-script-url -- Executable URLs are intentional hostile input for the link boundary.
test.each(["javascript:alert(1)", "https://user:password@files.test/original"])(
  "saved attachment never exposes unsafe URL %s",
  (file_link) => {
    const h = open(
      {
        host: { ...options, savedData: { document: { ...saved, file_link } } },
      },
      scalar
    );
    expect(h.elements.get("saved-file").hidden).toBe(true);
  }
);

test.each([
  { rowIndex: 3 },
  { bindingId: "folio_unknown" },
  { tag: "items.other" },
])(
  "host refuses mismatched picker target %j without modifying other slots",
  (change) => {
    const h = harness();
    h.plugin.init(JSON.stringify({ ...data, ...change }));
    h.ack();
    h.choose(new File(["proof"], "proof.txt"));
    h.plugin.button(0);
    if (h.messages.length > 1) {
      h.ack();
    }
    expect(h.store.snapshot().size).toBe(0);
    expect(h.store.hasPending()).toBe(false);
  }
);

test("legacy unavailable attachment never accepts a candidate", () => {
  const host = {
    ...options,
    spreadsheetBindings: {
      ...options.spreadsheetBindings,
      fields: [{ id: "folio_scalar", key: "document", type: "text" }],
    },
  };
  const h = open({ host }, scalar);
  expect(h.elements.get("attachment").disabled).toBe(true);
  h.choose(new File(["private"], "private.txt"));
  h.elements.get("retry").trigger("click");
  expect(h.messages).toHaveLength(1);
  expect(h.store.hasPending()).toBe(false);
  h.plugin.button();
  expect(h.closed()).toBe(1);
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
  h.ack();
  await append;
  expect(h.listeners.size).toBe(before);
});

test("pending guard ignores forged acknowledgements and fails closed on timeout", async () => {
  const h = harness();
  const before = h.listeners.size;
  const check = checkUploadPocPending(h.hostWindow, options, "submit");
  h.ack({ allowed: true }, { origin: "https://other.test" });
  h.ack({ allowed: true, documentKey: "old-document" });
  expect(h.listeners.size).toBe(before + 1);
  h.expire();
  await expect(check).rejects.toThrow("ยังตรวจสอบไฟล์");
  expect(h.listeners.size).toBe(before);
});
