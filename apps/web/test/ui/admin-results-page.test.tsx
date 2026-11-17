// oxlint-disable require-await -- Network fixtures retain fetch's asynchronous contract.
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_ORIGIN, SESSION_KEY } from "@/lib/api";
import type {
  AdminResult,
  AttachmentFollowUp,
  Role,
  ResponseAttachmentCleanup,
} from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const result = (id = "11111111-1111-4111-8111-111111111111"): AdminResult => ({
  createdAt: "2026-10-15T00:00:00.000Z",
  documentKind: "docx",
  fiscalYear: null,
  formPublicId: "0123456789abcdef0123456789abcdef",
  formTitle: "Synthetic provincial report",
  id,
  latestCorrectionNumber: null,
  month: null,
  province: null,
  state: "draft",
  submissionId: null,
  submittedAt: null,
  updatedAt: "2026-10-15T00:00:00.000Z",
  userEmail: "owner@example.test",
});

const fetchMock = vi.fn<typeof fetch>();
let sessionRole: Role;
let listResponse: () => Response | Promise<Response>;
let attachmentFollowUps: AttachmentFollowUp[];
let deletionOutcome: ResponseAttachmentCleanup;

let requestedPage = 1;
const resultsPayload = (results: AdminResult[], total = results.length) => ({
  pagination: {
    page: Math.min(requestedPage, Math.max(1, Math.ceil(total / 25))),
    pageSize: 25,
    total,
    totalPages: Math.max(1, Math.ceil(total / 25)),
  },
  results,
});

const resultRequests = () =>
  fetchMock.mock.calls.filter(
    ([input]) => new URL(String(input)).pathname === "/api/admin/results"
  );
const expectQuery = (expected: Record<string, string>) => {
  const request = resultRequests().at(-1);
  expect(request).toBeDefined();
  const url = new URL(String(request?.[0]));
  expect(url.origin).toBe(API_ORIGIN);
  expect(Object.fromEntries(url.searchParams)).toEqual({
    page: "1",
    ...expected,
  });
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
const mount = async (path = "/admin/results") => {
  window.history.replaceState(null, "", path);
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", {
    name: path === "/admin/results" ? "ตรวจทานคำตอบ" : result().formTitle,
  });
  await flush();
};

beforeEach(() => {
  sessionRole = "admin";
  listResponse = () => Response.json(resultsPayload([result()]));
  attachmentFollowUps = [];
  deletionOutcome = { caseReference: null, state: "complete", warning: null };
  localStorage.setItem(SESSION_KEY, "results-reader-test-token");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === "/api/session") {
      return Response.json({
        session: { expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
        user: {
          email: "reader@example.test",
          id: "reader",
          mustChangePassword: false,
          role: sessionRole,
        },
      });
    }
    if (pathname === "/api/responses/deletion-status") {
      return Response.json({ warnings: [] });
    }
    if (
      pathname === `/api/admin/responses/${result().id}` &&
      init?.method === "DELETE"
    ) {
      return Response.json({
        attachmentCleanup: deletionOutcome,
        deleted: true,
      });
    }
    if (pathname === `/api/admin/results/${result().id}`) {
      return Response.json({
        result: {
          ...result(),
          correction: null,
          data: {},
          document: { available: false, state: "draft" },
          fields: [],
          revision: null,
        },
      });
    }
    if (pathname === "/api/admin/results/attachment-follow-up") {
      return Response.json({ followUps: attachmentFollowUps });
    }
    if (pathname === "/api/admin/results") {
      requestedPage = Number(
        new URL(String(input)).searchParams.get("page") ?? 1
      );
      return listResponse();
    }
    return Response.json({ enabled: false });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => window.history.replaceState(null, "", "/"));

it("shows reporting columns for DOCX and Excel with a dash for each unavailable value", async () => {
  listResponse = () =>
    Response.json(
      resultsPayload([
        {
          ...result(),
          fiscalYear: 2570,
          formTitle: "DOCX reporting values",
          month: "ตุลาคม",
          province: "เชียงใหม่",
        },
        {
          ...result("22222222-2222-4222-8222-222222222222"),
          documentKind: "xlsx",
          fiscalYear: 2569,
          formTitle: "Excel reporting values",
          month: "กันยายน",
          province: "เชียงราย",
        },
        {
          ...result("33333333-3333-4333-8333-333333333333"),
          formTitle: "Unavailable reporting values",
        },
        {
          ...result("44444444-4444-4444-8444-444444444444"),
          documentKind: "xlsx",
          formTitle: "Partially available reporting values",
          province: "เชียงใหม่",
        },
      ])
    );
  await mount();
  const table = screen.getByRole("table", {
    name: "รายการฉบับร่างและคำตอบที่ส่งแล้ว",
  });
  for (const name of ["จังหวัด", "เดือน", "ปีงบประมาณ"]) {
    expect(within(table).getByRole("columnheader", { name })).toBeVisible();
  }
  const rows = within(table).getAllByRole("row").slice(1);
  for (const [index, values] of [
    [0, ["เชียงใหม่", "ตุลาคม", "2570"]],
    [1, ["เชียงราย", "กันยายน", "2569"]],
  ] as const) {
    for (const value of values) {
      expect(
        within(rows[index]).getByRole("cell", { name: value })
      ).toBeVisible();
    }
  }
  expect(
    within(rows[2]).getAllByRole("cell", { exact: true, name: "-" })
  ).toHaveLength(3);
  expect(within(rows[3]).getByRole("cell", { name: "เชียงใหม่" })).toBeVisible();
  expect(
    within(rows[3]).getAllByRole("cell", { exact: true, name: "-" })
  ).toHaveLength(2);
});

it("shows nonstandard Tag values, including zero and false, without changing filter choices", async () => {
  listResponse = () =>
    Response.json(
      resultsPayload([
        {
          ...result(),
          fiscalYear: "พ.ศ. 2570",
          month: "ต.ค.",
          province: "อุบล",
        },
        {
          ...result("22222222-2222-4222-8222-222222222222"),
          documentKind: "xlsx",
          fiscalYear: 0,
          month: 10,
          province: false,
        },
      ])
    );
  await mount();
  const rows = within(
    screen.getByRole("table", { name: "รายการฉบับร่างและคำตอบที่ส่งแล้ว" })
  ).getAllByRole("row");
  for (const value of ["อุบล", "ต.ค.", "พ.ศ. 2570"]) {
    expect(
      within(rows[1]).getByRole("cell", { exact: true, name: value })
    ).toBeVisible();
  }
  for (const value of ["false", "10", "0"]) {
    expect(
      within(rows[2]).getByRole("cell", { exact: true, name: value })
    ).toBeVisible();
  }
  expect(
    within(screen.getByRole("combobox", { name: "จังหวัด" })).queryByRole(
      "option",
      { exact: true, name: "อุบล" }
    )
  ).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("combobox", { name: "เดือน" })).queryByRole(
      "option",
      { exact: true, name: "ต.ค." }
    )
  ).not.toBeInTheDocument();
});

describe("Province results search", () => {
  it("applies a labelled single Province choice through Search and omits the all-values default", async () => {
    const user = userEvent.setup();
    await mount();
    const province = screen.getByRole("combobox", { name: "จังหวัด" });
    expect(province).toHaveValue("");
    expect(province).not.toHaveAttribute("multiple");
    expect(
      within(province).getByRole("option", { name: "ทั้งหมด" })
    ).toHaveProperty("selected", true);
    expectQuery({});
    expect(screen.getByRole("link", { name: "เปิดอ่าน" })).toHaveAttribute(
      "href",
      "/admin/results/11111111-1111-4111-8111-111111111111"
    );
    const initialRequests = resultRequests().length;
    await user.selectOptions(province, "เชียงใหม่");
    expect(resultRequests()).toHaveLength(initialRequests);
    const search = screen.getByRole("button", { exact: true, name: "ค้นหา" });
    search.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expectQuery({ province: "เชียงใหม่" }));
  });

  it("retains the complete applied search on Reload and both page directions, then clears Province independently at page one", async () => {
    const user = userEvent.setup();
    listResponse = () => Response.json(resultsPayload([result()], 50));
    await mount();
    await user.type(
      screen.getByRole("textbox", { name: "Form Public ID" }),
      "0123456789abcdef0123456789abcdef"
    );
    await user.type(
      screen.getByRole("textbox", { name: "อีเมลผู้ใช้" }),
      "owner@example.test"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "สถานะ" }),
      "submitted"
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Correction ล่าสุด" }),
      { target: { value: "2" } }
    );
    fireEvent.change(screen.getByLabelText("ตั้งแต่"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("ถึง"), {
      target: { value: "2026-10-31" },
    });
    const province = screen.getByRole("combobox", { name: "จังหวัด" });
    await user.selectOptions(province, "เชียงใหม่");
    expectQuery({});
    const search = screen.getByRole("button", { exact: true, name: "ค้นหา" });
    await user.click(search);
    const applied = {
      correction: "2",
      form: "0123456789abcdef0123456789abcdef",
      from: "2026-10-01",
      province: "เชียงใหม่",
      state: "submitted",
      to: "2026-10-31T23:59:59.999Z",
      user: "owner@example.test",
    };
    await waitFor(() => expectQuery(applied));
    await user.selectOptions(province, "เชียงราย");
    await user.click(
      screen.getByRole("button", { exact: true, name: "โหลดใหม่" })
    );
    await waitFor(() => expectQuery(applied));
    await user.click(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    );
    await waitFor(() => expectQuery({ ...applied, page: "2" }));
    await user.click(
      screen.getByRole("button", { exact: true, name: "หน้าก่อนหน้า" })
    );
    await waitFor(() => expectQuery(applied));
    await user.click(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    );
    await waitFor(() => expectQuery({ ...applied, page: "2" }));
    await user.click(search);
    await waitFor(() => expectQuery({ ...applied, province: "เชียงราย" }));
    expect(
      screen.getByRole("button", { exact: true, name: "หน้าก่อนหน้า" })
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    );
    await user.selectOptions(province, "");
    await user.click(search);
    const { province: _province, ...withoutProvince } = applied;
    await waitFor(() => expectQuery(withoutProvince));
    expect(
      screen.getByRole("button", { exact: true, name: "หน้าก่อนหน้า" })
    ).toBeDisabled();
  });

  it.each(["admin", "viewer"] satisfies Role[])(
    "keeps the complete central province catalog available to a %s after an empty search",
    async (role) => {
      sessionRole = role;
      listResponse = () => Response.json(resultsPayload([]));
      await mount();
      expect(screen.getByText("ไม่พบผลลัพธ์ตามตัวกรอง")).toBeVisible();
      const province = screen.getByRole("combobox", { name: "จังหวัด" });
      const options = within(province).getAllByRole("option");
      // Independent expected directory from NSO's provincial statistics page,
      // plus Bangkok. Keep this assertion at the presented catalog boundary.
      const expected =
        "กรุงเทพมหานคร|กาญจนบุรี|จันทบุรี|ฉะเชิงเทรา|ชลบุรี|ชัยนาท|ตราด|นครนายก|นครปฐม|นนทบุรี|ปทุมธานี|ประจวบคีรีขันธ์|ปราจีนบุรี|พระนครศรีอยุธยา|เพชรบุรี|ระยอง|ราชบุรี|ลพบุรี|สมุทรปราการ|สมุทรสงคราม|สมุทรสาคร|สระแก้ว|สระบุรี|สิงห์บุรี|สุพรรณบุรี|อ่างทอง|กาฬสินธุ์|ขอนแก่น|ชัยภูมิ|นครพนม|นครราชสีมา|บึงกาฬ|บุรีรัมย์|มหาสารคาม|มุกดาหาร|ยโสธร|ร้อยเอ็ด|เลย|ศรีสะเกษ|สกลนคร|สุรินทร์|หนองคาย|หนองบัวลำภู|อำนาจเจริญ|อุดรธานี|อุบลราชธานี|กำแพงเพชร|เชียงราย|เชียงใหม่|ตาก|นครสวรรค์|น่าน|พะเยา|พิจิตร|พิษณุโลก|เพชรบูรณ์|แพร่|แม่ฮ่องสอน|ลำปาง|ลำพูน|สุโขทัย|อุตรดิตถ์|อุทัยธานี|กระบี่|ชุมพร|ตรัง|นครศรีธรรมราช|นราธิวาส|ปัตตานี|พังงา|พัทลุง|ภูเก็ต|ยะลา|ระนอง|สงขลา|สตูล|สุราษฎร์ธานี".split(
          "|"
        );
      expect(options).toHaveLength(78);
      expect(
        options
          .slice(1)
          .map((option) => option.textContent)
          .toSorted()
      ).toEqual(expected.toSorted());
      expect(
        screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
      ).toBeDisabled();
    }
  );

  it("distinguishes loading from an empty search while retaining Province choices", async () => {
    const pending = Promise.withResolvers<Response>();
    listResponse = () => pending.promise;
    await mount();
    expect(screen.getByLabelText("กำลังโหลดผลลัพธ์")).toBeVisible();
    expect(screen.queryByText("ไม่พบผลลัพธ์ตามตัวกรอง")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "จังหวัด" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "เดือน" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "ปีงบประมาณ" })).toBeEnabled();
    pending.resolve(Response.json(resultsPayload([])));
    expect(await screen.findByText("ไม่พบผลลัพธ์ตามตัวกรอง")).toBeVisible();
    expect(screen.queryByLabelText("กำลังโหลดผลลัพธ์")).not.toBeInTheDocument();
  });

  it.each([
    { message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", status: 401 },
    { message: "คุณไม่มีสิทธิ์ดูผลลัพธ์ของระบบ", status: 403 },
    { message: "ไม่สามารถโหลดผลลัพธ์ได้ กรุณาลองใหม่อีกครั้ง", status: 500 },
  ])(
    "distinguishes a $status request error from no matching saved Responses",
    async ({ status, message }) => {
      listResponse = () =>
        Response.json({ error: "request_failed" }, { status });
      await mount();
      expect(await screen.findByText(message)).toBeVisible();
      expect(screen.queryByText("ไม่พบผลลัพธ์ตามตัวกรอง")).not.toBeInTheDocument();
      expect(screen.queryByText("พบ 0 รายการในหน้านี้")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "จังหวัด" })).toBeEnabled();
      expect(screen.getByRole("combobox", { name: "เดือน" })).toBeEnabled();
      expect(screen.getByRole("combobox", { name: "ปีงบประมาณ" })).toBeEnabled();
      expect(
        screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
      ).toBeDisabled();
    }
  );

  it("retries the applied Province after a failed request and clears the previous continuation", async () => {
    const user = userEvent.setup();
    listResponse = () => Response.json(resultsPayload([result()], 50));
    await mount();
    listResponse = () =>
      Response.json({ error: "internal_error" }, { status: 500 });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "จังหวัด" }),
      "กรุงเทพมหานคร"
    );
    await user.click(screen.getByRole("button", { exact: true, name: "ค้นหา" }));
    expect(
      await screen.findByText("ไม่สามารถโหลดผลลัพธ์ได้ กรุณาลองใหม่อีกครั้ง")
    ).toBeVisible();
    expect(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    ).toBeDisabled();
    listResponse = () => Response.json(resultsPayload([result()]));
    await user.click(
      screen.getByRole("button", { exact: true, name: "ลองใหม่" })
    );
    expect(
      await screen.findByText("Synthetic provincial report")
    ).toBeVisible();
    expectQuery({ province: "กรุงเทพมหานคร" });
    expect(
      screen.queryByText("ไม่สามารถโหลดผลลัพธ์ได้ กรุณาลองใหม่อีกครั้ง")
    ).not.toBeInTheDocument();
  });
});

describe("Month results search", () => {
  it.each(["admin", "viewer"] satisfies Role[])(
    "offers all twelve full Thai months in order to a %s and applies one choice through Search after an empty search",
    async (role) => {
      sessionRole = role;
      listResponse = () => Response.json(resultsPayload([]));
      const user = userEvent.setup();
      await mount();
      const month = screen.getByRole("combobox", { name: "เดือน" });
      expect(month).toHaveValue("");
      expect(month).not.toHaveAttribute("multiple");
      expect(
        within(month)
          .getAllByRole("option")
          .map((option) => option.textContent)
      ).toEqual([
        "ทั้งหมด",
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
      ]);
      expect(
        within(month).getByRole("option", { name: "ทั้งหมด" })
      ).toHaveProperty("selected", true);
      expectQuery({});
      const initialRequests = resultRequests().length;
      await user.selectOptions(month, "ตุลาคม");
      expect(resultRequests()).toHaveLength(initialRequests);
      screen.getByRole("button", { exact: true, name: "ค้นหา" }).focus();
      await user.keyboard("{Enter}");
      await waitFor(() => expectQuery({ month: "ตุลาคม" }));
      expect(await screen.findByText("ไม่พบผลลัพธ์ตามตัวกรอง")).toBeVisible();
      expect(within(month).getAllByRole("option")).toHaveLength(13);
    }
  );

  it("retains every applied criterion on Reload and navigation, applies pending Month at page one and clears Month or Province independently", async () => {
    const user = userEvent.setup();
    listResponse = () => Response.json(resultsPayload([result()], 50));
    await mount();
    await user.type(
      screen.getByRole("textbox", { name: "Form Public ID" }),
      "0123456789abcdef0123456789abcdef"
    );
    await user.type(
      screen.getByRole("textbox", { name: "อีเมลผู้ใช้" }),
      "owner@example.test"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "สถานะ" }),
      "submitted"
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Correction ล่าสุด" }),
      { target: { value: "2" } }
    );
    fireEvent.change(screen.getByLabelText("ตั้งแต่"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("ถึง"), {
      target: { value: "2026-11-30" },
    });
    const province = screen.getByRole("combobox", { name: "จังหวัด" });
    const month = screen.getByRole("combobox", { name: "เดือน" });
    await user.selectOptions(province, "เชียงใหม่");
    await user.selectOptions(month, "ตุลาคม");
    expectQuery({});
    const search = screen.getByRole("button", { exact: true, name: "ค้นหา" });
    await user.click(search);
    const applied = {
      correction: "2",
      form: "0123456789abcdef0123456789abcdef",
      from: "2026-11-01",
      month: "ตุลาคม",
      province: "เชียงใหม่",
      state: "submitted",
      to: "2026-11-30T23:59:59.999Z",
      user: "owner@example.test",
    };
    await waitFor(() => expectQuery(applied));
    await user.selectOptions(month, "กันยายน");
    await user.selectOptions(province, "เชียงราย");
    await user.click(
      screen.getByRole("button", { exact: true, name: "โหลดใหม่" })
    );
    await waitFor(() => expectQuery(applied));
    await user.click(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    );
    await waitFor(() => expectQuery({ ...applied, page: "2" }));
    await user.click(
      screen.getByRole("button", { exact: true, name: "หน้าก่อนหน้า" })
    );
    await waitFor(() => expectQuery(applied));
    await user.click(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    );
    await waitFor(() => expectQuery({ ...applied, page: "2" }));
    await user.click(search);
    const changed = { ...applied, month: "กันยายน", province: "เชียงราย" };
    await waitFor(() => expectQuery(changed));
    expect(
      screen.getByRole("button", { exact: true, name: "หน้าก่อนหน้า" })
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    );
    await user.selectOptions(month, "");
    await user.click(search);
    const { month: _month, ...withoutMonth } = changed;
    await waitFor(() => expectQuery(withoutMonth));
    expect(
      screen.getByRole("button", { exact: true, name: "หน้าก่อนหน้า" })
    ).toBeDisabled();
    await user.selectOptions(month, "พฤศจิกายน");
    await user.click(search);
    await waitFor(() => expectQuery({ ...withoutMonth, month: "พฤศจิกายน" }));
    await user.click(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    );
    await user.selectOptions(province, "");
    await user.click(search);
    const { province: _province, ...withoutProvince } = withoutMonth;
    await waitFor(() => expectQuery({ ...withoutProvince, month: "พฤศจิกายน" }));
    expect(
      screen.getByRole("button", { exact: true, name: "หน้าก่อนหน้า" })
    ).toBeDisabled();
    await user.selectOptions(month, "");
    await user.click(search);
    await waitFor(() => expectQuery(withoutProvince));
  });

  it("retries applied Month and Province after an error while keeping pending edits separate", async () => {
    const user = userEvent.setup();
    await mount();
    const month = screen.getByRole("combobox", { name: "เดือน" });
    await user.selectOptions(month, "ตุลาคม");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "จังหวัด" }),
      "เชียงใหม่"
    );
    listResponse = () =>
      Response.json({ error: "internal_error" }, { status: 500 });
    await user.click(screen.getByRole("button", { exact: true, name: "ค้นหา" }));
    expect(
      await screen.findByText("ไม่สามารถโหลดผลลัพธ์ได้ กรุณาลองใหม่อีกครั้ง")
    ).toBeVisible();
    expect(screen.queryByText("ไม่พบผลลัพธ์ตามตัวกรอง")).not.toBeInTheDocument();
    expect(within(month).getAllByRole("option")).toHaveLength(13);
    await user.selectOptions(month, "พฤศจิกายน");
    listResponse = () => Response.json(resultsPayload([result()]));
    await user.click(
      screen.getByRole("button", { exact: true, name: "ลองใหม่" })
    );
    expect(
      await screen.findByText("Synthetic provincial report")
    ).toBeVisible();
    expectQuery({ month: "ตุลาคม", province: "เชียงใหม่" });
    expect(month).toHaveValue("พฤศจิกายน");
  });
});

describe("Fiscal year results search", () => {
  it.each(["admin", "viewer"] satisfies Role[])(
    "offers a single labelled Buddhist Era year to a %s and applies it by keyboard Search after an empty result",
    async (role) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-03T00:00:00.000Z"));
      sessionRole = role;
      listResponse = () => Response.json(resultsPayload([]));
      const user = userEvent.setup();
      await mount();
      expect(screen.getByText("ไม่พบผลลัพธ์ตามตัวกรอง")).toBeVisible();
      const year = screen.getByRole("combobox", { name: "ปีงบประมาณ" });
      expect(year).toHaveValue("");
      expect(year).not.toHaveAttribute("multiple");
      expect(
        within(year)
          .getAllByRole("option")
          .map((option) => option.textContent)
      ).toEqual([
        "ทั้งหมด",
        "2560",
        "2561",
        "2562",
        "2563",
        "2564",
        "2565",
        "2566",
        "2567",
        "2568",
        "2569",
        "2570",
        "2571",
      ]);
      expectQuery({});
      const initialRequests = resultRequests().length;
      await user.selectOptions(year, "2570");
      expect(resultRequests()).toHaveLength(initialRequests);
      screen.getByRole("button", { exact: true, name: "ค้นหา" }).focus();
      await user.keyboard("{Enter}");
      await waitFor(() => expectQuery({ fiscal_year: "2570" }));
      expect(await screen.findByText("ไม่พบผลลัพธ์ตามตัวกรอง")).toBeVisible();
      expect(within(year).getAllByRole("option")).toHaveLength(13);
    }
  );
  it.each([
    {
      expected: [
        "2559",
        "2560",
        "2561",
        "2562",
        "2563",
        "2564",
        "2565",
        "2566",
        "2567",
        "2568",
        "2569",
        "2570",
      ],
      now: "2026-09-30T16:59:59.999Z",
    },
    {
      expected: [
        "2560",
        "2561",
        "2562",
        "2563",
        "2564",
        "2565",
        "2566",
        "2567",
        "2568",
        "2569",
        "2570",
        "2571",
      ],
      now: "2026-09-30T17:00:00.000Z",
    },
    {
      expected: [
        "2560",
        "2561",
        "2562",
        "2563",
        "2564",
        "2565",
        "2566",
        "2567",
        "2568",
        "2569",
        "2570",
        "2571",
      ],
      now: "2026-12-31T17:00:00.000Z",
    },
  ])(
    "presents the twelve central years at $now using the Bangkok fiscal-year boundary",
    async ({ now, expected }) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(now));
      listResponse = () => Response.json(resultsPayload([]));
      await mount();
      const year = screen.getByRole("combobox", { name: "ปีงบประมาณ" });
      expect(
        within(year)
          .getAllByRole("option")
          .map((option) => option.textContent)
      ).toEqual(["ทั้งหมด", ...expected]);
    }
  );

  it("preserves every applied criterion on navigation and Reload, applies pending values at page one, and clears each new filter independently", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T00:00:00.000Z"));
    const user = userEvent.setup();
    listResponse = () => Response.json(resultsPayload([result()], 50));
    await mount();
    await user.type(
      screen.getByRole("textbox", { name: "Form Public ID" }),
      "0123456789abcdef0123456789abcdef"
    );
    await user.type(
      screen.getByRole("textbox", { name: "อีเมลผู้ใช้" }),
      "owner@example.test"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "สถานะ" }),
      "submitted"
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Correction ล่าสุด" }),
      { target: { value: "2" } }
    );
    fireEvent.change(screen.getByLabelText("ตั้งแต่"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("ถึง"), {
      target: { value: "2026-11-30" },
    });
    const province = screen.getByRole("combobox", { name: "จังหวัด" });
    const month = screen.getByRole("combobox", { name: "เดือน" });
    const year = screen.getByRole("combobox", { name: "ปีงบประมาณ" });
    await user.selectOptions(province, "เชียงใหม่");
    await user.selectOptions(month, "ตุลาคม");
    await user.selectOptions(year, "2570");
    expectQuery({});
    const search = screen.getByRole("button", { exact: true, name: "ค้นหา" });
    const next = screen.getByRole("button", { exact: true, name: "หน้าถัดไป" });
    const previous = screen.getByRole("button", {
      exact: true,
      name: "หน้าก่อนหน้า",
    });
    await user.click(search);
    const applied = {
      correction: "2",
      fiscal_year: "2570",
      form: "0123456789abcdef0123456789abcdef",
      from: "2026-11-01",
      month: "ตุลาคม",
      province: "เชียงใหม่",
      state: "submitted",
      to: "2026-11-30T23:59:59.999Z",
      user: "owner@example.test",
    };
    await waitFor(() => expectQuery(applied));
    await user.selectOptions(year, "2569");
    await user.selectOptions(month, "กันยายน");
    await user.selectOptions(province, "เชียงราย");
    await user.click(
      screen.getByRole("button", { exact: true, name: "โหลดใหม่" })
    );
    await waitFor(() => expectQuery(applied));
    await user.click(next);
    await waitFor(() => expectQuery({ ...applied, page: "2" }));
    await user.click(previous);
    await waitFor(() => expectQuery(applied));
    await user.click(next);
    await waitFor(() => expectQuery({ ...applied, page: "2" }));
    await user.click(search);
    const changed = {
      ...applied,
      fiscal_year: "2569",
      month: "กันยายน",
      province: "เชียงราย",
    };
    await waitFor(() => expectQuery(changed));
    expect(previous).toBeDisabled();
    await user.click(next);
    await user.selectOptions(year, "");
    await user.click(search);
    const { fiscal_year: _year, ...withoutYear } = changed;
    await waitFor(() => expectQuery(withoutYear));
    expect(previous).toBeDisabled();
    await user.selectOptions(year, "2570");
    await user.click(search);
    await user.click(next);
    await user.selectOptions(month, "");
    await user.click(search);
    const { month: _month, ...withoutMonth } = {
      ...changed,
      fiscal_year: "2570",
    };
    await waitFor(() => expectQuery(withoutMonth));
    expect(previous).toBeDisabled();
    await user.selectOptions(month, "พฤศจิกายน");
    await user.click(search);
    await user.click(next);
    await user.selectOptions(province, "");
    await user.click(search);
    const { province: _province, ...withoutProvince } = {
      ...withoutMonth,
      month: "พฤศจิกายน",
    };
    await waitFor(() => expectQuery(withoutProvince));
    expect(previous).toBeDisabled();
  });

  it("retries the applied three-filter search after an error while preserving pending Fiscal year edits and central choices", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T00:00:00.000Z"));
    const user = userEvent.setup();
    await mount();
    const province = screen.getByRole("combobox", { name: "จังหวัด" });
    const month = screen.getByRole("combobox", { name: "เดือน" });
    const year = screen.getByRole("combobox", { name: "ปีงบประมาณ" });
    await user.selectOptions(province, "เชียงใหม่");
    await user.selectOptions(month, "ตุลาคม");
    await user.selectOptions(year, "2570");
    listResponse = () =>
      Response.json({ error: "internal_error" }, { status: 500 });
    await user.click(screen.getByRole("button", { exact: true, name: "ค้นหา" }));
    expect(
      await screen.findByText("ไม่สามารถโหลดผลลัพธ์ได้ กรุณาลองใหม่อีกครั้ง")
    ).toBeVisible();
    expect(screen.queryByText("ไม่พบผลลัพธ์ตามตัวกรอง")).not.toBeInTheDocument();
    expect(within(year).getAllByRole("option")).toHaveLength(13);
    expect(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    ).toBeDisabled();
    await user.selectOptions(year, "2569");
    listResponse = () => Response.json(resultsPayload([result()]));
    await user.click(
      screen.getByRole("button", { exact: true, name: "ลองใหม่" })
    );
    expect(
      await screen.findByText("Synthetic provincial report")
    ).toBeVisible();
    expectQuery({ fiscal_year: "2570", month: "ตุลาคม", province: "เชียงใหม่" });
    expect(year).toHaveValue("2569");
    expect(
      screen.queryByText("ไม่สามารถโหลดผลลัพธ์ได้ กรุณาลองใหม่อีกครั้ง")
    ).not.toBeInTheDocument();
  });
});

it.each([
  ["admin", "legacy"],
  ["viewer", "legacy"],
  ["admin", "template"],
  ["viewer", "template"],
] as const)(
  "%s can expand retained %s attachment tracking without reviving a deleted Response",
  async (role, storageMode) => {
    sessionRole = role;
    listResponse = () => Response.json(resultsPayload([]));
    attachmentFollowUps = [
      {
        actorId: "original-owner",
        canFence: false,
        caseReference: "66666666-6666-4666-8666-666666666666",
        checkpoint: "55555555-5555-4555-8555-555555555555",
        createdAt: "2026-11-14T03:00:00.000Z",
        documentKey: "original-canonical",
        formId: "44444444-4444-4444-8444-444444444444",
        formPublicId: "0123456789abcdef0123456789abcdef",
        formTitle: "Retained file tracking",
        generation: 1,
        mutationHeld: true,
        nextAction: "Admin เริ่มลบได้เฉพาะ receipt ที่ยืนยันแล้วและยังไม่เคยส่ง DELETE",
        operationId: "22222222-2222-4222-8222-222222222222",
        reason: "ยังไม่ได้บันทึกคำตอบใหม่ ต้องจัดการไฟล์รอบที่ยกเลิกให้ครบ",
        responseDeleted: true,
        responseId: "33333333-3333-4333-8333-333333333333",
        state: "cleanup-pending",
        versions: [
          {
            bindingId: "folio_attachment",
            canDelete: true,
            category: storageMode === "legacy" ? "หลักฐาน" : "",
            cleanupState: "pending",
            confirmedAt: null,
            confirmedBy: null,
            deleteAttemptedAt: null,
            documentCategoryId: null,
            documentNumber: "DOC",
            evidence: null,
            filename: "DOC-unique-หลักฐาน.TXT",
            fiscalYear: storageMode === "legacy" ? "2570" : null,
            generation: 2,
            id: "66666666-6666-4666-8666-666666666666",
            identityId: "66666666-6666-4666-8666-666666666666",
            originalName: "original.TXT",
            overwriteIdentityIds: [],
            receivedAt: "2026-11-14T03:00:01.000Z",
            referenced: false,
            requestSettledAt: "2026-11-14T03:00:01.000Z",
            rowIndex: 2,
            sentAt: "2026-11-14T03:00:00.000Z",
            sizeBytes: 49,
            state: "received",
            storageMode,
            storageTemplateId: null,
            tag: "items.proof",
            templateName: storageMode === "template" ? "ก่อหนี้-4_ขยาย(45)" : null,
          },
        ],
      },
    ];
    const user = userEvent.setup();
    await mount();
    // JSDOM has no native modality; real-browser acceptance covers focus containment and restoration.
    const nativeDialog = document.querySelector("dialog");
    if (nativeDialog) {
      nativeDialog.showModal = () => {
        nativeDialog.open = true;
      };
      nativeDialog.close = () => {
        nativeDialog.open = false;
      };
    }
    const caseSearch = screen.getByRole("textbox", {
      name: "รหัสติดตามการลบหรือ Operation",
    });
    await user.type(caseSearch, "66666666-6666-4666-8666-666666666666");
    await user.click(await screen.findByText(/Retained file tracking —/u));
    expect(screen.getByText(/ลบคำตอบแล้ว \(หลักฐานติดตามเท่านั้น\)/u)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "items.proof / แถว 3 (index 2)" })
    ).toBeVisible();
    expect(
      screen.getByText(
        storageMode === "template"
          ? /เลข: DOC \/ ปี: - \/ แม่แบบ: ก่อหนี้-4_ขยาย\(45\)/u
          : /เลข: DOC \/ ปี: 2570 \/ หมวด: หลักฐาน/u
      )
    ).toBeVisible();
    expect(screen.getByText(/^เริ่มส่ง:/u)).toHaveTextContent(
      /เริ่มส่ง:.*\d{1,2}:\d{2}.*receipt:.*\d{1,2}:\d{2}/u
    );
    expect(
      screen.queryByRole("link", { name: "เปิดอ่านคำตอบที่บันทึกไว้" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { exact: true, name: "เปิดอ่าน" })
    ).not.toBeInTheDocument();
    if (role === "admin") {
      const deleteTrigger = screen.getByRole("button", {
        name: "เริ่มลบไฟล์ค้างครั้งแรก",
      });
      await user.click(deleteTrigger);
      const confirmation = screen.getByRole("dialog", {
        name: "ยืนยันการลบไฟล์ค้างครั้งแรก",
      });
      expect(confirmation).toBeVisible();
      fireEvent(confirmation, new Event("cancel", { cancelable: true }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          new URL(String(input)).pathname.endsWith("/settle")
        )
      ).toHaveLength(0);
      await user.click(deleteTrigger);
      expect(screen.getByText(/ไฟล์ลบแล้วกู้คืนไม่ได้/u)).toBeVisible();
      await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    } else {
      expect(
        screen.queryByRole("button", { name: "เริ่มลบไฟล์ค้างครั้งแรก" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "หยุดรอบเดิมและติดตามผล" })
      ).not.toBeInTheDocument();
    }
    await user.clear(caseSearch);
    await user.type(caseSearch, "not-this-case");
    expect(
      screen.queryByText(/Retained file tracking —/u)
    ).not.toBeInTheDocument();
    expect(screen.getByText("ไม่มีรายการติดตาม")).toBeVisible();
  }
);

it("requires confirmation and retains the incomplete file outcome after Admin deletes Response data", async () => {
  deletionOutcome = {
    caseReference: "66666666-6666-4666-8666-666666666666",
    state: "pending",
    warning:
      "ลบข้อมูลคำตอบแล้ว แต่ URL อาจยังเปิดได้ รหัสติดตาม 66666666-6666-4666-8666-666666666666",
  };
  await mount(`/admin/results/${result().id}`);
  await userEvent.click(screen.getByRole("button", { name: "ลบคำตอบถาวร" }));
  expect(
    screen.getByRole("dialog", { name: "ยืนยันการลบคำตอบถาวร" })
  ).toBeVisible();
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")
  ).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "ยืนยันการลบถาวร" }));
  expect(await screen.findByText("ลบข้อมูลคำตอบถาวรแล้ว")).toBeVisible();
  expect(screen.getByText(deletionOutcome.warning ?? "")).toBeVisible();
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")
  ).toEqual([
    [
      `${API_ORIGIN}/api/admin/responses/${result().id}`,
      expect.objectContaining({ body: JSON.stringify({ confirm: true }) }),
    ],
  ]);
  expect(screen.getByRole("link", { name: "กลับไปรายการผลลัพธ์" })).toBeVisible();
});
