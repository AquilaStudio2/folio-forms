import type * as RouterModule from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";
import type * as AuthModule from "@/lib/auth";
import { Route } from "@/routes/legacy-sso.confirm";

const requests = vi.hoisted(() => ({
  cancel: vi.fn(),
  claim: vi.fn(),
  confirm: vi.fn(),
  details: vi.fn(),
  setToken: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  cancelLegacySsoSwitch: requests.cancel,
  claimLegacySsoSession: requests.claim,
  confirmLegacySsoSwitch: requests.confirm,
  getLegacySsoSwitch: requests.details,
  setToken: requests.setToken,
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  useAuth: () => ({ user: { role: "admin" } }),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const Confirm = Route.options.component as ComponentType;
const originalWindow = window;
const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  requests.details.mockResolvedValue({
    confirmationFingerprint: "fingerprint",
    current: { email: "current@example.test", name: "Current Admin" },
    legacy: { email: "legacy@example.test", name: "PDMS account" },
    returnTo: "/admin/users",
    sameUser: false,
  });
  requests.confirm.mockResolvedValue({ returnTo: "/dashboard" });
  requests.cancel.mockResolvedValue({ cancelled: true, returnTo: "/admin" });
  requests.claim.mockResolvedValue("new-sso-token");
  const navigationWindow = Object.create(originalWindow, {
    location: {
      value: { assign, origin: originalWindow.location.origin },
    },
  });
  vi.stubGlobal("window", navigationWindow);
});

afterEach(() => {
  vi.stubGlobal("window", originalWindow);
});

describe("PDMS SSO account confirmation", () => {
  it("uses the server's final destination when the confirmed account is demoted", async () => {
    render(<Confirm />);
    fireEvent.click(
      await screen.findByRole("button", { name: "ยืนยันเปลี่ยนบัญชี" })
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard"));
    expect(requests.confirm).toHaveBeenCalledWith("fingerprint");
    expect(requests.setToken).toHaveBeenCalledWith("new-sso-token");
  });

  it("cancels to the initiating account's server-selected destination", async () => {
    render(<Confirm />);
    fireEvent.click(await screen.findByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin"));
    expect(requests.claim).not.toHaveBeenCalled();
    expect(requests.setToken).not.toHaveBeenCalled();
  });

  it("explains the final Admin guard without claiming or replacing a session", async () => {
    requests.confirm.mockRejectedValue(
      new ApiError(
        409,
        "final_admin_required",
        "At least one enabled Admin is required"
      )
    );
    render(<Confirm />);
    fireEvent.click(
      await screen.findByRole("button", { name: "ยืนยันเปลี่ยนบัญชี" })
    );
    expect(
      await screen.findByText(/ไม่สามารถลดสิทธิ์ผู้ดูแลระบบคนสุดท้ายได้/u)
    ).toBeVisible();
    expect(requests.claim).not.toHaveBeenCalled();
    expect(requests.setToken).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /กลับไปทำงานต่อ/u })).toHaveAttribute(
      "href",
      "/admin"
    );
  });

  it.each([
    "https://attacker.example/admin",
    "/admin/unlisted",
    "/admin?token=secret",
  ])("rejects an unsafe confirmed destination %s", async (returnTo) => {
    requests.confirm.mockResolvedValue({ returnTo });
    render(<Confirm />);
    fireEvent.click(
      await screen.findByRole("button", { name: "ยืนยันเปลี่ยนบัญชี" })
    );
    expect(
      await screen.findByText(/คำขอนี้หมดอายุหรือไม่สามารถดำเนินการได้/u)
    ).toBeVisible();
    expect(requests.claim).not.toHaveBeenCalled();
    expect(requests.setToken).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
