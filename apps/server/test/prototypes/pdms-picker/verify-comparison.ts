// Verify the local comparison through real User HTTP routes and saved XLSX.
// Uses one dedicated local User; credentials stay in the private output directory.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@onlyoffice/db";
import { env } from "@onlyoffice/env/server";
import { strFromU8, strToU8, zipSync } from "fflate";
import { z } from "zod";

import {
  unprotectSpreadsheet,
  validateSpreadsheetEdits,
} from "../../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../../src/documents/spreadsheets/workbook";
import {
  serializeSpreadsheetXml,
  spreadsheetXmlChildren,
  spreadsheetXmlElement,
  spreadsheetXmlTree,
} from "../../../src/documents/spreadsheets/xml";
import { spreadsheetBindingsForTemplate } from "../../../src/forms/spreadsheet-fields";
import { createCredentialFixture } from "../../fixtures/http";
import {
  descendants,
  SpreadsheetRuntime,
  xmlTree,
} from "../../spreadsheet-runtime/runtime-fixture";

const origin = new URL(env.SERVER_ORIGIN);
const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
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
const metadata = z
  .object({
    fillUrl: z.url(),
    formId: z.uuid(),
    indicators: z.boolean().optional(),
    namesCount: z.number(),
    title: z.string().optional(),
  })
  .parse(await Bun.file(path.join(directory, "comparison.json")).json());
const form = await prisma.form.findUniqueOrThrow({
  include: { publishedTemplate: true },
  where: { id: metadata.formId },
});
if (
  form.title !== (metadata.title ?? "ตัวเทียบ dropdown มาตรฐาน กับแบบค้นหา") ||
  !form.publishedTemplate
) {
  throw new Error("Comparison Form missing");
}
const accessPath = path.join(directory, "user-access.json");
const accessFile = Bun.file(accessPath);
const accessSchema = z.object({
  email: z.email(),
  password: z.string().min(12),
});
let access: z.infer<typeof accessSchema>;
if (await accessFile.exists()) {
  access = accessSchema.parse(await accessFile.json());
} else {
  access = {
    email: `dropdown-compare-${form.publicId}@example.test`,
    password: `Compare-${crypto.randomUUID()}-aA1!`,
  };
  await createCredentialFixture({
    ...access,
    name: "Dropdown comparison User",
  });
  await writeFile(accessPath, JSON.stringify(access, null, 2), { mode: 0o600 });
}
const signIn = await fetch(`${origin.origin}/api/auth/sign-in/email`, {
  body: JSON.stringify(access),
  headers: { "Content-Type": "application/json", Origin: origin.origin },
  method: "POST",
});
assert.equal(signIn.status, 200, "Comparison User login");
const { token } = z
  .object({ token: z.string().min(1) })
  .parse(await signIn.json());
const request = (url: string, method = "GET") =>
  fetch(`${origin.origin}${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: origin.origin,
    },
    method,
    signal: AbortSignal.timeout(90_000),
  });
const started = await request(`/api/forms/${form.publicId}/start`, "POST");
assert.equal(started.status, 200, "Comparison User starts Form");
const start = z
  .object({ editorConfigUrl: z.string(), response: z.object({ id: z.uuid() }) })
  .parse(await started.json());
const configuration = await request(
  `${start.editorConfigUrl}&pdmsOpeningId=${crypto.randomUUID()}`
);
assert.equal(
  configuration.status,
  200,
  "Comparison User native initialization"
);
const config = z
  .object({
    bridge: z.object({ lease: z.object({ releaseUrl: z.string() }) }),
    pdmsProjectCatalog: z.object({
      names: z.array(z.string()),
      status: z.literal("ready"),
    }),
  })
  .parse(await configuration.json());
let bytes: Uint8Array;
try {
  const exported = await request(
    `/api/responses/${start.response.id}/draft/xlsx`
  );
  assert.equal(exported.status, 200, "Comparison User saved XLSX export");
  bytes = new Uint8Array(await exported.arrayBuffer());
} finally {
  const released = await request(config.bridge.lease.releaseUrl, "DELETE");
  assert.equal(
    released.status,
    200,
    "Comparison User releases its editor lease"
  );
}
await Bun.write(path.join(directory, "runtime-user-blank.xlsx"), bytes);
const bindings = await spreadsheetBindingsForTemplate(
  form.publishedTemplate.id
);
const workbook = readSpreadsheetWorkbook(bytes);
const indicatorNames = Object.entries(workbook.archive)
  .filter(([name]) => /^xl\/drawings\/drawing\d+\.xml$/u.test(name))
  .flatMap(([, drawing]) => descendants(xmlTree(strFromU8(drawing)), "cNvPr"))
  .map((node) => node.attributes.name);
const customDropdownArrowConfigured = indicatorNames.includes(
  "folio_pdms_dropdown_v1_folio_compare_search_row_0"
);
if (metadata.indicators) {
  assert.equal(customDropdownArrowConfigured, true);
}
const contract = resolveSpreadsheetContract(bindings, workbook);
const part = workbook.archive[workbook.sheetPath];
const stylesPart = workbook.archive["xl/styles.xml"];
if (!part || !stylesPart) {
  throw new Error("Comparison runtime workbook parts missing");
}
const sheet = spreadsheetXmlTree(strFromU8(part));
const rules = spreadsheetXmlChildren(sheet, "dataValidations").flatMap((node) =>
  spreadsheetXmlChildren(node, "dataValidation")
);
const nativeRule = rules.find((node) => node.attributes.sqref?.includes("B7"));
assert.equal(nativeRule?.attributes.type, "list");
assert.equal(nativeRule?.attributes.showDropDown, "0");
assert.equal(
  rules.some((node) => node.attributes.sqref?.includes("H7")),
  false
);
const styles = spreadsheetXmlTree(strFromU8(stylesPart));
const [xfs] = spreadsheetXmlChildren(styles, "cellXfs");
if (!xfs) {
  throw new Error("Comparison cell styles missing");
}
const formats = spreadsheetXmlChildren(xfs, "xf");
const lockedAt = (address: string) => {
  const cell = workbook.cells.get(address);
  const format = cell && formats[cell.style];
  if (!format) {
    throw new Error("Comparison input style missing");
  }
  return spreadsheetXmlChildren(format, "protection")[0]?.attributes.locked;
};
assert.equal(lockedAt("B7"), "0");
assert.equal(lockedAt("H7"), "1");
const [name] = config.pdmsProjectCatalog.names;
const native = bindings.fields.find((field) => field.key === "project_native");
assert.ok(
  native && name && native.options.includes(name),
  "Typed native choice belongs to the frozen list"
);
if (!name) {
  throw new Error("Current catalog has no comparison choice");
}
const withValue = (address: string) => {
  const edited = spreadsheetXmlTree(strFromU8(part));
  const [data] = spreadsheetXmlChildren(edited, "sheetData");
  if (!data) {
    throw new Error("Comparison sheet data missing");
  }
  const cell = spreadsheetXmlChildren(data, "row")
    .flatMap((row) => spreadsheetXmlChildren(row, "c"))
    .find((node) => node.attributes.r === address);
  if (!cell) {
    throw new Error("Comparison input cell missing");
  }
  cell.attributes.t = "inlineStr";
  const inline = spreadsheetXmlElement(cell, "is");
  const text = spreadsheetXmlElement(inline, "t", { "xml:space": "preserve" });
  text.children = [name];
  inline.children = [text];
  cell.children = [inline];
  return readSpreadsheetWorkbook(
    zipSync({
      ...workbook.archive,
      [workbook.sheetPath]: strToU8(serializeSpreadsheetXml(edited)),
    })
  );
};
validateSpreadsheetEdits(workbook, withValue("B7"), contract);
assert.throws(
  () => validateSpreadsheetEdits(workbook, withValue("H7"), contract),
  /protected cell/u
);
// Inspect the actual native validation with the pinned vendor runtime. The
// unprotected copy is private to this network-disabled disposable container.
const runtime = new SpreadsheetRuntime();
await runtime.start();
let auditBytes: Uint8Array;
try {
  await runtime.write("comparison.xlsx", unprotectSpreadsheet(bytes));
  await runtime.run(`
    builder.OpenFile("/work/comparison.xlsx");
    var sheet = Api.GetSheet("Form");
    var validation = sheet.GetRange("B7").GetValidation();
    var formula = String(validation.GetFormula1()).replace(/^=/, "");
    sheet.GetRange("P1").SetValue(String(validation.GetType()));
    sheet.GetRange("P2").SetValue(String(validation.GetInCellDropdown()));
    sheet.GetRange("P3").SetValue(formula);
    var source = Api.GetDefName(formula).GetRefersToRange();
    sheet.GetRange("P4").SetValue(source.GetRowsCount());
    builder.SaveFile("xlsx", "/work/native-validation-audit.xlsx");
    builder.CloseFile();
  `);
  auditBytes = await runtime.read("native-validation-audit.xlsx");
} finally {
  await runtime.stop();
}
await Bun.write(
  path.join(directory, "native-validation-audit.xlsx"),
  auditBytes
);
const audit = readSpreadsheetWorkbook(auditBytes);
assert.equal(audit.cells.get("P1")?.value, "xlValidateList");
assert.equal(audit.cells.get("P2")?.value, true);
assert.equal(audit.cells.get("P4")?.value, metadata.namesCount);
const report = {
  catalogReady: true,
  currentNamesCount: config.pdmsProjectCatalog.names.length,
  customCellLocked: true,
  customDirectTypingRejected: true,
  customDropdownArrowConfigured,
  fillUrl: metadata.fillUrl,
  nativeApiListConfirmed: true,
  nativeCellUnlocked: true,
  nativeDropdownArrowConfigured: true,
  nativeTypingAllowed: true,
  snapshotNamesCount: metadata.namesCount,
  userHttpRoundtrip: true,
};
await Bun.write(
  path.join(directory, "verification.json"),
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report));
await prisma.$disconnect();
