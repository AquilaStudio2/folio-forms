// oxlint-disable require-await -- HTTP transport fixtures deliberately resolve immediately while retaining fetch's asynchronous contract.
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminFormsPage } from "@/features/admin-forms/admin-forms-page";
import { API_ORIGIN, SESSION_KEY } from "@/lib/api";
import type { FormSummary } from "@/lib/api";

const form = (
  id: number,
  overrides: Partial<FormSummary> = {}
): FormSummary => ({
  activeDraftCount: 0,
  createdAt: "2026-10-09T00:00:00.000Z",
  description: `Description ${id}`,
  fillMethod: "onlyoffice",
  hasTemplateDraft: false,
  id: `id-${id}`,
  publicId: `public-${id}`,
  status: "published",
  submissionCount: 0,
  title: `Form ${id}`,
  updatedAt: "2026-10-09T00:00:00.000Z",
  version: 1,
  ...overrides,
});

const payload = (
  forms: FormSummary[] = [form(1)],
  page = 1,
  total = forms.length
) => ({
  forms,
  pagination: {
    page,
    pageSize: 10,
    total,
    totalPages: Math.max(1, Math.ceil(total / 10)),
  },
});

const deferredResponse = () => {
  let complete!: (response: Response) => void;
  // oxlint-disable-next-line avoid-new -- Tests control response ordering to reproduce network races deterministically.
  const promise = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: complete };
};

const fetchMock = vi.fn<typeof fetch>();

const getRequests = () =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "GET");

const expectQuery = (expected: Record<string, string>) => {
  const request = getRequests().at(-1);
  expect(request).toBeDefined();
  const url = new URL(String(request?.[0]));
  expect(url.origin).toBe(API_ORIGIN);
  expect(url.pathname).toBe("/api/admin/forms");
  expect(Object.fromEntries(url.searchParams)).toEqual(expected);
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const mount = async () => {
  const root = createRootRoute({ component: Outlet });
  const admin = createRoute({
    component: AdminFormsPage,
    getParentRoute: () => root,
    path: "/admin",
  });
  const create = createRoute({
    component: () => <div>New form editor</div>,
    getParentRoute: () => root,
    path: "/admin/forms/new",
  });
  const edit = createRoute({
    component: () => <div>Existing form editor</div>,
    getParentRoute: () => root,
    path: "/admin/forms/$formId",
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/admin"] }),
    routeTree: root.addChildren([admin, create, edit]),
  });
  await router.load();
  const view = render(<RouterProvider router={router} />);
  await flush();
  return { ...view, router };
};

const advance = async (milliseconds: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
};

const searchInput = () =>
  screen.getByRole("searchbox", { name: "ค้นหาแบบฟอร์ม" });

const searchStatus = () => {
  const status = document.querySelector("#form-search-help");
  if (!status) {
    throw new Error("Search status must describe the search input");
  }
  return status;
};

const paginationNav = () =>
  screen.getByRole("navigation", { name: "แบ่งหน้ารายการแบบฟอร์ม" });

const chooseStatus = async (label: string) => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "สถานะแบบฟอร์ม" }));
  await user.click(screen.getByRole("option", { exact: true, name: label }));
  await flush();
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json(payload()));
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(SESSION_KEY, "admin-test-token");
});

describe("inline search feedback", () => {
  it("shows progress during the initial request without announcing a false empty catalog", async () => {
    const initial = deferredResponse();
    fetchMock.mockReturnValueOnce(initial.promise);
    await mount();
    expect(searchStatus()).toHaveTextContent("กำลังค้นหา…");
    expect(searchStatus()).not.toHaveTextContent("ไม่พบแบบฟอร์ม");
    expect(searchStatus().querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(searchInput()).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: /ยังไม่มีแบบฟอร์ม/u })
    ).not.toBeInTheDocument();
    initial.resolve(Response.json(payload([form(1)], 1, 12)));
    await flush();
    expect(searchStatus()).toHaveTextContent("พบ 12 แบบฟอร์ม");
    expect(searchStatus().querySelector("svg")).toBeNull();
  });

  it("keeps input focus when the old request fails while a newer draft waits for debounce", async () => {
    await mount();
    const old = deferredResponse();
    fetchMock.mockReturnValueOnce(old.promise);
    vi.useFakeTimers();
    searchInput().focus();
    fireEvent.change(searchInput(), { target: { value: "old" } });
    await advance(2000);
    fireEvent.change(searchInput(), { target: { value: "new draft" } });
    expect(searchInput()).toHaveFocus();
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    old.resolve(Response.json({ error: "internal_error" }, { status: 500 }));
    await flush();
    expect(searchInput()).toHaveFocus();
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    expect(searchStatus()).not.toHaveTextContent("ค้นหาไม่สำเร็จ");
    expect(searchStatus().querySelector("svg")).toBeNull();
    await advance(1999);
    expectQuery({ page: "1", search: "old" });
    await advance(1);
    expectQuery({ page: "1", search: "new draft" });
    expect(searchStatus()).toHaveTextContent("พบ 1 แบบฟอร์ม");
    expect(searchInput()).toHaveFocus();
  });

  it("announces waiting, actual network progress and server totals in one polite live region", async () => {
    await mount();
    expect(searchInput()).toHaveAttribute(
      "aria-describedby",
      "form-search-help"
    );
    expect(searchStatus()).toHaveAttribute("role", "status");
    expect(searchStatus()).toHaveAttribute("aria-live", "polite");
    expect(searchStatus()).toHaveAttribute("aria-atomic", "true");
    const searching = deferredResponse();
    fetchMock.mockReturnValueOnce(searching.promise);
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "energy" } });
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    expect(searchStatus().querySelector("svg")).toBeNull();
    await advance(1999);
    expect(getRequests()).toHaveLength(1);
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    await advance(1);
    expectQuery({ page: "1", search: "energy" });
    expect(searchStatus()).toHaveTextContent("กำลังค้นหา…");
    const spinner = searchStatus().querySelector("svg");
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(
      within(searchStatus()).queryByRole("status")
    ).not.toBeInTheDocument();
    expect(searchInput()).toBeEnabled();
    expect(screen.getByRole("button", { name: "ล้างคำค้น" })).toBeEnabled();
    searching.resolve(Response.json(payload([form(5)], 1, 23)));
    await flush();
    expect(searchStatus()).toHaveTextContent("พบ 23 แบบฟอร์ม");
    expect(searchStatus()).not.toHaveTextContent("กำลังค้นหา");
    expect(searchStatus().querySelector("svg")).toBeNull();
  });

  it("reports no matches after the search completes rather than a stale old total", async () => {
    await mount();
    fetchMock.mockImplementation(async () => Response.json(payload([])));
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "missing" } });
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    await advance(2000);
    expect(searchStatus()).toHaveTextContent("ไม่พบแบบฟอร์ม");
    expect(searchStatus()).not.toHaveTextContent("พบ 1 แบบฟอร์ม");
    expect(searchStatus().querySelector("svg")).toBeNull();
    expect(screen.getByRole("heading", { name: /ไม่พบแบบฟอร์ม/u })).toBeVisible();
  });

  it.each(["success", "failure"])(
    "clears an in-flight search immediately and ignores its stale %s",
    async (outcome) => {
      await mount();
      const searching = deferredResponse();
      fetchMock.mockReturnValueOnce(searching.promise);
      vi.useFakeTimers();
      fireEvent.change(searchInput(), { target: { value: "obsolete" } });
      await advance(2000);
      expect(searchStatus()).toHaveTextContent("กำลังค้นหา…");
      fireEvent.click(screen.getByRole("button", { name: "ล้างคำค้น" }));
      await flush();
      expectQuery({ page: "1" });
      expect(searchInput()).toHaveValue("");
      expect(searchInput()).toHaveFocus();
      expect(screen.getByLabelText("ค้นหา", { exact: true })).toBeVisible();
      expect(screen.getByText("Form 1", { exact: true })).toBeVisible();
      searching.resolve(
        outcome === "success"
          ? Response.json(payload([form(99)], 1, 99))
          : Response.json({ error: "internal_error" }, { status: 500 })
      );
      await flush();
      expect(searchStatus()).not.toHaveTextContent("พบ 99 แบบฟอร์ม");
      expect(searchStatus()).not.toHaveTextContent("กำลังค้นหา");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Form 99", { exact: true })
      ).not.toBeInTheDocument();
      expect(screen.getByText("Form 1", { exact: true })).toBeVisible();
    }
  );

  it("shows waiting for newly typed text while an older network request is pending or finishes", async () => {
    await mount();
    const old = deferredResponse();
    const current = deferredResponse();
    fetchMock
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "old" } });
    await advance(2000);
    expect(searchStatus()).toHaveTextContent("กำลังค้นหา…");
    fireEvent.change(searchInput(), { target: { value: "new" } });
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    expect(searchStatus().querySelector("svg")).toBeNull();
    old.resolve(Response.json(payload([form(88)], 1, 88)));
    await flush();
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    expect(searchStatus()).not.toHaveTextContent("พบ 88 แบบฟอร์ม");
    await advance(1999);
    expectQuery({ page: "1", search: "old" });
    await advance(1);
    expectQuery({ page: "1", search: "new" });
    expect(searchStatus()).toHaveTextContent("กำลังค้นหา…");
    current.resolve(Response.json(payload([form(2)], 1, 2)));
    await flush();
    expect(searchStatus()).toHaveTextContent("พบ 2 แบบฟอร์ม");
  });

  it("replaces old counts and search errors with waiting as soon as the input changes", async () => {
    await mount();
    fetchMock.mockImplementation(async () =>
      Response.json(payload([form(1)], 1, 14))
    );
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "working" } });
    await advance(2000);
    expect(searchStatus()).toHaveTextContent("พบ 14 แบบฟอร์ม");
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "internal_error" }, { status: 500 })
    );
    fireEvent.change(searchInput(), { target: { value: "broken" } });
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    expect(searchStatus()).not.toHaveTextContent("พบ 14 แบบฟอร์ม");
    await advance(2000);
    expect(searchStatus()).not.toHaveTextContent("กำลังค้นหา");
    expect(searchStatus()).not.toHaveTextContent("พบ 14 แบบฟอร์ม");
    expect(screen.getByRole("alert")).toBeVisible();
    fireEvent.change(searchInput(), { target: { value: "retry" } });
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    await advance(2000);
    expect(searchStatus()).toHaveTextContent("พบ 14 แบบฟอร์ม");
  });

  it("uses all matched records for the result count when moving between result pages", async () => {
    fetchMock.mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return Response.json(payload([form(page)], page, 25));
    });
    await mount();
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "energy" } });
    await advance(2000);
    expect(searchStatus()).toHaveTextContent("พบ 25 แบบฟอร์ม");
    fireEvent.click(screen.getByRole("button", { name: "หน้าถัดไป" }));
    await flush();
    expectQuery({ page: "2", search: "energy" });
    expect(searchStatus()).toHaveTextContent("พบ 25 แบบฟอร์ม");
    expect(
      screen.getByText(/หน้า 2 จาก 3$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
  });

  it("avoids a pending indication for whitespace and keeps IME text pending until committed", async () => {
    await mount();
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "   " } });
    expect(searchStatus()).not.toHaveTextContent("รอค้นหา");
    await advance(2000);
    expect(getRequests()).toHaveLength(1);
    fireEvent.compositionStart(searchInput());
    fireEvent.change(searchInput(), { target: { value: "พล" } });
    expect(searchStatus()).toHaveTextContent("รอค้นหาหลังหยุดพิมพ์…");
    await advance(2000);
    expect(getRequests()).toHaveLength(1);
    fireEvent.change(searchInput(), { target: { value: "พลังงาน" } });
    fireEvent.compositionEnd(searchInput(), { data: "พลังงาน" });
    await advance(2000);
    expectQuery({ page: "1", search: "พลังงาน" });
    expect(searchStatus()).toHaveTextContent("พบ 1 แบบฟอร์ม");
  });
});

describe("admin form catalog", () => {
  it("loads page one with no filters and renders all ten returned records", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        payload(
          Array.from({ length: 10 }, (_, index) => form(index + 1)),
          1,
          25
        )
      )
    );
    await mount();
    expectQuery({ page: "1" });
    expect(getRequests()).toHaveLength(1);
    const [[, init]] = getRequests();
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer admin-test-token"
    );
    for (let id = 1; id <= 10; id += 1) {
      expect(screen.getByText(`Form ${id}`, { exact: true })).toBeVisible();
      expect(
        screen.getByText(`Description ${id}`, { exact: true })
      ).toBeVisible();
    }
    expect(searchInput()).toHaveAttribute("placeholder", "ค้นหาจากชื่อหรือคำอธิบาย");
    expect(searchInput()).toHaveAttribute("maxLength", "200");
    expect(screen.getByLabelText("ค้นหา", { exact: true })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "ล้างคำค้น" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "สถานะแบบฟอร์ม" })
    ).toHaveTextContent("ทั้งหมด");
    expect(
      screen.getByText(/หน้า 1 จาก 3$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
  });

  it("waits exactly two seconds after the last edit and trims the shared search parameter", async () => {
    await mount();
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "  EnErGy  " } });
    await advance(1999);
    expect(getRequests()).toHaveLength(1);
    fireEvent.change(searchInput(), { target: { value: "  EnErGy report  " } });
    await advance(1999);
    expect(getRequests()).toHaveLength(1);
    await advance(1);
    expect(getRequests()).toHaveLength(2);
    expectQuery({ page: "1", search: "EnErGy report" });
    expect(screen.getByRole("button", { name: "ล้างคำค้น" })).toBeVisible();
    expect(
      screen.queryByLabelText("ค้นหา", { exact: true })
    ).not.toBeInTheDocument();
  });

  it("does not submit a search early when Enter is pressed", async () => {
    await mount();
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "test" } });
    fireEvent.keyDown(searchInput(), { code: "Enter", key: "Enter" });
    await advance(1999);
    expect(getRequests()).toHaveLength(1);
    await advance(1);
    expectQuery({ page: "1", search: "test" });
  });

  it("does not request again for whitespace-only input", async () => {
    await mount();
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "   " } });
    await advance(2000);
    expect(getRequests()).toHaveLength(1);
    expectQuery({ page: "1" });
  });

  it("encodes Thai, ampersands, percent and underscore without splitting parameters", async () => {
    await mount();
    vi.useFakeTimers();
    const term = "พลังงาน & 50%_test";
    fireEvent.change(searchInput(), { target: { value: term } });
    await advance(2000);
    expectQuery({ page: "1", search: term });
  });

  it("resets search to page one when searching from a later page", async () => {
    fetchMock.mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return Response.json(payload([form(page)], page, 35));
    });
    await mount();
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ไปหน้า 4" })
    );
    await flush();
    expectQuery({ page: "4" });
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "needle" } });
    await advance(2000);
    expectQuery({ page: "1", search: "needle" });
  });

  it.each([
    ["ร่าง", "draft"],
    ["เผยแพร่แล้ว", "published"],
    ["เก็บถาวร", "archived"],
  ])("filters %s immediately and resets a later page", async (label, value) => {
    fetchMock.mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return Response.json(payload([form(page)], page, 35));
    });
    await mount();
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ไปหน้า 4" })
    );
    await flush();
    expect(
      screen.getByText(/หน้า 4 จาก 4$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
    await chooseStatus(label);
    expectQuery({ page: "1", status: value });
    expect(
      screen.getByText(/หน้า 1 จาก 4$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
  });

  it("uses the dropdown with keyboard controls and returns focus on Escape", async () => {
    await mount();
    const user = userEvent.setup();
    const select = screen.getByRole("combobox", { name: "สถานะแบบฟอร์ม" });
    select.focus();
    await user.keyboard("[Enter][ArrowDown][Enter]");
    await flush();
    expectQuery({ page: "1", status: "draft" });
    expect(select).toHaveFocus();
    await user.keyboard("[Enter][Escape]");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(select).toHaveFocus();
    expect(getRequests()).toHaveLength(2);
  });

  it("combines status and search, keeps both during pagination, and clears only status with All", async () => {
    fetchMock.mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return Response.json(payload([form(page)], page, 25));
    });
    await mount();
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "energy" } });
    await advance(2000);
    vi.useRealTimers();
    await chooseStatus("ร่าง");
    expectQuery({ page: "1", search: "energy", status: "draft" });
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "หน้าถัดไป" })
    );
    await flush();
    expectQuery({ page: "2", search: "energy", status: "draft" });
    await chooseStatus("ทั้งหมด");
    expectQuery({ page: "1", search: "energy" });
  });

  it("clears an applied search immediately, preserves status and cancels a pending search", async () => {
    await mount();
    await chooseStatus("เผยแพร่แล้ว");
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "energy" } });
    await advance(2000);
    fireEvent.change(searchInput(), { target: { value: "pending search" } });
    const requestsBeforeClear = getRequests().length;
    fireEvent.click(screen.getByRole("button", { name: "ล้างคำค้น" }));
    await flush();
    expect(getRequests()).toHaveLength(requestsBeforeClear + 1);
    expectQuery({ page: "1", status: "published" });
    expect(searchInput()).toHaveValue("");
    expect(searchInput()).toHaveFocus();
    expect(screen.getByLabelText("ค้นหา", { exact: true })).toBeVisible();
    await advance(2000);
    expect(getRequests()).toHaveLength(requestsBeforeClear + 1);
  });

  it("clears search by manually emptying the input after the debounce", async () => {
    await mount();
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "energy" } });
    await advance(2000);
    fireEvent.change(searchInput(), { target: { value: "" } });
    await advance(1999);
    expectQuery({ page: "1", search: "energy" });
    await advance(1);
    expectQuery({ page: "1" });
  });

  it("supports first, middle and last pages without requesting outside the boundaries", async () => {
    fetchMock.mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return Response.json(payload([form(page)], page, 21));
    });
    await mount();
    expect(
      within(paginationNav()).getByRole("button", { name: "หน้าก่อนหน้า" })
    ).toBeDisabled();
    fireEvent.click(
      within(paginationNav()).getByRole("button", { name: "หน้าก่อนหน้า" })
    );
    expect(getRequests()).toHaveLength(1);
    fireEvent.click(
      within(paginationNav()).getByRole("button", { name: "หน้าถัดไป" })
    );
    await flush();
    expect(
      screen.getByText(/หน้า 2 จาก 3$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
    expectQuery({ page: "2" });
    fireEvent.click(
      within(paginationNav()).getByRole("button", {
        exact: true,
        name: "ไปหน้า 3",
      })
    );
    await flush();
    expect(
      screen.getByText(/หน้า 3 จาก 3$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
    expect(
      within(paginationNav()).getByRole("button", { name: "หน้าถัดไป" })
    ).toBeDisabled();
    const requestCount = getRequests().length;
    fireEvent.click(
      within(paginationNav()).getByRole("button", { name: "หน้าถัดไป" })
    );
    expect(getRequests()).toHaveLength(requestCount);
    fireEvent.click(
      within(paginationNav()).getByRole("button", { name: "หน้าก่อนหน้า" })
    );
    await flush();
    expectQuery({ page: "2" });
  });

  it("has no enabled next page for exactly ten records", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        payload(
          Array.from({ length: 10 }, (_, index) => form(index)),
          1,
          10
        )
      )
    );
    await mount();
    expect(
      screen.getByText(/หน้า 1 จาก 1$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "หน้าถัดไป" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "หน้าก่อนหน้า" })).toBeDisabled();
  });

  it("renders a loading state and prevents pagination until the response arrives", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    await mount();
    expect(screen.getByText(/กำลังโหลด/u)).toBeVisible();
    expect(
      screen.queryByText("Form 1", { exact: true })
    ).not.toBeInTheDocument();
    pending.resolve(Response.json(payload()));
    await flush();
    expect(screen.getByText("Form 1", { exact: true })).toBeVisible();
    expect(screen.queryByText(/กำลังโหลด/u)).not.toBeInTheDocument();
  });

  it("shows the catalog empty state at page one", async () => {
    fetchMock.mockImplementation(async () => Response.json(payload([])));
    await mount();
    expect(screen.getByText(/ยังไม่มีแบบฟอร์ม/u)).toBeVisible();
    expect(
      screen.getByText(/หน้า 1 จาก 1$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "หน้าถัดไป" })).toBeDisabled();
  });

  it("distinguishes a search with no matches from an empty catalog", async () => {
    await mount();
    fetchMock.mockImplementation(async () => Response.json(payload([])));
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "no matches" } });
    await advance(2000);
    expect(screen.getByRole("heading", { name: /ไม่พบแบบฟอร์ม/u })).toBeVisible();
    expect(
      screen.queryByText("Form 1", { exact: true })
    ).not.toBeInTheDocument();
  });

  it("renders errors accessibly and retries the same search and status", async () => {
    await mount();
    await chooseStatus("ร่าง");
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "internal_error" }, { status: 500 })
    );
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "energy" } });
    await advance(2000);
    expect(screen.getByRole("alert")).toHaveTextContent(/ไม่สามารถ|ระบบ/u);
    fireEvent.click(screen.getByRole("button", { name: /ลองโหลดอีกครั้ง/u }));
    await flush();
    expectQuery({ page: "1", search: "energy", status: "draft" });
    expect(screen.getByText("Form 1", { exact: true })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports an expired session rather than silently showing an empty list", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ error: "unauthorized" }, { status: 401 })
    );
    await mount();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /เซสชันหมดอายุ|เข้าสู่ระบบใหม่/u
    );
    expect(screen.queryByText(/ยังไม่มีแบบฟอร์ม/u)).not.toBeInTheDocument();
  });

  it("does not let a slow older successful response replace the newest search", async () => {
    await mount();
    const old = deferredResponse();
    fetchMock.mockReturnValueOnce(old.promise);
    fetchMock.mockResolvedValueOnce(
      Response.json(payload([form(99, { title: "Latest match" })]))
    );
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "old" } });
    await advance(2000);
    fireEvent.change(searchInput(), { target: { value: "new" } });
    await advance(2000);
    expect(screen.getByText("Latest match")).toBeVisible();
    old.resolve(Response.json(payload([form(88, { title: "Stale match" })])));
    await flush();
    expect(screen.getByText("Latest match")).toBeVisible();
    expect(screen.queryByText("Stale match")).not.toBeInTheDocument();
    expectQuery({ page: "1", search: "new" });
  });

  it("ignores an error from an obsolete request", async () => {
    await mount();
    const old = deferredResponse();
    fetchMock.mockReturnValueOnce(old.promise);
    fetchMock.mockResolvedValueOnce(
      Response.json(payload([form(99, { title: "Latest match" })]))
    );
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "old" } });
    await advance(2000);
    fireEvent.change(searchInput(), { target: { value: "new" } });
    await advance(2000);
    old.resolve(Response.json({ error: "internal_error" }, { status: 500 }));
    await flush();
    expect(screen.getByText("Latest match")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cancels a pending debounce on unmount", async () => {
    const { unmount } = await mount();
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "never sent" } });
    unmount();
    await advance(2000);
    expect(getRequests()).toHaveLength(1);
  });

  it("aborts the old transport on a new query and aborts the active request on unmount", async () => {
    const old = deferredResponse();
    fetchMock.mockReturnValueOnce(old.promise);
    const { unmount } = await mount();
    const oldSignal = getRequests()[0][1]?.signal;
    expect(oldSignal?.aborted).toBe(false);
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "current" } });
    await advance(2000);
    expect(oldSignal?.aborted).toBe(true);
    const activeSignal = getRequests().at(-1)?.[1]?.signal;
    expect(activeSignal?.aborted).toBe(false);
    unmount();
    expect(activeSignal?.aborted).toBe(true);
    old.resolve(Response.json(payload([form(99)])));
    await flush();
  });

  it("does not start a partial IME search until composition finishes", async () => {
    await mount();
    vi.useFakeTimers();
    fireEvent.compositionStart(searchInput());
    fireEvent.change(searchInput(), { target: { value: "พล" } });
    await advance(2000);
    expect(getRequests()).toHaveLength(1);
    fireEvent.change(searchInput(), { target: { value: "พลังงาน" } });
    fireEvent.compositionEnd(searchInput(), { data: "พลังงาน" });
    await advance(1999);
    expect(getRequests()).toHaveLength(1);
    await advance(1);
    expectQuery({ page: "1", search: "พลังงาน" });
  });

  it("links create and open controls to actual editor routes", async () => {
    await mount();
    expect(screen.getByRole("link", { name: /สร้างแบบฟอร์ม/u })).toHaveAttribute(
      "href",
      "/admin/forms/new"
    );
    expect(screen.getByRole("link", { name: /เปิดแบบฟอร์ม/u })).toHaveAttribute(
      "href",
      "/admin/forms/public-1"
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: /เปิดแบบฟอร์ม/u }));
    expect(await screen.findByText("Existing form editor")).toBeVisible();
  });

  it("returns from page four to server-clamped page three after deleting the last row", async () => {
    let deleted = false;
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return Response.json({ deleted: true });
      }
      const requestedPage = Number(
        new URL(String(input)).searchParams.get("page")
      );
      const page = deleted ? Math.min(requestedPage, 3) : requestedPage;
      return Response.json(
        payload(
          [form(page, { status: "draft", version: 0 })],
          page,
          deleted ? 30 : 31
        )
      );
    });
    await mount();
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ไปหน้า 4" })
    );
    await flush();
    expect(
      screen.getByText(/หน้า 4 จาก 4$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ลบแบบร่าง" })
    );
    expect(
      screen.getByRole("button", { exact: true, name: "ยืนยันการลบ" })
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ยืนยันการลบ" })
    );
    await flush();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/admin/forms/public-4") &&
          init?.method === "DELETE"
      )
    ).toBe(true);
    expect(
      screen.getByText(/หน้า 3 จาก 3$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
    expect(screen.getByText("Form 3", { exact: true })).toBeVisible();
    expect(screen.getByText("ลบแบบฟอร์มร่างเรียบร้อยแล้ว")).toBeVisible();
    expect(
      screen.queryByText("Form 4", { exact: true })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "หน้าถัดไป" })).toBeDisabled();
  });

  it("keeps the corrected page when a later refresh observes newly created records", async () => {
    let total = 31;
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "DELETE") {
        total = 30;
        return Response.json({ deleted: true });
      }
      const requested = Number(new URL(String(input)).searchParams.get("page"));
      const page = Math.min(requested, Math.ceil(total / 10));
      return Response.json(
        payload([form(page, { status: "draft", version: 0 })], page, total)
      );
    });
    await mount();
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ไปหน้า 4" })
    );
    await flush();
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ลบแบบร่าง" })
    );
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ยืนยันการลบ" })
    );
    await flush();
    expect(
      screen.getByText(/หน้า 3 จาก 3$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
    expectQuery({ page: "3" });
    total = 31;
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "รีเฟรชรายการ" })
    );
    await flush();
    expectQuery({ page: "3" });
    expect(
      screen.getByText(/หน้า 3 จาก 4$/u, {
        selector: "p:not(#form-search-help)",
      })
    ).toBeVisible();
  });

  it("pauses a pending search while deleting and resumes it after completion", async () => {
    const deleting = deferredResponse();
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === "DELETE"
        ? deleting.promise
        : Response.json(payload([form(1, { status: "draft", version: 0 })]))
    );
    await mount();
    vi.useFakeTimers();
    fireEvent.change(searchInput(), { target: { value: "new filter" } });
    await advance(1000);
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ลบแบบร่าง" })
    );
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ยืนยันการลบ" })
    );
    expect(searchInput()).toBeDisabled();
    await advance(2000);
    expect(getRequests()).toHaveLength(1);
    deleting.resolve(Response.json({ deleted: true }));
    await flush();
    expectQuery({ page: "1" });
    expect(searchInput()).toBeEnabled();
    await advance(2000);
    expectQuery({ page: "1", search: "new filter" });
  });

  it("cancels draft deletion with Escape, restores focus and sends no DELETE", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(payload([form(1, { status: "draft", version: 0 })]))
    );
    await mount();
    const trigger = screen.getByRole("button", {
      exact: true,
      name: "ลบแบบร่าง",
    });
    fireEvent.click(trigger);
    expect(
      screen.getByRole("button", { exact: true, name: "ยืนยันการลบ" })
    ).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("button", { exact: true, name: "ยืนยันการลบ" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { exact: true, name: "ลบแบบร่าง" })
    ).toHaveFocus();
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method !== "DELETE")
    ).toBe(true);
  });

  it("preserves the row and reports failed deletion", async () => {
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === "DELETE"
        ? Response.json({ error: "conflict" }, { status: 409 })
        : Response.json(payload([form(1, { status: "draft", version: 0 })]))
    );
    await mount();
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ลบแบบร่าง" })
    );
    fireEvent.click(
      screen.getByRole("button", { exact: true, name: "ยืนยันการลบ" })
    );
    await flush();
    expect(screen.getByText("Form 1", { exact: true })).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
    expect(getRequests()).toHaveLength(1);
  });

  it.each([
    { status: "published" as const, version: 1 },
    { status: "archived" as const, version: 1 },
    { status: "draft" as const, version: 1 },
    { activeDraftCount: 1, status: "draft" as const, version: 0 },
    { status: "draft" as const, submissionCount: 1, version: 0 },
  ])(
    "does not offer unsafe deletion for $status $version",
    async (overrides) => {
      fetchMock.mockImplementation(async () =>
        Response.json(payload([form(1, overrides)]))
      );
      await mount();
      expect(
        screen.queryByRole("button", { exact: true, name: "ลบแบบร่าง" })
      ).not.toBeInTheDocument();
    }
  );
});
