import { describe, expect, test } from "bun:test";
// oxlint-disable no-script-url -- Unsupported protocols are intentional rejection fixtures.

import { strToU8, unzipSync, zipSync } from "fflate";

import {
  parseTemplateXml,
  validateOfficeRelationshipsBytes,
} from "../../src/documents/package";
import { compactSpreadsheetDraftOptions } from "../../src/documents/spreadsheets/helper-storage";
import {
  protectSpreadsheet,
  unprotectSpreadsheet,
  validateSpreadsheetEdits,
} from "../../src/documents/spreadsheets/protection";
import { applySpreadsheetValidation } from "../../src/documents/spreadsheets/validation";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import { HttpError } from "../../src/http/errors";
import { cellHyperlinkFixture } from "../fixtures/spreadsheet-hyperlinks";
import { fixtureBindings, fixtureWorkbook, mutatePart } from "./fixture";

describe("Excel web hyperlinks", () => {
  test.each([
    "https://example.com/report?a=1&b=2#section",
    "http://intranet.example.test/report",
  ])(
    "accepts a cell hyperlink to %s through saved-workbook transformations",
    (target) => {
      const bytes = cellHyperlinkFixture(fixtureWorkbook(), { target });
      const workbook = readSpreadsheetWorkbook(bytes);
      expect(workbook.hyperlinks).toMatchObject([
        { target, tooltip: "Report" },
      ]);
      const contract = resolveSpreadsheetContract(fixtureBindings(), workbook);
      const transformed = compactSpreadsheetDraftOptions(
        applySpreadsheetValidation(
          protectSpreadsheet(unprotectSpreadsheet(bytes), contract),
          fixtureBindings()
        )
      );
      expect(readSpreadsheetWorkbook(transformed).hyperlinks).toEqual(
        workbook.hyperlinks
      );
    }
  );

  test.each([
    "javascript:alert(1)",
    "file:///tmp/report.xlsx",
    "mailto:person@example.test",
    "data:text/html,hello",
    "//example.com/report",
    "https:example.com",
    "https://",
    "https://example.com/\nreport",
  ])(
    "rejects unsupported hyperlink target %s with the real reason",
    (target) => {
      expect(() =>
        readSpreadsheetWorkbook(
          cellHyperlinkFixture(fixtureWorkbook(), { target })
        )
      ).toThrow("Excel hyperlinks must use an absolute HTTP or HTTPS URL");
    }
  );

  test.each(["image", "externalLinkPath", "oleObject", "attachedTemplate"])(
    "still rejects an external %s relationship",
    (relationshipType) => {
      expect(() =>
        readSpreadsheetWorkbook(
          cellHyperlinkFixture(fixtureWorkbook(), { relationshipType })
        )
      ).toThrow("External document resources are not allowed");
    }
  );

  test("keeps the default DOCX relationship policy strict", () => {
    expect(() =>
      validateOfficeRelationshipsBytes(cellHyperlinkFixture(fixtureWorkbook()))
    ).toThrow("External document resources are not allowed");
  });

  test("does not allow hyperlink types outside a worksheet relationship part", () => {
    const archive = unzipSync(cellHyperlinkFixture(fixtureWorkbook()));
    const relation = archive["xl/worksheets/_rels/sheet1.xml.rels"];
    if (!relation) {
      throw new Error("Missing test relationship");
    }
    delete archive["xl/worksheets/_rels/sheet1.xml.rels"];
    archive["xl/_rels/other.xml.rels"] = relation;
    expect(() => readSpreadsheetWorkbook(zipSync(archive))).toThrow(
      "External document resources are not allowed"
    );
  });

  test.each(["reference", "placement"])(
    "rejects invalid hyperlink %s",
    (change) => {
      const bytes = mutatePart(
        cellHyperlinkFixture(fixtureWorkbook()),
        "xl/worksheets/sheet1.xml",
        (xml) =>
          change === "reference"
            ? xml.replace('r:id="rIdWebFixture"', 'r:id="missing"')
            : xml.replaceAll("hyperlinks", "extLst")
      );
      expect(() => readSpreadsheetWorkbook(bytes)).toThrow(
        "External document resources are not allowed"
      );
    }
  );

  test("rejects a hyperlink relationship reused by a drawing", () => {
    const bytes = mutatePart(
      cellHyperlinkFixture(fixtureWorkbook()),
      "xl/worksheets/sheet1.xml",
      (xml) =>
        xml.replace(
          "</worksheet>",
          '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdWebFixture"/></worksheet>'
        )
    );
    expect(() => readSpreadsheetWorkbook(bytes)).toThrow(
      "External document resources are not allowed"
    );
  });

  test("rejects duplicate relationship IDs instead of allowing an image to impersonate a hyperlink", () => {
    const bytes = mutatePart(
      cellHyperlinkFixture(fixtureWorkbook()),
      "xl/worksheets/_rels/sheet1.xml.rels",
      (xml) =>
        xml.replace(
          "</Relationships>",
          '<Relationship Id="rIdWebFixture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/image.png" TargetMode="External"/></Relationships>'
        )
    );
    expect(() => readSpreadsheetWorkbook(bytes)).toThrow(
      "Duplicate document relationship ID"
    );
  });

  test("preserves domain errors raised by XML visitors", () => {
    const error = new HttpError(
      422,
      "invalid_template",
      "External document resources are not allowed"
    );
    expect(() =>
      parseTemplateXml("<root/>", {
        open: () => {
          throw error;
        },
      })
    ).toThrow(error);
  });

  test("hyperlink-only changes respect locked fields and fixed cells", () => {
    const previous = readSpreadsheetWorkbook(fixtureWorkbook());
    const contract = resolveSpreadsheetContract(fixtureBindings(), previous);
    const current = readSpreadsheetWorkbook(
      cellHyperlinkFixture(fixtureWorkbook())
    );
    expect(() =>
      validateSpreadsheetEdits(previous, current, contract)
    ).not.toThrow();
    expect(() =>
      validateSpreadsheetEdits(previous, current, contract, new Set(["agency"]))
    ).toThrow("A protected cell hyperlink was changed");
    const fixed = readSpreadsheetWorkbook(
      cellHyperlinkFixture(fixtureWorkbook(), { reference: "A3" })
    );
    expect(() => validateSpreadsheetEdits(previous, fixed, contract)).toThrow(
      "A protected cell hyperlink was changed"
    );
  });

  test("reports malformed XML without calling an Excel file DOCX", () => {
    const archive = unzipSync(fixtureWorkbook());
    archive["xl/workbook.xml"] = strToU8("<workbook>");
    expect(() => readSpreadsheetWorkbook(zipSync(archive))).toThrow(
      "The document package contains invalid XML"
    );
  });
});
