import type * as RouterModule from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as AuthModule from "@/lib/auth";
import { Route } from "@/routes/login";

const fixture = vi.hoisted(() => ({
  isSso: false,
  navigate: vi.fn(),
  search: {} as { legacySso?: string; returnTo?: string },
  signIn: vi.fn(),
  user: null as {
    id: string;
    email: string;
    role: "admin" | "user";
    mustChangePassword: boolean;
  } | null,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  useNavigate: () => fixture.navigate,
  useSearch: () => fixture.search,
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  useAuth: () => ({
    isSso: fixture.isSso,
    loading: false,
    signIn: fixture.signIn,
    user: fixture.user,
  }),
}));
const Login = Route.options.component as ComponentType;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.isSso = false;
  fixture.search = {};
  fixture.user = null;
  fixture.navigate.mockResolvedValue();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ enabled: true })))
  );
});

describe("SSO role-aware login navigation", () => {
  it("explains a callback rejected by the final Admin guard", async () => {
    fixture.search = { legacySso: "final_admin_required" };
    render(<Login />);
    expect(
      await screen.findByText(/ไม่สามารถลดสิทธิ์ผู้ดูแลระบบคนสุดท้ายได้/u)
    ).toBeVisible();
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", undefined, "/admin"],
    ["user", "/admin/users", "/dashboard"],
  ] as const)(
    "lands authenticated SSO %s accounts at %s",
    async (role, returnTo, destination) => {
      fixture.isSso = true;
      fixture.search = { returnTo };
      fixture.user = {
        email: "sso@example.test",
        id: "sso",
        mustChangePassword: true,
        role,
      };
      render(<Login />);
      await waitFor(() =>
        expect(fixture.navigate).toHaveBeenCalledWith({
          replace: true,
          to: destination,
        })
      );
    }
  );

  it("keeps the local password-change requirement", async () => {
    fixture.user = {
      email: "local@example.test",
      id: "local",
      mustChangePassword: true,
      role: "admin",
    };
    render(<Login />);
    await waitFor(() =>
      expect(fixture.navigate).toHaveBeenCalledWith({
        replace: true,
        search: { returnTo: undefined },
        to: "/change-password",
      })
    );
  });

  it("retains the current session and returns its Admin to work after a rejected switch", async () => {
    fixture.search = { legacySso: "final_admin_required" };
    fixture.user = {
      email: "admin@example.test",
      id: "admin",
      mustChangePassword: false,
      role: "admin",
    };
    render(<Login />);
    fireEvent.click(
      await screen.findByRole("button", { name: "กลับไปทำงานต่อ" })
    );
    await waitFor(() =>
      expect(fixture.navigate).toHaveBeenCalledWith({
        replace: true,
        to: "/admin",
      })
    );
  });
});
