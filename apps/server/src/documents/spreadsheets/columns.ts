import type { SpreadsheetBindings, SpreadsheetRange } from "./contract";

export const spreadsheetColumnAnchor = (id: string): string =>
  `folio_column_${id}`;

export const spreadsheetTableColumnsAnchor = (id: string): string =>
  `folio_columns_${id}`;

export const spreadsheetBindingAnchors = (
  bindings: SpreadsheetBindings
): string[] => [
  ...bindings.fields.map((field) => field.anchor),
  ...(bindings.table
    ? [
        bindings.table.anchor,
        ...(bindings.table.columns.length
          ? [spreadsheetTableColumnsAnchor(bindings.table.id)]
          : []),
        ...bindings.table.columns.map((column) =>
          spreadsheetColumnAnchor(column.id)
        ),
      ]
    : []),
];

/** Resolve column identity from the saved workbook, never a client ordinal. */
export const reconcileSpreadsheetColumns = (
  bindings: SpreadsheetBindings,
  names: ReadonlyMap<string, SpreadsheetRange>
): SpreadsheetBindings => {
  const { table } = bindings;
  if (!table || table.columns.length === 0) {
    return bindings;
  }
  const body = names.get(table.anchor);
  if (!body) {
    // Drafts may retain unfinished mappings. Contract resolution still refuses
    // a missing body before publication or extraction.
    return bindings;
  }
  const marker = names.get(spreadsheetTableColumnsAnchor(table.id));
  const columns = table.columns.map((column) =>
    names.get(spreadsheetColumnAnchor(column.id))
  );
  if (!marker && columns.every((column) => !column)) {
    // Legacy workbooks did not track columns independently. Do not guess after
    // a structural change: there is no evidence identifying the inserted slot.
    const expectedWidth =
      Math.max(-1, ...table.columns.map((column) => column.offset)) + 1;
    if (expectedWidth !== body.lastColumn - body.firstColumn + 1) {
      throw new Error(
        "โครงสร้างคอลัมน์ตารางเดิมเปลี่ยนไป กรุณาย้อนการแทรกหรือลบคอลัมน์ แล้วเปิดแผงตั้งค่าใหม่ หรือสร้างตารางรายการใหม่"
      );
    }
    return bindings;
  }
  if (!marker || columns.some((column) => !column)) {
    throw new Error(
      "ตำแหน่งอ้างอิงคอลัมน์หายไป กรุณาย้อนการลบคอลัมน์ หรือลบคอลัมน์นั้นจากการตั้งค่าก่อนบันทึก"
    );
  }
  const occupied = new Set<number>();
  return {
    ...bindings,
    table: {
      ...table,
      columns: table.columns.map((column, index) => {
        const range = columns[index] as SpreadsheetRange;
        const offset = range.firstColumn - body.firstColumn;
        if (
          range.sheet !== body.sheet ||
          range.firstColumn !== range.lastColumn ||
          offset < 0 ||
          range.lastColumn > body.lastColumn ||
          range.firstRow > body.lastRow ||
          range.lastRow < body.firstRow ||
          occupied.has(offset)
        ) {
          throw new Error(
            `ตำแหน่งคอลัมน์ ${column.label} ถูกลบ ย้ายออกนอกตาราง หรือซ้ำกับคอลัมน์อื่น กรุณาย้อนการเปลี่ยนแปลงหรือลบคอลัมน์นี้จากการตั้งค่า`
          );
        }
        occupied.add(offset);
        return { ...column, offset };
      }),
    },
  };
};
