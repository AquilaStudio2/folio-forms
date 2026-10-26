// oxlint-disable complexity -- Validate every executable builder boundary before generating the script.
import type { SpreadsheetFormulaBinding } from "./formula-bindings";
import {
  spreadsheetUploadPocCommand,
  uploadPocGuid,
  uploadPocPreview,
} from "./upload-poc";
import type { UploadPocTarget } from "./upload-poc";

export interface SpreadsheetRowChange {
  action: "insert" | "delete";
  bodyName: string;
  /** Zero-based index within the body, including the append position. */
  index: number;
  inputColumns: number[];
}

export interface SpreadsheetBuilderJob {
  inputUrl: string;
  outputName?: string;
  rowChange?: SpreadsheetRowChange;
  pdfName?: string;
  values?: { address: string; value: string | number | boolean | null }[];
  clearRanges?: string[];
  formulaBindings?: SpreadsheetFormulaBinding[];
  restorePrototypeValidation?: boolean;
  uploadPocTargets?: UploadPocTarget[];
}

/** Only server-created jobs are accepted; user text is never executable code. */
export const spreadsheetBuilderScript = (
  job: SpreadsheetBuilderJob
): string => {
  if (!/^https?:\/\//u.test(job.inputUrl)) {
    throw new Error("Spreadsheet input must be an HTTP(S) URL");
  }
  const outputName = job.outputName ?? "canonical.xlsx";
  if (!/^[a-zA-Z0-9_-]+\.xlsx$/u.test(outputName)) {
    throw new Error("Invalid spreadsheet output name");
  }
  if (job.pdfName && !/^[a-zA-Z0-9_-]+\.pdf$/u.test(job.pdfName)) {
    throw new Error("Invalid PDF output name");
  }
  const change = job.rowChange;
  if (
    job.formulaBindings?.some(
      (binding) =>
        !/^_folio_dyn_[a-f0-9]{16}_\d+_\d+$/u.test(binding.name) ||
        !Number.isSafeInteger(binding.firstColumnOffset) ||
        !Number.isSafeInteger(binding.lastColumnOffset) ||
        binding.firstColumnOffset < 0 ||
        binding.lastColumnOffset < binding.firstColumnOffset
    )
  ) {
    throw new Error("Invalid internal formula binding");
  }
  if (
    job.values?.some((cell) => !/^[A-Z]+[1-9]\d*$/u.test(cell.address)) ||
    job.clearRanges?.some(
      (range) => !/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/u.test(range)
    )
  ) {
    throw new Error("Invalid spreadsheet input address");
  }
  if (
    change &&
    (!/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(change.bodyName) ||
      !Number.isSafeInteger(change.index) ||
      change.index < 0 ||
      !["insert", "delete"].includes(change.action) ||
      change.inputColumns.some(
        (column) => !Number.isSafeInteger(column) || column < 0
      ))
  ) {
    throw new Error("Invalid spreadsheet row operation");
  }
  // ONLYOFFICE 9.4 ClearContents drops the style of emptied input cells.
  // Assigning an empty value preserves borders, formats, and the blank value.
  return `builder.OpenFile(${JSON.stringify(job.inputUrl)});
var sheet = Api.GetActiveSheet();
var clearRanges = ${JSON.stringify(job.clearRanges ?? [])};
for (var c = 0; c < clearRanges.length; c++) sheet.GetRange(clearRanges[c]).SetValue("");
var inputValues = ${JSON.stringify(job.values ?? [])};
for (var v = 0; v < inputValues.length; v++) {
  var input = inputValues[v];
  if (input.value === null) sheet.GetRange(input.address).SetValue("");
  else sheet.GetRange(input.address).SetValue(typeof input.value === "string" && input.value.charAt(0) === "=" ? "'" + input.value : input.value);
}
var change = ${JSON.stringify(change ?? null)};
if (change) {
  var name = Api.GetDefName(change.bodyName);
  if (!name) throw new Error("Missing table body binding");
  var body = name.GetRefersToRange();
  if (!body) throw new Error("Invalid table body binding");
  var sheet = body.GetWorksheet();
  var firstRow = body.GetRow() - 1;
  var count = body.GetRowsCount();
  var firstColumn = body.GetCol() - 1;
  var width = body.GetColumnsCount();
  if (change.index > count || (change.action === "delete" && change.index >= count)) {
    throw new Error("The selected row no longer exists");
  }
  var row = firstRow + change.index;
  var address = function(column, rowNumber) {
    var result = "";
    for (var value = column + 1; value > 0; value = Math.floor((value - 1) / 26)) {
      result = String.fromCharCode(65 + (value - 1) % 26) + result;
    }
    return result + (rowNumber + 1);
  };
  var rangeAtRow = function(rowNumber) {
    return sheet.GetRange(address(firstColumn, rowNumber) + ":" + address(firstColumn + width - 1, rowNumber));
  };
  var prototypeValidations = [];
  for (var column = 0; ${job.restorePrototypeValidation !== false} && column < width; column++) {
    var validation = sheet.GetRange(address(firstColumn + column, firstRow)).GetValidation();
    var validationType = validation.GetType();
    if (validationType && validationType !== "xlValidateInputOnly") prototypeValidations.push({column: column, type: validationType, alert: validation.GetAlertStyle(), operator: validation.GetOperator(), formula1: validation.GetFormula1(), formula2: validation.GetFormula2(), ignoreBlank: validation.GetIgnoreBlank(), showError: validation.GetShowError(), errorTitle: validation.GetErrorTitle(), errorMessage: validation.GetErrorMessage()});
  }
  if (change.action === "insert") {
    sheet.GetRange((row + 1) + ":" + (row + 1)).Insert("down");
    var sourceRow = change.index === 0 ? row + 1 : firstRow;
    rangeAtRow(sourceRow).Copy(rangeAtRow(row));
    for (var i = 0; i < change.inputColumns.length; i++) {
      if (change.inputColumns[i] >= width) throw new Error("Invalid input column");
      sheet.GetRange(address(firstColumn + change.inputColumns[i], row)).SetValue("");
    }
    name.SetRefersTo("'" + sheet.GetName().replace(/'/g, "''") + "'!$" + address(firstColumn, firstRow).replace(/(\\d+)$/, "$$$1") + ":$" + address(firstColumn + width - 1, firstRow + count).replace(/(\\d+)$/, "$$$1"));
  } else if (count === 1) {
    for (var j = 0; j < change.inputColumns.length; j++) {
      if (change.inputColumns[j] >= width) throw new Error("Invalid input column");
      sheet.GetRange(address(firstColumn + change.inputColumns[j], row)).SetValue("");
    }
  } else {
    sheet.GetRange((row + 1) + ":" + (row + 1)).Delete("up");
    name.SetRefersTo("'" + sheet.GetName().replace(/'/g, "''") + "'!$" + address(firstColumn, firstRow).replace(/(\\d+)$/, "$$$1") + ":$" + address(firstColumn + width - 1, firstRow + count - 2).replace(/(\\d+)$/, "$$$1"));
  }
  var nextCount = count + (change.action === "insert" ? 1 : count > 1 ? -1 : 0);
  for (var validationIndex = 0; validationIndex < prototypeValidations.length; validationIndex++) {
    var rule = prototypeValidations[validationIndex];
    var targetValidation = sheet.GetRange(address(firstColumn + rule.column, firstRow) + ":" + address(firstColumn + rule.column, firstRow + nextCount - 1)).GetValidation();
    targetValidation.Delete();
    targetValidation.Add(rule.type, rule.alert, rule.operator, rule.formula1, rule.formula2);
    targetValidation.SetIgnoreBlank(rule.ignoreBlank);
    targetValidation.SetShowError(rule.showError);
    targetValidation.SetErrorTitle(rule.errorTitle);
    targetValidation.SetErrorMessage(rule.errorMessage);
  }
  var formulaBindings = ${JSON.stringify(job.formulaBindings ?? [])};
  for (var bindingIndex = 0; bindingIndex < formulaBindings.length; bindingIndex++) {
    var binding = formulaBindings[bindingIndex];
    if (binding.lastColumnOffset >= width) throw new Error("Invalid internal formula binding column");
    var defined = Api.GetDefName(binding.name);
    if (!defined) throw new Error("Missing internal formula binding");
    defined.SetRefersTo("'" + sheet.GetName().replace(/'/g, "''") + "'!$" + address(firstColumn + binding.firstColumnOffset, firstRow).replace(/(\\d+)$/, "$$$1") + ":$" + address(firstColumn + binding.lastColumnOffset, firstRow + nextCount - 1).replace(/(\\d+)$/, "$$$1"));
  }
}
${
  job.uploadPocTargets?.length
    ? `var uploadProjection = JSON.parse((${spreadsheetUploadPocCommand.toString()})(${JSON.stringify({ guid: uploadPocGuid, mark: true, preview: uploadPocPreview, targets: job.uploadPocTargets })}));
if (!uploadProjection.ok) throw new Error(uploadProjection.error);`
    : ""
}
Api.RecalculateAllFormulas();
builder.SaveFile("xlsx", ${JSON.stringify(outputName)});
${job.pdfName ? `builder.SaveFile("pdf", ${JSON.stringify(job.pdfName)});` : ""}
builder.CloseFile();
`;
};
