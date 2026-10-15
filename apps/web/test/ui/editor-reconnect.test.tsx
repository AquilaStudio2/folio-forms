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
