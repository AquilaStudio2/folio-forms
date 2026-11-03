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
  correctionChangedData: { month: "ตุลาคม" },
  defaultFields: [
    { label: "Saved province", tag: "province" },
    { label: "Saved month", tag: "month" },
  ],
  formTitle: "Month",
  getAdmin: () => ({ bearer: adminBearer, id: adminId }),
});

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: month searches the declared current saved full Thai root answer",
  async (kind) => {
    const form = await resultForm(kind);
    const matching = await savedResult(form, { month: "ตุลาคม" });
    await savedResult(form, { month: "กันยายน" });
    const page = await results({ form: form.publicId, month: "ตุลาคม" });
    expect(page.results.map(({ id }) => id)).toEqual([matching.id]);
    expect(page.nextCursor).toBeNull();
  }
);

test("month rejects unsupported query choices through the normal invalid-request response", async () => {
  for (const month of ["", "10", "ต.ค.", "October", " ตุลาคม ", "เดือนตุลาคม"]) {
    const response = await request({ month });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  }
});

test("all twelve central Thai month choices search saved answers independently", async () => {
  const form = await resultForm();
  const expected = new Map<string, string>();
  for (const month of [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ]) {
    const saved = await savedResult(form, { month });
    expected.set(month, saved.id);
  }
  for (const [month, id] of expected) {
    expect(await resultIds({ form: form.publicId, month })).toEqual([id]);
  }
});

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: month requires a full Thai month name and ignores unsupported saved formats",
  async (kind) => {
    const form = await resultForm(kind);
    const january = await savedResult(form, { month: "มกราคม" });
    const october = await savedResult(form, { month: "ตุลาคม" });
    const december = await savedResult(form, { month: "ธันวาคม" });
    for (const data of [
      { month: 10 },
      { month: "10" },
      { month: "ต.ค." },
      { month: "October" },
      { month: " ตุลาคม " },
      { month: "" },
      { month: "   " },
      { month: null },
      { month: true },
      { month: ["ตุลาคม"] },
      { month: { name: "ตุลาคม" } },
      { nested: { month: "ตุลาคม" } },
      { rows: [{ month: "ตุลาคม" }] },
      {},
      ["ตุลาคม"],
      "ตุลาคม",
      Prisma.JsonNull,
    ]) {
      await savedResult(form, data);
    }
    expect(await resultIds({ form: form.publicId, month: "มกราคม" })).toEqual([
      january.id,
    ]);
    expect(await resultIds({ form: form.publicId, month: "ตุลาคม" })).toEqual([
      october.id,
    ]);
    expect(await resultIds({ form: form.publicId, month: "ธันวาคม" })).toEqual([
      december.id,
    ]);
    expect(await resultIds({ form: form.publicId })).toHaveLength(20);
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: only the Response's published scalar root month Tag establishes eligibility",
  async (kind) => {
    const ineligibleFields: Prisma.ManifestFieldCreateWithoutManifestInput[][] =
      [
        [],
        [{ label: "month", position: 0, tag: "period", type: "text" }],
        [{ label: "Month", position: 0, tag: "Month", type: "text" }],
        [{ label: "Month", position: 0, tag: "month", type: "table" }],
        [
          {
            label: "Month",
            position: 0,
            tag: "rows.month",
            type: "text",
            ...(kind === "xlsx"
              ? { binding: { computed: false, id: "folio_column", offset: 0 } }
              : {}),
          },
        ],
      ];
    if (kind === "xlsx") {
      ineligibleFields.push(
        [{ label: "Month", position: 0, tag: "month", type: "text" }],
        [
          {
            binding: { computed: false, id: "folio_column", offset: 0 },
            label: "Month",
            position: 0,
            tag: "month",
            type: "text",
          },
        ]
      );
    }
    for (const fields of ineligibleFields) {
      const form = await resultForm(kind, fields);
      await prisma.templateDraft.create({
        data: {
          documentKey: crypto.randomUUID(),
          fieldRules: {
            create: { label: "Month", tag: "month", type: "text" },
          },
          formId: form.id,
          objectKey: `tests/results/draft-${crypto.randomUUID()}.${kind}`,
        },
      });
      const saved = await savedResult(form, {
        month: "ตุลาคม",
        rows: [{ month: "ตุลาคม" }],
      });
      expect(await resultIds({ form: form.publicId, month: "ตุลาคม" })).toEqual(
        []
      );
      expect(await resultIds({ form: form.publicId })).toEqual([saved.id]);
    }
    const monthOnly = await resultForm(kind, [
      {
        label: "A renamed reporting period",
        position: 0,
        tag: "month",
        type: "text",
        ...(kind === "xlsx"
          ? {
              binding: {
                anchor: "folio_month",
                computed: false,
                id: "folio_month",
              },
            }
          : {}),
      },
    ]);
    const saved = await savedResult(monthOnly, { month: "ตุลาคม" });
    expect(
      await resultIds({ form: monthOnly.publicId, month: "ตุลาคม" })
    ).toEqual([saved.id]);
    expect(
      await resultIds({
        form: monthOnly.publicId,
        month: "ตุลาคม",
        province: "เชียงใหม่",
      })
    ).toEqual([]);
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: Month and Province follow saved Draft, Submitting, latest Submission and complete latest Correction values",
  async (kind) => {
    const form = await resultForm(kind);
    const current = { month: "ตุลาคม", province: "เชียงใหม่" };
    const previous = { month: "กันยายน", province: "เชียงใหม่" };
    const reopened = await savedResult(form, current);
    await savedSubmission(reopened, previous);
    const submitting = await savedResult(form, current, "submitting");
    await savedSubmission(submitting, previous);

    const latestSubmission = await savedResult(form, {}, "submitted");
    await savedSubmission(latestSubmission, previous);
    await savedSubmission(
      latestSubmission,
      current,
      new Date("2026-10-02T00:00:00Z")
    );

    const olderSubmission = await savedResult(form, {}, "submitted");
    const superseded = await savedSubmission(olderSubmission, current);
    await savedCorrection(superseded, current, 1);
    await savedSubmission(
      olderSubmission,
      previous,
      new Date("2026-10-02T00:00:00Z")
    );

    const latestCorrection = await savedResult(form, {}, "submitted");
    const corrected = await savedSubmission(latestCorrection, previous);
    await savedCorrection(corrected, previous, 1);
    await savedCorrection(corrected, current, 2);

    const olderCorrection = await savedResult(form, {}, "submitted");
    const changed = await savedSubmission(olderCorrection, current);
    await savedCorrection(changed, current, 1);
    await savedCorrection(changed, previous, 2);

    const removed = await savedResult(form, {}, "submitted");
    const cleared = await savedSubmission(removed, current);
    await savedCorrection(cleared, { province: "เชียงใหม่" }, 1);

    const provinceChanged = await savedResult(form, {}, "submitted");
    const differentProvince = await savedSubmission(provinceChanged, current);
    await savedCorrection(
      differentProvince,
      { month: "ตุลาคม", province: "เชียงราย" },
      1
    );

    const matching = [reopened, submitting, latestSubmission, latestCorrection];
    expect(await resultIds({ form: form.publicId, ...current })).toEqual(
      matching.map(({ id }) => id).toReversed()
    );
    const monthOnly = await results({ form: form.publicId, month: "ตุลาคม" });
    expect(monthOnly.results.map(({ id }) => id).toSorted()).toEqual(
      [...matching, provinceChanged].map(({ id }) => id).toSorted()
    );
    expect(
      monthOnly.results.find(({ id }) => id === submitting.id)?.state
    ).toBe("draft");
    for (const response of matching) {
      const detail = await detailRequest(response.id);
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({ result: { data: current } });
    }
    const monthDetail = await detailRequest(provinceChanged.id);
    expect(monthDetail.status).toBe(200);
    expect(await monthDetail.json()).toMatchObject({
      result: { data: { month: "ตุลาคม", province: "เชียงราย" } },
    });
    expect(
      await resultIds({ correction: "0", form: form.publicId, month: "กันยายน" })
    ).toEqual([olderSubmission.id]);
    expect(
      await resultIds({ form: form.publicId, month: "ตุลาคม", state: "draft" })
    ).toEqual([submitting.id, reopened.id]);
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: Month alone and Month with Province combine every existing filter with AND independently of saved dates",
  async (kind) => {
    const form = await resultForm(kind);
    const marker = `month-${crypto.randomUUID()}`;
    const updatedAt = "2026-11-15T12:00:00.000Z";
    const fixtures = [];
    for (const [index, data] of [
      { month: "ตุลาคม", province: "เชียงใหม่" },
      { month: "ตุลาคม", province: "เชียงราย" },
      { month: "กันยายน", province: "เชียงใหม่" },
    ].entries()) {
      const saved = await savedResult(form, {}, "submitted");
      const submission = await savedSubmission(
        saved,
        { month: "กันยายน", province: "เชียงราย" },
        new Date("2026-09-01T00:00:00Z")
      );
      await savedCorrection(
        submission,
        { month: "กันยายน", province: "เชียงราย" },
        1
      );
      await savedCorrection(submission, data, 2);
      await prisma.user.update({
        data: { email: `${marker}-${index}@example.test` },
        where: { id: saved.userId },
      });
      await prisma.response.update({
        data: { updatedAt: new Date(updatedAt) },
        where: { id: saved.id },
      });
      fixtures.push(saved);
    }
    const matchingCriteria: Record<string, string>[] = [
      { form: form.publicId },
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
    const nonmatchingCriteria: Record<string, string>[] = [
      { form: crypto.randomUUID().replaceAll("-", "") },
      { user: `other-${marker}` },
      { state: "draft" },
      { correction: "1" },
      { from: "2026-11-15T12:00:00.001Z" },
      { to: "2026-11-15T11:59:59.999Z" },
    ];
    for (const province of [undefined, "เชียงใหม่"]) {
      const base = {
        form: form.publicId,
        month: "ตุลาคม",
        ...(province ? { province } : {}),
      };
      const expected = fixtures
        .slice(0, province ? 1 : 2)
        .map(({ id }) => id)
        .toSorted()
        .toReversed();
      for (const criterion of matchingCriteria) {
        expect(await resultIds({ ...base, ...criterion })).toEqual(expected);
      }
      for (const criterion of nonmatchingCriteria) {
        expect(await resultIds({ ...base, ...criterion })).toEqual([]);
      }
    }
  }
);

test("sparse Month, Province and latest-Correction intersections fill complete pages beyond newer nonmatches", async () => {
  const form = await resultForm();
  const prefix = crypto.randomUUID().slice(0, 24);
  const older = new Date("2026-11-20T12:00:00.000Z");
  const newer = new Date("2026-11-21T12:00:00.000Z");
  const fixtures = Array.from({ length: 195 }, (_, index) => ({
    correctionId: crypto.randomUUID(),
    id: `${prefix}${index.toString(16).padStart(12, "0")}`,
    month: index < 115 ? "ตุลาคม" : "กันยายน",
    province: index >= 80 && index < 115 ? "เชียงราย" : "เชียงใหม่",
    revision: index >= 65 && index < 80 ? 1 : 2,
    submissionId: crypto.randomUUID(),
    updatedAt: index >= 80 ? newer : older,
    userId: crypto.randomUUID(),
  }));
  await prisma.user.createMany({
    data: fixtures.map(({ userId }) => ({
      email: `${userId}@example.test`,
      id: userId,
      name: "Sparse Month results owner",
    })),
  });
  await prisma.response.createMany({
    data: fixtures.map(({ id, updatedAt, userId }) => ({
      formId: form.id,
      id,
      publishedTemplateId: form.publishedTemplate.id,
      publishedVersion: 1,
      status: "submitted",
      updatedAt,
      userId,
    })),
  });
  await prisma.submission.createMany({
    data: fixtures.map(({ id, submissionId, userId }) => ({
      data: { month: "กันยายน", province: "เชียงราย" },
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
      ({ correctionId, id, month, province, revision, submissionId }) => ({
        actorId: adminId,
        changedData: {},
        data: { month, province },
        documentKey: crypto.randomUUID(),
        id: correctionId,
        objectKey: `tests/results/${correctionId}`,
        reason: "Sparse Month correction",
        responseId: id,
        revision,
        submissionId,
      })
    ),
  });
  const combined = fixtures
    .slice(0, 65)
    .map(({ id }) => id)
    .toReversed();
  const monthOnly = [
    ...fixtures
      .slice(80, 115)
      .map(({ id }) => id)
      .toReversed(),
    ...combined,
  ];
  for (const [query, expected] of [
    [{ correction: "2", form: form.publicId, month: "ตุลาคม" }, monthOnly],
    [
      {
        correction: "2",
        form: form.publicId,
        month: "ตุลาคม",
        province: "เชียงใหม่",
      },
      combined,
    ],
  ] satisfies [Record<string, string>, string[]][]) {
    const seen = [];
    let cursor: string | undefined;
    for (let offset = 0; offset < expected.length; offset += 25) {
      const page = await results({ ...query, ...(cursor ? { cursor } : {}) });
      expect(page.results.map(({ id }) => id)).toEqual(
        expected.slice(offset, offset + 25)
      );
      seen.push(...page.results.map(({ id }) => id));
      if (offset + 25 < expected.length) {
        expect(page.nextCursor).not.toBeNull();
        if (!page.nextCursor) {
          throw new Error(
            "A complete matching page must retain its continuation"
          );
        }
        const last = page.results.at(-1);
        expect(
          JSON.parse(
            Buffer.from(page.nextCursor, "base64url").toString("utf-8")
          )
        ).toMatchObject({ id: last?.id });
        cursor = page.nextCursor;
      } else {
        expect(page.nextCursor).toBeNull();
      }
    }
    expect(new Set(seen).size).toBe(expected.length);
  }
});

test("Month with Province retains Admin and Viewer read permissions and rejects guests and Users", async () => {
  const form = await resultForm();
  const saved = await savedResult(form, {
    month: "ตุลาคม",
    province: "เชียงใหม่",
  });
  const query = { form: form.publicId, month: "ตุลาคม", province: "เชียงใหม่" };
  for (const role of ["viewer", "user"] satisfies ("viewer" | "user")[]) {
    const password = "Month-reader-fixture-password!";
    const reader = await createCredentialFixture({
      email: `${crypto.randomUUID()}@example.test`,
      name: "Month results reader",
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
