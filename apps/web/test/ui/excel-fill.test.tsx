// oxlint-disable require-await -- HTTP fixtures use fetch's asynchronous contract.
import type * as RouterModule from "@tanstack/react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType, Ref } from "react";
import { useEffect, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorBridgeMessage } from "@/features/onlyoffice/editor-protocol";
import { createDeferred } from "@/lib/form-lifecycle";
import { Route } from "@/routes/forms/$publicId/fill";

const bridge = vi.hoisted(() => ({
  captureWorkbook: vi.fn(),
  onDirtyChange: undefined as ((dirty: boolean) => void) | undefined,
  onMessage: undefined as
    | ((message: EditorBridgeMessage) => Promise<void>)
    | undefined,
}));
const auth = vi.hoisted(() => ({
  commandReady: true,
  user: { email: "user@example.test", id: "user", role: "user" },
}));
const navigation = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  roleFor: () => "user",
  useAuth: () => ({ loading: false, user: auth.user }),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof RouterModule>()),
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/dashboard">{children}</a>
  ),
  useBlocker: () => ({ status: "idle" }),
  useNavigate: () => navigation.navigate,
  useParams: () => ({ publicId: "excel" }),
  useSearch: () => ({ responseId: "response" }),
}));
vi.mock("@/components/onlyoffice-editor", () => ({
  OnlyOfficeEditor: ({
    captureWorkbookRef,
    saveAction,
    saveRequest,
    onCommandReadyChange,
    onDirtyChange,
    openingRevision = 0,
    onBridgeMessage,
  }: {
    captureWorkbookRef?: Ref<() => Promise<unknown>>;
    openingRevision?: number;
    onBridgeMessage: (message: EditorBridgeMessage) => Promise<void>;
    onDirtyChange: (dirty: boolean) => void;
    saveAction: string;
    saveRequest: number;
    onCommandReadyChange: (ready: boolean) => void;
  }) => {
    bridge.onMessage = onBridgeMessage;
    bridge.onDirtyChange = onDirtyChange;
    useImperativeHandle(captureWorkbookRef, () => bridge.captureWorkbook, []);
    useEffect(
      () => onCommandReadyChange(auth.commandReady),
      [onCommandReadyChange]
    );
    return (
      <div
        data-testid="editor"
        data-opening={openingRevision}
        data-action={saveAction}
        data-request={saveRequest}
      />
    );
  },
}));
beforeEach(() => {
  auth.commandReady = true;
  bridge.captureWorkbook.mockReset();
  navigation.navigate.mockReset();
});
const Fill = Route.options.component as ComponentType;
const mount = (exportWorkbook?: (init?: RequestInit) => Promise<Response>) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) =>
      input.includes("/editor-export/") && exportWorkbook
        ? exportWorkbook(init)
        : Response.json(
            init?.method === "POST"
              ? {
                  editorConfigUrl: "/editor-config",
                  fillMethod: "onlyoffice",
                  response: { id: "response" },
                }
              : {
                  form: {
                    documentKind: "xlsx",
                    fillMethod: "onlyoffice",
                    title: "Excel form",
                  },
                }
          )
    )
  );
  return render(<Fill />);
};
describe("Excel response actions", () => {
  it("disables Excel actions until the editor bridge is ready", async () => {
    auth.commandReady = false;
    mount();
    expect(
      await screen.findByRole("button", { name: "ส่งคำตอบ" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "บันทึกฉบับร่าง" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "ดาวน์โหลด Excel" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "ดาวน์โหลด PDF" })).toBeDisabled();
    expect(screen.getByTestId("editor")).toHaveAttribute("data-request", "0");
  });
  it("shows XLSX/PDF exports and a direct draft save action", async () => {
    mount();
    const save = await screen.findByRole("button", { name: "บันทึกฉบับร่าง" });
    expect(
      screen.getByRole("button", { name: "ดาวน์โหลด Excel" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ดาวน์โหลด PDF" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/ใช้แท็บ Form/u)).not.toBeInTheDocument();
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(screen.getByTestId("editor")).toHaveAttribute("data-request", "1")
    );
    expect(screen.getByTestId("editor")).toHaveAttribute(
      "data-action",
      "save-draft"
    );
  });
  it("accepts the keyboard download command before the first Draft save", async () => {
    const pending = createDeferred<never>();
    bridge.captureWorkbook.mockReturnValue(pending.promise);
    mount();
    const excel = await screen.findByRole("button", { name: "ดาวน์โหลด Excel" });
    const pdf = screen.getByRole("button", { name: "ดาวน์โหลด PDF" });
    await waitFor(() => expect(excel).toBeEnabled());
    excel.focus();
    await userEvent.keyboard("{Enter}");

    expect(bridge.captureWorkbook).toHaveBeenCalledOnce();
    expect(screen.getByText("กำลังเตรียมไฟล์ดาวน์โหลด…")).toBeInTheDocument();
    expect(excel).toBeDisabled();
    expect(pdf).toBeDisabled();
    expect(screen.getByRole("button", { name: "บันทึกฉบับร่าง" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ส่งคำตอบ" })).toBeDisabled();
    expect(screen.getByTestId("editor")).toHaveAttribute("data-request", "0");
    await act(async () =>
      pending.reject(new Error("Unable to capture workbook"))
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ดาวน์โหลดไฟล์ไม่สำเร็จ"
    );
    expect(excel).toBeEnabled();
  });
  it.each([
    { action: "save-draft", label: "บันทึกฉบับร่าง" },
    { action: "submit", label: "ส่งคำตอบ" },
  ])(
    "allows $action while the captured workbook is converting to PDF",
    async ({ action, label }) => {
      bridge.captureWorkbook.mockResolvedValue({
        capability: "test-capability",
        snapshotUrl: "https://office.test/snapshot",
      });
      const pendingConversion = createDeferred<Response>();
      const convert = vi.fn(() => pendingConversion.promise);
      mount(convert);

      const pdf = await screen.findByRole("button", { name: "ดาวน์โหลด PDF" });
      await userEvent.click(pdf);
      await waitFor(() => expect(convert).toHaveBeenCalledOnce());
      expect(pdf).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "ดาวน์โหลด Excel" })
      ).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByTestId("editor")).toHaveAttribute("data-request", "1");
      expect(screen.getByTestId("editor")).toHaveAttribute(
        "data-action",
        action
      );

      await act(async () =>
        pendingConversion.resolve(new Response(null, { status: 502 }))
      );
    }
  );
  it.each(["บันทึกแล้วออก", "ทิ้งฉบับร่าง"])(
    "keeps the dirty exit prompt actionable during PDF conversion with %s",
    async (exitAction) => {
      bridge.captureWorkbook.mockResolvedValue({
        capability: "test-capability",
        snapshotUrl: "https://office.test/snapshot",
      });
      const pendingConversion = createDeferred<Response>();
      const convert = vi.fn((_init?: RequestInit) => pendingConversion.promise);
      mount(convert);
      const pdf = await screen.findByRole("button", { name: "ดาวน์โหลด PDF" });
      act(() => bridge.onDirtyChange?.(true));
      await userEvent.click(pdf);
      await waitFor(() => expect(convert).toHaveBeenCalledOnce());
      const signal = convert.mock.calls[0]?.[0]?.signal;

      await userEvent.click(
        screen.getByRole("button", { name: "ออกจากแบบฟอร์ม" })
      );
      expect(
        screen.getByRole("dialog", { name: "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" })
      ).toBeInTheDocument();
      expect(signal?.aborted).toBe(false);
      await userEvent.click(screen.getByRole("button", { name: exitAction }));
      expect(signal?.aborted).toBe(true);
      if (exitAction === "บันทึกแล้วออก") {
        expect(screen.getByTestId("editor")).toHaveAttribute(
          "data-request",
          "1"
        );
        expect(screen.getByTestId("editor")).toHaveAttribute(
          "data-action",
          "save-draft"
        );
        expect(navigation.navigate).not.toHaveBeenCalled();
        await act(async () => {
          await bridge.onMessage?.({
            action: "save-draft",
            bridgeId: "test-bridge",
            operationId: "saved",
            source: "form-bridge",
            status: "completed",
            type: "operation",
          });
        });
      } else {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/responses/response"),
          expect.objectContaining({ method: "DELETE" })
        );
      }
      await waitFor(() =>
        expect(navigation.navigate).toHaveBeenCalledWith({ to: "/dashboard" })
      );
      await act(async () =>
        pendingConversion.resolve(new Response(null, { status: 502 }))
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    }
  );
  it("retries PDF conversion with a fresh capture and keeps unsaved edits", async () => {
    bridge.captureWorkbook
      .mockResolvedValueOnce({
        capability: "test-capability",
        snapshotUrl: "https://office.test/first",
      })
      .mockResolvedValueOnce({
        capability: "test-capability",
        snapshotUrl: "https://office.test/retry",
      });
    const pendingConversion = createDeferred<Response>();
    const convert = vi
      .fn<(init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json({ error: "pdf_conversion_failed" }, { status: 502 })
      )
      .mockReturnValueOnce(pendingConversion.promise);
    mount(convert);
    const pdf = await screen.findByRole("button", { name: "ดาวน์โหลด PDF" });
    act(() => bridge.onDirtyChange?.(true));

    await userEvent.click(pdf);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ดาวน์โหลดไฟล์ไม่สำเร็จ"
    );
    await userEvent.click(pdf);
    await waitFor(() => expect(convert).toHaveBeenCalledTimes(2));
    expect(convert.mock.calls[1]?.[0]?.body).toBe(
      JSON.stringify({ snapshotUrl: "https://office.test/retry" })
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("editor")).toHaveAttribute("data-request", "0");
    expect(
      screen.getByText(/สถานะ: มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก/u)
    ).toBeInTheDocument();
    await act(async () =>
      pendingConversion.resolve(new Response(null, { status: 502 }))
    );
    await userEvent.click(
      screen.getByRole("button", { name: "ออกจากแบบฟอร์ม" })
    );
    expect(
      screen.getByRole("dialog", { name: "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" })
    ).toBeInTheDocument();
  });
  it.each([
    { code: "editor_lease_inactive", status: 409 },
    { code: "invalid_editor_capability", status: 401 },
  ])(
    "retries the captured workbook once after $code",
    async ({ code, status }) => {
      const snapshotUrl = "https://office.test/snapshot";
      const refreshCapability = vi.fn().mockResolvedValue("new-capability");
      bridge.captureWorkbook.mockResolvedValue({
        capability: "old-capability",
        refreshCapability,
        snapshotUrl,
      });
      const convert = vi
        .fn<(init?: RequestInit) => Promise<Response>>()
        .mockImplementation(async () =>
          Response.json({ error: code }, { status })
        );
      mount(convert);

      const pdf = await screen.findByRole("button", { name: "ดาวน์โหลด PDF" });
      await userEvent.click(pdf);
      await screen.findByRole("alert");

      expect(bridge.captureWorkbook).toHaveBeenCalledOnce();
      expect(refreshCapability).toHaveBeenCalledOnce();
      expect(convert).toHaveBeenCalledTimes(2);
      expect(
        convert.mock.calls.map(([request]) => ({
          body: request?.body,
          capability: new Headers(request?.headers).get("X-Editor-Capability"),
        }))
      ).toEqual([
        { body: JSON.stringify({ snapshotUrl }), capability: "old-capability" },
        { body: JSON.stringify({ snapshotUrl }), capability: "new-capability" },
      ]);
      expect(pdf).toBeEnabled();
    }
  );
  it("sends submit through the authenticated editor command bridge", async () => {
    mount();
    const submit = await screen.findByRole("button", { name: "ส่งคำตอบ" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() =>
      expect(screen.getByTestId("editor")).toHaveAttribute(
        "data-action",
        "submit"
      )
    );
    expect(screen.getByTestId("editor")).toHaveAttribute("data-request", "1");
    expect(screen.getByRole("button", { name: "ส่งคำตอบ" })).toBeDisabled();
  });
});

it("starts a new catalog opening only after the existing submit-to-new-entry transition", async () => {
  mount();
  await screen.findByTestId("editor");
  expect(screen.getByTestId("editor")).toHaveAttribute("data-opening", "0");
  await act(async () => {
    await bridge.onMessage?.({
      action: "save-draft",
      bridgeId: "test-bridge",
      operation: { result: { documentKey: "saved-document" } },
      operationId: "saved",
      source: "form-bridge",
      status: "completed",
      type: "operation",
    });
  });
  expect(screen.getByTestId("editor")).toHaveAttribute("data-opening", "0");
  await act(async () => {
    await bridge.onMessage?.({
      action: "submit",
      bridgeId: "test-bridge",
      operation: { result: { submissionId: "immutable-submission" } },
      operationId: "submitted",
      source: "form-bridge",
      status: "completed",
      type: "operation",
    });
  });
  await waitFor(() =>
    expect(screen.getByTestId("editor")).toHaveAttribute("data-opening", "1")
  );
});
