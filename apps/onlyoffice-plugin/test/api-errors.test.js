// oxlint-disable no-await-in-loop -- Each independent response is asserted before testing the next error shape.
import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import { createApi } from "../src/api.js";
import { API_ROUTES } from "../src/constants.js";
import { isRecord, requireOption } from "../src/values.js";

const requestFailure = async (body, status = 400) => {
  const client = runInNewContext(
    `(${createApi.toString()})({publicId: "form"})`,
    {
      API_ROUTES,
      AbortController,
      Headers,
      fetch: () => Promise.resolve(Response.json(body, { status })),
      isRecord,
      requireOption,
      window: { clearTimeout, setTimeout },
    }
  );
  try {
    await client.requestJson(
      "/api/admin/forms/form/spreadsheet-bindings",
      {},
      "capability"
    );
  } catch (error) {
    return error;
  }
  throw new Error("Expected the API request to fail");
};

test("duplicate tag errors show the exact actionable message and retain the stable code", async () => {
  const error = await requestFailure(
    { error: "duplicate_field_tag", message: "tag นี้ซ้ำ กรุณาใช้ tag อื่น" },
    409
  );
  expect(error).toMatchObject({
    code: "duplicate_field_tag",
    detail: "tag นี้ซ้ำ กรุณาใช้ tag อื่น",
    httpStatus: 409,
    message: "tag นี้ซ้ำ กรุณาใช้ tag อื่น",
  });
});

test("other invalid field configurations never become duplicate tag errors", async () => {
  for (const message of [
    "Duplicate key, identity, anchor, or column",
    "Invalid spreadsheet binding change",
    "",
  ]) {
    const error = await requestFailure({
      error: "invalid_field_config",
      message,
    });
    expect(error.code).toBe("invalid_field_config");
    expect(error.message).toBe(
      "การตั้งค่าช่องไม่ถูกต้อง กรุณาตรวจสอบชื่อช่อง tag ชนิดข้อมูล และตัวเลือก แล้วลองอีกครั้ง"
    );
    expect(error.message).not.toBe("tag นี้ซ้ำ กรุณาใช้ tag อื่น");
    expect(error.detail).toBe(message || "invalid_field_config");
  }
});

test("API errors prefer the server's human message over the error code", async () => {
  const message = "ตำแหน่งคอลัมน์ไม่ถูกต้อง กรุณาเลือกคอลัมน์ใหม่";
  expect(
    await requestFailure({ error: "invalid_field_config", message })
  ).toMatchObject({ code: "invalid_field_config", httpStatus: 400, message });
  expect(
    await requestFailure(
      { error: "forbidden", message: "ไม่มีสิทธิ์แก้ไขแบบฟอร์มนี้" },
      403
    )
  ).toMatchObject({
    code: "forbidden",
    httpStatus: 403,
    message: "ไม่มีสิทธิ์แก้ไขแบบฟอร์มนี้",
  });
});

test("logical failures share the same mapping and malformed error payloads have a readable fallback", async () => {
  expect(
    await requestFailure({ error: "duplicate_field_tag", ok: false }, 200)
  ).toMatchObject({
    code: "duplicate_field_tag",
    message: "tag นี้ซ้ำ กรุณาใช้ tag อื่น",
  });
  expect(
    await requestFailure({ error: { issue: "invalid" }, message: [] })
  ).toMatchObject({ httpStatus: 400, message: "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง" });
  expect(await requestFailure({ error: "unavailable" }, 503)).toMatchObject({
    code: "unavailable",
    httpStatus: 503,
    message: "unavailable",
  });
});
