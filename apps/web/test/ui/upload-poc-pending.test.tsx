// oxlint-disable sort-keys -- Fixtures group protocol and binding fields in message order.
import { describe, expect, it } from "vitest";

import { UploadPocPendingFiles } from "@/features/onlyoffice/upload-poc-pending";

const options = {
  action: "draft",
  bridgeId: "bridge",
  documentKey: "draft-1",
  scopeIdentity: "actor/response",
  spreadsheetBindings: {
    fields: [{ id: "folio_scalar", key: "document", type: "text" }],
    locations: { folio_body: { firstRow: 6, lastRow: 8 } },
    table: {
      anchor: "folio_body",
      columns: [{ id: "folio_file", key: "file", type: "text" }],
      key: "items",
    },
  },
};
const message = (extra: Record<string, unknown> = {}) => ({
  bindingId: "folio_file",
  bridgeId: options.bridgeId,
  documentKey: options.documentKey,
  requestId: "picker-1",
  rowIndex: 0,
  scopeIdentity: options.scopeIdentity,
  source: "folio-upload-poc",
  tag: "items.file",
  type: "pending-file-get",
  ...extra,
});

describe("local POC pending files", () => {
  it("keeps rows isolated, replaces locally, and retains selections across append/document remount", () => {
    const store = new UploadPocPendingFiles();
    const first = new File(["one"], "one.txt");
    const second = new File(["two"], "two.txt");
    expect(
      store.handle(message({ file: first, type: "pending-file-set" }), options)
    ).toMatchObject({ filename: "one.txt", size: 3 });
    store.handle(
      message({ file: second, rowIndex: 1, type: "pending-file-set" }),
      options
    );
    expect(store.handle(message(), options).filename).toBe("one.txt");
    expect(store.handle(message({ rowIndex: 1 }), options).filename).toBe(
      "two.txt"
    );
    store.handle(
      message({
        file: new File(["replacement"], "replacement.txt"),
        type: "pending-file-set",
      }),
      options
    );
    expect(store.handle(message(), options).filename).toBe("replacement.txt");
    expect(
      store.handle(
        message({
          action: "append-row",
          rowIndex: 3,
          type: "pending-file-check",
        }),
        options
      )
    ).toMatchObject({ allowed: true, hasPending: true });
    const refreshed = {
      ...options,
      bridgeId: "next-bridge",
      documentKey: "draft-2",
      spreadsheetBindings: {
        ...options.spreadsheetBindings,
        locations: { folio_body: { firstRow: 6, lastRow: 9 } },
      },
    };
    expect(
      store.handle(
        message({ bridgeId: "next-bridge", documentKey: "draft-2" }),
        refreshed
      ).filename
    ).toBe("replacement.txt");
    expect(
      store.handle(
        message({
          bridgeId: "next-bridge",
          documentKey: "draft-2",
          rowIndex: 3,
        }),
        refreshed
      ).filename
    ).toBeNull();
    expect(
      store.handle(
        message({
          bridgeId: "next-bridge",
          documentKey: "draft-2",
          scopeIdentity: "other",
        }),
        { ...refreshed, scopeIdentity: "other" }
      ).filename
    ).toBeNull();
  });
  it.each([
    { bridgeId: "wrong" },
    { documentKey: "wrong" },
    { scopeIdentity: "wrong" },
    { bindingId: "folio_other" },
    { tag: "other.file" },
    { rowIndex: -1 },
    { rowIndex: 3 },
    { bindingId: "folio_scalar", rowIndex: 0, tag: "document" },
  ])("rejects mismatched message %j", (change) => {
    expect(() =>
      new UploadPocPendingFiles().handle(message(change), options)
    ).toThrow();
  });
  it("accepts scalar null identity and blocks every explicit save and row deletion with pending files", () => {
    const store = new UploadPocPendingFiles();
    store.handle(
      message({
        bindingId: "folio_scalar",
        file: new File(["proof"], "proof.txt"),
        rowIndex: null,
        tag: "document",
        type: "pending-file-set",
      }),
      options
    );
    for (const action of [
      "save-draft",
      "submit",
      "publish",
      "save-template",
      "save-correction",
      "delete-row",
    ]) {
      expect(() =>
        store.handle(message({ type: "pending-file-check", action }), options)
      ).toThrow();
    }
    expect(() =>
      store.handle(
        message({
          action: "append-row",
          rowIndex: 1,
          type: "pending-file-check",
        }),
        options
      )
    ).toThrow(/ท้ายตาราง/u);
  });
  it("rejects non-Files and files over the stated 10MB POC limit without replacing the retained file", () => {
    const store = new UploadPocPendingFiles();
    store.handle(
      message({ file: new File(["ok"], "ok.txt"), type: "pending-file-set" }),
      options
    );
    expect(() =>
      store.handle(
        message({ file: { name: "fake" }, type: "pending-file-set" }),
        options
      )
    ).toThrow(/10 MB/u);
    expect(() =>
      store.handle(
        message({
          file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.bin"),
          type: "pending-file-set",
        }),
        options
      )
    ).toThrow(/10 MB/u);
    expect(store.handle(message(), options).filename).toBe("ok.txt");
  });
  it("keeps deferred correction editing unavailable but existing correction saves work with no pending file", () => {
    const store = new UploadPocPendingFiles();
    const correction = { ...options, action: "correction" };
    expect(() => store.handle(message(), correction)).toThrow(/แก้ไข/u);
    expect(
      store.handle(
        message({ action: "save-correction", type: "pending-file-check" }),
        correction
      ).allowed
    ).toBe(true);
  });
});
