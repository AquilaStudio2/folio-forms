// Isolated pure conversion checks; no database or object storage is connected.
import { mock } from "bun:test";
import assert from "node:assert/strict";

import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { fixtureBindings } from "./fixture";

mock.module("@onlyoffice/db", () => ({
  FieldType: {
    checkbox: "checkbox",
    combo: "combo",
    date: "date",
    dropdown: "dropdown",
    number: "number",
    picture: "picture",
    table: "table",
    text: "text",
  },
  Prisma: { DbNull: null },
  prisma: {},
}));
mock.module("../../src/storage", () => ({
  readObject: () => {
    throw new Error("Pure field conversion must not read artifacts");
  },
}));
const {
  spreadsheetBindingsFromFields,
  spreadsheetDraftFieldData,
  spreadsheetManifestFieldData,
} = await import("../../src/forms/spreadsheet-fields");
const bindings = spreadsheetBindingSchema.parse({
  ...fixtureBindings(),
  fields: [
    ...fixtureBindings().fields,
    {
      anchor: "folio_scalar_quantity",
      id: "folio_scalar_quantity",
      key: "quantity",
      label: "Scalar quantity",
      placeholder: "e.g. 42",
      prefillPointer: "/account/quantity",
      prefillPolicy: "lock_when_available",
      required: true,
      type: "number",
    },
    {
      anchor: "folio_scalar_options",
      id: "folio_scalar_options",
      key: "choice",
      label: "Choice",
      options: ["First", "Second"],
      type: "dropdown",
    },
  ],
});
const drafts = spreadsheetDraftFieldData(bindings);
assert.deepEqual(spreadsheetBindingsFromFields(drafts), bindings);
assert.equal(drafts.find((field) => field.tag === "quantity")?.type, "number");
assert.equal(
  drafts.find((field) => field.tag === "activities.quantity")?.type,
  "number"
);
assert.equal(
  drafts.find((field) => field.tag === "activities.active")?.type,
  "checkbox"
);
assert.deepEqual(drafts.find((field) => field.tag === "choice")?.options, [
  { displayText: "First", value: "First" },
  { displayText: "Second", value: "Second" },
]);
for (const field of drafts) {
  assert.ok(typeof field.binding === "object" && field.binding !== null);
  assert.ok(!Object.hasOwn(field.binding, "key"));
  assert.ok(!Object.hasOwn(field.binding, "label"));
  assert.ok(!Object.hasOwn(field.binding, "type"));
  assert.ok(!Object.hasOwn(field.binding, "options"));
  assert.ok(!Object.hasOwn(field.binding, "required"));
}
const bindingPlaceholder = (tag: string): string | null => {
  const field = drafts.find((item) => item.tag === tag);
  assert.ok(field);
  return (field.binding as { placeholder: string | null }).placeholder;
};
assert.equal(bindingPlaceholder("quantity"), "e.g. 42");
assert.equal(bindingPlaceholder("agency"), null);
const published = spreadsheetManifestFieldData(bindings);
const prefill = bindings.fields
  .filter((field) => field.prefillPointer !== null)
  .map((field) => ({
    pointer: field.prefillPointer as string,
    policy: field.prefillPolicy,
    tag: field.key,
  }));
assert.deepEqual(spreadsheetBindingsFromFields(published, prefill), bindings);
assert.ok(published.every((field) => !Object.hasOwn(field, "prefillPointer")));
// Both lifecycle stages must reject metadata from a different binding shape
// and common field configuration copied into placement metadata.
for (const rows of [drafts, published]) {
  for (const [tag, property] of [
    ["quantity", { offset: 0 }],
    ["activities", { computed: false }],
    ["activities.quantity", { anchor: "folio_wrong_anchor" }],
    ["quantity", { label: "Duplicated label" }],
  ] as const) {
    assert.throws(() =>
      spreadsheetBindingsFromFields(
        rows.map((field) =>
          field.tag === tag
            ? { ...field, binding: { ...field.binding, ...property } }
            : field
        ),
        prefill
      )
    );
  }
}
const incompleteTable = spreadsheetBindingSchema.parse({
  ...bindings,
  table: { ...bindings.table, columns: [] },
});
assert.deepEqual(
  spreadsheetBindingsFromFields(spreadsheetDraftFieldData(incompleteTable)),
  incompleteTable
);
assert.deepEqual(spreadsheetBindingsFromFields([]), {
  fields: [],
  table: null,
  version: 1,
});
assert.throws(
  () =>
    spreadsheetBindingsFromFields(
      drafts.map((field, index) =>
        index === 0 ? { ...field, position: null } : field
      )
    ),
  /Incomplete/u
);
assert.throws(
  () =>
    spreadsheetBindingsFromFields(
      drafts.map((field, index) =>
        index === 0 ? { ...field, binding: null } : field
      )
    ),
  /Incomplete/u
);
assert.throws(
  () =>
    spreadsheetBindingsFromFields(
      drafts.map((field) => ({ ...field, position: 0 }))
    ),
  /Duplicate/u
);
assert.throws(
  () =>
    spreadsheetBindingsFromFields(
      drafts.filter((field) => field.type !== "table")
    ),
  /table column/u
);
const irrelevantOptions = spreadsheetBindingSchema.parse({
  ...bindings,
  fields: bindings.fields.map((field) =>
    field.key === "quantity" ? { ...field, options: ["ignored"] } : field
  ),
});
assert.throws(
  () => spreadsheetDraftFieldData(irrelevantOptions),
  /only supported/u
);
process.stdout.write("shared field conversion passed\n");
