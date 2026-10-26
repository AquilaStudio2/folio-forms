// oxlint-disable prefer-await-to-callbacks -- Lifecycle tests inject activation and error observers to control readiness races.
import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import { spreadsheetUploadPocActivationCommand } from "../src/spreadsheet-upload-poc-activation.js";
import { createUploadPocActivationLifecycle } from "../src/upload-poc-activation-lifecycle.js";

const guid = "asc.{804C7D5D-8243-47D9-87A2-64E42806D42F}";
const harness = () => {
  let locked = true;
  let mutations = 0;
  const locks = new Map();
  const metadata = {
    bindingId: "folio_attachment",
    kind: "folio-upload-poc",
    rowIndex: null,
    tag: "attachment",
    version: 1,
  };
  const object = {
    Drawing: {
      drawingBase: { from: { col: 1, row: 2 } },
      getProtectionLocked: () => locked,
      setProtectionLocked: (value) => {
        locked = value;
        mutations += 1;
      },
    },
    GetApplicationId: () => guid,
    GetData: () => JSON.stringify(metadata),
    GetLockValue: (type) => locks.get(type),
    SetLockValue: (type, value) => {
      locks.set(type, value);
      mutations += 1;
      return true;
    },
  };
  const objects = [object, { GetApplicationId: () => "ordinary-author-image" }];
  const sheet = { GetAllOleObjects: () => objects, GetName: () => "Sheet1" };
  const range = {
    GetCol: () => 2,
    GetRow: () => 3,
    GetRowsCount: () => 1,
    GetWorksheet: () => sheet,
  };
  const bindings = {
    fields: [
      {
        anchor: "folio_attachment",
        computed: false,
        id: "folio_attachment",
        key: "attachment",
        type: "text",
      },
    ],
    table: null,
  };
  const run = () =>
    JSON.parse(
      runInNewContext(
        `(${spreadsheetUploadPocActivationCommand.toString()})()`,
        {
          Api: {
            GetActiveSheet: () => sheet,
            GetDefName: () => ({ GetRefersToRange: () => range }),
          },
          Asc: { scope: { folioUploadPocActivation: { bindings, guid } } },
        }
      )
    );
  return {
    bindings,
    metadata,
    mutations: () => mutations,
    object,
    objects,
    run,
  };
};

test("9.4 activation unlocks only validated POC object and retains move/resize locks", () => {
  const h = harness();
  expect(h.run()).toEqual({ count: 1, ok: true });
  expect(h.object.Drawing.getProtectionLocked()).toBe(false);
  expect(h.object.GetLockValue("noMove")).toBe(true);
  expect(h.object.GetLockValue("noResize")).toBe(true);
  expect(h.object.GetLockValue("noSelect")).toBe(false);
});

test("9.4 activation validates all recognized objects before any mutation", () => {
  const h = harness();
  h.objects.push({
    GetApplicationId: () => guid,
    GetData: () => JSON.stringify({ ...h.metadata, file: "unexpected" }),
  });
  expect(h.run().ok).toBe(false);
  expect(h.mutations()).toBe(0);
  expect(h.object.Drawing.getProtectionLocked()).toBe(true);
});

test("9.4 activation fails closed for wrong coordinates, binding or unsupported native API", () => {
  const moved = harness();
  moved.object.Drawing.drawingBase.from.row = 3;
  expect(moved.run().ok).toBe(false);
  expect(moved.mutations()).toBe(0);
  const incompatible = harness();
  incompatible.bindings.fields[0].type = "number";
  expect(incompatible.run().ok).toBe(false);
  expect(incompatible.mutations()).toBe(0);
  const unsupported = harness();
  unsupported.object.Drawing.setProtectionLocked = undefined;
  expect(unsupported.run().ok).toBe(false);
  expect(unsupported.mutations()).toBe(0);
});

test("public lock getter proof precedes private unlock and failed unlock rolls protection back", () => {
  const publicFailure = harness();
  const calls = [];
  const originalSetter = publicFailure.object.Drawing.setProtectionLocked;
  publicFailure.object.Drawing.setProtectionLocked = (value) => {
    calls.push(value);
    originalSetter(value);
  };
  publicFailure.object.GetLockValue = () => false;
  expect(publicFailure.run().ok).toBe(false);
  expect(calls).not.toContain(false);
  expect(publicFailure.object.Drawing.getProtectionLocked()).toBe(true);

  const privateFailure = harness();
  const originalGetter = privateFailure.object.Drawing.getProtectionLocked;
  privateFailure.object.Drawing.getProtectionLocked = () => true;
  expect(privateFailure.run().ok).toBe(false);
  expect(originalGetter()).toBe(true);
});

test("early fallback failure cannot consume the later content-ready activation", async () => {
  let calls = 0;
  const errors = [];
  const lifecycle = createUploadPocActivationLifecycle(
    () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("document not ready");
      }
    },
    (error) => errors.push(error.message)
  );
  await lifecycle.fallback();
  expect(calls).toBe(1);
  expect(errors).toEqual(["document not ready"]);
  await lifecycle.ready();
  await lifecycle.ready();
  await lifecycle.fallback();
  expect(calls).toBe(2);
});

test("content-ready during an early in-flight fallback schedules one settled retry", async () => {
  let calls = 0;
  const gate = Promise.withResolvers();
  const errors = [];
  const lifecycle = createUploadPocActivationLifecycle(
    async () => {
      calls += 1;
      if (calls === 1) {
        await gate.promise;
      }
    },
    (error) => errors.push(error)
  );
  const early = lifecycle.fallback();
  await Promise.resolve();
  expect(calls).toBe(1);
  const ready = lifecycle.ready();
  gate.resolve();
  await Promise.all([early, ready]);
  expect(calls).toBe(2);
  expect(errors).toHaveLength(0);
});

test("ready-first initialization activates once even when fallback and ready repeat", async () => {
  let calls = 0;
  const errors = [];
  const lifecycle = createUploadPocActivationLifecycle(
    () => {
      calls += 1;
    },
    (error) => errors.push(error)
  );
  await lifecycle.ready();
  await lifecycle.fallback();
  await lifecycle.ready();
  expect(calls).toBe(1);
});
