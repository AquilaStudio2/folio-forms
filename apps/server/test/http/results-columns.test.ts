// oxlint-disable no-await-in-loop -- Each HTTP scenario saves an isolated response and its revision history in sequence.
import { beforeAll, expect, test } from "bun:test";

import { Prisma } from "@onlyoffice/db";
import type { DocumentKind, ResponseStatus } from "@onlyoffice/db";

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
  const password = "Results-columns-fixture-password!";
  const admin = await createCredentialFixture({
    email: `results-columns-${crypto.randomUUID()}@example.test`,
    name: "Results Admin",
    password,
    role: "admin",
  });
  adminId = admin.id;
  adminBearer = await bearerFor(app, admin.email, password);
});

const {
  detailRequest,
  resultForm,
  results,
  savedCorrection,
  savedResult,
  savedSubmission,
} = createResultsHttpFixtures({
  app,
  correctionChangedData: { province: "เชียงใหม่" },
  defaultFields: [
    { label: "Province", tag: "province" },
    { label: "Month", tag: "month" },
    { label: "Fiscal year", tag: "fiscal_year" },
  ],
  formTitle: "Reporting columns",
  getAdmin: () => ({ bearer: adminBearer, id: adminId }),
});

type ReportingValues = Pick<
  Awaited<ReturnType<typeof results>>["results"][number],
  "fiscalYear" | "month" | "province"
>;

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: unfiltered results preserve reporting values from configured scalar Tags",
  async (kind) => {
    const form = await resultForm(kind);
    const saved = await savedResult(form, {
      fiscal_year: "2570",
      month: "ตุลาคม",
      province: "  เชียงใหม่  ",
    });
    const numeric = await savedResult(form, {
      fiscal_year: 2570,
      month: "ตุลาคม",
      province: "เชียงใหม่",
    });
    const page = await results({ form: form.publicId });
    expect(page.results).toHaveLength(2);
    expect(page.results.map(({ id }) => id).toSorted()).toEqual(
      [saved.id, numeric.id].toSorted()
    );
    expect(page.results).toContainEqual(
      expect.objectContaining({
        fiscalYear: "2570",
        id: saved.id,
        month: "ตุลาคม",
        province: "  เชียงใหม่  ",
      })
    );
    expect(page.results).toContainEqual(
      expect.objectContaining({
        fiscalYear: 2570,
        id: numeric.id,
        month: "ตุลาคม",
        province: "เชียงใหม่",
      })
    );
    const detail = await detailRequest(saved.id);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      result: {
        fiscalYear: "2570",
        month: "ตุลาคม",
        province: "  เชียงใหม่  ",
      },
    });
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: displays nonstandard scalar values while leaving missing and structured values unavailable",
  async (kind) => {
    const form = await resultForm(kind);
    const examples = [
      {
        data: { fiscal_year: "2570.0", month: 10, province: "เชียงใหม่" },
        values: { fiscalYear: "2570.0", month: 10, province: "เชียงใหม่" },
      },
      {
        data: { fiscal_year: 2570.5, month: "ต.ค.", province: "จ.เชียงใหม่" },
        values: { fiscalYear: 2570.5, month: "ต.ค.", province: "จ.เชียงใหม่" },
      },
      {
        data: { fiscal_year: " 2570 ", month: " ตุลาคม ", province: "เชียงใหม่" },
        values: {
          fiscalYear: " 2570 ",
          month: " ตุลาคม ",
          province: "เชียงใหม่",
        },
      },
      {
        data: { fiscal_year: 0, month: false, province: "อุบล" },
        values: { fiscalYear: 0, month: false, province: "อุบล" },
      },
      {
        data: { fiscal_year: "", month: "  ", province: null },
        values: { fiscalYear: null, month: null, province: null },
      },
      {
        data: { fiscal_year: [2570], month: { name: "ตุลาคม" }, province: null },
        values: { fiscalYear: null, month: null, province: null },
      },
      { data: {}, values: { fiscalYear: null, month: null, province: null } },
      {
        data: [{ fiscal_year: 2570, month: "ตุลาคม", province: "เชียงใหม่" }],
        values: { fiscalYear: null, month: null, province: null },
      },
      {
        data: "เชียงใหม่",
        values: { fiscalYear: null, month: null, province: null },
      },
      {
        data: Prisma.JsonNull,
        values: { fiscalYear: null, month: null, province: null },
      },
      {
        data: { fiscal_year: 2559 },
        values: { fiscalYear: 2559, month: null, province: null },
      },
    ];
    const expected = new Map<string, ReportingValues>();
    for (const example of examples) {
      const response = await savedResult(form, example.data);
      expected.set(response.id, example.values);
    }
    const page = await results({ form: form.publicId });
    expect(page.results).toHaveLength(examples.length);
    for (const [id, values] of expected) {
      expect(page.results).toContainEqual(
        expect.objectContaining({ id, ...values })
      );
    }
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: displaying nonstandard answers does not make them match canonical filters",
  async (kind) => {
    const form = await resultForm(kind);
    const canonical = {
      fiscal_year: 2570,
      month: "ตุลาคม",
      province: "อุบลราชธานี",
    };
    const valid = await savedResult(form, canonical);
    const examples: {
      data: Parameters<typeof savedResult>[1];
      filter: Parameters<typeof results>[0];
      values: ReportingValues;
    }[] = [
      {
        data: { ...canonical, province: "อุบล" },
        filter: { province: "อุบลราชธานี" },
        values: { fiscalYear: 2570, month: "ตุลาคม", province: "อุบล" },
      },
      {
        data: { ...canonical, month: "ต.ค." },
        filter: { month: "ตุลาคม" },
        values: { fiscalYear: 2570, month: "ต.ค.", province: "อุบลราชธานี" },
      },
      {
        data: { ...canonical, fiscal_year: "พ.ศ. 2570" },
        filter: { fiscal_year: "2570" },
        values: {
          fiscalYear: "พ.ศ. 2570",
          month: "ตุลาคม",
          province: "อุบลราชธานี",
        },
      },
    ];
    for (const example of examples) {
      const response = await savedResult(form, example.data);
      const unfiltered = await results({ form: form.publicId });
      expect(unfiltered.results).toContainEqual(
        expect.objectContaining({ id: response.id, ...example.values })
      );
      const filtered = await results({
        form: form.publicId,
        ...example.filter,
      });
      expect(filtered.results.map(({ id }) => id)).not.toContain(response.id);
    }
    const combined = await results({
      fiscal_year: "2570",
      form: form.publicId,
      month: "ตุลาคม",
      province: "อุบลราชธานี",
    });
    expect(combined.results.map(({ id }) => id)).toEqual([valid.id]);
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: raw JSON values need exact configured scalar Tags before they can be displayed",
  async (kind) => {
    const form = await resultForm(kind, [
      { label: "จังหวัด", position: 0, tag: "Province", type: "text" },
      { label: "เดือน", position: 1, tag: "month", type: "table" },
      {
        label: "ปีงบประมาณ",
        position: 2,
        tag: "projects.fiscal_year",
        type: "text",
      },
    ]);
    const response = await savedResult(form, {
      fiscal_year: 2570,
      month: "ตุลาคม",
      province: "เชียงใหม่",
    });
    const unfiltered = await results({ form: form.publicId });
    expect(unfiltered.results).toEqual([
      expect.objectContaining({
        fiscalYear: null,
        id: response.id,
        month: null,
        province: null,
      }),
    ]);
    const filtered = await results({
      form: form.publicId,
      province: "เชียงใหม่",
    });
    expect(filtered.results).toEqual([]);
  }
);

test("Excel columns ignore scalar Tags without an eligible scalar cell binding", async () => {
  const form = await resultForm("xlsx", [
    { label: "Province", position: 0, tag: "province", type: "text" },
    {
      binding: { columns: [] },
      label: "Month",
      position: 1,
      tag: "month",
      type: "text",
    },
  ]);
  await savedResult(form, {
    fiscal_year: 2570,
    month: "ตุลาคม",
    province: "เชียงใหม่",
  });
  const page = await results({ form: form.publicId });
  expect(page.results).toEqual([
    expect.objectContaining({ fiscalYear: null, month: null, province: null }),
  ]);
});

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: display and filtering use the current draft or latest submitted correction in every state",
  async (kind) => {
    const form = await resultForm(kind);
    const current = {
      fiscal_year: "2570",
      month: "ตุลาคม",
      province: "เชียงใหม่",
    };
    const previous = {
      fiscal_year: 2569,
      month: "กันยายน",
      province: "เชียงราย",
    };
    const expectedIds = [];
    for (const state of [
      "draft",
      "submitting",
      "submitted",
    ] satisfies ResponseStatus[]) {
      const response = await savedResult(form, current, state);
      expectedIds.push(response.id);
      const oldSubmission = await savedSubmission(
        response,
        previous,
        new Date("2026-09-01T00:00:00Z")
      );
      await savedCorrection(oldSubmission, previous, 3);
      const latestSubmission = await savedSubmission(response, previous);
      await savedCorrection(
        latestSubmission,
        state === "submitted" ? current : previous,
        1
      );
    }
    const queries: Record<string, string>[] = [
      { form: form.publicId },
      {
        fiscal_year: "2570",
        form: form.publicId,
        month: "ตุลาคม",
        province: "เชียงใหม่",
      },
    ];
    for (const query of queries) {
      const page = await results(query);
      expect(page.results.map(({ id }) => id).toSorted()).toEqual(
        expectedIds.toSorted()
      );
      for (const row of page.results) {
        expect(row).toMatchObject({
          fiscalYear: "2570",
          month: "ตุลาคม",
          province: "เชียงใหม่",
        });
      }
    }
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: a correction's missing values stay unavailable instead of falling back to earlier revisions",
  async (kind) => {
    const form = await resultForm(kind);
    const response = await savedResult(form, {}, "submitted");
    const submission = await savedSubmission(response, {
      fiscal_year: 2569,
      month: "กันยายน",
      province: "เชียงราย",
    });
    await savedCorrection(
      submission,
      { fiscal_year: 2570, month: "ตุลาคม", province: "เชียงใหม่" },
      1
    );
    await savedCorrection(submission, { province: "เชียงใหม่" }, 2);
    const unfiltered = await results({ form: form.publicId });
    expect(unfiltered.results).toEqual([
      expect.objectContaining({
        fiscalYear: null,
        id: response.id,
        month: null,
        province: "เชียงใหม่",
      }),
    ]);
    const filtered = await results({ form: form.publicId, month: "ตุลาคม" });
    expect(filtered.results).toEqual([]);
  }
);

test.each(["docx", "xlsx"] satisfies DocumentKind[])(
  "%s: a null current correction displays unavailable values without reviving the original submission",
  async (kind) => {
    const form = await resultForm(kind);
    const response = await savedResult(form, {}, "submitted");
    const submission = await savedSubmission(response, {
      fiscal_year: 2570,
      month: "ตุลาคม",
      province: "เชียงใหม่",
    });
    await savedCorrection(submission, Prisma.JsonNull, 1);
    const page = await results({ form: form.publicId });
    expect(page.results).toEqual([
      expect.objectContaining({
        fiscalYear: null,
        id: response.id,
        month: null,
        province: null,
      }),
    ]);
    const filtered = await results({
      form: form.publicId,
      province: "เชียงใหม่",
    });
    expect(filtered.results).toEqual([]);
    const detail = await detailRequest(response.id);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      result: { fiscalYear: null, month: null, province: null },
    });
  }
);
