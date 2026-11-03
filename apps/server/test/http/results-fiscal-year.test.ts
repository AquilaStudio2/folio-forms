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
  correctionChangedData: { fiscal_year: 2570 },
  defaultFields: [
    { label: "Saved province", tag: "province" },
    { label: "Saved month", tag: "month" },
    { label: "Saved fiscal_year", tag: "fiscal_year" },
  ],
  formTitle: "Fiscal year",
  getAdmin: () => ({ bearer: adminBearer, id: adminId }),
});

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: fiscal year matches equivalent saved Buddhist Era integers and strings",
  async (kind) => {
    const form = await resultForm(kind);
    const numeric = await savedResult(form, { fiscal_year: 2570 });
    const textual = await savedResult(form, { fiscal_year: "2570" });
    await savedResult(form, { fiscal_year: 2569 });
    const page = await results({ fiscal_year: "2570", form: form.publicId });
    expect(page.results.map(({ id }) => id).toSorted()).toEqual(
      [numeric.id, textual.id].toSorted()
    );
    expect(page.pagination.totalPages).toBe(1);
  }
);

test("fiscal year rejects unsupported or out-of-catalog query choices through invalid_request", async () => {
  for (const fiscal_year of [
    "",
    "2027",
    "2570.0",
    "2.57e3",
    "+2570",
    " 2570 ",
    "02570",
    "๒๕๗๐",
    "0",
    "9999",
  ]) {
    const response = await request({ fiscal_year });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  }
});

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: unsupported saved fiscal-year formats fail only an active criterion",
  async (kind) => {
    const form = await resultForm(kind);
    const matching = await savedResult(form, { fiscal_year: 2570 });
    for (const data of [
      { fiscal_year: 2570.5 },
      { fiscal_year: 2027 },
      { fiscal_year: "2027" },
      { fiscal_year: "2570.0" },
      { fiscal_year: "2.57e3" },
      { fiscal_year: " 2570 " },
      { fiscal_year: "+2570" },
      { fiscal_year: "02570" },
      { fiscal_year: "๒๕๗๐" },
      { fiscal_year: "" },
      { fiscal_year: " " },
      { fiscal_year: null },
      { fiscal_year: true },
      { fiscal_year: [2570] },
      { fiscal_year: { year: 2570 } },
      { nested: { fiscal_year: 2570 } },
      { rows: [{ fiscal_year: 2570 }] },
      {},
      [2570],
      "2570",
      Prisma.JsonNull,
    ]) {
      await savedResult(form, data);
    }
    expect(
      await resultIds({ fiscal_year: "2570", form: form.publicId })
    ).toEqual([matching.id]);
    expect(await resultIds({ form: form.publicId })).toHaveLength(22);
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: only the Response's published scalar root fiscal_year Tag establishes eligibility",
  async (kind) => {
    const ineligibleFields: Prisma.ManifestFieldCreateWithoutManifestInput[][] =
      [
        [],
        [{ label: "fiscal_year", position: 0, tag: "period", type: "text" }],
        [
          {
            label: "Fiscal year",
            position: 0,
            tag: "Fiscal_year",
            type: "text",
          },
        ],
        [
          {
            label: "Fiscal year",
            position: 0,
            tag: "fiscal_year",
            type: "table",
          },
        ],
        [
          {
            label: "Fiscal year",
            position: 0,
            tag: "rows.fiscal_year",
            type: "text",
            ...(kind === "xlsx"
              ? { binding: { computed: false, id: "folio_column", offset: 0 } }
              : {}),
          },
        ],
      ];
    if (kind === "xlsx") {
      ineligibleFields.push(
        [
          {
            label: "Fiscal year",
            position: 0,
            tag: "fiscal_year",
            type: "text",
          },
        ],
        [
          {
            binding: { computed: false, id: "folio_column", offset: 0 },
            label: "Fiscal year",
            position: 0,
            tag: "fiscal_year",
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
            create: { label: "Fiscal year", tag: "fiscal_year", type: "text" },
          },
          formId: form.id,
          objectKey: `tests/results/draft-${crypto.randomUUID()}.${kind}`,
        },
      });
      const saved = await savedResult(form, {
        fiscal_year: "2570",
        rows: [{ fiscal_year: "2570" }],
      });
      expect(
        await resultIds({ fiscal_year: "2570", form: form.publicId })
      ).toEqual([]);
      expect(await resultIds({ form: form.publicId })).toEqual([saved.id]);
    }
    const yearOnly = await resultForm(kind, [
      {
        label: "A renamed reporting period",
        position: 0,
        tag: "fiscal_year",
        type: "text",
        ...(kind === "xlsx"
          ? {
              binding: {
                anchor: "folio_fiscal_year",
                computed: false,
                id: "folio_fiscal_year",
              },
            }
          : {}),
      },
    ]);
    const saved = await savedResult(yearOnly, { fiscal_year: "2570" });
    expect(
      await resultIds({ fiscal_year: "2570", form: yearOnly.publicId })
    ).toEqual([saved.id]);
    expect(
      await resultIds({
        fiscal_year: "2570",
        form: yearOnly.publicId,
        province: "เชียงใหม่",
      })
    ).toEqual([]);
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: all three filters use current Draft, Submitting, latest Submission and complete latest Correction values",
  async (kind) => {
    const form = await resultForm(kind);
    const current = { fiscal_year: 2570, month: "ตุลาคม", province: "เชียงใหม่" };
    const previous = { ...current, fiscal_year: 2569 };
    const draft = await savedResult(form, current);
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
    await savedCorrection(cleared, { month: "ตุลาคม", province: "เชียงใหม่" }, 1);

    const wrongDraft = await savedResult(form, previous);
    await savedSubmission(wrongDraft, current);

    const provinceChanged = await savedResult(form, {}, "submitted");
    const differentProvince = await savedSubmission(provinceChanged, current);
    await savedCorrection(
      differentProvince,
      { ...current, province: "เชียงราย" },
      1
    );
    const monthChanged = await savedResult(form, {}, "submitted");
    const differentMonth = await savedSubmission(monthChanged, current);
    await savedCorrection(differentMonth, { ...current, month: "กันยายน" }, 1);

    const matching = [
      draft,
      reopened,
      submitting,
      latestSubmission,
      latestCorrection,
    ];
    const combined = {
      fiscal_year: "2570",
      form: form.publicId,
      month: "ตุลาคม",
      province: "เชียงใหม่",
    };
    const combinedIds = await resultIds(combined);
    expect(combinedIds.toSorted()).toEqual(
      matching.map(({ id }) => id).toSorted()
    );
    const yearOnly = await results({
      fiscal_year: "2570",
      form: form.publicId,
    });
    expect(yearOnly.results.map(({ id }) => id).toSorted()).toEqual(
      [...matching, provinceChanged, monthChanged]
        .map(({ id }) => id)
        .toSorted()
    );
    expect(yearOnly.results.find(({ id }) => id === submitting.id)?.state).toBe(
      "draft"
    );
    for (const response of matching) {
      const detail = await detailRequest(response.id);
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({ result: { data: current } });
    }
    const changedDetail = await detailRequest(provinceChanged.id);
    expect(changedDetail.status).toBe(200);
    expect(await changedDetail.json()).toMatchObject({
      result: { data: { ...current, province: "เชียงราย" } },
    });
    const drafts = await resultIds({ ...combined, state: "draft" });
    expect(drafts.toSorted()).toEqual(
      [draft.id, reopened.id, submitting.id].toSorted()
    );
    expect(
      await resultIds({
        correction: "0",
        fiscal_year: "2569",
        form: form.publicId,
        state: "submitted",
      })
    ).toEqual([olderSubmission.id]);
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: every answer-filter combination ANDs each existing condition without deriving Month or Fiscal year from timestamps",
  async (kind) => {
    const form = await resultForm(kind);
    const marker = `year-${crypto.randomUUID()}`;
    const updatedAt = "2026-11-15T12:00:00.000Z";
    const fixtures = [];
    for (const [index, data] of [
      { fiscal_year: 2570, month: "ตุลาคม", province: "เชียงใหม่" },
      { fiscal_year: "2570", month: "กันยายน", province: "เชียงใหม่" },
      { fiscal_year: 2570, month: "ตุลาคม", province: "เชียงราย" },
      { fiscal_year: "2570", month: "กันยายน", province: "เชียงราย" },
      { fiscal_year: 2569, month: "ตุลาคม", province: "เชียงใหม่" },
      { fiscal_year: "2569", month: "กันยายน", province: "เชียงใหม่" },
      { fiscal_year: 2569, month: "ตุลาคม", province: "เชียงราย" },
      { fiscal_year: "2569", month: "กันยายน", province: "เชียงราย" },
    ].entries()) {
      const saved = await savedResult(form, {}, "submitted");
      const previous = {
        fiscal_year: 2568,
        month: "มกราคม",
        province: "กรุงเทพมหานคร",
      };
      const submission = await savedSubmission(
        saved,
        previous,
        new Date("2024-01-01T00:00:00Z")
      );
      await savedCorrection(submission, previous, 1);
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
    const selections: [Record<string, string>, number[]][] = [
      [{ fiscal_year: "2570" }, [0, 1, 2, 3]],
      [{ fiscal_year: "2570", province: "เชียงใหม่" }, [0, 1]],
      [{ fiscal_year: "2570", month: "ตุลาคม" }, [0, 2]],
      [{ month: "ตุลาคม", province: "เชียงใหม่" }, [0, 4]],
      [{ fiscal_year: "2570", month: "ตุลาคม", province: "เชียงใหม่" }, [0]],
      [{}, [0, 1, 2, 3, 4, 5, 6, 7]],
    ];
    for (const [selection, indices] of selections) {
      const base = { form: form.publicId, ...selection };
      const expected = fixtures
        .filter((_, index) => indices.includes(index))
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

test("sparse three-answer and latest-Correction intersections retain every match and stable numbered pages", async () => {
  const form = await resultForm("xlsx");
  const prefix = crypto.randomUUID().slice(0, 24);
  const older = new Date("2026-11-20T12:00:00.000Z");
  const newer = new Date("2026-11-21T12:00:00.000Z");
  const fixtures = Array.from({ length: 230 }, (_, index) => ({
    correctionId: crypto.randomUUID(),
    fiscal_year: index >= 150 ? 2569 : 2570,
    id: `${prefix}${index.toString(16).padStart(12, "0")}`,
    month: index >= 115 && index < 150 ? "กันยายน" : "ตุลาคม",
    province: index >= 80 && index < 115 ? "เชียงราย" : "เชียงใหม่",
    submissionId: crypto.randomUUID(),
    updatedAt: index >= 80 ? newer : older,
    userId: crypto.randomUUID(),
  }));
  await prisma.user.createMany({
    data: fixtures.map(({ userId }) => ({
      email: `${userId}@example.test`,
      id: userId,
      name: "Sparse Fiscal year results owner",
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
      data: { fiscal_year: 2568, month: "มกราคม", province: "กรุงเทพมหานคร" },
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
      ({ correctionId, fiscal_year, id, month, province, submissionId }) => ({
        actorId: adminId,
        changedData: {},
        data: { fiscal_year, month, province },
        documentKey: crypto.randomUUID(),
        id: correctionId,
        objectKey: `tests/results/${correctionId}`,
        reason: "Sparse Fiscal year correction",
        responseId: id,
        revision: 2,
        submissionId,
      })
    ),
  });
  await prisma.correction.createMany({
    data: fixtures.slice(65, 80).map(({ id, submissionId }) => ({
      actorId: adminId,
      changedData: {},
      data: { fiscal_year: 2570, month: "ตุลาคม", province: "เชียงใหม่" },
      documentKey: crypto.randomUUID(),
      objectKey: `tests/results/${crypto.randomUUID()}`,
      reason: "Supersede the requested Correction number",
      responseId: id,
      revision: 3,
      submissionId,
    })),
  });
  const combined = fixtures
    .slice(0, 65)
    .map(({ id }) => id)
    .toReversed();
  const selections: [Record<string, string>, string[]][] = [
    [
      { fiscal_year: "2570" },
      [
        ...fixtures
          .slice(80, 150)
          .map(({ id }) => id)
          .toReversed(),
        ...combined,
      ],
    ],
    [
      { fiscal_year: "2570", province: "เชียงใหม่" },
      [
        ...fixtures
          .slice(115, 150)
          .map(({ id }) => id)
          .toReversed(),
        ...combined,
      ],
    ],
    [
      { fiscal_year: "2570", month: "ตุลาคม" },
      [
        ...fixtures
          .slice(80, 115)
          .map(({ id }) => id)
          .toReversed(),
        ...combined,
      ],
    ],
    [{ fiscal_year: "2570", month: "ตุลาคม", province: "เชียงใหม่" }, combined],
  ];
  for (const [selection, expected] of selections) {
    const query = { correction: "2", form: form.publicId, ...selection };
    const seen: string[] = [];
    for (let offset = 0; offset < expected.length; offset += 25) {
      const page = await results({ ...query, page: String(offset / 25 + 1) });
      expect(page.results.map(({ id }) => id)).toEqual(
        expected.slice(offset, offset + 25)
      );
      seen.push(...page.results.map(({ id }) => id));
      expect(page.pagination).toEqual({
        page: offset / 25 + 1,
        pageSize: 25,
        total: expected.length,
        totalPages: Math.max(1, Math.ceil(expected.length / 25)),
      });
    }
    expect(new Set(seen).size).toBe(expected.length);
  }
});

test("Province, Month and Fiscal year retains Admin and Viewer read permissions and rejects guests and Users", async () => {
  const form = await resultForm();
  const saved = await savedResult(form, {
    fiscal_year: 2570,
    month: "ตุลาคม",
    province: "เชียงใหม่",
  });
  const query = {
    fiscal_year: "2570",
    form: form.publicId,
    month: "ตุลาคม",
    province: "เชียงใหม่",
  };
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
