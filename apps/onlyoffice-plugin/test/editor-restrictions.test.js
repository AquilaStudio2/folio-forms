// oxlint-disable prefer-await-to-callbacks node/callback-return -- The native SDK fixture exposes asynchronous method acknowledgements.
import { expect, test } from "bun:test";

import {
  acknowledgeBridge,
  completedOperation,
  createHarness,
  flushPlugin,
} from "./harness.js";

const spreadsheetBindings = {
  fields: [
    {
      anchor: "folio_month",
      id: "folio_month",
      key: "month",
      label: "Month",
      options: [],
      type: "text",
    },
  ],
  table: null,
  version: 1,
};

test.each(
  ["template-edit", "draft", "correction"].flatMap((action) =>
    ["readOnly", "forms"].map((restriction) => [action, restriction])
  )
)(
  "reopening an Excel %s restores editing from a retained %s restriction",
  async (action, restriction) => {
    const harness = createHarness({
      action,
      documentKind: "xlsx",
      initialEditorRestriction: restriction,
      spreadsheetBindings,
      spreadsheetSelection: {
        address: "B1",
        names: { folio_month: "'Form'!$B$1" },
        sheet: "Form",
      },
    });
    acknowledgeBridge(harness);
    await flushPlugin();

    expect(harness.editorRestriction).toBe("none");
    expect(harness.spreadsheetNames.get("folio_month")).toBe("'Form'!$B$1");
  }
);

test.each([
  ["template-edit", "save-template", "xlsx", "none"],
  ["draft", "save-draft", "xlsx", "none"],
  ["correction", "save-correction", "xlsx", "none"],
  ["draft", "save-draft", "docx", "forms"],
])(
  "%s %s for %s reports completion only after native editing is restored",
  async (editorAction, saveAction, documentKind, restoredRestriction) => {
    const harness = createHarness({
      action: editorAction,
      capabilityResponses: ["save-capability"],
      documentKind,
      responses: [
        { operationCapability: "poll", operationId: "template-save" },
        completedOperation({
          documentKey: "document-key",
          editorSessionPreserved: true,
        }),
      ],
      spreadsheetBindings,
      spreadsheetSelection: {
        address: "B1",
        names: { folio_month: "'Form'!$B$1" },
        sheet: "Form",
      },
    });
    acknowledgeBridge(harness);
    await flushPlugin();

    let restoreEditing;
    const { executeMethod } = harness.window.Asc.plugin;
    harness.window.Asc.plugin.executeMethod = (method, args, done) => {
      if (
        method === "SetEditingRestrictions" &&
        args[0] === restoredRestriction &&
        harness.editorRestriction === "readOnly"
      ) {
        restoreEditing = () => executeMethod(method, args, done);
        return;
      }
      executeMethod(method, args, done);
    };
    const modesAtCompletion = [];
    const { postMessage } = harness.parentWindow;
    harness.parentWindow.postMessage = (message, origin) => {
      if (message.type === "operation" && message.status === "completed") {
        modesAtCompletion.push(harness.editorRestriction);
      }
      postMessage(message, origin);
    };

    const saving = harness.window.FormBridge.runAction(
      saveAction,
      "Correct answer"
    );
    await flushPlugin();
    expect(typeof restoreEditing).toBe("function");
    const modesBeforeUnlock = [...modesAtCompletion];
    expect(harness.editorRestriction).toBe("readOnly");
    restoreEditing();
    await expect(saving).resolves.toMatchObject({ ok: true });

    expect(modesBeforeUnlock).toEqual([]);
    expect(modesAtCompletion).toEqual([restoredRestriction]);
    expect(harness.spreadsheetNames.get("folio_month")).toBe("'Form'!$B$1");
  }
);
