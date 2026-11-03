// oxlint-disable no-await-in-loop -- HTTP scenarios create isolated saved revision fixtures in sequence.
import { beforeAll, expect, test } from "bun:test";

import { Prisma, prisma } from "@onlyoffice/db";
import type { DocumentKind } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { createResultsHttpFixtures } from "./helpers/results";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Results HTTP tests require an isolated PostgreSQL DATABASE_URL"
  );
}

const app = createApp({ legacySso: null, omniRoute: null });
let adminBearer = "";
let adminId = "";

beforeAll(async () => {
  const password = "Results-filter-fixture-password!";
  const admin = await createCredentialFixture({
    email: `results-${crypto.randomUUID()}@example.test`,
    name: "Results Admin",
    password,
    role: "admin",
  });
  adminId = admin.id;
  adminBearer = await bearerFor(app, admin.email, password);
});

const {
  detailRequest,
  request,
  resultForm,
  resultIds,
  results,
  savedCorrection,
  savedResult,
  savedSubmission,
} = createResultsHttpFixtures({
  app,
  correctionChangedData: { province: "เชียงใหม่" },
  defaultFields: [{ label: "Province", tag: "province" }],
  formTitle: "Province",
  getAdmin: () => ({ bearer: adminBearer, id: adminId }),
});

for (const kind of ["docx", "xlsx"] satisfies DocumentKind[]) {
  test(`${kind}: province searches the declared current saved root answer`, async () => {
    const form = await resultForm(kind);
    const matching = await savedResult(form, { province: "เชียงใหม่" });
    await savedResult(form, { province: "เชียงราย" });

    const page = await results({ form: form.publicId, province: "เชียงใหม่" });
    expect(page.results.map(({ id }) => id)).toEqual([matching.id]);
    expect(page.pagination.totalPages).toBe(1);
  });

  test(`${kind}: province trims only outer whitespace and treats unsupported saved answers as nonmatches`, async () => {
    const form = await resultForm(kind);
    const matching = await savedResult(form, { province: " \nเชียงใหม่\t " });
    for (const data of [
      { province: "จ.เชียงใหม่" },
      { province: "จังหวัดเชียงใหม่" },
      { province: "เชียง ใหม่" },
      { province: "Chiang Mai" },
      { province: "50" },
      { province: "" },
      { province: "   " },
      { province: null },
      { province: 50 },
      { province: true },
      { province: ["เชียงใหม่"] },
      { province: { name: "เชียงใหม่" } },
      { nested: { province: "เชียงใหม่" } },
      { rows: [{ province: "เชียงใหม่" }] },
      {},
      ["เชียงใหม่"],
      "เชียงใหม่",
      Prisma.JsonNull,
    ]) {
      await savedResult(form, data);
    }
    const page = await results({ form: form.publicId, province: "เชียงใหม่" });
    expect(page.results.map(({ id }) => id)).toEqual([matching.id]);
  });

  test(`${kind}: only the published scalar root Tag establishes province eligibility`, async () => {
    const ineligibleFields: Prisma.ManifestFieldCreateWithoutManifestInput[][] =
      [
        [],
        [{ label: "province", position: 0, tag: "area", type: "text" }],
        [{ label: "Province", position: 0, tag: "Province", type: "text" }],
        [{ label: "Province", position: 0, tag: "province", type: "table" }],
        [
          {
            label: "Province",
            position: 0,
            tag: "rows.province",
            type: "text",
            ...(kind === "xlsx"
              ? { binding: { computed: false, id: "folio_column", offset: 0 } }
              : {}),
          },
        ],
      ];
    if (kind === "xlsx") {
      ineligibleFields.push([
        {
          binding: { computed: false, id: "folio_column", offset: 0 },
          label: "Province",
          position: 0,
          tag: "province",
          type: "text",
        },
      ]);
    }
    for (const fields of ineligibleFields) {
      const form = await resultForm(kind, fields);
      const saved = await savedResult(form, {
        province: "เชียงใหม่",
        rows: [{ province: "เชียงใหม่" }],
      });
      expect(
        await resultIds({ form: form.publicId, province: "เชียงใหม่" })
      ).toEqual([]);
      expect(await resultIds({ form: form.publicId })).toEqual([saved.id]);
    }
  });

  test(`${kind}: editable Template Draft fields cannot qualify a Response`, async () => {
    const form = await resultForm(kind, []);
    await prisma.templateDraft.create({
      data: {
        documentKey: crypto.randomUUID(),
        fieldRules: {
          create: { label: "Province", tag: "province", type: "text" },
        },
        formId: form.id,
        objectKey: `tests/results/draft-${crypto.randomUUID()}.${kind}`,
      },
    });
    const saved = await savedResult(form, { province: "เชียงใหม่" });
    expect(
      await resultIds({ form: form.publicId, province: "เชียงใหม่" })
    ).toEqual([]);
    expect(await resultIds({ form: form.publicId })).toEqual([saved.id]);
  });

  test(`${kind}: province follows saved Draft, Submitting, latest Submission and complete latest Correction data`, async () => {
    const form = await resultForm(kind);
    const draft = await savedResult(form, { province: "เชียงใหม่" });
    await savedSubmission(draft, { province: "เชียงราย" });
    const submitting = await savedResult(
      form,
      { province: "เชียงใหม่" },
      "submitting"
    );
    await savedSubmission(submitting, { province: "เชียงราย" });

    const latestSubmission = await savedResult(form, {}, "submitted");
    await savedSubmission(latestSubmission, { province: "เชียงราย" });
    await savedSubmission(
      latestSubmission,
      { province: "เชียงใหม่" },
      new Date("2026-10-02T00:00:00Z")
    );

    const olderSubmission = await savedResult(form, {}, "submitted");
    const superseded = await savedSubmission(olderSubmission, {
      province: "เชียงใหม่",
    });
    await savedCorrection(superseded, { province: "เชียงใหม่" }, 1);
    await savedSubmission(
      olderSubmission,
      { province: "เชียงราย" },
      new Date("2026-10-02T00:00:00Z")
    );

    const latestCorrection = await savedResult(form, {}, "submitted");
    const corrected = await savedSubmission(latestCorrection, {
      province: "เชียงราย",
    });
    await savedCorrection(corrected, { province: "เชียงราย" }, 1);
    await savedCorrection(corrected, { province: "เชียงใหม่" }, 2);

    const olderCorrection = await savedResult(form, {}, "submitted");
    const changed = await savedSubmission(olderCorrection, {
      province: "เชียงใหม่",
    });
    await savedCorrection(changed, { province: "เชียงใหม่" }, 1);
    await savedCorrection(changed, { province: "เชียงราย" }, 2);

    const removed = await savedResult(form, {}, "submitted");
    const cleared = await savedSubmission(removed, { province: "เชียงใหม่" });
    await savedCorrection(
      cleared,
      { other: "The complete revision omitted province" },
      1
    );

    const page = await results({ form: form.publicId, province: "เชียงใหม่" });
    expect(page.results.map(({ id }) => id).toSorted()).toEqual(
      [
        draft.id,
        submitting.id,
        latestSubmission.id,
        latestCorrection.id,
      ].toSorted()
    );
    expect(page.results.find(({ id }) => id === submitting.id)?.state).toBe(
      "draft"
    );
    for (const response of [
      draft,
      submitting,
      latestSubmission,
      latestCorrection,
    ]) {
      const detail = await detailRequest(response.id);
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({
        result: { data: { province: "เชียงใหม่" } },
      });
    }
    expect(
      await resultIds({
        correction: "0",
        form: form.publicId,
        province: "เชียงราย",
      })
    ).toEqual([olderSubmission.id]);
  });
}

test("province rejects unsupported query choices through the normal invalid-request response", async () => {
  for (const province of ["", "จ.เชียงใหม่", "50", "Chiang Mai", " เชียงใหม่ "]) {
    const response = await request({ province });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  }
});

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: province combines each existing criterion with AND and retains inclusive update-date boundaries",
  async (kind) => {
    const form = await resultForm(kind);
    const saved = await savedResult(form, {}, "submitted");
    const submission = await savedSubmission(saved, { province: "เชียงราย" });
    await savedCorrection(submission, { province: "เชียงราย" }, 1);
    await savedCorrection(submission, { province: "เชียงใหม่" }, 2);
    const marker = `filter-${crypto.randomUUID()}`;
    await prisma.user.update({
      data: { email: `${marker}@example.test` },
      where: { id: saved.userId },
    });
    const updatedAt = "2026-10-15T12:00:00.000Z";
    await prisma.response.update({
      data: { updatedAt: new Date(updatedAt) },
      where: { id: saved.id },
    });
    await savedResult(form, { province: "เชียงราย" });
    const base = { form: form.publicId, province: "เชียงใหม่" };
    const matchingCriteria: Record<string, string>[] = [
      { user: marker.toUpperCase() },
      { state: "submitted" },
      { correction: "2" },
      { from: updatedAt },
      { to: updatedAt },
      {
        correction: "2",
        from: updatedAt,
        state: "submitted",
        to: updatedAt,
        user: marker,
      },
    ];
    for (const criterion of matchingCriteria) {
      expect(await resultIds({ ...base, ...criterion })).toEqual([saved.id]);
    }
    const nonmatchingCriteria: Record<string, string>[] = [
      { form: crypto.randomUUID().replaceAll("-", "") },
      { user: `other-${marker}` },
      { state: "draft" },
      { correction: "1" },
      { from: "2026-10-15T12:00:00.001Z" },
      { to: "2026-10-15T11:59:59.999Z" },
    ];
    for (const criterion of nonmatchingCriteria) {
      expect(await resultIds({ ...base, ...criterion })).toEqual([]);
    }
  }
);

test("sparse province and latest-Correction matches fill every page past newer nonmatches and tied timestamps", async () => {
  const form = await resultForm();
  const prefix = crypto.randomUUID().slice(0, 24);
  const updatedAt = new Date("2026-10-20T12:00:00.000Z");
  const fixtures = Array.from({ length: 158 }, (_, index) => ({
    correctionId: crypto.randomUUID(),
    id: `${prefix}${index.toString(16).padStart(12, "0")}`,
    province: index < 78 ? "เชียงใหม่" : "เชียงราย",
    revision: index >= 65 && index < 78 ? 1 : 2,
    submissionId: crypto.randomUUID(),
    timestamp: index >= 78 ? new Date("2026-10-21T12:00:00.000Z") : updatedAt,
    userId: crypto.randomUUID(),
  }));
  await prisma.user.createMany({
    data: fixtures.map(({ userId }) => ({
      email: `${userId}@example.test`,
      id: userId,
      name: "Sparse results owner",
    })),
  });
  await prisma.response.createMany({
    data: fixtures.map(({ id, timestamp, userId }) => ({
      formId: form.id,
      id,
      publishedTemplateId: form.publishedTemplate.id,
      publishedVersion: 1,
      status: "submitted",
      updatedAt: timestamp,
      userId,
    })),
  });
  await prisma.submission.createMany({
    data: fixtures.map(({ id, submissionId, userId }) => ({
      data: { province: "เชียงราย" },
      documentKey: crypto.randomUUID(),
      formId: form.id,
      id: submissionId,
      objectKey: `tests/results/${submissionId}`,
      responseId: id,
      userId,
    })),
  });
  await prisma.correction.createMany({
    data: fixtures.map(
      ({ correctionId, id, province, revision, submissionId }) => ({
        actorId: adminId,
        changedData: {},
        data: { province },
        documentKey: crypto.randomUUID(),
        id: correctionId,
        objectKey: `tests/results/${correctionId}`,
        reason: "Sparse fixture correction",
        responseId: id,
        revision,
        submissionId,
      })
    ),
  });

  const expected = fixtures
    .slice(0, 65)
    .map(({ id }) => id)
    .toReversed();
  const query = { correction: "2", form: form.publicId, province: "เชียงใหม่" };
  const first = await results(query);
  expect(first.results.map(({ id }) => id)).toEqual(expected.slice(0, 25));
  expect(first.pagination).toEqual({
    page: 1,
    pageSize: 25,
    total: 65,
    totalPages: 3,
  });
  const second = await results({ ...query, page: "2" });
  expect(second.results.map(({ id }) => id)).toEqual(expected.slice(25, 50));
  expect(second.pagination).toEqual({
    page: 2,
    pageSize: 25,
    total: 65,
    totalPages: 3,
  });
  const third = await results({ ...query, page: "3" });
  expect(third.results.map(({ id }) => id)).toEqual(expected.slice(50));
  expect(third.pagination).toEqual({
    page: 3,
    pageSize: 25,
    total: 65,
    totalPages: 3,
  });
  const outOfRange = await results({ ...query, page: "999" });
  expect(outOfRange.pagination).toEqual(third.pagination);
  expect(outOfRange.results).toEqual(third.results);
  expect(
    new Set(
      [...first.results, ...second.results, ...third.results].map(
        ({ id }) => id
      )
    ).size
  ).toBe(65);
  expect(await resultIds({ correction: "2", form: form.publicId })).toEqual(
    fixtures
      .slice(-25)
      .map(({ id }) => id)
      .toReversed()
  );
});

test("province preserves Admin and Viewer read access and rejects guests and Users", async () => {
  const form = await resultForm();
  const saved = await savedResult(form, { province: "กรุงเทพมหานคร" });
  const query = { form: form.publicId, province: "กรุงเทพมหานคร" };
  for (const role of ["viewer", "user"] satisfies ("viewer" | "user")[]) {
    const password = "Results-reader-fixture-password!";
    const reader = await createCredentialFixture({
      email: `${crypto.randomUUID()}@example.test`,
      name: "Results reader",
      password,
      role,
    });
    const bearer = await bearerFor(app, reader.email, password);
    const response = await request(query, bearer);
    expect(response.status).toBe(role === "viewer" ? 200 : 403);
    if (role === "viewer") {
      expect(await response.json()).toMatchObject({
        results: [{ id: saved.id }],
      });
    }
  }
  const guest = await request(query, "");
  expect(guest.status).toBe(401);
  expect(await resultIds(query)).toEqual([saved.id]);
});
