// oxlint-disable unicorn/no-await-expression-member no-await-in-loop -- Persisted-state assertions follow each sequential operation and rejected update.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { Prisma, prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { requireIdentity } from "../../src/auth/identity";
import {
  spreadsheetColumnAnchor,
  spreadsheetTableColumnsAnchor,
} from "../../src/documents/spreadsheets/columns";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { actionEditorCapability } from "../../src/editor/authorization";
import { claimEditorLease } from "../../src/editor/leases";
import {
  spreadsheetBindingsForTemplate,
  spreadsheetDraftBindings,
  spreadsheetDraftFieldData,
} from "../../src/forms/spreadsheet-fields";
import type { OperationMetadata } from "../../src/operations/model";
import {
  completePublishOperation,
  completeTemplateOperation,
} from "../../src/operations/template-completion";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

const forms: string[] = [];
const app = createApp({ legacySso: null, omniRoute: null });
let adminId = "";
let bearer = "";
beforeAll(async () => {
  const password = "Columns-fixture-password-2026!";
  const admin = await createCredentialFixture({
    email: `columns-${crypto.randomUUID()}@example.test`,
    name: "Column Admin",
    password,
    role: "admin",
  });
  adminId = admin.id;
  bearer = await bearerFor(app, admin.email, password);
});
const bindings = spreadsheetBindingSchema.parse({
  fields: [],
  table: {
    anchor: "folio_body",
    columns: ["alpha", "beta", "gamma"].map((key, offset) => ({
      id: `folio_${key}`,
      key,
      label: key,
      offset,
      type: "text",
    })),
    id: "folio_items",
    key: "items",
    label: "Items",
  },
  version: 1,
});
const names = {
  folio_body: "'Form'!$D$4:$G$5",
  [spreadsheetTableColumnsAnchor("folio_items")]: "'Form'!$D$4:$G$5",
  [spreadsheetColumnAnchor("folio_alpha")]: "'Form'!$D$4:$D$5",
  [spreadsheetColumnAnchor("folio_beta")]: "'Form'!$F$4:$F$5",
  [spreadsheetColumnAnchor("folio_gamma")]: "'Form'!$G$4:$G$5",
};
const bytes = fixtureWorkbook({ cells: [], merges: [], names });
const fixture = async (action: "publish" | "save-template") => {
  const id = crypto.randomUUID();
  forms.push(id);
  const draftId = crypto.randomUUID();
  const documentKey = `columns-${id}`;
  await prisma.form.create({
    data: {
      documentKind: "xlsx",
      id,
      publicId: id.replaceAll("-", ""),
      templateDraft: {
        create: {
          bindingRevision: 1,
          documentKey,
          fieldRules: { create: spreadsheetDraftFieldData(bindings) },
          id: draftId,
          objectKey: `tests/${id}/old.xlsx`,
        },
      },
      title: "Column persistence fixture",
    },
  });
  const metadata: OperationMetadata = {
    action,
    bindingRevision: 1,
    documentKind: "xlsx",
    finalObjectKey: `tests/${id}/final.xlsx`,
    formId: id,
    stagedObjectKey: `tests/${id}/staged.xlsx`,
    ...(action === "publish"
      ? { publishedKey: `published-${id}`, publishedVersion: 1 }
      : { nextDocumentKey: `saved-${id}` }),
  };
  const operation = await prisma.operation.create({
    data: {
      documentKey,
      formId: id,
      metadata: metadata as unknown as Prisma.InputJsonValue,
      status: "processing",
      targetId: draftId,
      targetType: "template_draft",
      type: action === "publish" ? "publish_form" : "save_template_draft",
    },
  });
  return { draftId, id, metadata, operation };
};

afterAll(async () => {
  await prisma.operation.deleteMany({ where: { formId: { in: forms } } });
  await prisma.editorLease.deleteMany({ where: { holderUserId: adminId } });
  // Published fixtures are immutable at the database boundary, like the other
  // publication suites; their isolated test database is disposed as a whole.
  await prisma.form.deleteMany({
    where: { id: { in: forms }, status: "draft" },
  });
  await prisma.user.deleteMany({ where: { id: adminId } });
});

test("saving a Template Draft atomically persists current column offsets without changing stable identities", async () => {
  const { draftId, metadata, operation } = await fixture("save-template");
  await completeTemplateOperation(operation, metadata, bytes);
  const actual = await spreadsheetDraftBindings(draftId);
  expect(actual.table?.columns.map((column) => column.offset)).toEqual([
    0, 2, 3,
  ]);
  expect(actual.table?.columns.map((column) => column.id)).toEqual(
    bindings.table?.columns.map((column) => column.id)
  );
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({
    documentKey: metadata.nextDocumentKey,
    objectKey: metadata.finalObjectKey,
  });
  expect(
    await prisma.operation.findUniqueOrThrow({ where: { id: operation.id } })
  ).toMatchObject({ status: "completed" });
});

test("publishing directly after a native column insertion freezes reconciled offsets in Manifest Fields", async () => {
  const { id, metadata, operation } = await fixture("publish");
  await completePublishOperation(operation, metadata, bytes);
  const published = await prisma.publishedTemplate.findUniqueOrThrow({
    where: { formId: id },
  });
  const actual = await spreadsheetBindingsForTemplate(published.id);
  expect(actual.table?.columns.map((column) => column.offset)).toEqual([
    0, 2, 3,
  ]);
  expect(actual.table?.columns.map((column) => column.id)).toEqual(
    bindings.table?.columns.map((column) => column.id)
  );
});

test("invalid column identity rolls back the entire Template Draft save", async () => {
  const { draftId, id, metadata, operation } = await fixture("save-template");
  const invalid = fixtureWorkbook({
    cells: [],
    merges: [],
    names: {
      ...names,
      [spreadsheetColumnAnchor("folio_beta")]: names[
        spreadsheetColumnAnchor("folio_alpha")
      ] as string,
    },
  });
  await expect(
    completeTemplateOperation(operation, metadata, invalid)
  ).rejects.toThrow("ซ้ำกับคอลัมน์อื่น");
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({
    documentKey: operation.documentKey,
    objectKey: `tests/${id}/old.xlsx`,
  });
  expect(await spreadsheetDraftBindings(draftId)).toEqual(bindings);
  expect(
    await prisma.operation.findUniqueOrThrow({ where: { id: operation.id } })
  ).toMatchObject({ status: "processing" });
});

const bindingFixture = async (computed = false) => {
  const current = await fixture("save-template");
  await prisma.operation.delete({ where: { id: current.operation.id } });
  if (computed) {
    await prisma.draftFieldRule.update({
      data: {
        binding: {
          computed: true,
          id: "folio_gamma",
          offset: 2,
          placeholder: null,
        },
      },
      where: {
        templateDraftId_tag: {
          tag: "items.gamma",
          templateDraftId: current.draftId,
        },
      },
    });
  }
  const identity = await requireIdentity(
    new Request("http://test.local", {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  const lease = await claimEditorLease(
    identity,
    "template-draft",
    current.draftId,
    current.id
  );
  const capability = actionEditorCapability(
    identity,
    {
      documentKey: current.operation.documentKey as string,
      formId: current.id,
      targetId: current.draftId,
      targetType: "template-draft",
    },
    "configure-fields",
    lease
  );
  const patch = (body: unknown) =>
    app.handle(
      new Request(
        `http://test.local/api/admin/forms/${current.id.replaceAll("-", "")}/spreadsheet-bindings`,
        {
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
            "X-Editor-Capability": capability,
          },
          method: "PATCH",
        }
      )
    );
  const get = () =>
    app.handle(
      new Request(
        `http://test.local/api/admin/forms/${current.id.replaceAll("-", "")}/spreadsheet-bindings`,
        { headers: { "X-Editor-Capability": capability } }
      )
    );
  const recover = (body: unknown, headers?: Record<string, string>) =>
    app.handle(
      new Request(
        `http://test.local/api/admin/forms/${current.id.replaceAll("-", "")}/spreadsheet-bindings/recover`,
        {
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
            ...(headers ?? { "X-Editor-Capability": capability }),
          },
          method: "POST",
        }
      )
    );
  return { ...current, get, patch, recover };
};

test("editing a moved column atomically reconciles the complete placement map before checking unique offsets", async () => {
  const { draftId, operation, patch } = await bindingFixture();
  const column = bindings.table?.columns[1];
  if (!column) {
    throw new Error("Missing test column");
  }
  const body = {
    change: {
      action: "upsert",
      kind: "column",
      value: { ...column, label: "Edited beta", offset: 2 },
    },
    documentKey: operation.documentKey,
    revision: 1,
  };
  expect((await patch(body)).status).toBe(400);
  expect(await spreadsheetDraftBindings(draftId)).toEqual(bindings);
  const response = await patch({
    ...body,
    spreadsheetColumnOffsets: [
      ["folio_alpha", 0],
      ["folio_beta", 2],
      ["folio_gamma", 3],
    ],
  });
  expect(response.status).toBe(200);
  const actual = await spreadsheetDraftBindings(draftId);
  expect(actual.table?.columns.map((entry) => entry.offset)).toEqual([0, 2, 3]);
  expect(actual.table?.columns[1]?.label).toBe("Edited beta");
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({ bindingRevision: 2 });
});

test("column reordering retains untouched legacy computed-column metadata", async () => {
  const { draftId, operation, patch } = await bindingFixture(true);
  const column = bindings.table?.columns[0];
  if (!column) {
    throw new Error("Missing test column");
  }
  const response = await patch({
    change: {
      action: "upsert",
      kind: "column",
      value: { ...column, label: "Edited alpha", offset: 2 },
    },
    documentKey: operation.documentKey,
    revision: 1,
    spreadsheetColumnOffsets: [
      ["folio_alpha", 2],
      ["folio_beta", 1],
      ["folio_gamma", 0],
    ],
  });
  expect(response.status).toBe(200);
  const actual = await spreadsheetDraftBindings(draftId);
  expect(actual.table?.columns.map((entry) => entry.offset)).toEqual([2, 1, 0]);
  expect(actual.table?.columns[2]).toMatchObject({
    computed: true,
    id: "folio_gamma",
    label: "gamma",
    offset: 0,
  });
});

test("incomplete, foreign, duplicate, malformed or mismatched column placement maps leave all metadata unchanged", async () => {
  const { draftId, operation, patch } = await bindingFixture();
  const column = bindings.table?.columns[1];
  if (!column) {
    throw new Error("Missing test column");
  }
  const body = {
    change: {
      action: "upsert",
      kind: "column",
      value: { ...column, offset: 2 },
    },
    documentKey: operation.documentKey,
    revision: 1,
  };
  for (const spreadsheetColumnOffsets of [
    [],
    [
      ["folio_alpha", 0],
      ["folio_beta", 2],
    ],
    [
      ["folio_alpha", 0],
      ["folio_beta", 2],
      ["folio_foreign", 3],
    ],
    [
      ["folio_alpha", 0],
      ["folio_beta", 2],
      ["folio_beta", 3],
    ],
    [
      ["folio_alpha", 0],
      ["folio_beta", 2],
      ["folio_gamma", 2],
    ],
    [
      ["folio_alpha", -1],
      ["folio_beta", 2],
      ["folio_gamma", 3],
    ],
    [
      ["folio_alpha", 0.5],
      ["folio_beta", 2],
      ["folio_gamma", 3],
    ],
    [
      ["folio_alpha", 16_384],
      ["folio_beta", 2],
      ["folio_gamma", 3],
    ],
    [
      ["folio_alpha", 0],
      ["folio_beta", 1],
      ["folio_gamma", 3],
    ],
  ]) {
    expect((await patch({ ...body, spreadsheetColumnOffsets })).status).toBe(
      400
    );
  }
  expect(
    (
      await patch({
        ...body,
        change: { action: "delete", id: "folio_beta", kind: "column" },
        spreadsheetColumnOffsets: [
          ["folio_alpha", 0],
          ["folio_beta", 1],
          ["folio_gamma", 2],
        ],
      })
    ).status
  ).toBe(400);
  expect(await spreadsheetDraftBindings(draftId)).toEqual(bindings);
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({ bindingRevision: 1 });
});

test("duplicate scalar, table and column tags return the exact actionable conflict without changing metadata", async () => {
  const { draftId, operation, patch } = await bindingFixture();
  const { fields } = spreadsheetBindingSchema.parse({
    fields: [
      {
        anchor: "folio_agency",
        id: "folio_agency",
        key: "agency",
        label: "Agency",
        type: "text",
      },
      {
        anchor: "folio_person",
        id: "folio_person",
        key: "person",
        label: "Person",
        type: "text",
      },
    ],
    table: null,
    version: 1,
  });
  await prisma.draftFieldRule.createMany({
    data: spreadsheetDraftFieldData({ fields, table: null, version: 1 }).map(
      (field) => ({
        ...field,
        position: field.position + 4,
        templateDraftId: draftId,
      })
    ),
  });
  const previous = await spreadsheetDraftBindings(draftId);
  const column = bindings.table?.columns[1];
  if (!fields[0] || !fields[1] || !column || !bindings.table) {
    throw new Error("Missing test configuration");
  }
  for (const change of [
    { action: "upsert", kind: "field", value: { ...fields[1], key: "agency" } },
    { action: "upsert", kind: "field", value: { ...fields[0], key: "items" } },
    {
      action: "upsert",
      kind: "table",
      value: { ...bindings.table, key: "agency" },
    },
    { action: "upsert", kind: "column", value: { ...column, key: "alpha" } },
  ]) {
    const response = await patch({
      change,
      documentKey: operation.documentKey,
      revision: 1,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "duplicate_field_tag",
      message: "tag นี้ซ้ำ กรุณาใช้ tag อื่น",
    });
  }
  expect(await spreadsheetDraftBindings(draftId)).toEqual(previous);
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({ bindingRevision: 1 });
});

test("other invalid spreadsheet settings return Thai guidance and never report a duplicate tag", async () => {
  const { draftId, operation, patch } = await bindingFixture();
  const column = bindings.table?.columns[1];
  if (!column) {
    throw new Error("Missing test column");
  }
  for (const value of [
    { ...column, offset: 2 },
    { ...column, key: "invalid tag" },
    { ...column, options: [], type: "dropdown" },
    { ...column, label: "" },
  ]) {
    const response = await patch({
      change: { action: "upsert", kind: "column", value },
      documentKey: operation.documentKey,
      revision: 1,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_field_config");
    expect(body.message).toMatch(/[\u0E00-\u0E7F]/u);
    expect(body.message).not.toBe("tag นี้ซ้ำ กรุณาใช้ tag อื่น");
  }
  expect(await spreadsheetDraftBindings(draftId)).toEqual(bindings);
});

test("binding reads and acknowledgements identify the exact editor document", async () => {
  const { get, operation, patch } = await bindingFixture();
  const read = await get();
  expect(read.status).toBe(200);
  expect(await read.json()).toMatchObject({
    documentKey: operation.documentKey,
    revision: 1,
  });
  const column = bindings.table?.columns[0];
  if (!column) {
    throw new Error("Missing test column");
  }
  const response = await patch({
    change: {
      action: "upsert",
      kind: "column",
      value: { ...column, label: "Renamed alpha" },
    },
    documentKey: operation.documentKey,
    revision: 1,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    documentKey: operation.documentKey,
    revision: 2,
  });
});

const heldForm = async (formId: string) => {
  const started = Promise.withResolvers<number>();
  const release = Promise.withResolvers<undefined>();
  const done = prisma.$transaction(
    async (tx) => {
      const [backend] = await tx.$queryRaw<{ pid: number }[]>(
        Prisma.sql`SELECT pg_backend_pid() AS pid`
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "forms" WHERE "id" = ${formId}::uuid FOR UPDATE`
      );
      if (!backend) {
        throw new Error("Missing lock holder");
      }
      started.resolve(backend.pid);
      await release.promise;
    },
    { timeout: 15_000 }
  );
  return {
    done,
    pid: await started.promise,
    release: () => release.resolve(),
  };
};
const waitForLockWaiters = async (holder: number, minimum: number) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [result] = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      WITH RECURSIVE waiting(pid) AS (
        SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND ${holder} = ANY(pg_blocking_pids(pid))
        UNION
        SELECT activity.pid FROM pg_stat_activity activity
        JOIN waiting ON waiting.pid = ANY(pg_blocking_pids(activity.pid))
        WHERE activity.datname = current_database()
      )
      SELECT COUNT(*)::int AS count FROM waiting
    `);
    if ((result?.count ?? 0) >= minimum) {
      return;
    }
    await Bun.sleep(10);
  }
  throw new Error(`Expected ${minimum} requests to wait for the form lock`);
};

test("a recovery fence invalidates an original PATCH queued behind it", async () => {
  const { draftId, id, operation, patch, recover } = await bindingFixture();
  const column = bindings.table?.columns[0];
  if (!column) {
    throw new Error("Missing test column");
  }
  const lock = await heldForm(id);
  let confirmation: Promise<Response> | undefined;
  let delayedPatch: Promise<Response> | undefined;
  try {
    confirmation = recover({ documentKey: operation.documentKey, revision: 1 });
    await waitForLockWaiters(lock.pid, 1);
    delayedPatch = patch({
      change: {
        action: "upsert",
        kind: "column",
        value: { ...column, label: "Delayed change" },
      },
      documentKey: operation.documentKey,
      revision: 1,
    });
    await waitForLockWaiters(lock.pid, 2);
  } finally {
    lock.release();
    await lock.done;
  }
  if (!confirmation || !delayedPatch) {
    throw new Error("Missing concurrent requests");
  }
  const settled = await confirmation;
  expect(settled.status).toBe(200);
  expect(await settled.json()).toMatchObject({
    bindings,
    documentKey: operation.documentKey,
    recovery: { baseRevision: 1, settled: true },
    revision: 2,
  });
  expect((await delayedPatch).status).toBe(409);
  expect(await spreadsheetDraftBindings(draftId)).toEqual(bindings);
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({
    bindingRevision: 2,
    documentKey: operation.documentKey,
    objectKey: `tests/${id}/old.xlsx`,
  });
});

test("recovery preserves a PATCH which obtains the form lock and commits first", async () => {
  const { draftId, id, operation, patch, recover } = await bindingFixture();
  const column = bindings.table?.columns[0];
  if (!column) {
    throw new Error("Missing test column");
  }
  const lock = await heldForm(id);
  let originalPatch: Promise<Response> | undefined;
  let confirmation: Promise<Response> | undefined;
  try {
    originalPatch = patch({
      change: {
        action: "upsert",
        kind: "column",
        value: { ...column, label: "Committed change" },
      },
      documentKey: operation.documentKey,
      revision: 1,
    });
    await waitForLockWaiters(lock.pid, 1);
    confirmation = recover({ documentKey: operation.documentKey, revision: 1 });
    await waitForLockWaiters(lock.pid, 2);
  } finally {
    lock.release();
    await lock.done;
  }
  if (!confirmation || !originalPatch) {
    throw new Error("Missing concurrent requests");
  }
  expect((await originalPatch).status).toBe(200);
  const settled = await confirmation;
  expect(settled.status).toBe(200);
  expect(await settled.json()).toMatchObject({
    recovery: { baseRevision: 1, settled: true },
    revision: 2,
  });
  expect(
    (await spreadsheetDraftBindings(draftId)).table?.columns[0]?.label
  ).toBe("Committed change");
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({ bindingRevision: 2 });
});

test("repeating a recovery whose acknowledgement was lost never advances the fence twice", async () => {
  const { draftId, operation, recover } = await bindingFixture();
  const request = { documentKey: operation.documentKey, revision: 1 };
  const lost = await recover(request);
  expect(lost.status).toBe(200);
  const repeated = await recover(request);
  expect(repeated.status).toBe(200);
  expect(await repeated.json()).toMatchObject({
    bindings,
    documentKey: operation.documentKey,
    recovery: { baseRevision: 1, settled: true },
    revision: 2,
  });
  expect(await spreadsheetDraftBindings(draftId)).toEqual(bindings);
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({ bindingRevision: 2 });
});

test("recovery requires scoped capability, the current document and an active lease, and rejects future base revisions", async () => {
  const { draftId, operation, recover } = await bindingFixture();
  const body = { documentKey: operation.documentKey, revision: 1 };
  expect((await recover(body, {})).status).toBe(401);
  expect(
    (await recover(body, { "X-Editor-Capability": "invalid" })).status
  ).toBe(401);
  expect(
    (await recover({ ...body, documentKey: "other-document" })).status
  ).toBe(409);
  expect((await recover({ ...body, revision: 2 })).status).toBe(409);
  expect((await recover({ ...body, revision: "1" })).status).toBe(400);
  expect(
    (await recover({ ...body, change: { action: "delete" } })).status
  ).toBe(400);
  await prisma.editorLease.deleteMany({ where: { targetId: draftId } });
  const expired = await recover(body);
  expect(expired.status).toBe(409);
  expect(await expired.json()).toMatchObject({
    error: "editor_lease_inactive",
  });
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({ bindingRevision: 1 });
});

test("active document operations and published Forms prevent recovery fences", async () => {
  const { draftId, id, operation, recover } = await bindingFixture();
  const active = await prisma.operation.create({
    data: {
      documentKey: operation.documentKey,
      formId: id,
      metadata: {},
      ownerUserId: adminId,
      status: "processing",
      targetId: draftId,
      targetType: "template_draft",
      type: "save_template_draft",
    },
  });
  const request = { documentKey: operation.documentKey, revision: 1 };
  const blocked = await recover(request);
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toMatchObject({
    error: "operation_in_progress",
  });
  await prisma.operation.delete({ where: { id: active.id } });
  await prisma.form.update({ data: { status: "published" }, where: { id } });
  try {
    const published = await recover(request);
    expect(published.status).toBe(409);
    expect(await published.json()).toMatchObject({
      error: "published_immutable",
    });
  } finally {
    await prisma.form.update({ data: { status: "draft" }, where: { id } });
  }
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } })
  ).toMatchObject({ bindingRevision: 1 });
  expect(await spreadsheetDraftBindings(draftId)).toEqual(bindings);
});
