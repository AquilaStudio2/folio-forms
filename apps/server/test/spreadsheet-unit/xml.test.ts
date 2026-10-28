import { describe, expect, test } from "bun:test";

import {
  serializeSpreadsheetXml,
  spreadsheetXmlTree,
} from "../../src/documents/spreadsheets/xml";
import type { SpreadsheetXmlNode } from "../../src/documents/spreadsheets/xml";

const roundTrip = (tree: SpreadsheetXmlNode) =>
  spreadsheetXmlTree(serializeSpreadsheetXml(tree));

describe("spreadsheet xml round trip", () => {
  test("preserves newline, tab and CRLF in attributes and text", () => {
    const tree: SpreadsheetXmlNode = {
      attributes: { prompt: "line1\nline2\ttab" },
      children: ["a\r\nb"],
      name: "dataValidation",
    };
    expect(roundTrip(tree)).toEqual(tree);
  });

  test("preserves markup characters and quotes", () => {
    const tree: SpreadsheetXmlNode = {
      attributes: { title: `a & b < c > d "e"` },
      children: [`x & y < z > w "q"`],
      name: "dataValidation",
    };
    expect(roundTrip(tree)).toEqual(tree);
  });
});
