import { describe, expect, test } from "bun:test";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { spreadsheetUploadPocTargets } from "../../src/documents/spreadsheets/upload-poc";
import { readSpreadsheetWorkbook } from "../../src/documents/spreadsheets/workbook";
import { fixtureBindings, fixtureWorkbook } from "./fixture";

const names = {
  folio_agency: "'Form'!$A$1:$B$1",
  folio_body: "'Form'!$A$4:$D$8",
  folio_date: "'Form'!$D$1",
};
describe("display-only upload POC marker boundary", () => {
  test("existing editable text scalar and nested table column opt in without changing answer types", () => {
    const targets = spreadsheetUploadPocTargets(
      fixtureWorkbook({
        names: {
          ...names,
          _folio_upload_poc_folio_agency: names.folio_agency,
          _folio_upload_poc_folio_note: "'Form'!$C$4:$C$8",
        },
      }),
      fixtureBindings()
    );
    expect(targets).toMatchObject([
      { bindingId: "folio_agency", kind: "field", tag: "agency" },
      {
        bindingId: "folio_note",
        bodyAnchor: "folio_body",
        columnOffset: 2,
        kind: "column",
        tag: "activities.note",
      },
    ]);
  });
  test.each([
    {
      marker: "_folio_upload_poc_folio_unknown",
      reference: names.folio_agency,
    },
    { marker: "_folio_upload_poc_folio_date", reference: names.folio_date },
    { marker: "_folio_upload_poc_folio_agency", reference: names.folio_date },
    { marker: "_folio_upload_poc_folio_agency", reference: "#REF!" },
  ])(
    "rejects unknown, wrong type, cross-bound and broken markers: $marker/$reference",
    ({ marker, reference }) => {
      expect(() =>
        spreadsheetUploadPocTargets(
          fixtureWorkbook({ names: { ...names, [marker]: reference } }),
          fixtureBindings()
        )
      ).toThrow(/marker/u);
    }
  );
  test("unmarked workbooks retain their current behavior", () => {
    expect(
      spreadsheetUploadPocTargets(fixtureWorkbook(), fixtureBindings())
    ).toEqual([]);
  });
});

describe("spreadsheet embedded-object validation remains narrow", () => {
  test.each(["xl/embeddingsUnexpected.bin", "xl/embeddings/unknown.bin"])(
    "rejects arbitrary Package OLE at %s",
    (part) => {
      const entries = unzipSync(fixtureWorkbook());
      const sheet = "xl/worksheets/sheet1.xml";
      entries[sheet] = strToU8(
        strFromU8(entries[sheet] ?? new Uint8Array()).replace(
          "</worksheet>",
          '<oleObjects><oleObject progId="Package" shapeId="2048" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="ole1"/></oleObjects></worksheet>'
        )
      );
      entries["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="ole1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="../${part.slice(3)}"/></Relationships>`
      );
      entries[part] = new Uint8Array([1, 2, 3]);
      expect(() => readSpreadsheetWorkbook(zipSync(entries))).toThrow(
        /embedded object/u
      );
    }
  );
  test("rejects the forbidden embeddings prefix even without any OLE reference", () => {
    const entries = unzipSync(fixtureWorkbook());
    entries["xl/embeddingsUnexpected.bin"] = new Uint8Array([1, 2, 3]);
    expect(() => readSpreadsheetWorkbook(zipSync(entries))).toThrow(
      /Unreferenced/u
    );
  });
  test("rejects unrelated OLE references outside the embeddings folder", () => {
    const entries = unzipSync(fixtureWorkbook());
    const sheet = "xl/worksheets/sheet1.xml";
    entries[sheet] = strToU8(
      strFromU8(entries[sheet] ?? new Uint8Array()).replace(
        "</worksheet>",
        '<oleObjects><oleObject progId="Package" shapeId="2048"/></oleObjects></worksheet>'
      )
    );
    expect(() => readSpreadsheetWorkbook(zipSync(entries))).toThrow(
      /Unsupported/u
    );
  });
});
