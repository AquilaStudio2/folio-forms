import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/api";
import { SESSION_KEY } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const responseId = "11111111-1111-4111-8111-111111111111";
let sessionRole: Role;
let accountEnabled: boolean;
let resultState: "draft" | "submitted";
const mappedAccount = () => ({
  createdAt: "2026-10-27T00:00:00.000Z",
  email: "mapped@example.test",
  enabled: accountEnabled,
  id: "mapped-viewer",
  mustChangePassword: false,
  name: "Mapped officer",
  role: "viewer",
  updatedAt: "2026-10-27T00:00:00.000Z",
});

const fetchMock = vi.fn<typeof fetch>();
const mount = async (path: string) => {
  window.history.replaceState(null, "", path);
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
};

beforeEach(() => {
  sessionRole = "viewer";
  accountEnabled = true;
  resultState = "draft";
  localStorage.setItem(SESSION_KEY, "viewer-token");
  fetchMock.mockReset();
  fetchMock.mockImplementation((input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === "/api/session") {
      return Promise.resolve(
        Response.json({
          session: {
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            isSso: true,
          },
          user: {
            email: "viewer@example.test",
            id: "current-user",
            mustChangePassword: false,
            role: sessionRole,
          },
        })
      );
    }
    if (pathname === "/api/admin/users") {
      return Promise.resolve(
        Response.json({ nextCursor: null, users: [mappedAccount()] })
      );
    }
    if (
      pathname === "/api/admin/users/mapped-viewer" &&
      init?.method === "PATCH"
    ) {
      accountEnabled = false;
      return Promise.resolve(Response.json({ user: mappedAccount() }));
    }
    if (pathname === "/api/admin/account-links") {
      return Promise.resolve(Response.json({ nextCursor: null, requests: [] }));
    }
    if (pathname === `/api/admin/results/${responseId}`) {
      return Promise.resolve(
        Response.json({
          result: {
            data: { name: "Saved value" },
            document: { available: false },
            fields: [],
            formPublicId: "0123456789abcdef0123456789abcdef",
            formTitle: "Other owner draft",
            id: responseId,
            state: resultState,
            submissionId: "submission",
            updatedAt: "2026-10-27T00:00:00.000Z",
            userEmail: "other@example.test",
          },
        })
      );
    }
    if (pathname === `/api/responses/${responseId}/corrections`) {
      return Promise.resolve(
        Response.json({
          latestRevision: 1,
          revisions: [0, 1].map((revision) => ({
            createdAt: "2026-10-27T00:00:00.000Z",
            data: {
              name: revision === 0 ? "Original value" : "Corrected value",
            },
            document: {
              available: false,
              state: revision === 0 ? "submission" : "correction",
            },
            reason: revision === 1 ? "Verified correction" : null,
            revision,
          })),
        })
      );
    }
    if (pathname === "/api/submissions/submission/data") {
      return Promise.resolve(
        Response.json({
          fields: [{ label: "Name", options: [], tag: "name", type: "text" }],
        })
      );
    }
    if (pathname === "/api/submissions/submission/pdf") {
      return Promise.resolve(
        new Response("saved pdf", {
          headers: { "Content-Type": "application/pdf" },
        })
      );
    }
    if (pathname === "/api/admin/results") {
      return Promise.resolve(Response.json({ nextCursor: null, results: [] }));
    }
    return Promise.resolve(Response.json({ enabled: false }));
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("VIEWER existing results access", () => {
  it("displays mapped VIEWER accounts and preserves their role during unrelated Admin edits", async () => {
    sessionRole = "admin";
    await mount("/admin/users");
    expect(await screen.findByText("VIEWER", { exact: true })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "VIEWER" })
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "ปิดใช้งาน mapped@example.test" })
    );
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "ยืนยัน" })
    );
    expect(
      await screen.findByText("ปิดใช้งานบัญชีแล้ว และยกเลิกเซสชันทั้งหมดแล้ว")
    ).toBeVisible();
    expect(screen.getByText("VIEWER", { exact: true })).toBeVisible();
    const patchRequest = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH"
    );
    expect(JSON.parse(String(patchRequest?.[1]?.body))).toEqual({
      enabled: false,
    });
  });

  it("reads correction history and downloads a saved submission without Correction controls", async () => {
    resultState = "submitted";
    const createObjectURL = vi.fn(() => "blob:download");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL })
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await mount(`/admin/results/${responseId}`);
    expect(await screen.findByText("เหตุผล: Verified correction")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "เปิด Correction" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ลบคำตอบถาวร" })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Fields" }));
    expect(await screen.findByText("Corrected value")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "PDF" })
    );
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const downloadRequest = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/submissions/submission/pdf")
    );
    expect(String(downloadRequest?.[0])).toContain("?revision=1");
    expect(screen.getByRole("link", { name: "กลับไปรายการ" })).toHaveAttribute(
      "href",
      "/admin/results"
    );
  });

  it("reads another owner's saved draft without deletion controls", async () => {
    await mount(`/admin/results/${responseId}`);
    expect(
      await screen.findByRole("heading", { name: "Other owner draft" })
    ).toBeVisible();
    expect(screen.getByText(/other@example.test/u)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "ลบคำตอบถาวร" })
    ).not.toBeInTheDocument();
  });

  it("keeps an allowed result return path after login", async () => {
    const path = `/admin/results/${responseId}`;
    const router = await mount(`/login?returnTo=${encodeURIComponent(path)}`);
    expect(
      await screen.findByRole("heading", { name: "Other owner draft" })
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(path);
  });

  it.each([
    "/admin",
    "/admin/users",
    "/admin/audit",
    "/admin/ai-authoring",
    "/admin/forms/new",
    "/admin/results/response-id/correction",
    "/dashboard",
    "/forms/0123456789abcdef0123456789abcdef/fill",
    "/receipt/submission-id",
  ])(
    "redirects VIEWER away from prohibited direct URL %s before it loads",
    async (path) => {
      const router = await mount(path);
      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/admin/results")
      );
      const requestedPaths = fetchMock.mock.calls.map(
        ([input]) => new URL(String(input)).pathname
      );
      expect(
        requestedPaths.filter(
          (requested) =>
            ![
              "/api/session",
              "/api/admin/results",
              "/api/legacy-sso/status",
            ].includes(requested)
        )
      ).toEqual([]);
    }
  );

  it("lands on the existing results page with only results navigation", async () => {
    const router = await mount("/");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/results")
    );
    expect(await screen.findByRole("link", { name: "ผลลัพธ์" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "My responses" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "สร้างแบบฟอร์ม" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "จัดการผู้ใช้" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Audit Trail" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "AI Authoring" })
    ).not.toBeInTheDocument();
  });
});
