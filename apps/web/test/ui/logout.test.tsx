import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_KEY } from "@/lib/api";
import { Route as RootRoute } from "@/routes/__root";
import { Route as AdminRoute } from "@/routes/admin";
import { Route as DashboardRoute } from "@/routes/dashboard";

const fetchMock = vi.fn<typeof fetch>();
let signOutResponse: () => Response;
let role: "admin" | "user";
let expiresIn: number;
let isSso: boolean;
let mustChangePassword: boolean;
let ssoAvailable: boolean;

const mount = async (path = "/admin") => {
  window.history.replaceState(null, "", path);
  const root = createRootRoute({ component: RootRoute.options.component });
  const login = createRoute({
    component: () => <div>Login page</div>,
    getParentRoute: () => root,
    path: "/login",
    validateSearch: (search: Record<string, unknown>) => ({
      returnTo:
        typeof search.returnTo === "string" ? search.returnTo : undefined,
    }),
  });
  const admin = createRoute({
    component: AdminRoute.options.component,
    getParentRoute: () => root,
    path: "/admin",
  });
  const changePassword = createRoute({
    component: () => <div>Change password page</div>,
    getParentRoute: () => root,
    path: "/change-password",
  });
  const dashboard = createRoute({
    component: DashboardRoute.options.component,
    getParentRoute: () => root,
    path: "/dashboard",
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: root.addChildren([login, admin, dashboard, changePassword]),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
};

beforeEach(() => {
  role = "admin";
  expiresIn = 60 * 60 * 1000;
  isSso = false;
  mustChangePassword = false;
  ssoAvailable = false;
  signOutResponse = () => Response.json({ ok: true });
  fetchMock.mockReset();
  fetchMock.mockImplementation((input) => {
    const { pathname } = new URL(String(input));
    if (pathname === "/api/session") {
      return Promise.resolve(
        Response.json({
          session: {
            expiresAt: new Date(Date.now() + expiresIn).toISOString(),
            isSso,
          },
          user: {
            email: "logout@example.test",
            id: "logout-user",
            mustChangePassword,
            role,
          },
        })
      );
    }
    if (pathname === "/api/auth/sign-out") {
      return Promise.resolve(signOutResponse());
    }
    if (pathname === "/api/responses/me") {
      return Promise.resolve(Response.json({ responses: [] }));
    }
    if (pathname === "/api/legacy-sso/start") {
      return Promise.resolve(
        Response.json({ error: "sso_unavailable" }, { status: 503 })
      );
    }
    return Promise.resolve(Response.json({ enabled: ssoAvailable }));
  });
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(SESSION_KEY, "logout-test-token");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("logout navigation", () => {
  it.each([
    ["admin", "/admin"],
    ["user", "/dashboard"],
  ] as const)(
    "logs %s out to /login without returnTo",
    async (userRole, path) => {
      role = userRole;
      const router = await mount(path);
      await userEvent.click(
        await screen.findByRole("button", { exact: true, name: "ออกจากระบบ" })
      );
      await screen.findByText("Login page");
      await waitFor(() => expect(router.state.location.href).toBe("/login"));
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    }
  );

  it("keeps the cleanup warning and omits returnTo when the session was revoked", async () => {
    signOutResponse = () =>
      Response.json(
        { error: "sign_out_cleanup_failed", sessionRevoked: true },
        { status: 500 }
      );
    const router = await mount();
    await userEvent.click(
      await screen.findByRole("button", { exact: true, name: "ออกจากระบบ" })
    );
    await screen.findByText("Login page");
    expect(router.state.location.href).toBe("/login");
    expect(
      screen.getByText("ออกจากระบบแล้ว แต่การล้างข้อมูล AI ไม่สำเร็จ")
    ).toBeVisible();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("stays signed in when logout fails before revocation", async () => {
    signOutResponse = () =>
      Response.json({ error: "sign_out_failed" }, { status: 500 });
    const router = await mount();
    await userEvent.click(
      await screen.findByRole("button", { exact: true, name: "ออกจากระบบ" })
    );
    expect(
      await screen.findByText("ไม่สามารถออกจากระบบได้ กรุณาลองใหม่อีกครั้ง")
    ).toBeVisible();
    expect(router.state.location.href).toBe("/admin");
    expect(localStorage.getItem(SESSION_KEY)).toBe("logout-test-token");
  });

  it("preserves returnTo for unauthenticated visits to protected pages", async () => {
    localStorage.removeItem(SESSION_KEY);
    const router = await mount();
    await screen.findByText("Login page");
    expect(router.state.location.search).toEqual({ returnTo: "/admin" });
  });

  it.each([
    ["admin", "/admin"],
    ["user", "/dashboard"],
  ] as const)(
    "renews local %s sessions through password login",
    async (userRole, path) => {
      role = userRole;
      expiresIn = 2 * 60 * 1000;
      const router = await mount(path);
      await userEvent.click(
        await screen.findByRole("button", { exact: true, name: "เข้าสู่ระบบใหม่" })
      );
      await screen.findByText("Login page");
      expect(router.state.location.search).toEqual({ returnTo: path });
    }
  );

  it.each([
    ["admin", "/admin"],
    ["user", "/dashboard"],
  ] as const)(
    "waits for saved work before renewing SSO %s sessions",
    async (userRole, path) => {
      role = userRole;
      isSso = true;
      expiresIn = 2 * 60 * 1000;
      let resolveSave: ((allowed: boolean) => void) | undefined;
      const handleSave = (event: Event) => {
        const { detail } = event as CustomEvent<{
          handled: boolean;
          resolve: (allowed: boolean) => void;
        }>;
        detail.handled = true;
        resolveSave = detail.resolve;
      };
      window.addEventListener("folio:before-reauth", handleSave);
      try {
        await mount(path);
        await userEvent.click(
          await screen.findByRole("button", {
            exact: true,
            name: "เข้าสู่ระบบระบบเดิม",
          })
        );
        const ssoCalls = () =>
          fetchMock.mock.calls.filter(([input]) =>
            String(input).endsWith("/api/legacy-sso/start")
          );
        expect(ssoCalls()).toHaveLength(0);
        await act(() => resolveSave?.(false));
        expect(ssoCalls()).toHaveLength(0);
        await userEvent.click(
          screen.getByRole("button", { exact: true, name: "เข้าสู่ระบบระบบเดิม" })
        );
        await act(() => resolveSave?.(true));
        await screen.findByText("ไม่สามารถเชื่อมต่อบัญชีระบบเดิมได้ กรุณาลองอีกครั้ง");
        expect(ssoCalls()).toHaveLength(1);
        expect(JSON.parse(String(ssoCalls()[0]?.[1]?.body))).toEqual({
          returnTo: path,
        });
        expect(
          fetchMock.mock.calls.some(([input]) =>
            String(input).endsWith("/api/auth/sign-out")
          )
        ).toBe(false);
        expect(localStorage.getItem(SESSION_KEY)).toBe("logout-test-token");
      } finally {
        window.removeEventListener("folio:before-reauth", handleSave);
      }
    }
  );

  it("offers account switching to Admins when the PDMS bridge is enabled", async () => {
    ssoAvailable = true;
    await mount();
    expect(
      await screen.findByRole("button", { name: "สลับบัญชีระบบเดิม" })
    ).toBeVisible();
  });

  it.each([true, false])(
    "applies the password-change requirement using isSso=%s",
    async (ssoSession) => {
      isSso = ssoSession;
      mustChangePassword = true;
      const router = await mount();
      if (ssoSession) {
        await screen.findByRole("button", { exact: true, name: "ออกจากระบบ" });
        expect(router.state.location.pathname).toBe("/admin");
      } else {
        await screen.findByText("Change password page");
        expect(router.state.location.pathname).toBe("/change-password");
      }
    }
  );
});
