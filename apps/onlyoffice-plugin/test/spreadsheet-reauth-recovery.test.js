import { expect, test } from "bun:test";

import { acknowledgeBridge, createHarness, flushPlugin } from "./harness.js";

test("a reauthenticated editor settles the exact old checkpoint without a polling capability or replay", async () => {
  const storageKey = "folio-xlsx-draft:template-recovery";
  const checkpoint = crypto.randomUUID();
  const leaseId = crypto.randomUUID();
  const operationId = crypto.randomUUID();
  const operation = { action: "save-template", operationId };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["new-lease-capability"],
    documentKind: "xlsx",
    responses: [
      { ...operation, status: "processing" },
      {
        ...operation,
        result: {
          bindingRevision: 1,
          documentKey: "saved-draft-key",
          editorSessionPreserved: true,
        },
        status: "completed",
      },
    ],
    scopeIdentity: "template-recovery",
    sessionStorageEntries: [
      [
        storageKey,
        JSON.stringify({ action: operation.action, checkpoint, leaseId }),
      ],
    ],
    spreadsheetBindings: { fields: [], table: null, version: 1 },
  });
  acknowledgeBridge(harness);
  await flushPlugin();

  const recovered = await harness.window.FormBridge.runAction("save-template");
  expect(recovered).toMatchObject({ ok: true, operationId });
  expect(harness.requests).toHaveLength(2);
  for (const { body, method, url } of harness.requests) {
    expect(method).toBe("POST");
    expect(url.endsWith("/xlsx-draft/recover")).toBe(true);
    expect(JSON.parse(body)).toEqual({ checkpoint, leaseId });
  }
  expect(harness.window.sessionStorage.getItem(storageKey)).toBeNull();
  expect(harness.messages.map(({ message }) => message)).toContainEqual(
    expect.objectContaining({
      operation: expect.objectContaining({
        result: expect.objectContaining({ editorSessionPreserved: false }),
      }),
      operationId,
      requestedAction: "save-template",
      status: "completed",
    })
  );
  expect(harness.editorRestriction).toBe("readOnly");
});
