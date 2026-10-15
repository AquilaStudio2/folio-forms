import { spreadsheetBindingSchema } from "../documents/spreadsheets/contract";
import type { SpreadsheetField } from "../documents/spreadsheets/contract";
import type { JsonRecord } from "../model-types";
import { maxResponseDataBytes } from "../responses/data";
import { isValidDateFieldValue } from "../responses/date-value";
import { handoffUnavailable } from "./input";

const scalarMatches = (field: SpreadsheetField, value: unknown): boolean => {
  if (field.computed || field.prefillPointer === null) {
    return false;
  }
  switch (field.type) {
    case "number": {
      return typeof value === "number" && Number.isFinite(value);
    }
    case "boolean": {
      return typeof value === "boolean";
    }
    case "date": {
      return typeof value === "string" && isValidDateFieldValue(value);
    }
    case "dropdown": {
      return typeof value === "string" && field.options.includes(value);
    }
    case "text": {
      return typeof value === "string" && value.length <= 10_000;
    }
    default: {
      return false;
    }
  }
};

/** Prefill maps scalar fields only; table rows always come from the workbook. */
export const validateSpreadsheetPrefillValues = (
  values: JsonRecord,
  contract: unknown
): void => {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    handoffUnavailable();
  }
  const { locations: _locations, ...bindings } = contract as Record<
    string,
    unknown
  >;
  const parsed = spreadsheetBindingSchema.safeParse(bindings);
  if (
    !parsed.success ||
    new TextEncoder().encode(JSON.stringify(values)).byteLength >
      maxResponseDataBytes
  ) {
    handoffUnavailable();
  }
  const fields = new Map(parsed.data.fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(values)) {
    const field = fields.get(key);
    if (!field || !scalarMatches(field, value)) {
      handoffUnavailable();
    }
  }
};
