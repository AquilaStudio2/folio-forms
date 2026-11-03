// oxlint-disable require-await -- HTTP fixtures retain fetch's asynchronous contract.
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SESSION_KEY } from "@/lib/api";
import type { Role, Submission } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

let role: Role;
let rows: Submission[];
const fetchMock = vi.fn<typeof fetch>();
const accountLinkRequests = () =>
  fetchMock.mock.calls.filter(
    ([input]) => new URL(String(input)).pathname === "/api/admin/account-links"
  );
const formId = "0123456789abcdef0123456789abcdef";
const response = (index: number): Submission => ({
  createdAt: "2026-11-03T00:00:00.000Z",
  documentKind: "xlsx",
  formPublicId: formId,
  formTitle: `Response ${index + 1}`,
  id: `response-${index + 1}`,
  status: index % 2 === 0 ? "draft" : "submitted",
  userEmail: `owner${index + 1}@example.test`,
});

const mount = async (path: string) => {
  window.history.replaceState(null, "", path);
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  role = "user";
  rows = Array.from({ length: 11 }, (_, index) => response(index));
  localStorage.setItem(SESSION_KEY, "pagination-test-session");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/session") {
      return Response.json({
        session: { expiresAt: "2099-11-03T00:00:00.000Z" },
        user: { email: "owner@example.test", id: "owner", role },
      });
    }
    if (url.pathname === "/api/responses/me") {
      return Response.json({ responses: rows });
    }
    if (
      url.pathname.startsWith("/api/responses/") &&
      init?.method === "DELETE"
    ) {
      rows = rows.filter((row) => row.id !== url.pathname.split("/").at(-1));
      return Response.json({ discarded: true });
    }
    if (url.pathname === `/api/admin/forms/${formId}/submissions`) {
      return Response.json({ submissions: rows });
    }
    if (url.pathname === "/api/admin/users") {
      return Response.json({
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
        users: [],
      });
    }
    if (url.pathname === "/api/admin/account-links") {
      const secondPage = url.searchParams.get("page") === "2";
      return Response.json({
        pagination: {
          page: secondPage ? 2 : 1,
          pageSize: 10,
          total: 11,
          totalPages: 2,
        },
        requests: Array.from({ length: secondPage ? 1 : 10 }, (_, index) => {
          const number = secondPage ? 11 : index + 1;
          return {
            createdAt: "2026-11-03T00:00:00.000Z",
            email: `pdms${number}@example.test`,
            id: `link-${number}`,
            providerId: "pdms",
            reviewedGeneration: "1",
            subject: `subject-${number}`,
            user: {
              email: `pdms${number}@example.test`,
              enabled: true,
              id: `user-${number}`,
              name: `PDMS account ${number}`,
              role: "user",
            },
          };
        }),
      });
    }
    return Response.json({ enabled: false });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => window.history.replaceState(null, "", "/"));

it("paginates My responses without changing global statistics and returns to the previous page after discarding its final row", async () => {
  await mount("/dashboard");
  await screen.findByText("Response 1");
  expect(screen.queryByText("Response 11")).not.toBeInTheDocument();
  expect(
    screen.getByText("คำตอบทั้งหมด").previousElementSibling
  ).toHaveTextContent("11");
  expect(
    screen.getByText("กำลังดำเนินการ").previousElementSibling
  ).toHaveTextContent("6");
  const nav = screen.getByRole("navigation", { name: "แบ่งหน้าคำตอบของฉัน" });
  await userEvent.click(within(nav).getByRole("button", { name: "หน้าถัดไป" }));
  expect(screen.getByText("Response 11")).toBeInTheDocument();
  expect(screen.queryByText("Response 1")).not.toBeInTheDocument();
  expect(
    screen.getByText("คำตอบทั้งหมด").previousElementSibling
  ).toHaveTextContent("11");
  await userEvent.click(
    screen.getByRole("button", { exact: true, name: "ทิ้งฉบับร่าง" })
  );
  expect(within(nav).getByRole("button", { name: "หน้าก่อนหน้า" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "ยืนยันการทิ้ง" }));
  await screen.findByText("ทิ้งฉบับร่างแล้ว");
  expect(screen.getByText("Response 1")).toBeInTheDocument();
  expect(
    screen.getByText("คำตอบทั้งหมด").previousElementSibling
  ).toHaveTextContent("10");
  expect(within(nav).getByRole("button", { name: "หน้าถัดไป" })).toBeDisabled();
});

it("keeps an empty My responses footer visible with disabled navigation", async () => {
  rows = [];
  await mount("/dashboard");
  await screen.findByText("ยังไม่มีคำตอบ");
  expect(screen.getByText("0 รายการ · หน้า 1 จาก 1")).toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "แบ่งหน้าคำตอบของฉัน" });
  for (const button of within(nav).getAllByRole("button")) {
    expect(button).toBeDisabled();
  }
});

it("paginates the directly accessible per-form Submissions list", async () => {
  role = "admin";
  await mount(`/admin/forms/${formId}/submissions`);
  await screen.findByText("owner1@example.test");
  expect(screen.queryByText("owner11@example.test")).not.toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "แบ่งหน้าคำตอบรายแบบฟอร์ม" });
  await userEvent.click(within(nav).getByRole("button", { name: "หน้าถัดไป" }));
  expect(screen.getByText("owner11@example.test")).toBeInTheDocument();
  expect(screen.queryByText("owner1@example.test")).not.toBeInTheDocument();
  expect(
    screen.getByText("แสดง 11–11 จาก 11 รายการ · หน้า 2 จาก 2")
  ).toBeInTheDocument();
});

it("replaces account-link rows on the next page and refetches the previous page", async () => {
  role = "admin";
  await mount("/admin/users");
  await screen.findByText("PDMS account 1");
  const nav = screen.getByRole("navigation", { name: "แบ่งหน้าคำขอเชื่อมบัญชี" });
  await userEvent.click(within(nav).getByRole("button", { name: "หน้าถัดไป" }));
  await screen.findByText("PDMS account 11");
  expect(screen.queryByText("PDMS account 1")).not.toBeInTheDocument();
  expect(within(nav).getByRole("button", { name: "หน้าถัดไป" })).toBeDisabled();
  expect(
    new URL(String(accountLinkRequests().at(-1)?.[0])).searchParams.get("page")
  ).toBe("2");
  await userEvent.click(within(nav).getByRole("button", { name: "หน้าก่อนหน้า" }));
  await screen.findByText("PDMS account 1");
  await waitFor(() =>
    expect(
      within(nav).getByRole("button", { name: "หน้าก่อนหน้า" })
    ).toBeDisabled()
  );
  expect(accountLinkRequests()).toHaveLength(3);
});

it.each([
  ["/admin/results", "/api/admin/results", "แบ่งหน้าผลลัพธ์", "results", 25],
  [
    "/admin/audit",
    "/api/admin/audit-events",
    "แบ่งหน้า Audit Trail",
    "events",
    50,
  ],
  ["/admin/users", "/api/admin/users", "การแบ่งหน้ารายการผู้ใช้", "users", 20],
  [
    "/admin/users",
    "/api/admin/account-links",
    "แบ่งหน้าคำขอเชื่อมบัญชี",
    "requests",
    10,
  ],
])(
  "uses admin numbered pagination on %s for %s",
  async (path, endpoint, label, key, pageSize) => {
    role = "admin";
    const original = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === endpoint) {
        return Response.json({
          [key]: [],
          pagination: {
            page: Number(url.searchParams.get("page") ?? 1),
            pageSize,
            total: pageSize * 2 + 1,
            totalPages: 3,
          },
        });
      }
      if (!original) {
        throw new Error("The pagination HTTP fixture must be initialized");
      }
      return original(input, init);
    });
    await mount(path);
    const nav = await screen.findByRole("navigation", { name: label });
    await waitFor(() =>
      expect(within(nav).getByRole("button", { name: "ไปหน้า 2" })).toBeEnabled()
    );
    await userEvent.click(within(nav).getByRole("button", { name: "ไปหน้า 2" }));
    await waitFor(() =>
      expect(
        within(nav).getByRole("button", { name: "ไปหน้า 2" })
      ).toHaveAttribute("aria-current", "page")
    );
    const requests = fetchMock.mock.calls.filter(
      ([input]) => new URL(String(input)).pathname === endpoint
    );
    expect(new URL(String(requests.at(-1)?.[0])).searchParams.get("page")).toBe(
      "2"
    );
    expect(
      new URL(String(requests.at(-1)?.[0])).searchParams.has("cursor")
    ).toBe(false);
    await userEvent.click(
      within(nav).getByRole("button", { name: "หน้าสุดท้าย" })
    );
    await waitFor(() =>
      expect(
        within(nav).getByRole("button", { name: "หน้าถัดไป" })
      ).toBeDisabled()
    );
    expect(
      within(nav).getByRole("button", { name: "ไปหน้า 3" })
    ).toHaveAttribute("aria-current", "page");
  }
);
