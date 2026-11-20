// oxlint-disable complexity func-style no-implicit-globals consistent-function-scoping -- Self-contained command serialized into the ONLYOFFICE 9.4 sandbox.
/** ONLYOFFICE 9.4 loses OLE clientData on import. Unlock only verified POC objects, never the worksheet. */
export function spreadsheetUploadPocActivationCommand(supplied) {
  try {
    const input = supplied || Asc.scope.folioUploadPocActivation;
    if (
      input?.guid !== "asc.{804C7D5D-8243-47D9-87A2-64E42806D42F}" ||
      !Array.isArray(input.bindings?.fields)
    ) {
      throw new Error("ข้อมูลตรวจสอบปุ่มแนบไฟล์ไม่ครบ");
    }
    const sheet = Api.GetActiveSheet();
    const targets = [];
    const slots = new Set();
    const projections = input.savedData === undefined ? null : [];
    const values = projections ? new Map() : null;
    let expectedProjections = 0;
    if (values) {
      const saved = input.savedData;
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
        throw new Error("ข้อมูลฉบับที่บันทึกแล้วไม่ถูกต้อง");
      }
      const link = (file) => {
        if (file === undefined || file === null) {
          return "";
        }
        if (
          typeof file !== "object" ||
          Array.isArray(file) ||
          typeof file.file_link !== "string" ||
          !/^https?:\/\//iu.test(file.file_link)
        ) {
          throw new Error("ข้อมูลไฟล์ของฉบับที่บันทึกแล้วไม่ถูกต้อง");
        }
        return file.file_link;
      };
      for (const field of input.bindings.fields) {
        if (!field.attachment) {
          continue;
        }
        expectedProjections += 1;
        const value = link(
          Object.hasOwn(saved, field.key) ? saved[field.key] : null
        );
        if (value) {
          values.set(JSON.stringify([field.id, null]), value);
        }
      }
      const { table } = input.bindings;
      const columns = table?.columns?.filter((field) => field.attachment);
      if (columns?.length) {
        const count = Api.GetDefName(table.anchor)
          ?.GetRefersToRange()
          ?.GetRowsCount();
        if (!Number.isSafeInteger(count) || count < 1) {
          throw new Error("ยืนยันช่วงตารางไม่ได้");
        }
        expectedProjections += count * columns.length;
        const rows = Object.hasOwn(saved, table.key) ? saved[table.key] : null;
        if (rows !== null && rows !== undefined && !Array.isArray(rows)) {
          throw new Error("ข้อมูลแถวของฉบับที่บันทึกแล้วไม่ถูกต้อง");
        }
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (!row || typeof row !== "object" || Array.isArray(row)) {
              throw new Error("ข้อมูลแถวของฉบับที่บันทึกแล้วไม่ถูกต้อง");
            }
            for (const column of columns) {
              const file = Object.hasOwn(row, column.key)
                ? row[column.key]
                : null;
              const value = link(file);
              if (!value) {
                continue;
              }
              if (
                !Number.isSafeInteger(file.row_index) ||
                file.row_index < 0 ||
                file.row_index >= count
              ) {
                throw new Error("ตำแหน่งไฟล์ที่บันทึกแล้วไม่ตรงกับตาราง");
              }
              const key = JSON.stringify([column.id, file.row_index]);
              if (values.has(key)) {
                throw new Error("ตำแหน่งไฟล์ที่บันทึกแล้วซ้ำ");
              }
              values.set(key, value);
            }
          }
        }
      }
    }
    for (const object of sheet.GetAllOleObjects()) {
      if (object.GetApplicationId() !== input.guid) {
        continue;
      }
      const raw = object.GetData();
      if (typeof raw !== "string" || raw.length > 4096) {
        throw new Error("ข้อมูลปุ่มแนบไฟล์ไม่ถูกต้อง");
      }
      const data = JSON.parse(raw);
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
        throw new Error("ข้อมูลปุ่มแนบไฟล์ไม่ถูกต้อง");
      }
      const scalar = input.bindings.fields.find(
        (field) => field.id === data.bindingId
      );
      const { table } = input.bindings;
      const column =
        !scalar && table?.columns?.find((field) => field.id === data.bindingId);
      const field = scalar || column;
      const rowIndex = data.rowIndex ?? null;
      if (
        !field ||
        field.type !== "text" ||
        field.computed ||
        data.tag !== (scalar ? field.key : `${table.key}.${field.key}`) ||
        (scalar
          ? rowIndex !== null
          : !Number.isSafeInteger(rowIndex) || rowIndex < 0)
      ) {
        throw new Error("ปุ่มแนบไฟล์ไม่ตรงกับช่องหรือแถวปัจจุบัน");
      }
      const position = Api.GetDefName(
        scalar ? field.anchor : table.anchor
      )?.GetRefersToRange();
      const marker = Api.GetDefName(
        `_folio_upload_poc_${data.bindingId}`
      )?.GetRefersToRange();
      const tracked =
        column &&
        Api.GetDefName(`folio_column_${field.id}`)?.GetRefersToRange();
      if (
        !position ||
        !marker ||
        (column && !tracked) ||
        position.GetWorksheet().GetName() !== sheet.GetName() ||
        marker.GetWorksheet().GetName() !== sheet.GetName() ||
        (column &&
          (tracked.GetWorksheet().GetName() !== sheet.GetName() ||
            rowIndex >= position.GetRowsCount()))
      ) {
        throw new Error("ไม่พบตำแหน่งปุ่มแนบไฟล์ที่ยืนยันได้");
      }
      const expectedRow = position.GetRow() - 1 + (column ? rowIndex : 0);
      const expectedColumn = (column ? tracked : position).GetCol() - 1;
      const drawing = object.Drawing;
      const from = drawing?.drawingBase?.from;
      if (
        !from ||
        from.row !== expectedRow ||
        from.col !== expectedColumn ||
        marker.GetCol() - 1 !== expectedColumn ||
        marker.GetRow() - 1 > expectedRow ||
        marker.GetRow() + marker.GetRowsCount() - 2 < expectedRow
      ) {
        throw new Error("ตำแหน่งปุ่มแนบไฟล์ไม่ตรงกับข้อมูลช่อง");
      }
      if (
        typeof drawing.setProtectionLocked !== "function" ||
        typeof drawing.getProtectionLocked !== "function" ||
        typeof object.SetLockValue !== "function" ||
        typeof object.GetLockValue !== "function"
      ) {
        throw new TypeError(
          "ONLYOFFICE รุ่นนี้ยังไม่รองรับการเปิดปุ่มแนบไฟล์ภายใต้การป้องกันชีต"
        );
      }
      const slot = JSON.stringify([data.bindingId, rowIndex]);
      if (slots.has(slot)) {
        throw new Error("พบปุ่มแนบไฟล์ซ้ำที่ช่องหรือแถวเดียวกัน");
      }
      slots.add(slot);
      if (projections && field.attachment) {
        const model = position.range?.worksheet;
        const range = model?.getRange3?.(
          expectedRow,
          expectedColumn,
          expectedRow,
          expectedColumn
        );
        if (
          typeof range?.getValue !== "function" ||
          typeof range?.setValue !== "function" ||
          typeof range?.cleanHyperlinks !== "function" ||
          range.worksheet !== model ||
          range.bbox?.r1 !== expectedRow ||
          range.bbox?.r2 !== expectedRow ||
          range.bbox?.c1 !== expectedColumn ||
          range.bbox?.c2 !== expectedColumn ||
          typeof model.getId !== "function" ||
          typeof model.workbook?.handlers?.trigger !== "function" ||
          typeof model.workbook?.oApi?.onWorksheetChange !== "function"
        ) {
          throw new TypeError("ONLYOFFICE รุ่นนี้ยังคืนค่าช่องแนบที่บันทึกแล้วไม่ได้");
        }
        projections.push({ range, value: values.get(slot) ?? "" });
        values.delete(slot);
      }
      targets.push(object);
    }
    if (
      projections &&
      (projections.length !== expectedProjections || values.size !== 0)
    ) {
      throw new Error("ตำแหน่งไฟล์ฉบับที่บันทึกแล้วไม่ตรงกับตัวแก้ไข");
    }
    if (targets.length === 0) {
      return JSON.stringify({ count: 0, ok: true });
    }
    const history = typeof AscCommon === "undefined" ? null : AscCommon.History;
    if (
      typeof history?.TurnOff !== "function" ||
      typeof history?.TurnOn !== "function"
    ) {
      throw new TypeError("ONLYOFFICE รุ่นนี้ยังเปิดปุ่มแนบโดยไม่เปลี่ยนประวัติเอกสารไม่ได้");
    }
    // Validate every recognized object before changing any native state.
    // Restoring imported OLE interaction locks is initialization, not an answer edit.
    history.TurnOff();
    try {
      // Prove all public locks before any private protection unlock.
      for (const object of targets) {
        if (
          object.SetLockValue("noMove", true) !== true ||
          object.SetLockValue("noResize", true) !== true ||
          object.SetLockValue("noSelect", false) !== true ||
          object.GetLockValue("noMove") !== true ||
          object.GetLockValue("noResize") !== true ||
          object.GetLockValue("noSelect") !== false
        ) {
          throw new Error("ยืนยันการล็อกตำแหน่งปุ่มแนบไฟล์ไม่ได้");
        }
      }
      for (const object of targets) {
        object.Drawing.setProtectionLocked(false);
        if (object.Drawing.getProtectionLocked() !== false) {
          throw new Error("ยืนยันการเปิดปุ่มแนบไฟล์อย่างจำกัดไม่ได้");
        }
      }
      if (projections) {
        for (const { range, value } of projections) {
          if (range.getValue() === value) {
            continue;
          }
          // Only authenticated canonical projections change; worksheet and cell locks stay enabled.
          range.cleanHyperlinks();
          range.setValue(value);
          if (range.getValue() !== value) {
            throw new Error("คืนค่าช่องแนบที่บันทึกแล้วไม่ได้");
          }
          const model = range.worksheet;
          model.workbook.handlers.trigger(
            "cleanCellCache",
            model.getId(),
            [range.bbox],
            true
          );
          model.workbook.oApi.onWorksheetChange(range.bbox);
        }
      }
    } catch (error) {
      let rollbackFailed = false;
      for (const object of targets) {
        try {
          object.Drawing.setProtectionLocked(true);
          if (object.Drawing.getProtectionLocked() !== true) {
            rollbackFailed = true;
          }
        } catch {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        throw new Error("ยืนยันการป้องกันปุ่มแนบไฟล์ไม่ได้ กรุณาปิดตัวแก้ไขและเปิดใหม่", {
          cause: error,
        });
      }
      throw error;
    } finally {
      history.TurnOn();
    }
    return JSON.stringify({ count: targets.length, ok: true });
  } catch (error) {
    return JSON.stringify({
      error: error.message || "เปิดปุ่มแนบไฟล์ไม่สำเร็จ",
      ok: false,
    });
  }
}
