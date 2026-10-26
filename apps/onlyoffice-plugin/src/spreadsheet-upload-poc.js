import { spreadsheetColumnAnchor } from "./spreadsheet-columns.js";
import { selectionPosition } from "./spreadsheet-selection.js";

const bounds = (address) => {
  const [first, last = first] = address.split(":");
  const from = selectionPosition(first);
  const to = selectionPosition(last);
  if (
    from.column > to.column ||
    from.row > to.row ||
    to.column > 16_383 ||
    to.row > 1_048_575
  ) {
    throw new Error("กรุณาเลือกเซลล์ภายในขอบเขต Excel");
  }
  return { from, to };
};
const referenceBounds = (reference, sheet) => {
  if (!reference) {
    throw new Error("ตำแหน่งช่องเดิมไม่ครบ กรุณาผูกตำแหน่งให้ถูกต้องก่อนวางปุ่ม");
  }
  const separator = reference.lastIndexOf("!");
  const name = reference
    .slice(0, separator)
    .replace(/^'/u, "")
    .replace(/'$/u, "")
    .replaceAll("''", "'");
  return name === sheet ? bounds(reference.slice(separator + 1)) : null;
};
const overlaps = (left, right) =>
  right &&
  left.from.column <= right.to.column &&
  left.to.column >= right.from.column &&
  left.from.row <= right.to.row &&
  left.to.row >= right.from.row;
const contains = (outer, inner) =>
  outer.from.column <= inner.from.column &&
  outer.to.column >= inner.to.column &&
  outer.from.row <= inner.from.row &&
  outer.to.row >= inner.to.row;

export const missingUploadPocBindings = (selection, bindings) => {
  const references = new Map(selection.anchors || []);
  return [...(bindings.fields || []), bindings.table]
    .filter(Boolean)
    .filter((entry) => !references.get(entry.anchor))
    .map((entry) => `${entry.label || entry.key} (${entry.key})`);
};

export const existingUploadPocEntry = (selection, bindings) => {
  const selected = bounds(selection.address);
  const references = new Map(selection.anchors || []);
  const missing = missingUploadPocBindings(selection, bindings);
  if (missing.length) {
    throw new Error(
      `ไม่พบตำแหน่งช่องใน Excel: ${missing.join(", ")} เลือกช่วงเซลล์ที่ต้องการ แล้วเลือกช่องเดิมจาก “ช่องที่บันทึกแล้ว” และกด “ผูกตำแหน่งใหม่กับช่วงที่เลือก” ก่อนวางปุ่ม หรือลบเฉพาะช่องที่ไม่ใช้แล้ว`
    );
  }
  let match = null;
  for (const field of bindings.fields || []) {
    const range = referenceBounds(
      references.get(field.anchor),
      selection.sheet
    );
    if (!overlaps(selected, range)) {
      continue;
    }
    if (!contains(range, selected) || match) {
      throw new Error("ช่วงที่เลือกทับซ้อนช่องเดิม กรุณาเลือกเซลล์ของช่องเดียว");
    }
    match = ["field", field];
  }
  const { table } = bindings;
  if (table) {
    const body = referenceBounds(references.get(table.anchor), selection.sheet);
    if (overlaps(selected, body)) {
      if (
        match ||
        !contains(body, selected) ||
        selected.from.column !== selected.to.column
      ) {
        throw new Error("เลือกเซลล์ในคอลัมน์เดียวของตารางเพื่อวางปุ่มแนบไฟล์");
      }
      const column = table.columns.find((field) => {
        const tracked = references.get(spreadsheetColumnAnchor(field.id));
        return (
          selected.from.column ===
          (tracked
            ? referenceBounds(tracked, selection.sheet)?.from.column
            : body.from.column + field.offset)
        );
      });
      if (!column) {
        throw new Error("กรุณาเลือกคอลัมน์ที่ตั้งค่าไว้ในตาราง");
      }
      match = ["column", column];
    }
  }
  return match;
};

export const automaticUploadPocField = (bindings, bindingId) => {
  const keys = new Set([
    ...(bindings.fields || []).map((field) => field.key),
    bindings.table?.key,
  ]);
  const labels = new Set(
    [
      ...(bindings.fields || []),
      ...(bindings.table?.columns || []),
      bindings.table,
    ]
      .filter(Boolean)
      .map((field) => field.label)
  );
  let index = 1;
  while (keys.has(`attachment_${index}`) || labels.has(`ไฟล์แนบ ${index}`)) {
    index += 1;
  }
  return {
    anchor: bindingId,
    computed: false,
    id: bindingId,
    key: `attachment_${index}`,
    label: `ไฟล์แนบ ${index}`,
    options: [],
    placeholder: null,
    prefillPointer: null,
    prefillPolicy: "editable",
    required: false,
    type: "text",
  };
};

// ONLYOFFICE serializes this function without module scope.
export const spreadsheetUploadPocSelectionCommand = () => {
  try {
    const input = Asc.scope.folioUploadPocSelection;
    const sheet = Api.GetSheet(input.sheet);
    let range = sheet.GetRange(input.address);
    if (input.restore) {
      range.Select();
      return JSON.stringify({ ok: true });
    }
    const first = sheet.GetRangeByNumber(
      range.GetRow() - 1,
      range.GetCol() - 1
    );
    const merged = first.MergeArea || first;
    if (!input.column) {
      if (range.GetRowsCount() === 1 && range.GetColumnsCount() === 1) {
        range = merged;
      } else if (
        range.GetRow() !== merged.GetRow() ||
        range.GetCol() !== merged.GetCol() ||
        range.GetRowsCount() !== merged.GetRowsCount() ||
        range.GetColumnsCount() !== merged.GetColumnsCount()
      ) {
        throw new Error("เลือกหนึ่งเซลล์หรือเซลล์ที่ผสานครบทั้งช่วงเพื่อวางปุ่มแนบไฟล์");
      }
    }
    // oxlint-disable-next-line consistent-function-scoping -- Serialized Office commands cannot capture module helpers.
    const values = (value) =>
      Array.isArray(value) ? value.flat(Infinity) : [value];
    if (
      values(range.GetFormula()).some(
        (value) => value !== null && value !== undefined && value !== ""
      )
    ) {
      throw new Error("วางปุ่มแนบไฟล์ทับเซลล์สูตรไม่ได้");
    }
    if (
      input.requireBlank &&
      values(range.GetValue()).some(
        (value) => value !== null && value !== undefined && value !== ""
      )
    ) {
      throw new Error("เลือกเซลล์ว่างเพื่อสร้างช่องแนบไฟล์อัตโนมัติ");
    }
    return JSON.stringify({
      address: range.GetAddress(true, true, "xlA1", false).split("!").at(-1),
      ok: true,
    });
  } catch (error) {
    return JSON.stringify({ error: error.message, ok: false });
  }
};

export const uploadPocCleanupNames = (change, bindings) => {
  if (change.action === "delete") {
    const ids =
      change.kind === "table"
        ? (bindings.table?.columns ?? []).map((column) => column.id)
        : [change.id];
    return ids.map((id) => `_folio_upload_poc_${id}`);
  }
  return change.kind !== "table" &&
    (change.value.type !== "text" || change.value.computed)
    ? [`_folio_upload_poc_${change.value.id}`]
    : [];
};

// ONLYOFFICE serializes this function without module scope.
export const spreadsheetUploadPocCleanupCommand = () => {
  for (const name of Asc.scope.folioSpreadsheetUploadPocCleanup || []) {
    let defined;
    try {
      defined = Api.GetDefName(name);
    } catch {
      defined = null;
    }
    if (defined && defined.Delete() !== true) {
      throw new Error("ล้างตำแหน่งปุ่ม POC ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  }
  return true;
};

/** Display-only POC metadata; this never creates a response field or answer. */
export const selectedUploadPocTarget = (selection, bindings) => {
  const entry = existingUploadPocEntry(selection, bindings);
  if (!entry || !["field", "column"].includes(entry[0])) {
    throw new Error("เลือกเซลล์ของช่องข้อความหรือคอลัมน์ข้อความที่ตั้งค่าไว้ก่อนวางปุ่ม POC");
  }
  const [kind, field] = entry;
  if (field.type !== "text" || field.computed) {
    throw new Error(
      "ปุ่ม POC ใช้ได้กับช่องข้อความที่กรอกเองเท่านั้น กรุณาเลือกช่องข้อความที่ตั้งค่าไว้"
    );
  }
  return {
    anchor:
      kind === "column" ? spreadsheetColumnAnchor(field.id) : field.anchor,
    bindingId: field.id,
    ...(kind === "column"
      ? { bodyAnchor: bindings.table.anchor, columnOffset: field.offset }
      : {}),
    kind,
    sheet: selection.sheet,
    tag: kind === "column" ? `${bindings.table.key}.${field.key}` : field.key,
  };
};

/** Resolve a selected native POC object, never the stale active cell underneath it. */
// oxlint-disable-next-line complexity -- Validate native object identity, trusted binding, row, and physical anchors together before exposing edit/delete.
export const selectedUploadPocBinding = (selection, bindings, guid) => {
  const { drawing } = selection;
  if (!drawing) {
    return null;
  }
  const unsupported = "เลือกปุ่มแนบไฟล์ POC เพียงปุ่มเดียว หรือคลิกเซลล์เพื่อแก้ไขช่องกรอก";
  if (
    drawing.count !== 1 ||
    drawing.applicationId !== guid ||
    typeof drawing.data !== "string" ||
    drawing.data.length > 4096
  ) {
    throw new Error(unsupported);
  }
  const data = JSON.parse(drawing.data);
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.kind !== "folio-upload-poc" ||
    data.version !== 1 ||
    !/^folio_[A-Za-z0-9_]+$/u.test(data.bindingId) ||
    Object.keys(data).some(
      (key) =>
        !["bindingId", "kind", "rowIndex", "tag", "version"].includes(key)
    )
  ) {
    throw new Error(unsupported);
  }
  const field = bindings.fields.find((item) => item.id === data.bindingId);
  const column =
    !field &&
    bindings.table?.columns.find((item) => item.id === data.bindingId);
  const item = field || column;
  if (
    !item ||
    item.type !== "text" ||
    item.computed ||
    data.tag !== (field ? item.key : `${bindings.table.key}.${item.key}`) ||
    (field
      ? data.rowIndex !== null && data.rowIndex !== undefined
      : !Number.isSafeInteger(data.rowIndex) || data.rowIndex < 0)
  ) {
    throw new Error("ปุ่มที่เลือกไม่ตรงกับช่องกรอกปัจจุบัน กรุณาบันทึกต้นแบบและเปิดใหม่");
  }
  const references = new Map(selection.anchors || []);
  const body = referenceBounds(
    references.get(field ? item.anchor : bindings.table.anchor),
    selection.sheet
  );
  const tracked = column
    ? referenceBounds(
        references.get(spreadsheetColumnAnchor(item.id)),
        selection.sheet
      )
    : body;
  const marker = referenceBounds(drawing.marker, selection.sheet);
  const row = body?.from.row + (column ? data.rowIndex : 0);
  const col = tracked?.from.column;
  if (
    !body ||
    !tracked ||
    !marker ||
    !drawing.from ||
    row > body.to.row ||
    drawing.from.row !== row ||
    drawing.from.column !== col ||
    marker.from.column !== col ||
    row < marker.from.row ||
    row > marker.to.row
  ) {
    throw new Error("ตำแหน่งปุ่มที่เลือกไม่ตรงกับช่องกรอก กรุณาบันทึกต้นแบบและเปิดใหม่");
  }
  let letters = "";
  for (let index = col + 1; index > 0; index = Math.floor((index - 1) / 26)) {
    letters = String.fromCodePoint(65 + ((index - 1) % 26)) + letters;
  }
  return {
    address: `${letters}${row + 1}`,
    entry: [field ? "field" : "column", item],
  };
};

// ONLYOFFICE serializes this function without module scope.
export const spreadsheetUploadPocHasMarkerCommand = () =>
  (Asc.scope.folioSpreadsheetUploadPocMarkerNames || []).some((name) => {
    try {
      return Boolean(Api.GetDefName(name));
    } catch {
      return false;
    }
  });
