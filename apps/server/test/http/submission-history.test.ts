// oxlint-disable no-await-in-loop complexity unicorn/no-await-expression-member -- Each case checks one ordered history across API, storage and transaction boundaries.
import { expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";
import { strToU8, unzipSync, zipSync } from "fflate";

import { createApp } from "../../src/app";
import { blankSpreadsheet } from "../../src/documents/spreadsheets/blank";
import { spreadsheetManifestFieldData } from "../../src/forms/spreadsheet-fields";
import { operationMetadata } from "../../src/operations/model";
import { completeCorrectionOperation } from "../../src/operations/response-completion";
import { putObject, readObject } from "../../src/storage";
import {
  contentControl,
  contentControlDocument,
  docxXmlFixture,
} from "../fixtures/documents";
import {
  bearerFor,
  createCredentialFixture,
  jsonHeaders,
} from "../fixtures/http";
import type { EditorConfigBody } from "../fixtures/http";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "History HTTP tests require an isolated PostgreSQL DATABASE_URL"
  );
}

const forceSaveWaiters = new Map<string, () => void>();
const app = createApp({
  legacySso: null,
  onlyOffice: {
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-test")),
    // Hold the save at its callback boundary so stale-submission races are deterministic.
    forceSave: (documentKey) => {
      forceSaveWaiters.get(documentKey)?.();
      return Promise.resolve(true);
    },
  },
});
const bindings = {
  fields: [
    {
      anchor: "folio_name",
      computed: false,
      id: "folio_name",
      key: "name",
      label: "Name",
      options: [],
      placeholder: null,
      prefillPointer: null,
      prefillPolicy: "editable" as const,
      required: false,
      type: "text" as const,
    },
  ],
  table: null,
  version: 1 as const,
};
const documentFixture = (kind: "docx" | "xlsx", value: string) => {
  if (kind === "docx") {
    return docxXmlFixture({
      document: contentControlDocument(
        contentControl({
          alias: "Name",
          tag: "name",
          type: "<w:text/>",
        }).replace("fixture", value)
      ),
    });
  }
  const archive = unzipSync(blankSpreadsheet());
  archive["xl/workbook.xml"] = strToU8(
    new TextDecoder()
      .decode(archive["xl/workbook.xml"])
      .replace(
        "</workbook>",
        '<definedNames><definedName name="folio_name">Form!$A$1</definedName></definedNames></workbook>'
      )
  );
  archive["xl/worksheets/sheet1.xml"] = strToU8(
    new TextDecoder()
      .decode(archive["xl/worksheets/sheet1.xml"])
      .replace(
        "<sheetData/>",
        `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${value}</t></is></c></row></sheetData>`
      )
  );
  return zipSync(archive);
};

for (const kind of ["docx", "xlsx"] as const) {
  test(`${kind}: a second submission never inherits the first submission's corrections`, async () => {
    const password = "History-regression-password!";
    const admin = await createCredentialFixture({
      email: `history-${crypto.randomUUID()}@example.test`,
      name: "History Admin",
      password,
      role: "admin",
    });
    const bearer = await bearerFor(app, admin.email, password);
    const headers = { Authorization: `Bearer ${bearer}` };
    const get = (path: string) =>
      app.handle(new Request(`http://test.local${path}`, { headers }));
    const publicId = crypto.randomUUID().replaceAll("-", "");
    const formId = crypto.randomUUID();
    const artifact = async (value: string) => {
      const key = `tests/history/${formId}/${crypto.randomUUID()}/${kind}`;
      await putObject(key, documentFixture(kind, value));
      return key;
    };
    const form = await prisma.form.create({
      data: {
        documentKind: kind,
        id: formId,
        publicId,
        publishedTemplate: {
          create: {
            contentHash: "fixture",
            documentKey: crypto.randomUUID(),
            manifest: {
              create: {
                configurationHash: "fixture",
                fields: {
                  create:
                    kind === "xlsx"
                      ? spreadsheetManifestFieldData(bindings)
                      : [
                          {
                            label: "Name",
                            position: 0,
                            tag: "name",
                            type: "text",
                          },
                        ],
                },
              },
            },
            objectKey: await artifact("template"),
            version: 1,
          },
        },
        status: "published",
        title: `History ${kind}`,
        version: 1,
      },
      include: { publishedTemplate: true },
    });
    const response = await prisma.response.create({
      data: {
        formId,
        publishedTemplateId: form.publishedTemplate?.id as string,
        publishedVersion: 1,
        status: "submitted",
        userId: admin.id,
      },
    });
    await prisma.prefillSnapshot.create({
      data: {
        formId,
        lockedFields: {},
        responseId: response.id,
        userId: admin.id,
        values: {},
      },
    });
    const createSubmission = async (value: string, date: string) =>
      prisma.submission.create({
        data: {
          createdAt: new Date(date),
          data: { name: value },
          documentKey: crypto.randomUUID(),
          formId,
          objectKey: await artifact(value),
          responseId: response.id,
          userId: admin.id,
        },
      });
    const first = await createSubmission("first", "2026-01-01T00:00:00Z");
    const firstBytes = await readObject(first.objectKey);
    const firstCorrection = await prisma.correction.create({
      data: {
        actorId: admin.id,
        changedData: { name: "corrected first" },
        data: { name: "corrected first" },
        documentKey: crypto.randomUUID(),
        objectKey: await artifact("corrected first"),
        reason: "First correction",
        responseId: response.id,
        revision: 1,
        submissionId: first.id,
      },
    });
    const base = `/api/admin/results/${response.id}`;
    // Open a workspace for the first submission, then resubmit while it is open.
    const oldEditorResponse = await get(`${base}/correction/editor-config`);
    expect(oldEditorResponse.status).toBe(200);
    const oldEditor = (await oldEditorResponse.json()) as EditorConfigBody;
    const second = await createSubmission("second", "2026-01-02T00:00:00Z");
    expect(await (await get(base)).json()).toMatchObject({
      result: {
        data: { name: "second" },
        document: { state: "submission" },
        latestCorrectionNumber: null,
        revision: 0,
        submissionId: second.id,
      },
    });
    expect(await (await get(`${base}/viewer-config`)).json()).toMatchObject({
      config: { document: { key: second.documentKey } },
    });
    expect((await get(`${base}?revision=1`)).status).toBe(404);
    expect((await get(`${base}/viewer-config?revision=1`)).status).toBe(404);
    expect(
      await (await get(`/api/responses/${response.id}/corrections`)).json()
    ).toMatchObject({
      latestRevision: 0,
      revisions: [{ data: { name: "second" }, revision: 0 }],
    });
    const list = (await (
      await get(`/api/admin/results?form=${publicId}&correction=0`)
    ).json()) as {
      results: { id: string; latestCorrectionNumber: number | null }[];
    };
    expect(list.results).toEqual([
      expect.objectContaining({
        id: response.id,
        latestCorrectionNumber: null,
      }),
    ]);
    expect(
      await (
        await get(`/api/admin/results?form=${publicId}&correction=1`)
      ).json()
    ).toMatchObject({ results: [] });
    const mine = (await (await get("/api/responses/me")).json()) as {
      responses: { id: string; latestCorrectionNumber: number | null }[];
    };
    expect(
      mine.responses.find((row) => row.id === response.id)
        ?.latestCorrectionNumber
    ).toBeNull();
    const save = (editor: EditorConfigBody) =>
      app.handle(
        new Request(`http://test.local${base}/correction`, {
          body: JSON.stringify({
            data: { name: "corrected second" },
            documentKey: editor.config.document.key,
            reason: "Second correction",
          }),
          headers: {
            ...headers,
            ...jsonHeaders,
            "X-Editor-Capability": editor.bridge.capabilities[
              "save-correction"
            ] as string,
          },
          method: "POST",
        })
      );
    expect((await save(oldEditor)).status).toBe(409);
    const editorResponse = await get(`${base}/correction/editor-config`);
    expect(editorResponse.status).toBe(200);
    const editor = (await editorResponse.json()) as EditorConfigBody;
    const lease = await prisma.editorLease.findUniqueOrThrow({
      where: { id: editor.bridge.lease.id },
    });
    expect(lease.workspaceBaseDocumentKey).toBe(second.documentKey);
    expect(lease.workspaceBaseRevision).toBe(0);
    expect(await readObject(lease.workspaceObjectKey as string)).toEqual(
      await readObject(second.objectKey)
    );
    const forceSaveReady = Promise.withResolvers<boolean>();
    forceSaveWaiters.set(editor.config.document.key, () => {
      forceSaveReady.resolve(true);
    });
    const saveResponse = await save(editor);
    expect({
      error:
        saveResponse.status === 202 ? null : await saveResponse.clone().json(),
      status: saveResponse.status,
    }).toEqual({ error: null, status: 202 });
    const { operationId } = (await saveResponse.json()) as {
      operationId: string;
    };
    // The force-save worker commits pending -> processing before calling the client.
    await forceSaveReady.promise;
    forceSaveWaiters.delete(editor.config.document.key);
    const operation = await prisma.operation.findUniqueOrThrow({
      where: { id: operationId },
    });
    const metadata = operationMetadata(operation.metadata);
    expect(metadata).toMatchObject({
      baseDocumentKey: second.documentKey,
      baseRevision: 0,
      submissionId: second.id,
    });
    // Completion consumes the validated document/data emitted by the document pipeline.
    const correctedBytes = documentFixture(kind, "corrected second");
    const correctedMetadata = {
      ...metadata,
      data: { name: "corrected second" },
    };
    await putObject(metadata.finalObjectKey, correctedBytes);
    await completeCorrectionOperation(
      operation,
      correctedMetadata,
      correctedBytes
    );
    const corrected = await prisma.correction.findFirstOrThrow({
      where: { submissionId: second.id },
    });
    // Keep existing response-wide revision URLs unique.
    expect(corrected.revision).toBe(2);
    expect(corrected.changedData).toEqual({
      name: "corrected second",
    });
    expect(await (await get(base)).json()).toMatchObject({
      result: {
        data: { name: "corrected second" },
        revision: 2,
        submissionId: second.id,
      },
    });
    expect(
      await (
        await get(`/api/admin/results?form=${publicId}&correction=2`)
      ).json()
    ).toMatchObject({
      results: [
        expect.objectContaining({ id: response.id, latestCorrectionNumber: 2 }),
      ],
    });
    expect(
      await (await get(`/api/submissions/${first.id}/data`)).json()
    ).toMatchObject({ data: { name: "corrected first" }, revision: 1 });
    expect(
      await (
        await get(`/api/submissions/${first.id}/data?revision=original`)
      ).json()
    ).toMatchObject({ data: { name: "first" }, revision: 0 });
    expect(
      (await get(`/api/submissions/${first.id}/data?revision=2`)).status
    ).toBe(404);
    expect(
      await prisma.correction.findUnique({ where: { id: firstCorrection.id } })
    ).toEqual(firstCorrection);
    expect(await readObject(first.objectKey)).toEqual(firstBytes);
    const download = await get(`/api/submissions/${second.id}/${kind}`);
    expect(download.status).toBe(200);
    expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([
      ...correctedBytes,
    ]);

    // A delayed callback must not commit to an old submission after a newer send.
    const nextEditor = (await (
      await get(`${base}/correction/editor-config`)
    ).json()) as EditorConfigBody;
    const nextSave = await save(nextEditor);
    expect(nextSave.status).toBe(202);
    const pendingId = ((await nextSave.json()) as { operationId: string })
      .operationId;
    const pending = await prisma.operation.findUniqueOrThrow({
      where: { id: pendingId },
    });
    const third = await createSubmission("third", "2026-01-03T00:00:00Z");
    await expect(
      completeCorrectionOperation(
        pending,
        { ...operationMetadata(pending.metadata), data: { name: "stale" } },
        correctedBytes
      )
    ).rejects.toMatchObject({ code: "stale_operation", httpStatus: 409 });
    expect(
      await prisma.correction.count({ where: { responseId: response.id } })
    ).toBe(2);
    expect(await (await get(base)).json()).toMatchObject({
      result: { data: { name: "third" }, revision: 0, submissionId: third.id },
    });
    // Filter by the current submission before taking a page, including revision 0.
    // Put more than one batch of nonmatches before the 26 uncorrected results.
    const pageUsers = Array.from({ length: 56 }, (_, index) => ({
      email: `page-${formId}-${index}@example.test`,
      emailVerified: true,
      enabled: true,
      id: crypto.randomUUID(),
      name: "History page user",
    }));
    await prisma.user.createMany({ data: pageUsers });
    const pageResponses = pageUsers.map((user, index) => ({
      formId,
      id: crypto.randomUUID(),
      publishedTemplateId: response.publishedTemplateId,
      publishedVersion: 1,
      status: "submitted" as const,
      updatedAt: new Date(
        index < 26 ? "2026-03-01T00:00:00Z" : "2026-03-02T00:00:00Z"
      ),
      userId: user.id,
    }));
    await prisma.response.createMany({ data: pageResponses });
    const pageSubmissions = pageResponses.flatMap((row) =>
      [0, 1].map((index) => ({
        createdAt: new Date(`2026-02-0${index + 1}T00:00:00Z`),
        data: { name: `page ${index}` },
        documentKey: crypto.randomUUID(),
        formId,
        id: crypto.randomUUID(),
        objectKey: first.objectKey,
        responseId: row.id,
        userId: row.userId,
      }))
    );
    await prisma.submission.createMany({ data: pageSubmissions });
    await prisma.correction.createMany({
      data: pageSubmissions
        .filter((_, index) => index % 2 === 0)
        .map((sub) => ({
          actorId: admin.id,
          changedData: {},
          data: { name: "old correction" },
          documentKey: crypto.randomUUID(),
          objectKey: firstCorrection.objectKey,
          reason: "Previous submission only",
          responseId: sub.responseId,
          revision: 1,
          submissionId: sub.id,
        })),
    });
    await prisma.correction.createMany({
      data: pageSubmissions
        .filter((_, index) => index >= 52 && index % 2 === 1)
        .map((sub) => ({
          actorId: admin.id,
          changedData: {},
          data: { name: "current correction" },
          documentKey: crypto.randomUUID(),
          objectKey: firstCorrection.objectKey,
          reason: "Current submission",
          responseId: sub.responseId,
          revision: 2,
          submissionId: sub.id,
        })),
    });
    const filter = `/api/admin/results?form=${publicId}&user=PAGE-${formId}&state=submitted&from=2026-02-01&to=2026-04-01&correction=0`;
    const pageOne = (await (await get(filter)).json()) as {
      nextCursor: string;
      results: { id: string; latestCorrectionNumber: number | null }[];
    };
    expect(pageOne.results).toHaveLength(25);
    expect(
      pageOne.results.every((row) => row.latestCorrectionNumber === null)
    ).toBe(true);
    expect(pageOne.nextCursor).toBeString();
    const pageTwo = (await (
      await get(`${filter}&cursor=${encodeURIComponent(pageOne.nextCursor)}`)
    ).json()) as { nextCursor: string | null; results: { id: string }[] };
    expect(pageTwo.results).toHaveLength(1);
    expect(pageTwo.nextCursor).toBeNull();
    expect(
      new Set([...pageOne.results, ...pageTwo.results].map((row) => row.id))
        .size
    ).toBe(26);
    // Revision 1 exists on every response, but only on older submissions.
    expect(
      await (await get(filter.replace("correction=0", "correction=1"))).json()
    ).toMatchObject({ nextCursor: null, results: [] });
    const correctedFilter = filter.replace("correction=0", "correction=2");
    const correctedPageOne = (await (await get(correctedFilter)).json()) as {
      nextCursor: string;
      results: { id: string; latestCorrectionNumber: number | null }[];
    };
    expect(correctedPageOne.results).toHaveLength(25);
    expect(
      correctedPageOne.results.every((row) => row.latestCorrectionNumber === 2)
    ).toBe(true);
    expect(correctedPageOne.nextCursor).toBeString();
    const correctedPageTwo = (await (
      await get(
        `${correctedFilter}&cursor=${encodeURIComponent(correctedPageOne.nextCursor)}`
      )
    ).json()) as {
      nextCursor: string | null;
      results: { id: string; latestCorrectionNumber: number | null }[];
    };
    expect(correctedPageTwo.results).toHaveLength(5);
    expect(correctedPageTwo.nextCursor).toBeNull();
    expect(
      correctedPageTwo.results.every((row) => row.latestCorrectionNumber === 2)
    ).toBe(true);
    expect(
      new Set(
        [...correctedPageOne.results, ...correctedPageTwo.results].map(
          (row) => row.id
        )
      ).size
    ).toBe(30);
  });
}
