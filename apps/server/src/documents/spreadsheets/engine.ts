// oxlint-disable no-await-in-loop complexity -- Stream reads, job polling, and canonicalization guards form one ordered bounded job lifecycle.
import { env } from "@onlyoffice/env/server";
import type { Elysia } from "elysia";

import {
  createDocumentAccessToken,
  verifyDocumentAccessToken,
  createOnlyOfficeAuthorization,
} from "../../onlyoffice";
import { spreadsheetBuilderScript } from "./builder-script";
import type {
  SpreadsheetRowChange,
  SpreadsheetBuilderJob,
} from "./builder-script";
import type { SpreadsheetBindings } from "./contract";
import {
  applySpreadsheetPrintAreas,
  prepareSpreadsheetRowFormulas,
} from "./formula-bindings";
import { applySpreadsheetValidation } from "./validation";
import { XLSX_CONTENT_TYPE } from "./workbook";

interface BuilderJob {
  input: Uint8Array;
  script: string;
  expiresAt: number;
}
const jobs = new Map<string, BuilderJob>();
const maximumFileBytes = 25 * 1024 * 1024;
const maximumJobMs = 3 * 60_000;

export const registerSpreadsheetBuilderRoutes = (app: Elysia): void => {
  app.get("/onlyoffice/spreadsheet-jobs/:id/:part", ({ params, query }) => {
    const job = jobs.get(params.id);
    if (
      !job ||
      job.expiresAt < Date.now() ||
      typeof query.token !== "string" ||
      !verifyDocumentAccessToken(query.token, `spreadsheet-job-${params.id}`)
    ) {
      return new Response("Not found", { status: 404 });
    }
    if (params.part === "input.xlsx") {
      return new Response(new Uint8Array(job.input), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": XLSX_CONTENT_TYPE,
        },
      });
    }
    if (params.part === "script.js") {
      return new Response(job.script, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/javascript",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  });
};

const downloadOutput = async (value: unknown): Promise<Uint8Array> => {
  if (typeof value !== "string") {
    throw new TypeError("Spreadsheet engine returned no output");
  }
  const url = new URL(value);
  const internal = new URL(env.ONLYOFFICE_INTERNAL_URL);
  const allowed = new Set([
    internal.origin,
    new URL(env.ONLYOFFICE_URL).origin,
  ]);
  if (
    !allowed.has(url.origin) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Spreadsheet engine returned a disallowed URL");
  }
  if (url.origin !== internal.origin) {
    url.protocol = internal.protocol;
    url.host = internal.host;
  }
  const response = await fetch(url, {
    headers: {
      Authorization: createOnlyOfficeAuthorization({ url: url.toString() }),
    },
    redirect: "error",
    signal: AbortSignal.timeout(maximumJobMs),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length") ?? 0) > maximumFileBytes
  ) {
    throw new Error("Spreadsheet output could not be downloaded");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Spreadsheet engine returned an empty output");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      size += result.value.byteLength;
      if (size > maximumFileBytes) {
        throw new Error("Spreadsheet output is too large");
      }
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

/** The job's input, script and URLs are constructed server-side and expire together. */
export const processSpreadsheet = async (
  input: Uint8Array,
  options: {
    bindings?: SpreadsheetBindings;
    rowChange?: SpreadsheetRowChange;
    pdf?: boolean;
    heartbeat?: () => Promise<unknown>;
    values?: SpreadsheetBuilderJob["values"];
    clearRanges?: string[];
  } = {}
): Promise<{ workbook: Uint8Array; pdf?: Uint8Array }> => {
  if (input.byteLength > maximumFileBytes) {
    throw new Error("Spreadsheet input is too large");
  }
  const validatedInput = options.bindings
    ? applySpreadsheetValidation(input, options.bindings)
    : input;
  const prepared = options.rowChange
    ? prepareSpreadsheetRowFormulas(validatedInput, options.rowChange)
    : { formulaBindings: [], printAreas: [], workbook: validatedInput };
  if (prepared.workbook.byteLength > maximumFileBytes) {
    throw new Error("Spreadsheet input is too large");
  }
  const renderAfterPrintUpdate = options.pdf && prepared.printAreas.length > 0;
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + maximumJobMs;
  const token = createDocumentAccessToken(
    `spreadsheet-job-${id}`,
    Math.floor(expiresAt / 1000)
  );
  const root = `${env.ONLYOFFICE_DOCUMENT_BASE_URL.replace(/\/+$/u, "")}/onlyoffice/spreadsheet-jobs/${id}`;
  const inputUrl = `${root}/input.xlsx?token=${encodeURIComponent(token)}`;
  const scriptUrl = `${root}/script.js?token=${encodeURIComponent(token)}`;
  const script = spreadsheetBuilderScript({
    clearRanges: options.clearRanges,
    formulaBindings: prepared.formulaBindings,
    inputUrl,
    restorePrototypeValidation: options.bindings === undefined,
    rowChange: options.rowChange,
    values: options.values,
    ...(options.pdf && !renderAfterPrintUpdate
      ? { pdfName: "canonical.pdf" }
      : {}),
  });
  jobs.set(id, { expiresAt, input: prepared.workbook, script });
  const timer = setTimeout(() => jobs.delete(id), maximumJobMs);
  try {
    const endpoint = `${env.ONLYOFFICE_INTERNAL_URL.replace(/\/+$/u, "")}/docbuilder`;
    let key: string | undefined;
    while (Date.now() < expiresAt) {
      const payload = key
        ? { async: true, key }
        : { async: true, url: scriptUrl };
      const response = await fetch(endpoint, {
        body: JSON.stringify(payload),
        headers: {
          Authorization: createOnlyOfficeAuthorization(payload),
          "Content-Type": "application/json",
        },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(Math.max(1, expiresAt - Date.now())),
      });
      if (!response.ok) {
        throw new Error(`Spreadsheet engine failed: HTTP ${response.status}`);
      }
      const result = (await response.json()) as {
        error?: number;
        end?: boolean;
        key?: string;
        urls?: Record<string, unknown>;
      };
      if (result.error) {
        throw new Error(`Spreadsheet engine failed (${result.error})`);
      }
      if (result.end === true) {
        const output = applySpreadsheetPrintAreas(
          await downloadOutput(result.urls?.["canonical.xlsx"]),
          prepared.printAreas
        );
        const workbook = options.bindings
          ? applySpreadsheetValidation(output, options.bindings)
          : output;
        if (workbook.byteLength > maximumFileBytes) {
          throw new Error("Spreadsheet output is too large");
        }
        if (renderAfterPrintUpdate) {
          return await processSpreadsheet(workbook, {
            bindings: options.bindings,
            heartbeat: options.heartbeat,
            pdf: true,
          });
        }
        const pdf = options.pdf
          ? await downloadOutput(result.urls?.["canonical.pdf"])
          : undefined;
        return { workbook, ...(pdf ? { pdf } : {}) };
      }
      if (typeof result.key !== "string") {
        throw new TypeError("Spreadsheet engine returned an invalid job");
      }
      ({ key } = result);
      await options.heartbeat?.();
      await Bun.sleep(250);
    }
    throw new Error("Spreadsheet engine timed out");
  } finally {
    clearTimeout(timer);
    jobs.delete(id);
  }
};
