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
      id: "opening-bridge",
      pdmsProjectPopup: { channelId: "opening-popup", documentKey: "document" },
      pluginOrigin: window.location.origin,
    },
    config: { document: { key: "document" }, editorConfig: { mode: "edit" } },
  });
  vi.stubGlobal("DocsAPI", {
    DocEditor: class {
      constructor(
        id: string,
        options: { events: { onDocumentReady: () => void } }
      ) {
        const frame = document.createElement("iframe");
        frame.title = "Office popup fixture";
        document.querySelector(`#${id}`)?.replaceWith(frame);
        options.events.onDocumentReady();
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
    throw new Error("Popup fixture window missing");
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
          bridgeId: "opening-bridge",
          channelId: "opening-popup",
          documentKey: "document",
          ...data,
        },
        origin,
        source,
      })
    )
  );
};
const popupMessage = {
  instanceId: "popup-instance",
  sequence: 1,
  source: "folio-pdms-popup",
};

it("connects cell selection only between this opening's pinned popup and operation owner", async () => {
  render(<OnlyOfficeEditor configUrl="/editor-config" title="Excel" />);
  const office = (await screen.findByTitle(
    "Office popup fixture"
  )) as HTMLIFrameElement;
  const primary = child(office);
  const popup = child(office);
  const sibling = child(office);
  send(primary.source, { source: "form-bridge", type: "bridge-ready" });
  primary.receive.mockClear();
  send(popup.source, { ...popupMessage, type: "ready" });
  expect(popup.receive).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "folio-pdms-popup-host",
      type: "connected",
    }),
    window.location.origin
  );
  send(popup.source, { ...popupMessage, type: "locate" });
  expect(primary.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sequence: 1,
      source: "folio-pdms-popup-host",
      type: "locate",
    }),
    window.location.origin
  );

  primary.receive.mockClear();
  for (const message of [
    {
      ...popupMessage,
      documentKey: "previous-document",
      name: "forged",
      token: "target",
      type: "choose",
    },
    { ...popupMessage, action: "submit", type: "run-action" },
    {
      ...popupMessage,
      name: "forged",
      sequence: 0,
      token: "target",
      type: "choose",
    },
  ]) {
    send(popup.source, message);
  }
  send(sibling.source, {
    ...popupMessage,
    instanceId: "replacement",
    type: "ready",
  });
  send(sibling.source, {
    ...popupMessage,
    name: "forged",
    token: "target",
    type: "choose",
  });
  send(
    popup.source,
    { ...popupMessage, name: "forged", token: "target", type: "choose" },
    "https://foreign.example"
  );
  expect(primary.receive).not.toHaveBeenCalled();

  // The popup's own frame cannot promote itself into the capability/action bridge.
  send(popup.source, { source: "form-bridge", type: "bridge-ready" });

  send(primary.source, {
    instanceId: "popup-instance",
    sequence: 1,
    source: "form-bridge",
    state: {
      catalog: { names: ["โครงการ ก"], sessionId: "session", status: "ready" },
      target: { key: "project", label: "โครงการ", token: "target" },
    },
    type: "pdms-popup-state",
  });
  expect(popup.receive).toHaveBeenLastCalledWith(
    expect.objectContaining({
      state: expect.objectContaining({
        target: expect.objectContaining({ token: "target" }),
      }),
      type: "state",
    }),
    window.location.origin
  );
  popup.frame.remove();
  primary.receive.mockClear();
  send(popup.source, {
    ...popupMessage,
    name: "โครงการ ก",
    token: "target",
    type: "choose",
  });
  expect(primary.receive).not.toHaveBeenCalled();
});
