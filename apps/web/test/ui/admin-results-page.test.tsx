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
import type { AdminResult, Role } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const result = (id = "11111111-1111-4111-8111-111111111111"): AdminResult => ({
  createdAt: "2026-10-15T00:00:00.000Z",
  documentKind: "docx",
  formPublicId: "0123456789abcdef0123456789abcdef",
  formTitle: "Synthetic provincial report",
  id,
  latestCorrectionNumber: null,
  state: "draft",
  submissionId: null,
  submittedAt: null,
  updatedAt: "2026-10-15T00:00:00.000Z",
  userEmail: "owner@example.test",
});

const fetchMock = vi.fn<typeof fetch>();
let sessionRole: Role;
let listResponse: () => Response | Promise<Response>;

const resultRequests = () =>
  fetchMock.mock.calls.filter(
    ([input]) => new URL(String(input)).pathname === "/api/admin/results"
  );
const expectQuery = (expected: Record<string, string>) => {
  const request = resultRequests().at(-1);
  expect(request).toBeDefined();
  const url = new URL(String(request?.[0]));
  expect(url.origin).toBe(API_ORIGIN);
  expect(Object.fromEntries(url.searchParams)).toEqual(expected);
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
const mount = async () => {
  const path = "/admin/results";
  window.history.replaceState(null, "", path);
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "ตรวจทานคำตอบ" });
  await flush();
};

beforeEach(() => {
  sessionRole = "admin";
  listResponse = () => Response.json({ nextCursor: null, results: [result()] });
  localStorage.setItem(SESSION_KEY, "results-reader-test-token");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
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
    if (pathname === "/api/admin/results") {
      return listResponse();
    }
    return Response.json({ enabled: false });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => window.history.replaceState(null, "", "/"));

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
    listResponse = () =>
      Response.json({ nextCursor: "next-page", results: [result()] });
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
    await user.click(screen.getByRole("button", { exact: true, name: "ถัดไป" }));
    await waitFor(() => expectQuery({ ...applied, cursor: "next-page" }));
    await user.click(
      screen.getByRole("button", { exact: true, name: "ก่อนหน้า" })
    );
    await waitFor(() => expectQuery(applied));
    await user.click(screen.getByRole("button", { exact: true, name: "ถัดไป" }));
    await waitFor(() => expectQuery({ ...applied, cursor: "next-page" }));
    await user.click(search);
    await waitFor(() => expectQuery({ ...applied, province: "เชียงราย" }));
    expect(
      screen.getByRole("button", { exact: true, name: "ก่อนหน้า" })
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { exact: true, name: "ถัดไป" }));
    await user.selectOptions(province, "");
    await user.click(search);
    const { province: _province, ...withoutProvince } = applied;
    await waitFor(() => expectQuery(withoutProvince));
    expect(
      screen.getByRole("button", { exact: true, name: "ก่อนหน้า" })
    ).toBeDisabled();
  });

  it.each(["admin", "viewer"] satisfies Role[])(
    "keeps the complete central province catalog available to a %s after an empty search",
    async (role) => {
      sessionRole = role;
      listResponse = () => Response.json({ nextCursor: null, results: [] });
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
        screen.getByRole("button", { exact: true, name: "ถัดไป" })
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
    pending.resolve(Response.json({ nextCursor: null, results: [] }));
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
      expect(
        screen.getByRole("button", { exact: true, name: "ถัดไป" })
      ).toBeDisabled();
    }
  );

  it("retries the applied Province after a failed request and clears the previous continuation", async () => {
    const user = userEvent.setup();
    listResponse = () =>
      Response.json({
        nextCursor: "previous-search-page",
        results: [result()],
      });
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
      screen.getByRole("button", { exact: true, name: "ถัดไป" })
    ).toBeDisabled();
    listResponse = () =>
      Response.json({ nextCursor: null, results: [result()] });
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
