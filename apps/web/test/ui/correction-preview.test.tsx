import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SESSION_KEY } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

afterEach(() => window.history.replaceState(null, "", "/"));

it.each(["none", "replacement", "removal", "candidate", "ordinary"] as const)(
  "Correction completion preserves a late %s until an explicit exit decision",
  async (lateChange) => {
    const responseId = "11111111-1111-4111-8111-111111111111";
    const path = `/admin/results/${responseId}/correction`;
    localStorage.setItem(SESSION_KEY, "synthetic-admin-session");
    const openings: string[] = [];
    let documentRevision = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/session") {
        return Promise.resolve(
          Response.json({
            session: {
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            },
            user: {
              email: "admin@example.test",
              id: "admin",
              mustChangePassword: false,
              role: "admin",
            },
          })
        );
      }
      if (url.pathname.endsWith("/correction/editor-config")) {
        openings.push(url.searchParams.get("pdmsOpeningId") ?? "");
        return Promise.resolve(
          Response.json({
            bridge: {
              capabilities: {
                "save-correction": "final-capability",
                "save-correction-workspace": "workspace-capability",
              },
              documentKey: `workspace-${documentRevision}`,
              id: "correction-bridge",
              pluginOrigin: window.location.origin,
              uploadPoc: {
                action: "correction",
                bridgeId: "correction-bridge",
                documentKey: `workspace-${documentRevision}`,
                scopeIdentity: "admin/correction/response",
                spreadsheetBindings: {
                  fields: [
                    { id: "folio_note", key: "notes", type: "text" },
                    {
                      attachment: { category: "หลักฐาน" },
                      id: "folio_proof",
                      key: "proof",
                      type: "text",
                    },
                  ],
                  table: null,
                  version: 1,
                },
              },
            },
            config: {
              document: { key: `native-workspace-${documentRevision}` },
              documentType: "cell",
              editorConfig: { mode: "edit" },
            },
          })
        );
      }
      return Promise.resolve(Response.json({ enabled: false }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("DocsAPI", {
      DocEditor: class {
        constructor(
          id: string,
          options: { events: { onDocumentReady: () => void } }
        ) {
          const frame = document.createElement("iframe");
          frame.title = "Correction native fixture";
          document.querySelector(`#${id}`)?.replaceWith(frame);
          options.events.onDocumentReady();
        }
        destroyEditor = vi.fn();
      },
    });
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: [path] }),
      routeTree,
    });
    await router.load();
    render(<RouterProvider router={router} />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "เหตุผลการแก้ไข" }),
      { target: { value: "Reason typed before selecting" } }
    );
    const office = (await screen.findByTitle(
      "Correction native fixture"
    )) as HTMLIFrameElement;
    const plugin = document.createElement("iframe");
    office.contentDocument?.body.append(plugin);
    const source = plugin.contentWindow;
    if (!source) {
      throw new Error("Plugin fixture window missing");
    }
    const send = (message: Record<string, unknown>) =>
      act(() =>
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              bridgeId: "correction-bridge",
              source: "form-bridge",
              ...message,
            },
            origin: window.location.origin,
            source,
          })
        )
      );
    send({ type: "bridge-ready" });
    const exitDialog = document.querySelector("dialog");
    if (!exitDialog) {
      throw new Error("Correction exit dialog missing");
    }
    // JSDOM omits native dialog methods; browser acceptance verifies modality and keyboard behavior.
    exitDialog.showModal = () => {
      exitDialog.open = true;
    };
    exitDialog.close = () => {
      exitDialog.open = false;
    };
    fireEvent.click(screen.getByRole("button", { exact: true, name: "ยกเลิก" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { exact: true, name: "อยู่หน้านี้ต่อ" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(router.state.location.pathname).toBe(path);
    expect(screen.getByTitle("Correction native fixture")).toBe(office);
    const parentReplies = vi.spyOn(source, "postMessage");
    const check = {
      action: "save-correction-workspace",
      bridgeId: "correction-bridge",
      documentKey: "workspace-0",
      requestId: "preview-pending-file-check",
      scopeIdentity: "admin/correction/response",
      source: "folio-upload-poc",
      type: "pending-file-check",
    };
    const pendingCheck = (changes: Record<string, unknown> = {}) =>
      act(() =>
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ...check, ...changes },
            origin: window.location.origin,
            source,
          })
        )
      );
    pendingCheck();
    await waitFor(() =>
      expect(parentReplies).toHaveBeenCalledWith(
        expect.objectContaining({
          allowed: true,
          hasPending: false,
          requestId: check.requestId,
          type: "pending-file-result",
        }),
        window.location.origin
      )
    );
    parentReplies.mockClear();
    pendingCheck({ documentKey: "foreign-workspace" });
    expect(parentReplies).not.toHaveBeenCalled();
    pendingCheck({
      bindingId: "folio_note",
      file: new File(["pending"], "proof.txt"),
      rowIndex: null,
      tag: "notes",
      type: "pending-file-set",
    });
    await waitFor(() =>
      expect(parentReplies).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Admin"),
          unavailable: true,
        }),
        window.location.origin
      )
    );
    send({
      action: "save-correction-workspace",
      operationId: "preview-1",
      status: "pending",
      type: "operation",
    });
    expect(screen.getByRole("textbox", { name: "เหตุผลการแก้ไข" })).toBeDisabled();
    expect(office.closest("[inert]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { exact: true, name: "ยกเลิก" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "ทิ้งการเปลี่ยนแปลงและออก" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { exact: true, name: "อยู่หน้านี้ต่อ" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    send({
      action: "save-correction-workspace",
      operationId: "preview-1",
      status: "failed",
      attachmentCommitUnresolved: true,
      error: "Original request outcome unavailable",
      type: "operation",
    });
    expect(screen.getByRole("button", { name: "บันทึก Correction" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "ตรวจผลคำขอเดิม" })).toBeEnabled();
    expect(office.closest("[inert]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ตรวจผลคำขอเดิม" }));
    send({
      action: "save-correction-workspace",
      operationId: "preview-1",
      status: "pending",
      type: "operation",
    });
    documentRevision = 1;
    send({
      action: "save-correction-workspace",
      operation: {
        result: { documentKey: "workspace-1", workspaceSaved: true },
      },
      operationId: "preview-1",
      status: "completed",
      type: "operation",
    });
    await waitFor(() => expect(openings).toHaveLength(2));
    expect(openings[0]).not.toBe("");
    expect(openings[1]).not.toBe(openings[0]);
    expect(screen.getByRole("textbox", { name: "เหตุผลการแก้ไข" })).toHaveValue(
      "Reason typed before selecting"
    );
    expect(router.state.location.pathname).toBe(path);
    expect(
      screen.getByRole("button", { name: "บันทึก Correction" })
    ).toBeEnabled();
    await waitFor(() => {
      expect(screen.getByTitle("Correction native fixture")).not.toBe(office);
    });
    const reloaded = screen.getByTitle(
      "Correction native fixture"
    ) as HTMLIFrameElement;
    const currentPlugin = document.createElement("iframe");
    reloaded.contentDocument?.body.append(currentPlugin);
    const currentSource = currentPlugin.contentWindow;
    if (!currentSource) {
      throw new Error("Reloaded plugin window missing");
    }
    const commands = vi.spyOn(currentSource, "postMessage");
    const sendCurrent = (message: Record<string, unknown>) =>
      act(() =>
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              bridgeId: "correction-bridge",
              source: "form-bridge",
              ...message,
            },
            origin: window.location.origin,
            source: currentSource,
          })
        )
      );
    sendCurrent({ type: "bridge-ready" });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Correction" }));
    await waitFor(() =>
      expect(commands).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "save-correction",
          reason: "Reason typed before selecting",
          type: "run-action",
        }),
        window.location.origin
      )
    );
    expect(screen.getByRole("textbox", { name: "เหตุผลการแก้ไข" })).toBeDisabled();
    const lateFile = new File(
      ["newer selection outside accepted snapshot"],
      "newer.BIN"
    );
    const lateSlot = {
      action: "correction",
      bindingId: "folio_proof",
      bridgeId: "correction-bridge",
      documentKey: "workspace-1",
      requestId: "late-selection",
      rowIndex: null,
      scopeIdentity: "admin/correction/response",
      source: "folio-upload-poc",
      tag: "proof",
    };
    const sendLate = (changes: Record<string, unknown>) =>
      act(() =>
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ...lateSlot, ...changes },
            origin: window.location.origin,
            source: currentSource,
          })
        )
      );
    if (lateChange === "ordinary") {
      sendCurrent({ type: "dirty-state", dirty: true });
    } else if (lateChange !== "none") {
      sendLate({
        dirty: true,
        file: lateFile,
        type: lateChange === "candidate"
          ? "pending-file-candidate"
          : lateChange === "replacement"
            ? "pending-file-set"
            : "pending-file-remove",
      });
    }
    sendCurrent({
      action: "save-correction",
      operation: { result: { revision: 1 } },
      operationId: "reasoned-final",
      status: "completed",
      type: "operation",
    });
    if (lateChange !== "none") {
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "บันทึก Correction" })
        ).toBeDisabled()
      );
      expect(router.state.location.pathname).toBe(path);
      expect(screen.getByTitle("Correction native fixture")).toBe(reloaded);
      sendCurrent({
        action: "save-correction-workspace",
        operation: { result: { documentKey: "retired-workspace" } },
        operationId: "late-retired-workspace",
        status: "completed",
        type: "operation",
      });
      sendCurrent({ type: "dirty-state", dirty: false });
      expect(screen.getByTitle("Correction native fixture")).toBe(reloaded);
      expect(openings).toHaveLength(2);
      expect(screen.getByRole("button", { name: "บันทึก Correction" })).toBeDisabled();
      sendLate({ requestId: "read-late-selection", type: "pending-file-get" });
      await waitFor(() =>
        expect(commands).toHaveBeenCalledWith(
          expect.objectContaining({
            filename: lateChange === "replacement" ? lateFile.name : null,
            removal: lateChange === "removal",
            requestId: "read-late-selection",
            size: lateChange === "replacement" ? lateFile.size : null,
          }),
          window.location.origin
        )
      );
      fireEvent.click(
        screen.getByRole("button", { exact: true, name: "ยกเลิก" })
      );
      expect(await screen.findByRole("dialog")).toBeVisible();
      fireEvent.click(
        screen.getByRole("button", { exact: true, name: "อยู่หน้านี้ต่อ" })
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
      expect(screen.getByTitle("Correction native fixture")).toBe(reloaded);
      fireEvent.click(
        screen.getByRole("button", { exact: true, name: "ยกเลิก" })
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "ทิ้งการเปลี่ยนแปลงและออก" })
      );
    }
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/admin/results/${responseId}`
      )
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  }
);
