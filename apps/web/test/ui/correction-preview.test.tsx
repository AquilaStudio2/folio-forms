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

it("Correction workspace completion reloads the document while preserving the reason and opening; explicit final Save alone leaves the editor", async () => {
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
            id: "correction-bridge",
            pluginOrigin: window.location.origin,
          },
          config: {
            document: { key: `workspace-${documentRevision}` },
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
  send({
    action: "save-correction-workspace",
    operationId: "preview-1",
    status: "pending",
    type: "operation",
  });
  documentRevision = 1;
  send({
    action: "save-correction-workspace",
    operation: { result: { documentKey: "workspace-1", workspaceSaved: true } },
    operationId: "preview-1",
    status: "completed",
    type: "operation",
  });
  await waitFor(() => expect(openings).toHaveLength(2));
  expect(openings[0]).not.toBe("");
  expect(openings[1]).toBe(openings[0]);
  expect(screen.getByRole("textbox", { name: "เหตุผลการแก้ไข" })).toHaveValue(
    "Reason typed before selecting"
  );
  expect(router.state.location.pathname).toBe(path);
  expect(screen.getByRole("button", { name: "บันทึก Correction" })).toBeEnabled();
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
  sendCurrent({
    action: "save-correction",
    operation: { result: { revision: 1 } },
    operationId: "reasoned-final",
    status: "completed",
    type: "operation",
  });
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/admin/results/${responseId}`)
  );
});
