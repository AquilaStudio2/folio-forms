// oxlint-disable func-style no-implicit-globals -- Serialized ONLYOFFICE command; the checkpoint never writes a cell.
export function spreadsheetEditorSaveCheckpointCommand(supplied) {
  const nonce = supplied || Asc.scope.folioSpreadsheetSaveCheckpoint;
  if (
    typeof nonce !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      nonce
    )
  ) {
    throw new Error("รหัสยืนยันการบันทึกต้นแบบไม่ถูกต้อง");
  }
  const sheet = Api.GetActiveSheet();
  const prefix = "_folio_editor_save_checkpoint_";
  const name = prefix + nonce.replaceAll("-", "");
  const existing = sheet.GetDefNames();
  if (!Array.isArray(existing)) {
    throw new TypeError("ONLYOFFICE รุ่นนี้ยังยืนยันการบันทึกในตัวแก้ไขเดิมไม่ได้");
  }
  for (const defined of existing) {
    if (defined.GetName().startsWith(prefix) && defined.Delete() !== true) {
      throw new Error("ล้างรหัสยืนยันการบันทึกก่อนหน้าไม่ได้");
    }
  }
  if (
    sheet.AddDefName(
      name,
      `'${sheet.GetName().replaceAll("'", "''")}'!$A$1`,
      true
    ) !== true
  ) {
    throw new Error("สร้างรหัสยืนยันการบันทึกต้นแบบไม่ได้");
  }
  return true;
}
