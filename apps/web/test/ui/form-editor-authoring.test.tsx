// oxlint-disable require-await avoid-new prefer-await-to-callbacks -- HTTP fixtures model asynchronous responses and abort events.
import type * as RouterModule from "@tanstack/react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentType } from "react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { waitForOperation } from "@/lib/api";
import { Route } from "@/routes/admin/forms/$formId/index";

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof RouterModule>()),
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/admin">{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ formId: "form" }),
}));
vi.mock("@/components/onlyoffice-editor", () => ({
  OnlyOfficeEditor: ({
    onStateChange,
  }: {
    onStateChange: (state: string) => void;
  }) => {
    useEffect(() => onStateChange("ready"), [onStateChange]);
    return <div data-testid="editor">Current document</div>;
  },
}));
const Editor = Route.options.component as ComponentType;
const form = {
  activeDraftCount: 0,
  description: "",
  documentKind: "xlsx",
  fillMethod: "onlyoffice",
  publicId: "form",
  status: "draft",
  title: "Excel",
};
const config = {
  bridge: { capabilities: { publish: "publish", "save-template": "save" } },
  config: { document: { key: "document" } },
};
beforeEach(() => vi.restoreAllMocks());
describe("Excel authoring page", () => {
  it("surfaces failed operation details and keeps the current document available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const path = String(input);
        if (path.endsWith("/editor-config")) {
          return Response.json(config);
        }
        if (path.endsWith("/forms/form/save")) {
          return Response.json({ operationId: "save" });
        }
        if (path.endsWith("/operations/save")) {
          return Response.json({
            error: "invalid_template",
            errorMessage: "Choose a valid field range on Sheet1.",
            id: "save",
            status: "failed",
          });
        }
        return Response.json({ editorConfigUrl: "/editor-config", form });
      })
    );
    render(<Editor />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "บันทึกแบบร่าง" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแบบร่าง" }));
    expect(
      await screen.findByText("Choose a valid field range on Sheet1.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "บันทึกแบบร่าง" })).toBeEnabled()
    );
  });
  it("keeps a completed publication immutable when refreshing its details fails", async () => {
    let published = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const path = String(input);
        if (path.endsWith("/editor-config")) {
          return Response.json(config);
        }
        if (path.endsWith("/forms/form/publish")) {
          published = true;
          return Response.json({ operationId: "publish" });
        }
        if (path.endsWith("/operations/publish")) {
          return Response.json({ id: "publish", status: "completed" });
        }
        if (published) {
          return Response.json(
            {
              code: "invalid_template",
              message: "The DOCX package is incomplete",
            },
            { status: 422 }
          );
        }
        return Response.json({ editorConfigUrl: "/editor-config", form });
      })
    );
    render(<Editor />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "เผยแพร่" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่" }));
    expect(
      await screen.findByText(
        "เผยแพร่แบบฟอร์มสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณาโหลดหน้าใหม่เพื่อตรวจสอบ"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("เผยแพร่แล้ว")).toBeInTheDocument();
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เผยแพร่" })).toBeDisabled();
    expect(
      screen.queryByText("เผยแพร่แบบฟอร์มแล้ว คำตอบใหม่จะใช้เอกสารฉบับนี้")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("The DOCX package is incomplete")
    ).not.toBeInTheDocument();
  });
  it("bounds a stalled operation status request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          })
      )
    );
    const result = waitForOperation("stalled").catch((error: unknown) => error);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(await result).toMatchObject({ code: "request_timeout" });
  });
});
