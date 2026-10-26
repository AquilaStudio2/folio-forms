import { expect, test } from "bun:test";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import {
  spreadsheetEditorSaveOptions,
  validatePreservedSpreadsheetEditorSave,
} from "../../src/documents/spreadsheets/editor-save-proof";
import { fixtureWorkbook } from "./fixture";

const nonce = "919bdf57-2d40-448c-9351-8d02e2ddcb09";
const checkpointName = `_folio_editor_save_checkpoint_${nonce.replaceAll("-", "")}`;
const bindings = spreadsheetBindingSchema.parse({
  fields: [],
  table: null,
  version: 1,
});
const manual = {
  preserveEditorSession: true,
  preserveEditorSessionPurpose: "manual",
  spreadsheetSaveCheckpoint: nonce,
  spreadsheetUploadPocSnapshot: [],
};
const checkpointWorkbook = (
  attributes = 'localSheetId="0" hidden="1"',
  extraNames: Record<string, string> = {}
) => {
  const entries = unzipSync(
    fixtureWorkbook({
      names: { ...extraNames, [checkpointName]: "'Form'!$A$1" },
    })
  );
  entries["xl/workbook.xml"] = strToU8(
    strFromU8(entries["xl/workbook.xml"] ?? new Uint8Array()).replace(
      `name="${checkpointName}"`,
      `name="${checkpointName}" ${attributes}`
    )
  );
  return zipSync(entries);
};
test("manual zero-POC proof requires one fresh hidden local A1 checkpoint and an exact empty manifest", () => {
  expect(() =>
    validatePreservedSpreadsheetEditorSave(
      checkpointWorkbook(),
      bindings,
      manual
    )
  ).not.toThrow();
  expect(() =>
    validatePreservedSpreadsheetEditorSave(checkpointWorkbook(), bindings, {
      ...manual,
      spreadsheetSaveCheckpoint: crypto.randomUUID(),
    })
  ).toThrow();
  expect(() =>
    validatePreservedSpreadsheetEditorSave(
      checkpointWorkbook('hidden="1"'),
      bindings,
      manual
    )
  ).toThrow();
  expect(() =>
    validatePreservedSpreadsheetEditorSave(
      checkpointWorkbook('localSheetId="0" hidden="0"'),
      bindings,
      manual
    )
  ).toThrow();
  expect(() =>
    validatePreservedSpreadsheetEditorSave(checkpointWorkbook(), bindings, {
      ...manual,
      spreadsheetUploadPocSnapshot: [
        { bindingId: "folio_missing", rowIndex: null, tag: "missing" },
      ],
    })
  ).toThrow();
});
test("delete proof rejects active mapping IDs and surviving native anchors while allowing genuine zero-POC removal", () => {
  const deletion = {
    ...manual,
    deletedUploadPocBindingIds: ["folio_deleted"],
    preserveEditorSessionPurpose: "delete",
  };
  expect(() =>
    validatePreservedSpreadsheetEditorSave(
      checkpointWorkbook(),
      bindings,
      deletion
    )
  ).not.toThrow();
  expect(() =>
    validatePreservedSpreadsheetEditorSave(
      checkpointWorkbook(undefined, { folio_deleted: "'Form'!$B$2" }),
      bindings,
      deletion
    )
  ).toThrow();
  const active = spreadsheetBindingSchema.parse({
    fields: [
      {
        anchor: "folio_deleted",
        id: "folio_deleted",
        key: "deleted",
        label: "Deleted",
        type: "text",
      },
    ],
    table: null,
    version: 1,
  });
  expect(() =>
    validatePreservedSpreadsheetEditorSave(
      checkpointWorkbook(),
      active,
      deletion
    )
  ).toThrow();
});
test("explicit purpose validation never treats missing placement IDs as manual or accepts duplicated assertions", () => {
  expect(() =>
    spreadsheetEditorSaveOptions({ preserveEditorSession: true })
  ).toThrow();
  expect(() =>
    spreadsheetEditorSaveOptions({
      ...manual,
      uploadPocBindingId: "folio_first",
    })
  ).toThrow();
  expect(() =>
    spreadsheetEditorSaveOptions({
      ...manual,
      deletedUploadPocBindingIds: [],
      preserveEditorSessionPurpose: "delete",
    })
  ).toThrow();
  expect(() =>
    spreadsheetEditorSaveOptions({
      ...manual,
      deletedUploadPocBindingIds: ["folio_first", "folio_first"],
      preserveEditorSessionPurpose: "delete",
    })
  ).toThrow();
  expect(() =>
    spreadsheetEditorSaveOptions({
      ...manual,
      spreadsheetUploadPocSnapshot: [
        { bindingId: "folio_first", rowIndex: null, tag: "first" },
        { bindingId: "folio_first", rowIndex: null, tag: "first" },
      ],
    })
  ).toThrow();
  expect(
    spreadsheetEditorSaveOptions({
      preserveEditorSession: true,
      uploadPocBindingId: "folio_first",
    })
  ).toMatchObject({ uploadPocBindingId: "folio_first" });
});
