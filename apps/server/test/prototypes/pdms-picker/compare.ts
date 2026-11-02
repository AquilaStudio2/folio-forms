// Local comparison fixture. Explicitly run from apps/server with
// PDMS_COMPARE_CREATE_LOCAL=1 bun test/prototypes/pdms-picker/compare.ts.
// Native choices are a snapshot for comparison, not a second live-source contract.
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@onlyoffice/db";
import { env } from "@onlyoffice/env/server";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";

import { spreadsheetBindingSchema } from "../../../src/documents/spreadsheets/contract";
import { projectDropdownIndicatorTargets } from "../../../src/documents/spreadsheets/project-dropdown-indicators";
import { protectSpreadsheet } from "../../../src/documents/spreadsheets/protection";
import { applySpreadsheetValidation } from "../../../src/documents/spreadsheets/validation";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
  XLSX_CONTENT_TYPE,
} from "../../../src/documents/spreadsheets/workbook";
import {
  spreadsheetDraftFieldData,
  spreadsheetManifestFieldData,
} from "../../../src/forms/spreadsheet-fields";
import {
  loadPdmsProjectNames,
  pdmsProjectsConfigurationFromEnv,
} from "../../../src/pdms/projects";
import { putObject } from "../../../src/storage";
import { SpreadsheetRuntime } from "../../spreadsheet-runtime/runtime-fixture";
import { fixtureWorkbook } from "../../spreadsheet-unit/fixture";

const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
const origin = new URL(env.SERVER_ORIGIN);
if (
  process.env.PDMS_COMPARE_CREATE_LOCAL !== "1" ||
  env.NODE_ENV === "production" ||
  !local.has(origin.hostname) ||
  !local.has(new URL(process.env.DATABASE_URL ?? "").hostname)
) {
  throw new Error("Explicit local-only comparison environment required");
}
const directory = path.resolve(
  process.env.PDMS_COMPARISON_OUTPUT ?? "/tmp/folio-pdms-native-comparison"
);
await mkdir(directory, { mode: 0o700, recursive: true });
const idFile = Bun.file(path.join(directory, "run-id.txt"));
const storedId = (await idFile.exists())
  ? await idFile.text()
  : crypto.randomUUID();
const id = z.uuid().parse(storedId.trim());
await Bun.write(idFile, id);
const publicId = id.replaceAll("-", "");
const title =
  process.env.PDMS_COMPARISON_TITLE?.trim() ||
  "ตัวเทียบ dropdown มาตรฐาน กับแบบค้นหา";
const links = {
  adminUrl: `${origin.origin}/admin/forms/${publicId}`,
  fillUrl: `${origin.origin}/forms/${publicId}/fill`,
};
const prior = await prisma.form.findUnique({ where: { id } });
if (prior) {
  if (prior.publicId !== publicId || prior.title !== title) {
    throw new Error("Comparison identity belongs to another Form");
  }
  console.log(JSON.stringify({ ...links, reused: true }));
  await prisma.$disconnect();
  process.exit(0);
}
const names = await loadPdmsProjectNames(pdmsProjectsConfigurationFromEnv());
const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_compare_native",
      id: "folio_compare_native",
      key: "project_native",
      label: "ชื่อโครงการ · มาตรฐาน",
      options: names,
      placeholder: "กดลูกศรที่ขอบเซลล์เพื่อเลือกรายการ",
      type: "dropdown",
    },
    {
      anchor: "folio_compare_search",
      id: "folio_compare_search",
      key: "project_search",
      label: "ชื่อโครงการ · ค้นหา",
      source: "pdms-project-name",
      type: "dropdown",
    },
    {
      anchor: "folio_compare_notes",
      id: "folio_compare_notes",
      key: "notes",
      label: "บันทึกการเปรียบเทียบ",
      type: "text",
    },
  ],
  table: null,
  version: 1,
});
const archive = unzipSync(
  fixtureWorkbook({
    cells: [
      { address: "A1", style: 1, value: title },
      { address: "B4", style: 1, value: "1. Dropdown มาตรฐาน" },
      { address: "H4", style: 1, value: "2. Dropdown ค้นหา" },
      { address: "B5", value: "คลิกช่อง B7 แล้วกดลูกศรด้านขวา" },
      { address: "H5", value: "คลิกช่อง H7 เพื่อค้นหาและเลือกชื่อ" },
      { address: "B7", style: 1 },
      { address: "H7", style: 1 },
      { address: "B10", value: "บันทึกสิ่งที่พบระหว่างเปรียบเทียบ" },
      { address: "B12", style: 1 },
      {
        address: "B15",
        value: `ตัวเทียบมาตรฐานใช้รายชื่อที่โหลดตอนสร้าง ${names.length} โครงการ ส่วนแบบค้นหาใช้รายการปัจจุบันเมื่อเปิดฟอร์ม`,
      },
      {
        address: "B18",
        value:
          "ลองเปิดรายการ เลือก เปลี่ยนค่า ค้นหา และพิมพ์หรือวางข้อความ เพื่อเทียบพฤติกรรมทั้งสองแบบ",
      },
    ],
    merges: [
      "A1:L2",
      "B4:F4",
      "H4:L4",
      "B5:F5",
      "H5:L5",
      "B7:F7",
      "H7:L7",
      "B10:L10",
      "B12:L12",
      "B15:L16",
      "B18:L19",
    ],
    names: {
      folio_compare_native: "'Form'!$B$7:$F$7",
      folio_compare_notes: "'Form'!$B$12:$L$12",
      folio_compare_search: "'Form'!$H$7:$L$7",
    },
  })
);
const sheet = archive["xl/worksheets/sheet1.xml"];
const styles = archive["xl/styles.xml"];
if (!sheet || !styles) {
  throw new Error("Comparison fixture parts missing");
}
archive["xl/worksheets/sheet1.xml"] = strToU8(
  strFromU8(sheet)
    .replace(
      "<sheetData>",
      '<cols><col min="1" max="12" width="11" customWidth="1"/></cols><sheetData>'
    )
    .replaceAll('s="1"', 's="2"')
    .replace('<row r="7">', '<row r="7" ht="42" customHeight="1">')
);
archive["xl/styles.xml"] = strToU8(
  strFromU8(styles)
    .replace('<fills count="2">', '<fills count="3">')
    .replace(
      "</fills>",
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE0F2F1"/><bgColor indexed="64"/></patternFill></fill></fills>'
    )
    .replace('<borders count="1">', '<borders count="2">')
    .replace(
      "</borders>",
      '<border><left style="thin"><color rgb="FF0F766E"/></left><right style="thin"><color rgb="FF0F766E"/></right><top style="thin"><color rgb="FF0F766E"/></top><bottom style="thin"><color rgb="FF0F766E"/></bottom></border></borders>'
    )
    .replace('<cellXfs count="2">', '<cellXfs count="3">')
    .replace(
      "</cellXfs>",
      '<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs>'
    )
);
let bytes = applySpreadsheetValidation(zipSync(archive), bindings);
const runtime = new SpreadsheetRuntime();
await runtime.start();
try {
  await runtime.write("comparison.xlsx", bytes);
  await runtime.runJob("comparison.xlsx", {
    projectDropdownTargets: projectDropdownIndicatorTargets(bindings),
  });
  bytes = await runtime.read("canonical.xlsx");
} finally {
  await runtime.stop();
}
const contract = resolveSpreadsheetContract(
  bindings,
  readSpreadsheetWorkbook(bytes)
);
bytes = protectSpreadsheet(bytes, contract);
const hash = createHash("sha256").update(bytes).digest("hex");
const prefix = `prototypes/pdms-native-comparison/${id}`;
await putObject(`${prefix}/draft.xlsx`, bytes, XLSX_CONTENT_TYPE);
await putObject(`${prefix}/published.xlsx`, bytes, XLSX_CONTENT_TYPE);
await prisma.form.create({
  data: {
    description:
      "ฟอร์มทดสอบเปรียบเทียบ ใช้ dropdown มาตรฐานที่ B7 และแบบค้นหาที่ H7 รายการมาตรฐานเป็น snapshot เฉพาะตัวเทียบนี้",
    documentKind: "xlsx",
    id,
    publicId,
    publishedTemplate: {
      create: {
        contentHash: hash,
        documentKey: `compare-published-${id}`,
        manifest: {
          create: {
            configurationHash: createHash("sha256")
              .update(JSON.stringify(bindings))
              .digest("hex"),
            fields: { create: spreadsheetManifestFieldData(bindings) },
          },
        },
        objectKey: `${prefix}/published.xlsx`,
        version: 1,
      },
    },
    status: "published",
    templateDraft: {
      create: {
        bindingRevision: 1,
        contentHash: hash,
        documentKey: `compare-draft-${id}`,
        fieldRules: { create: spreadsheetDraftFieldData(bindings) },
        objectKey: `${prefix}/draft.xlsx`,
      },
    },
    title,
    version: 1,
  },
});
await Bun.write(path.join(directory, "comparison.xlsx"), bytes);
await Bun.write(
  path.join(directory, "comparison.json"),
  JSON.stringify(
    {
      ...links,
      formId: id,
      indicators: true,
      namesCount: names.length,
      nativeCell: "B7:F7",
      searchCell: "H7:L7",
      snapshotAt: new Date().toISOString(),
      title,
    },
    null,
    2
  )
);
console.log(
  JSON.stringify({ ...links, namesCount: names.length, output: directory })
);
await prisma.$disconnect();
