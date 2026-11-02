// Real Folio export seam; DB reads only find fixture identity/session for authorization.
import assert from "node:assert/strict";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../../src/app";
import { readSpreadsheetWorkbook } from "../../../src/documents/spreadsheets/workbook";

const fixture = await Bun.file(
  "/tmp/folio-pdms-implementation/notes/01-session.json"
).json();
const response = await prisma.response.findUniqueOrThrow({
  where: { id: fixture.responseId },
});
const session = await prisma.session.findFirstOrThrow({
  orderBy: { createdAt: "desc" },
  where: { userId: response.userId },
});
const app = createApp({ legacySso: null, omniRoute: null });
const headers = { Authorization: `Bearer ${session.token}` };
const dataResponse = await app.handle(
  new Request(`http://test.local/api/responses/${response.id}/draft/json`, {
    headers,
  })
);
assert.equal(dataResponse.status, 200);
const data = (await dataResponse.json()) as {
  project: string;
  note: string;
  items: { note: string }[];
};
const workbookResponse = await app.handle(
  new Request(`http://test.local/api/responses/${response.id}/draft/xlsx`, {
    headers,
  })
);
assert.equal(workbookResponse.status, 200);
const bytes = new Uint8Array(await workbookResponse.arrayBuffer());
const workbook = readSpreadsheetWorkbook(bytes);
assert.equal(
  data.project,
  process.env.PDMS_EXPECTED_PROJECT ?? "โครงการทดสอบ 2499"
);
assert.equal(workbook.cells.get("A1")?.value, data.project);
assert.equal(workbook.cells.get("C1")?.value, data.note);
assert.equal(workbook.cells.get("B4")?.value, data.items[0]?.note);
await Bun.write("/tmp/folio-pdms-implementation/notes/01-saved.xlsx", bytes);
console.log(
  JSON.stringify({
    data,
    merged: workbook.merges,
    result: "Public JSON and XLSX exports agree",
  })
);
await prisma.$disconnect();
