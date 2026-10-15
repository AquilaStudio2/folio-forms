// oxlint-disable max-classes-per-file accessor-pairs prefer-await-to-callbacks -- Browser file and image shims model asynchronous load callbacks.
import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import {
  readSpreadsheetPictureFile,
  spreadsheetPictureCommand,
  spreadsheetPictureReconcileCommand,
} from "../src/spreadsheet-pictures.js";
import {
  acknowledgeBridge,
  completedOperation,
  createHarness,
  flushPlugin,
} from "./harness.js";

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const control = (harness, caption) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "LABEL" && node.children[0]?.textContent === caption
  )?.children[1];
const click = async (harness, caption) => {
  descendants(harness.body)
    .find((node) => node.tagName === "BUTTON" && node.textContent === caption)
    .dispatchEvent({ type: "click" });
  await flushPlugin();
};

const field = {
  anchor: "photo_anchor",
  computed: false,
  id: "photo_id",
  key: "photo",
  label: "ภาพประกอบ",
  options: [],
  prefillPointer: "/customer/name",
  prefillPolicy: "lock_when_available",
  required: true,
  type: "text",
};

test("changing a scalar to picture saves its identity and clears prefill", async () => {
  const bindings = { fields: [field], table: null, version: 1 };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write"],
    documentKind: "xlsx",
    responses: [
      { bindings, revision: 0 },
      { bindings, revision: 1 },
    ],
    spreadsheetBindings: bindings,
    spreadsheetSelection: {
      address: "B2",
      names: { photo_anchor: "'Sheet1'!$B$2" },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const type = control(harness, "ชนิดข้อมูล");
  expect(
    type.children.find((option) => option.value === "picture").disabled
  ).toBe(false);
  type.value = "picture";
  type.dispatchEvent({ type: "change" });
  await click(harness, "บันทึกการแก้ไข");
  const patch = harness.requests.find((request) => request.method === "PATCH");
  expect(JSON.parse(patch.body).change.value).toMatchObject({
    anchor: field.anchor,
    id: field.id,
    options: [],
    prefillPointer: null,
    prefillPolicy: "editable",
    required: true,
    type: "picture",
  });
});

test("saved table columns cannot select picture type", async () => {
  const harness = createHarness({
    action: "template-edit",
    documentKind: "xlsx",
    spreadsheetBindings: {
      fields: [],
      table: {
        anchor: "rows",
        columns: [{ ...field, id: "column", offset: 0 }],
        id: "table",
        key: "items",
        label: "รายการ",
      },
      version: 1,
    },
    spreadsheetSelection: {
      address: "A5",
      names: { rows: "'Sheet1'!$A$5:$A$7" },
    },
  });
  await flushPlugin();
  const type = control(harness, "ชนิดข้อมูล");
  const picture = type.children.find((option) => option.value === "picture");
  expect(picture.hidden).toBe(true);
  expect(picture.disabled).toBe(true);
  type.value = "picture";
  type.dispatchEvent({ type: "change" });
  expect(type.value).toBe("text");
});

const pictureBrowserGlobals = (width, height) => ({
  FileReader: class {
    listeners = new Map();
    addEventListener(type, callback) {
      this.listeners.set(type, callback);
    }
    readAsDataURL() {
      this.result = "data:image/jpeg;base64,picture";
      this.listeners.get("load")();
    }
  },
  Image: class {
    listeners = new Map();
    addEventListener(type, callback) {
      this.listeners.set(type, callback);
    }
    naturalWidth = width;
    naturalHeight = height;
    set src(_value) {
      this.listeners.get("load")();
    }
  },
});

const pictureFrame = {
  anchor: field.anchor,
  columnOffset: 120_000,
  height: 2_000_000,
  id: field.id,
  rowOffset: 240_000,
  width: 3_000_000,
};

test.each(["fill", "correction"])(
  "%s shows only a labelled file picker and uploads immediately on change",
  async (action) => {
    const harness = createHarness({
      action,
      browserGlobals: pictureBrowserGlobals(1, 1),
      documentKind: "xlsx",
      spreadsheetBindings: {
        fields: [{ ...field, type: "picture" }],
        table: null,
        version: 1,
      },
      spreadsheetPictureFrames: [pictureFrame],
    });
    acknowledgeBridge(harness);
    const panel = descendants(harness.body).find(
      (node) =>
        node.tagName === "SECTION" &&
        node.className.includes("spreadsheet-panel")
    );
    expect(
      descendants(panel).filter((node) => node.tagName === "BUTTON")
    ).toHaveLength(0);
    expect(
      descendants(panel).filter((node) => node.tagName === "P" && !node.hidden)
    ).toHaveLength(0);
    const upload = control(
      harness,
      "ภาพประกอบ (จำเป็น) · JPEG / PNG ไม่เกิน 10 MB"
    );
    expect(upload.type).toBe("file");
    expect(upload.accept).toBe("image/png,image/jpeg");
    upload.files = [{ size: 10, type: "image/svg+xml" }];
    upload.value = "invalid.svg";
    upload.dispatchEvent({ type: "change" });
    await flushPlugin();
    expect(harness.statusElement.textContent).toContain("JPEG หรือ PNG");
    expect(upload.value).toBe("");
    expect(upload.disabled).toBe(false);
    const commands = [];
    harness.window.Asc.plugin.callCommand = (
      command,
      _close,
      recalculate,
      done
    ) => {
      commands.push({
        input: { ...harness.window.Asc.scope.folioSpreadsheetPicture },
        name: command.name,
        recalculate,
      });
      done(true);
    };
    upload.files = [{ size: 10, type: "image/png" }];
    upload.value = "photo.png";
    upload.dispatchEvent({ type: "change" });
    expect(upload.disabled).toBe(true);
    await flushPlugin();
    expect(commands).toEqual([
      {
        input: {
          anchor: field.anchor,
          dataUrl: "data:image/jpeg;base64,picture",
          frame: pictureFrame,
          height: 1,
          id: field.id,
          width: 1,
        },
        name: "spreadsheetPictureCommand",
        recalculate: true,
      },
    ]);
    expect(harness.window.Asc.scope.folioSpreadsheetPicture).toBeUndefined();
    expect(harness.statusElement.textContent).toContain("ใส่รูป ภาพประกอบ แล้ว");
    expect(upload.value).toBe("");
    expect(upload.disabled).toBe(false);
    harness.window.Asc.plugin.callCommand = (
      _command,
      _close,
      _recalculate,
      done
    ) => done(false);
    upload.value = "photo.png";
    upload.dispatchEvent({ type: "change" });
    await flushPlugin();
    expect(harness.statusElement.textContent).toContain(
      "กรุณาเลือกไฟล์เพื่อลองอีกครั้ง"
    );
    expect(upload.value).toBe("");
    expect(upload.disabled).toBe(false);
    expect(harness.window.Asc.scope.folioSpreadsheetPicture).toBeUndefined();
  }
);

const runPicture = (sheet, input = {}) =>
  runInNewContext(`(${spreadsheetPictureCommand.toString()})()`, {
    Api: {
      GetDefName: () => ({
        GetRefersToRange: () => ({
          GetCol: () => 3,
          GetRow: () => 4,
          GetWorksheet: () => sheet,
          Height: 100,
          Width: 200,
        }),
      }),
    },
    Asc: {
      scope: {
        folioSpreadsheetPicture: {
          anchor: field.anchor,
          dataUrl: "data:image/png;base64,picture",
          height: 200,
          id: field.id,
          width: 200,
          ...input,
        },
      },
    },
  });

const runReconcile = (sheet, input = {}) =>
  JSON.parse(
    runInNewContext(`(${spreadsheetPictureReconcileCommand.toString()})()`, {
      Api: {
        GetDefName: () => ({
          GetRefersToRange: () => ({
            GetCol: () => 3,
            GetRow: () => 4,
            GetWorksheet: () => sheet,
          }),
        }),
      },
      Asc: {
        scope: {
          folioSpreadsheetPictureReconcile: {
            dataUrl: "placeholder",
            frames: [pictureFrame],
            observed: {},
            ...input,
          },
        },
      },
    })
  );

const guardedImage = () => {
  const events = [];
  const locks = new Map([
    ["noMove", true],
    ["noResize", false],
    ["noSelect", false],
  ]);
  const dimensions = { height: pictureFrame.height, width: pictureFrame.width };
  let name = `folio_picture_${field.id}`;
  const origin = {
    col: 2,
    colOff: pictureFrame.columnOffset / 36_000,
    row: 3,
    rowOff: pictureFrame.rowOffset / 36_000,
  };
  const image = {
    Drawing: { drawingBase: { from: origin } },
    GetHeight: () => dimensions.height,
    GetLockValue: (key) => locks.get(key),
    GetName: () => name,
    GetWidth: () => dimensions.width,
    SetLockValue: (key, value) => {
      events.push(["lock", key, value]);
      locks.set(key, value);
    },
    SetName: (value) => {
      name = value;
    },
    SetPosition: (...args) => {
      events.push(["position", ...args]);
      [origin.col, origin.colOff, origin.row, origin.rowOff] = [
        args[0],
        args[1] / 36_000,
        args[2],
        args[3] / 36_000,
      ];
    },
    // No selection or size setter: guarding must preserve resized dimensions.
  };
  return { dimensions, events, image, locks, origin };
};

test("picture guard snaps origin after resize and is read-only on unchanged locked images", () => {
  const fixture = guardedImage();
  const sheet = { GetAllImages: () => [fixture.image] };
  const first = runReconcile(sheet);
  expect(first).toMatchObject({ changed: true, ok: true });
  expect(fixture.events).toEqual([
    ["position", 2, pictureFrame.columnOffset, 3, pictureFrame.rowOffset],
  ]);
  fixture.events.length = 0;
  const unchanged = runReconcile(sheet, { observed: first.observed });
  expect(unchanged).toMatchObject({ changed: false, ok: true });
  expect(fixture.events).toEqual([]);
  fixture.dimensions.width += 100;
  const resized = runReconcile(sheet, { observed: unchanged.observed });
  expect(resized).toMatchObject({ changed: true, ok: true });
  expect(resized.observed[field.id].width).toBe(pictureFrame.width + 100);
  expect(fixture.events).toEqual([
    ["position", 2, pictureFrame.columnOffset, 3, pictureFrame.rowOffset],
  ]);
});

test("picture guard repairs keyboard nudges without relying on a dimension change", () => {
  const fixture = guardedImage();
  const observed = { [field.id]: { ...fixture.dimensions } };
  fixture.origin.col = 4;
  fixture.origin.rowOff += 0.53;
  const sheet = { GetAllImages: () => [fixture.image] };
  expect(runReconcile(sheet, { observed })).toMatchObject({
    changed: true,
    ok: true,
  });
  expect(fixture.events).toEqual([
    ["position", 2, pictureFrame.columnOffset, 3, pictureFrame.rowOffset],
  ]);
  expect(fixture.dimensions).toEqual({
    height: pictureFrame.height,
    width: pictureFrame.width,
  });
  fixture.events.length = 0;
  expect(runReconcile(sheet, { observed })).toMatchObject({
    changed: false,
    ok: true,
  });
  expect(fixture.events).toEqual([]);
});

test("picture guard tolerates only rounding noise in millimeter anchor offsets", () => {
  const fixture = guardedImage();
  const observed = { [field.id]: { ...fixture.dimensions } };
  fixture.origin.colOff += 1.9 / 36_000;
  fixture.origin.rowOff -= 1.9 / 36_000;
  const sheet = { GetAllImages: () => [fixture.image] };
  expect(runReconcile(sheet, { observed })).toMatchObject({
    changed: false,
    ok: true,
  });
  expect(fixture.events).toEqual([]);
  fixture.origin.colOff += 3 / 36_000;
  expect(runReconcile(sheet, { observed })).toMatchObject({
    changed: true,
    ok: true,
  });
  expect(fixture.events).toHaveLength(1);
});

test.each([
  undefined,
  {},
  { col: "2", colOff: 0, row: 3, rowOff: 0 },
  { col: 2, colOff: -1, row: 3, rowOff: 0 },
  { col: 2, colOff: 0, row: 1_048_576, rowOff: 0 },
  { col: 2, colOff: 0, row: 3, rowOff: Number.NaN },
])(
  "picture guard falls back to public position correction for missing or malformed host anchors %#",
  (origin) => {
    const fixture = guardedImage();
    fixture.image.Drawing = origin
      ? { drawingBase: { from: origin } }
      : undefined;
    const observed = { [field.id]: { ...fixture.dimensions } };
    expect(
      runReconcile({ GetAllImages: () => [fixture.image] }, { observed })
    ).toMatchObject({ changed: true, ok: true });
    expect(fixture.events).toEqual([
      ["position", 2, pictureFrame.columnOffset, 3, pictureFrame.rowOffset],
    ]);
  }
);

test("picture guard restores a deleted frame and move locks while allowing resize and selection", () => {
  const fixture = guardedImage();
  fixture.locks.set("noMove", false);
  fixture.locks.set("noResize", true);
  fixture.locks.set("noSelect", true);
  const additions = [];
  const sheet = {
    AddImage: (...args) => {
      additions.push(args);
      return fixture.image;
    },
    GetAllImages: () => [],
  };
  expect(runReconcile(sheet)).toMatchObject({ changed: true, ok: true });
  expect(additions).toEqual([
    [
      "placeholder",
      pictureFrame.width,
      pictureFrame.height,
      2,
      pictureFrame.columnOffset,
      3,
      pictureFrame.rowOffset,
    ],
  ]);
  expect(fixture.locks.get("noMove")).toBe(true);
  expect(fixture.locks.get("noResize")).toBe(false);
  expect(fixture.locks.get("noSelect")).toBe(false);
});

test("picture guard fails safely for duplicate drawings or failed placeholder insertion", () => {
  const fixture = guardedImage();
  expect(
    runReconcile({ GetAllImages: () => [fixture.image, fixture.image] })
  ).toMatchObject({ ok: false });
  expect(
    runReconcile({ AddImage: () => null, GetAllImages: () => [] })
  ).toMatchObject({ ok: false });
});

test("response guard reconciles before freezing/saving, skips unchanged dirty notifications and stops on pagehide", async () => {
  const harness = createHarness({
    capabilityResponses: ["save"],
    documentKind: "xlsx",
    responses: [
      { operationCapability: "poll", operationId: "saved" },
      completedOperation(),
    ],
    spreadsheetBindings: {
      fields: [{ ...field, type: "picture" }],
      table: null,
      version: 1,
    },
    spreadsheetPictureFrames: [pictureFrame],
  });
  acknowledgeBridge(harness);
  const calls = [];
  const { callCommand } = harness.window.Asc.plugin;
  harness.window.Asc.plugin.callCommand = (
    command,
    _close,
    _calculate,
    done
  ) => {
    if (command.name !== "spreadsheetPictureReconcileCommand") {
      callCommand(command, _close, _calculate, done);
      return;
    }
    expect(command.name).toBe("spreadsheetPictureReconcileCommand");
    calls.push([
      "guard",
      harness.window.Asc.scope.folioSpreadsheetPictureReconcile.force,
    ]);
    done(JSON.stringify({ changed: false, observed: {}, ok: true }));
  };
  const execute = harness.window.Asc.plugin.executeMethod;
  harness.window.Asc.plugin.executeMethod = (method, ...args) => {
    calls.push(["method", method]);
    execute(method, ...args);
  };
  const dirtyBefore = harness.messages.filter(
    ({ message }) => message.type === "dirty-state"
  ).length;
  expect(await harness.runPictureGuardTimer()).toBe(true);
  expect(
    harness.messages.filter(({ message }) => message.type === "dirty-state")
  ).toHaveLength(dirtyBefore);
  expect(await harness.window.FormBridge.runAction("save-draft")).toMatchObject(
    { ok: true }
  );
  expect(calls[0]).toEqual(["guard", false]);
  const forceIndex = calls.findIndex(
    ([kind, value]) => kind === "guard" && value === true
  );
  const freezeIndex = calls.findIndex(
    ([kind, value]) => kind === "method" && value === "SetEditingRestrictions"
  );
  expect(forceIndex).toBeGreaterThan(0);
  expect(freezeIndex).toBeGreaterThan(forceIndex);
  expect(
    harness.window.Asc.scope.folioSpreadsheetPictureReconcile
  ).toBeUndefined();
  harness.emitWindowEvent("pagehide");
  expect(await harness.runPictureGuardTimer()).toBe(false);
});

test("authenticated parent save receives failure when picture reconciliation fails without sending a save", async () => {
  const harness = createHarness({
    documentKind: "xlsx",
    spreadsheetBindings: {
      fields: [{ ...field, type: "picture" }],
      table: null,
      version: 1,
    },
    spreadsheetPictureFrames: [pictureFrame],
  });
  acknowledgeBridge(harness);
  harness.window.Asc.plugin.callCommand = (
    _command,
    _close,
    _calculate,
    done
  ) => done(JSON.stringify({ ok: false }));
  harness.dispatch({
    data: {
      action: "submit",
      bridgeId: harness.bridgeId,
      source: "folio-parent",
      type: "run-action",
    },
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  expect(
    harness.messages.find(({ message }) => message.status === "failed")?.message
  ).toMatchObject({
    action: "submit",
    error: "ดูแลกรอบรูปไม่ได้ กรุณาลองอีกครั้งหรือเปิดแบบฟอร์มใหม่",
    status: "failed",
  });
  expect(harness.methodCalls).not.toContain("SetEditingRestrictions");
  expect(
    harness.window.Asc.scope.folioSpreadsheetPictureReconcile
  ).toBeUndefined();
});

test("upload blocks simultaneous saves and guard work, then releases controls for retry", async () => {
  const harness = createHarness({
    browserGlobals: pictureBrowserGlobals(1, 1),
    documentKind: "xlsx",
    spreadsheetBindings: {
      fields: [{ ...field, type: "picture" }],
      table: null,
      version: 1,
    },
    spreadsheetPictureFrames: [pictureFrame],
  });
  acknowledgeBridge(harness);
  const upload = control(harness, "ภาพประกอบ (จำเป็น) · JPEG / PNG ไม่เกิน 10 MB");
  let complete;
  const commands = [];
  harness.window.Asc.plugin.callCommand = (
    command,
    _close,
    _calculate,
    done
  ) => {
    commands.push(command.name);
    complete = done;
  };
  upload.files = [{ size: 10, type: "image/png" }];
  upload.value = "photo.png";
  upload.dispatchEvent({ type: "change" });
  await flushPlugin();
  expect(upload.disabled).toBe(true);
  expect(await harness.runPictureGuardTimer()).toBe(true);
  expect(await harness.window.FormBridge.runAction("save-draft")).toMatchObject(
    { ignored: true, ok: false }
  );
  expect(harness.requests).toHaveLength(0);
  expect(commands).toEqual(["spreadsheetPictureCommand"]);
  complete(false);
  await flushPlugin();
  expect(upload.disabled).toBe(false);
  expect(upload.value).toBe("");
  expect(harness.window.Asc.scope.folioSpreadsheetPicture).toBeUndefined();
});

test("upload refuses missing published frame geometry and resets the picker", async () => {
  const harness = createHarness({
    documentKind: "xlsx",
    spreadsheetBindings: {
      fields: [{ ...field, type: "picture" }],
      table: null,
      version: 1,
    },
  });
  const upload = control(harness, "ภาพประกอบ (จำเป็น) · JPEG / PNG ไม่เกิน 10 MB");
  upload.files = [{ size: 10, type: "image/png" }];
  upload.value = "photo.png";
  upload.dispatchEvent({ type: "change" });
  await flushPlugin();
  expect(harness.statusElement.textContent).toContain("ไม่พบข้อมูลกรอบรูปต้นแบบ");
  expect(upload.value).toBe("");
  expect(upload.disabled).toBe(false);
  expect(harness.window.Asc.scope?.folioSpreadsheetPicture).toBeUndefined();
});

test("serialized picture insertion reports AddImage failure", () => {
  expect(runPicture({ AddImage: () => null, GetAllImages: () => [] })).toBe(
    false
  );
});

test("serialized picture insertion fits the range and names the new image", () => {
  const events = [];
  let name = "";
  const sheet = {
    AddImage: (...args) => {
      events.push(args);
      return {
        GetName: () => name,
        SetName: (value) => {
          name = value;
        },
      };
    },
    GetAllImages: () => [{ GetName: () => "unrelated" }],
  };
  expect(runPicture(sheet)).toBe(true);
  expect(events).toEqual([
    ["data:image/png;base64,picture", 1_270_000, 1_270_000, 2, 0, 3, 0],
  ]);
  expect(name).toBe("folio_picture_photo_id");
});

test.each([true, false])(
  "serialized selected-image replacement returns %s and retains its marker",
  (result) => {
    const events = [];
    const previous = {
      GetName: () => "folio_picture_photo_id",
      Select: (value) => {
        events.push(["select", value]);
        return true;
      },
    };
    const sheet = {
      GetAllImages: () => [previous],
      ReplaceCurrentImage: (...args) => {
        events.push(["replace", ...args]);
        return result;
      },
      // No AddImage or Delete API: replacements must use the existing drawing.
    };
    expect(runPicture(sheet)).toBe(result);
    expect(events).toEqual([
      ["select", true],
      ["replace", "data:image/png;base64,picture", 1_270_000, 1_270_000],
    ]);
    expect(previous.GetName()).toBe("folio_picture_photo_id");
  }
);

test("serialized replacement stops when native image selection fails", () => {
  const sheet = {
    GetAllImages: () => [
      { GetName: () => "folio_picture_photo_id", Select: () => false },
    ],
  };
  expect(runPicture(sheet)).toBe(false);
});

test("serialized picture insertion caps scale at the native pixel resolution", () => {
  const dimensions = [];
  let name = "";
  const sheet = {
    AddImage: (_data, width, height) => {
      dimensions.push([width, height]);
      return {
        GetName: () => name,
        SetName: (value) => {
          name = value;
        },
      };
    },
    GetAllImages: () => [],
  };
  expect(runPicture(sheet, { height: 2, width: 1 })).toBe(true);
  expect(dimensions).toEqual([[9525, 19_050]]);
});

test("serialized frame creation is idempotent and preserves existing real images", () => {
  const image = { GetName: () => "folio_picture_photo_id" };
  // No Select or ReplaceCurrentImage methods: ensuring must leave it untouched.
  expect(
    runPicture({ GetAllImages: () => [image] }, { placeholder: true })
  ).toBe(true);
  expect(
    runPicture({ GetAllImages: () => [image, image] }, { placeholder: true })
  ).toBe(false);
});

test("serialized frame creation upscales the asset to fit the cell area", () => {
  const dimensions = [];
  let name;
  const image = {
    GetName: () => name,
    SetName: (value) => {
      name = value;
    },
  };
  const sheet = {
    AddImage: (_data, width, height) => {
      dimensions.push([width, height]);
      return image;
    },
    GetAllImages: () => [],
  };
  expect(runPicture(sheet, { height: 1, placeholder: true, width: 2 })).toBe(
    true
  );
  expect(dimensions).toEqual([[2_540_000, 1_270_000]]);
});

test("response upload replaces tiny or differently proportioned images at the original frame dimensions and origin", () => {
  const events = [];
  const image = {
    GetName: () => "folio_picture_photo_id",
    Select: () => true,
    SetLockValue: (...args) => events.push(["lock", ...args]),
    SetPosition: (...args) => events.push(["position", ...args]),
    SetSize: (...args) => events.push(["size", ...args]),
  };
  const sheet = {
    GetAllImages: () => [image],
    ReplaceCurrentImage: (...args) => {
      events.push(["replace", ...args]);
      return true;
    },
  };
  expect(runPicture(sheet, { frame: pictureFrame, height: 20, width: 1 })).toBe(
    true
  );
  expect(events).toEqual([
    [
      "replace",
      "data:image/png;base64,picture",
      pictureFrame.width,
      pictureFrame.height,
    ],
    ["size", pictureFrame.width, pictureFrame.height],
    ["position", 2, pictureFrame.columnOffset, 3, pictureFrame.rowOffset],
    ["lock", "noMove", true],
    ["lock", "noResize", false],
    ["lock", "noSelect", false],
  ]);
});

test("response upload recreates a deleted drawing using original dimensions and offsets", () => {
  const events = [];
  let name;
  const image = {
    GetName: () => name,
    SetLockValue: (...args) => events.push(["lock", ...args]),
    SetName: (value) => {
      name = value;
    },
    SetSize: (...args) => events.push(["size", ...args]),
  };
  const sheet = {
    AddImage: (...args) => {
      events.push(["add", ...args]);
      return image;
    },
    GetAllImages: () => [],
  };
  expect(runPicture(sheet, { frame: pictureFrame, height: 20, width: 1 })).toBe(
    true
  );
  expect(events[0]).toEqual([
    "add",
    "data:image/png;base64,picture",
    pictureFrame.width,
    pictureFrame.height,
    2,
    pictureFrame.columnOffset,
    3,
    pictureFrame.rowOffset,
  ]);
  expect(name).toBe("folio_picture_photo_id");
});

test.each([
  { id: "wrong" },
  { anchor: "wrong" },
  { width: 0 },
  { height: -1 },
  { columnOffset: -1 },
  { rowOffset: Number.NaN },
])(
  "response upload rejects invalid trusted geometry before changing the image %#",
  (invalid) => {
    expect(
      runPicture(
        { GetAllImages: () => [] },
        { frame: { ...pictureFrame, ...invalid } }
      )
    ).toBe(false);
  }
);

test("admin persists the field before placing its frame and can retry a failed placement", async () => {
  const bindings = { fields: [field], table: null, version: 1 };
  const pictureBindings = {
    ...bindings,
    fields: [{ ...field, type: "picture" }],
  };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write"],
    documentKind: "xlsx",
    responses: [
      { bindings, revision: 0 },
      { bindings: pictureBindings, revision: 1 },
    ],
    spreadsheetBindings: bindings,
    spreadsheetSelection: {
      address: "B2",
      names: { photo_anchor: "'Sheet1'!$B$2" },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const original = harness.window.Asc.plugin.callCommand;
  let placements = 0;
  harness.window.Asc.plugin.callCommand = (
    command,
    close,
    recalculate,
    done
  ) => {
    if (command.name !== "spreadsheetPictureCommand") {
      original(command, close, recalculate, done);
      return;
    }
    expect(harness.requests.some((request) => request.method === "PATCH")).toBe(
      true
    );
    expect(harness.window.Asc.scope.folioSpreadsheetPicture).toMatchObject({
      anchor: field.anchor,
      id: field.id,
      placeholder: true,
    });
    placements += 1;
    done(placements > 1);
  };
  const type = control(harness, "ชนิดข้อมูล");
  type.value = "picture";
  type.dispatchEvent({ type: "change" });
  await click(harness, "บันทึกการแก้ไข");
  expect(harness.statusElement.textContent).toContain("สร้างกรอบรูปไม่ได้");
  expect(harness.window.Asc.scope.folioSpreadsheetPicture).toBeUndefined();
  await click(harness, "สร้างกรอบรูปอีกครั้ง");
  expect(placements).toBe(2);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
  expect(harness.statusElement.textContent).toContain("เตรียมกรอบรูปแล้ว");
  expect(harness.window.Asc.scope.folioSpreadsheetPicture).toBeUndefined();
});

test("editing picture field metadata preserves its attached image and binding identity", async () => {
  const pictureField = { ...field, type: "picture" };
  const bindings = { fields: [pictureField], table: null, version: 1 };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write"],
    documentKind: "xlsx",
    responses: [
      { bindings, revision: 0 },
      { bindings, revision: 1 },
    ],
    spreadsheetBindings: bindings,
    spreadsheetSelection: {
      address: "B2",
      names: { photo_anchor: "'Sheet1'!$B$2" },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const original = harness.window.Asc.plugin.callCommand;
  let ensures = 0;
  const image = { GetName: () => "folio_picture_photo_id" };
  harness.window.Asc.plugin.callCommand = (
    command,
    close,
    recalculate,
    done
  ) => {
    if (command.name !== "spreadsheetPictureCommand") {
      original(command, close, recalculate, done);
      return;
    }
    ensures += 1;
    // The real image exposes no mutation methods. Replacing or adding fails.
    done(
      runPicture(
        { GetAllImages: () => [image] },
        harness.window.Asc.scope.folioSpreadsheetPicture
      )
    );
  };
  control(harness, "Title · ชื่อช่อง").value = "ภาพที่ปรับชื่อ";
  await click(harness, "บันทึกการแก้ไข");
  expect(ensures).toBe(1);
  const patch = harness.requests.find((request) => request.method === "PATCH");
  expect(JSON.parse(patch.body).change.value).toMatchObject({
    anchor: field.anchor,
    id: field.id,
    label: "ภาพที่ปรับชื่อ",
    type: "picture",
  });
  expect(harness.statusElement.textContent).toContain("บันทึกฟิลด์และกรอบรูปแล้ว");
});

test.each([true, false])(
  "serialized selection for Delete reports native selection result %s",
  (result) => {
    const selections = [];
    const sheet = {
      GetAllImages: () => [
        {
          GetName: () => "folio_picture_photo_id",
          Select: (value) => {
            selections.push(value);
            return result;
          },
        },
      ],
    };
    expect(runPicture(sheet, { select: true })).toBe(result);
    expect(selections).toEqual([true]);
  }
);

test("serialized selection rejects missing or duplicated picture markers", () => {
  expect(runPicture({ GetAllImages: () => [] }, { select: true })).toBe(false);
  const sheet = {
    GetAllImages: () => [
      { GetName: () => "folio_picture_photo_id" },
      { GetName: () => "folio_picture_photo_id" },
    ],
  };
  expect(runPicture(sheet, { select: true })).toBe(false);
  expect(runPicture(sheet)).toBe(false);
});

test("serialized picture command rejects a missing anchor", () => {
  expect(
    runInNewContext(`(${spreadsheetPictureCommand.toString()})()`, {
      Api: { GetDefName: () => null },
      Asc: { scope: { folioSpreadsheetPicture: { anchor: "missing" } } },
    })
  ).toBe(false);
});

test.each([
  [undefined, "JPEG หรือ PNG"],
  [{ size: 1, type: "image/gif" }, "JPEG หรือ PNG"],
  [{ size: 10 * 1024 * 1024 + 1, type: "image/png" }, "10 MB"],
])(
  "picture file validation rejects unsupported or oversized input %# before reading",
  async (file, message) => {
    await expect(readSpreadsheetPictureFile(file)).rejects.toThrow(message);
  }
);

const readPictureWithDimensions = (width, height) =>
  runInNewContext(`(${readSpreadsheetPictureFile.toString()})(file)`, {
    ...pictureBrowserGlobals(width, height),
    file: { size: 10 * 1024 * 1024, type: "image/jpeg" },
  });

test("picture file validation accepts the byte and pixel boundaries", async () => {
  await expect(readPictureWithDimensions(4096, 4096)).resolves.toEqual({
    dataUrl: "data:image/jpeg;base64,picture",
    height: 4096,
    width: 4096,
  });
});

test.each([
  [4097, 1],
  [1, 4097],
  [0, 1],
  [1, 0],
])(
  "picture file validation rejects invalid dimensions %s × %s",
  async (width, height) => {
    await expect(readPictureWithDimensions(width, height)).rejects.toThrow(
      "4096 × 4096"
    );
  }
);
