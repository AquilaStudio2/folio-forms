// oxlint-disable max-classes-per-file -- Each native-editor lifecycle fixture implements the SDK constructor.
import { act, render, screen, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnlyOfficeEditor } from "@/components/onlyoffice-editor";
import type { CaptureWorkbook } from "@/features/onlyoffice/editor-protocol";
import type * as ApiModule from "@/lib/api";
import { ApiError } from "@/lib/api";
import { createDeferred } from "@/lib/form-lifecycle";

const transport = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  postForm: vi.fn(),
  remove: vi.fn(),
  wait: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiDelete: transport.remove,
  apiGet: transport.get,
  apiPost: transport.post,
  apiPostFormData: transport.postForm,
  waitForOperation: transport.wait,
}));
const config = () => ({
  bridge: {
    capabilities: { "configure-fields": "initial-cap" },
    documentKey: "document",
    id: "editor-bridge",
    lease: {
      expiresAt: new Date(Date.now() + 90_000).toISOString(),
      id: "editor-lease",
      releaseUrl: "/api/editor-leases/editor-lease",
      renewUrl: "/api/editor-leases/editor-lease/renew",
    },
    pluginOrigin: window.location.origin,
  },
  config: {
    document: { key: "native-document" },
    editorConfig: { mode: "edit" },
  },
});
const exportConfig = (documentKey: string, leaseId: string) => ({
  ...config(),
  bridge: {
    ...config().bridge,
    capabilities: { "export-workbook": `capability-${leaseId}` },
    documentKey,
    lease: {
      expiresAt: new Date(Date.now() + 90_000).toISOString(),
      id: leaseId,
      releaseUrl: `/api/editor-leases/${leaseId}`,
      renewUrl: `/api/editor-leases/${leaseId}/renew`,
    },
  },
  config: { document: { key: `native-${documentKey}` }, documentType: "cell" },
});
let documentStateChanged: ((event: { data: boolean }) => void) | undefined;
beforeEach(() => {
  sessionStorage.clear();
  transport.get.mockReset().mockResolvedValue(config());
  transport.post.mockReset();
  transport.postForm.mockReset();
  transport.remove.mockReset();
  transport.wait.mockReset();
  vi.stubGlobal("DocsAPI", {
    DocEditor: class {
      constructor(
        elementId: string,
        options: {
          events: {
            onDocumentReady: () => void;
            onDocumentStateChange: (event: { data: boolean }) => void;
          };
        }
      ) {
        const placeholder = document.querySelector(`#${elementId}`);
        if (!placeholder) {
          throw new Error("Editor fixture placeholder missing");
        }
        const frame = document.createElement("iframe");
        frame.title = "Office sandbox";
        placeholder.replaceWith(frame);
        documentStateChanged = options.events.onDocumentStateChange;
        options.events.onDocumentReady();
      }
      destroyEditor = vi.fn();
    },
  });
});
const pluginFrame = (office: HTMLIFrameElement) => {
  const body = office.contentDocument?.body;
  if (!body) {
    throw new Error("Editor fixture document missing");
  }
  const plugin = document.createElement("iframe");
  body.append(plugin);
  const source = plugin.contentWindow;
  if (!source) {
    throw new Error("Plugin fixture window missing");
  }
  return { plugin, send: vi.spyOn(source, "postMessage"), source };
};
const send = (
  source: Window,
  message: Record<string, unknown>,
  origin = window.location.origin
) => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { bridgeId: "editor-bridge", source: "form-bridge", ...message },
        origin,
        source,
      })
    );
  });
};
const captureSnapshot = (
  capture: CaptureWorkbook,
  plugin: ReturnType<typeof pluginFrame>,
  snapshotUrl: string
) => {
  const result = capture();
  const request = plugin.send.mock.lastCall?.[0];
  expect(request).toEqual(
    expect.objectContaining({ type: "capture-workbook" })
  );
  send(plugin.source, {
    requestId: request.requestId,
    snapshotUrl,
    type: "workbook-capture",
  });
  return result;
};
it("shows saved attachment routing pending without blocking the editor", async () => {
  transport.get.mockResolvedValue({
    ...config(),
    attachmentRoutingPending: true,
  });

  render(<OnlyOfficeEditor configUrl="/editor-config" title="Excel" />);

  const notice = await screen.findByText(/ไฟล์แนบที่บันทึกไว้ยังอยู่ที่ปลายทางเดิม/u);
  expect(notice).toHaveAttribute("role", "status");
  const office = await screen.findByTitle("Office sandbox");
  expect(office.closest("[inert]")).toBeNull();
});

describe("ONLYOFFICE plugin reconnect", () => {
  it("reuses the open workbook and adopts a reacquired lease for later downloads", async () => {
    transport.get
      .mockResolvedValueOnce(exportConfig("document", "initial"))
      .mockResolvedValueOnce(exportConfig("document", "reacquired"));
    const capture = createRef<CaptureWorkbook>();
    const view = render(
      <OnlyOfficeEditor
        captureWorkbookRef={capture}
        configUrl="/editor-config"
        title="Excel"
      />
    );
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const plugin = pluginFrame(office);
    send(plugin.source, { type: "bridge-ready" });
    if (!capture.current) {
      throw new Error("Workbook capture is unavailable");
    }

    const snapshot = await captureSnapshot(
      capture.current,
      plugin,
      "https://office.test/snapshot"
    );
    expect(snapshot.capability).toBe("capability-initial");
    expect(transport.get).toHaveBeenCalledOnce();
    expect(await snapshot.refreshCapability(new AbortController().signal)).toBe(
      "capability-reacquired"
    );
    expect(screen.getByTitle("Office sandbox")).toBe(office);
    const nextSnapshot = await captureSnapshot(
      capture.current,
      plugin,
      "https://office.test/next-snapshot"
    );
    expect(nextSnapshot.capability).toBe("capability-reacquired");
    expect(transport.get).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(transport.remove).toHaveBeenCalledWith(
      "/api/editor-leases/reacquired",
      undefined,
      { keepalive: true }
    );
  });
  it("rejects export renewal against a different canonical revision even when the native cache key is unchanged", async () => {
    const initial = {
      ...exportConfig("opaque-native-opening", "lease"),
      bridge: {
        ...exportConfig("opaque-native-opening", "lease").bridge,
        documentKey: "canonical-one",
      },
    };
    const replaced = {
      ...initial,
      bridge: { ...initial.bridge, documentKey: "canonical-two" },
    };
    transport.get.mockResolvedValueOnce(initial).mockResolvedValue(replaced);
    const capture = createRef<CaptureWorkbook>();
    render(
      <OnlyOfficeEditor
        captureWorkbookRef={capture}
        configUrl="/editor-config"
        title="Canonical export"
      />
    );
    const plugin = pluginFrame(
      (await screen.findByTitle("Office sandbox")) as HTMLIFrameElement
    );
    send(plugin.source, { type: "bridge-ready" });
    if (!capture.current) {
      throw new Error("Workbook capture is unavailable");
    }
    const snapshot = await captureSnapshot(
      capture.current,
      plugin,
      "https://office.test/snapshot"
    );
    await expect(
      snapshot.refreshCapability(new AbortController().signal)
    ).rejects.toThrow("session has changed");
    expect(transport.postForm).not.toHaveBeenCalled();
  });
  it("marks Excel changes dirty until Folio confirms its saved document", async () => {
    transport.get.mockResolvedValue({
      ...config(),
      config: { ...config().config, documentType: "cell" },
    });
    const dirty = vi.fn();
    render(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Excel"
        onDirtyChange={dirty}
      />
    );
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const plugin = pluginFrame(office);
    send(plugin.source, { type: "bridge-ready" });

    act(() => documentStateChanged?.({ data: true }));
    expect(dirty).toHaveBeenLastCalledWith(true);
    act(() => documentStateChanged?.({ data: false }));
    expect(dirty.mock.calls).toEqual([[true]]);

    send(plugin.source, { dirty: false, type: "dirty-state" });
    expect(dirty).toHaveBeenLastCalledWith(false);
    act(() => documentStateChanged?.({ data: true }));
    expect(dirty.mock.calls).toEqual([[true], [false], [true]]);
  });
  it.each([
    { documentType: "word", readOnly: false },
    { documentType: "cell", readOnly: true },
  ])(
    "keeps native save events separate from dirty notifications for $documentType readOnly=$readOnly",
    async ({ documentType, readOnly }) => {
      transport.get.mockResolvedValue({
        ...config(),
        bridge: readOnly ? undefined : config().bridge,
        config: { ...config().config, documentType },
      });
      const dirty = vi.fn();
      render(
        <OnlyOfficeEditor
          configUrl="/editor-config"
          title="Editor"
          onDirtyChange={dirty}
          readOnly={readOnly}
        />
      );
      await screen.findByTitle("Office sandbox");
      act(() => documentStateChanged?.({ data: true }));
      act(() => documentStateChanged?.({ data: false }));
      expect(dirty).not.toHaveBeenCalled();
    }
  );
  it("tracks native DOCX changes for Admin editing without clearing them on Office autosave", async () => {
    const dirty = vi.fn();
    render(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Template"
        onDirtyChange={dirty}
        trackNativeDirty
      />
    );
    await screen.findByTitle("Office sandbox");
    act(() => documentStateChanged?.({ data: true }));
    act(() => documentStateChanged?.({ data: false }));
    expect(dirty.mock.calls).toEqual([[true]]);
  });
  it("acknowledges a recreated owned plugin and sends commands only to the current source", async () => {
    const dirty = vi.fn();
    const view = render(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        onDirtyChange={dirty}
      />
    );
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const old = pluginFrame(office);
    send(old.source, { type: "bridge-ready" });
    expect(old.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "bridge-ack" }),
      window.location.origin
    );
    old.plugin.remove();
    const fresh = pluginFrame(office);
    send(fresh.source, { type: "bridge-ready" });
    expect(fresh.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "bridge-ack" }),
      window.location.origin
    );
    send(old.source, { dirty: true, type: "dirty-state" });
    expect(dirty).not.toHaveBeenCalled();
    send(fresh.source, { dirty: true, type: "dirty-state" });
    expect(dirty).toHaveBeenCalledWith(true);
    view.rerender(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        onDirtyChange={dirty}
        saveRequest={1}
      />
    );
    await waitFor(() =>
      expect(fresh.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "run-action" }),
        window.location.origin
      )
    );
    expect(
      old.send.mock.calls.some(([message]) => message.type === "run-action")
    ).toBe(false);
  });
  it("fails an unacknowledged command without closing the current document", async () => {
    const onBridge = vi.fn();
    const view = render(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        onBridgeMessage={onBridge}
      />
    );
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const plugin = pluginFrame(office);
    send(plugin.source, { type: "bridge-ready" });
    vi.useFakeTimers();
    view.rerender(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        onBridgeMessage={onBridge}
        saveAction="submit"
        saveRequest={1}
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(onBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "submit",
        attachmentCommitUnresolved: true,
        status: "failed",
      })
    );
    expect(screen.getByTitle("Office sandbox")).toBe(office);
    expect(office.closest("[inert]")).not.toBeNull();
  });
  it("keeps an accepted submit pending while native saving takes longer than thirty seconds", async () => {
    const onBridge = vi.fn();
    const view = render(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        onBridgeMessage={onBridge}
      />
    );
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const plugin = pluginFrame(office);
    send(plugin.source, { type: "bridge-ready" });
    act(() => documentStateChanged?.({ data: true }));
    vi.useFakeTimers();
    view.rerender(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        onBridgeMessage={onBridge}
        saveAction="submit"
        saveRequest={1}
      />
    );
    send(plugin.source, {
      requestId: "native-save",
      type: "editor-save-request",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });
    expect(onBridge).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
    expect(
      plugin.send.mock.calls.some(
        ([message]) => message.type === "editor-save-response"
      )
    ).toBe(false);
    act(() => documentStateChanged?.({ data: false }));
    expect(plugin.send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "native-save",
        saved: true,
        type: "editor-save-response",
      }),
      window.location.origin
    );
    send(plugin.source, {
      action: "submit",
      operationId: "submit",
      status: "pending",
      type: "operation",
    });
    send(plugin.source, {
      action: "submit",
      operation: { result: { submissionId: "submission" } },
      operationId: "submit",
      status: "completed",
      type: "operation",
    });
    expect(onBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "submit", status: "completed" })
    );
  });
  it("expires an unsent command so a late bridge handshake cannot submit it", async () => {
    const onBridge = vi.fn();
    const ready = vi.fn();
    const view = render(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        onBridgeMessage={onBridge}
        onCommandReadyChange={ready}
      />
    );
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const plugin = pluginFrame(office);
    vi.useFakeTimers();
    view.rerender(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        onBridgeMessage={onBridge}
        onCommandReadyChange={ready}
        saveAction="submit"
        saveRequest={1}
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(onBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "submit",
        attachmentCommitUnresolved: false,
        status: "failed",
      })
    );
    send(plugin.source, { type: "bridge-ready" });
    expect(ready).toHaveBeenLastCalledWith(true);
    expect(
      plugin.send.mock.calls.some(([message]) => message.type === "run-action")
    ).toBe(false);
  });
  it("assigns a new native frame identity when the document is remounted", async () => {
    const placeholderIds: string[] = [];
    vi.stubGlobal("DocsAPI", {
      DocEditor: class {
        constructor(id: string) {
          placeholderIds.push(id);
        }
        destroyEditor = vi.fn();
      },
    });
    const view = render(
      <OnlyOfficeEditor configUrl="/editor-config" title="Editor" />
    );
    await waitFor(() => expect(placeholderIds).toHaveLength(1));
    view.rerender(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        revision={1}
      />
    );
    await waitFor(() => expect(placeholderIds).toHaveLength(2));
    expect(placeholderIds[0]).not.toBe(placeholderIds[1]);
  });
  it("rejects sibling frames and wrong origins even when the bridge id matches", async () => {
    render(<OnlyOfficeEditor configUrl="/editor-config" title="Editor" />);
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const own = pluginFrame(office);
    const topLevelSend = vi.spyOn(window, "postMessage");
    send(window, { type: "bridge-ready" });
    expect(topLevelSend).not.toHaveBeenCalled();
    send(own.source, { type: "bridge-ready" }, "https://hostile.test");
    expect(own.send).not.toHaveBeenCalled();
    const sibling = document.createElement("iframe");
    document.body.append(sibling);
    const outside = sibling.contentWindow;
    if (!outside) {
      throw new Error("Sibling fixture window missing");
    }
    const outsideSend = vi.spyOn(outside, "postMessage");
    send(outside, { type: "bridge-ready" });
    expect(outsideSend).not.toHaveBeenCalled();
    sibling.remove();
    send(own.source, { type: "bridge-ready" });
    expect(own.send).toHaveBeenCalled();
  });
  it("does not deliver an earlier iframe's capability renewal to the reopened instance", async () => {
    render(<OnlyOfficeEditor configUrl="/editor-config" title="Editor" />);
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const old = pluginFrame(office);
    send(old.source, { type: "bridge-ready" });
    const { promise: pending, resolve: finishOld } =
      createDeferred<ReturnType<typeof config>>();
    transport.get.mockReturnValueOnce(pending);
    send(old.source, {
      action: "configure-fields",
      requestId: "capability-1",
      type: "capability-request",
    });
    old.plugin.remove();
    const fresh = pluginFrame(office);
    send(fresh.source, { type: "bridge-ready" });
    transport.get.mockResolvedValueOnce({
      ...config(),
      bridge: {
        ...config().bridge,
        capabilities: { "configure-fields": "new-cap" },
      },
    });
    send(fresh.source, {
      action: "configure-fields",
      requestId: "capability-1",
      type: "capability-request",
    });
    await waitFor(() =>
      expect(fresh.send).toHaveBeenCalledWith(
        expect.objectContaining({
          capability: "new-cap",
          type: "capability-response",
        }),
        window.location.origin
      )
    );
    await act(async () => {
      finishOld({
        ...config(),
        bridge: {
          ...config().bridge,
          capabilities: { "configure-fields": "old-cap" },
        },
      });
      await pending;
    });
    expect(
      fresh.send.mock.calls.filter(
        ([message]) => message.type === "capability-response"
      )
    ).toHaveLength(1);
    expect(
      old.send.mock.calls.some(
        ([message]) => message.type === "capability-response"
      )
    ).toBe(false);
  });
});

const uploadOptions = (documentKey: string, bridgeId: string) => ({
  action: "draft",
  bridgeId,
  documentKey,
  scopeIdentity: "actor/response",
  spreadsheetBindings: {
    fields: [
      {
        attachment: { category: "หลักฐาน" },
        id: "folio_file",
        key: "file",
        type: "text",
      },
    ],
    table: null,
  },
});

it.each([
  "accepted",
  "negative-ack",
  "native-deadline",
  "config-rejection",
  "config-timeout",
  "canonical-key",
  "native-key",
  "lease",
  "actor-scope",
] as const)(
  "preserves later Draft work and known completion after continuation %s",
  async (outcome) => {
    const accepted = outcome === "accepted";
    const configFailure = ![
      "accepted",
      "negative-ack",
      "native-deadline",
    ].includes(outcome);
    const initial = {
      ...exportConfig("document-1", "lease"),
      bridge: {
        ...exportConfig("document-1", "lease").bridge,
        uploadPoc: {
          ...uploadOptions("document-1", "editor-bridge"),
          publicId: "form",
          responseId: "response",
        },
      },
    };
    const fresh = {
      ...initial,
      bridge: {
        ...initial.bridge,
        capabilities: { "save-draft": "next-save-capability" },
        documentKey: "document-2",
        uploadPoc: {
          ...initial.bridge.uploadPoc,
          documentKey: "document-2",
          // The captured save has no attachment; the later File is not saved data.
          savedData: {},
        },
      },
      config: {
        ...initial.config,
        document: { ...initial.config.document },
      },
    };
    if (outcome === "canonical-key") {
      fresh.bridge.documentKey = "foreign-document";
    } else if (outcome === "native-key") {
      fresh.config.document.key = "foreign-native-document";
    } else if (outcome === "lease") {
      fresh.bridge.lease = { ...fresh.bridge.lease, id: "foreign-lease" };
    } else if (outcome === "actor-scope") {
      fresh.bridge.uploadPoc.scopeIdentity = "foreign-actor/response";
    }
    transport.get.mockImplementation((path: string) => {
      if (path === "/api/operations/saved-1") {
        return Promise.resolve({
          operation: {
            id: "saved-1",
            responseId: "response",
            result: {
              attachmentTransition: {
                fromDocumentKey: "document-1",
                newRowCount: 0,
                oldRowCount: 0,
                rowMapping: [],
                tableBindingId: null,
                toDocumentKey: "document-2",
              },
              documentKey: "document-2",
            },
            status: "completed",
            type: "save_draft",
          },
        });
      }
      if (path.includes("continuedOperationId=saved-1")) {
        if (outcome === "config-rejection") {
          return Promise.reject(new Error("Configuration unavailable"));
        }
        if (outcome === "config-timeout") {
          return Promise.reject(new DOMException("Timed out", "TimeoutError"));
        }
        return Promise.resolve(fresh);
      }
      if (path.endsWith("/attachment-status")) {
        return Promise.resolve({ cleanupWarning: null, mutationNotice: null });
      }
      return Promise.resolve(initial);
    });
    transport.postForm
      .mockResolvedValueOnce({
        action: "save-draft",
        operationCapability: "poll",
        operationId: "saved-1",
        status: "pending",
      })
      .mockResolvedValue({
        action: "save-draft",
        operationCapability: "poll",
        operationId: "saved-2",
        status: "pending",
      });
    const onBridge = vi.fn();
    const dirty = vi.fn();
    const Consumer = ({ saveRequest = 0 }: { saveRequest?: number }) => {
      const [status, setStatus] = useState("ready");
      const [commandReady, setCommandReady] = useState(false);
      return (
        <>
          <output aria-label="Draft continuation status">{status}</output>
          <button disabled={!commandReady} type="button">
            Save next Draft
          </button>
          <OnlyOfficeEditor
            configUrl="/editor-config"
            title="Live Draft"
            onBridgeMessage={(message) => {
              onBridge(message);
              if (message.type === "operation") {
                setStatus(
                  message.attachmentCommitUnresolved
                    ? "recover-original"
                    : message.status
                );
              }
            }}
            onCommandReadyChange={setCommandReady}
            onDirtyChange={dirty}
            saveRequest={saveRequest}
          />
        </>
      );
    };
    const view = render(<Consumer />);
    const office =
      await screen.findByTitle<HTMLIFrameElement>("Office sandbox");
    const plugin = pluginFrame(office);
    const picker = pluginFrame(office);
    send(plugin.source, { type: "bridge-ready" });
    act(() => documentStateChanged?.({ data: true }));
    view.rerender(<Consumer saveRequest={1} />);
    expect(office.closest("[inert]")).not.toBeNull();
    send(plugin.source, { requestId: "capture", type: "editor-save-request" });
    send(plugin.source, {
      action: "save-draft",
      body: { documentKey: "document-1" },
      capability: "first-save-capability",
      documentKey: "document-1",
      requestId: "first-save",
      scopeIdentity: "actor/response",
      snapshotUrl: "http://office.test/first.xlsx",
      source: "folio-upload-poc",
      type: "pending-file-save",
    });
    await waitFor(() => expect(transport.postForm).toHaveBeenCalledTimes(1));
    act(() => documentStateChanged?.({ data: true }));
    const candidate = {
      dirty: true,
      documentKey: "document-1",
      requestId: "candidate",
      scopeIdentity: "actor/response",
      source: "folio-upload-poc",
      type: "pending-file-candidate",
    };
    send(picker.source, candidate);
    if (configFailure) {
      send(picker.source, {
        ...candidate,
        bindingId: "folio_file",
        file: new File(["later"], "later.txt"),
        rowIndex: null,
        tag: "file",
        type: "pending-file-set",
      });
      await waitFor(() =>
        expect(picker.send).toHaveBeenCalledWith(
          expect.objectContaining({ filename: "later.txt" }),
          window.location.origin
        )
      );
    }
    const completion = {
      action: "save-draft",
      operation: { result: { documentKey: "document-2" } },
      operationId: "saved-1",
      status: "completed",
      type: "operation",
    };
    if (outcome === "native-deadline") {
      vi.useFakeTimers();
      try {
        await act(async () => {
          send(plugin.source, completion);
          await vi.advanceTimersByTimeAsync(30_000);
        });
      } finally {
        vi.useRealTimers();
      }
    } else {
      send(plugin.source, completion);
    }
    if (!configFailure) {
      await waitFor(() =>
        expect(plugin.send).toHaveBeenCalledWith(
          expect.objectContaining({ type: "retain-completed-editor" }),
          window.location.origin
        )
      );
    }
    expect(office.closest("[inert]")).not.toBeNull();
    const receipt = {
      documentKey: "document-2",
      ok: accepted,
      operationId: "saved-1",
      type: "retained-editor-result",
    };
    if (!configFailure && outcome !== "native-deadline") {
      send(picker.source, receipt);
      send(plugin.source, { ...receipt, operationId: "foreign-operation" });
      send(plugin.source, { ...receipt, documentKey: "stale-document" });
      expect(office.closest("[inert]")).not.toBeNull();
      expect(onBridge).not.toHaveBeenCalled();
      send(plugin.source, receipt);
    }
    await waitFor(() =>
      expect(onBridge).toHaveBeenCalledWith(
        expect.objectContaining({
          hasAttachmentCandidates: true,
          hasUnsavedDocumentChanges: true,
          status: "completed",
        })
      )
    );
    expect(screen.getByLabelText("Draft continuation status").textContent).toBe(
      "completed"
    );
    expect(screen.getByTitle("Office sandbox")).toBe(office);
    expect(office.closest("[aria-busy]")?.getAttribute("aria-busy")).toBe(
      "false"
    );
    if (!accepted) {
      expect(office.closest("[inert]")).not.toBeNull();
      expect(dirty).toHaveBeenLastCalledWith(true);
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: "Save next Draft",
        }).disabled
      ).toBe(true);
      send(plugin.source, { type: "bridge-ready" });
      send(plugin.source, { ...receipt, ok: true });
      const retainedDocumentKey = configFailure ? "document-1" : "document-2";
      await act(() => {
        send(plugin.source, {
          action: "save-draft",
          body: { documentKey: retainedDocumentKey },
          capability: "next-save-capability",
          documentKey: retainedDocumentKey,
          requestId: "blocked-next-save",
          scopeIdentity: "actor/response",
          snapshotUrl: "http://office.test/later.xlsx",
          source: "folio-upload-poc",
          type: "pending-file-save",
        });
      });
      expect(transport.postForm).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: "Save next Draft",
        }).disabled
      ).toBe(true);
      expect(office.closest("[inert]")).not.toBeNull();
      expect(
        screen.getByLabelText("Draft continuation status").textContent
      ).toBe("completed");
      return;
    }
    expect(office.closest("[inert]")).toBeNull();
    send(plugin.source, { dirty: false, type: "dirty-state" });
    expect(dirty).toHaveBeenLastCalledWith(true);
    send(picker.source, { ...candidate, dirty: false });
    send(picker.source, {
      ...candidate,
      bindingId: "folio_file",
      file: new File(["late"], "late.txt"),
      rowIndex: null,
      tag: "file",
      type: "pending-file-set",
    });
    await waitFor(() =>
      expect(picker.send).toHaveBeenCalledWith(
        expect.objectContaining({
          documentKey: "document-1",
          filename: "late.txt",
        }),
        window.location.origin
      )
    );
    send(plugin.source, {
      action: "save-draft",
      body: { documentKey: "document-2" },
      capability: "next-save-capability",
      documentKey: "document-2",
      requestId: "next-save",
      scopeIdentity: "actor/response",
      snapshotUrl: "http://office.test/newer.xlsx",
      source: "folio-upload-poc",
      type: "pending-file-save",
    });
    await waitFor(() => expect(transport.postForm).toHaveBeenCalledTimes(2));
    const multipart = transport.postForm.mock.calls[1]?.[1];
    expect(multipart).toBeInstanceOf(FormData);
    expect(JSON.parse(String(multipart.get("payload")))).toMatchObject({
      documentKey: "document-2",
    });
    expect(multipart.get("attachment:folio_file")).toBeInstanceOf(File);
  }
);

it("settles a persisted completed checkpoint before opening an editable workbook and saves the next ordinary snapshot as a new operation", async () => {
  sessionStorage.clear();
  const key = "folio-attachment-checkpoint:actor/response";
  const previous = crypto.randomUUID();
  sessionStorage.setItem(key, previous);
  const initial = {
    ...exportConfig("document-1", "lease"),
    bridge: {
      ...exportConfig("document-1", "lease").bridge,
      uploadPoc: {
        ...uploadOptions("document-1", "editor-bridge"),
        publicId: "form",
        responseId: "response",
      },
    },
  };
  const fresh = {
    ...initial,
    bridge: {
      ...initial.bridge,
      documentKey: "document-2",
      uploadPoc: { ...initial.bridge.uploadPoc, documentKey: "document-2" },
    },
    config: { ...initial.config, document: { key: "native-document-2" } },
  };
  const checkpoint = createDeferred<{
    operationId: string;
    operationCapability: string;
    status: string;
  }>();
  const original = {
    action: "save-draft",
    operationCapability: "old-operation-capability",
    operationId: "original-completed",
    status: "completed",
  };
  transport.get
    .mockReset()
    .mockResolvedValueOnce(initial)
    .mockReturnValueOnce(checkpoint.promise)
    .mockResolvedValue(fresh);
  transport.postForm.mockResolvedValue({
    action: "save-draft",
    operationCapability: "current-operation-capability",
    operationId: "current-save",
    status: "pending",
  });
  const onBridge = vi.fn();
  const dirty = vi.fn();
  const view = render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      onBridgeMessage={onBridge}
      onDirtyChange={dirty}
      title="Recovered draft"
    />
  );
  try {
    await waitFor(() =>
      expect(
        transport.get.mock.calls.some(
          ([path]) =>
            path === `/api/responses/response/attachment-operations/${previous}`
        )
      ).toBe(true)
    );
    expect(screen.queryByTitle("Office sandbox")).toBeNull();
    expect(sessionStorage.getItem(key)).toBe(previous);
    checkpoint.resolve(original);
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    expect(sessionStorage.getItem(key)).toBeNull();
    const plugin = pluginFrame(office);
    send(plugin.source, { type: "bridge-ready" });
    send(plugin.source, { dirty: true, type: "dirty-state" });
    send(plugin.source, {
      action: "save-draft",
      body: {},
      capability: "current-capability",
      documentKey: "document-2",
      requestId: "save-current",
      scopeIdentity: "actor/response",
      snapshotUrl: "http://office.test/current-newer-ordinary-snapshot.xlsx",
      source: "folio-upload-poc",
      type: "pending-file-save",
    });
    await waitFor(() => expect(transport.postForm).toHaveBeenCalledTimes(1));
    const multipart = transport.postForm.mock.calls[0]?.[1];
    expect(multipart).toBeInstanceOf(FormData);
    if (!(multipart instanceof FormData)) {
      throw new Error(
        "The current ordinary snapshot needs its own native multipart operation"
      );
    }
    expect(JSON.parse(String(multipart.get("payload")))).toMatchObject({
      documentKey: "document-2",
      snapshotUrl: "http://office.test/current-newer-ordinary-snapshot.xlsx",
    });
    expect(JSON.parse(String(multipart.get("payload"))).checkpoint).not.toBe(
      previous
    );
    expect(
      onBridge.mock.calls.some(
        ([reply]) => reply.operationId === original.operationId
      )
    ).toBe(false);
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(screen.getByTitle("Office sandbox")).toBe(office);
  } finally {
    checkpoint.resolve(original);
    view.unmount();
    sessionStorage.clear();
  }
});

it("keeps pending checkpoint recovery bounded and retryable without opening editable native content or clearing its identity", async () => {
  const key = "folio-attachment-checkpoint:actor/response";
  const previous = crypto.randomUUID();
  sessionStorage.setItem(key, previous);
  const base = exportConfig("document-1", "lease");
  const initial = {
    ...base,
    bridge: {
      ...base.bridge,
      uploadPoc: {
        ...uploadOptions("document-1", "editor-bridge"),
        publicId: "form",
        responseId: "response",
      },
    },
  };
  const pending = {
    action: "save-draft",
    operationCapability: "original-cap",
    operationId: "original",
    status: "processing",
  };
  transport.get
    .mockReset()
    .mockResolvedValueOnce(initial)
    .mockResolvedValue(pending);
  transport.wait.mockRejectedValue(
    new ApiError(408, "operation_timeout", "bounded wait exhausted")
  );
  const view = render(
    <OnlyOfficeEditor configUrl="/editor-config" title="Pending recovery" />
  );
  try {
    await screen.findByText(/ยังตรวจผลบันทึกรอบก่อนไม่ได้/u);
    expect(screen.queryByTitle("Office sandbox")).toBeNull();
    expect(sessionStorage.getItem(key)).toBe(previous);
    expect(
      screen.getByRole("button", {
        name: "เปิดอ่าน Excel ฉบับที่บันทึกไว้",
      })
    ).toBeVisible();
    expect(transport.postForm).not.toHaveBeenCalled();
    transport.get
      .mockReset()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({ ...pending, status: "completed" })
      .mockResolvedValue(initial);
    act(() => screen.getByRole("button", { name: "ลองใหม่" }).click());
    await screen.findByTitle("Office sandbox");
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(transport.postForm).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    sessionStorage.clear();
  }
});

it("reports candidates independently from ordinary edits and confirmed pending without writing bytes", async () => {
  const base = exportConfig("document", "lease");
  transport.get.mockResolvedValue({
    ...base,
    bridge: {
      ...base.bridge,
      uploadPoc: uploadOptions("document", "editor-bridge"),
    },
  });
  const dirty = vi.fn();
  render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Candidates"
      onDirtyChange={dirty}
    />
  );
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const picker = pluginFrame(office);
  const message = {
    documentKey: "document",
    requestId: "candidate",
    scopeIdentity: "actor/response",
    source: "folio-upload-poc",
    type: "pending-file-candidate",
  };
  send(window, { ...message, dirty: true });
  expect(dirty).not.toHaveBeenCalled();
  send(picker.source, { ...message, dirty: true });
  expect(dirty).toHaveBeenLastCalledWith(true);
  send(picker.source, { ...message, dirty: false });
  expect(dirty).toHaveBeenLastCalledWith(false);
  send(picker.source, { type: "bridge-ready" });
  send(picker.source, { dirty: true, type: "dirty-state" });
  send(picker.source, { ...message, dirty: true });
  send(picker.source, { ...message, dirty: false });
  expect(dirty).toHaveBeenLastCalledWith(true);
  send(picker.source, { dirty: false, type: "dirty-state" });
  send(picker.source, {
    ...message,
    bindingId: "folio_file",
    file: new File(["confirmed"], "confirmed.txt"),
    rowIndex: null,
    tag: "file",
    type: "pending-file-set",
  });
  await waitFor(() =>
    expect(picker.send).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "confirmed.txt" }),
      window.location.origin
    )
  );
  send(picker.source, { ...message, dirty: true });
  send(picker.source, { ...message, dirty: false });
  expect(dirty).toHaveBeenLastCalledWith(true);
  expect(transport.postForm).not.toHaveBeenCalled();
  expect(transport.post).not.toHaveBeenCalled();
});

it("recovers an already committed Submit before its closed editor config and uses the original submission transition without another write", async () => {
  const originalScope = JSON.stringify(["actor", "form", "old-response"]);
  const key = `folio-attachment-checkpoint:${originalScope}`;
  const checkpoint = crypto.randomUUID();
  sessionStorage.setItem(key, checkpoint);
  const oldConfig = "/api/forms/form/editor-config?responseId=old-response";
  const newConfig = "/api/forms/form/editor-config?responseId=new-response";
  const base = exportConfig("new-document", "new-lease");
  const fresh = {
    ...base,
    bridge: {
      ...base.bridge,
      uploadPoc: {
        ...uploadOptions("new-document", "editor-bridge"),
        publicId: "form",
        responseId: "new-response",
        scopeIdentity: JSON.stringify(["actor", "form", "new-response"]),
      },
    },
  };
  transport.get.mockImplementation((path: string) => {
    if (
      path === `/api/responses/old-response/attachment-operations/${checkpoint}`
    ) {
      return Promise.resolve({
        action: "submit",
        operationCapability: "original-cap",
        operationId: "original-submit",
        status: "completed",
      });
    }
    if (path.startsWith(oldConfig)) {
      return Promise.reject(
        new ApiError(409, "already_submitted", "The old editor is closed")
      );
    }
    return Promise.resolve(fresh);
  });
  transport.wait.mockResolvedValue({
    id: "original-submit",
    result: {
      publicId: "form",
      responseId: "old-response",
      submissionId: "original-submission",
    },
    status: "completed",
  });
  const transition = createDeferred<undefined>();
  const recovered = vi.fn();
  const Consumer = () => {
    const [url, setUrl] = useState(oldConfig);
    return (
      <OnlyOfficeEditor
        configUrl={url}
        title="Recovered Submit"
        onBridgeMessage={async (message) => {
          recovered(message);
          await transition.promise;
          setUrl(newConfig);
        }}
      />
    );
  };
  const view = render(<Consumer />);
  try {
    await waitFor(() =>
      expect(recovered).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "submit",
          operation: {
            result: {
              submissionId: "original-submission",
            },
          },
          operationId: "original-submit",
          requestedAction: "submit",
          status: "completed",
        })
      )
    );
    expect(screen.queryByTitle("Office sandbox")).toBeNull();
    expect(sessionStorage.getItem(key)).toBe(checkpoint);
    expect(
      transport.get.mock.calls.some(([path]) =>
        String(path).startsWith(oldConfig)
      )
    ).toBe(false);
    transition.resolve();
    await screen.findByTitle("Office sandbox");
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(transport.postForm).not.toHaveBeenCalled();
  } finally {
    transition.resolve();
    view.unmount();
    sessionStorage.clear();
  }
});

it("adopts only the fenced recovery lease and ignores a stale capability reply without losing native edits or the pending File", async () => {
  sessionStorage.clear();
  const old = exportConfig("document-1", "old-lease");
  const initial = {
    ...old,
    bridge: {
      ...old.bridge,
      capabilities: {
        ...old.bridge.capabilities,
        "save-draft": "old-capability",
      },
      uploadPoc: {
        ...uploadOptions("document-1", "editor-bridge"),
        publicId: "form",
        responseId: "response",
      },
    },
  };
  const newLease = {
    ...old.bridge.lease,
    id: "new-lease",
    releaseUrl: "/release/new",
    renewUrl: "/renew/new",
  };
  const fresh = {
    ...initial,
    bridge: {
      ...initial.bridge,
      capabilities: { "save-draft": "new-capability" },
      lease: newLease,
    },
  };
  const stale = createDeferred<typeof initial>();
  let configReads = 0;
  transport.get.mockReset().mockImplementation((path: string) => {
    if (path === "/api/responses/response/attachment-status") {
      return Promise.resolve({ cleanupWarning: null, mutationNotice: null });
    }
    if (path.startsWith("/api/responses/response/attachment-operations/")) {
      return Promise.reject(new ApiError(404, "not_found", "not admitted yet"));
    }
    configReads += 1;
    if (configReads === 1) {
      return Promise.resolve(initial);
    }
    if (configReads === 2) {
      return stale.promise;
    }
    return Promise.resolve(fresh);
  });
  transport.postForm.mockRejectedValue(new TypeError("transport interrupted"));
  transport.post.mockResolvedValue({
    admission: "not-admitted",
    lease: newLease,
    revokedLeaseId: "old-lease",
  });
  const dirty = vi.fn();
  const view = render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      onDirtyChange={dirty}
      title="Recovery"
    />
  );
  try {
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const plugin = pluginFrame(office);
    send(plugin.source, { type: "bridge-ready" });
    send(plugin.source, {
      action: "save-draft",
      requestId: "old-cap",
      type: "capability-request",
    });
    const fileRequest = {
      bindingId: "folio_file",
      documentKey: "document-1",
      requestId: "choose",
      rowIndex: null,
      scopeIdentity: "actor/response",
      source: "folio-upload-poc",
      tag: "file",
    };
    send(plugin.source, {
      ...fileRequest,
      file: new File(["proof"], "proof.txt"),
      type: "pending-file-set",
    });
    send(plugin.source, {
      ...fileRequest,
      action: "save-draft",
      body: {},
      capability: "old-capability",
      requestId: "save",
      snapshotUrl: "http://office.test/snapshot.xlsx",
      type: "pending-file-save",
    });
    await waitFor(() =>
      expect(plugin.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          requestId: "save",
          type: "pending-file-result",
        }),
        window.location.origin
      )
    );
    stale.resolve(initial);
    await waitFor(() =>
      expect(plugin.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          requestId: "old-cap",
          type: "capability-response",
        }),
        window.location.origin
      )
    );
    expect(
      plugin.send.mock.calls.some(
        ([reply]) => reply.requestId === "old-cap" && "capability" in reply
      )
    ).toBe(false);
    send(plugin.source, {
      action: "save-draft",
      requestId: "new-cap",
      type: "capability-request",
    });
    await waitFor(() =>
      expect(plugin.send).toHaveBeenCalledWith(
        expect.objectContaining({
          capability: "new-capability",
          requestId: "new-cap",
          type: "capability-response",
        }),
        window.location.origin
      )
    );
    send(plugin.source, {
      ...fileRequest,
      requestId: "retained",
      type: "pending-file-get",
    });
    await waitFor(() =>
      expect(plugin.send).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filename: "proof.txt",
          requestId: "retained",
        }),
        window.location.origin
      )
    );
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(transport.postForm).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("Office sandbox")).toBe(office);
  } finally {
    stale.resolve(initial);
    view.unmount();
    sessionStorage.clear();
  }
});

it("keeps POC Files in the host across native remount and rejects messages outside the current trusted editor", async () => {
  const firstConfig = {
    ...config(),
    bridge: {
      ...config().bridge,
      documentKey: "document-1",
      uploadPoc: {
        ...uploadOptions("document-1", "editor-bridge"),
        publicId: "form",
        responseId: "response",
      },
    },
  };
  const nextConfig = {
    ...config(),
    bridge: {
      ...config().bridge,
      documentKey: "document-2",
      id: "next-bridge",
      uploadPoc: {
        ...uploadOptions("document-2", "next-bridge"),
        publicId: "form",
        responseId: "response",
      },
    },
  };
  transport.get
    .mockReset()
    .mockResolvedValueOnce(firstConfig)
    .mockImplementation((path: string) => {
      if (path === "/api/responses/response/attachment-status") {
        return Promise.resolve({ cleanupWarning: null, mutationNotice: null });
      }
      return Promise.resolve(
        path === "/api/operations/project-operation"
          ? {
              operation: {
                id: "project-operation",
                responseId: "response",
                result: {
                  attachmentTransition: {
                    fromDocumentKey: "document-1",
                    newRowCount: 0,
                    oldRowCount: 0,
                    rowMapping: [],
                    tableBindingId: null,
                    toDocumentKey: "document-2",
                  },
                  documentKey: "document-2",
                },
                status: "completed",
                type: "save_draft",
              },
            }
          : nextConfig
      );
    });
  const onBridge = vi.fn();
  const view = render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Excel files"
      onBridgeMessage={onBridge}
    />
  );
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const picker = pluginFrame(office);
  send(picker.source, { type: "bridge-ready" });
  picker.send.mockClear();
  const request = {
    bindingId: "folio_file",
    documentKey: "document-1",
    file: new File(["proof"], "proof.txt"),
    requestId: "choose-1",
    rowIndex: null,
    scopeIdentity: "actor/response",
    source: "folio-upload-poc",
    tag: "file",
    type: "pending-file-set",
  };
  send(picker.source, request, "https://wrong-origin.example");
  send(picker.source, { ...request, bridgeId: "wrong" });
  send(picker.source, { ...request, documentKey: "wrong" });
  expect(picker.send).not.toHaveBeenCalled();
  const unrelated = document.createElement("iframe");
  document.body.append(unrelated);
  if (!unrelated.contentWindow) {
    throw new Error("Missing unrelated frame");
  }
  const outsider = vi.spyOn(unrelated.contentWindow, "postMessage");
  send(unrelated.contentWindow, request);
  expect(outsider).not.toHaveBeenCalled();
  unrelated.remove();
  send(picker.source, request);
  await waitFor(() =>
    expect(picker.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filename: "proof.txt",
        size: 5,
        type: "pending-file-result",
      }),
      window.location.origin
    )
  );
  picker.send.mockClear();
  send(picker.source, { ...request, bindingId: "folio_unknown" });
  await waitFor(() =>
    expect(picker.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
      window.location.origin
    )
  );
  send(picker.source, {
    action: "save-draft",
    operationId: "project-operation",
    status: "completed",
    type: "operation",
  });
  await waitFor(() =>
    expect(onBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        hasPendingAttachments: true,
        operation: {
          result: expect.objectContaining({ documentKey: "document-2" }),
        },
        status: "completed",
      })
    )
  );
  view.rerender(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Excel files"
      revision={1}
      onBridgeMessage={onBridge}
    />
  );
  await waitFor(() =>
    expect(screen.getByTitle("Office sandbox")).not.toBe(office)
  );
  const reconnected = pluginFrame(
    screen.getByTitle("Office sandbox") as HTMLIFrameElement
  );
  send(reconnected.source, {
    ...request,
    bridgeId: "next-bridge",
    documentKey: "document-2",
    file: undefined,
    type: "pending-file-get",
  });
  await waitFor(() =>
    expect(reconnected.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ filename: "proof.txt", size: 5 }),
      window.location.origin
    )
  );
  expect(transport.post).not.toHaveBeenCalled();
});

it("keeps removal dirty and export-blocking, rejects forged cancellation, and retains cleanup warning after successful saves and reopen", async () => {
  const warning = "ข้อมูลใหม่บันทึกแล้ว แต่ URL เก่าอาจยังเปิดได้ กรุณาประสาน Admin";
  const initial = {
    ...exportConfig("document", "lease"),
    bridge: {
      ...exportConfig("document", "lease").bridge,
      uploadPoc: {
        ...uploadOptions("document", "editor-bridge"),
        cleanupWarning: warning,
        publicId: "form",
        responseId: "response",
        savedData: {
          file: {
            file_link: "https://files.test/old",
            original_name: "old.bin",
            size_bytes: 0,
          },
        },
      },
    },
  };
  transport.get.mockImplementation((path: string) => {
    if (path === "/api/responses/response/attachment-status") {
      return Promise.resolve({ cleanupWarning: warning, mutationNotice: null });
    }
    return Promise.resolve(
      path === "/api/operations/remove-op"
        ? {
            operation: {
              id: "remove-op",
              responseId: "response",
              result: {
                attachmentTransition: {
                  fromDocumentKey: "document",
                  newRowCount: 0,
                  oldRowCount: 0,
                  rowMapping: [],
                  tableBindingId: null,
                  toDocumentKey: "document-2",
                },
                documentKey: "document-2",
              },
              status: "completed",
              type: "save_draft",
            },
          }
        : initial
    );
  });
  transport.postForm.mockResolvedValue({
    action: "save-draft",
    operationCapability: "cap",
    operationId: "remove-op",
    status: "pending",
  });
  const capture = createRef<CaptureWorkbook>();
  const dirty = vi.fn();
  const onBridge = vi.fn();
  const view = render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Draft attachments"
      captureWorkbookRef={capture}
      onDirtyChange={dirty}
      onBridgeMessage={onBridge}
    />
  );
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const picker = pluginFrame(office);
  send(picker.source, { type: "bridge-ready" });
  const slot = {
    bindingId: "folio_file",
    documentKey: "document",
    requestId: "remove",
    rowIndex: null,
    scopeIdentity: "actor/response",
    source: "folio-upload-poc",
    tag: "file",
  };
  send(picker.source, { ...slot, type: "pending-file-remove" });
  expect(dirty).toHaveBeenLastCalledWith(true);
  send(picker.source, { dirty: false, type: "dirty-state" });
  expect(dirty).toHaveBeenLastCalledWith(true);
  await expect(capture.current?.()).rejects.toThrow(/ยังไม่บันทึก/u);
  send(picker.source, {
    ...slot,
    documentKey: "stale",
    type: "pending-file-cancel",
  });
  send(
    picker.source,
    { ...slot, type: "pending-file-cancel" },
    "https://forged.test"
  );
  send(picker.source, { ...slot, type: "pending-file-get" });
  await waitFor(() =>
    expect(picker.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ removal: true }),
      window.location.origin
    )
  );
  expect(screen.getByText(warning)).toBeVisible();
  send(picker.source, {
    ...slot,
    action: "save-draft",
    body: {},
    capability: "capability",
    snapshotUrl: "http://office.test/snapshot.xlsx",
    type: "pending-file-save",
  });
  await waitFor(() => expect(transport.postForm).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(picker.send).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: "remove-op" }),
      window.location.origin
    )
  );
  send(picker.source, {
    action: "save-draft",
    operationId: "remove-op",
    status: "completed",
    type: "operation",
  });
  await waitFor(() =>
    expect(onBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        hasPendingAttachments: false,
        operation: {
          result: expect.objectContaining({ documentKey: "document-2" }),
        },
        status: "completed",
      })
    )
  );
  expect(screen.getByText(warning)).toBeVisible();
  send(picker.source, { ...slot, type: "pending-file-get" });
  await waitFor(() =>
    expect(picker.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachmentCommitUnresolved: false,
        hasPending: false,
        removal: false,
      }),
      window.location.origin
    )
  );
  transport.get.mockResolvedValue({
    ...initial,
    bridge: {
      ...initial.bridge,
      documentKey: "document-2",
      uploadPoc: {
        ...initial.bridge.uploadPoc,
        documentKey: "document-2",
        savedData: { file: null },
      },
    },
  });
  view.rerender(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Draft attachments"
      revision={1}
      captureWorkbookRef={capture}
      onDirtyChange={dirty}
      onBridgeMessage={onBridge}
    />
  );
  await waitFor(() =>
    expect(screen.getByTitle("Office sandbox")).not.toBe(office)
  );
  expect(screen.getByText(warning)).toBeVisible();
  const reopened = pluginFrame(
    screen.getByTitle("Office sandbox") as HTMLIFrameElement
  );
  send(reopened.source, { type: "bridge-ready" });
  if (!capture.current) {
    throw new Error("Workbook capture is unavailable");
  }
  expect(
    await captureSnapshot(
      capture.current,
      reopened,
      "http://office.test/export.xlsx"
    )
  ).toMatchObject({
    snapshotUrl: "http://office.test/export.xlsx",
  });
  expect(transport.postForm).toHaveBeenCalledTimes(1);
});

it("blocks export during its own uncertain commit even when no File remains in memory", async () => {
  const initial = {
    ...exportConfig("document", "lease"),
    bridge: {
      ...exportConfig("document", "lease").bridge,
      uploadPoc: {
        ...uploadOptions("document", "editor-bridge"),
        publicId: "form",
        responseId: "response",
      },
    },
  };
  transport.get.mockResolvedValue(initial);
  const capture = createRef<CaptureWorkbook>();
  render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Uncertain commit"
      captureWorkbookRef={capture}
    />
  );
  const picker = pluginFrame(
    (await screen.findByTitle("Office sandbox")) as HTMLIFrameElement
  );
  send(picker.source, { type: "bridge-ready" });
  transport.postForm.mockRejectedValue(new TypeError("response lost"));
  transport.get.mockImplementation((path: string) => {
    if (path === "/api/responses/response/attachment-status") {
      return Promise.resolve({ cleanupWarning: null, mutationNotice: null });
    }
    return Promise.reject(new TypeError("checkpoint unavailable"));
  });
  send(picker.source, {
    action: "save-draft",
    body: {},
    capability: "capability",
    documentKey: "document",
    requestId: "save",
    scopeIdentity: "actor/response",
    snapshotUrl: "http://office.test/snapshot.xlsx",
    source: "folio-upload-poc",
    type: "pending-file-save",
  });
  await waitFor(() =>
    expect(picker.send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentCommitUnresolved: true,
        error: "checkpoint unavailable",
        requestId: "save",
      }),
      window.location.origin
    )
  );
  await expect(capture.current?.()).rejects.toThrow(/ยังยืนยันผลบันทึก/u);
  expect(transport.postForm).toHaveBeenCalledTimes(1);
});

it.each(["draft", "correction"])(
  "old Published PoC %s picker explains unavailable upload without retaining Files or blocking ordinary saves",
  async (action) => {
    const options = {
      ...uploadOptions("document", "editor-bridge"),
      action,
      spreadsheetBindings: {
        fields: [{ id: "folio_file", key: "file", type: "text" }],
        table: null,
      },
    };
    transport.get.mockResolvedValue({
      ...config(),
      bridge: { ...config().bridge, uploadPoc: options },
    });
    const dirty = vi.fn();
    render(
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Old PoC"
        onDirtyChange={dirty}
      />
    );
    const picker = pluginFrame(
      (await screen.findByTitle("Office sandbox")) as HTMLIFrameElement
    );
    const message = {
      bindingId: "folio_file",
      documentKey: "document",
      requestId: "old-picker",
      rowIndex: null,
      scopeIdentity: "actor/response",
      source: "folio-upload-poc",
      tag: "file",
    };
    send(picker.source, {
      ...message,
      file: new File(["private"], "private.txt"),
      type: "pending-file-set",
    });
    await waitFor(() =>
      expect(picker.send).toHaveBeenLastCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Admin"),
          unavailable: true,
        }),
        window.location.origin
      )
    );
    send(picker.source, {
      ...message,
      action: action === "correction" ? "save-correction" : "save-draft",
      type: "pending-file-check",
    });
    await waitFor(() =>
      expect(picker.send).toHaveBeenLastCalledWith(
        expect.objectContaining({ allowed: true, hasPending: false }),
        window.location.origin
      )
    );
    expect(dirty).not.toHaveBeenCalledWith(true);
    expect(transport.post).not.toHaveBeenCalled();
  }
);

it("keeps existing navigation dirty guard active for pending Files after native dirty clears", async () => {
  transport.get.mockResolvedValue({
    ...config(),
    bridge: {
      ...config().bridge,
      uploadPoc: uploadOptions("document", "editor-bridge"),
    },
  });
  const dirty = vi.fn();
  render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Pending files"
      onDirtyChange={dirty}
    />
  );
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const plugin = pluginFrame(office);
  send(plugin.source, { type: "bridge-ready" });
  send(plugin.source, {
    bindingId: "folio_file",
    documentKey: "document",
    file: new File(["pending"], "pending.txt"),
    requestId: "choose",
    rowIndex: null,
    scopeIdentity: "actor/response",
    source: "folio-upload-poc",
    tag: "file",
    type: "pending-file-set",
  });
  expect(dirty).toHaveBeenLastCalledWith(true);
  send(plugin.source, { dirty: false, type: "dirty-state" });
  expect(dirty).toHaveBeenLastCalledWith(true);
  act(() => documentStateChanged?.({ data: false }));
  expect(dirty).toHaveBeenLastCalledWith(true);
});

it("refreshes trusted Admin configuration but never accepts Files in Template Draft authoring", async () => {
  const lease = {
    expiresAt: "2099-01-01",
    id: "same-lease",
    releaseUrl: "/release",
    renewUrl: "/renew",
  };
  const options = {
    ...uploadOptions("document-1", "editor-bridge"),
    action: "template-edit",
  };
  const initial = {
    ...config(),
    bridge: {
      ...config().bridge,
      documentKey: "document-1",
      lease,
      uploadPoc: options,
    },
  };
  let fresh = initial;
  transport.get
    .mockResolvedValueOnce(initial)
    .mockImplementation(() => Promise.resolve(fresh));
  render(
    <OnlyOfficeEditor configUrl="/editor-config" title="Admin file picker" />
  );
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const picker = pluginFrame(office);
  const message = {
    bindingId: "folio_file",
    documentKey: "document-1",
    file: new File(["local"], "new.txt"),
    requestId: "authoring",
    rowIndex: null,
    scopeIdentity: "actor/response",
    source: "folio-upload-poc",
    tag: "file",
    type: "pending-file-set",
  };
  const request = async (data: Record<string, unknown>) => {
    picker.send.mockClear();
    send(picker.source, { ...message, ...data });
    await waitFor(() => expect(picker.send).toHaveBeenCalled());
    return picker.send.mock.calls.at(-1)?.[0];
  };
  expect(await request({})).toMatchObject({
    error: expect.stringContaining("ต้นแบบ"),
    unavailable: true,
  });
  expect(
    await request({ action: "save-template", type: "pending-file-check" })
  ).toMatchObject({ allowed: true, hasPending: false });
  expect(await request({ bindingId: "folio_unknown" })).toMatchObject({
    error: expect.any(String),
  });
  fresh = {
    ...initial,
    bridge: { ...initial.bridge, lease: { ...lease, id: "other-lease" } },
  };
  expect(await request({ type: "pending-file-get" })).toMatchObject({
    error: expect.any(String),
  });
  expect(screen.getByTitle("Office sandbox")).toBe(office);
  expect(transport.post).not.toHaveBeenCalled();
});

it("accepts a preserved session only for a completed Excel save with matching canonical and POC document keys, not the native cache key", async () => {
  transport.get.mockResolvedValue({
    ...config(),
    bridge: {
      ...config().bridge,
      uploadPoc: {
        ...uploadOptions("document", "editor-bridge"),
        action: "template-edit",
      },
    },
  });
  const onBridge = vi.fn();
  render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Excel background save"
      onBridgeMessage={onBridge}
    />
  );
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const plugin = pluginFrame(office);
  send(plugin.source, { type: "bridge-ready" });
  const cases = [
    { action: "save-template", documentKey: "old-document", expected: false },
    { action: "save-template", documentKey: undefined, expected: false },
    { action: "publish", documentKey: "document", expected: false },
    { action: "save-template", documentKey: "document", expected: true },
    { action: "save-template", documentKey: "document", expected: true },
  ];
  for (const [index, entry] of cases.entries()) {
    send(plugin.source, {
      action: entry.action,
      operation: {
        result: {
          documentKey: entry.documentKey,
          editorSessionPreserved: true,
        },
      },
      operationId: `background-${index}`,
      status: "completed",
      type: "operation",
    });
    expect(onBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: {
          result: {
            documentKey: entry.documentKey,
            editorSessionPreserved: entry.expected,
          },
        },
      })
    );
    expect(screen.getByTitle("Office sandbox")).toBe(office);
    expect(transport.get).toHaveBeenCalledTimes(1);
  }
});

it("renews the current workbook within one opening but rejects old captures after a native remount of the same canonical revision", async () => {
  const initial = exportConfig("document", "lease");
  const reopened = {
    ...initial,
    bridge: {
      ...initial.bridge,
      capabilities: { "export-workbook": "reopened-capability" },
    },
    config: { ...initial.config, document: { key: "native-reopened" } },
  };
  transport.get
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(initial)
    .mockResolvedValue(reopened);
  const capture = createRef<CaptureWorkbook>();
  const configUrl = "/api/forms/source/editor-config?responseId=response";
  const view = render(
    <OnlyOfficeEditor
      captureWorkbookRef={capture}
      configUrl={configUrl}
      title="Opening export"
    />
  );
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const plugin = pluginFrame(office);
  send(plugin.source, { type: "bridge-ready" });
  if (!capture.current) {
    throw new Error("Workbook capture is unavailable");
  }
  const oldSnapshot = await captureSnapshot(
    capture.current,
    plugin,
    "https://office.test/first"
  );
  expect(
    await oldSnapshot.refreshCapability(new AbortController().signal)
  ).toBe("capability-lease");
  const firstOpening = new URL(
    transport.get.mock.calls[0]?.[0] as string,
    window.location.origin
  ).searchParams.get("pdmsOpeningId");
  expect(
    new URL(
      transport.get.mock.calls[1]?.[0] as string,
      window.location.origin
    ).searchParams.get("pdmsOpeningId")
  ).toBe(firstOpening);
  view.rerender(
    <OnlyOfficeEditor
      captureWorkbookRef={capture}
      configUrl={configUrl}
      title="Opening export"
      revision={1}
    />
  );
  await waitFor(() =>
    expect(screen.getByTitle("Office sandbox")).not.toBe(office)
  );
  await expect(
    oldSnapshot.refreshCapability(new AbortController().signal)
  ).rejects.toThrow("session has changed");
  const current = pluginFrame(
    screen.getByTitle("Office sandbox") as HTMLIFrameElement
  );
  send(current.source, { type: "bridge-ready" });
  if (!capture.current) {
    throw new Error("Workbook capture is unavailable");
  }
  const currentSnapshot = await captureSnapshot(
    capture.current,
    current,
    "https://office.test/reopened"
  );
  expect(
    await currentSnapshot.refreshCapability(new AbortController().signal)
  ).toBe("reopened-capability");
  const nextOpening = new URL(
    transport.get.mock.calls[2]?.[0] as string,
    window.location.origin
  ).searchParams.get("pdmsOpeningId");
  expect(nextOpening).not.toBe(firstOpening);
  expect(
    new URL(
      transport.get.mock.calls[3]?.[0] as string,
      window.location.origin
    ).searchParams.get("pdmsOpeningId")
  ).toBe(nextOpening);
});

it("creates a fresh catalog opening when an existing new-entry transition reuses the editor URL", async () => {
  const view = render(
    <OnlyOfficeEditor configUrl="/editor-config" title="Entry editor" />
  );
  await screen.findByTitle("Office sandbox");
  const first = new URL(
    transport.get.mock.calls[0]?.[0] as string,
    window.location.origin
  ).searchParams.get("pdmsOpeningId");
  view.rerender(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Entry editor"
      revision={1}
      openingRevision={1}
    />
  );
  await waitFor(() => expect(transport.get).toHaveBeenCalledTimes(2));
  const next = new URL(
    transport.get.mock.calls[1]?.[0] as string,
    window.location.origin
  ).searchParams.get("pdmsOpeningId");
  expect(next).toBeTruthy();
  expect(next).not.toBe(first);
});

it("delivers the replacement opening catalog with its renewed capability without remounting the current editor", async () => {
  const lease = {
    expiresAt: "2099-01-01T00:00:00.000Z",
    id: "old-lease",
    releaseUrl: "/old-release",
    renewUrl: "/old-renew",
  };
  const previous = {
    names: ["old snapshot"],
    sessionId: "previous-catalog",
    status: "ready",
  };
  const replacement = {
    names: ["fresh snapshot"],
    sessionId: "replacement-catalog",
    status: "ready",
  };
  transport.get
    .mockResolvedValueOnce({
      ...config(),
      bridge: { ...config().bridge, lease },
      pdmsProjectCatalog: previous,
    })
    .mockResolvedValue({
      ...config(),
      bridge: {
        ...config().bridge,
        capabilities: { "configure-fields": "replacement-capability" },
        lease: { ...lease, id: "replacement-lease" },
      },
      pdmsProjectCatalog: replacement,
    });
  render(<OnlyOfficeEditor configUrl="/editor-config" title="Editor" />);
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const plugin = pluginFrame(office);
  send(plugin.source, { type: "bridge-ready" });
  send(plugin.source, {
    action: "configure-fields",
    requestId: "replacement-request",
    type: "capability-request",
  });
  await waitFor(() =>
    expect(plugin.send).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "replacement-capability",
        pdmsProjectCatalog: replacement,
        type: "capability-response",
      }),
      window.location.origin
    )
  );
  expect(screen.getByTitle("Office sandbox")).toBe(office);
});

it("rejects renewal into another document while preserving the live editor", async () => {
  transport.get.mockResolvedValueOnce(config()).mockResolvedValue({
    ...config(),
    bridge: { ...config().bridge, documentKey: "different-document" },
    config: {
      ...config().config,
      document: { key: "native-different-document" },
    },
    pdmsProjectCatalog: {
      names: [],
      sessionId: "different-document-catalog",
      status: "ready",
    },
  });
  render(<OnlyOfficeEditor configUrl="/editor-config" title="Editor" />);
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const plugin = pluginFrame(office);
  send(plugin.source, { type: "bridge-ready" });
  send(plugin.source, {
    action: "configure-fields",
    requestId: "stale-document-request",
    type: "capability-request",
  });
  await waitFor(() =>
    expect(plugin.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(String),
        type: "capability-response",
      }),
      window.location.origin
    )
  );
  expect(
    plugin.send.mock.calls.some(
      ([message]) =>
        message.type === "capability-response" && "capability" in message
    )
  ).toBe(false);
  expect(screen.getByTitle("Office sandbox")).toBe(office);
});

const SaveHost = () => {
  const [status, setStatus] = useState("ready");
  return (
    <>
      <output aria-label="Draft save status">{status}</output>
      <OnlyOfficeEditor
        configUrl="/editor-config"
        title="Editor"
        onBridgeMessage={(message) => {
          if (message.type === "operation") {
            setStatus(message.status);
          }
        }}
      />
    </>
  );
};
it("leaves pending state when the same failed attachment operation is replayed", async () => {
  render(<SaveHost />);
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const plugin = pluginFrame(office);
  send(plugin.source, { type: "bridge-ready" });
  const operation = {
    action: "save-draft",
    operationId: "unresolved-attachment",
    type: "operation",
  };
  send(plugin.source, { ...operation, status: "pending" });
  expect(screen.getByLabelText("Draft save status").textContent).toBe(
    "pending"
  );
  send(plugin.source, {
    ...operation,
    error: "Contact Admin",
    status: "failed",
  });
  expect(screen.getByLabelText("Draft save status").textContent).toBe("failed");
  send(plugin.source, { ...operation, status: "pending" });
  expect(screen.getByLabelText("Draft save status").textContent).toBe(
    "pending"
  );
  send(plugin.source, {
    ...operation,
    error: "Contact Admin",
    status: "failed",
  });
  expect(screen.getByLabelText("Draft save status").textContent).toBe("failed");
});

const rowTransitionHostConfig = (documentKey: string, lastRow: number) => ({
  ...config(),
  bridge: {
    ...config().bridge,
    documentKey,
    uploadPoc: {
      ...uploadOptions(documentKey, "editor-bridge"),
      publicId: "form",
      responseId: "response",
      spreadsheetBindings: {
        fields: [],
        locations: { folio_rows: { firstRow: 6, lastRow } },
        table: {
          anchor: "folio_rows",
          columns: [
            {
              attachment: { category: "หลักฐาน" },
              id: "folio_file",
              key: "file",
              type: "text",
            },
          ],
          id: "folio_rows",
          key: "items",
        },
      },
    },
  },
});
it("holds an internal row completion instead of remounting over a later confirmed File", async () => {
  const initial = rowTransitionHostConfig("document-1", 8);
  transport.get.mockImplementation((path: string) =>
    Promise.resolve(
      path === "/api/operations/late-row"
        ? {
            operation: {
              id: "late-row",
              responseId: "response",
              result: {
                attachmentTransition: {
                  fromDocumentKey: "document-1",
                  newRowCount: 2,
                  oldRowCount: 3,
                  rowMapping: [null, 0, 1],
                  tableBindingId: "folio_rows",
                  toDocumentKey: "document-2",
                },
                documentKey: "document-2",
              },
              status: "completed",
              type: "save_draft",
            },
          }
        : initial
    )
  );
  const ready = vi.fn();
  const onBridge = vi.fn();
  render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Late row File"
      onCommandReadyChange={ready}
      onBridgeMessage={onBridge}
    />
  );
  const office = await screen.findByTitle<HTMLIFrameElement>("Office sandbox");
  const plugin = pluginFrame(office);
  const picker = pluginFrame(office);
  send(plugin.source, { type: "bridge-ready" });
  send(plugin.source, {
    action: "save-draft",
    status: "pending",
    type: "operation",
  });
  send(picker.source, {
    bindingId: "folio_file",
    documentKey: "document-1",
    file: new File(["later"], "later.TXT"),
    requestId: "late-file",
    rowIndex: 2,
    scopeIdentity: "actor/response",
    source: "folio-upload-poc",
    tag: "items.file",
    type: "pending-file-set",
  });
  await waitFor(() =>
    expect(picker.send).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "later.TXT" }),
      window.location.origin
    )
  );
  send(plugin.source, {
    action: "save-draft",
    operation: { result: { documentKey: "document-2" } },
    operationId: "late-row",
    status: "completed",
    type: "operation",
  });
  await waitFor(() =>
    expect(onBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        editorRemountSafe: false,
        hasPendingAttachments: true,
        status: "completed",
      })
    )
  );
  expect(ready).toHaveBeenLastCalledWith(false);
  expect(screen.getByTitle("Office sandbox")).toBe(office);
  expect(office.closest("[inert]")).not.toBeNull();
  expect(plugin.send).toHaveBeenCalledWith(
    expect.objectContaining({ type: "hold-editor" }),
    window.location.origin
  );
  expect(transport.postForm).not.toHaveBeenCalled();
});

it("keeps pending table bytes through a real host remount only after reading the authoritative row Operation", async () => {
  let current = rowTransitionHostConfig("document-1", 8);
  const proof = createDeferred<unknown>();
  transport.get.mockImplementation((path: string) =>
    path === "/api/operations/row-operation"
      ? proof.promise
      : Promise.resolve(current)
  );
  const onBridge = vi.fn();
  const view = render(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Row continuity"
      onBridgeMessage={onBridge}
    />
  );
  const office = await screen.findByTitle<HTMLIFrameElement>("Office sandbox");
  const plugin = pluginFrame(office);
  send(plugin.source, { type: "bridge-ready" });
  const picker = pluginFrame(office);
  const selected = new File(["row"], "row.TXT");
  const request = {
    bindingId: "folio_file",
    documentKey: "document-1",
    requestId: "row-file",
    rowIndex: 2,
    scopeIdentity: "actor/response",
    source: "folio-upload-poc",
    tag: "items.file",
  };
  send(picker.source, { ...request, file: selected, type: "pending-file-set" });
  await waitFor(() =>
    expect(picker.send).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "row.TXT", size: 3 }),
      window.location.origin
    )
  );
  send(plugin.source, {
    action: "save-draft",
    operation: { result: { documentKey: "forged-document" } },
    operationId: "row-operation",
    status: "completed",
    type: "operation",
  });
  await waitFor(() =>
    expect(transport.get).toHaveBeenCalledWith("/api/operations/row-operation")
  );
  expect(onBridge).not.toHaveBeenCalledWith(
    expect.objectContaining({ status: "completed" })
  );
  expect(screen.getByTitle("Office sandbox")).toBe(office);
  await act(async () => {
    proof.resolve({
      operation: {
        id: "row-operation",
        responseId: "response",
        result: {
          attachmentTransition: {
            fromDocumentKey: "document-1",
            newRowCount: 2,
            oldRowCount: 3,
            rowMapping: [null, 0, 1],
            tableBindingId: "folio_rows",
            toDocumentKey: "document-2",
          },
          documentKey: "document-2",
        },
        status: "completed",
        type: "save_draft",
      },
    });
    await proof.promise;
  });
  await waitFor(() =>
    expect(onBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        hasPendingAttachments: true,
        operation: {
          result: expect.objectContaining({ documentKey: "document-2" }),
        },
        status: "completed",
      })
    )
  );
  current = rowTransitionHostConfig("document-2", 7);
  view.rerender(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      revision={1}
      title="Row continuity"
      onBridgeMessage={onBridge}
    />
  );
  await waitFor(() =>
    expect(screen.getByTitle("Office sandbox")).not.toBe(office)
  );
  const nextOffice = screen.getByTitle<HTMLIFrameElement>("Office sandbox");
  const nextPicker = pluginFrame(nextOffice);
  send(nextPicker.source, {
    ...request,
    documentKey: "document-2",
    rowIndex: 1,
    type: "pending-file-get",
  });
  await waitFor(() =>
    expect(nextPicker.send).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "row.TXT",
        hasPending: true,
        size: 3,
      }),
      window.location.origin
    )
  );
  send(nextPicker.source, {
    ...request,
    documentKey: "document-2",
    rowIndex: 0,
    type: "pending-file-get",
  });
  await waitFor(() =>
    expect(nextPicker.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ filename: null, hasPending: true }),
      window.location.origin
    )
  );
  view.unmount();
});

it("retains a File and dirty guard before held status, includes it in faster Save, and keeps it after status rejection", async () => {
  const initial = {
    ...exportConfig("document", "lease"),
    bridge: {
      ...exportConfig("document", "lease").bridge,
      uploadPoc: {
        ...uploadOptions("document", "editor-bridge"),
        publicId: "form",
        responseId: "response",
      },
    },
  };
  const heldStatus = createDeferred<{
    cleanupWarning: null;
    mutationNotice: null;
  }>();
  let statusRequests = 0;
  transport.get.mockImplementation((path: string) => {
    if (path === "/api/responses/response/attachment-status") {
      statusRequests += 1;
      if (statusRequests === 1) {
        return heldStatus.promise;
      }
      return Promise.resolve({ cleanupWarning: null, mutationNotice: null });
    }
    return Promise.resolve(initial);
  });
  transport.postForm.mockResolvedValue({
    action: "save-draft",
    operationCapability: "original-capability",
    operationId: "original-save",
    status: "pending",
  });
  const capture = createRef<CaptureWorkbook>();
  const dirty = vi.fn();
  const view = render(
    <OnlyOfficeEditor
      captureWorkbookRef={capture}
      configUrl="/editor-config"
      onDirtyChange={dirty}
      title="Held attachment status"
    />
  );
  const selected = new File(["retained during status outage"], "retained.txt");
  const statusError = new ApiError(
    503,
    "attachment_status_unavailable",
    "ยังตรวจสถานะไฟล์แนบไม่ได้ กรุณารักษาไฟล์ในหน้านี้ ห้ามส่งไฟล์ซ้ำ"
  );
  try {
    const office = (await screen.findByTitle(
      "Office sandbox"
    )) as HTMLIFrameElement;
    const picker = pluginFrame(office);
    send(picker.source, { type: "bridge-ready" });
    const slot = {
      bindingId: "folio_file",
      documentKey: "document",
      rowIndex: null,
      scopeIdentity: "actor/response",
      source: "folio-upload-poc",
      tag: "file",
    };
    send(picker.source, {
      ...slot,
      file: selected,
      requestId: "choose-held",
      type: "pending-file-set",
    });
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(
      picker.send.mock.calls.some(
        ([reply]) => reply.requestId === "choose-held"
      )
    ).toBe(false);
    if (!capture.current) {
      throw new Error("The actual host capture guard is unavailable");
    }
    await expect(capture.current()).rejects.toThrow(/ยังไม่บันทึก/u);
    send(picker.source, {
      ...slot,
      action: "save-draft",
      body: {},
      capability: "capability",
      requestId: "save-faster",
      snapshotUrl: "http://office.test/current.xlsx",
      type: "pending-file-save",
    });
    await waitFor(() => expect(transport.postForm).toHaveBeenCalledTimes(1));
    const multipart = transport.postForm.mock.calls[0]?.[1];
    const transmitted = multipart?.get("attachment:folio_file");
    expect(transmitted).toMatchObject({
      name: selected.name,
      size: selected.size,
    });
    heldStatus.reject(statusError);
    await waitFor(() =>
      expect(picker.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: statusError.message,
          requestId: "choose-held",
        }),
        window.location.origin
      )
    );
    expect(await screen.findByText(statusError.message)).toBeVisible();
    expect(dirty).toHaveBeenLastCalledWith(true);
    await expect(capture.current()).rejects.toThrow(/ยังไม่บันทึก|ยังยืนยันผล/u);
    send(picker.source, {
      ...slot,
      requestId: "read-retained",
      type: "pending-file-get",
    });
    await waitFor(() =>
      expect(picker.send).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: selected.name,
          requestId: "read-retained",
          size: selected.size,
        }),
        window.location.origin
      )
    );
    expect(transport.postForm).toHaveBeenCalledTimes(1);
  } finally {
    heldStatus.reject(statusError);
    view.unmount();
  }
});
