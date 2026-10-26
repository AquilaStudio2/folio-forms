// oxlint-disable complexity -- Every bounded CFB and JSON validation branch rejects unsupported embedded content.
import { templateArchiveText } from "../package";
import { responsePictureRelationships } from "../pictures";
import { uploadPocGuid } from "./upload-poc-preview";
import { spreadsheetXmlTree } from "./xml";
import type { SpreadsheetXmlNode } from "./xml";

const descendants = (
  node: SpreadsheetXmlNode,
  local: string
): SpreadsheetXmlNode[] => [
  ...(node.name.split(":").at(-1) === local ? [node] : []),
  ...node.children.flatMap((child) =>
    typeof child === "string" ? [] : descendants(child, local)
  ),
];

const invalid = (): never => {
  throw new Error("Invalid embedded upload POC metadata");
};

/** Only the tiny native JSON package emitted for this POC is accepted, never a general embedded file. */
export const readUploadPocMetadata = (
  bytes: Uint8Array
): { bindingId: string; tag: string; rowIndex?: number | null } => {
  if (
    bytes.length < 2560 ||
    bytes.length > 16 * 1024 ||
    bytes.length % 512 !== 0 ||
    ![0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
      (value, index) => bytes[index] === value
    )
  ) {
    return invalid();
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const uint = (offset: number): number =>
    offset >= 0 && offset + 4 <= bytes.length
      ? view.getUint32(offset, true)
      : invalid();
  if (
    view.getUint16(26, true) !== 3 ||
    view.getUint16(28, true) !== 0xff_fe ||
    view.getUint16(30, true) !== 9 ||
    view.getUint16(32, true) !== 6 ||
    uint(44) !== 1 ||
    uint(56) !== 4096 ||
    uint(64) !== 1 ||
    uint(72) !== 0
  ) {
    return invalid();
  }
  const sector = (id: number): Uint8Array =>
    id < bytes.length / 512 - 1
      ? bytes.subarray((id + 1) * 512, (id + 2) * 512)
      : invalid();
  const fat = sector(uint(76));
  // oxlint-disable-next-line consistent-function-scoping -- Keep the bounded compound-file reader local to this intentionally narrow format.
  const chain = (
    start: number,
    table: Uint8Array,
    source: (id: number) => Uint8Array
  ): Uint8Array => {
    const chunks: Uint8Array[] = [];
    const visited = new Set<number>();
    let id = start;
    while (id !== 0xff_ff_ff_fe) {
      if (visited.has(id) || id * 4 + 4 > table.length || visited.size > 128) {
        return invalid();
      }
      visited.add(id);
      chunks.push(source(id));
      id = new DataView(
        table.buffer,
        table.byteOffset,
        table.byteLength
      ).getUint32(id * 4, true);
    }
    const output = new Uint8Array(
      chunks.reduce((size, part) => size + part.length, 0)
    );
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  };
  const directory = chain(uint(48), fat, sector);
  const streams = new Map<
    string,
    { start: number; size: number; type: number }
  >();
  for (let offset = 0; offset < directory.length; offset += 128) {
    const item = new DataView(
      directory.buffer,
      directory.byteOffset + offset,
      128
    );
    const type = item.getUint8(66);
    if (type === 0) {
      continue;
    }
    const length = item.getUint16(64, true);
    if (
      length < 2 ||
      length > 64 ||
      length % 2 ||
      item.getUint32(124, true) !== 0
    ) {
      return invalid();
    }
    const name = new TextDecoder("utf-16le", { fatal: true }).decode(
      directory.subarray(offset, offset + length - 2)
    );
    if (
      streams.has(name) ||
      ![
        "Root Entry",
        "\u0001CompObj",
        "\u0003ObjInfo",
        "\u0001Ole10Native",
      ].includes(name)
    ) {
      return invalid();
    }
    streams.set(name, {
      size: item.getUint32(120, true),
      start: item.getUint32(116, true),
      type,
    });
  }
  const root = streams.get("Root Entry");
  const native = streams.get("\u0001Ole10Native");
  if (
    streams.size !== 4 ||
    !root ||
    root.type !== 5 ||
    root.size > 4096 ||
    !native ||
    native.type !== 2 ||
    native.size < 5 ||
    native.size > 2048 ||
    streams.get("\u0001CompObj")?.type !== 2 ||
    streams.get("\u0003ObjInfo")?.type !== 2 ||
    streams.get("\u0001CompObj")?.size !== 76 ||
    streams.get("\u0003ObjInfo")?.size !== 6
  ) {
    return invalid();
  }
  const miniRoot = chain(root.start, fat, sector).subarray(0, root.size);
  const miniFat = chain(uint(60), fat, sector);
  const nativeBytes = chain(native.start, miniFat, (id) =>
    id * 64 + 64 <= miniRoot.length
      ? miniRoot.subarray(id * 64, id * 64 + 64)
      : invalid()
  ).subarray(0, native.size);
  if (
    nativeBytes.length !== native.size ||
    new DataView(
      nativeBytes.buffer,
      nativeBytes.byteOffset,
      nativeBytes.length
    ).getUint32(0, true) !==
      native.size - 4
  ) {
    return invalid();
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(nativeBytes.subarray(4))
    );
  } catch {
    return invalid();
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return invalid();
  }
  const value = metadata as Record<string, unknown>;
  if (
    ![
      "bindingId,kind,tag,version",
      "bindingId,kind,rowIndex,tag,version",
    ].includes(Object.keys(value).toSorted().join(",")) ||
    value.kind !== "folio-upload-poc" ||
    value.version !== 1 ||
    typeof value.bindingId !== "string" ||
    !/^folio_[A-Za-z0-9_]+$/u.test(value.bindingId) ||
    typeof value.tag !== "string" ||
    value.tag.length > 200 ||
    !/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/u.test(value.tag)
  ) {
    return invalid();
  }
  if (
    "rowIndex" in value &&
    (value.tag.includes(".")
      ? !Number.isSafeInteger(value.rowIndex) ||
        Number(value.rowIndex) < 0 ||
        Number(value.rowIndex) >= 1_048_576
      : value.rowIndex !== null)
  ) {
    return invalid();
  }
  return {
    bindingId: value.bindingId,
    tag: value.tag,
    ...("rowIndex" in value
      ? { rowIndex: value.rowIndex as number | null }
      : {}),
  };
};

export const validateUploadPocEmbeddings = (
  archive: Record<string, Uint8Array>,
  sheetPath: string
): void => {
  const parts = Object.keys(archive).filter((name) =>
    /^xl\/embeddings/iu.test(name)
  );
  const sheet = spreadsheetXmlTree(templateArchiveText(archive, sheetPath));
  const relationships = responsePictureRelationships(archive, sheetPath);
  const allowed = new Set<string>();
  for (const object of descendants(sheet, "oleObject")) {
    const id = Object.entries(object.attributes).find(
      ([key]) => key.split(":").at(-1) === "id"
    )?.[1];
    const target = id && relationships.get(id);
    if (
      object.attributes.progId !== uploadPocGuid ||
      !target ||
      !/^xl\/embeddings\/oleObject\d+\.bin$/u.test(target) ||
      !archive[target]
    ) {
      throw new Error("Unsupported spreadsheet embedded object");
    }
    readUploadPocMetadata(archive[target]);
    allowed.add(target);
  }
  if (parts.some((part) => !allowed.has(part))) {
    throw new Error("Unreferenced spreadsheet embedded object");
  }
};
