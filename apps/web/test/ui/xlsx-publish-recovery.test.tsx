import type * as Router from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import {
  rememberXlsxPublishCheckpoint,
  xlsxPublishCheckpointKey,
} from "@/features/admin-forms/xlsx-publish-recovery";
import { clearToken, setToken } from "@/lib/api";
import { Route } from "@/routes/admin/forms/$formId/index";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "original-admin", role: "admin" } }),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof Router>()),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
  useParams: () => ({ formId: "form" }),
}));

const scopeIdentity = JSON.stringify(["original-admin", "form", "template"]);
const storageKey = xlsxPublishCheckpointKey(scopeIdentity);
const proof = { checkpoint: crypto.randomUUID(), leaseId: crypto.randomUUID() };

afterEach(() => {
  clearToken();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it("recovers the exact Publish on the immutable page with bearer auth, retaining proof until terminal", async () => {
  const terminal = {
    action: "publish",
    current: { bindingRevision: 1, documentKey: "draft-key" },
    operationId: crypto.randomUUID(),
    result: { documentKey: "published-key", publicId: "form", version: 1 },
    status: "completed",
  };
  const recover = vi
    .fn<(options: RequestInit) => Response>()
    .mockReturnValueOnce(Response.json({ ...terminal, status: "processing" }))
    .mockReturnValueOnce(Response.json(terminal));
  const fetch = vi.fn((url: string, options: RequestInit) => {
    if (url.endsWith("/xlsx-draft/recover")) {
      return recover(options);
    }
    if (url.endsWith("/api/admin/forms/form")) {
      return Response.json({
        editorConfigUrl: "/must-not-open-editor",
        form: {
          description: "",
          documentKind: "xlsx",
          fillMethod: "office",
          status: "published",
          title: "Immutable Excel form",
        },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  setToken("new-admin-session");
  rememberXlsxPublishCheckpoint(
    {
      action: "publish",
      bridgeId: "bridge",
      draftCheckpoint: proof.checkpoint,
      requestId: "capability-1",
      source: "form-bridge",
      type: "capability-request",
    },
    {
      action: "template-edit",
      bridgeId: "bridge",
      documentKey: "draft-key",
      scopeIdentity,
      spreadsheetBindings: {},
    },
    proof.leaseId
  );
  const Page = Route.options.component;
  if (!Page) {
    throw new Error("Missing Admin form page");
  }
  render(<Page />);
  expect(await screen.findByText(/แบบฟอร์มนี้เผยแพร่แล้ว/u)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "ตรวจผลเผยแพร่รอบเดิม" }));
  expect(await screen.findByText(/ยังยืนยันผลเผยแพร่รอบเดิมไม่ได้/u)).toBeVisible();
  expect(sessionStorage.getItem(storageKey)).toBe(JSON.stringify(proof));
  fireEvent.click(screen.getByRole("button", { name: "ตรวจผลเผยแพร่รอบเดิม" }));
  expect(await screen.findByText("ยืนยันว่าเผยแพร่รอบเดิมสำเร็จแล้ว")).toBeVisible();
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "ตรวจผลเผยแพร่รอบเดิม" })
  ).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(3);
  for (const [options] of recover.mock.calls) {
    const headers = new Headers(options.headers);
    expect(headers.get("Authorization")).toBe("Bearer new-admin-session");
    expect(headers.has("X-Editor-Capability")).toBe(false);
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify(proof));
  }
});
