/** Pin saved bytes while the converter downloads them, independent of editor saves. */
const snapshots = new Map<string, { bytes: Uint8Array; expiresAt: number }>();
const maximumSnapshotMs = 3 * 60_000;

export const spreadsheetExportSnapshot = (key: string): Uint8Array | null => {
  const snapshot = snapshots.get(key);
  if (!snapshot || snapshot.expiresAt <= Date.now()) {
    return null;
  }
  return new Uint8Array(snapshot.bytes);
};

export const withSpreadsheetExportSnapshot = async <T>(
  bytes: Uint8Array,
  convert: (key: string) => Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  signal?.throwIfAborted();
  const key = `xlsx-export-${crypto.randomUUID()}`;
  snapshots.set(key, {
    bytes: new Uint8Array(bytes),
    expiresAt: Date.now() + maximumSnapshotMs,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  // oxlint-disable-next-line promise/avoid-new -- Bound converter lifetime and release the immutable snapshot on timeout.
  const timeout = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error("Spreadsheet export was cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      snapshots.delete(key);
      reject(new Error("Spreadsheet export timed out"));
    }, maximumSnapshotMs);
  });
  try {
    return await Promise.race([convert(key), timeout]);
  } finally {
    clearTimeout(timer);
    if (abort) {
      signal?.removeEventListener("abort", abort);
    }
    snapshots.delete(key);
  }
};
