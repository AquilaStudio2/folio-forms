// oxlint-disable func-style sort-keys no-implicit-globals consistent-function-scoping complexity prefer-named-capture-group require-unicode-regexp avoid-new prefer-await-to-callbacks no-empty-function prefer-await-to-then prefer-destructuring logical-assignment-operators func-names prefer-arrow-callback no-loop-func no-use-before-define throw-new-error no-await-in-loop -- ONLYOFFICE commands are serialized into the editor sandbox.
import {
  spreadsheetColumnAnchor,
  spreadsheetTableColumnsAnchor,
} from "./spreadsheet-columns.js";

export function selectionPosition(address) {
  const match =
    /^\$?([A-Z]+)\$?([1-9]\d*)(?::\$?([A-Z]+)\$?([1-9]\d*))?$/i.exec(address);
  if (!match) {
    throw new Error("กรุณาเลือกช่วงเซลล์สี่เหลี่ยมเพียงช่วงเดียว");
  }
  let column = 0;
  for (const character of match[1].toUpperCase()) {
    column = column * 26 + character.codePointAt(0) - 64;
  }
  return { column: column - 1, row: Number(match[2]) - 1 };
}
export function tableSelection(address, headers = false) {
  const first = selectionPosition(address);
  const parts = address.replaceAll("$", "").split(":");
  const last = selectionPosition(parts[1] || parts[0]);
  const width = last.column - first.column + 1;
  if (
    width < 1 ||
    width > 256 ||
    last.row < first.row ||
    (headers && last.row === first.row)
  ) {
    throw new Error("เลือกตารางไม่เกิน 256 คอลัมน์ และอย่างน้อยหนึ่งแถวข้อมูลใต้หัวตาราง");
  }
  const firstColumn = parts[0].replaceAll(/[0-9]/g, "");
  const lastColumn = (parts[1] || parts[0]).replaceAll(/[0-9]/g, "");
  return {
    width,
    address: `${firstColumn}${first.row + (headers ? 2 : 1)}:${lastColumn}${last.row + 1}`,
    headerAddress: `${firstColumn}${first.row + 1}:${lastColumn}${first.row + 1}`,
  };
}
export function selectedBinding(selected, bindings) {
  const point = selectionPosition(selected.address);
  for (const [anchor, reference] of selected.anchors || []) {
    if (!reference) {
      continue;
    }
    const separator = reference.lastIndexOf("!");
    const sheet = reference
      .slice(0, separator)
      .replace(/^'/, "")
      .replace(/'$/, "")
      .replaceAll("''", "'");
    if (sheet !== selected.sheet) {
      continue;
    }
    const address = reference.slice(separator + 1).split(":");
    const first = selectionPosition(address[0]);
    const last = selectionPosition(address[1] || address[0]);
    if (
      point.column < first.column ||
      point.column > last.column ||
      point.row < first.row ||
      point.row > last.row
    ) {
      continue;
    }
    const field = bindings?.fields?.find((item) => item.anchor === anchor);
    if (field) {
      return ["field", field];
    }
    if (bindings?.table?.anchor === anchor) {
      if (
        selected.address.replaceAll("$", "") ===
        reference.slice(separator + 1).replaceAll("$", "")
      ) {
        return ["table", bindings.table];
      }
      const references = new Map(selected.anchors || []);
      const tracked = references.has(
        spreadsheetTableColumnsAnchor(bindings.table.id)
      );
      const column = bindings.table.columns.find((item) => {
        if (!tracked) {
          return item.offset === point.column - first.column;
        }
        const columnReference = references.get(
          spreadsheetColumnAnchor(item.id)
        );
        if (!columnReference) {
          return false;
        }
        const columnSeparator = columnReference.lastIndexOf("!");
        const position = selectionPosition(
          columnReference.slice(columnSeparator + 1).split(":")[0]
        );
        return position.column === point.column;
      });
      return column
        ? ["column", { ...column, offset: point.column - first.column }]
        : ["table", bindings.table];
    }
  }
  return null;
}
