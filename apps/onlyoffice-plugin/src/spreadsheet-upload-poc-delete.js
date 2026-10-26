// oxlint-disable complexity func-style no-implicit-globals -- Standalone ONLYOFFICE 9.4 command; strict validation precedes the narrow private deletion adapter.
/** Captures before metadata deletion; removes only after the metadata commit is confirmed. */
export function spreadsheetUploadPocDeleteCommand(supplied) {
  try {
    const input = supplied || Asc.scope.folioUploadPocDelete;
    const guid = "asc.{804C7D5D-8243-47D9-87A2-64E42806D42F}";
    if (
      input?.guid !== guid ||
      !["capture", "remove", "verify"].includes(input.phase) ||
      !Array.isArray(input.bindingIds) ||
      input.bindingIds.some(
        (id) =>
          typeof id !== "string" ||
          (input.phase === "remove" && !/^folio_[A-Za-z0-9_]+$/u.test(id))
      )
    ) {
      throw new Error("ข้อมูลลบปุ่ม POC ไม่ถูกต้อง");
    }
    const sheet = Api.GetActiveSheet();
    const objects = sheet.GetAllOleObjects();
    const captured = [];
    for (const object of objects) {
      if (object.GetApplicationId() !== guid) {
        continue;
      }
      const raw = object.GetData();
      let data;
      try {
        data =
          typeof raw === "string" && raw.length <= 4096
            ? JSON.parse(raw)
            : null;
      } catch {
        data = null;
      }
      if (!input.bindingIds.includes(data?.bindingId)) {
        continue;
      }
      const drawing = object.Drawing;
      const from = drawing?.drawingBase?.from;
      const nativeId = drawing?.Get_Id?.() ?? drawing?.Id;
      if (
        !data ||
        data.kind !== "folio-upload-poc" ||
        data.version !== 1 ||
        Object.keys(data).some(
          (key) =>
            !["bindingId", "kind", "rowIndex", "tag", "version"].includes(key)
        ) ||
        typeof nativeId !== "string" ||
        !nativeId ||
        !from ||
        !Number.isSafeInteger(from.row) ||
        !Number.isSafeInteger(from.col) ||
        typeof drawing.deleteDrawingBase !== "function"
      ) {
        throw new Error("ONLYOFFICE รุ่นนี้ยังยืนยันการลบปุ่ม POC อย่างปลอดภัยไม่ได้");
      }
      let marker = null;
      try {
        marker =
          Api.GetDefName(
            `_folio_upload_poc_${data.bindingId}`
          )?.GetRefersTo() || null;
      } catch {
        marker = null;
      }
      captured.push({
        bindingId: data.bindingId,
        column: from.col,
        data: raw,
        marker,
        nativeId,
        row: from.row,
        sheet: sheet.GetName(),
      });
    }
    if (input.phase === "capture") {
      return JSON.stringify({ ok: true, targets: captured });
    }
    if (
      !Array.isArray(input.targets) ||
      !Array.isArray(input.activeBindingIds) ||
      input.bindingIds.some((id) => {
        const active = input.activeBindingIds.includes(id);
        if (input.phase === "verify") {
          return !active;
        }
        if (input.reason !== "ineligible/type-change") {
          return active;
        }
        const binding = input.currentBindings?.find((item) => item.id === id);
        return (
          !active || !binding || (binding.type === "text" && !binding.computed)
        );
      })
    ) {
      throw new Error("การลบปุ่มยังไม่ตรงกับการตั้งค่าปัจจุบัน");
    }
    for (const id of input.bindingIds) {
      let marker;
      try {
        marker = Api.GetDefName(`_folio_upload_poc_${id}`);
      } catch {
        marker = null;
      }
      if (input.phase === "verify" ? !marker : marker) {
        throw new Error(
          "พบตำแหน่งปุ่มที่ลบแล้วกลับมาในประวัติ กรุณาย้อนการ Undo การลบก่อนบันทึกอีกครั้ง"
        );
      }
    }
    if (
      new Set(captured.map((target) => target.nativeId)).size !==
      captured.length
    ) {
      throw new Error("รหัสปุ่ม POC ซ้ำกัน จึงยังลบอย่างปลอดภัยไม่ได้");
    }
    const removal = [];
    for (const target of captured) {
      const previous = input.targets.find(
        (item) =>
          item.nativeId === target.nativeId &&
          item.bindingId === target.bindingId
      );
      if (
        !previous ||
        (previous.data !== target.data &&
          (input.phase !== "verify" || previous.nextData !== target.data)) ||
        (input.phase === "verify" && previous.marker !== target.marker) ||
        previous.column !== target.column ||
        previous.row !== target.row ||
        previous.sheet !== target.sheet
      ) {
        throw new Error(
          "ปุ่มที่รอลบเปลี่ยนไป กรุณาเก็บหน้านี้ไว้และตรวจสอบก่อนลองบันทึกอีกครั้ง"
        );
      }
      removal.push(
        objects.find(
          (object) =>
            object.GetApplicationId() === guid &&
            (object.Drawing?.Get_Id?.() ?? object.Drawing?.Id) ===
              target.nativeId &&
            object.GetData() === target.data
        )
      );
    }
    if (input.phase === "verify") {
      if (
        captured.length !== input.targets.length ||
        captured.some(
          (target, index) => target.nativeId !== input.targets[index].nativeId
        )
      ) {
        throw new Error("ปุ่มที่รอปรับข้อมูลไม่ครบ จึงยังบันทึกไม่ได้");
      }
      return JSON.stringify({ ok: true });
    }
    // Validation of every remaining target above must finish before the first mutation.
    for (const object of removal) {
      object.Drawing.deleteDrawingBase();
    }
    const remaining = sheet.GetAllOleObjects().some((object) => {
      if (object.GetApplicationId() !== guid) {
        return false;
      }
      try {
        return input.bindingIds.includes(
          JSON.parse(object.GetData()).bindingId
        );
      } catch {
        return false;
      }
    });
    if (remaining) {
      throw new Error("ยังยืนยันการลบปุ่มในชีตไม่ได้ กรุณากดบันทึกแบบร่างเพื่อลองอีกครั้ง");
    }
    return JSON.stringify({ count: removal.length, ok: true });
  } catch (error) {
    return JSON.stringify({
      error: error.message || "ยังยืนยันการลบปุ่ม POC ไม่ได้",
      ok: false,
    });
  }
}
