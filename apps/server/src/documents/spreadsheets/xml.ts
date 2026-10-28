import { SaxesParser } from "saxes";

export interface SpreadsheetXmlNode {
  name: string;
  attributes: Record<string, string>;
  children: (SpreadsheetXmlNode | string)[];
}

export const spreadsheetXmlTree = (xml: string): SpreadsheetXmlNode => {
  const parser = new SaxesParser({ xmlns: false });
  const stack: SpreadsheetXmlNode[] = [];
  let root: SpreadsheetXmlNode | undefined;
  parser.on("doctype", () => {
    throw new Error("Document types are not allowed");
  });
  parser.on("opentag", (tag) => {
    const node: SpreadsheetXmlNode = {
      attributes: tag.attributes as Record<string, string>,
      children: [],
      name: tag.name,
    };
    const parent = stack.at(-1);
    if (parent) {
      parent.children.push(node);
    } else {
      root = node;
    }
    stack.push(node);
  });
  parser.on("text", (text) => stack.at(-1)?.children.push(text));
  parser.on("cdata", (text) => stack.at(-1)?.children.push(text));
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.write(xml).close();
  if (!root) {
    throw new Error("Missing XML root");
  }
  return root;
};

export const spreadsheetXmlChildren = (
  node: SpreadsheetXmlNode,
  local: string
): SpreadsheetXmlNode[] =>
  node.children.filter(
    (child): child is SpreadsheetXmlNode =>
      typeof child !== "string" && child.name.split(":").at(-1) === local
  );

const escapeText = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", "&#13;");
export const serializeSpreadsheetXml = (node: SpreadsheetXmlNode): string => {
  const attributes = Object.entries(node.attributes)
    .map(
      ([key, value]) =>
        ` ${key}="${escapeText(value).replaceAll('"', "&quot;").replaceAll("\n", "&#10;").replaceAll("\t", "&#9;")}"`
    )
    .join("");
  return `<${node.name}${attributes}>${node.children.map((child) => (typeof child === "string" ? escapeText(child) : serializeSpreadsheetXml(child))).join("")}</${node.name}>`;
};

export const spreadsheetXmlElement = (
  parent: SpreadsheetXmlNode,
  local: string,
  attributes: Record<string, string> = {}
): SpreadsheetXmlNode => ({
  attributes,
  children: [],
  name: parent.name.includes(":")
    ? `${parent.name.split(":")[0]}:${local}`
    : local,
});
