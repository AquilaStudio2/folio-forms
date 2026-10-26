import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import { uploadPocGuid } from "../../server/src/documents/spreadsheets/upload-poc-preview.ts";
import { spreadsheetUploadPocDeleteCommand } from "../src/spreadsheet-upload-poc-delete.js";

const setup = () => {
  const markers = new Map([
    ["_folio_upload_poc_folio_a", "'Form'!$B$2"],
    ["_folio_upload_poc_folio_b", "'Form'!$C$2"],
  ]);
  // oxlint-disable-next-line consistent-function-scoping -- Native fixture factory is scoped to this fixture.
  const native = (
    bindingId,
    column,
    applicationId = uploadPocGuid,
    nativeId = bindingId
  ) => ({
    Drawing: {
      Id: nativeId,
      deleteDrawingBase() {
        this.removed = true;
      },
      drawingBase: { from: { col: column, row: 1 } },
    },
    GetApplicationId: () => applicationId,
    GetData() {
      return this.data;
    },
    data: JSON.stringify({
      bindingId,
      kind: "folio-upload-poc",
      rowIndex: null,
      tag: bindingId.slice(6),
      version: 1,
    }),
  });
  const first = native("folio_a", 1);
  const second = native("folio_b", 2);
  // A foreign OLE with a colliding internal ID must still never be touched.
  const foreign = native("folio_foreign", 8, "foreign-guid", "folio_a");
  const objects = [foreign, first, second];
  const Api = {
    GetActiveSheet: () => ({
      GetAllOleObjects: () => objects.filter((item) => !item.Drawing.removed),
      GetName: () => "Form",
    }),
    GetDefName: (name) =>
      markers.has(name) ? { GetRefersTo: () => markers.get(name) } : null,
  };
  const command = (input) =>
    JSON.parse(
      runInNewContext(
        `(${spreadsheetUploadPocDeleteCommand.toString()})(input)`,
        { Api, input }
      )
    );
  const captured = command({
    bindingIds: ["folio_a", "folio_b"],
    guid: uploadPocGuid,
    phase: "capture",
  });
  const remove = () =>
    command({
      activeBindingIds: [],
      bindingIds: ["folio_a", "folio_b"],
      guid: uploadPocGuid,
      phase: "remove",
      targets: captured.targets,
    });
  const commit = () => markers.clear();
  return { captured, command, commit, first, foreign, markers, remove, second };
};

test("capture is read-only and targeted deletion preserves foreign objects even with colliding native IDs", () => {
  const fixture = setup();
  expect(fixture.captured.ok).toBe(true);
  expect(fixture.first.Drawing.removed).not.toBe(true);
  fixture.commit();
  expect(fixture.remove()).toMatchObject({ count: 2, ok: true });
  expect(fixture.first.Drawing.removed).toBe(true);
  expect(fixture.second.Drawing.removed).toBe(true);
  expect(fixture.foreign.Drawing.removed).not.toBe(true);
  expect(fixture.remove()).toMatchObject({ count: 0, ok: true });
});

test.each(["data", "position", "unsupported"])(
  "every remaining target is checked before any deletion when a later target changes: %s",
  (change) => {
    const fixture = setup();
    fixture.commit();
    if (change === "data") {
      fixture.second.data = fixture.second.data.replace(
        '"tag":"b"',
        '"tag":"changed"'
      );
    }
    if (change === "position") {
      fixture.second.Drawing.drawingBase.from.col = 3;
    }
    if (change === "unsupported") {
      fixture.second.Drawing.deleteDrawingBase = undefined;
    }
    expect(fixture.remove().ok).toBe(false);
    expect(fixture.first.Drawing.removed).not.toBe(true);
    expect(fixture.second.Drawing.removed).not.toBe(true);
    expect(fixture.foreign.Drawing.removed).not.toBe(true);
  }
);

test("a restored marker blocks removal even after metadata was confirmed deleted", () => {
  const fixture = setup();
  expect(fixture.remove().ok).toBe(false);
  expect(fixture.first.Drawing.removed).not.toBe(true);
  expect(fixture.second.Drawing.removed).not.toBe(true);
});

test.each([
  { computed: false, type: "number" },
  { computed: true, type: "text" },
])(
  "active ineligible binding cleanup requires absent marker and current ineligibility: %p",
  (binding) => {
    const fixture = setup();
    const input = {
      activeBindingIds: ["folio_a"],
      bindingIds: ["folio_a"],
      currentBindings: [{ id: "folio_a", ...binding }],
      guid: uploadPocGuid,
      phase: "remove",
      reason: "ineligible/type-change",
      targets: fixture.captured.targets,
    };
    expect(fixture.command(input).ok).toBe(false);
    fixture.commit();
    expect(
      fixture.command({
        ...input,
        currentBindings: [{ computed: false, id: "folio_a", type: "text" }],
      }).ok
    ).toBe(false);
    expect(fixture.command({ ...input, currentBindings: [] }).ok).toBe(false);
    expect(fixture.command(input)).toMatchObject({ count: 1, ok: true });
    expect(fixture.first.Drawing.removed).toBe(true);
    expect(fixture.second.Drawing.removed).not.toBe(true);
  }
);
