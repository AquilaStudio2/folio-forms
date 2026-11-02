// oxlint-disable complexity func-style no-implicit-globals no-var vars-on-top -- Serialized into the native Office sandbox; no surrounding module state is available.
/** Decorative cell arrows. Never writes a cell value or handles a selection. */
export function spreadsheetProjectDropdownIndicatorCommand(supplied) {
  var input = supplied || Asc.scope.folioProjectDropdownIndicators;
  if (!input || !Array.isArray(input.targets)) {
    throw new Error("Missing project dropdown indicators");
  }
  var prefix = "folio_pdms_dropdown_v1_";
  var resolved = input.targets.map((target) => {
    var defined = Api.GetDefName(target.anchor);
    var range = defined && defined.GetRefersToRange();
    if (
      !range ||
      (target.kind === "column" &&
        (!Number.isSafeInteger(target.offset) ||
          target.offset < 0 ||
          target.offset >= range.GetColumnsCount()))
    ) {
      throw new Error("Missing project dropdown cell");
    }
    return { range, target };
  });
  var removal = [];
  var sheets = Api.GetSheets();
  for (var sheet of sheets) {
    for (var shape of sheet.GetAllShapes()) {
      if (
        /^folio_pdms_dropdown_v1_[A-Za-z_][A-Za-z0-9_]*_row_\d+$/u.test(
          shape.GetName()
        ) &&
        shape.GetLockValue("noSelect") === true &&
        shape.GetLockValue("noMove") === true &&
        shape.GetLockValue("noResize") === true
      ) {
        // Pinned 9.4 exposes no public ApiShape.Delete, as with its OLE API.
        if (typeof shape.Drawing?.deleteDrawingBase !== "function") {
          throw new TypeError("Cannot update the project dropdown indicator");
        }
        removal.push(shape);
      }
    }
  }
  for (var previous of removal) {
    previous.Drawing.deleteDrawingBase();
  }
  var count = 0;
  for (var entry of resolved) {
    var { target } = entry;
    var { range } = entry;
    var targetSheet = range.GetWorksheet();
    var column = range.GetCol() - 1;
    var firstRow = range.GetRow() - 1;
    var rows = target.kind === "column" ? range.GetRowsCount() : 1;
    column +=
      target.kind === "column" ? target.offset : range.GetColumnsCount() - 1;
    for (var index = 0; index < rows; index += 1) {
      var cell = targetSheet.GetRangeByNumber(firstRow + index, column);
      // Pinned 9.4 exposes Width in pixels and Height/row heights in points.
      var width = cell.Width;
      var heightPoints = target.kind === "field" ? range.Height : cell.Height;
      if (!Number.isFinite(heightPoints) || heightPoints <= 0) {
        heightPoints = 0;
        var heightRows = target.kind === "field" ? range.GetRowsCount() : 1;
        for (var heightIndex = 0; heightIndex < heightRows; heightIndex += 1) {
          var rowHeight = targetSheet
            .GetRangeByNumber(firstRow + index + heightIndex, column)
            .GetRowHeight();
          heightPoints +=
            Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 14.25;
        }
      }
      if (!Number.isFinite(width) || width < 14) {
        continue;
      }
      var height = (heightPoints * 4) / 3;
      var arrow = targetSheet.AddShape(
        "triangle",
        8 * 9525,
        5 * 9525,
        Api.CreateSolidFill(Api.CreateRGBColor(15, 118, 110)),
        Api.CreateStroke(0, Api.CreateNoFill()),
        column,
        Math.round((width - 12) * 9525),
        firstRow + index,
        Math.round(Math.max(0, (height - 5) / 2) * 9525)
      );
      if (!arrow) {
        throw new Error("Could not display project dropdown arrow");
      }
      arrow.SetRotation(180);
      arrow.SetName(`${prefix}${target.id}_row_${index}`);
      arrow.SetLockValue("noSelect", true);
      arrow.SetLockValue("noMove", true);
      arrow.SetLockValue("noResize", true);
      count += 1;
    }
  }
  return count;
}
