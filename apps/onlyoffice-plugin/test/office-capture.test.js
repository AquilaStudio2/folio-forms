import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import { createOffice } from "../src/office.js";

test("native workbook capture works when Folio plugin and editor have different origins without losing active cell edits", async () => {
  const previous = globalThis.window;
  let editing = true;
  const nativeEditor = {
    asc_closeCellEditor: () => {
      editing = false;
      return true;
    },
    asc_getCellEditMode: () => editing,
  };
  const nativeApi = {
    GetActiveSheet: () => ({ worksheet: { workbook: { oApi: nativeEditor } } }),
  };
  globalThis.window = {
    Asc: {
      plugin: {
        callCommand(command, _close, _recalculate, done) {
          done(
            runInNewContext(`(${command.toString()})()`, {
              Api: nativeApi,
              Asc: { scope: {} },
            })
          );
        },
        executeMethod(method, args, done) {
          if (method !== "GetFileToDownload" || args[0] !== "xlsx" || editing) {
            throw new Error("Native snapshot must include confirmed cell edit");
          }
          done("https://office.example.test/cache/snapshot.xlsx");
        },
      },
    },
    clearTimeout,
    get parent() {
      throw new DOMException("Blocked cross-origin frame", "SecurityError");
    },
    setTimeout,
  };
  try {
    expect(await createOffice({ documentKind: "xlsx" }).captureWorkbook()).toBe(
      "https://office.example.test/cache/snapshot.xlsx"
    );
    expect(editing).toBe(false);
  } finally {
    globalThis.window = previous;
  }
});
