// oxlint-disable func-style sort-keys no-implicit-globals consistent-function-scoping complexity prefer-named-capture-group require-unicode-regexp avoid-new prefer-await-to-callbacks no-empty-function prefer-await-to-then prefer-destructuring logical-assignment-operators func-names prefer-arrow-callback no-loop-func no-use-before-define throw-new-error no-await-in-loop -- ONLYOFFICE commands are serialized into the editor sandbox.

// These functions run in the editor sandbox and must remain self-contained.
export function spreadsheetSelectionCommand() {
  const sheet = Api.GetActiveSheet();
  const selection = sheet.GetSelection();
  return JSON.stringify({
    address: selection.GetAddress(true, true, "xlA1", false),
    sheet: sheet.GetName(),
    anchors: (Asc.scope.folioSpreadsheetAnchors || []).map((anchor) => {
      // ONLYOFFICE throws for missing names instead of returning null. Draft
      // metadata can outlive a workbook edit, so isolate each lookup.
      try {
        const name = Api.GetDefName(anchor);
        return [anchor, name ? name.GetRefersTo() : null];
      } catch {
        return [anchor, null];
      }
    }),
  });
}
export function spreadsheetAnchorCommand() {
  const input = Asc.scope.folioSpreadsheetAnchor;
  return Api.AddDefName(input.anchor, input.reference, false);
}
export function spreadsheetTableBordersCommand() {
  const input = Asc.scope.folioSpreadsheetTableBorders;
  const range = Api.GetSheet(input.sheet).GetRange(input.address);
  const color = Api.CreateColorFromRGB(0, 0, 0);
  const borders = ["Top", "Bottom", "Left", "Right"];
  if (range.GetRowsCount() > 1) {
    borders.push("InsideHorizontal");
  }
  if (range.GetColumnsCount() > 1) {
    borders.push("InsideVertical");
  }
  for (const border of borders) {
    if (range.SetBorders(border, "Thin", color) !== true) {
      throw new Error("ใส่เส้นตารางไม่สำเร็จ กรุณาใช้เมนูเส้นขอบของ ONLYOFFICE");
    }
  }
  return true;
}
export function spreadsheetTableRowCountCommand() {
  const name = Api.GetDefName(Asc.scope.folioTableAnchor);
  return name ? name.GetRefersToRange().GetRowsCount() : null;
}
export function spreadsheetTableSelectedRowCommand() {
  const name = Api.GetDefName(Asc.scope.folioTableAnchor);
  const body = name ? name.GetRefersToRange() : null;
  const sheet = Api.GetActiveSheet();
  if (!body || sheet.GetName() !== body.GetWorksheet().GetName()) {
    return null;
  }
  const selection = sheet.GetSelection();
  const index = selection.GetRow() - body.GetRow();
  const column = selection.GetCol() - body.GetCol();
  return index >= 0 &&
    index < body.GetRowsCount() &&
    column >= 0 &&
    column < body.GetColumnsCount()
    ? index
    : null;
}
export function spreadsheetValidationCommand() {
  const input = Asc.scope.folioSpreadsheetValidation;
  const name = Api.GetDefName(input.anchor);
  if (!name) {
    throw new Error("ไม่พบตำแหน่งช่องกรอก");
  }
  let range = name.GetRefersToRange();
  if (!range) {
    throw new Error("ตำแหน่งช่องกรอกไม่ใช่ช่วงเซลล์");
  }
  if (input.offset !== undefined) {
    const firstRow = range.GetRow();
    const lastRow = firstRow + range.GetRowsCount() - 1;
    const column = range.GetCol() + input.offset;
    let columnName = "";
    for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) {
      columnName = String.fromCodePoint(65 + ((value - 1) % 26)) + columnName;
    }
    range = range
      .GetWorksheet()
      .GetRange(`${columnName}${firstRow}:${columnName}${lastRow}`);
  }
  if (typeof range.GetValidation !== "function") {
    throw new TypeError("ตัวแก้ไขรุ่นนี้ยังไม่รองรับกฎชนิดข้อมูล Excel");
  }
  if (
    typeof range.GetFormula === "function" &&
    typeof range.GetValue === "function"
  ) {
    const formulas = range.GetFormula();
    const contents = range.GetValue();
    const formulaValues = Array.isArray(formulas)
      ? formulas.flat()
      : [formulas];
    const cellValues = Array.isArray(contents) ? contents.flat() : [contents];
    if (
      formulaValues.some(
        (formula, index) =>
          typeof formula === "string" &&
          formula.startsWith("=") &&
          formula !== String(cellValues[index])
      )
    ) {
      throw new Error("ช่องกรอกต้องรับข้อมูลที่กรอกเอง กรุณาลบสูตรในช่วงที่เลือกก่อน");
    }
  }
  const validation = range.GetValidation();
  validation.Delete();
  if (input.computed || input.type === "text") {
    return true;
  }
  const address = range
    .GetAddress(false, false, "xlA1", false)
    .split("!")
    .pop()
    .split(":")[0];
  if (input.type === "number") {
    validation.Add(
      "xlValidateCustom",
      "xlValidAlertStop",
      "xlBetween",
      `ISNUMBER(${address})`
    );
  } else if (input.type === "date") {
    validation.Add(
      "xlValidateDate",
      "xlValidAlertStop",
      "xlBetween",
      "0",
      "2958465"
    );
    range.SetNumberFormat("dd/mm/yyyy");
  } else {
    const options =
      input.type === "boolean" ? ["TRUE", "FALSE"] : input.options;
    const hasUnsafeCharacter = (option) =>
      [...option].some(
        (character) =>
          /[,"\r\n]/.test(character) || character.codePointAt(0) > 127
      );
    if (options.some(hasUnsafeCharacter) || options.join(",").length > 253) {
      // The literal list formula mangles non-ASCII text (e.g. Thai) and
      // breaks on commas/quotes/newlines. The worker installs an
      // authoritative helper-range dropdown when saved, so skip here.
      return true;
    }
    validation.Add(
      "xlValidateList",
      "xlValidAlertStop",
      "xlBetween",
      `"${options.join(",")}"`
    );
    validation.SetInCellDropdown(true);
  }
  validation.SetIgnoreBlank(true);
  validation.SetShowError(true);
  validation.SetErrorMessage("กรุณากรอกข้อมูลให้ตรงกับชนิดของช่อง");
  return true;
}
export function spreadsheetHeadersCommand() {
  const input = Asc.scope.folioSpreadsheetSelection;
  return JSON.stringify(
    Api.GetSheet(input.sheet).GetRange(input.address).GetValue()
  );
}
