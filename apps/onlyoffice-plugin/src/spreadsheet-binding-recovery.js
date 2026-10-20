// oxlint-disable unicorn/prefer-structured-clone -- Snapshots intentionally use the same JSON representation as the binding API.
const cloneValue = (value) => JSON.parse(JSON.stringify(value));
const parsedNativeState = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;
const fieldValue = (field, scalar) => ({
  computed: field.computed ?? false,
  id: field.id,
  key: field.key,
  label: field.label,
  options: field.options || [],
  placeholder: field.placeholder ?? null,
  required: field.required ?? false,
  type: field.type,
  ...(scalar
    ? {
        anchor: field.anchor,
        prefillPointer: field.prefillPointer ?? null,
        prefillPolicy: field.prefillPolicy || "editable",
      }
    : { offset: field.offset }),
});

const normalizedBindings = (bindings) => ({
  fields: bindings.fields.map((field) => fieldValue(field, true)),
  table: bindings.table
    ? {
        anchor: bindings.table.anchor,
        columns: bindings.table.columns.map((column) =>
          fieldValue(column, false)
        ),
        id: bindings.table.id,
        key: bindings.table.key,
        label: bindings.table.label,
      }
    : null,
  version: bindings.version,
});

export const sameSpreadsheetBindings = (left, right) =>
  JSON.stringify(normalizedBindings(left)) ===
  JSON.stringify(normalizedBindings(right));

export const spreadsheetBindingAttempt = ({
  bindings,
  change,
  columnOffsets,
  documentKey,
  revision,
}) => {
  const previous = cloneValue(bindings);
  const expected = cloneValue(bindings);
  if (columnOffsets && expected.table) {
    for (const column of expected.table.columns) {
      const [, offset] = columnOffsets.find(([id]) => id === column.id);
      column.offset = offset;
    }
  }
  if (change.kind === "table") {
    expected.table = change.action === "delete" ? null : change.value;
  } else {
    const property =
      change.kind === "field" ? expected.fields : expected.table.columns;
    const id = change.id || change.value.id;
    const index = property.findIndex((item) => item.id === id);
    if (change.action === "delete") {
      if (index !== -1) {
        property.splice(index, 1);
      }
    } else if (index === -1) {
      property.push(change.value);
    } else {
      property.splice(index, 1, change.value);
    }
  }
  return {
    change,
    documentKey,
    enforceColumnOffsets:
      Boolean(columnOffsets) ||
      (change.kind === "table" && change.action === "upsert"),
    expected: cloneValue(expected),
    previous,
    revision,
  };
};

export const spreadsheetBindingOutcome = (attempt, result) => {
  if (
    typeof result?.documentKey !== "string" ||
    !Number.isSafeInteger(result?.revision) ||
    !Array.isArray(result?.bindings?.fields)
  ) {
    return "unverified";
  }
  if (result.documentKey !== attempt.documentKey) {
    return "stale";
  }
  try {
    if (
      result.revision === attempt.revision + 1 &&
      sameSpreadsheetBindings(attempt.expected, result.bindings)
    ) {
      return "committed";
    }
    const fenced =
      result.recovery?.settled === true &&
      result.recovery.baseRevision === attempt.revision;
    if (
      (result.revision === attempt.revision ||
        (result.revision === attempt.revision + 1 && fenced)) &&
      sameSpreadsheetBindings(attempt.previous, result.bindings)
    ) {
      return "unchanged";
    }
  } catch {
    return "unverified";
  }
  return "conflict";
};

export const spreadsheetBindingNeedsFence = (attempt, result) => {
  if (
    !attempt.requiresFence ||
    result?.documentKey !== attempt.documentKey ||
    ![attempt.revision, attempt.revision + 1].includes(result.revision)
  ) {
    return false;
  }
  try {
    return sameSpreadsheetBindings(attempt.previous, result.bindings);
  } catch {
    return false;
  }
};

export const sameSpreadsheetNativeState = (left, right) =>
  JSON.stringify(parsedNativeState(left)) ===
  JSON.stringify(parsedNativeState(right));
