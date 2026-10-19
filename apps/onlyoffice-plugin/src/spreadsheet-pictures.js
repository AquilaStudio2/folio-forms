// oxlint-disable complexity func-style no-implicit-globals no-var vars-on-top prefer-destructuring no-loop-func -- Commands are serialized into the ONLYOFFICE sandbox; image filters run synchronously.
export function spreadsheetPictureCommand() {
  var input = Asc.scope.folioSpreadsheetPicture;
  var range = Api.GetDefName(input.anchor)?.GetRefersToRange();
  if (!range) {
    return false;
  }
  var sheet = range.GetWorksheet();
  var name = `folio_picture_${input.id}`;
  var previous = sheet
    .GetAllImages()
    .filter((image) => image.GetName() === name);
  if (input.select) {
    return previous.length === 1 && previous[0].Select(true) !== false;
  }
  if (previous.length > 1) {
    return false;
  }
  // Ensuring a frame is idempotent: metadata edits and retries must never
  // replace an attached picture (or create a second drawing).
  if (input.placeholder && previous.length === 1) {
    return true;
  }
  var frame = input.frame;
  if (
    frame &&
    (frame.id !== input.id ||
      frame.anchor !== input.anchor ||
      !Number.isSafeInteger(frame.width) ||
      frame.width < 1 ||
      !Number.isSafeInteger(frame.height) ||
      frame.height < 1 ||
      !Number.isSafeInteger(frame.columnOffset) ||
      frame.columnOffset < 0 ||
      !Number.isSafeInteger(frame.rowOffset) ||
      frame.rowOffset < 0)
  ) {
    return false;
  }
  var width = frame?.width || Math.max(1, Math.round(range.Width * 12_700));
  var height = frame?.height || Math.max(1, Math.round(range.Height * 12_700));
  if (!frame) {
    var scale = Math.min(
      width / input.width,
      height / input.height,
      input.placeholder ? Infinity : 9525
    );
    width = Math.max(1, Math.round(input.width * scale));
    height = Math.max(1, Math.round(input.height * scale));
  }
  if (previous.length === 1) {
    // Community 9.4 has no ApiImage.Delete. Replace the selected drawing in
    // the browser editor so its identity survives and the old picture is
    // retained if replacement fails.
    if (previous[0].Select(true) === false) {
      return false;
    }
    if (sheet.ReplaceCurrentImage(input.dataUrl, width, height) !== true) {
      return false;
    }
    if (frame) {
      var replaced = sheet
        .GetAllImages()
        .filter((image) => image.GetName() === name);
      if (replaced.length !== 1) {
        return false;
      }
      replaced[0].SetSize(frame.width, frame.height);
      replaced[0].SetPosition(
        range.GetCol() - 1,
        frame.columnOffset,
        range.GetRow() - 1,
        frame.rowOffset
      );
      replaced[0].SetLockValue("noMove", true);
      replaced[0].SetLockValue("noResize", false);
      replaced[0].SetLockValue("noSelect", false);
    }
    return true;
  }
  var picture = sheet.AddImage(
    input.dataUrl,
    width,
    height,
    range.GetCol() - 1,
    frame?.columnOffset || 0,
    range.GetRow() - 1,
    frame?.rowOffset || 0
  );
  if (!picture) {
    return false;
  }
  picture.SetName(name);
  if (frame) {
    picture.SetSize(frame.width, frame.height);
    picture.SetLockValue("noMove", true);
    picture.SetLockValue("noResize", false);
    picture.SetLockValue("noSelect", false);
  }
  return picture.GetName() === name;
}

// ONLYOFFICE 9.4 exposes no public position getter, and keyboard nudges can
// bypass noMove. Its drawing anchor is read-only compatibility data here;
// all position corrections use the public SetPosition API.
export function spreadsheetPictureReconcileCommand() {
  var input = Asc.scope.folioSpreadsheetPictureReconcile;
  var observed = {};
  var changed = false;
  for (var frame of input.frames) {
    var range = Api.GetDefName(frame.anchor)?.GetRefersToRange();
    if (!range) {
      return JSON.stringify({ ok: false });
    }
    var sheet = range.GetWorksheet();
    var name = `folio_picture_${frame.id}`;
    var images = sheet
      .GetAllImages()
      .filter((image) => image.GetName() === name);
    if (images.length > 1) {
      return JSON.stringify({ ok: false });
    }
    var image = images[0];
    if (!image) {
      image = sheet.AddImage(
        input.dataUrl,
        frame.width,
        frame.height,
        range.GetCol() - 1,
        frame.columnOffset,
        range.GetRow() - 1,
        frame.rowOffset
      );
      if (!image) {
        return JSON.stringify({ ok: false });
      }
      image.SetName(name);
      if (image.GetName() !== name) {
        return JSON.stringify({ ok: false });
      }
      changed = true;
    }
    var width = image.GetWidth();
    var height = image.GetHeight();
    if (
      !Number.isFinite(width) ||
      width <= 0 ||
      !Number.isFinite(height) ||
      height <= 0
    ) {
      return JSON.stringify({ ok: false });
    }
    var previous = input.observed[frame.id];
    var origin = image.Drawing?.drawingBase?.from;
    var knownOrigin =
      origin &&
      Number.isSafeInteger(origin.col) &&
      origin.col >= 0 &&
      origin.col < 16_384 &&
      Number.isSafeInteger(origin.row) &&
      origin.row >= 0 &&
      origin.row < 1_048_576 &&
      Number.isFinite(origin.colOff) &&
      origin.colOff >= 0 &&
      Number.isFinite(origin.rowOff) &&
      origin.rowOff >= 0 &&
      Number.isSafeInteger(Math.round(origin.colOff * 36_000)) &&
      Number.isSafeInteger(Math.round(origin.rowOff * 36_000));
    // Internal offsets are millimeters. Allow two EMU of serialization noise.
    // Unknown host shapes fall back to snapping, preserving the position rule.
    var moved =
      !knownOrigin ||
      origin.col !== range.GetCol() - 1 ||
      origin.row !== range.GetRow() - 1 ||
      Math.abs(origin.colOff * 36_000 - frame.columnOffset) > 2 ||
      Math.abs(origin.rowOff * 36_000 - frame.rowOffset) > 2;
    if (
      input.force ||
      moved ||
      !previous ||
      previous.width !== width ||
      previous.height !== height ||
      image.GetLockValue("noMove") !== true
    ) {
      image.SetPosition(
        range.GetCol() - 1,
        frame.columnOffset,
        range.GetRow() - 1,
        frame.rowOffset
      );
      changed = true;
    }
    for (var lock of [
      ["noMove", true],
      ["noResize", false],
      ["noSelect", false],
    ]) {
      if (image.GetLockValue(lock[0]) !== lock[1]) {
        image.SetLockValue(lock[0], lock[1]);
        changed = true;
      }
    }
    observed[frame.id] = { height, width };
  }
  return JSON.stringify({ changed, observed, ok: true });
}

// oxlint-disable-next-line avoid-new -- Browser file and image loading expose event callbacks.
export async function readSpreadsheetPictureFile(file) {
  if (!file || !["image/png", "image/jpeg"].includes(file.type)) {
    throw new Error("เลือกรูปภาพ JPEG หรือ PNG");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("รูปภาพต้องมีขนาดไม่เกิน 10 MB");
  }
  // oxlint-disable-next-line avoid-new -- FileReader exposes load/error events.
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), {
      once: true,
    });
    reader.addEventListener(
      "error",
      () => reject(new Error("อ่านไฟล์รูปภาพไม่ได้")),
      { once: true }
    );
    reader.readAsDataURL(file);
  });
  // oxlint-disable-next-line avoid-new -- Image decoding exposes load/error events.
  const image = await new Promise((resolve, reject) => {
    const preview = new Image();
    preview.addEventListener("load", () => resolve(preview), { once: true });
    preview.addEventListener(
      "error",
      () => reject(new Error("ไฟล์รูปภาพไม่ถูกต้อง")),
      { once: true }
    );
    preview.src = dataUrl;
  });
  if (
    !image.naturalWidth ||
    !image.naturalHeight ||
    image.naturalWidth > 4096 ||
    image.naturalHeight > 4096
  ) {
    throw new Error("รูปภาพต้องมีขนาดไม่เกิน 4096 × 4096 พิกเซล");
  }
  return { dataUrl, height: image.naturalHeight, width: image.naturalWidth };
}
