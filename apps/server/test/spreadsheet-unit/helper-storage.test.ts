import { describe, expect, test } from "bun:test";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { compactSpreadsheetDraftOptions } from "../../src/documents/spreadsheets/helper-storage";
import { escapeXml, fixtureWorkbook, mutatePart } from "./fixture";

const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const fixture = (extra = "", names = "", custom = "") => {
  const archive = unzipSync(
    fixtureWorkbook({
      cells: [{ address: "A1", type: "s", value: 0 }],
      names: { folio_unfinished: "'Form'!$Z$10" },
      sharedStrings: [
        "ordinary content",
        "folio draft options",
        "orphan,secret",
        "active,choice",
      ],
    })
  );
  archive["xl/workbook.xml"] = strToU8(
    strFromU8(archive["xl/workbook.xml"] as Uint8Array)
      .replace(
        "</sheets>",
        '<sheet name="_folio_options" sheetId="2" state="veryHidden" r:id="rIdOptions"/></sheets>'
      )
      .replace(
        "</definedNames>",
        `<definedName hidden="1" name="_folio_options_draft_1">'_folio_options'!$A$2:$A$2</definedName><definedName hidden="1" name="_folio_options_draft_2">'_folio_options'!$B$2:$B$2</definedName>${names}</definedNames>`
      )
  );
  archive["xl/_rels/workbook.xml.rels"] = strToU8(
    strFromU8(archive["xl/_rels/workbook.xml.rels"] as Uint8Array).replace(
      "</Relationships>",
      '<Relationship Id="rIdOptions" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/options.xml"/></Relationships>'
    )
  );
  archive["xl/worksheets/sheet1.xml"] = strToU8(
    strFromU8(archive["xl/worksheets/sheet1.xml"] as Uint8Array).replace(
      "</worksheet>",
      `<dataValidations count="1"><dataValidation type="list" sqref="D1"><formula1>_folio_options_draft_2</formula1></dataValidation></dataValidations>${extra}</worksheet>`
    )
  );
  archive["xl/worksheets/options.xml"] = strToU8(
    `<worksheet xmlns="${main}"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData><sheetProtection sheet="1" objects="1" password="ABCD"/></worksheet>`
  );
  if (custom) {
    archive["customXml/item1.xml"] = strToU8(custom);
  }
  return zipSync(archive);
};
const part = (bytes: Uint8Array, name: string) =>
  strFromU8(unzipSync(bytes)[name] as Uint8Array);

describe("saved draft dropdown storage", () => {
  test("sweeps orphan cells and names, compacts shared strings, and preserves active and unfinished fields", () => {
    const compacted = compactSpreadsheetDraftOptions(fixture());
    expect(part(compacted, "xl/workbook.xml")).not.toContain(
      'name="_folio_options_draft_1"'
    );
    expect(part(compacted, "xl/workbook.xml")).toContain(
      'name="_folio_options_draft_2"'
    );
    expect(part(compacted, "xl/workbook.xml")).toContain(
      'name="folio_unfinished"'
    );
    expect(part(compacted, "xl/workbook.xml")).toContain('state="veryHidden"');
    const helper = part(compacted, "xl/worksheets/options.xml");
    expect(helper).not.toContain('r="A2"');
    expect(helper).toContain("folio draft options free");
    expect(helper).toContain('r="B2"');
    expect(helper).toContain('password="ABCD"');
    const strings = part(compacted, "xl/sharedStrings.xml");
    expect(strings).not.toContain("orphan,secret");
    expect(strings).toContain("ordinary content");
    expect(strings).toContain("active,choice");
    expect(strings).toContain('uniqueCount="3"');
    expect(part(compacted, "xl/worksheets/sheet1.xml")).toContain("<v>0</v>");
    expect(helper).toContain('<c r="B2" t="s"><v>2</v></c>');
    expect(compactSpreadsheetDraftOptions(compacted)).toBe(compacted);
  });

  for (const [label, extra, names, custom] of [
    [
      "ordinary formulas",
      "<formula>SUM(_folio_options_draft_1)</formula>",
      "",
      "",
    ],
    [
      "extension validation",
      '<extLst><ext><x:dataValidation xmlns:x="fixture"><xm:f xmlns:xm="fixture">_folio_options_draft_1</xm:f></x:dataValidation></ext></extLst>',
      "",
      "",
    ],
    [
      "surviving aliases",
      "",
      '<definedName name="author_alias">_folio_options_draft_1</definedName>',
      "",
    ],
    [
      "arbitrary XML references",
      "",
      "",
      '<custom optionReference="_folio_options_draft_1"/>',
    ],
  ]) {
    test(`preserves helpers referenced by ${label}`, () => {
      const original = fixture(extra, names, custom);
      expect(compactSpreadsheetDraftOptions(original)).toBe(original);
    });
  }

  for (const reference of [
    "'_folio_options'!$A$2",
    'INDIRECT("_folio_options_draft_"&1)',
    "_folio_options:Other!A2",
    "_folio_options ! A2",
  ]) {
    test(`preserves uncertain or direct helper reference ${reference}`, () => {
      const original = fixture(`<formula>${escapeXml(reference)}</formula>`);
      expect(compactSpreadsheetDraftOptions(original)).toBe(original);
    });
  }

  test("pins dynamic references inside native table and arbitrary XML formula constructs", () => {
    for (const custom of [
      '<table><calculatedColumnFormula>INDIRECT("_folio_"&amp;"options_draft_1")</calculatedColumnFormula></table>',
      '<custom expression="INDIRECT(&quot;_folio_&quot;&amp;&quot;options_draft_1&quot;)"/>',
    ]) {
      const original = fixture("", "", custom);
      expect(compactSpreadsheetDraftOptions(original)).toBe(original);
    }
  });

  test("retains duplicate hidden names under worksheet scope when referenced", () => {
    const original = fixture(
      "<formula>_folio_options_draft_1</formula>",
      '<definedName hidden="1" localSheetId="0" name="_folio_options_draft_1">\'_folio_options\'!$A$2:$A$2</definedName>'
    );
    expect(compactSpreadsheetDraftOptions(original)).toBe(original);
  });

  test("leaves workbooks without draft helpers byte-for-byte unchanged", () => {
    const original = fixtureWorkbook();
    expect(compactSpreadsheetDraftOptions(original)).toBe(original);
  });

  test("pins unqualified helper-local formula references", () => {
    const original = mutatePart(fixture(), "xl/worksheets/options.xml", (xml) =>
      xml.replace(
        "</row></sheetData>",
        '<c r="C2"><f>A2</f><v>0</v></c></row></sheetData>'
      )
    );
    expect(compactSpreadsheetDraftOptions(original)).toBe(original);
  });

  for (const localRule of [
    '<dataValidations><dataValidation sqref="C2" type="list"><formula1>A2:A2</formula1></dataValidation></dataValidations>',
    '<conditionalFormatting sqref="C2"><cfRule type="expression"><formula>A2&gt;0</formula></cfRule></conditionalFormatting>',
    '<extLst><ext unknownLocalReference="A2"/></extLst>',
  ]) {
    test(`preserves helper-local rules and unknown worksheet constructs ${localRule}`, () => {
      const original = mutatePart(
        fixture(),
        "xl/worksheets/options.xml",
        (xml) => xml.replace("</worksheet>", `${localRule}</worksheet>`)
      );
      expect(compactSpreadsheetDraftOptions(original)).toBe(original);
    });
  }
});
