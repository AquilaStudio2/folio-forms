// oxlint-disable unicorn/no-await-expression-member sort-keys -- Fixture order mirrors workbook columns; persisted-state assertions remain beside each operation.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { Prisma, prisma } from "@onlyoffice/db";

import { tokenDigest } from "../../src/digests";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import {
  overlaySpreadsheetPictures,
  readSpreadsheetPictures,
} from "../../src/documents/spreadsheets/pictures";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
  XLSX_CONTENT_TYPE,
} from "../../src/documents/spreadsheets/workbook";
import { spreadsheetManifestFieldData } from "../../src/forms/spreadsheet-fields";
import { createPrefillHandoff } from "../../src/prefill/create-launch";
import { validateSpreadsheetPrefillValues } from "../../src/prefill/spreadsheet-values";
import { initializeSpreadsheetResponse } from "../../src/responses/spreadsheet-document";
import {
  deleteObject,
  objectExists,
  putObject,
  readObject,
} from "../../src/storage";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

if (!process.env.DATABASE_URL) {
  throw new Error("An isolated DATABASE_URL is required");
}
const id = crypto.randomUUID();
const publicId = crypto.randomUUID().replaceAll("-", "");
const publishedId = crypto.randomUUID();
const objects: string[] = [];
const responses: string[] = [];
const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      id: "folio_score",
      anchor: "folio_score",
      key: "score",
      label: "Score",
      type: "number",
      prefillPointer: "/account/score",
    },
    {
      id: "folio_active",
      anchor: "folio_active",
      key: "active",
      label: "Active",
      type: "boolean",
      prefillPointer: "/account/active",
      prefillPolicy: "lock_when_available",
    },
    {
      id: "folio_photo",
      anchor: "folio_photo",
      key: "photo",
      label: "Photo",
      type: "picture",
      required: true,
    },
  ],
  table: null,
  version: 1,
});
const names = {
  folio_active: "'Form'!$B$1",
  folio_score: "'Form'!$A$1",
  folio_photo: "'Form'!$C$1",
};
const bytes = fixtureWorkbook({ cells: [], merges: [], names });
const contract = resolveSpreadsheetContract(
  bindings,
  readSpreadsheetWorkbook(bytes)
);
const initializedBytes = fixtureWorkbook({
  cells: [
    { address: "A1", value: 0 },
    { address: "B1", value: false },
  ],
  merges: [],
  names,
});

beforeAll(async () => {
  const key = `tests/${id}/published.xlsx`;
  await putObject(key, bytes, XLSX_CONTENT_TYPE);
  objects.push(key);
  await prisma.form.create({
    data: {
      documentKind: "xlsx",
      id,
      publicId,
      publishedTemplate: {
        create: {
          contentHash: id,
          documentKey: `published-${id}`,
          id: publishedId,
          manifest: {
            create: {
              configurationHash: id,
              fields: {
                create: spreadsheetManifestFieldData(bindings),
              },
            },
          },
          objectKey: key,
          version: 1,
        },
      },
      status: "published",
      title: "Spreadsheet initialization fixture",
      version: 1,
    },
  });
  await prisma.prefillConfiguration.create({
    data: {
      configurationHash: id,
      fields: {
        create: bindings.fields
          .filter((field) => field.prefillPointer)
          .map((field) => ({
            tag: field.key,
            pointer: field.prefillPointer as string,
            policy: field.prefillPolicy,
          })),
      },
      formId: id,
    },
  });
  await prisma.prefillConfiguration.update({
    where: { formId: id },
    data: { publishedTemplateId: publishedId },
  });
});
afterAll(async () => {
  await prisma.response.deleteMany({ where: { id: { in: responses } } });
  await prisma.handoff.deleteMany({ where: { formId: id } });
  await Promise.all(objects.map(deleteObject));
});
const draft = async () => {
  const responseId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const key = `tests/${id}/${responseId}.xlsx`;
  await prisma.user.create({
    data: {
      email: `${userId}@example.test`,
      id: userId,
      name: "Excel fixture",
    },
  });
  await putObject(key, bytes, XLSX_CONTENT_TYPE);
  objects.push(key);
  responses.push(responseId);
  return prisma.response.create({
    data: {
      draftData: Prisma.DbNull,
      draftDocumentKey: `draft-${responseId}`,
      draftObjectKey: key,
      formId: id,
      id: responseId,
      prefillSnapshot: {
        create: {
          formId: id,
          lockedFields: { active: true },
          userId,
          values: { active: false, score: 0 },
        },
      },
      publishedTemplateId: publishedId,
      publishedVersion: 1,
      userId,
    },
    include: { prefillSnapshot: true },
  });
};
const processor = (
  _input: Uint8Array,
  options: { values?: { address: string; value: unknown }[] } = {}
) => {
  expect(options.values).toEqual([
    { address: "A1", value: 0 },
    { address: "B1", value: false },
  ]);
  return Promise.resolve({ workbook: initializedBytes });
};

test("XLSX handoff preserves numeric zero and false and rejects wrong scalar types", async () => {
  const externalReference = crypto.randomUUID();
  await createPrefillHandoff({
    email: "prefill@example.test",
    externalReference,
    publicId,
    values: { account: { active: false, score: 0 } },
  });
  const handoff = await prisma.handoff.findUniqueOrThrow({
    where: { externalReferenceDigest: tokenDigest(externalReference) },
  });
  expect(handoff.filteredValues).toEqual({ active: false, score: 0 });
  for (const values of [
    { score: "0" },
    { active: 0 },
    { score: Number.NaN },
    { score: Infinity },
    { rows: [] },
    { score: null },
  ]) {
    expect(() => validateSpreadsheetPrefillValues(values, contract)).toThrow();
  }
  await expect(
    createPrefillHandoff({
      email: "prefill@example.test",
      externalReference: crypto.randomUUID(),
      publicId,
      values: { account: { active: false, score: "0" } },
    })
  ).rejects.toThrow();
});

test("initialization commits canonical bytes and retires the superseded object", async () => {
  const response = await draft();
  expect(response.spreadsheetInitialized).toBe(false);
  const prepared = await initializeSpreadsheetResponse(response, {
    processSpreadsheet: processor,
  });
  objects.push(prepared.draftObjectKey as string);
  expect(prepared.spreadsheetInitialized).toBe(true);
  expect(prepared.draftData).toBeNull();
  const resumed = await initializeSpreadsheetResponse(prepared, {
    processSpreadsheet: () => {
      throw new Error("Initialized drafts must not replay Prefill");
    },
  });
  expect(resumed).toBe(prepared);
  expect(resumed.draftData).toBeNull();
  const saved = readSpreadsheetWorkbook(
    await readObject(prepared.draftObjectKey as string)
  );
  expect(saved.cells.get("A1")?.value).toBe(0);
  expect(saved.cells.get("B1")?.value).toBe(false);
  expect(await objectExists(response.draftObjectKey as string)).toBe(false);
  const staleReader = await initializeSpreadsheetResponse(response, {
    processSpreadsheet: () => {
      throw new Error("Already initialized workbook must not be rebuilt");
    },
  });
  expect(staleReader.draftObjectKey).toBe(prepared.draftObjectKey);
  expect(
    await prisma.objectCleanupIntent.count({
      where: {
        objectKey: {
          in: [
            response.draftObjectKey as string,
            prepared.draftObjectKey as string,
          ],
        },
      },
    })
  ).toBe(0);
});

test("legacy template photos become empty frames once, and resumed drafts retain user replacements", async () => {
  const response = await draft();
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FoUAAAAASUVORK5CYII=",
      "base64"
    )
  );
  const images = new Map([
    ["folio_photo", { bytes: png, height: 952_500, width: 952_500 }],
  ]);
  const legacyTemplate = overlaySpreadsheetPictures(bytes, contract, images);
  await putObject(
    response.draftObjectKey as string,
    legacyTemplate,
    XLSX_CONTENT_TYPE
  );
  const prepared = await initializeSpreadsheetResponse(response, {
    processSpreadsheet: () =>
      Promise.resolve({
        workbook: overlaySpreadsheetPictures(
          initializedBytes,
          contract,
          images
        ),
      }),
  });
  objects.push(prepared.draftObjectKey as string);
  const savedBytes = await readObject(prepared.draftObjectKey as string);
  const saved = readSpreadsheetWorkbook(savedBytes);
  expect(readSpreadsheetPictures(saved, contract).size).toBe(0);
  expect(
    readSpreadsheetPictures(saved, contract, { includePlaceholders: true }).get(
      "folio_photo"
    )
  ).toMatchObject({ width: 952_500, height: 952_500 });
  expect(await objectExists(response.draftObjectKey as string)).toBe(false);

  const replaced = overlaySpreadsheetPictures(savedBytes, contract, images);
  await putObject(
    prepared.draftObjectKey as string,
    replaced,
    XLSX_CONTENT_TYPE
  );
  const persisted = await prisma.response.findUniqueOrThrow({
    where: { id: response.id },
    include: { prefillSnapshot: true },
  });
  const resumed = await initializeSpreadsheetResponse(persisted, {
    processSpreadsheet: () => {
      throw new Error("Resuming must preserve the user's replacement image");
    },
  });
  expect(resumed.draftObjectKey).toBe(prepared.draftObjectKey);
  const resumedBytes = await readObject(resumed.draftObjectKey as string);
  expect(resumedBytes).toEqual(replaced);
  expect(
    readSpreadsheetPictures(
      readSpreadsheetWorkbook(resumedBytes),
      contract
    ).get("folio_photo")?.bytes
  ).toEqual(png);
});

test("two initialization requests converge and remove the losing artifact", async () => {
  const response = await draft();
  const allocated: string[] = [];
  const bothReady = Promise.withResolvers<undefined>();
  const write: typeof putObject = async (key, data, type) => {
    await putObject(key, data, type);
    allocated.push(key);
    if (allocated.length === 2) {
      bothReady.resolve();
    }
    await bothReady.promise;
  };
  const [first, second] = await Promise.all([
    initializeSpreadsheetResponse(response, {
      processSpreadsheet: processor,
      putObject: write,
    }),
    initializeSpreadsheetResponse(response, {
      processSpreadsheet: processor,
      putObject: write,
    }),
  ]);
  objects.push(...allocated);
  expect(first.draftObjectKey).toBe(second.draftObjectKey);
  expect(await objectExists(first.draftObjectKey as string)).toBe(true);
  const loser = allocated.find((key) => key !== first.draftObjectKey) as string;
  expect(await objectExists(loser)).toBe(false);
  expect(
    await prisma.objectCleanupIntent.count({
      where: { objectKey: { in: allocated } },
    })
  ).toBe(0);
});

test("write failure and changed draft preserve the old canonical workbook", async () => {
  const response = await draft();
  let failedKey = "";
  await expect(
    initializeSpreadsheetResponse(response, {
      processSpreadsheet: processor,
      putObject: async (key, data, type) => {
        failedKey = key;
        await putObject(key, data, type);
        expect(
          await prisma.objectCleanupIntent.findUnique({
            where: { objectKey: key },
          })
        ).not.toBeNull();
        throw new Error("simulated interrupted storage acknowledgement");
      },
    })
  ).rejects.toThrow("simulated interrupted storage acknowledgement");
  objects.push(failedKey);
  expect(await objectExists(failedKey)).toBe(false);
  expect(await objectExists(response.draftObjectKey as string)).toBe(true);
  expect(
    (await prisma.response.findUniqueOrThrow({ where: { id: response.id } }))
      .spreadsheetInitialized
  ).toBe(false);
  let staleKey = "";
  await expect(
    initializeSpreadsheetResponse(response, {
      processSpreadsheet: processor,
      putObject: async (key, data, type) => {
        staleKey = key;
        await putObject(key, data, type);
        await prisma.response.update({
          data: { draftDocumentKey: `rotated-${response.id}` },
          where: { id: response.id },
        });
      },
    })
  ).rejects.toThrow("response changed");
  objects.push(staleKey);
  expect(await objectExists(staleKey)).toBe(false);
  expect(await objectExists(response.draftObjectKey as string)).toBe(true);
});
