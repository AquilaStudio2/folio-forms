// oxlint-disable complexity func-style no-implicit-globals -- Self-contained command serialized into the ONLYOFFICE 9.4 sandbox.
/** ONLYOFFICE 9.4 loses OLE clientData on import. Unlock only verified POC objects, never the worksheet. */
export function spreadsheetUploadPocActivationCommand(supplied) {
  try {
    const input = supplied || Asc.scope.folioUploadPocActivation;
    if (
      input?.guid !== "asc.{804C7D5D-8243-47D9-87A2-64E42806D42F}" ||
      !Array.isArray(input.bindings?.fields)
    ) {
      throw new Error("ข้อมูลตรวจสอบปุ่ม POC ไม่ครบ");
    }
    const sheet = Api.GetActiveSheet();
    const targets = [];
    const slots = new Set();
    for (const object of sheet.GetAllOleObjects()) {
      if (object.GetApplicationId() !== input.guid) {
        continue;
      }
      const raw = object.GetData();
      if (typeof raw !== "string" || raw.length > 4096) {
        throw new Error("ข้อมูลปุ่ม POC ไม่ถูกต้อง");
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
        throw new Error("ข้อมูลปุ่ม POC ไม่ถูกต้อง");
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
        throw new Error("ปุ่ม POC ไม่ตรงกับช่องหรือแถวปัจจุบัน");
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
        throw new Error("ไม่พบตำแหน่งปุ่ม POC ที่ยืนยันได้");
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
        throw new Error("ตำแหน่งวัตถุ POC ไม่ตรงกับข้อมูลช่อง");
      }
      if (
        typeof drawing.setProtectionLocked !== "function" ||
        typeof drawing.getProtectionLocked !== "function" ||
        typeof object.SetLockValue !== "function" ||
        typeof object.GetLockValue !== "function"
      ) {
        throw new TypeError(
          "ONLYOFFICE รุ่นนี้ยังไม่รองรับการเปิดปุ่มเลือกไฟล์ POC ภายใต้การป้องกันชีต"
        );
      }
      const slot = JSON.stringify([data.bindingId, rowIndex]);
      if (slots.has(slot)) {
        throw new Error("พบปุ่ม POC ซ้ำที่ช่องหรือแถวเดียวกัน");
      }
      slots.add(slot);
      targets.push(object);
    }
    // Validate every recognized object before changing any native state.
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
          throw new Error("ยืนยันการล็อกตำแหน่งปุ่ม POC ไม่ได้");
        }
      }
      for (const object of targets) {
        object.Drawing.setProtectionLocked(false);
        if (object.Drawing.getProtectionLocked() !== false) {
          throw new Error("ยืนยันการเปิดปุ่ม POC อย่างจำกัดไม่ได้");
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
        throw new Error("ยืนยันการป้องกันปุ่ม POC ไม่ได้ กรุณาปิดตัวแก้ไขและเปิดใหม่", {
          cause: error,
        });
      }
      throw error;
    }
    return JSON.stringify({ count: targets.length, ok: true });
  } catch (error) {
    return JSON.stringify({
      error: error.message || "เปิดปุ่ม POC ไม่สำเร็จ",
      ok: false,
    });
  }
}
