// oxlint-disable sort-keys -- Fixtures group protocol and binding fields in message order.
import { describe, expect, it, vi } from "vitest";

import { UploadPocPendingFiles } from "@/features/onlyoffice/upload-poc-pending";
import * as api from "@/lib/api";

const options = {
  action: "draft",
  bridgeId: "bridge",
  documentKey: "draft-1",
  scopeIdentity: "actor/response",
  spreadsheetBindings: {
    fields: [
      {
        attachment: { category: "หลักฐาน" },
        id: "folio_scalar",
        key: "document",
        type: "text",
      },
    ],
    locations: { folio_body: { firstRow: 6, lastRow: 8 } },
    table: {
      anchor: "folio_body",
      id: "folio_body",
      columns: [
        {
          attachment: { category: "หลักฐาน" },
          id: "folio_file",
          key: "file",
          type: "text",
        },
      ],
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

const sameRowsTransition = {
  fromDocumentKey: "draft-1",
  toDocumentKey: "draft-2",
  tableBindingId: "folio_body",
  oldRowCount: 3,
  newRowCount: 3,
  rowMapping: [0, 1, 2],
};
describe("local POC pending files", () => {
  it("keeps scalar removal local until explicit save and preserves a newer removal across an older receipt", async () => {
    sessionStorage.clear();
    const store = new UploadPocPendingFiles();
    const host = {
      ...options,
      publicId: "form",
      responseId: "response",
      savedData: {
        document: {
          file_link: "https://files.test/original.bin",
          original_name: "original.bin",
          size_bytes: 4,
        },
      },
    };
    const slot = { bindingId: "folio_scalar", rowIndex: null, tag: "document" };
    const post = vi.spyOn(api, "apiPostFormData").mockResolvedValue({
      action: "save-draft",
      operationId: "removed",
      operationCapability: "operation-capability",
      status: "pending",
    });
    try {
      expect(
        store.handle(message({ ...slot, type: "pending-file-remove" }), host)
      ).toMatchObject({
        removal: true,
        saved: { original_name: "original.bin", size_bytes: 4 },
      });
      expect(store.hasPending()).toBe(true);
      expect(post).not.toHaveBeenCalled();
      expect(
        store.handle(message({ ...slot, type: "pending-file-cancel" }), host)
      ).toMatchObject({
        removal: false,
        filename: null,
      });
      expect(store.hasPending()).toBe(false);
      store.handle(message({ ...slot, type: "pending-file-remove" }), host);
      await store.save(
        message({
          action: "save-draft",
          body: {},
          capability: "capability",
          snapshotUrl: "http://office.test/snapshot.xlsx",
          type: "pending-file-save",
        }),
        host
      );
      const multipart = post.mock.calls[0]?.[1];
      expect(multipart).toBeInstanceOf(FormData);
      expect(
        JSON.parse(String(multipart?.get("payload"))).attachmentRemovals
      ).toEqual([{ bindingId: "folio_scalar", rowIndex: null }]);
      expect(multipart?.has("attachment:folio_scalar")).toBe(false);
      store.handle(message({ ...slot, type: "pending-file-cancel" }), host);
      store.handle(message({ ...slot, type: "pending-file-remove" }), host);
      store.complete("removed");
      expect(store.hasPending()).toBe(true);
      expect(() =>
        store.handle(
          message({
            ...slot,
            documentKey: "draft-2",
            type: "pending-file-get",
          }),
          { ...host, documentKey: "draft-2" }
        )
      ).toThrow(/ยืนยันการย้าย/u);
      await store.save(
        message({
          action: "save-draft",
          body: {},
          capability: "capability",
          snapshotUrl: "http://office.test/next.xlsx",
          type: "pending-file-save",
        }),
        host
      );
      const newer = new File(["new"], "newer.bin");
      store.handle(
        message({ ...slot, type: "pending-file-set", file: newer }),
        host
      );
      store.complete("removed");
      expect([...store.snapshot().values()]).toEqual([newer]);
      expect(
        store.handle(message({ ...slot, type: "pending-file-get" }), host)
      ).toMatchObject({
        removal: false,
        hasPending: true,
        filename: "newer.bin",
      });
    } finally {
      vi.restoreAllMocks();
      sessionStorage.clear();
    }
  });
  it("keeps invalid replacements blocking after reopen until a valid choice or cancel restores the saved attachment", async () => {
    const store = new UploadPocPendingFiles();
    const slot = { bindingId: "folio_scalar", rowIndex: null, tag: "document" };
    const saved = {
      file_link: "https://files.test/original",
      original_name: "original.bin",
      size_bytes: 0,
    };
    const host = {
      ...options,
      publicId: "form",
      responseId: "response",
      savedData: { document: saved },
    };
    const post = vi.spyOn(api, "apiPostFormData");
    try {
      store.handle(
        message({
          ...slot,
          type: "pending-file-set",
          file: new File(["valid"], "valid.bin"),
        }),
        host
      );
      expect(() =>
        store.handle(
          message({
            ...slot,
            type: "pending-file-set",
            file: new File([new Uint8Array(10_000_001)], "large.bin"),
          }),
          host
        )
      ).toThrow(/10,000,000/u);
      expect(
        store.handle(message({ ...slot, type: "pending-file-get" }), host)
      ).toMatchObject({
        saved,
        filename: "valid.bin",
        validationError: expect.any(String),
      });
      await expect(
        store.save(
          message({
            action: "save-draft",
            body: {},
            capability: "cap",
            snapshotUrl: "http://office.test/snapshot.xlsx",
          }),
          host
        )
      ).rejects.toThrow(/10,000,000/u);
      expect(post).not.toHaveBeenCalled();
      expect(
        store.handle(message({ ...slot, type: "pending-file-cancel" }), host)
      ).toMatchObject({
        saved,
        filename: null,
        validationError: null,
        removal: false,
        hasPending: false,
      });
      store.handle(message({ ...slot, type: "pending-file-remove" }), host);
      expect(store.hasPending()).toBe(true);
      expect(
        store.handle(
          message({
            ...slot,
            type: "pending-file-check",
            action: "change-project",
          }),
          host
        )
      ).toMatchObject({ allowed: true, hasPending: true });
      expect(() =>
        store.handle(
          message({
            ...slot,
            type: "pending-file-get",
            documentKey: "draft-2",
          }),
          { ...host, documentKey: "draft-2" }
        )
      ).toThrow(/ยืนยันการย้าย/u);
      expect(
        store.handle(message({ ...slot, type: "pending-file-get" }), host)
      ).toMatchObject({
        removal: true,
        hasPending: true,
        saved,
      });
      const replacement = new File([], "empty");
      store.handle(
        message({ ...slot, type: "pending-file-set", file: replacement }),
        host
      );
      expect(
        store.handle(message({ ...slot, type: "pending-file-get" }), host)
      ).toMatchObject({
        saved,
        filename: "empty",
        size: 0,
        removal: false,
        validationError: null,
      });
      expect([...store.snapshot().values()]).toEqual([replacement]);
    } finally {
      vi.restoreAllMocks();
    }
  });
  it.each(["pending-file-cancel", "pending-file-remove"])(
    "rejects forged %s without discarding an existing File",
    (type) => {
      const store = new UploadPocPendingFiles();
      const slot = {
        bindingId: "folio_scalar",
        rowIndex: null,
        tag: "document",
      };
      const file = new File(["private"], "private.bin");
      store.handle(
        message({ ...slot, type: "pending-file-set", file }),
        options
      );
      for (const change of [
        { bridgeId: "wrong" },
        { documentKey: "stale" },
        { scopeIdentity: "other" },
        { bindingId: "folio_unknown" },
        { tag: "other" },
        { rowIndex: 0 },
      ]) {
        expect(() =>
          store.handle(message({ ...slot, type, ...change }), options)
        ).toThrow();
        expect([...store.snapshot().values()]).toEqual([file]);
      }
    }
  );
  it("retains the File until explicit negative-admission proof and never resends on lookup absence alone", async () => {
    sessionStorage.clear();
    const store = new UploadPocPendingFiles();
    const selected = new File(["private"], "private.bin");
    store.handle(
      message({
        bindingId: "folio_scalar",
        file: selected,
        rowIndex: null,
        tag: "document",
        type: "pending-file-set",
      }),
      options
    );
    const host = { ...options, publicId: "form", responseId: "response" };
    const save = message({
      action: "save-draft",
      body: {},
      capability: "old-capability",
      snapshotUrl: "http://office.test/snapshot.xlsx",
      type: "pending-file-save",
    });
    const post = vi
      .spyOn(api, "apiPostFormData")
      .mockRejectedValueOnce(new TypeError("transport interrupted"))
      .mockResolvedValue({
        action: "save-draft",
        operationId: "accepted",
        operationCapability: "operation-capability",
        status: "pending",
      });
    const lookup = vi
      .spyOn(api, "apiGet")
      .mockRejectedValue(
        new api.ApiError(404, "not_found", "not admitted yet")
      );
    const lease = {
      expiresAt: "2099-01-01T00:00:00.000Z",
      id: "new-lease",
      releaseUrl: "/release/new",
      renewUrl: "/renew/new",
    };
    const recover = vi
      .spyOn(api, "apiPost")
      .mockRejectedValueOnce(new TypeError("recovery response lost"))
      .mockResolvedValue({
        admission: "not-admitted",
        lease,
        revokedLeaseId: "old-lease",
      });
    try {
      await expect(store.save(save, host)).rejects.toThrow(
        "recovery response lost"
      );
      const key = `folio-attachment-checkpoint:${options.scopeIdentity}`;
      const originalCheckpoint = sessionStorage.getItem(key);
      expect(originalCheckpoint).toBeTruthy();
      expect([...store.snapshot().values()]).toEqual([selected]);
      expect(post).toHaveBeenCalledTimes(1);
      await expect(store.save(save, host)).rejects.toMatchObject({
        recoveredLease: lease,
      });
      expect(sessionStorage.getItem(key)).toBeNull();
      expect(post).toHaveBeenCalledTimes(1);
      expect(lookup).toHaveBeenCalledTimes(2);
      expect(recover).toHaveBeenLastCalledWith(
        `/api/responses/response/attachment-operations/${originalCheckpoint}/recover`,
        { action: "save-draft", documentKey: options.documentKey },
        "old-capability"
      );
      expect(store.hasPending()).toBe(true);
      const accepted = await store.save(
        { ...save, capability: "new-capability" },
        host
      );
      expect(accepted.operationId).toBe("accepted");
      expect(post).toHaveBeenCalledTimes(2);
      const body = post.mock.calls[1]?.[1];
      expect(body).toBeInstanceOf(FormData);
      const part = body?.get("attachment:folio_scalar");
      expect(part).toBeInstanceOf(File);
      if (!(part instanceof File)) {
        throw new Error(
          "The multipart attachment must retain its original filename"
        );
      }
      expect(part.name).toBe(selected.name);
      expect(part.type).toBe(selected.type);
      const reader = new FileReader();
      const read = Promise.withResolvers<undefined>();
      reader.addEventListener("load", () => {
        read.resolve();
      });
      reader.addEventListener("error", () => {
        read.reject(reader.error);
      });
      // oxlint-disable-next-line prefer-blob-reading-methods -- JSDOM File does not implement Blob.text().
      reader.readAsText(part);
      await read.promise;
      expect(reader.result).toBe("private");
      expect([...store.snapshot().values()]).toEqual([selected]);
      store.complete("accepted");
      expect(store.hasPending()).toBe(false);
    } finally {
      vi.restoreAllMocks();
      sessionStorage.clear();
    }
  });
  it("joins a late original admission without clearing a newer File selection", async () => {
    sessionStorage.clear();
    const store = new UploadPocPendingFiles();
    const first = new File(["first"], "first.bin");
    const replacement = new File(["new"], "new.bin");
    const scalar = {
      bindingId: "folio_scalar",
      rowIndex: null,
      tag: "document",
      type: "pending-file-set",
    };
    store.handle(message({ ...scalar, file: first }), options);
    const host = { ...options, publicId: "form", responseId: "response" };
    const save = message({
      action: "save-draft",
      body: {},
      capability: "capability",
      snapshotUrl: "http://office.test/snapshot.xlsx",
      type: "pending-file-save",
    });
    const original = {
      action: "save-draft",
      operationId: "original",
      operationCapability: "operation-capability",
      status: "pending",
    };
    const post = vi
      .spyOn(api, "apiPostFormData")
      .mockRejectedValue(new TypeError("transport interrupted"));
    vi.spyOn(api, "apiGet")
      .mockRejectedValueOnce(
        new api.ApiError(404, "not_found", "not admitted yet")
      )
      .mockResolvedValue(original);
    vi.spyOn(api, "apiPost").mockRejectedValue(
      new TypeError("recovery unavailable")
    );
    try {
      await expect(store.save(save, host)).rejects.toThrow(
        "recovery unavailable"
      );
      store.handle(message({ ...scalar, file: replacement }), options);
      expect(await store.save(save, host)).toMatchObject(original);
      expect(post).toHaveBeenCalledTimes(1);
      store.complete("original");
      expect(store.hasPending()).toBe(true);
      expect([...store.snapshot().values()]).toEqual([replacement]);
    } finally {
      vi.restoreAllMocks();
      sessionStorage.clear();
    }
  });
  it("never treats an old completed receipt as acceptance of a current native snapshot or a newly selected File", async () => {
    sessionStorage.clear();
    const store = new UploadPocPendingFiles();
    const selected = new File(["new"], "new.bin");
    store.handle(
      message({
        bindingId: "folio_scalar",
        file: selected,
        rowIndex: null,
        tag: "document",
        type: "pending-file-set",
      }),
      options
    );
    const previous = crypto.randomUUID();
    const key = `folio-attachment-checkpoint:${options.scopeIdentity}`;
    sessionStorage.setItem(key, previous);
    const host = { ...options, publicId: "form", responseId: "response" };
    const save = message({
      action: "save-draft",
      body: {},
      capability: "capability",
      snapshotUrl: "http://office.test/current-native-edits.xlsx",
      type: "pending-file-save",
    });
    const original = {
      action: "save-draft",
      operationId: "old-completed",
      operationCapability: "old-cap",
      status: "completed",
    };
    vi.spyOn(api, "apiGet").mockResolvedValue(original);
    const post = vi.spyOn(api, "apiPostFormData").mockResolvedValue({
      action: "save-draft",
      operationId: "new-snapshot",
      operationCapability: "new-cap",
      status: "pending",
    });
    try {
      await expect(store.save(save, host)).rejects.toThrow(
        /ไม่ใช่ผลของข้อมูลปัจจุบัน/u
      );
      expect(post).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(key)).toBe(previous);
      expect([...store.snapshot().values()]).toEqual([selected]);
      expect(await store.pendingOperation(host)).toMatchObject(original);
      store.complete("old-completed", host, {
        documentKey: "draft-2",
        attachmentTransition: sameRowsTransition,
      });
      expect([...store.snapshot().values()]).toEqual([selected]);
      const nextOptions = { ...host, documentKey: "draft-2" };
      const accepted = await store.save(
        { ...save, documentKey: "draft-2" },
        nextOptions
      );
      expect(accepted.operationId).toBe("new-snapshot");
      expect(post).toHaveBeenCalledTimes(1);
      const body = post.mock.calls[0]?.[1];
      if (!(body instanceof FormData)) {
        throw new Error(
          "Current native edits must be sent in their own multipart snapshot"
        );
      }
      expect(JSON.parse(String(body.get("payload")))).toMatchObject({
        documentKey: "draft-2",
        snapshotUrl: "http://office.test/current-native-edits.xlsx",
      });
      expect(JSON.parse(String(body.get("payload"))).checkpoint).not.toBe(
        previous
      );
      store.complete("new-snapshot");
      expect(store.hasPending()).toBe(false);
    } finally {
      vi.restoreAllMocks();
      sessionStorage.clear();
    }
  });
  it("permits a new explicit snapshot only after a failed batch is proven canceled, retaining its unaccepted File", async () => {
    sessionStorage.clear();
    const store = new UploadPocPendingFiles();
    const selected = new File(["retry"], "retry.bin");
    store.handle(
      message({
        bindingId: "folio_scalar",
        file: selected,
        rowIndex: null,
        tag: "document",
        type: "pending-file-set",
      }),
      options
    );
    const host = { ...options, publicId: "form", responseId: "response" };
    const save = message({
      action: "save-draft",
      body: {},
      capability: "capability",
      snapshotUrl: "http://office.test/current.xlsx",
      type: "pending-file-save",
    });
    const post = vi
      .spyOn(api, "apiPostFormData")
      .mockResolvedValueOnce({
        action: "save-draft",
        operationId: "known-failed",
        operationCapability: "old-cap",
        status: "pending",
      })
      .mockResolvedValue({
        action: "save-draft",
        operationId: "new-explicit-save",
        operationCapability: "new-cap",
        status: "pending",
      });
    vi.spyOn(api, "apiGet").mockResolvedValue({
      action: "save-draft",
      batchState: "canceled",
      operationId: "known-failed",
      operationCapability: "old-cap",
      status: "failed",
    });
    try {
      await store.save(save, host);
      const key = `folio-attachment-checkpoint:${options.scopeIdentity}`;
      const original = sessionStorage.getItem(key);
      expect(await store.pendingOperation(host)).toBeNull();
      expect(sessionStorage.getItem(key)).toBeNull();
      expect([...store.snapshot().values()]).toEqual([selected]);
      expect(store.hasUnresolvedCommit()).toBe(false);
      const accepted = await store.save(save, host);
      expect(accepted.operationId).toBe("new-explicit-save");
      expect(post).toHaveBeenCalledTimes(2);
      expect(sessionStorage.getItem(key)).not.toBe(original);
      store.complete("new-explicit-save");
      expect(store.hasPending()).toBe(false);
    } finally {
      vi.restoreAllMocks();
      sessionStorage.clear();
    }
  });

  it("does not infer attachment authority from an old Tag or retain legacy Files", () => {
    const store = new UploadPocPendingFiles();
    const legacy = {
      ...options,
      spreadsheetBindings: {
        ...options.spreadsheetBindings,
        fields: [{ id: "folio_scalar", key: "attachment_1", type: "text" }],
      },
    };
    expect(
      store.handle(
        message({
          bindingId: "folio_scalar",
          rowIndex: null,
          tag: "attachment_1",
          file: new File(["private"], "private.txt"),
          type: "pending-file-set",
        }),
        legacy
      )
    ).toMatchObject({
      unavailable: true,
      error: expect.stringContaining("Admin"),
    });
    expect(store.hasPending()).toBe(false);
    expect(
      store.handle(
        message({ action: "submit", type: "pending-file-check" }),
        legacy
      )
    ).toMatchObject({ allowed: true, hasPending: false });
  });
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
    store.complete("append", options, {
      documentKey: "draft-2",
      attachmentTransition: { ...sameRowsTransition, newRowCount: 4 },
    });
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
    expect(() =>
      store.handle(
        message({
          bridgeId: "next-bridge",
          documentKey: "draft-2",
          scopeIdentity: "other",
        }),
        { ...refreshed, scopeIdentity: "other" }
      )
    ).toThrow(/บันทึกหรือยกเลิก/u);
    expect([...store.snapshot().values()]).toContain(second);
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
  it("accepts scalar null identity for explicit Save/Submit while retaining internal mutation guards", () => {
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
    for (const action of ["save-draft", "submit"]) {
      expect(
        store.handle(message({ type: "pending-file-check", action }), options)
      ).toMatchObject({ allowed: true, hasPending: true });
    }
    for (const action of [
      "publish",
      "save-template",
      "save-correction",
      "save-correction-workspace",
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
    expect(
      store.handle(
        message({
          type: "pending-file-check",
          action: "delete-row",
          rowIndex: 1,
        }),
        options
      )
    ).toMatchObject({ allowed: true, hasPending: true });
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
    ).toThrow(/10,000,000/u);
    expect(() =>
      store.handle(
        message({
          file: new File([new Uint8Array(10_000_001)], "large.bin"),
          type: "pending-file-set",
        }),
        options
      )
    ).toThrow(/10,000,000/u);
    expect(store.handle(message(), options).filename).toBe("ok.txt");
    expect(() => store.snapshot()).toThrow(/10,000,000/u);
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
    expect(
      store.handle(
        message({
          action: "save-correction-workspace",
          type: "pending-file-check",
        }),
        correction
      ).allowed
    ).toBe(true);
    expect(() =>
      store.handle(
        message({
          action: "save-correction-workspace",
          type: "pending-file-check",
        }),
        options
      )
    ).toThrow(/คำสั่ง POC/u);
    store.handle(
      message({
        file: new File(["pending"], "pending.txt"),
        type: "pending-file-set",
      }),
      options
    );
    expect(
      store.handle(
        message({
          action: "save-correction-workspace",
          type: "pending-file-check",
        }),
        correction
      )
    ).toMatchObject({ allowed: true, hasPending: true });
  });
  it("clears only accepted File objects and preserves a newer selection across document-key transition", () => {
    const store = new UploadPocPendingFiles();
    const first = new File([], "empty");
    const scalar = {
      bindingId: "folio_scalar",
      rowIndex: null,
      tag: "document",
      type: "pending-file-set",
    };
    store.handle(message({ ...scalar, file: first }), options);
    const accepted = store.snapshot();
    const replacement = new File(["new"], "new.bin");
    store.handle(message({ ...scalar, file: replacement }), options);
    store.accept(accepted);
    expect(store.hasPending()).toBe(true);
    expect([...store.snapshot().values()]).toEqual([replacement]);
    store.complete("ordinary-save", options, {
      documentKey: "draft-2",
      attachmentTransition: sameRowsTransition,
    });
    store.handle(
      message({
        type: "pending-file-check",
        action: "save-draft",
        documentKey: "draft-2",
      }),
      { ...options, documentKey: "draft-2" }
    );
    expect([...store.snapshot().values()]).toEqual([replacement]);
    store.accept(store.snapshot());
    expect(store.hasPending()).toBe(false);
  });
  it("moves original File identities and removals only through verified physical row transitions", () => {
    const store = new UploadPocPendingFiles();
    const selected = new File([], "empty.TXT");
    store.handle(
      message({ rowIndex: 2, type: "pending-file-set", file: selected }),
      options
    );
    store.handle(
      message({ rowIndex: 1, type: "pending-file-remove" }),
      options
    );
    expect(() =>
      store.handle(
        message({
          action: "delete-row",
          rowIndex: 1,
          type: "pending-file-check",
        }),
        options
      )
    ).toThrow(/บันทึกหรือยกเลิก/u);
    expect(
      store.handle(
        message({
          action: "delete-row",
          rowIndex: 0,
          type: "pending-file-check",
        }),
        options
      )
    ).toMatchObject({ allowed: true });
    expect(() =>
      store.complete("stale", options, {
        documentKey: "draft-2",
        attachmentTransition: {
          ...sameRowsTransition,
          fromDocumentKey: "older",
        },
      })
    ).toThrow(/mapping/u);
    expect(store.snapshot().get(JSON.stringify(["folio_file", 2]))).toBe(
      selected
    );
    store.complete("delete", options, {
      documentKey: "draft-2",
      attachmentTransition: {
        ...sameRowsTransition,
        newRowCount: 2,
        rowMapping: [null, 0, 1],
      },
    });
    const next = {
      ...options,
      documentKey: "draft-2",
      spreadsheetBindings: {
        ...options.spreadsheetBindings,
        locations: { folio_body: { firstRow: 6, lastRow: 7 } },
      },
    };
    expect(store.snapshot().get(JSON.stringify(["folio_file", 1]))).toBe(
      selected
    );
    expect(
      store.handle(message({ documentKey: "draft-2", rowIndex: 0 }), next)
    ).toMatchObject({ removal: true });
    expect(
      store.handle(message({ documentKey: "draft-2", rowIndex: 1 }), next)
    ).toMatchObject({ filename: "empty.TXT", size: 0 });
  });
  it("reads saved table slots by physical metadata rather than compact array position or dotted root tags", () => {
    const store = new UploadPocPendingFiles();
    const host = {
      ...options,
      savedData: {
        items: [
          {
            file: {
              row_index: 2,
              file_link: "https://files.test/two",
              original_name: "two.TXT",
              size_bytes: 0,
            },
          },
        ],
      },
    };
    expect(store.handle(message(), host).saved).toBeNull();
    expect(store.handle(message({ rowIndex: 2 }), host).saved).toEqual({
      file_link: "https://files.test/two",
      original_name: "two.TXT",
      size_bytes: 0,
    });
  });
});

it("sends table Files and removals through the existing multipart save while retaining original File identity", async () => {
  sessionStorage.clear();
  const store = new UploadPocPendingFiles();
  const selected = new File([], "empty.TXT");
  const host = { ...options, publicId: "form", responseId: "response" };
  store.handle(
    message({ rowIndex: 1, file: selected, type: "pending-file-set" }),
    host
  );
  store.handle(message({ rowIndex: 2, type: "pending-file-remove" }), host);
  const post = vi.spyOn(api, "apiPostFormData").mockResolvedValue({
    action: "save-draft",
    operationId: "row-files",
    operationCapability: "capability",
    status: "pending",
  });
  try {
    await store.save(
      message({
        action: "save-draft",
        body: {},
        capability: "capability",
        snapshotUrl: "http://office.test/snapshot.xlsx",
      }),
      host
    );
    const multipart = post.mock.calls[0]?.[1];
    if (!(multipart instanceof FormData)) {
      throw new Error(
        "The explicit table save must use the existing multipart transport"
      );
    }
    const file = multipart.get(
      `attachment:${encodeURIComponent(JSON.stringify(["folio_file", 1]))}`
    );
    expect(file).toBeInstanceOf(File);
    if (!(file instanceof File)) {
      throw new Error("Table upload part must contain original bytes");
    }
    expect(file.name).toBe("empty.TXT");
    expect(file.size).toBe(0);
    expect(
      JSON.parse(String(multipart.get("payload"))).attachmentRemovals
    ).toEqual([{ bindingId: "folio_file", rowIndex: 2 }]);
    expect(store.snapshot().get(JSON.stringify(["folio_file", 1]))).toBe(
      selected
    );
    store.complete("row-files");
    expect(store.hasPending()).toBe(false);
  } finally {
    vi.restoreAllMocks();
    sessionStorage.clear();
  }
});
