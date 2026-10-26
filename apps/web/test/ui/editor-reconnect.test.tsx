// oxlint-disable max-classes-per-file -- Each native-editor lifecycle fixture implements the SDK constructor.
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnlyOfficeEditor } from "@/components/onlyoffice-editor";
import type * as ApiModule from "@/lib/api";
import { createDeferred } from "@/lib/form-lifecycle";

const transport = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiDelete: transport.remove,
  apiGet: transport.get,
  apiPost: transport.post,
}));
const config = () => ({
  bridge: {
    capabilities: { "configure-fields": "initial-cap" },
    id: "editor-bridge",
    pluginOrigin: window.location.origin,
  },
  config: { document: { key: "document" }, editorConfig: { mode: "edit" } },
});
let documentStateChanged: ((event: { data: boolean }) => void) | undefined;
beforeEach(() => {
  transport.get.mockReset().mockResolvedValue(config());
  transport.post.mockReset();
  transport.remove.mockReset();
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
describe("ONLYOFFICE plugin reconnect", () => {
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
        error: expect.stringContaining("ตัวแก้ไขยังไม่ตอบรับคำสั่ง"),
        status: "failed",
      })
    );
    expect(screen.getByTitle("Office sandbox")).toBe(office);
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
      expect.objectContaining({ action: "submit", status: "failed" })
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
    fields: [{ id: "folio_file", key: "file", type: "text" }],
    table: null,
  },
});

it("keeps POC Files in the host across native remount and rejects messages outside the current trusted editor", async () => {
  const firstConfig = {
    ...config(),
    bridge: {
      ...config().bridge,
      uploadPoc: uploadOptions("document-1", "editor-bridge"),
    },
  };
  const nextConfig = {
    ...config(),
    bridge: {
      ...config().bridge,
      id: "next-bridge",
      uploadPoc: uploadOptions("document-2", "next-bridge"),
    },
  };
  transport.get
    .mockReset()
    .mockResolvedValueOnce(firstConfig)
    .mockResolvedValue(nextConfig);
  const view = render(
    <OnlyOfficeEditor configUrl="/editor-config" title="Excel files" />
  );
  const office = (await screen.findByTitle(
    "Office sandbox"
  )) as HTMLIFrameElement;
  const picker = pluginFrame(office);
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
  expect(picker.send).toHaveBeenLastCalledWith(
    expect.objectContaining({
      filename: "proof.txt",
      size: 5,
      type: "pending-file-result",
    }),
    window.location.origin
  );
  picker.send.mockClear();
  send(picker.source, { ...request, bindingId: "folio_unknown" });
  expect(picker.send).toHaveBeenLastCalledWith(
    expect.objectContaining({ error: expect.any(String) }),
    window.location.origin
  );
  view.rerender(
    <OnlyOfficeEditor
      configUrl="/editor-config"
      title="Excel files"
      revision={1}
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
  expect(reconnected.send).toHaveBeenLastCalledWith(
    expect.objectContaining({ filename: "proof.txt", size: 5 }),
    window.location.origin
  );
  expect(transport.post).not.toHaveBeenCalled();
});

it("refreshes trusted Admin bindings without remount so new scalar/table pickers work and obsolete metadata fails closed", async () => {
  const options = {
    ...uploadOptions("document-1", "editor-bridge"),
    action: "template-edit",
    spreadsheetBindings: { fields: [], table: null },
  };
  const lease = {
    expiresAt: "2099-01-01",
    id: "same-lease",
    releaseUrl: "/release",
    renewUrl: "/renew",
  };
  const initial = {
    ...config(),
    bridge: { ...config().bridge, lease, uploadPoc: options },
  };
  let fresh = {
    ...initial,
    bridge: {
      ...initial.bridge,
      id: "refreshed-bridge",
      uploadPoc: {
        ...options,
        bridgeId: "refreshed-bridge",
        savedButtons: [] as {
          bindingId: string;
          tag: string;
          rowIndex: number | null;
        }[],
        spreadsheetBindings: {
          fields: [{ id: "folio_new", key: "new_file", type: "text" }],
          table: {
            anchor: "folio_body",
            columns: [{ id: "folio_column", key: "evidence", type: "text" }],
            id: "folio_table",
            key: "items",
          },
        },
      },
    },
  };
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
    bindingId: "folio_new",
    documentKey: "document-1",
    file: new File(["local"], "new.txt"),
    requestId: "fresh-scalar",
    rowIndex: null,
    scopeIdentity: "actor/response",
    source: "folio-upload-poc",
    tag: "new_file",
    type: "pending-file-set",
  };
  const request = async (data: Record<string, unknown>) => {
    picker.send.mockClear();
    send(picker.source, { ...message, ...data });
    await waitFor(() => expect(picker.send).toHaveBeenCalled());
    return picker.send.mock.calls.at(-1)?.[0];
  };
  expect(await request({})).toMatchObject({
    error: expect.stringContaining("ยังไม่บันทึก"),
  });
  expect(
    await request({ action: "save-template", type: "pending-file-check" })
  ).toMatchObject({ allowed: true, hasPending: false });
  fresh.bridge.uploadPoc.savedButtons = [
    { bindingId: "folio_new", rowIndex: null, tag: "new_file" },
    { bindingId: "folio_column", rowIndex: 0, tag: "items.evidence" },
  ];
  expect(await request({})).toMatchObject({
    bridgeId: "editor-bridge",
    filename: "new.txt",
  });
  expect(
    await request({
      bindingId: "folio_column",
      file: undefined,
      rowIndex: 1,
      tag: "items.evidence",
      type: "pending-file-get",
    })
  ).toMatchObject({ error: expect.stringContaining("ยังไม่บันทึก") });
  expect(
    await request({
      bindingId: "folio_column",
      file: new File(["row"], "row.txt"),
      rowIndex: 0,
      tag: "items.evidence",
    })
  ).toMatchObject({ filename: "row.txt" });
  expect(
    await request({
      bindingId: "folio_column",
      rowIndex: -1,
      tag: "items.evidence",
    })
  ).toMatchObject({ error: expect.any(String) });
  expect(await request({ bindingId: "folio_unknown" })).toMatchObject({
    error: expect.any(String),
  });
  fresh = {
    ...fresh,
    bridge: {
      ...fresh.bridge,
      uploadPoc: {
        ...fresh.bridge.uploadPoc,
        spreadsheetBindings: {
          ...fresh.bridge.uploadPoc.spreadsheetBindings,
          fields: [{ id: "folio_new", key: "renamed", type: "text" }],
        },
      },
    },
  };
  expect(
    await request({ file: undefined, type: "pending-file-get" })
  ).toMatchObject({ error: expect.any(String) });
  expect(
    await request({ file: undefined, tag: "renamed", type: "pending-file-get" })
  ).toMatchObject({ error: expect.stringContaining("ยังไม่บันทึก") });
  fresh.bridge.uploadPoc.savedButtons = [
    { bindingId: "folio_new", rowIndex: null, tag: "renamed" },
  ];
  expect(
    await request({ file: undefined, tag: "renamed", type: "pending-file-get" })
  ).toMatchObject({ filename: null });
  fresh = {
    ...fresh,
    bridge: {
      ...fresh.bridge,
      uploadPoc: {
        ...fresh.bridge.uploadPoc,
        spreadsheetBindings: {
          ...fresh.bridge.uploadPoc.spreadsheetBindings,
          fields: [],
        },
      },
    },
  };
  expect(
    await request({ tag: "renamed", type: "pending-file-get" })
  ).toMatchObject({ error: expect.any(String) });
  fresh = {
    ...fresh,
    bridge: { ...fresh.bridge, lease: { ...lease, id: "other-lease" } },
  };
  expect(
    await request({
      bindingId: "folio_column",
      rowIndex: 0,
      tag: "items.evidence",
      type: "pending-file-get",
    })
  ).toMatchObject({ error: expect.any(String) });
  expect(screen.getByTitle("Office sandbox")).toBe(office);
  expect(transport.post).not.toHaveBeenCalled();
});

it("accepts a preserved session only for a completed Excel save with matching native and POC document keys", async () => {
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
