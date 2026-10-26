const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const currentBindingTag = (
  bindings: Record<string, unknown>,
  id: unknown
): unknown => {
  const scalar = Array.isArray(bindings.fields)
    ? bindings.fields.find((field) => record(field) && field.id === id)
    : null;
  const table = record(bindings.table) ? bindings.table : null;
  const column =
    table && Array.isArray(table.columns)
      ? table.columns.find((field) => record(field) && field.id === id)
      : null;
  const field = record(scalar) ? scalar : column;
  if (!record(field) || field.type !== "text" || field.computed === true) {
    return null;
  }
  return record(scalar) ? field.key : `${table?.key}.${field.key}`;
};

export interface UploadPocHostOptions {
  action: string;
  bridgeId: string;
  documentKey: string;
  scopeIdentity: string;
  spreadsheetBindings: unknown;
  savedButtons?: unknown;
}

/** Browser-memory-only POC state. No serialization, storage API, object URL or network. */
export class UploadPocPendingFiles {
  private scopeIdentity = "";
  private readonly files = new Map<string, { file: File; tag: unknown }>();

  setScope(scopeIdentity: string): void {
    if (scopeIdentity !== this.scopeIdentity) {
      this.files.clear();
      this.scopeIdentity = scopeIdentity;
    }
  }

  // oxlint-disable-next-line complexity -- Validate every scope, binding, row and File at this browser-only message boundary.
  handle(
    value: unknown,
    options: UploadPocHostOptions
  ): Record<string, unknown> {
    if (
      !record(value) ||
      value.source !== "folio-upload-poc" ||
      value.bridgeId !== options.bridgeId ||
      value.documentKey !== options.documentKey ||
      value.scopeIdentity !== options.scopeIdentity ||
      typeof value.requestId !== "string" ||
      !value.requestId ||
      !["pending-file-get", "pending-file-set", "pending-file-check"].includes(
        String(value.type)
      )
    ) {
      throw new Error("การเชื่อมต่อไฟล์ในหน้านี้ไม่ตรงกับเอกสารปัจจุบัน");
    }
    this.setScope(options.scopeIdentity);
    const bindings = record(options.spreadsheetBindings)
      ? options.spreadsheetBindings
      : {};
    const table = record(bindings.table) ? bindings.table : null;
    const locations = record(bindings.locations) ? bindings.locations : {};
    const bodyValue =
      table && typeof table.anchor === "string"
        ? locations[table.anchor]
        : null;
    const body = record(bodyValue) ? bodyValue : null;
    const rowCount =
      body &&
      Number.isSafeInteger(body.firstRow) &&
      Number.isSafeInteger(body.lastRow)
        ? Number(body.lastRow) - Number(body.firstRow) + 1
        : null;
    // A trusted refreshed authoring contract invalidates removed/renamed mappings.
    for (const [key, pending] of this.files) {
      const [bindingId] = JSON.parse(key) as unknown[];
      if (currentBindingTag(bindings, bindingId) !== pending.tag) {
        this.files.delete(key);
      }
    }
    const hasPending = this.files.size > 0;
    if (value.type === "pending-file-check") {
      if (
        ![
          "append-row",
          "delete-row",
          "save-draft",
          "submit",
          "save-template",
          "publish",
          "save-correction",
        ].includes(String(value.action))
      ) {
        throw new Error("คำสั่ง POC ไม่ถูกต้อง");
      }
      if (value.action === "append-row") {
        if (rowCount === null || value.rowIndex !== rowCount) {
          throw new Error("POC เพิ่มแถวได้เฉพาะท้ายตาราง เพื่อรักษาไฟล์ที่เลือกไว้");
        }
      } else if (hasPending) {
        throw new Error(
          value.action === "delete-row"
            ? "มีไฟล์ที่เลือกค้างไว้ในหน้านี้ POC ยังลบแถวไม่ได้ กรุณาเปิดหน้าใหม่เพื่อทิ้งไฟล์ที่เลือกก่อน"
            : "ไฟล์ที่เลือกยังอยู่เฉพาะหน้านี้ ยังไม่อัปโหลดหรือบันทึกถาวร POC จึงยังบันทึกหรือส่งข้อมูลพร้อมไฟล์ไม่ได้"
        );
      }
      return { allowed: true, hasPending };
    }
    if (options.action === "correction") {
      throw new Error("POC ยังไม่รองรับการเปลี่ยนไฟล์ระหว่างแก้ไขข้อมูลที่ส่งแล้ว");
    }
    const fields = Array.isArray(bindings.fields) ? bindings.fields : [];
    const scalar = fields.find(
      (field) => record(field) && field.id === value.bindingId
    );
    const columns = table && Array.isArray(table.columns) ? table.columns : [];
    const column = columns.find(
      (field) => record(field) && field.id === value.bindingId
    );
    let field = record(scalar) ? scalar : null;
    if (!field && record(column)) {
      field = column;
    }
    const expectedTag = record(scalar)
      ? field?.key
      : `${table?.key}.${field?.key}`;
    if (
      !field ||
      field.type !== "text" ||
      field.computed === true ||
      value.tag !== expectedTag ||
      (record(scalar)
        ? value.rowIndex !== null
        : !Number.isSafeInteger(value.rowIndex) ||
          Number(value.rowIndex) < 0 ||
          Number(value.rowIndex) >= (rowCount ?? 1_048_576))
    ) {
      throw new Error("ตำแหน่งเลือกไฟล์ไม่ตรงกับช่องหรือแถวปัจจุบัน กรุณาเปิดแบบฟอร์มใหม่");
    }
    if (
      options.action === "template-edit" &&
      (!Array.isArray(options.savedButtons) ||
        !options.savedButtons.some(
          (button) =>
            record(button) &&
            button.bindingId === value.bindingId &&
            button.tag === value.tag &&
            button.rowIndex === value.rowIndex
        ))
    ) {
      throw new Error("ปุ่มนี้ยังไม่บันทึกในต้นแบบ กรุณาบันทึกต้นแบบให้สำเร็จก่อนเลือกไฟล์");
    }
    const key = JSON.stringify([value.bindingId, value.rowIndex]);
    if (value.type === "pending-file-set") {
      if (!(value.file instanceof File) || value.file.size > 10 * 1024 * 1024) {
        throw new Error("POC เลือกได้หนึ่งไฟล์ต่อปุ่ม ขนาดไม่เกิน 10 MB");
      }
      this.files.set(key, { file: value.file, tag: value.tag });
    }
    const file = this.files.get(key)?.file;
    return {
      filename: file?.name ?? null,
      hasPending: this.files.size > 0,
      size: file?.size ?? null,
    };
  }
}
