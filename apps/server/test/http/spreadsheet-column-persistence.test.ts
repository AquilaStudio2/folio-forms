// oxlint-disable unicorn/no-await-expression-member no-await-in-loop -- Persisted-state assertions follow each sequential operation and rejected update.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { Prisma, prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import {
  spreadsheetColumnAnchor,
  spreadsheetTableColumnsAnchor,
} from "../../src/documents/spreadsheets/columns";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import type { SpreadsheetBindings } from "../../src/documents/spreadsheets/contract";
import { XLSX_CONTENT_TYPE } from "../../src/documents/spreadsheets/workbook";
import {
  spreadsheetBindingsForTemplate,
  spreadsheetDraftBindings,
  spreadsheetDraftFieldData,
} from "../../src/forms/spreadsheet-fields";
import { putObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

const forms: string[] = [];
let snapshot: Uint8Array | null = null;
let beforeCapture: (() => Promise<void>) | null = null;
const native = Bun.serve({
  async fetch() {
    await beforeCapture?.();
    return new Response(snapshot);
  },
  hostname: "127.0.0.1",
  port: 0,
});
const app = createApp({
  legacySso: null,
  onlyOffice: {
    convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
    forceSave: () => Promise.resolve({ url: native.url.href }),
  },
  onlyOfficeCallbackOrigins: [native.url.origin],
});
const builderBase = new URL(
  process.env.ONLYOFFICE_DOCUMENT_BASE_URL ?? "http://localhost:3000"
);
if (
  !builderBase.port ||
  builderBase.port === "3000" ||
  !["localhost", "127.0.0.1", "host.docker.internal"].includes(
    builderBase.hostname
  )
) {
  throw new Error(
    "Set ONLYOFFICE_DOCUMENT_BASE_URL to a dedicated local Builder callback port"
  );
}
app.listen({ hostname: "0.0.0.0", port: Number(builderBase.port) });
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
const editColumn = (
  candidate: SpreadsheetBindings,
  id: string,
  change: Partial<NonNullable<SpreadsheetBindings["table"]>["columns"][number]>
) => {
  if (!candidate.table) {
    throw new Error("Missing fixture table");
  }
  return {
    ...candidate,
    table: {
      ...candidate.table,
      columns: candidate.table.columns.map((column) =>
        column.id === id ? { ...column, ...change } : column
      ),
    },
  };
};
const settled = async (response: Response) => {
  expect(response.status).toBe(202);
  const { operationId } = (await response.json()) as { operationId: string };
  // Builder settles in another process; poll the original receipt.
  const deadline = performance.now() + 60_000;
  while (performance.now() < deadline) {
    const polling = await app.handle(
      new Request(`http://test.local/api/operations/${operationId}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
    expect(polling.status).toBe(200);
    const { operation } = (await polling.json()) as {
      operation: { status: string; error?: string; result?: unknown };
    };
    if (operation.status === "completed" || operation.status === "failed") {
      return operation;
    }
    await Bun.sleep(50);
  }
  throw new Error(`Operation ${operationId} did not settle`);
};
const fixture = async (computed = false) => {
  const id = crypto.randomUUID();
  forms.push(id);
  const publicId = id.replaceAll("-", "");
  const draftId = crypto.randomUUID();
  const documentKey = `columns-${id}`;
  const objectKey = `tests/${id}/old.xlsx`;
  const committed = computed
    ? editColumn(bindings, "folio_gamma", { computed: true })
    : bindings;
  await putObject(
    objectKey,
    fixtureWorkbook({
      cells: [],
      merges: [],
      names: {
        ...names,
        [spreadsheetColumnAnchor("folio_beta")]: "'Form'!$E$4:$E$5",
        [spreadsheetColumnAnchor("folio_gamma")]: "'Form'!$F$4:$F$5",
      },
    }),
    XLSX_CONTENT_TYPE
  );
  await prisma.form.create({
    data: {
      documentKind: "xlsx",
      id,
      publicId,
      templateDraft: {
        create: {
          bindingRevision: 1,
          documentKey,
          fieldRules: { create: spreadsheetDraftFieldData(committed) },
          id: draftId,
          objectKey,
        },
      },
      title: "Column persistence fixture",
    },
  });
  const request = (path: string, body?: unknown, capability?: string) =>
    app.handle(
      new Request(`http://test.local/api/admin/forms/${publicId}/${path}`, {
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          ...(capability ? { "X-Editor-Capability": capability } : {}),
        },
        method: body === undefined ? "GET" : "POST",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    );
  const open = async () => {
    const response = await request("editor-config");
    expect(response.status).toBe(200);
    return (await response.json()) as {
      bridge: {
        capabilities: Record<string, string>;
        documentKey: string;
        lease: { id: string };
      };
    };
  };
  const { bridge } = await open();
  const payload = (
    candidate = committed,
    spreadsheetAnchors: unknown = Object.entries(names),
    checkpoint = crypto.randomUUID()
  ) => ({
    documentKey,
    spreadsheetAnchors,
    xlsxDraft: { bindings: candidate, checkpoint, revision: 1, version: 1 },
  });
  const save = (body = payload()) =>
    request("save", body, bridge.capabilities["save-template"]);
  const recover = (
    body: unknown,
    capability = bridge.capabilities["save-template"]
  ) => request("xlsx-draft/recover", body, capability);
  return {
    bridge,
    committed,
    documentKey,
    draftId,
    id,
    objectKey,
    open,
    payload,
    recover,
    request,
    save,
  };
};

afterAll(async () => {
  await app.stop();
  await native.stop(true);
  await prisma.operation.deleteMany({ where: { formId: { in: forms } } });
  await prisma.editorLease.deleteMany({ where: { holderUserId: adminId } });
  // Published fixtures are immutable at the database boundary, like the other
  // publication suites; their isolated test database is disposed as a whole.
  await prisma.form.deleteMany({
    where: { id: { in: forms }, status: "draft" },
  });
  await prisma.user.deleteMany({ where: { id: adminId } });
});

test("saving Template Draft atomically persists current column offsets without changing stable identities", async () => {
  const f = await fixture();
  snapshot = bytes;
  expect(await settled(await f.save())).toMatchObject({ status: "completed" });
  const draft = await prisma.templateDraft.findUniqueOrThrow({
    where: { id: f.draftId },
  });
  expect(draft.bindingRevision).toBe(2);
  expect(draft.documentKey).not.toBe(f.documentKey);
  expect(draft.objectKey).not.toBe(f.objectKey);
  const actual = await spreadsheetDraftBindings(f.draftId);
  expect(actual.table?.columns.map((column) => column.offset)).toEqual([
    0, 2, 3,
  ]);
  expect(actual.table?.columns.map((column) => column.id)).toEqual(
    bindings.table?.columns.map((column) => column.id)
  );
});

test("publishing directly after a native column insertion freezes reconciled offsets in Manifest Fields", async () => {
  const f = await fixture();
  snapshot = bytes;
  expect(
    await settled(
      await f.request("publish", f.payload(), f.bridge.capabilities.publish)
    )
  ).toMatchObject({ status: "completed" });
  const published = await prisma.publishedTemplate.findUniqueOrThrow({
    where: { formId: f.id },
  });
  const actual = await spreadsheetBindingsForTemplate(published.id);
  expect(actual.table?.columns.map((column) => column.offset)).toEqual([
    0, 2, 3,
  ]);
  expect(actual.table?.columns.map((column) => column.id)).toEqual(
    bindings.table?.columns.map((column) => column.id)
  );
}, 120_000);

test("invalid column identity rolls back the entire Template Draft save", async () => {
  const f = await fixture();
  const invalidNames = {
    ...names,
    [spreadsheetColumnAnchor("folio_beta")]: "'Form'!$D$4:$D$5",
  };
  snapshot = fixtureWorkbook({ cells: [], merges: [], names: invalidNames });
  expect(
    await settled(
      await f.save(f.payload(bindings, Object.entries(invalidNames)))
    )
  ).toMatchObject({ status: "failed" });
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: f.draftId } })
  ).toMatchObject({
    bindingRevision: 1,
    documentKey: f.documentKey,
    objectKey: f.objectKey,
  });
  expect(await spreadsheetDraftBindings(f.draftId)).toEqual(bindings);
});

test("editing a moved column reconciles complete native placement without trusting client offsets", async () => {
  const f = await fixture();
  snapshot = bytes;
  const edited = editColumn(bindings, "folio_beta", { label: "Edited beta" });
  const incomplete = Object.entries(names).filter(
    ([name]) => name !== spreadsheetColumnAnchor("folio_gamma")
  );
  expect(
    await settled(await f.save(f.payload(edited, incomplete)))
  ).toMatchObject({ error: "invalid_template", status: "failed" });
  expect(await spreadsheetDraftBindings(f.draftId)).toEqual(bindings);
  expect(await settled(await f.save(f.payload(edited)))).toMatchObject({
    status: "completed",
  });
  const actual = await spreadsheetDraftBindings(f.draftId);
  expect(actual.table?.columns.map((column) => column.offset)).toEqual([
    0, 2, 3,
  ]);
  expect(actual.table?.columns[1]?.label).toBe("Edited beta");
});

test("column reordering retains untouched legacy computed-column metadata", async () => {
  const f = await fixture(true);
  const reordered = {
    ...names,
    [spreadsheetColumnAnchor("folio_alpha")]: "'Form'!$F$4:$F$5",
    [spreadsheetColumnAnchor("folio_beta")]: "'Form'!$E$4:$E$5",
    [spreadsheetColumnAnchor("folio_gamma")]: "'Form'!$D$4:$D$5",
  };
  snapshot = fixtureWorkbook({ cells: [], merges: [], names: reordered });
  expect(
    await settled(
      await f.save(
        f.payload(
          editColumn(f.committed, "folio_alpha", { label: "Edited alpha" }),
          Object.entries(reordered)
        )
      )
    )
  ).toMatchObject({ status: "completed" });
  const actual = await spreadsheetDraftBindings(f.draftId);
  expect(actual.table?.columns.map((column) => column.offset)).toEqual([
    2, 1, 0,
  ]);
  expect(actual.table?.columns[2]).toMatchObject({
    computed: true,
    id: "folio_gamma",
    label: "gamma",
    offset: 0,
  });
});

test("incomplete, foreign, duplicate, malformed or mismatched column placement proofs leave Draft unchanged", async () => {
  const f = await fixture();
  snapshot = bytes;
  const entries = Object.entries(names);
  for (const proof of [
    [],
    entries.slice(0, -1),
    [...entries.slice(0, -1), ["folio_foreign", "Form!G4:G5"]],
    [...entries.slice(0, -1), entries[0]],
    [
      ...entries.slice(0, -1),
      [spreadsheetColumnAnchor("folio_gamma"), "Form!F4:F5"],
    ],
    [
      ...entries.slice(0, -1),
      [spreadsheetColumnAnchor("folio_gamma"), "not-a-range"],
    ],
  ]) {
    expect(
      await settled(await f.save(f.payload(bindings, proof)))
    ).toMatchObject({ error: "invalid_template", status: "failed" });
  }
  for (const offset of [-1, 0.5, 16_384]) {
    expect(
      (await f.save(f.payload(editColumn(bindings, "folio_alpha", { offset }))))
        .status
    ).toBe(400);
  }
  if (!bindings.table) {
    throw new Error("Missing test table");
  }
  const removed = {
    ...bindings,
    table: {
      ...bindings.table,
      columns: bindings.table.columns.filter(
        (column) => column.id !== "folio_beta"
      ),
    },
  };
  const removedProof = entries.filter(
    ([name]) => name !== spreadsheetColumnAnchor("folio_beta")
  );
  expect(
    await settled(await f.save(f.payload(removed, removedProof)))
  ).toMatchObject({ error: "invalid_template", status: "failed" });
  expect(await spreadsheetDraftBindings(f.draftId)).toEqual(bindings);
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: f.draftId } })
  ).toMatchObject({ bindingRevision: 1, objectKey: f.objectKey });
});

test("duplicate scalar, table and column tags return the exact actionable conflict without changing metadata", async () => {
  const f = await fixture();
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
  if (!bindings.table || !fields[0] || !fields[1]) {
    throw new Error("Missing test configuration");
  }
  for (const candidate of [
    { ...bindings, fields: [fields[0], { ...fields[1], key: "agency" }] },
    { ...bindings, fields: [{ ...fields[0], key: "items" }, fields[1]] },
    { ...bindings, fields, table: { ...bindings.table, key: "agency" } },
    editColumn(bindings, "folio_beta", { key: "alpha" }),
  ]) {
    const response = await f.save(f.payload(candidate));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "duplicate_field_tag",
      message: "tag นี้ซ้ำ กรุณาใช้ tag อื่น",
    });
  }
  expect(await spreadsheetDraftBindings(f.draftId)).toEqual(bindings);
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: f.draftId } })
  ).toMatchObject({ bindingRevision: 1 });
});

test("other invalid spreadsheet settings return Thai guidance and never report a duplicate tag", async () => {
  const f = await fixture();
  for (const change of [
    { offset: 2 },
    { key: "invalid tag" },
    { options: [], type: "dropdown" as const },
    { label: "" },
  ]) {
    const response = await f.save(
      f.payload(editColumn(bindings, "folio_beta", change))
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_field_config");
    expect(body.message).toMatch(/[\u0E00-\u0E7F]/u);
    expect(body.message).not.toBe("tag นี้ซ้ำ กรุณาใช้ tag อื่น");
  }
  expect(await spreadsheetDraftBindings(f.draftId)).toEqual(bindings);
});

test("binding reads and Save acknowledgements identify the exact committed editor document", async () => {
  const f = await fixture();
  const read = await f.request(
    "spreadsheet-bindings",
    undefined,
    f.bridge.capabilities["configure-fields"]
  );
  expect(read.status).toBe(200);
  expect(await read.json()).toMatchObject({
    documentKey: f.documentKey,
    revision: 1,
  });
  snapshot = bytes;
  const completed = await settled(
    await f.save(
      f.payload(editColumn(bindings, "folio_alpha", { label: "Renamed alpha" }))
    )
  );
  const { bridge } = await f.open();
  expect(bridge.documentKey).not.toBe(f.documentKey);
  expect(completed).toMatchObject({
    result: { documentKey: bridge.documentKey },
    status: "completed",
  });
  const reopened = await f.request(
    "spreadsheet-bindings",
    undefined,
    bridge.capabilities["configure-fields"]
  );
  expect(await reopened.json()).toMatchObject({
    documentKey: bridge.documentKey,
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

test("a recovery fence invalidates an original Save queued behind it without changing the committed pair", async () => {
  const f = await fixture();
  const body = f.payload(
    editColumn(bindings, "folio_alpha", { label: "Delayed change" })
  );
  const lock = await heldForm(f.id);
  let confirmation: Promise<Response> | undefined;
  let delayedSave: Promise<Response> | undefined;
  try {
    confirmation = f.recover({
      checkpoint: body.xlsxDraft.checkpoint,
      leaseId: f.bridge.lease.id,
    });
    await waitForLockWaiters(lock.pid, 1);
    delayedSave = f.save(body);
    await waitForLockWaiters(lock.pid, 2);
  } finally {
    lock.release();
    await lock.done;
  }
  if (!confirmation || !delayedSave) {
    throw new Error("Missing concurrent requests");
  }
  const fenced = await confirmation;
  expect(fenced.status).toBe(200);
  expect(await fenced.json()).toEqual({ status: "not-admitted" });
  expect((await delayedSave).status).toBe(409);
  expect(await spreadsheetDraftBindings(f.draftId)).toEqual(bindings);
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: f.draftId } })
  ).toMatchObject({
    bindingRevision: 1,
    documentKey: f.documentKey,
    objectKey: f.objectKey,
  });
});

test("recovery returns an original Save admitted ahead of its concurrent fence", async () => {
  const f = await fixture();
  snapshot = bytes;
  const body = f.payload(
    editColumn(bindings, "folio_alpha", { label: "Committed change" })
  );
  const lock = await heldForm(f.id);
  let original: Promise<Response> | undefined;
  let confirmation: Promise<Response> | undefined;
  try {
    original = f.save(body);
    await waitForLockWaiters(lock.pid, 1);
    confirmation = f.recover({
      checkpoint: body.xlsxDraft.checkpoint,
      leaseId: f.bridge.lease.id,
    });
    await waitForLockWaiters(lock.pid, 2);
  } finally {
    lock.release();
    await lock.done;
  }
  if (!confirmation || !original) {
    throw new Error("Missing concurrent requests");
  }
  const admitted = await original;
  expect(admitted.status).toBe(202);
  const { operationId } = (await admitted.clone().json()) as {
    operationId: string;
  };
  const found = await confirmation;
  expect(found.status).toBe(200);
  expect(await found.json()).toMatchObject({
    action: "save-template",
    operationId,
  });
  expect(await settled(admitted)).toMatchObject({ status: "completed" });
  const recovered = await f.recover({
    checkpoint: body.xlsxDraft.checkpoint,
    leaseId: f.bridge.lease.id,
  });
  expect(recovered.status).toBe(200);
  expect(await recovered.json()).toMatchObject({
    current: { bindingRevision: 2 },
    operationId,
    status: "completed",
  });
  expect(
    (await spreadsheetDraftBindings(f.draftId)).table?.columns[0]?.label
  ).toBe("Committed change");
});

test("repeating recovery after a lost acknowledgement neither advances the committed revision nor fences a new lease", async () => {
  const f = await fixture();
  const body = { checkpoint: crypto.randomUUID(), leaseId: f.bridge.lease.id };
  expect((await f.recover(body)).status).toBe(200);
  const { bridge } = await f.open();
  expect(bridge.lease.id).not.toBe(body.leaseId);
  const repeated = await f.recover(body, bridge.capabilities["save-template"]);
  expect(repeated.status).toBe(200);
  expect(await repeated.json()).toEqual({ status: "not-admitted" });
  expect((await f.open()).bridge.lease.id).toBe(bridge.lease.id);
  expect(await spreadsheetDraftBindings(f.draftId)).toEqual(bindings);
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: f.draftId } })
  ).toMatchObject({ bindingRevision: 1, objectKey: f.objectKey });
});

test("recovery requires scoped authority and never fences a different editor lease", async () => {
  const f = await fixture();
  const other = await fixture();
  const body = { checkpoint: crypto.randomUUID(), leaseId: f.bridge.lease.id };
  expect((await f.recover(body, "")).status).toBe(401);
  expect((await f.recover(body, "invalid")).status).toBe(401);
  expect(
    (await f.recover(body, other.bridge.capabilities["save-template"])).status
  ).toBe(403);
  expect(
    (await f.recover(body, f.bridge.capabilities["configure-fields"])).status
  ).toBe(403);
  expect(
    (await f.recover({ ...body, leaseId: other.bridge.lease.id })).status
  ).toBe(409);
  expect((await f.recover({ ...body, checkpoint: "invalid" })).status).toBe(
    400
  );
  expect(
    (await f.recover({ ...body, change: { action: "delete" } })).status
  ).toBe(400);
  expect((await f.open()).bridge.lease.id).toBe(body.leaseId);
  expect((await other.open()).bridge.lease.id).toBe(other.bridge.lease.id);
  expect(
    (
      await f.save({
        ...f.payload(),
        xlsxDraft: { ...f.payload().xlsxDraft, revision: 2 },
      })
    ).status
  ).toBe(409);
  expect(
    await prisma.templateDraft.findUniqueOrThrow({ where: { id: f.draftId } })
  ).toMatchObject({ bindingRevision: 1 });
});

test("an active Save prevents fencing a different checkpoint and a published Form rejects Save", async () => {
  const f = await fixture();
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  snapshot = bytes;
  beforeCapture = async () => {
    entered.resolve();
    await release.promise;
  };
  const body = f.payload();
  const original = await f.save(body);
  expect(original.status).toBe(202);
  try {
    await entered.promise;
    const leaseId = f.bridge.lease.id;
    const blocked = await f.recover({
      checkpoint: crypto.randomUUID(),
      leaseId,
    });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
      error: "checkpoint_unresolved",
    });
    const found = await f.recover({
      checkpoint: body.xlsxDraft.checkpoint,
      leaseId,
    });
    expect(found.status).toBe(200);
    const { status } = (await found.json()) as { status: string };
    expect(["pending", "processing"]).toContain(status);
  } finally {
    beforeCapture = null;
    release.resolve();
  }
  expect(await settled(original)).toMatchObject({ status: "completed" });
  const { bridge } = await f.open();
  const committed = await spreadsheetDraftBindings(f.draftId);
  const payload = f.payload(committed);
  const current = {
    ...payload,
    documentKey: bridge.documentKey,
    xlsxDraft: { ...payload.xlsxDraft, revision: 2 },
  };
  expect(
    await settled(
      await f.request("publish", current, bridge.capabilities.publish)
    )
  ).toMatchObject({ status: "completed" });
  const published = await f.request(
    "save",
    current,
    bridge.capabilities["save-template"]
  );
  expect(published.status).toBe(409);
  expect(await published.json()).toMatchObject({
    error: "published_immutable",
  });
});
