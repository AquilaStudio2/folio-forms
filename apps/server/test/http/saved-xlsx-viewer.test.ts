import { expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";

import { createApp } from "../../src/app";
import { blankSpreadsheet } from "../../src/documents/spreadsheets/blank";
import {
  createDocumentAccessToken,
  createOnlyOfficeAuthorization,
} from "../../src/onlyoffice";
import { putObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";

const viewerConfig = z.object({
  config: z.object({
    document: z.object({
      permissions: z.object({
        download: z.literal(false),
        edit: z.literal(false),
      }),
      url: z.string(),
    }),
    editorConfig: z.object({ mode: z.literal("view") }),
  }),
});

// oxlint-disable-next-line complexity -- Check one saved workbook across config issuance, failure and replacement.
test("saved XLSX viewer pins committed bytes across an active, failed and replaced Draft", async () => {
  const app = createApp({ legacySso: null });
  const suffix = crypto.randomUUID();
  const password = "Saved-viewer-fixture-password!";
  const owner = await createCredentialFixture({
    email: `saved-owner-${suffix}@example.test`,
    name: "Saved workbook owner",
    password,
    role: "user",
  });
  const otherOwner = await createCredentialFixture({
    email: `saved-other-${suffix}@example.test`,
    name: "Historical workbook owner",
    password,
    role: "user",
  });
  const otherToken = await bearerFor(app, otherOwner.email, password);
  const viewer = await createCredentialFixture({
    email: `saved-viewer-${suffix}@example.test`,
    name: "Results viewer",
    password,
    role: "viewer",
  });
  const ownerToken = await bearerFor(app, owner.email, password);
  const viewerToken = await bearerFor(app, viewer.email, password);
  const artifact = async (value: string) => {
    const archive = unzipSync(blankSpreadsheet());
    const sheet = "xl/worksheets/sheet1.xml";
    archive[sheet] = strToU8(
      strFromU8(archive[sheet]).replace(
        "<sheetData/>",
        `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${value}</t></is></c></row></sheetData>`
      )
    );
    const key = `tests/saved-viewer/${suffix}/${value}.xlsx`;
    await putObject(key, zipSync(archive));
    return key;
  };
  const committed = await artifact("committed");
  const staged = await artifact("staged");
  const replacement = await artifact("replacement");
  const form = await prisma.form.create({
    data: {
      documentKind: "xlsx",
      publicId: suffix.replaceAll("-", ""),
      publishedTemplate: {
        create: {
          contentHash: "fixture",
          documentKey: crypto.randomUUID(),
          manifest: { create: { configurationHash: "fixture" } },
          objectKey: committed,
          version: 1,
        },
      },
      status: "published",
      title: "Saved XLSX viewer fixture",
      version: 1,
    },
    include: { publishedTemplate: true },
  });
  if (!form.publishedTemplate) {
    throw new Error("Fixture template missing");
  }
  const documentKey = crypto.randomUUID();
  const response = await prisma.response.create({
    data: {
      draftDocumentKey: documentKey,
      draftObjectKey: committed,
      formId: form.id,
      publishedTemplateId: form.publishedTemplate.id,
      publishedVersion: 1,
      status: "draft",
      userId: owner.id,
    },
  });
  const operation = await prisma.operation.create({
    data: {
      documentKey,
      formId: form.id,
      metadata: {
        action: "save-draft",
        finalObjectKey: replacement,
        formId: form.id,
        stagedObjectKey: staged,
      },
      responseId: response.id,
      status: "processing",
      targetId: response.id,
      targetType: "response",
      type: "save_draft",
    },
  });
  const get = (path: string, bearer: string) =>
    app.handle(
      new Request(`http://127.0.0.1${path}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
  const draftPath = `/api/responses/${response.id}/draft/viewer-config`;
  const resultsPath = `/api/admin/results/${response.id}/viewer-config`;
  const configUrl = async (path: string, bearer: string) => {
    const result = await get(path, bearer);
    expect(result.status).toBe(200);
    return viewerConfig.parse(await result.json()).config.document.url;
  };
  const download = (url: string) =>
    app.handle(
      new Request(url, {
        headers: { Authorization: createOnlyOfficeAuthorization({ url }) },
      })
    );
  const cellIs = async (url: string, value: string) => {
    const file = await download(url);
    expect(file.status).toBe(200);
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
    expect(strFromU8(archive["xl/worksheets/sheet1.xml"])).toContain(
      `<t>${value}</t>`
    );
  };
  const unauthorizedDraft = await get(draftPath, otherToken);
  expect(unauthorizedDraft.status).toBe(403);
  const unauthorizedResults = await get(resultsPath, ownerToken);
  expect(unauthorizedResults.status).toBe(403);
  const pinned = await configUrl(draftPath, ownerToken);
  const missingAuthorization = await app.handle(new Request(pinned));
  expect(missingAuthorization.status).toBe(401);
  const genericToken = new URL(pinned);
  genericToken.searchParams.set(
    "token",
    createDocumentAccessToken(documentKey)
  );
  const wrongScope = await download(genericToken.href);
  expect(wrongScope.status).toBe(401);
  const wrongDocument = new URL(pinned);
  wrongDocument.pathname = `/onlyoffice/document/${crypto.randomUUID()}`;
  const wrongKey = await download(wrongDocument.href);
  expect(wrongKey.status).toBe(401);
  const noMode = new URL(pinned);
  noMode.searchParams.delete("readonly");
  const wrongMode = await download(noMode.href);
  expect(wrongMode.status).toBe(401);
  await cellIs(pinned, "committed");
  await cellIs(await configUrl(resultsPath, viewerToken), "committed");
  await prisma.operation.update({
    data: { status: "failed" },
    where: { id: operation.id },
  });
  await cellIs(await configUrl(draftPath, ownerToken), "committed");
  await prisma.response.update({
    data: { draftObjectKey: replacement },
    where: { id: response.id },
  });
  await cellIs(pinned, "committed");
  await cellIs(await configUrl(draftPath, ownerToken), "replacement");

  const history = await prisma.response.create({
    data: {
      formId: form.id,
      publishedTemplateId: form.publishedTemplate.id,
      publishedVersion: 1,
      status: "submitted",
      userId: otherOwner.id,
    },
  });
  const original = await prisma.submission.create({
    data: {
      data: {},
      documentKey: crypto.randomUUID(),
      formId: form.id,
      objectKey: committed,
      responseId: history.id,
      userId: otherOwner.id,
    },
  });
  await prisma.correction.create({
    data: {
      actorId: viewer.id,
      changedData: {},
      data: {},
      documentKey: crypto.randomUUID(),
      objectKey: replacement,
      reason: "Fixture correction",
      responseId: history.id,
      revision: 1,
      submissionId: original.id,
    },
  });
  const historyPath = `/api/admin/results/${history.id}/viewer-config`;
  await cellIs(
    await configUrl(`${historyPath}?revision=0`, viewerToken),
    "committed"
  );
  await cellIs(await configUrl(historyPath, viewerToken), "replacement");
});
