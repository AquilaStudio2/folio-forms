import { expect, test } from "bun:test";

import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { fixtureBindings } from "./fixture";

const errorCodes = (input: unknown): string[] => {
  const result = spreadsheetBindingSchema.safeParse(input);
  if (result.success) {
    throw new Error("Expected invalid spreadsheet configuration");
  }
  return result.error.issues.flatMap((issue) =>
    issue.code === "custom" && typeof issue.params?.folioCode === "string"
      ? [issue.params.folioCode]
      : []
  );
};

test("only actual duplicate tags receive the stable duplicate tag validation code", () => {
  const scalar = fixtureBindings();
  if (!scalar.fields[0] || !scalar.fields[1]) {
    throw new Error("Missing fixture fields");
  }
  scalar.fields[1].key = scalar.fields[0].key;
  expect(errorCodes(scalar)).toContain("duplicate_field_tag");
  const table = fixtureBindings();
  if (!table.table || !table.fields[0]) {
    throw new Error("Missing fixture table");
  }
  table.table.key = table.fields[0].key;
  expect(errorCodes(table)).toContain("duplicate_field_tag");
  const column = fixtureBindings();
  if (!column.table?.columns[0] || !column.table.columns[1]) {
    throw new Error("Missing fixture columns");
  }
  column.table.columns[1].key = column.table.columns[0].key;
  expect(errorCodes(column)).toContain("duplicate_field_tag");
});

test("duplicate identities, anchors, offsets and unrelated invalid fields are distinct from duplicate tags", () => {
  const identities = fixtureBindings();
  if (!identities.fields[0] || !identities.fields[1]) {
    throw new Error("Missing fixture fields");
  }
  identities.fields[1].id = identities.fields[0].id;
  const anchors = fixtureBindings();
  if (!anchors.fields[0] || !anchors.fields[1]) {
    throw new Error("Missing fixture fields");
  }
  anchors.fields[1].anchor = anchors.fields[0].anchor;
  const offsets = fixtureBindings();
  if (!offsets.table?.columns[0] || !offsets.table.columns[1]) {
    throw new Error("Missing fixture columns");
  }
  offsets.table.columns[1].offset = offsets.table.columns[0].offset;
  const invalid = fixtureBindings();
  if (!invalid.fields[0]) {
    throw new Error("Missing fixture field");
  }
  invalid.fields[0].key = "invalid tag";
  for (const input of [identities, anchors, offsets, invalid]) {
    expect(errorCodes(input)).not.toContain("duplicate_field_tag");
  }
});

test("a scalar and a table column may reuse the same tag within their different objects", () => {
  const bindings = fixtureBindings();
  if (!bindings.fields[0] || !bindings.table?.columns[0]) {
    throw new Error("Missing fixture fields");
  }
  bindings.fields[0].key = bindings.table.columns[0].key;
  expect(spreadsheetBindingSchema.safeParse(bindings).success).toBe(true);
});
