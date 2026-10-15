import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { SaxesParser } from "saxes";

import { spreadsheetBuilderScript } from "../../src/documents/spreadsheets/builder-script";
import type { SpreadsheetBuilderJob } from "../../src/documents/spreadsheets/builder-script";
import {
  applySpreadsheetPrintAreas,
  prepareSpreadsheetRowFormulas,
} from "../../src/documents/spreadsheets/formula-bindings";
import type { SpreadsheetPrintArea } from "../../src/documents/spreadsheets/formula-bindings";

export const runtimeImage = "onlyoffice/documentserver:9.4.0.1";
const builderPath =
  "/var/www/onlyoffice/documentserver/server/FileConverter/bin/docbuilder";

interface XmlNode {
  attributes: Record<string, string>;
  children: XmlNode[];
  local: string;
  text: string;
  uri: string;
}

export const xmlTree = (xml: string): XmlNode => {
  const root: XmlNode = {
    attributes: {},
    children: [],
    local: "root",
    text: "",
    uri: "",
  };
  const stack = [root];
  const parser = new SaxesParser({ xmlns: true });
  parser.on("opentag", (tag) => {
    const node: XmlNode = {
      attributes: Object.fromEntries(
        Object.values(tag.attributes).map((attribute) => [
          attribute.local,
          attribute.value,
        ])
      ),
      children: [],
      local: tag.local,
      text: "",
      uri: tag.uri,
    };
    stack.at(-1)?.children.push(node);
    stack.push(node);
  });
  parser.on("text", (value) => {
    const node = stack.at(-1);
    if (node) {
      node.text += value;
    }
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.write(xml).close();
  return root;
};

export const descendants = (root: XmlNode, local: string): XmlNode[] =>
  root.children.flatMap((node) => [
    ...(node.local === local ? [node] : []),
    ...descendants(node, local),
  ]);

export const workbookXml = (bytes: Uint8Array) => {
  const entries = unzipSync(bytes);
  const parse = (partName: string) => {
    const entry = entries[partName];
    if (!entry) {
      throw new Error(`Missing workbook part: ${partName}`);
    }
    return xmlTree(strFromU8(entry));
  };
  const sheet = parse("xl/worksheets/sheet1.xml");
  const workbook = parse("xl/workbook.xml");
  const cells = new Map(
    descendants(sheet, "c").map((node) => [node.attributes.r, node])
  );
  const cell = (address: string) => {
    const node = cells.get(address);
    return {
      formula: node?.children.find((child) => child.local === "f")?.text,
      style: node?.attributes.s,
      type: node?.attributes.t,
      value: node?.children.find((child) => child.local === "v")?.text,
    };
  };
  const names = Object.fromEntries(
    descendants(workbook, "definedName").map((node) => [
      node.attributes.name,
      node.text,
    ])
  );
  return { cell, cells, entries, names, parse, sheet };
};

// Deliberately corrupt only the tiny fixture's formula caches. Production code
// must never use regular expressions to manipulate arbitrary worksheet XML.
export const withFormulaCaches = (
  bytes: Uint8Array,
  cache: "stale" | "missing"
): Uint8Array => {
  const entries = unzipSync(bytes);
  const partName = "xl/worksheets/sheet1.xml";
  const entry = entries[partName];
  if (!entry) {
    throw new Error("Calculation fixture is missing its worksheet");
  }
  const xml = strFromU8(entry);
  let modified = 0;
  const changed = xml.replaceAll(/<c\b[^>]*>[\s\S]*?<\/c>/gu, (cell) => {
    if (!cell.includes("<f>")) {
      return cell;
    }
    modified += 1;
    return cell.replace(
      /<v>[^<]*<\/v>/u,
      cache === "stale" ? "<v>999999</v>" : ""
    );
  });
  if (modified !== 3) {
    throw new Error(`Expected three fixture formulas, found ${modified}`);
  }
  entries[partName] = strToU8(changed);
  return zipSync(entries);
};

const command = async (args: string[]): Promise<string> => {
  const child = Bun.spawn(args, { stderr: "pipe", stdout: "pipe" });
  const timer = setTimeout(() => child.kill(), 90_000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) {
      throw new Error(
        `${args.slice(0, 3).join(" ")} exited ${code}\n${stdout}\n${stderr}`
      );
    }
    return stdout;
  } finally {
    clearTimeout(timer);
  }
};

export class SpreadsheetRuntime {
  readonly container = `folio-spreadsheet-runtime-${crypto.randomUUID()}`;
  directory = "";
  private sequence = 0;

  async start(): Promise<void> {
    this.directory = await mkdtemp(
      path.join(tmpdir(), "folio-spreadsheet-runtime-")
    );
    await chmod(this.directory, 0o777);
    // No compose services, application settings, database, ports or network.
    // --pull=never makes the required pinned local image an explicit prerequisite.
    await command([
      "docker",
      "run",
      "--detach",
      "--pull=never",
      "--name",
      this.container,
      "--network=none",
      "--entrypoint=/bin/sh",
      "--volume",
      `${this.directory}:/work`,
      runtimeImage,
      "-c",
      "sleep 3600",
    ]);
  }

  async stop(): Promise<void> {
    try {
      await command(["docker", "rm", "--force", this.container]);
    } finally {
      if (this.directory) {
        await rm(this.directory, { force: true, recursive: true });
      }
    }
  }

  async run(script: string): Promise<void> {
    this.sequence += 1;
    const name = `proof-${this.sequence}.docbuilder`;
    await this.write(name, script);
    await command([
      "docker",
      "exec",
      this.container,
      builderPath,
      `/work/${name}`,
    ]);
  }

  async runJob(
    inputName: string,
    job: Omit<SpreadsheetBuilderJob, "inputUrl">
  ): Promise<void> {
    let printAreas: SpreadsheetPrintArea[] = [];
    let sourceName = inputName;
    let builderJob = job;
    if (job.rowChange) {
      const prepared = prepareSpreadsheetRowFormulas(
        await this.read(inputName),
        job.rowChange
      );
      ({ printAreas } = prepared);
      sourceName = `${job.outputName ?? "canonical.xlsx"}-input.xlsx`;
      await this.write(sourceName, prepared.workbook);
      builderJob = { ...job, formulaBindings: prepared.formulaBindings };
    }
    const inputUrl = `https://fixture.invalid/${sourceName}`;
    // Adapt only transport paths for the network-disabled CLI container. The
    // generated production mutation/recalculation program runs unchanged.
    let script = spreadsheetBuilderScript({ ...builderJob, inputUrl }).replace(
      `builder.OpenFile(${JSON.stringify(inputUrl)});`,
      `builder.OpenFile(${JSON.stringify(`/work/${sourceName}`)});`
    );
    for (const [format, name] of [
      ["xlsx", job.outputName ?? "canonical.xlsx"],
      ["pdf", job.pdfName],
    ] as const) {
      if (name) {
        script = script.replace(
          `builder.SaveFile(${JSON.stringify(format)}, ${JSON.stringify(name)});`,
          `builder.SaveFile(${JSON.stringify(format)}, ${JSON.stringify(`/work/${name}`)});`
        );
      }
    }
    await this.run(script);
    const outputName = job.outputName ?? "canonical.xlsx";
    if (printAreas.length) {
      await this.write(
        outputName,
        applySpreadsheetPrintAreas(await this.read(outputName), printAreas)
      );
      if (job.pdfName) {
        await this.run(
          `builder.OpenFile(${JSON.stringify(`/work/${outputName}`)});\nbuilder.SaveFile("pdf", ${JSON.stringify(`/work/${job.pdfName}`)});\nbuilder.CloseFile();`
        );
      }
    }
  }

  async write(name: string, value: string | Uint8Array): Promise<void> {
    await writeFile(path.join(this.directory, name), value);
  }

  async read(name: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(path.join(this.directory, name)));
  }
}
