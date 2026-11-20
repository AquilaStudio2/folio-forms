import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { OnlyOfficeEditor } from "@/components/onlyoffice-editor";

const transport = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<object>()),
  apiGet: transport.get,
}));

beforeEach(() => {
  transport.get.mockResolvedValue({
    bridge: {
      attachmentCategoryPopup: {
        channelId: "category-channel",
        documentKey: "document",
      },
      documentKey: "document",
      id: "bridge",
      pdmsProjectPopup: { channelId: "pdms-channel", documentKey: "document" },
      pluginOrigin: window.location.origin,
    },
    config: { document: { key: "document" }, editorConfig: { mode: "edit" } },
  });
  vi.stubGlobal("DocsAPI", {
    DocEditor: class {
      constructor(id: string) {
        const frame = document.createElement("iframe");
        frame.title = "Category Office";
        document.querySelector(`#${id}`)?.replaceWith(frame);
      }
      destroyEditor = vi.fn();
    },
  });
});

const child = (office: HTMLIFrameElement) => {
  const frame = document.createElement("iframe");
  office.contentDocument?.body.append(frame);
  const source = frame.contentWindow;
  if (!source) {
    throw new Error("Missing frame window");
  }
  return { frame, receive: vi.spyOn(source, "postMessage"), source };
};
const send = (
  source: Window,
  data: Record<string, unknown>,
  origin = window.location.origin
) => {
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          bridgeId: "bridge",
          channelId: "category-channel",
          documentKey: "document",
          ...data,
        },
        origin,
        source,
      })
    )
  );
};
const popup = {
  instanceId: "instance",
  source: "folio-attachment-category-popup",
};
const choice = {
  document_category_id: 1,
  storage_template_id: "new-template",
  template_name: "new",
};
const state = {
  categories: [{ id: 1, type: "category" }],
  currentChoice: {
    document_category_id: 1,
    storage_template_id: "saved-template",
    template_name: "saved",
  },
  error: null,
  status: "ready",
  target: "field:receipt",
  templates: [
    { document_category_id: 1, id: "new-template", template_name: "new" },
  ],
};
const primaryState = (requestId: string, overrides = {}) => ({
  requestId,
  source: "form-bridge",
  state,
  type: "attachment-category-popup-state",
  ...overrides,
});

it("buffers fresh category state, relays only current choices and closes on unmount alongside PDMS", async () => {
  const view = render(<OnlyOfficeEditor configUrl="/config" title="Excel" />);
  const office = (await screen.findByTitle(
    "Category Office"
  )) as HTMLIFrameElement;
  const primary = child(office);
  const category = child(office);
  const pdms = child(office);
  send(primary.source, { source: "form-bridge", type: "bridge-ready" });
  send(primary.source, primaryState("first"));
  send(
    primary.source,
    primaryState("second", {
      state: { ...state, categories: [], status: "loading" },
    })
  );
  send(category.source, { ...popup, type: "ready" });
  expect(category.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({
      instanceId: "instance",
      requestId: "second",
      source: "folio-attachment-category-popup-host",
      state: { ...state, categories: [], status: "loading" },
      type: "state",
    }),
    window.location.origin
  );
  send(primary.source, primaryState("second"));
  primary.receive.mockClear();
  send(category.source, { ...popup, requestId: "second", type: "shown" });
  send(category.source, { ...popup, requestId: "second", type: "retry" });
  send(category.source, {
    ...popup,
    capability: "never-forward",
    choice,
    requestId: "second",
    type: "choose",
  });
  expect(primary.receive.mock.calls.map(([message]) => message)).toEqual([
    {
      bridgeId: "bridge",
      channelId: "category-channel",
      documentKey: "document",
      requestId: "second",
      source: "folio-attachment-category-popup-host",
      type: "shown",
    },
    {
      bridgeId: "bridge",
      channelId: "category-channel",
      documentKey: "document",
      requestId: "second",
      source: "folio-attachment-category-popup-host",
      type: "retry",
    },
    {
      bridgeId: "bridge",
      channelId: "category-channel",
      choice,
      documentKey: "document",
      requestId: "second",
      source: "folio-attachment-category-popup-host",
      type: "choose",
    },
  ]);
  send(pdms.source, {
    channelId: "pdms-channel",
    instanceId: "pdms",
    sequence: 0,
    source: "folio-pdms-popup",
    type: "ready",
  });
  expect(pdms.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({
      source: "folio-pdms-popup-host",
      type: "connected",
    }),
    window.location.origin
  );
  view.unmount();
  expect(primary.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({ requestId: "second", type: "cancel" }),
    window.location.origin
  );
  expect(category.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({ requestId: "second", type: "close" }),
    window.location.origin
  );
});

it("rejects forged frames, scope, instances, requests and popup action authority", async () => {
  render(<OnlyOfficeEditor configUrl="/config" title="Excel" />);
  const office = (await screen.findByTitle(
    "Category Office"
  )) as HTMLIFrameElement;
  const primary = child(office);
  const category = child(office);
  const sibling = child(office);
  send(primary.source, { source: "form-bridge", type: "bridge-ready" });
  send(category.source, { ...popup, type: "ready" });
  send(primary.source, primaryState("active"));
  primary.receive.mockClear();
  category.receive.mockClear();
  for (const forged of [
    { ...popup, choice, requestId: "old", type: "choose" },
    {
      ...popup,
      choice: { ...choice, template_name: "saved" },
      requestId: "active",
      type: "choose",
    },
    {
      ...popup,
      bridgeId: "other",
      choice,
      requestId: "active",
      type: "choose",
    },
    {
      ...popup,
      channelId: "other",
      choice,
      requestId: "active",
      type: "choose",
    },
    {
      ...popup,
      choice,
      documentKey: "other",
      requestId: "active",
      type: "choose",
    },
    {
      ...popup,
      choice,
      instanceId: "other",
      requestId: "active",
      type: "choose",
    },
    { ...popup, action: "publish", requestId: "active", type: "run-action" },
    { source: "form-bridge", type: "bridge-ready" },
    {
      action: "publish",
      requestId: "cap",
      source: "form-bridge",
      type: "capability-request",
    },
    {
      requestId: "upload",
      source: "folio-upload-poc",
      type: "pending-file-save",
    },
  ]) {
    send(category.source, forged);
  }
  send(sibling.source, { ...popup, type: "ready" });
  send(sibling.source, { ...popup, requestId: "active", type: "cancel" });
  send(sibling.source, primaryState("forged"));
  send(
    category.source,
    { ...popup, choice, requestId: "active", type: "choose" },
    "https://foreign.example"
  );
  expect(primary.receive).not.toHaveBeenCalled();
  expect(category.receive).not.toHaveBeenCalled();
  // The popup cannot replace the command owner, even by imitating bridge-ready.
  send(
    primary.source,
    primaryState("active", {
      state: {
        ...state,
        categories: [],
        error: "Unavailable",
        status: "error",
      },
    })
  );
  expect(category.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({
      requestId: "active",
      state: expect.objectContaining({ error: "Unavailable", status: "error" }),
      type: "state",
    }),
    window.location.origin
  );
  send(category.source, { ...popup, requestId: "active", type: "cancel" });
  expect(primary.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({ requestId: "active", type: "cancel" }),
    window.location.origin
  );
  category.frame.remove();
  primary.receive.mockClear();
  send(category.source, { ...popup, requestId: "active", type: "retry" });
  expect(primary.receive).not.toHaveBeenCalled();
});

it("retires closed requests, validates display state and cancels a replaced command owner", async () => {
  const view = render(<OnlyOfficeEditor configUrl="/config" title="Excel" />);
  const office = (await screen.findByTitle(
    "Category Office"
  )) as HTMLIFrameElement;
  const primary = child(office);
  const category = child(office);
  const replacement = child(office);
  send(primary.source, { source: "form-bridge", type: "bridge-ready" });
  send(category.source, { ...popup, type: "ready" });
  send(primary.source, primaryState("first"));
  send(primary.source, {
    requestId: "first",
    source: "form-bridge",
    type: "attachment-category-popup-close",
  });
  expect(category.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({ requestId: "first", type: "close" }),
    window.location.origin
  );
  category.receive.mockClear();
  primary.receive.mockClear();
  send(primary.source, primaryState("first"));
  send(category.source, {
    ...popup,
    choice,
    requestId: "first",
    type: "choose",
  });
  send(
    primary.source,
    primaryState("invalid", { state: { ...state, categories: [123] } })
  );
  expect(primary.receive).not.toHaveBeenCalled();
  expect(category.receive).not.toHaveBeenCalled();
  send(
    primary.source,
    primaryState("second", {
      state: { ...state, categories: [], secret: "discard", status: "empty" },
    })
  );
  expect(category.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({
      requestId: "second",
      state: { ...state, categories: [], status: "empty" },
    }),
    window.location.origin
  );
  send(replacement.source, { source: "form-bridge", type: "bridge-ready" });
  expect(primary.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({ requestId: "second", type: "cancel" }),
    window.location.origin
  );
  expect(category.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({ requestId: "second", type: "close" }),
    window.location.origin
  );
  primary.receive.mockClear();
  replacement.receive.mockClear();
  send(primary.source, primaryState("third"));
  send(category.source, { ...popup, requestId: "second", type: "retry" });
  expect(primary.receive).not.toHaveBeenCalled();
  expect(replacement.receive).not.toHaveBeenCalled();
  send(replacement.source, primaryState("third"));
  send(category.source, { ...popup, requestId: "third", type: "shown" });
  expect(replacement.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({ requestId: "third", type: "shown" }),
    window.location.origin
  );
  view.unmount();
  replacement.receive.mockClear();
  send(category.source, {
    ...popup,
    choice,
    requestId: "third",
    type: "choose",
  });
  expect(replacement.receive).not.toHaveBeenCalled();
});
