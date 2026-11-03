import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { escapeXml } from "../spreadsheet-unit/fixture";

export const cellHyperlinkFixture = (
  bytes: Uint8Array,
  {
    target = "https://example.com/report?a=1&b=2#section",
    reference = "A1",
    relationshipType = "hyperlink",
  }: {
    target?: string;
    reference?: string;
    relationshipType?: string;
  } = {}
): Uint8Array => {
  const archive = unzipSync(bytes);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const source = archive[sheetPath];
  if (!source) {
    throw new Error("Missing fixture worksheet");
  }
  const sheet = strFromU8(source);
  const link = `<hyperlink xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ref="${escapeXml(reference)}" r:id="rIdWebFixture" tooltip="Report"/>`;
  archive[sheetPath] = strToU8(
    sheet.replace(
      "</worksheet>",
      `<hyperlinks>${link}</hyperlinks></worksheet>`
    )
  );
  const path = "xl/worksheets/_rels/sheet1.xml.rels";
  const relationships = archive[path]
    ? strFromU8(archive[path])
    : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  archive[path] = strToU8(
    relationships.replace(
      "</Relationships>",
      `<Relationship Id="rIdWebFixture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${relationshipType}" Target="${escapeXml(target)}" TargetMode="External"/></Relationships>`
    )
  );
  return zipSync(archive);
};
