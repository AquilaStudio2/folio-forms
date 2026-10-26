// oxlint-disable complexity func-style no-implicit-globals no-var vars-on-top no-loop-func func-names -- Serialized into ONLYOFFICE's native sandbox; no surrounding module state is available.
/** Display-only projection. Never chooses a file, uploads, or writes cell values. */
export function spreadsheetUploadPocCommand(supplied) {
  try {
    var input = supplied || Asc.scope.folioSpreadsheetUploadPoc;
    if (
      !input ||
      !Array.isArray(input.targets) ||
      !input.preview ||
      !input.guid
    ) {
      throw new Error("Invalid upload POC projection");
    }
    var count = 0;
    for (var target of input.targets) {
      if (
        !/^folio_[A-Za-z0-9_]+$/u.test(target.bindingId) ||
        !["field", "column"].includes(target.kind)
      ) {
        throw new Error("Invalid upload POC binding");
      }
      var source = Api.GetDefName(target.bodyAnchor || target.anchor);
      var range = source && source.GetRefersToRange();
      if (!range || range.GetWorksheet().GetName() !== target.sheet) {
        throw new Error("Upload POC position is unavailable");
      }
      var sheet = range.GetWorksheet();
      var firstRow = range.GetRow() - 1;
      var firstColumn = range.GetCol() - 1 + (target.columnOffset || 0);
      var rows = target.kind === "column" ? range.GetRowsCount() : 1;
      var marker = `_folio_upload_poc_${target.bindingId}`;
      if (input.mark) {
        var existingMarker = null;
        try {
          existingMarker = Api.GetDefName(marker);
        } catch (error) {
          if (
            !String(error.message).startsWith("Defined name does not exist:")
          ) {
            throw error;
          }
        }
        var reference = source.GetRefersTo();
        if (target.kind === "column" && target.bodyAnchor) {
          var letter = "";
          for (
            var value = firstColumn + 1;
            value > 0;
            value = Math.floor((value - 1) / 26)
          ) {
            letter = String.fromCodePoint(65 + ((value - 1) % 26)) + letter;
          }
          reference = `'${target.sheet.replaceAll("'", "''")}'!$${letter}$${
            firstRow + 1
          }:$${letter}$${firstRow + rows}`;
        }
        if (existingMarker) {
          existingMarker.SetRefersTo(reference);
        } else if (!Api.AddDefName(marker, reference, false)) {
          throw new Error("Could not mark upload POC position");
        }
      }
      var existing = sheet.GetAllOleObjects().filter((object) => {
        if (object.GetApplicationId() !== input.guid) {
          return false;
        }
        try {
          var data = JSON.parse(object.GetData());
          return (
            data.kind === "folio-upload-poc" &&
            data.version === 1 &&
            data.bindingId === target.bindingId
          );
        } catch {
          return false;
        }
      });
      if (existing.length > rows) {
        throw new Error("Upload POC positions need a saved rebuild");
      }
      for (var index = 0; index < rows; index += 1) {
        var cell =
          target.kind === "column"
            ? sheet.GetRangeByNumber(firstRow + index, firstColumn)
            : range;
        // ONLYOFFICE 9.4 reports Height=0 for rows with the default height.
        // Height/GetRowHeight are points; GetRowHeight is nullable for default rows.
        var heightPoints = cell.Height;
        if (!Number.isFinite(heightPoints) || heightPoints <= 0) {
          heightPoints = 0;
          for (
            var heightRow = 0;
            heightRow < cell.GetRowsCount();
            heightRow += 1
          ) {
            var rowHeight = sheet
              .GetRangeByNumber(firstRow + index + heightRow, firstColumn)
              .GetRowHeight();
            heightPoints +=
              Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 14.25;
          }
        }
        // Natural preview is 110 x 24 pixels. Fit inside the mapped cell without stretching.
        var scale = Math.min(1, cell.Width / 110, (heightPoints * 4) / 3 / 24);
        if (!Number.isFinite(scale) || scale <= 0) {
          throw new Error("Upload POC cell has no visible space");
        }
        var width = Math.max(1, Math.round(110 * scale * 9525));
        var height = Math.max(1, Math.round(24 * scale * 9525));
        var data = JSON.stringify({
          bindingId: target.bindingId,
          kind: "folio-upload-poc",
          rowIndex: target.kind === "column" ? index : null,
          tag: target.tag,
          version: 1,
        });
        var object = existing[index];
        if (object) {
          object.SetPosition(firstColumn, 0, firstRow + index, 0);
          object.SetSize(width, height);
          object.SetData(data);
        } else {
          object = sheet.AddOleObject(
            input.preview,
            width,
            height,
            data,
            input.guid,
            firstColumn,
            0,
            firstRow + index,
            0
          );
        }
        if (!object) {
          throw new Error("Could not place upload POC button");
        }
        object.SetName(`folio_upload_poc_${target.bindingId}_${index}`);
        object.SetLockValue("noSelect", false);
        object.SetLockValue("noMove", true);
        object.SetLockValue("noResize", true);
        count += 1;
      }
    }
    return JSON.stringify({ count, ok: true });
  } catch (error) {
    return JSON.stringify({
      error: error.message || "Could not display upload POC button",
      ok: false,
    });
  }
}
