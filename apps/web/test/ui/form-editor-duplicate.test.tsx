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
import { beforeEach, expect, it, vi } from "vitest";

import { SESSION_KEY } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const originalId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const copyId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const publishedForms = new Set<string>();

const formFor = (publicId: string) => ({
  activeDraftCount: 0,
  description: "",
  documentKind: "xlsx",
  fillMethod: "onlyoffice",
  id: publicId,
  publicId,
  status: publishedForms.has(publicId) ? "published" : "draft",
  title: publicId === originalId ? "Original" : "Copy",
});

const jsonResponse = (body: unknown): Promise<Response> =>
  Promise.resolve(Response.json(body));

beforeEach(() => {
  publishedForms.clear();
  localStorage.setItem(SESSION_KEY, "duplicate-test-token");
  // Keep the real router and editor bridge; replace only the external SDK and HTTP.
  vi.stubGlobal("DocsAPI", {
    DocEditor: class {
      constructor(
        elementId: string,
        options: { events: { onDocumentReady: () => void } }
      ) {
        const placeholder = document.querySelector(`#${elementId}`);
        if (!placeholder) {
          throw new Error("Missing native editor placeholder");
        }
        const frame = document.createElement("iframe");
        frame.title = "Native editor fixture";
        placeholder.replaceWith(frame);
        options.events.onDocumentReady();
      }

      destroyEditor = vi.fn();
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/session") {
        return jsonResponse({
          session: {
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
          user: {
            email: "admin@example.test",
            id: "admin",
            mustChangePassword: false,
            role: "admin",
          },
        });
      }
      if (path === `/api/admin/forms/${originalId}/duplicate`) {
        return jsonResponse({ form: formFor(copyId) });
      }
      for (const publicId of [originalId, copyId]) {
        if (path === `/api/admin/forms/${publicId}`) {
          return jsonResponse({
            editorConfigUrl: `/api/admin/forms/${publicId}/editor-config`,
            form: formFor(publicId),
          });
        }
        if (path === `/api/admin/forms/${publicId}/editor-config`) {
          return jsonResponse({
            bridge: {
              capabilities: {
                publish: "test-publish",
                "save-template": "test-save",
              },
              id: "editor-bridge",
              pluginOrigin: window.location.origin,
            },
            config: {
              document: { key: `document-${publicId}` },
              documentType: "cell",
              editorConfig: { mode: "edit" },
            },
          });
        }
      }
      throw new Error(`Unexpected request: ${path}`);
    })
  );
});

const openOriginal = async () => {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [`/admin/forms/${originalId}`],
    }),
    routeTree,
  });
  await router.load();
  render(<RouterProvider router={router} />);
};

const connectPlugin = async () => {
  const office = await screen.findByTitle("Native editor fixture");
  if (!(office instanceof HTMLIFrameElement) || !office.contentDocument?.body) {
    throw new Error("Missing native editor frame");
  }
  const plugin = document.createElement("iframe");
  office.contentDocument.body.append(plugin);
  const source = plugin.contentWindow;
  if (!source) {
    throw new Error("Missing plugin window");
  }
  const post = vi.spyOn(source, "postMessage");
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          bridgeId: "editor-bridge",
          source: "form-bridge",
          type: "bridge-ready",
        },
        origin: window.location.origin,
        source,
      })
    );
    await Promise.resolve();
  });
  return { post, source };
};

const completePublication = (publicId: string, source: Window) => {
  publishedForms.add(publicId);
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          action: "publish",
          bridgeId: "editor-bridge",
          operationId: `publish-${publicId}`,
          source: "form-bridge",
          status: "completed",
          type: "operation",
        },
        origin: window.location.origin,
        source,
      })
    );
  });
};

it("keeps a copy as a draft after publishing its source until explicitly published", async () => {
  await openOriginal();
  const original = await connectPlugin();
  const publish = screen.getByRole("button", { exact: true, name: "เผยแพร่" });
  await waitFor(() => expect(publish).toBeEnabled());
  fireEvent.click(publish);
  await waitFor(() =>
    expect(original.post).toHaveBeenCalledWith(
      expect.objectContaining({ action: "publish", type: "run-action" }),
      window.location.origin
    )
  );
  completePublication(originalId, original.source);
  await waitFor(() => expect(screen.getByText("เผยแพร่แล้ว")).toBeVisible());

  fireEvent.click(
    screen.getByRole("button", { exact: true, name: "สร้างสำเนา" })
  );
  await screen.findByRole("heading", { exact: true, name: "Copy" });
  const copy = await connectPlugin();
  expect(screen.getByText("ร่าง", { exact: true })).toBeVisible();
  expect(copy.post).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: "run-action" }),
    window.location.origin
  );

  const publishCopy = screen.getByRole("button", {
    exact: true,
    name: "เผยแพร่",
  });
  await waitFor(() => expect(publishCopy).toBeEnabled());
  fireEvent.click(publishCopy);
  await waitFor(() =>
    expect(copy.post).toHaveBeenCalledWith(
      expect.objectContaining({ action: "publish", type: "run-action" }),
      window.location.origin
    )
  );
  completePublication(copyId, copy.source);
  await waitFor(() => expect(screen.getByText("เผยแพร่แล้ว")).toBeVisible());
});

it("keeps a copy as a draft when its published source was opened on a fresh page", async () => {
  publishedForms.add(originalId);
  await openOriginal();
  const duplicate = await screen.findByRole("button", {
    exact: true,
    name: "สร้างสำเนา",
  });
  await waitFor(() => expect(duplicate).toBeEnabled());
  fireEvent.click(duplicate);
  await screen.findByRole("heading", { exact: true, name: "Copy" });
  const copy = await connectPlugin();
  expect(screen.getByText("ร่าง", { exact: true })).toBeVisible();
  expect(copy.post).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: "run-action" }),
    window.location.origin
  );
});
