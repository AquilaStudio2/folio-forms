// oxlint-disable func-style sort-keys no-implicit-globals consistent-function-scoping complexity prefer-named-capture-group require-unicode-regexp avoid-new prefer-await-to-callbacks no-empty-function prefer-await-to-then prefer-destructuring logical-assignment-operators func-names prefer-arrow-callback no-loop-func no-use-before-define throw-new-error no-await-in-loop -- ONLYOFFICE commands are serialized into the editor sandbox.

// These functions run in the editor sandbox and must remain self-contained.
export {
  spreadsheetCaptureValidationCommand,
  spreadsheetClearValidationCommand,
  spreadsheetRestoreValidationCommand,
} from "./spreadsheet-field-state.js";

export function spreadsheetSelectionCommand() {
  const sheet = Api.GetActiveSheet();
  const selection = sheet.GetSelection();
  const drawings = sheet.GetSelectedDrawings?.() || [];
  let drawing = null;
  if (drawings.length) {
    drawing = { count: drawings.length };
    if (drawings.length === 1) {
      const object = drawings[0];
      drawing.applicationId = object.GetApplicationId?.() || null;
      drawing.data = object.GetData?.() || null;
      const from = object.Drawing?.drawingBase?.from;
      drawing.from = from ? { column: from.col, row: from.row } : null;
      try {
        const data =
          typeof drawing.data === "string" && drawing.data.length <= 4096
            ? JSON.parse(drawing.data)
            : null;
        if (/^folio_[A-Za-z0-9_]+$/u.test(data?.bindingId)) {
          drawing.marker =
            Api.GetDefName(
              `_folio_upload_poc_${data.bindingId}`
            )?.GetRefersTo() || null;
        }
      } catch {
        drawing.marker = null;
      }
    }
  }
  return JSON.stringify({
    ...(drawing ? { drawing } : {}),
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
    if (
      !Number.isSafeInteger(input.offset) ||
      input.offset < 0 ||
      input.offset >= range.GetColumnsCount()
    ) {
      throw new Error("ตำแหน่งคอลัมน์ไม่ถูกต้อง");
    }
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
  const address = range
    .GetAddress(false, false, "xlA1", false)
    .split("!")
    .pop()
    .split(":")[0];
  const addressAt = (column, row) => {
    let result = "";
    for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) {
      result = String.fromCodePoint(65 + ((value - 1) % 26)) + result;
    }
    return result + row;
  };
  let listFormula;
  if (!input.computed && ["boolean", "dropdown"].includes(input.type)) {
    const options =
      input.type === "boolean" ? ["TRUE", "FALSE"] : input.options;
    if (
      !Array.isArray(options) ||
      !options.length ||
      options.length > 1_048_575 ||
      options.some(
        (option) =>
          typeof option !== "string" || !option.length || option.length > 32_767
      )
    ) {
      throw new Error("รายการตัวเลือกไม่ถูกต้องหรือยาวเกินขนาดเซลล์ Excel");
    }
    const needsRange =
      options.join(",").length > 253 ||
      options.some(
        (option) =>
          /[,;"\r\n]/.test(option) ||
          option.trim() !== option ||
          /^[=']/.test(option)
      );
    listFormula = options.join(",");
    if (needsRange) {
      const activeSheet = Api.GetActiveSheet();
      let helper;
      let protection;
      try {
        helper =
          Api.GetSheet("_folio_options") || Api.AddSheet("_folio_options");
        const model = helper.worksheet;
        // The pinned 9.4 Office API has no sheet-protection setter. Use its
        // history-aware model operation, checking support before changing rules.
        if (!model || typeof model.setProtectedSheet !== "function") {
          throw new Error("ตัวแก้ไขรุ่นนี้ไม่รองรับรายการตัวเลือกแบบยาว");
        }
        const names = model.workbook.getAllDefinedNames();
        const managedNames = new Set();
        let reused;
        for (const defined of names) {
          if (!/^_folio_options_draft_\d+(?:_\d+)?$/.test(defined.name)) {
            continue;
          }
          try {
            const stored = Api.GetDefName(defined.name).GetRefersToRange();
            if (
              stored.GetWorksheet().GetName() !== helper.GetName() ||
              stored.GetColumnsCount() !== 1 ||
              stored.GetRow() !== 2 ||
              helper.GetRange(addressAt(stored.GetCol(), 1)).GetValue() !==
                "folio draft options"
            ) {
              continue;
            }
            managedNames.add(defined.name.toLowerCase());
            if (stored.GetRowsCount() !== options.length) {
              continue;
            }
            const values = stored.GetValue();
            const flattened = Array.isArray(values) ? values.flat() : [values];
            const formulas = stored.GetFormula();
            const formulaValues = Array.isArray(formulas)
              ? formulas.flat()
              : [formulas];
            if (
              flattened.length === options.length &&
              flattened.every((option, index) => option === options[index]) &&
              formulaValues.every(
                (formula, index) => formula === flattened[index] || !formula
              )
            ) {
              reused = defined.name;
              break;
            }
          } catch {
            // A broken or manually changed helper name is not reusable.
          }
        }
        if (reused) {
          listFormula = `=${reused}`;
        } else {
          // Plugin commands receive Asc.scope only, with no SDK constructors.
          // The model accepts a plain protection record and constructs its own
          // native instance internally, preserving the sandbox boundary.
          protection = model.sheetProtection?.clone(model) || {
            algorithmName: null,
            hashValue: null,
            saltValue: null,
            spinCount: null,
            password: null,
            sheet: true,
            objects: true,
            scenarios: true,
            formatCells: true,
            formatColumns: true,
            formatRows: true,
            insertColumns: true,
            insertRows: true,
            insertHyperlinks: true,
            deleteColumns: true,
            deleteRows: true,
            selectLockedCells: false,
            sort: true,
            autoFilter: true,
            pivotTables: true,
            selectUnlockedCells: false,
          };
          const editable = { ...protection, sheet: false };
          model.setProtectedSheet(editable, true);
          const used = helper.GetUsedRange();
          let column = used.GetCol() + used.GetColumnsCount();
          const hasUnmanagedHelperReference = model.workbook
            .getAllFormulas()
            .some((formula) => {
              if (
                managedNames.has(
                  String(formula.parent?.name || "").toLowerCase()
                )
              ) {
                return false;
              }
              const text =
                typeof formula.assemble === "function"
                  ? formula.assemble(true)
                  : "";
              return /_folio_options(?:['"])?!|\b(?:INDIRECT|EVALUATE)\s*\(/i.test(
                text
              );
            });
          let helperHasFormula = false;
          model.forEachFormula(() => {
            helperHasFormula = true;
          });
          const helperHasCustomRules = Boolean(
            model.dataValidations?.elems?.length ||
            Object.keys(model.aConditionalFormattingRules || {}).length ||
            model.TableParts?.length ||
            model.Drawings?.length
          );
          if (
            !hasUnmanagedHelperReference &&
            !helperHasFormula &&
            !helperHasCustomRules
          ) {
            for (let available = 1; available < column; available += 1) {
              if (
                helper.GetRange(addressAt(available, 1)).GetValue() !==
                "folio draft options free"
              ) {
                continue;
              }
              const tail = helper
                .GetRange(
                  `${addressAt(available, 2)}:${addressAt(available, Math.max(2, used.GetRowsCount()))}`
                )
                .GetValue();
              const values = Array.isArray(tail) ? tail.flat() : [tail];
              const referenced = names.some((defined) => {
                try {
                  const named = Api.GetDefName(defined.name).GetRefersToRange();
                  return (
                    named.GetWorksheet().GetName() === helper.GetName() &&
                    named.GetCol() <= available &&
                    named.GetCol() + named.GetColumnsCount() > available
                  );
                } catch {
                  return String(defined.ref || "").includes(helper.GetName());
                }
              });
              if (!referenced && values.every((value) => value === "")) {
                column = available;
                break;
              }
            }
          }
          // A new sheet's nominal used range is the empty A1 cell.
          if (
            column === 2 &&
            used.GetRowsCount() === 1 &&
            helper.GetRange("A1").GetValue() === ""
          ) {
            column = 1;
          }
          if (column > 16_384) {
            throw new Error("พื้นที่เก็บรายการตัวเลือกเต็ม ไม่สามารถเพิ่มรายการชุดใหม่ได้");
          }
          let optionName = `_folio_options_draft_${column}`;
          for (let sequence = 1; ; sequence += 1) {
            let existing;
            try {
              existing = Api.GetDefName(optionName);
            } catch {
              existing = null;
            }
            if (!existing) {
              break;
            }
            optionName = `_folio_options_draft_${column}_${sequence}`;
          }
          const optionRange = helper.GetRange(
            `${addressAt(column, 2)}:${addressAt(column, options.length + 1)}`
          );
          if (
            optionRange.SetNumberFormat("@") !== true ||
            typeof optionRange.range?.setLocked !== "function"
          ) {
            throw new Error("สร้างช่วงเก็บรายการตัวเลือกไม่สำเร็จ");
          }
          optionRange.range.setLocked(true);
          // Text format prevents ONLYOFFICE from interpreting formulas, dates or
          // numeric-looking options and preserves apostrophes and whitespace.
          if (
            optionRange.SetValue(options.map((option) => [option])) !== true ||
            helper
              .GetRange(addressAt(column, 1))
              .SetValue("folio draft options") !== true
          ) {
            throw new Error("บันทึกรายการตัวเลือกไม่สำเร็จ");
          }
          const reference = `'${helper.GetName().replaceAll("'", "''")}'!$${addressAt(column, 2).replace(/(\d+)$/, "$$$1")}:$${addressAt(column, options.length + 1).replace(/(\d+)$/, "$$$1")}`;
          if (Api.AddDefName(optionName, reference, true) !== true) {
            throw new Error("สร้างชื่อรายการตัวเลือกไม่สำเร็จ");
          }
          listFormula = `=${optionName}`;
        }
      } finally {
        try {
          if (helper) {
            if (protection) {
              protection.sheet = true;
              protection.objects = true;
              protection.scenarios = true;
              helper.worksheet.setProtectedSheet(protection, true);
            }
            helper.SetVisible(false);
          }
        } finally {
          activeSheet.SetActive();
        }
      }
    }
  } else if (
    !input.computed &&
    !["text", "number", "date", "picture"].includes(input.type)
  ) {
    throw new Error("ชนิดช่องกรอกไม่ถูกต้อง");
  }
  const validation = range.GetValidation();
  const previous = (validation.validations || [])
    .filter((rule) => rule.ranges?.length)
    .map((rule) => rule.clone(true));
  const formats = [];
  for (
    let row = range.GetRow();
    row < range.GetRow() + range.GetRowsCount();
    row += 1
  ) {
    for (
      let column = range.GetCol();
      column < range.GetCol() + range.GetColumnsCount();
      column += 1
    ) {
      const cell = range.GetWorksheet().GetRange(addressAt(column, row));
      formats.push({
        address: addressAt(column, row),
        format: cell.GetNumberFormat(),
      });
    }
  }
  try {
    validation.Delete();
    let added;
    if (!input.computed && input.type === "number") {
      added = validation.Add(
        "xlValidateCustom",
        "xlValidAlertStop",
        "xlBetween",
        `=ISNUMBER(${address})`
      );
    } else if (!input.computed && input.type === "date") {
      added = validation.Add(
        "xlValidateDate",
        "xlValidAlertStop",
        "xlBetween",
        "0",
        "2958465"
      );
    } else if (!input.computed && listFormula !== undefined) {
      added = validation.Add(
        "xlValidateList",
        "xlValidAlertStop",
        "xlBetween",
        listFormula
      );
    }
    if (
      !input.computed &&
      !["text", "picture"].includes(input.type) &&
      !added
    ) {
      throw new Error("สร้างกฎช่องกรอกไม่สำเร็จ");
    }
    if (added) {
      if (["dropdown", "boolean"].includes(input.type)) {
        validation.SetInCellDropdown(true);
      }
      validation.SetIgnoreBlank(true);
      validation.SetShowError(true);
      validation.SetErrorMessage("กรุณากรอกข้อมูลให้ตรงกับชนิดของช่อง");
    }
    if (!input.computed && input.type === "date") {
      if (range.SetNumberFormat("dd/mm/yyyy") !== true) {
        throw new Error("ตั้งรูปแบบวันที่ไม่สำเร็จ");
      }
    } else {
      for (const item of formats) {
        if (
          item.format.toLowerCase() === "dd/mm/yyyy" &&
          range
            .GetWorksheet()
            .GetRange(item.address)
            .SetNumberFormat("General") !== true
        ) {
          throw new Error("ล้างรูปแบบวันที่เดิมไม่สำเร็จ");
        }
      }
    }
    return true;
  } catch (error) {
    // Native creation can return null instead of throwing. Restore the previous
    // rule synchronously, before the metadata request can be attempted.
    validation.Delete();
    const model = range.GetWorksheet().worksheet;
    for (const rule of previous) {
      model.deleteDataValidationById(rule.Id);
      rule._init(model);
      model.addDataValidation(rule, true);
    }
    for (const item of formats) {
      range.GetWorksheet().GetRange(item.address).SetNumberFormat(item.format);
    }
    throw error;
  }
}
export function spreadsheetHeadersCommand() {
  const input = Asc.scope.folioSpreadsheetSelection;
  return JSON.stringify(
    Api.GetSheet(input.sheet).GetRange(input.address).GetValue()
  );
}
