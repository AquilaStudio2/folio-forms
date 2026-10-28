import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminLegacyAccountLinkRequest, Role } from "@/lib/api";
import { SESSION_KEY } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const responseId = "11111111-1111-4111-8111-111111111111";
let sessionRole: Role;
let sessionIsSso: boolean;
let mustChangePassword: boolean;
let linkFailure: boolean;
let accountEnabled: boolean;
let managedRole: Role;
let managedId: string;
let pendingLinks: AdminLegacyAccountLinkRequest[];
let patchFailure: string | null;
let resetFailure: boolean;
let accountNextCursor: string | null;
let resultState: "draft" | "submitted";
const mappedAccount = () => ({
  createdAt: "2026-10-27T00:00:00.000Z",
  email: "mapped@example.test",
  enabled: accountEnabled,
  id: managedId,
  mustChangePassword: false,
  name: "Mapped officer",
  role: managedRole,
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

const createLocalViewer = async () => {
  await userEvent.type(screen.getByLabelText("ชื่อผู้ใช้"), "Local viewer");
  await userEvent.type(
    screen.getByLabelText("อีเมล", { exact: true }),
    "local@example.test"
  );
  await userEvent.selectOptions(
    screen.getByLabelText("บทบาท", { selector: "#create-user-role" }),
    "viewer"
  );
  await userEvent.click(
    screen.getByRole("button", { exact: true, name: "สร้างบัญชี" })
  );
  await screen.findByText("Temporary-viewer-123");
};

const accountFixtureResponse = (
  url: URL,
  init?: RequestInit
): Response | null => {
  const { pathname } = url;
  if (pathname === `/api/admin/users/${managedId}/password-reset`) {
    return resetFailure
      ? Response.json({ error: "credential_missing" }, { status: 500 })
      : Response.json({
          temporaryPassword: "Reset-viewer-123",
          user: { ...mappedAccount(), mustChangePassword: true },
        });
  }
  if (pathname === "/api/admin/users" && init?.method === "POST") {
    const payload = JSON.parse(String(init.body));
    return Response.json({
      temporaryPassword: "Temporary-viewer-123",
      user: { ...mappedAccount(), ...payload },
    });
  }
  if (pathname === "/api/admin/users") {
    return Response.json({
      nextCursor: url.searchParams.has("cursor") ? null : accountNextCursor,
      users: [mappedAccount()],
    });
  }
  if (
    pathname === `/api/admin/users/${managedId}` &&
    init?.method === "PATCH"
  ) {
    if (patchFailure) {
      return Response.json({ error: patchFailure }, { status: 409 });
    }
    const payload = JSON.parse(String(init.body));
    if (payload.role) {
      managedRole = payload.role;
      if (managedId === "current-user") {
        sessionRole = payload.role;
      }
    }
    if (typeof payload.enabled === "boolean") {
      accountEnabled = payload.enabled;
    }
    return Response.json({ user: mappedAccount() });
  }
  return null;
};

beforeEach(() => {
  sessionRole = "viewer";
  sessionIsSso = true;
  mustChangePassword = false;
  linkFailure = false;
  accountEnabled = true;
  managedRole = "viewer";
  managedId = "mapped-viewer";
  pendingLinks = [];
  patchFailure = null;
  resetFailure = false;
  accountNextCursor = null;
  resultState = "draft";
  localStorage.setItem(SESSION_KEY, "viewer-token");
  fetchMock.mockReset();
  fetchMock.mockImplementation((input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === "/api/auth/sign-in/email") {
      return Promise.resolve(Response.json({ token: "local-viewer-token" }));
    }
    if (pathname === "/api/account/password") {
      mustChangePassword = false;
      return Promise.resolve(Response.json({ ok: true }));
    }
    if (pathname === "/api/session") {
      return Promise.resolve(
        Response.json({
          session: {
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            isSso: sessionIsSso,
          },
          user: {
            email: "viewer@example.test",
            id: "current-user",
            mustChangePassword,
            role: sessionRole,
          },
        })
      );
    }
    const accountResponse = accountFixtureResponse(
      new URL(String(input)),
      init
    );
    if (accountResponse) {
      return Promise.resolve(accountResponse);
    }
    if (pathname === "/api/admin/account-links/link/approve") {
      if (linkFailure) {
        pendingLinks = pendingLinks.map((link) => ({
          ...link,
          reviewedGeneration: "8",
          user: { ...link.user, enabled: false },
        }));
        return Promise.resolve(
          Response.json({ error: "account_link_changed" }, { status: 409 })
        );
      }
      return Promise.resolve(Response.json({ ok: true }));
    }
    if (pathname === "/api/admin/account-links") {
      return Promise.resolve(
        Response.json({ nextCursor: null, requests: pendingLinks })
      );
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
  it("blocks navigation and competing account actions while VIEWER credentials are being generated", async () => {
    sessionRole = "admin";
    const router = await mount("/admin/users");
    await screen.findByText("Mapped officer");
    await userEvent.type(screen.getByLabelText("ชื่อผู้ใช้"), "Pending viewer");
    await userEvent.type(
      screen.getByLabelText("อีเมล", { exact: true }),
      "pending@example.test"
    );
    await userEvent.selectOptions(
      screen.getByLabelText("บทบาท", { selector: "#create-user-role" }),
      "viewer"
    );
    const pending = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => pending.promise);
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "สร้างบัญชี" })
    );
    expect(screen.getByRole("button", { name: /กำลังสร้างบัญชี/u })).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "บทบาทใหม่ mapped@example.test" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "ตั้งรหัสผ่านใหม่ให้ mapped@example.test" })
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("link", { name: "ผลลัพธ์" }));
    expect(router.state.location.pathname).toBe("/admin/users");
    await act(async () => {
      pending.resolve(
        Response.json({
          temporaryPassword: "Pending-secret-123",
          user: mappedAccount(),
        })
      );
      await pending.promise;
    });
    expect(await screen.findByText("Pending-secret-123")).toBeVisible();
  });

  it("clears generated VIEWER credentials on pagination, filtering, further actions and page exit", async () => {
    sessionRole = "admin";
    accountNextCursor = "next-page";
    const router = await mount("/admin/users");
    await screen.findByText("Mapped officer");
    await createLocalViewer();
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "ถัดไป" })
    );
    expect(screen.queryByText("Temporary-viewer-123")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "รายการบัญชี" })).toHaveFocus()
    );
    await createLocalViewer();
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "ค้นหา" })
    );
    expect(screen.queryByText("Temporary-viewer-123")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "รายการบัญชี" })).toHaveFocus()
    );
    await createLocalViewer();
    await userEvent.click(
      screen.getByRole("button", { name: "ปิดใช้งาน mapped@example.test" })
    );
    expect(screen.queryByText("Temporary-viewer-123")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "ยกเลิก" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "ปิดใช้งาน mapped@example.test" })
      ).toHaveFocus()
    );
    await createLocalViewer();
    await act(async () => {
      await router.navigate({
        search: { form: undefined },
        to: "/admin/results",
      });
    });
    expect(screen.queryByText("Temporary-viewer-123")).not.toBeInTheDocument();
    await act(async () => {
      await router.navigate({ to: "/admin/users" });
    });
    await screen.findByText("Mapped officer");
    expect(screen.queryByText("Temporary-viewer-123")).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "handles password reset for a disabled VIEWER with credential failure %s",
    async (failure) => {
      sessionRole = "admin";
      accountEnabled = false;
      resetFailure = failure;
      await mount("/admin/users");
      await userEvent.click(
        await screen.findByRole("button", {
          name: "ตั้งรหัสผ่านใหม่ให้ mapped@example.test",
        })
      );
      await userEvent.click(
        screen.getByRole("button", { exact: true, name: "ยืนยัน" })
      );
      if (failure) {
        expect(
          await screen.findByText("ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาลองใหม่อีกครั้ง")
        ).toBeVisible();
        expect(screen.queryByText("Reset-viewer-123")).not.toBeInTheDocument();
      } else {
        expect(await screen.findByText("Reset-viewer-123")).toBeVisible();
      }
      expect(
        screen.getByRole("button", { name: "เปิดใช้งาน mapped@example.test" })
      ).toBeVisible();
      expect(
        screen.getByText("VIEWER", { exact: true, selector: "span" })
      ).toBeVisible();
    }
  );

  it.each([
    "/admin/users",
    "/dashboard",
    "/forms/0123456789abcdef0123456789abcdef/fill",
    `/admin/results/${responseId}`,
  ])(
    "requires local password replacement before opening %s as VIEWER",
    async (returnTo) => {
      sessionIsSso = false;
      mustChangePassword = true;
      localStorage.removeItem(SESSION_KEY);
      const router = await mount(
        `/login?returnTo=${encodeURIComponent(returnTo)}`
      );
      await userEvent.type(
        await screen.findByLabelText("อีเมล", { exact: true }),
        "viewer@example.test"
      );
      await userEvent.type(
        screen.getByLabelText("รหัสผ่าน", { exact: true }),
        "Temporary-viewer-123"
      );
      await userEvent.click(
        screen.getByRole("button", { exact: true, name: "เข้าสู่ระบบ" })
      );
      await screen.findByRole("heading", { name: "ตั้งรหัสผ่านใหม่" });
      expect(router.state.location.pathname).toBe("/change-password");
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/api/admin/results")
        )
      ).toBe(false);
      await userEvent.type(
        screen.getByLabelText("รหัสผ่านปัจจุบัน"),
        "Temporary-viewer-123"
      );
      await userEvent.type(
        screen.getByLabelText("รหัสผ่านใหม่", { exact: true }),
        "Permanent-viewer-123"
      );
      await userEvent.type(
        screen.getByLabelText("ยืนยันรหัสผ่านใหม่"),
        "Permanent-viewer-123"
      );
      await userEvent.click(
        screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" })
      );
      await screen.findByText("เปลี่ยนรหัสผ่านสำเร็จ กำลังกลับไปหน้าเข้าสู่ระบบ…");
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
      await userEvent.type(
        await screen.findByLabelText(
          "อีเมล",
          { exact: true },
          { timeout: 2000 }
        ),
        "viewer@example.test"
      );
      await userEvent.type(
        screen.getByLabelText("รหัสผ่าน", { exact: true }),
        "Permanent-viewer-123"
      );
      await userEvent.click(
        screen.getByRole("button", { exact: true, name: "เข้าสู่ระบบ" })
      );
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(
          returnTo.startsWith("/admin/results/") ? returnTo : "/admin/results"
        )
      );
    }
  );

  it("requires login again after an Admin changes their own role to VIEWER", async () => {
    sessionRole = "admin";
    managedRole = "admin";
    managedId = "current-user";
    sessionIsSso = false;
    const router = await mount("/admin/users");
    await screen.findByText("Mapped officer");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "บทบาทใหม่ mapped@example.test" }),
      "viewer"
    );
    await userEvent.click(
      screen.getByRole("button", { name: "เปลี่ยนบทบาท mapped@example.test" })
    );
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "ยืนยัน" })
    );
    await screen.findByLabelText("อีเมล", { exact: true });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(router.state.location.pathname).toBe("/login");
    await userEvent.type(
      screen.getByLabelText("อีเมล", { exact: true }),
      "viewer@example.test"
    );
    await userEvent.type(
      screen.getByLabelText("รหัสผ่าน", { exact: true }),
      "Permanent-viewer-123"
    );
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "เข้าสู่ระบบ" })
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/results")
    );
  });

  it("cancels a role change without a request and preserves the current role after a rejected change", async () => {
    sessionRole = "admin";
    managedRole = "admin";
    await mount("/admin/users");
    await screen.findByText("Mapped officer");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "บทบาทใหม่ mapped@example.test" }),
      "viewer"
    );
    await userEvent.click(
      screen.getByRole("button", { name: "เปลี่ยนบทบาท mapped@example.test" })
    );
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "ยกเลิก" })
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")
    ).toBe(false);
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "บทบาทใหม่ mapped@example.test" })
      ).toHaveFocus()
    );
    patchFailure = "final_admin_required";
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "บทบาทใหม่ mapped@example.test" }),
      "viewer"
    );
    await userEvent.click(
      screen.getByRole("button", { name: "เปลี่ยนบทบาท mapped@example.test" })
    );
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "ยืนยัน" })
    );
    expect(
      await screen.findByText("ต้องมีผู้ดูแลระบบที่เปิดใช้งานอยู่อย่างน้อยหนึ่งบัญชี")
    ).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "บทบาทใหม่ mapped@example.test" })
    ).toHaveValue("admin");
    expect(localStorage.getItem(SESSION_KEY)).toBe("viewer-token");
  });

  it.each(["disabled", "changed-email"])(
    "blocks approval for a VIEWER link with %s evidence",
    async (reason) => {
      sessionRole = "admin";
      pendingLinks = [
        {
          createdAt: "2026-10-28T00:00:00.000Z",
          email: "mapped@example.test",
          id: "link",
          providerId: "pdms",
          reviewedGeneration: "7",
          status: "pending",
          subject: "subject",
          user: {
            ...mappedAccount(),
            email:
              reason === "changed-email"
                ? "changed@example.test"
                : "mapped@example.test",
            enabled: reason !== "disabled",
          },
        },
      ];
      await mount("/admin/users");
      expect(
        await screen.findByRole("button", { name: /^อนุมัติการเชื่อมบัญชี/u })
      ).toBeDisabled();
      expect(
        screen.getByText(
          reason === "disabled"
            ? "บัญชี Folio Forms ปิดใช้งานอยู่"
            : "อีเมลบัญชี Folio Forms เปลี่ยนไปแล้ว"
        )
      ).toBeVisible();
    }
  );

  it("reloads changed link evidence after a stale VIEWER approval is rejected", async () => {
    sessionRole = "admin";
    linkFailure = true;
    pendingLinks = [
      {
        createdAt: "2026-10-28T00:00:00.000Z",
        email: "mapped@example.test",
        id: "link",
        providerId: "pdms",
        reviewedGeneration: "7",
        status: "pending",
        subject: "subject",
        user: mappedAccount(),
      },
    ];
    await mount("/admin/users");
    await userEvent.click(
      await screen.findByRole("button", { name: /^อนุมัติการเชื่อมบัญชี/u })
    );
    expect(await screen.findByText("บัญชี Folio Forms ปิดใช้งานอยู่")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^อนุมัติการเชื่อมบัญชี/u })
    ).toBeDisabled();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith("/api/admin/account-links")
      ).length
    ).toBeGreaterThan(1);
  });

  it.each(["viewer", "admin", "user"] as const)(
    "approves an eligible %s account link using the displayed evidence generation",
    async (role) => {
      managedRole = role;
      sessionRole = "admin";
      pendingLinks = [
        {
          createdAt: "2026-10-28T00:00:00.000Z",
          email: "mapped@example.test",
          id: "link",
          providerId: "pdms",
          reviewedGeneration: "7",
          status: "pending",
          subject: "subject",
          user: mappedAccount(),
        },
      ];
      await mount("/admin/users");
      const approve = await screen.findByRole("button", {
        name: "อนุมัติการเชื่อมบัญชี mapped@example.test กับ mapped@example.test",
      });
      expect(approve).toBeEnabled();
      await userEvent.click(approve);
      expect(
        await screen.findByText("อนุมัติคำขอแล้ว ผู้ใช้ต้องเริ่มเข้าสู่ระบบผ่านระบบเดิมอีกครั้ง")
      ).toBeVisible();
      const request = fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith("/link/approve")
      );
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({
        reviewedGeneration: "7",
      });
    }
  );

  it.each([
    ["admin", "user"],
    ["admin", "viewer"],
    ["user", "admin"],
    ["user", "viewer"],
    ["viewer", "admin"],
    ["viewer", "user"],
  ] as const)(
    "confirms explicit role change %s to %s",
    async (current, target) => {
      sessionRole = "admin";
      managedRole = current;
      await mount("/admin/users");
      await screen.findByText("Mapped officer");
      const save = screen.getByRole("button", {
        name: "เปลี่ยนบทบาท mapped@example.test",
      });
      expect(save).toBeDisabled();
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: "บทบาทใหม่ mapped@example.test" }),
        target
      );
      await userEvent.click(save);
      const confirmation = screen.getByRole("group", {
        name: "ยืนยันการเปลี่ยนบทบาท",
      });
      const labels = { admin: "ผู้ดูแลระบบ", user: "ผู้ใช้", viewer: "VIEWER" };
      expect(
        within(confirmation).getByText(`${labels[current]} → ${labels[target]}`)
      ).toBeVisible();
      await userEvent.click(
        within(confirmation).getByRole("button", { exact: true, name: "ยืนยัน" })
      );
      expect(
        await screen.findByText("เปลี่ยนบทบาทแล้ว และยกเลิกเซสชันทั้งหมดแล้ว")
      ).toBeVisible();
      const patch = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "PATCH"
      );
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ role: target });
      expect(
        screen.getByRole("combobox", { name: "บทบาทใหม่ mapped@example.test" })
      ).toHaveValue(target);
    }
  );

  it("filters existing accounts by VIEWER", async () => {
    sessionRole = "admin";
    await mount("/admin/users");
    await screen.findByText("Mapped officer");
    await userEvent.selectOptions(
      screen.getByLabelText("บทบาท", { selector: "#user-role-filter" }),
      "viewer"
    );
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "ค้นหา" })
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/api/admin/users?role=viewer")
        )
      ).toBe(true)
    );
  });

  it("creates a local VIEWER and shows the generated password through the existing account form", async () => {
    sessionRole = "admin";
    await mount("/admin/users");
    await screen.findByText("Mapped officer");
    await userEvent.type(screen.getByLabelText("ชื่อผู้ใช้"), "Local viewer");
    await userEvent.type(
      screen.getByLabelText("อีเมล", { exact: true }),
      "LOCAL@example.test"
    );
    await userEvent.selectOptions(
      screen.getByLabelText("บทบาท", { selector: "#create-user-role" }),
      "viewer"
    );
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "สร้างบัญชี" })
    );
    expect(await screen.findByText("Temporary-viewer-123")).toBeVisible();
    const request = fetchMock.mock.calls.find(
      ([, init]) =>
        init?.method === "POST" && String(init.body).includes("Local viewer")
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      email: "local@example.test",
      name: "Local viewer",
      role: "viewer",
    });
    expect(
      screen.getByLabelText("บทบาท", { selector: "#create-user-role" })
    ).toHaveValue("user");
  });

  it("displays mapped VIEWER accounts and preserves their role during unrelated Admin edits", async () => {
    sessionRole = "admin";
    await mount("/admin/users");
    expect(
      await screen.findByText("VIEWER", { exact: true, selector: "span" })
    ).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "ปิดใช้งาน mapped@example.test" })
    );
    await userEvent.click(
      screen.getByRole("button", { exact: true, name: "ยืนยัน" })
    );
    expect(
      await screen.findByText("ปิดใช้งานบัญชีแล้ว และยกเลิกเซสชันทั้งหมดแล้ว")
    ).toBeVisible();
    expect(
      screen.getByText("VIEWER", { exact: true, selector: "span" })
    ).toBeVisible();
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
