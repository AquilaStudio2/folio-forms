import { fail } from "../../http/errors";
import {
  parseTemplateXml,
  templateArchiveText,
  templateAttribute,
  templateOfficeRelationshipNamespaces,
  validateOfficeRelationships,
} from "../package";
import type { TemplateXmlElement } from "../package";
import { parseSpreadsheetRange } from "./contract";
import type { SpreadsheetRange } from "./contract";

const mainNamespace =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeNamespace =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
// oxlint-disable-next-line no-control-regex -- URL parsing silently discards some control characters.
const unsafeWebUrlCharacters = /[\s\\\u0000-\u001F\u007F]/u;

export interface SpreadsheetHyperlink {
  range: SpreadsheetRange;
  target: string;
  tooltip?: string;
}

export const isSpreadsheetWebUrl = (target: string): boolean => {
  if (!/^https?:\/\//iu.test(target) || unsafeWebUrlCharacters.test(target)) {
    return false;
  }
  try {
    const url = new URL(target);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
};

type CellLink = Omit<SpreadsheetHyperlink, "target"> & { location?: string };

/** An allowed relationship must be referenced exclusively by real worksheet cell hyperlinks. */
const cellReferences = (
  archive: Record<string, Uint8Array>,
  sourcePath: string
): Map<string, CellLink[]> => {
  const candidates = new Map<string, CellLink[]>();
  const otherUses = new Set<string>();
  const parents: TemplateXmlElement[] = [];
  parseTemplateXml(templateArchiveText(archive, sourcePath), {
    close: () => {
      parents.pop();
    },
    open: (element) => {
      const cellLink =
        parents.length === 2 &&
        parents[0]?.local === "worksheet" &&
        parents[0].uri === mainNamespace &&
        parents[1]?.local === "hyperlinks" &&
        parents[1].uri === mainNamespace &&
        element.local === "hyperlink" &&
        element.uri === mainNamespace;
      for (const attribute of element.attributes) {
        if (!templateOfficeRelationshipNamespaces.has(attribute.uri)) {
          continue;
        }
        if (!cellLink || attribute.local !== "id") {
          otherUses.add(attribute.value);
          continue;
        }
        let range: SpreadsheetRange;
        try {
          range = parseSpreadsheetRange(
            `Form!${templateAttribute(element, "ref") ?? ""}`
          );
        } catch {
          fail(
            422,
            "invalid_template",
            "Excel hyperlink has an invalid cell range"
          );
        }
        const link: CellLink = {
          range,
          ...(templateAttribute(element, "tooltip")
            ? { tooltip: templateAttribute(element, "tooltip") }
            : {}),
          ...(templateAttribute(element, "location")
            ? { location: templateAttribute(element, "location") }
            : {}),
        };
        const links = candidates.get(attribute.value) ?? [];
        links.push(link);
        candidates.set(attribute.value, links);
      }
      parents.push(element);
    },
  });
  for (const id of otherUses) {
    candidates.delete(id);
  }
  return candidates;
};

/** XLSX permits HTTP(S) cell hyperlinks. Every other external resource keeps the default rejection. */
export const validateSpreadsheetRelationships = (
  archive: Record<string, Uint8Array>
): Map<string, SpreadsheetHyperlink[]> => {
  const references = new Map<string, Map<string, CellLink[]>>();
  const hyperlinks = new Map<string, SpreadsheetHyperlink[]>();
  validateOfficeRelationships(archive, {
    allowExternalRelationship: ({ archivePath, element }) => {
      const filename =
        /^xl\/worksheets\/_rels\/(?<filename>[^/]+\.xml)\.rels$/u.exec(
          archivePath
        )?.groups?.filename;
      if (
        !filename ||
        templateAttribute(element, "Type") !== `${officeNamespace}/hyperlink` ||
        templateAttribute(element, "TargetMode")?.trim().toLowerCase() !==
          "external"
      ) {
        return false;
      }
      const sourcePath = `xl/worksheets/${filename}`;
      if (!archive[sourcePath]) {
        return false;
      }
      let sourceReferences = references.get(sourcePath);
      if (!sourceReferences) {
        sourceReferences = cellReferences(archive, sourcePath);
        references.set(sourcePath, sourceReferences);
      }
      const links = sourceReferences.get(
        templateAttribute(element, "Id") ?? ""
      );
      if (!links?.length) {
        return false;
      }
      const target = templateAttribute(element, "Target") ?? "";
      if (!isSpreadsheetWebUrl(target)) {
        fail(
          422,
          "invalid_template",
          "Excel hyperlinks must use an absolute HTTP or HTTPS URL"
        );
      }
      const saved = hyperlinks.get(sourcePath) ?? [];
      for (const link of links) {
        const url = new URL(target);
        if (link.location) {
          url.hash = link.location;
        }
        saved.push({
          range: link.range,
          target: link.location ? url.href : target,
          ...(link.tooltip ? { tooltip: link.tooltip } : {}),
        });
      }
      hyperlinks.set(sourcePath, saved);
      return true;
    },
  });
  return hyperlinks;
};
