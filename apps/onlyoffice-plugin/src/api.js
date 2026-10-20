// oxlint-disable func-style sort-keys no-implicit-globals no-unused-vars consistent-function-scoping complexity prefer-named-capture-group require-unicode-regexp avoid-new prefer-await-to-callbacks no-empty-function no-useless-return logical-assignment-operators no-useless-spread no-await-in-loop prefer-await-to-then prefer-dom-node-remove prefer-dom-node-append no-plusplus prefer-spread -- Plugin runs inside the constrained ONLYOFFICE host runtime.
import { API_ROUTES } from "./constants.js";
import { isRecord, requireOption } from "./values.js";

export function createApi(options) {
  function requestError(payload, status) {
    const code =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : undefined;
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message.trim()
        : "";
    let detail = message || code || "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
    if (code === "duplicate_field_tag") {
      detail = "tag นี้ซ้ำ กรุณาใช้ tag อื่น";
    } else if (
      code === "invalid_field_config" &&
      !/[\u0E00-\u0E7F]/.test(message)
    ) {
      detail =
        "การตั้งค่าช่องไม่ถูกต้อง กรุณาตรวจสอบชื่อช่อง tag ชนิดข้อมูล และตัวเลือก แล้วลองอีกครั้ง";
    }
    const error = new Error(detail);
    error.code = code;
    error.httpStatus = status;
    error.detail = message || code;
    return error;
  }
  function apiUrl(path) {
    const base = options.apiBase;

    if (!base) {
      return path;
    }

    return `${base}${path}`;
  }

  async function requestJson(path, init, capability) {
    const headers = new Headers();
    headers.set(
      "X-Editor-Capability",
      requireOption(capability, "editor capability")
    );

    if (init?.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    let response;
    let text;
    try {
      response = await fetch(apiUrl(path), {
        ...init,
        credentials: "omit",
        headers,
        signal: controller.signal,
      });
      text = await response.text();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          "การเชื่อมต่อใช้เวลานานเกินไป กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง",
          { cause: error }
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
    let payload = {};

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {
          message: text,
        };
      }
    }

    if (!response.ok) {
      throw requestError(payload, response.status);
    }

    if (isRecord(payload) && payload.ok === false) {
      throw requestError(payload, response.status);
    }

    return payload;
  }

  function adminFormPath(suffix) {
    const publicId = encodeURIComponent(
      requireOption(options.publicId, "publicId")
    );
    return `${API_ROUTES.ADMIN_FORMS}/${publicId}/${suffix}`;
  }

  return { adminFormPath, requestJson };
}
