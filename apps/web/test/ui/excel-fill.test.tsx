// oxlint-disable require-await -- HTTP fixtures use fetch's asynchronous contract.
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

import type { EditorBridgeMessage } from "@/features/onlyoffice/editor-protocol";
import { Route } from "@/routes/forms/$publicId/fill";

const bridge = vi.hoisted(() => ({
  onMessage: undefined as
    | ((message: EditorBridgeMessage) => Promise<void>)
    | undefined,
}));
const auth = vi.hoisted(() => ({
  commandReady: true,
  user: { email: "user@example.test", id: "user", role: "user" },
}));
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
  useNavigate: () => vi.fn(),
  useParams: () => ({ publicId: "excel" }),
  useSearch: () => ({ responseId: "response" }),
}));
vi.mock("@/components/onlyoffice-editor", () => ({
  OnlyOfficeEditor: ({
    saveAction,
    saveRequest,
    onCommandReadyChange,
    openingRevision = 0,
    onBridgeMessage,
  }: {
    openingRevision?: number;
    onBridgeMessage: (message: EditorBridgeMessage) => Promise<void>;
    saveAction: string;
    saveRequest: number;
    onCommandReadyChange: (ready: boolean) => void;
  }) => {
    bridge.onMessage = onBridgeMessage;
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
});
const Fill = Route.options.component as ComponentType;
const mount = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input, init) =>
      Response.json(
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
      screen.getByRole("button", { name: "บันทึกและดาวน์โหลด XLSX" })
    ).toBeDisabled();
    expect(screen.getByTestId("editor")).toHaveAttribute("data-request", "0");
  });
  it("shows XLSX/PDF exports and a direct draft save action", async () => {
    mount();
    const save = await screen.findByRole("button", { name: "บันทึกฉบับร่าง" });
    expect(
      screen.getByRole("button", { name: "บันทึกและดาวน์โหลด XLSX" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "บันทึกและดาวน์โหลด PDF" })
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
