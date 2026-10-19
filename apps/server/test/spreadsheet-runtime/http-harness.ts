// Requires the disposable ONLYOFFICE service configured in the test environment.
// No database client or storage implementation is imported.
import assert from "node:assert/strict";

import { Elysia } from "elysia";

import {
  processSpreadsheet,
  registerSpreadsheetBuilderRoutes,
} from "../../src/documents/spreadsheets/engine";
import {
  fixtureBindings,
  fixtureWorkbook,
  mutatePart,
} from "../spreadsheet-unit/fixture";
import { descendants, workbookXml } from "./runtime-fixture";

const app = new Elysia();
registerSpreadsheetBuilderRoutes(app);
app.listen({ hostname: "0.0.0.0", port: 18_183 });
try {
  const bindings = fixtureBindings();
  const [agency] = bindings.fields;
  if (!agency) {
    throw new Error("Missing fixture agency");
  }
  agency.type = "dropdown";
  agency.options = [
    "Comma,value",
    "Semi;colon",
    ...Array.from({ length: 300 }, (_, index) => `Option ${index}`),
  ];
  const fixture = mutatePart(
    fixtureWorkbook(),
    "xl/worksheets/sheet1.xml",
    (xml) => xml.replace("<f>A4*2</f><v>0</v>", "<f>A4*2</f><v>999</v>")
  );
  const result = await processSpreadsheet(fixture, {
    bindings,
    pdf: true,
    values: [{ address: "A4", value: 3 }],
  });
  const actual = workbookXml(result.workbook);
  assert.equal(actual.cell("D4").value, "6");
  assert.equal(actual.cell("D4").formula, "A4*2");
  assert.equal(new TextDecoder().decode(result.pdf?.subarray(0, 5)), "%PDF-");
  const inserted = await processSpreadsheet(result.workbook, {
    bindings,
    rowChange: {
      action: "insert",
      bodyName: "folio_body",
      index: 1,
      inputColumns: [0, 1, 2],
    },
  });
  const grown = workbookXml(inserted.workbook);
  assert.equal(grown.names.folio_body?.replaceAll("'", ""), "Form!$A$4:$D$9");
  assert.equal(grown.cell("A4").value, "3");
  assert.equal(grown.cell("A5").value, undefined);
  assert.equal(grown.cell("D5").formula, "A5*2");
  assert.equal(grown.cell("D5").value, "0");
  const helper = grown.parse("xl/worksheets/folio-options.xml");
  assert.deepEqual(
    descendants(helper, "t").map((node) => node.text),
    [...agency.options, "TRUE", "FALSE"]
  );
  assert.equal(
    descendants(grown.parse("xl/workbook.xml"), "sheet").find(
      (sheet) => sheet.attributes.name === "_folio_options"
    )?.attributes.state,
    "veryHidden"
  );
  assert.equal(
    descendants(grown.sheet, "dataValidation").find(
      (rule) => rule.attributes.sqref === "B4:B9"
    )?.attributes.type,
    "list"
  );
  process.stdout.write("real HTTP builder passed\n");
} finally {
  await app.stop();
}
