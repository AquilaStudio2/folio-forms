import { env } from "@onlyoffice/env/server";
import { z } from "zod";

export interface PdmsProjectsConfiguration {
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
}
export const pdmsProjectSourceEnabled = (): boolean =>
  env.NODE_ENV !== "production";

export const pdmsProjectsConfigurationFromEnv =
  (): PdmsProjectsConfiguration | null =>
    env.ONGOING_API_URL && env.X_ONGOING_SECRET
      ? { baseUrl: env.ONGOING_API_URL, secret: env.X_ONGOING_SECRET }
      : null;

const projectNames = z
  .array(
    z.object({
      confirmation_document_number: z.string().trim().min(1),
      name: z.string().nullable().optional(),
    })
  )
  .max(100_000);

export const loadPdmsProjectNames = async (
  configuration: PdmsProjectsConfiguration | null
): Promise<string[]> => {
  if (!configuration) {
    throw new Error("pdms_unavailable");
  }
  const url = new URL(configuration.baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("pdms_unavailable");
  }
  const base = url.pathname.replace(/\/+$/u, "");
  url.pathname = `${base.endsWith("/api") ? base : `${base}/api`}/pages/projects/names-and-doc-numbers`;
  const abort = AbortSignal.timeout(configuration.timeoutMs ?? 15_000);
  // Do not follow a redirect with the service credential to another endpoint.
  const response = await fetch(url, {
    headers: { "ongoing-secret-token": configuration.secret },
    redirect: "error",
    signal: abort,
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length") ?? 0) > 8 * 1024 * 1024
  ) {
    throw new Error("pdms_unavailable");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("pdms_unavailable");
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Bound the response while consuming its stream sequentially.
      const part = await reader.read();
      if (part.done) {
        break;
      }
      length += part.value.byteLength;
      if (length > 8 * 1024 * 1024) {
        throw new Error("pdms_unavailable");
      }
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const rows = projectNames.parse(JSON.parse(new TextDecoder().decode(body)));
  return [
    ...new Set(
      rows.flatMap((row) =>
        typeof row.name === "string" && row.name.trim() ? [row.name] : []
      )
    ),
  ];
};
