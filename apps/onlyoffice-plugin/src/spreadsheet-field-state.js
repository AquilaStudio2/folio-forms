// oxlint-disable func-style sort-keys no-implicit-globals consistent-function-scoping complexity prefer-named-capture-group require-unicode-regexp avoid-new prefer-await-to-callbacks no-empty-function prefer-await-to-then prefer-destructuring logical-assignment-operators func-names prefer-arrow-callback no-loop-func no-use-before-define throw-new-error no-await-in-loop -- ONLYOFFICE serializes each command into its sandbox.

// A metadata write and an editor mutation form one operation. Keep snapshots as
// plain JSON, including raw formulas: the public formula getter translates them
// relative to the *current selection*, which need not be the field being edited.
export function spreadsheetCaptureValidationCommand() {
  const input = Asc.scope.folioSpreadsheetValidation;
  const lookup = (anchor) => {
    try {
      return Api.GetDefName(anchor);
    } catch {
      return null;
    }
  };
  const names = [input.anchor, ...(input.extraAnchorNames || [])].map(
    (anchor) => ({ anchor, reference: lookup(anchor)?.GetRefersTo() ?? null })
  );
  const name = lookup(input.anchor);
  let range;
  try {
    range = name?.GetRefersToRange();
    // A broken name can return an ApiRange whose native range is absent.
    range?.GetRowsCount();
  } catch {
    range = null;
  }
  if (!range && input.sheet && input.address) {
    range = Api.GetSheet(input.sheet).GetRange(input.address);
  }
  if (!range) {
    return JSON.stringify({ names, range: null, rules: [], formats: [] });
  }
  const addressAt = (column, row) => {
    let result = "";
    for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) {
      result = String.fromCodePoint(65 + ((value - 1) % 26)) + result;
    }
    return result + row;
  };
  if (input.offset !== undefined) {
    if (
      !Number.isSafeInteger(input.offset) ||
      input.offset < 0 ||
      input.offset >= range.GetColumnsCount()
    ) {
      throw new Error("ตำแหน่งคอลัมน์ไม่ถูกต้อง");
    }
    range = range
      .GetWorksheet()
      .GetRange(
        `${addressAt(range.GetCol() + input.offset, range.GetRow())}:${addressAt(range.GetCol() + input.offset, range.GetRow() + range.GetRowsCount() - 1)}`
      );
  }
  const sheet = range.GetWorksheet();
  const bounds = {
    r1: range.GetRow() - 1,
    c1: range.GetCol() - 1,
    r2: range.GetRow() + range.GetRowsCount() - 2,
    c2: range.GetCol() + range.GetColumnsCount() - 2,
  };
  const rules = [];
  const validations = range.GetValidation().validations;
  if (!Array.isArray(validations)) {
    throw new TypeError("ตัวแก้ไขรุ่นนี้ไม่รองรับการสำรองกฎช่องกรอก");
  }
  for (const rule of validations) {
    if (!rule.ranges?.length) {
      continue;
    }
    const originRow = Math.min(...rule.ranges.map((item) => item.r1));
    const originColumn = Math.min(...rule.ranges.map((item) => item.c1));
    for (const original of rule.ranges) {
      const intersection = {
        r1: Math.max(bounds.r1, original.r1),
        c1: Math.max(bounds.c1, original.c1),
        r2: Math.min(bounds.r2, original.r2),
        c2: Math.min(bounds.c2, original.c2),
      };
      if (
        intersection.r1 > intersection.r2 ||
        intersection.c1 > intersection.c2
      ) {
        continue;
      }
      const saved = { bounds: intersection };
      for (const key of [
        "allowBlank",
        "showDropDown",
        "showErrorMessage",
        "showInputMessage",
        "type",
        "errorStyle",
        "imeMode",
        "operator",
        "error",
        "errorTitle",
        "prompt",
        "promptTitle",
      ]) {
        saved[key] = rule[key];
      }
      for (const key of ["formula1", "formula2"]) {
        const formula = rule[key]?.clone(true);
        if (formula) {
          formula.setOffset({
            row: intersection.r1 - originRow,
            col: intersection.c1 - originColumn,
          });
        }
        saved[key] = formula?.text ?? null;
      }
      rules.push(saved);
    }
  }
  const formats = [];
  for (let row = bounds.r1 + 1; row <= bounds.r2 + 1; row += 1) {
    let run;
    for (let column = bounds.c1 + 1; column <= bounds.c2 + 1; column += 1) {
      const address = addressAt(column, row);
      const format = sheet.GetRange(address).GetNumberFormat();
      if (run && run.format === format) {
        run.address = `${run.first}:${address}`;
      } else {
        run = { first: address, address, format };
        formats.push(run);
      }
    }
  }
  return JSON.stringify({
    names,
    range: {
      sheet: sheet.GetName(),
      address: range.GetAddress(false, false, "xlA1", false),
    },
    rules,
    formats,
  });
}

export function spreadsheetRestoreValidationCommand() {
  const snapshotValue = Asc.scope.folioSpreadsheetValidationSnapshot;
  const snapshot =
    typeof snapshotValue === "string"
      ? JSON.parse(snapshotValue)
      : snapshotValue;
  if (!snapshot || !Array.isArray(snapshot.names)) {
    throw new Error("ข้อมูลสำรองกฎช่องกรอกไม่ถูกต้อง");
  }
  if (snapshot.range) {
    const sheet = Api.GetSheet(snapshot.range.sheet);
    const model = sheet?.worksheet;
    if (!model || typeof model.addDataValidation !== "function") {
      throw new Error("ตัวแก้ไขรุ่นนี้ไม่รองรับการคืนกฎช่องกรอก");
    }
    sheet.GetRange(snapshot.range.address).GetValidation().Delete();
    for (const saved of snapshot.rules) {
      const bounds = saved.bounds;
      const addressAt = (column, row) => {
        let result = "";
        for (
          let value = column;
          value > 0;
          value = Math.floor((value - 1) / 26)
        ) {
          result = String.fromCodePoint(65 + ((value - 1) % 26)) + result;
        }
        return result + row;
      };
      const target = sheet.GetRange(
        `${addressAt(bounds.c1 + 1, bounds.r1 + 1)}:${addressAt(bounds.c2 + 1, bounds.r2 + 1)}`
      );
      const validation = target.GetValidation();
      // The plugin sandbox exposes Asc.scope, without global SDK constructors.
      // Obtain typed instances through the public API, clone their model data,
      // then remove the temporary seed before restoring the exact prior rule.
      const created = validation.Add(
        "xlValidateCustom",
        "xlValidAlertStop",
        "xlBetween",
        "=TRUE()"
      );
      if (!created?.validations?.[0]?.formula1 || !target.range?.bbox) {
        throw new Error("สร้างกฎเพื่อคืนข้อมูลเดิมไม่สำเร็จ");
      }
      const template = created.validations[0];
      const rule = template.clone();
      const formula = template.formula1;
      validation.Delete();
      for (const key of [
        "allowBlank",
        "showDropDown",
        "showErrorMessage",
        "showInputMessage",
        "type",
        "errorStyle",
        "imeMode",
        "operator",
        "error",
        "errorTitle",
        "prompt",
        "promptTitle",
      ]) {
        rule[key] = saved[key];
      }
      rule.ranges = [target.range.bbox.clone()];
      for (const key of ["formula1", "formula2"]) {
        rule[key] = saved[key] === null ? null : formula.clone();
        if (rule[key]) {
          rule[key].text = saved[key];
        }
      }
      rule._init(model);
      model.addDataValidation(rule, true);
    }
    for (const item of snapshot.formats) {
      if (sheet.GetRange(item.address).SetNumberFormat(item.format) !== true) {
        throw new Error("คืนรูปแบบช่องกรอกไม่สำเร็จ");
      }
    }
  }
  for (const item of snapshot.names) {
    let name;
    try {
      name = Api.GetDefName(item.anchor);
    } catch {
      name = null;
    }
    if (item.reference === null) {
      if (name && name.Delete() !== true) {
        throw new Error("ลบตำแหน่งช่องกรอกที่บันทึกไม่สำเร็จไม่ได้");
      }
    } else if (name) {
      if (name.SetRefersTo(item.reference) !== true) {
        throw new Error("คืนตำแหน่งช่องกรอกไม่สำเร็จ");
      }
    } else {
      // AddDefName rejects #REF!, although an existing name can legitimately
      // retain that reference after its cells were removed. Recreate the name
      // at a valid temporary address, then restore its exact previous formula.
      const reference = `'${Api.GetActiveSheet().GetName().replaceAll("'", "''")}'!$A$1`;
      if (
        Api.AddDefName(item.anchor, reference, false) !== true ||
        Api.GetDefName(item.anchor).SetRefersTo(item.reference) !== true
      ) {
        throw new Error("คืนตำแหน่งช่องกรอกไม่สำเร็จ");
      }
    }
  }
  return true;
}

export function spreadsheetClearValidationCommand() {
  const input = Asc.scope.folioSpreadsheetValidation;
  const lookup = (anchor) => {
    try {
      return Api.GetDefName(anchor);
    } catch {
      return null;
    }
  };
  const name = lookup(input.anchor);
  let range;
  try {
    range = name?.GetRefersToRange();
    range?.GetRowsCount();
  } catch {
    range = null;
  }
  if (!range && input.sheet && input.address) {
    range = Api.GetSheet(input.sheet).GetRange(input.address);
  }
  const addressAt = (column, row) => {
    let result = "";
    for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) {
      result = String.fromCodePoint(65 + ((value - 1) % 26)) + result;
    }
    return result + row;
  };
  if (range && input.offset !== undefined) {
    if (
      !Number.isSafeInteger(input.offset) ||
      input.offset < 0 ||
      input.offset >= range.GetColumnsCount()
    ) {
      throw new Error("ตำแหน่งคอลัมน์ไม่ถูกต้อง");
    }
    range = range
      .GetWorksheet()
      .GetRange(
        `${addressAt(range.GetCol() + input.offset, range.GetRow())}:${addressAt(range.GetCol() + input.offset, range.GetRow() + range.GetRowsCount() - 1)}`
      );
  }
  if (range) {
    range.GetValidation().Delete();
    // Only reset the date mask installed by this plugin. Leave currency,
    // precision, font, borders, fills and other author formatting intact.
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
        if (
          cell.GetNumberFormat().toLowerCase() === "dd/mm/yyyy" &&
          cell.SetNumberFormat("General") !== true
        ) {
          throw new Error("ล้างรูปแบบวันที่ไม่สำเร็จ");
        }
      }
    }
  }
  if (input.removeAnchor) {
    for (const anchor of [input.anchor, ...(input.extraAnchorNames || [])]) {
      const defined = lookup(anchor);
      if (defined && defined.Delete() !== true) {
        throw new Error("ลบตำแหน่งช่องกรอกไม่สำเร็จ");
      }
    }
  }
  return true;
}
