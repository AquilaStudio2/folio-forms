// oxlint-disable require-await avoid-new prefer-await-to-callbacks no-await-in-loop -- Fixtures model asynchronous responses and consecutive editor saves that must settle in order.
import type * as RouterModule from "@tanstack/react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentType, ComponentProps } from "react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OnlyOfficeEditor } from "@/components/onlyoffice-editor";
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
type OnlyOfficeEditorProps = ComponentProps<typeof OnlyOfficeEditor>;
const editor = vi.hoisted(() => ({
  commandReady: true,
  props: null as OnlyOfficeEditorProps | null,
}));
vi.mock("@/components/onlyoffice-editor", () => ({
  OnlyOfficeEditor: (props: OnlyOfficeEditorProps) => {
    editor.props = props;
    useEffect(() => {
      props.onStateChange?.("ready");
      props.onCommandReadyChange?.(editor.commandReady);
    }, [props.onStateChange, props.onCommandReadyChange]);
    return <div data-testid="editor">Current document</div>;
  },
}));
const Editor = Route.options.component as ComponentType;
beforeEach(() => {
  vi.restoreAllMocks();
  editor.props = null;
  editor.commandReady = true;
});
describe("Excel authoring page", () => {
  const documentKind = "xlsx";
  const form = {
    activeDraftCount: 0,
    description: "",
    documentKind,
    fillMethod: "onlyoffice",
    publicId: "form",
    status: "draft",
    title: documentKind.toUpperCase(),
  };
  it("requires a ready plugin before sending Excel save or publish commands", async () => {
    editor.commandReady = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ editorConfigUrl: "/editor-config", form })
      )
    );
    render(<Editor />);
    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "บันทึกแบบร่าง" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "เผยแพร่" })).toBeDisabled();
    expect(editor.props?.saveRequest).toBe(0);
  });

  it("reloads the editor only after the plugin confirms the template save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ editorConfigUrl: "/editor-config", form })
      )
    );
    render(<Editor />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "บันทึกแบบร่าง" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแบบร่าง" }));
    await act(async () => {
      await editor.props?.onBridgeMessage?.({
        action: "save-template",
        bridgeId: "editor",
        source: "form-bridge",
        status: "processing",
        type: "operation",
      });
    });
    expect(editor.props?.revision).toBe(0);
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    await act(async () => {
      await editor.props?.onBridgeMessage?.({
        action: "save-template",
        bridgeId: "editor",
        source: "form-bridge",
        status: "completed",
        type: "operation",
      });
    });
    expect(editor.props?.revision).toBe(1);
    expect(screen.getByText("บันทึกแบบร่างเรียบร้อยแล้ว")).toBeInTheDocument();
  });

  it("surfaces failed operation details and keeps the current document available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ editorConfigUrl: "/editor-config", form })
      )
    );
    render(<Editor />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "บันทึกแบบร่าง" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแบบร่าง" }));
    expect(editor.props?.saveAction).toBe("save-template");
    expect(editor.props?.saveRequest).toBe(1);
    expect(editor.props?.revision).toBe(0);
    expect(screen.getByRole("button", { name: /กำลังบันทึก/u })).toBeDisabled();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(([, init]) => !init?.method || init.method === "GET")
    ).toBe(true);
    await act(async () => {
      await editor.props?.onBridgeMessage?.({
        action: "save-template",
        bridgeId: "editor",
        error: "Choose a valid field range on Sheet1.",
        source: "form-bridge",
        status: "failed",
        type: "operation",
      });
    });
    expect(editor.props?.revision).toBe(0);
    expect(
      await screen.findByText("Choose a valid field range on Sheet1.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "บันทึกแบบร่าง" })).toBeEnabled()
    );
  });
  it("keeps the Excel revision across confirmed placement, manual save and deletion, with remount as the legacy fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ editorConfigUrl: "/editor-config", form })
      )
    );
    render(<Editor />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "บันทึกแบบร่าง" })).toBeEnabled()
    );
    const originalEditor = screen.getByTestId("editor");
    for (const operationId of [
      "placement-1",
      "manual-save-1",
      "delete-field-1",
    ]) {
      await act(async () => {
        await editor.props?.onBridgeMessage?.({
          action: "save-template",
          bridgeId: "editor",
          operationId,
          source: "form-bridge",
          status: "pending",
          type: "operation",
        });
      });
      expect(screen.getByRole("button", { name: "บันทึกแบบร่าง" })).toBeDisabled();
      await act(async () => {
        await editor.props?.onBridgeMessage?.({
          action: "save-template",
          bridgeId: "editor",
          operation: {
            result: {
              documentKey: "same-document",
              editorSessionPreserved: true,
            },
          },
          operationId,
          source: "form-bridge",
          status: "completed",
          type: "operation",
        });
      });
      expect(editor.props?.revision).toBe(0);
      expect(screen.getByTestId("editor")).toBe(originalEditor);
      expect(screen.getByRole("button", { name: "บันทึกแบบร่าง" })).toBeEnabled();
    }
    await act(async () => {
      await editor.props?.onBridgeMessage?.({
        action: "save-template",
        bridgeId: "editor",
        operationId: "normal-save",
        source: "form-bridge",
        status: "completed",
        type: "operation",
      });
    });
    expect(editor.props?.revision).toBe(1);
  });
  it("keeps a completed publication immutable when refreshing its details fails", async () => {
    let published = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
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
    expect(editor.props?.saveAction).toBe("publish");
    expect(editor.props?.saveRequest).toBe(1);
    published = true;
    await act(async () => {
      await editor.props?.onBridgeMessage?.({
        action: "publish",
        bridgeId: "editor",
        source: "form-bridge",
        status: "completed",
        type: "operation",
      });
    });
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

describe("DOCX keeps the original direct authoring flow", () => {
  const form = {
    activeDraftCount: 0,
    description: "",
    documentKind: "docx",
    fillMethod: "onlyoffice",
    publicId: "form",
    status: "draft",
    title: "Word",
  };
  const config = {
    bridge: {
      capabilities: { publish: "fresh-publish", "save-template": "fresh-save" },
    },
    config: { document: { key: "fresh-document" } },
  };

  it.each(["save", "publish"])(
    "%s uses fresh config, original body and HTTP polling without a plugin",
    async (action) => {
      editor.commandReady = false;
      let finishPoll: ((value: Response) => void) | undefined;
      let completed = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/editor-config")) {
          return Response.json(config);
        }
        if (path.endsWith(`/forms/form/${action}`)) {
          return Response.json({ operationId: action });
        }
        if (path.endsWith(`/operations/${action}`)) {
          return new Promise<Response>((resolve) => {
            finishPoll = (value) => {
              completed = true;
              resolve(value);
            };
          });
        }
        return Response.json({
          editorConfigUrl: "/editor-config",
          form: {
            ...form,
            status: completed && action === "publish" ? "published" : "draft",
          },
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Editor />);
      const label = action === "save" ? "บันทึกแบบร่าง" : "เผยแพร่";
      await waitFor(() =>
        expect(screen.getByRole("button", { name: label })).toBeEnabled()
      );
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => expect(finishPoll).toBeTypeOf("function"));
      const request = vi
        .mocked(fetch)
        .mock.calls.find(([path]) =>
          String(path).endsWith(`/forms/form/${action}`)
        );
      expect(request?.[1]?.method).toBe("POST");
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({
        documentKey: "fresh-document",
      });
      expect(
        new Headers(request?.[1]?.headers).get("x-editor-capability")
      ).toBe(action === "save" ? "fresh-save" : "fresh-publish");
      expect(editor.props?.onCommandReadyChange).toBeUndefined();
      expect(editor.props?.saveRequest).toBeUndefined();
      expect(editor.props?.saveAction).toBeUndefined();
      expect(editor.props?.revision).toBe(0);
      await act(async () => {
        finishPoll?.(Response.json({ id: action, status: "completed" }));
      });
      expect(
        await screen.findByText(
          action === "save"
            ? "บันทึกแบบร่างเรียบร้อยแล้ว"
            : "เผยแพร่แบบฟอร์มแล้ว คำตอบใหม่จะใช้เอกสารฉบับนี้"
        )
      ).toBeInTheDocument();
      if (action === "save") {
        expect(editor.props?.revision).toBe(1);
      } else {
        expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
      }
    }
  );

  it.each([
    ["save", "request"],
    ["publish", "request"],
    ["save", "operation"],
    ["publish", "operation"],
  ])(
    "%s preserves %s failure details, the open document and retry",
    async (action, failureStage) => {
      let failNext = true;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const path = String(input);
          if (path.endsWith("/editor-config")) {
            return Response.json(config);
          }
          if (path.endsWith(`/forms/form/${action}`)) {
            if (failNext && failureStage === "request") {
              failNext = false;
              return Response.json(
                {
                  error: "invalid_template",
                  message: "ชื่อรหัส Field ซ้ำ: full_name",
                },
                { status: 422 }
              );
            }
            return Response.json({ operationId: action });
          }
          if (path.endsWith(`/operations/${action}`)) {
            if (failNext) {
              failNext = false;
              return Response.json({
                operation: {
                  error: "invalid_template",
                  errorMessage: "ชื่อรหัส Field ซ้ำ: full_name",
                  id: action,
                  status: "failed",
                },
              });
            }
            return Response.json({ id: action, status: "completed" });
          }
          return Response.json({ editorConfigUrl: "/editor-config", form });
        })
      );
      render(<Editor />);
      const label = action === "save" ? "บันทึกแบบร่าง" : "เผยแพร่";
      await waitFor(() =>
        expect(screen.getByRole("button", { name: label })).toBeEnabled()
      );
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(
        await screen.findByText("ชื่อรหัส Field ซ้ำ: full_name")
      ).toBeInTheDocument();
      expect(screen.getByTestId("editor")).toBeInTheDocument();
      expect(editor.props?.revision).toBe(0);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: label })).toBeEnabled()
      );
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(
        await screen.findByText(
          action === "save"
            ? "บันทึกแบบร่างเรียบร้อยแล้ว"
            : "เผยแพร่แบบฟอร์มแล้ว คำตอบใหม่จะใช้เอกสารฉบับนี้"
        )
      ).toBeInTheDocument();
    }
  );
});
