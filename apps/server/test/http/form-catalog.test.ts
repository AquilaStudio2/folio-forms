import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";

import { FormStatus, prisma } from "@onlyoffice/db";
import type { Form } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { bearerFor, createCredentialFixture } from "../fixtures/http";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "The catalog HTTP tests require an isolated PostgreSQL DATABASE_URL"
  );
}

const app = createApp({
  legacySso: null,
  omniRoute: null,
  onlyOffice: {
    convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
    forceSave: () => Promise.resolve(false),
  },
  requestIp: (request) => request.headers.get("x-test-ip"),
});
const password = "Catalog-test-password-2026!";
const fixtureKey = crypto.randomUUID().replaceAll("-", "");
const statuses = [FormStatus.draft, FormStatus.published, FormStatus.archived];
let adminId = "";
let userId = "";
let adminBearer = "";
let userBearer = "";
let extraUserIds: string[] = [];
let forms: Form[] = [];
let searchMarker = "";
let baselineTotal = 0;

interface CatalogForm {
  activeDraftCount: number;
  createdAt: string;
  description: string;
  fillMethod: string;
  hasTemplateDraft: boolean;
  publicId: string;
  status: string;
  submissionCount: number;
  title: string;
  updatedAt: string;
  version: number;
}

interface CatalogBody {
  forms: CatalogForm[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const catalogResponse = (query = "", token: string | null = adminBearer) =>
  app.handle(
    new Request(
      `http://test.local/api/admin/forms${query ? `?${query}` : ""}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    )
  );

const catalog = async (query = ""): Promise<CatalogBody> => {
  const response = await catalogResponse(query);
  expect(response.status).toBe(200);
  return response.json() as Promise<CatalogBody>;
};

const searchQuery = (search: string, extra: Record<string, string> = {}) =>
  new URLSearchParams({ search, ...extra }).toString();

const publicIds = (items: { publicId: string }[]) =>
  items.map((item) => item.publicId);

beforeAll(async () => {
  const admin = await createCredentialFixture({
    email: `catalog-admin-${fixtureKey}@example.test`,
    name: "Catalog Admin",
    password,
    role: "admin",
  });
  const user = await createCredentialFixture({
    email: `catalog-user-${fixtureKey}@example.test`,
    name: "Catalog User",
    password,
  });
  adminId = admin.id;
  userId = user.id;
  adminBearer = await bearerFor(app, admin.email, password);
  userBearer = await bearerFor(app, user.email, password);
  extraUserIds = [crypto.randomUUID(), crypto.randomUUID()];
  await prisma.user.createMany({
    data: extraUserIds.map((id) => ({
      email: `${id}@example.test`,
      id,
      name: "Catalog response owner",
    })),
  });
});

beforeEach(async () => {
  baselineTotal = await prisma.form.count();
  const newest = await prisma.form.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  const timestamp =
    Math.max(Date.now(), newest?.updatedAt.getTime() ?? 0) + 60_000;
  searchMarker = `catalog${crypto.randomUUID().replaceAll("-", "")}`;
  const titleByIndex: Record<number, string> = {
    0: `Report ${searchMarker}-Energy Report`,
    3: `${searchMarker}พลังงาน`,
    4: `${searchMarker}% literal percent`,
    5: `${searchMarker}_ literal underscore`,
    6: `${searchMarker}\\ literal backslash`,
  };
  const descriptionForIndex = (index: number): string | null => {
    if (index === 0 || index === 1) {
      return `Details ${searchMarker}-EnErGy description`;
    }
    if (index === 2) {
      return null;
    }
    return `${searchMarker} description ${index}`;
  };
  const data = Array.from({ length: 31 }, (_, index) => ({
    createdBy: adminId,
    description: descriptionForIndex(index),
    id: crypto.randomUUID(),
    publicId: crypto.randomUUID().replaceAll("-", ""),
    status: statuses[index % statuses.length] ?? FormStatus.draft,
    title: titleByIndex[index] ?? `${searchMarker} Form ${index}`,
    updatedAt: new Date(timestamp - Math.max(0, index - 1) * 1000),
  }));
  await prisma.form.createMany({ data });
  forms = await prisma.form.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    where: { id: { in: data.map(({ id }) => id) } },
  });
});

afterEach(async () => {
  // Immutable published artifacts and their Responses remain in the disposable DB.
  // Delete only this test's transient Forms; never disable persistence guards.
  await prisma.form.deleteMany({
    where: {
      id: { in: forms.map(({ id }) => id) },
      publishedTemplate: null,
      responses: { none: {} },
      submissions: { none: {} },
    },
  });
  // Keep immutable fixtures out of the newest page in subsequent HTTP suites.
  await prisma.form.updateMany({
    data: { updatedAt: new Date("2000-01-01T00:00:00.000Z") },
    where: { id: { in: forms.map(({ id }) => id) } },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

test("default request returns all statuses, latest ten forms, and pagination without filters", async () => {
  const body = await catalog();
  expect(publicIds(body.forms)).toEqual(publicIds(forms.slice(0, 10)));
  expect(body.pagination).toEqual({
    page: 1,
    pageSize: 10,
    total: baselineTotal + 31,
    totalPages: Math.ceil((baselineTotal + 31) / 10),
  });
  expect(new Set(body.forms.map(({ status }) => status))).toEqual(
    new Set(statuses)
  );
  expect(await catalog("status=all")).toEqual(body);
  expect(await catalog("search=%20%20%20")).toEqual(body);
});

test("search matches partial title OR description case-insensitively and trims whitespace", async () => {
  const expected = forms.filter(({ title, description }) =>
    `${title} ${description ?? ""}`
      .toLowerCase()
      .includes(`${searchMarker}-energy`)
  );
  const body = await catalog(searchQuery(`  ${searchMarker}-eNeRgY  `));
  expect(publicIds(body.forms)).toEqual(publicIds(expected));
  expect(body.pagination.total).toBe(2);
  expect(await catalog(searchQuery(`${searchMarker}-ENERGY`))).toEqual(body);
});

test("search supports Thai substrings and null descriptions", async () => {
  const thai = await catalog(searchQuery(`${searchMarker}พลัง`));
  expect(thai.forms).toHaveLength(1);
  expect(thai.forms[0]?.title).toBe(`${searchMarker}พลังงาน`);
  const withoutDescription = await catalog(
    searchQuery(`${searchMarker} Form 2`)
  );
  expect(
    withoutDescription.forms.some(({ description }) => description === "")
  ).toBe(true);
});

test.each(["%", "_", "\\"])(
  "search treats %s as a literal character, not a LIKE wildcard",
  async (symbol) => {
    const body = await catalog(searchQuery(`${searchMarker}${symbol}`));
    expect(body.forms).toHaveLength(1);
    expect(body.forms[0]?.title).toContain(`${searchMarker}${symbol}`);
    expect(body.pagination.total).toBe(1);
  }
);

test.each(statuses)("filters %s status with an exact total", async (status) => {
  const existing = await prisma.form.count({ where: { status } });
  const body = await catalog(`status=${status}`);
  expect(body.forms.every((form) => form.status === status)).toBe(true);
  expect(body.pagination.total).toBe(existing);
  expect(publicIds(body.forms)).toEqual(
    publicIds(forms.filter((form) => form.status === status).slice(0, 10))
  );
});

test.each(statuses)(
  "combines search OR matching with %s status using AND",
  async (status) => {
    const body = await catalog(
      searchQuery(`${searchMarker}-energy`, { status })
    );
    const expected = forms.filter(
      (form) =>
        form.status === status &&
        `${form.title} ${form.description ?? ""}`
          .toLowerCase()
          .includes(`${searchMarker}-energy`)
    );
    expect(publicIds(body.forms)).toEqual(publicIds(expected));
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: expected.length,
      totalPages: 1,
    });
  }
);

test("pages have exactly ten rows, stable order across timestamp ties, and no overlap", async () => {
  const bodies = await Promise.all(
    [1, 2, 3, 4].map((page) =>
      catalog(searchQuery(searchMarker, { page: String(page) }))
    )
  );
  expect(bodies.map(({ forms: items }) => items.length)).toEqual([
    10, 10, 10, 1,
  ]);
  expect(publicIds(bodies.flatMap(({ forms: items }) => items))).toEqual(
    publicIds(forms)
  );
  expect(
    new Set(bodies.flatMap(({ forms: items }) => publicIds(items))).size
  ).toBe(31);
  for (const [index, body] of bodies.entries()) {
    expect(body.pagination).toEqual({
      page: index + 1,
      pageSize: 10,
      total: 31,
      totalPages: 4,
    });
  }
  const [firstPage] = bodies;
  if (!firstPage) {
    throw new Error("Catalog page fixtures are missing");
  }
  expect(await catalog(searchQuery(searchMarker))).toEqual(firstPage);
});

test("pagination uses the filtered total and handles exactly ten matching rows", async () => {
  const draftForms = forms.filter(({ status }) => status === "draft");
  const first = await catalog(
    searchQuery(searchMarker, { page: "1", status: "draft" })
  );
  const second = await catalog(
    searchQuery(searchMarker, { page: "2", status: "draft" })
  );
  expect(publicIds([...first.forms, ...second.forms])).toEqual(
    publicIds(draftForms)
  );
  expect(first.forms).toHaveLength(10);
  expect(second.forms).toHaveLength(1);
  expect(second.pagination).toEqual({
    page: 2,
    pageSize: 10,
    total: 11,
    totalPages: 2,
  });
  const fullPage = await catalog(
    searchQuery(searchMarker, { page: "2", status: "published" })
  );
  expect(fullPage.forms).toHaveLength(10);
  expect(fullPage.pagination).toEqual({
    page: 1,
    pageSize: 10,
    total: 10,
    totalPages: 1,
  });
});

test("SQL-like search text is ordinary input and never expands the result set", async () => {
  const body = await catalog(searchQuery(`${searchMarker}' OR 1=1 --`));
  expect(body).toEqual({
    forms: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  });
});

test.each(["5", "2147483647"])(
  "clamps valid out-of-range page %s to the last page",
  async (page) => {
    const body = await catalog(searchQuery(searchMarker, { page }));
    expect(publicIds(body.forms)).toEqual(publicIds(forms.slice(30)));
    expect(body.pagination).toEqual({
      page: 4,
      pageSize: 10,
      total: 31,
      totalPages: 4,
    });
  }
);

test("empty matches normalize to page one with an empty list", async () => {
  const body = await catalog(
    searchQuery(`${searchMarker}no-match`, { page: "4" })
  );
  expect(body).toEqual({
    forms: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  });
});

test("page size stays fixed even if a caller requests another page size", async () => {
  const body = await catalog(searchQuery(searchMarker, { pageSize: "1000" }));
  expect(body.forms).toHaveLength(10);
  expect(body.pagination.pageSize).toBe(10);
});

test.each([
  "",
  "0",
  "-1",
  "1.5",
  "abc",
  "1e2",
  "01",
  " 1",
  "+1",
  "2147483648",
  "9007199254740992",
])("rejects invalid page %s", async (page) => {
  const response = await catalogResponse(
    new URLSearchParams({ page }).toString()
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "invalid_request" });
});

test.each(["", "DRAFT", "unknown", " draft"])(
  "rejects invalid status %s",
  async (status) => {
    const response = await catalogResponse(
      new URLSearchParams({ status }).toString()
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  }
);

test.each([
  "page=1&page=2",
  "status=draft&status=published",
  "search=one&search=two",
])("rejects duplicate query parameters: %s", async (query) => {
  const response = await catalogResponse(query);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "invalid_request" });
});

test("accepts 200 search characters and rejects 201 after trimming", async () => {
  const accepted = await catalog(searchQuery(` ${"z".repeat(200)} `));
  expect(accepted.pagination.total).toBe(0);
  const response = await catalogResponse(searchQuery("z".repeat(201)));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "invalid_request" });
});

test("catalog requires authentication and Admin authority even for malformed filters", async () => {
  const anonymous = await catalogResponse("page=0", null);
  const user = await catalogResponse("page=0", userBearer);
  const invalidToken = await catalogResponse("", "invalid-token");
  expect(anonymous.status).toBe(401);
  expect(user.status).toBe(403);
  expect(invalidToken.status).toBe(401);
});

test("DTO preserves metadata and counts only draft Responses plus every Submission per Form", async () => {
  const [target, unrelated] = forms;
  if (!target || !unrelated) {
    throw new Error("Catalog fixtures are missing");
  }
  const published = await prisma.publishedTemplate.create({
    data: {
      contentHash: "fixture-hash",
      documentKey: crypto.randomUUID(),
      formId: target.id,
      objectKey: "catalog-fixture-published",
      version: 2,
    },
  });
  await prisma.templateDraft.create({
    data: {
      documentKey: crypto.randomUUID(),
      formId: target.id,
      objectKey: "catalog-fixture-draft",
    },
  });
  const updated = await prisma.form.update({
    data: {
      fillMethod: "native",
      status: "published",
      updatedAt: target.updatedAt,
      version: 2,
    },
    where: { id: target.id },
  });
  const owners = [adminId, userId, ...extraUserIds];
  const responseIds = owners.map(() => crypto.randomUUID());
  const responseStatuses = [
    "draft",
    "draft",
    "submitting",
    "submitted",
  ] as const;
  await prisma.response.createMany({
    data: owners.map((id, index) => ({
      draftDocumentKey: index < 3 ? crypto.randomUUID() : null,
      draftObjectKey: index < 3 ? `catalog-response-${index}` : null,
      formId: target.id,
      id: responseIds[index],
      publishedTemplateId: published.id,
      publishedVersion: 2,
      status: responseStatuses[index],
      userId: id,
    })),
  });
  await prisma.submission.createMany({
    data: [0, 1].map((index) => ({
      data: { revision: index },
      documentKey: crypto.randomUUID(),
      formId: target.id,
      objectKey: `catalog-submission-${index}`,
      responseId: responseIds[3] as string,
      userId: owners[3] as string,
    })),
  });
  const otherTemplate = await prisma.publishedTemplate.create({
    data: {
      contentHash: "fixture-hash",
      documentKey: crypto.randomUUID(),
      formId: unrelated.id,
      objectKey: "catalog-unrelated-template",
      version: 1,
    },
  });
  await prisma.response.create({
    data: {
      draftDocumentKey: crypto.randomUUID(),
      draftObjectKey: "catalog-unrelated-response",
      formId: unrelated.id,
      publishedTemplateId: otherTemplate.id,
      publishedVersion: 1,
      userId: adminId,
    },
  });
  const body = await catalog(searchQuery(target.title));
  expect(
    body.forms.find(({ publicId }) => publicId === target.publicId)
  ).toEqual({
    activeDraftCount: 2,
    createdAt: updated.createdAt.toISOString(),
    description: updated.description ?? "",
    fillMethod: "native",
    hasTemplateDraft: true,
    publicId: target.publicId,
    status: "published",
    submissionCount: 2,
    title: target.title,
    updatedAt: updated.updatedAt.toISOString(),
    version: 2,
  });
  const other = await catalog(searchQuery(unrelated.title));
  expect(
    other.forms.find(({ publicId }) => publicId === unrelated.publicId)
  ).toMatchObject({
    activeDraftCount: 1,
    hasTemplateDraft: false,
    submissionCount: 0,
  });
});

test("deleting the sole item on page four automatically returns ten items on page three", async () => {
  const last = forms.at(-1);
  if (!last) {
    throw new Error("Catalog fixtures are missing");
  }
  // The existing DELETE contract permits only unpublished Forms.
  await prisma.form.update({
    data: { status: "draft", updatedAt: last.updatedAt },
    where: { id: last.id },
  });
  const before = await catalog(searchQuery(searchMarker, { page: "4" }));
  expect(publicIds(before.forms)).toEqual([last.publicId]);
  const deleted = await app.handle(
    new Request(`http://test.local/api/admin/forms/${last.publicId}`, {
      headers: { Authorization: `Bearer ${adminBearer}` },
      method: "DELETE",
    })
  );
  expect(deleted.status).toBe(200);
  expect(await deleted.json()).toEqual({ deleted: true });
  const after = await catalog(searchQuery(searchMarker, { page: "4" }));
  expect(after.pagination).toEqual({
    page: 3,
    pageSize: 10,
    total: 30,
    totalPages: 3,
  });
  expect(publicIds(after.forms)).toEqual(publicIds(forms.slice(20, 30)));
});
