// oxlint-disable complexity -- One end-to-end assertion covering reopen-after-submit storage behavior.
import { expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { readObject, putObject } from "../../src/storage";
import { createCredentialFixture, bearerFor } from "../fixtures/http";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Spreadsheet resubmission HTTP tests require an isolated PostgreSQL DATABASE_URL"
  );
}

const app = createApp({
  legacySso: null,
  onlyOffice: {
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-test")),
    forceSave: () => Promise.resolve(true),
  },
});

test("xlsx: reopening after a submit refills from the blank template, not the submission", async () => {
  const password = "Resubmission-regression-password!";
  const user = await createCredentialFixture({
    email: `resubmission-${crypto.randomUUID()}@example.test`,
    name: "Resubmission User",
    password,
  });
  const userBearer = await bearerFor(app, user.email, password);

  const formId = crypto.randomUUID();
  const publicId = crypto.randomUUID().replaceAll("-", "");
  const templateKey = `tests/resubmission/${formId}/template.xlsx`;
  const submittedKey = `tests/resubmission/${formId}/submitted.xlsx`;
  const blankBytes = new TextEncoder().encode("BLANK_TEMPLATE_CONTENT");
  const filledBytes = new TextEncoder().encode("FILLED_WITH_123");
  await putObject(templateKey, blankBytes);
  await putObject(submittedKey, filledBytes);

  const form = await prisma.form.create({
    data: {
      documentKind: "xlsx",
      id: formId,
      publicId,
      publishedTemplate: {
        create: {
          contentHash: "fixture",
          documentKey: crypto.randomUUID(),
          objectKey: templateKey,
          version: 1,
        },
      },
      status: "published",
      title: "Resubmission Excel Form",
      version: 1,
    },
    include: { publishedTemplate: true },
  });

  const response = await prisma.response.create({
    data: {
      formId,
      publishedTemplateId: form.publishedTemplate?.id as string,
      publishedVersion: 1,
      spreadsheetInitialized: true,
      status: "submitted",
      userId: user.id,
    },
  });
  await prisma.prefillSnapshot.create({
    data: {
      formId,
      lockedFields: {},
      responseId: response.id,
      userId: user.id,
      values: {},
    },
  });
  await prisma.submission.create({
    data: {
      data: { rows: [{ value: 123 }] },
      documentKey: crypto.randomUUID(),
      formId,
      objectKey: submittedKey,
      responseId: response.id,
      userId: user.id,
    },
  });

  const startResponse = await app.handle(
    new Request(`http://test.local/api/forms/${publicId}/start`, {
      headers: { Authorization: `Bearer ${userBearer}` },
      method: "POST",
    })
  );
  expect(startResponse.status).toBe(200);
  const started = (await startResponse.json()) as {
    response?: { id?: string };
  };
  const reopenedResponseId = started.response?.id;
  if (!reopenedResponseId) {
    throw new Error("The reopened Excel response did not start");
  }

  const reopened = await prisma.response.findUniqueOrThrow({
    where: { id: reopenedResponseId },
  });
  expect(reopened.draftObjectKey).not.toBeNull();
  expect(reopened.draftData).toBeNull();
  // The next monthly entry starts from the blank template, never the
  // previous submission's filled-in cells.
  expect(reopened.spreadsheetInitialized).toBe(false);
  expect(
    new TextDecoder().decode(
      await readObject(reopened.draftObjectKey as string)
    )
  ).toBe("BLANK_TEMPLATE_CONTENT");
});
