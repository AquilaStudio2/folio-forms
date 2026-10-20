import { z } from "zod";

import { fail } from "../../http/errors";
import { parseSpreadsheetRange } from "./contract";
import type { SpreadsheetBindings } from "./contract";
import type { SpreadsheetWorkbook } from "./workbook";

export const spreadsheetAnchorSnapshotSchema = z.array(
  z.tuple([
    z
      .string()
      .max(255)
      .regex(/^folio_[A-Za-z0-9_]+$/u),
    z.string().min(1).max(1024).nullable(),
  ])
);

export type SpreadsheetAnchorSnapshot = z.infer<
  typeof spreadsheetAnchorSnapshotSchema
>;

// Compare the frozen editor's positions with the returned XLSX, including the
// unchanged-document fallback. Never repair bytes using client-supplied ranges.
export const validateSpreadsheetSaveSnapshot = (
  snapshot: SpreadsheetAnchorSnapshot,
  bindings: SpreadsheetBindings,
  workbook: SpreadsheetWorkbook
): void => {
  const expected = new Map(snapshot);
  const anchors = [
    ...bindings.fields.map((field) => field.anchor),
    ...(bindings.table ? [bindings.table.anchor] : []),
  ];
  if (
    expected.size !== snapshot.length ||
    expected.size !== anchors.length ||
    anchors.some((anchor) => !expected.has(anchor))
  ) {
    fail(422, "invalid_template", "การตั้งค่าช่องเปลี่ยนระหว่างบันทึก กรุณาลองบันทึกอีกครั้ง");
  }
  for (const [anchor, reference] of expected) {
    let range = null;
    try {
      range =
        reference === null
          ? null
          : parseSpreadsheetRange(reference.replace(/^=/u, ""));
    } catch {
      fail(422, "invalid_template", `ตำแหน่งช่องไม่ถูกต้อง: ${anchor}`);
    }
    if (
      JSON.stringify(workbook.names.get(anchor) ?? null) !==
      JSON.stringify(range)
    ) {
      fail(
        422,
        "invalid_template",
        "ไฟล์ Excel ที่ได้รับยังไม่ตรงกับตำแหน่งช่องล่าสุด กรุณาเก็บหน้านี้ไว้แล้วลองบันทึกอีกครั้ง"
      );
    }
  }
};
