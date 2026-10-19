import { prisma, OperationStatus } from "@onlyoffice/db";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import type { Elysia } from "elysia";

import { registerSpreadsheetBuilderRoutes } from "../documents/spreadsheets/engine";
import { spreadsheetExportSnapshot } from "../documents/spreadsheets/export-snapshot";
import { XLSX_CONTENT_TYPE } from "../documents/spreadsheets/workbook";
import { HttpError, fail } from "../http/errors";
import { readJsonRecord } from "../http/input";
import { corsOrigin } from "../http/origins";
import {
  verifyDocumentAccessToken,
  verifyOnlyOfficeAuthorization,
  pluginGuid,
  callbackClaim,
} from "../onlyoffice";
import { maxCallbackBodyBytes, finalizeCallback } from "../operations/callback";
import {
  updateOperationFailed,
  operationDocumentKey,
  consumeCallbackClaim,
} from "../operations/lifecycle";
import type { CallbackPayload } from "../operations/model";
import { cleanupTerminalOperationObjects } from "../operations/object-cleanup";
import { SpreadsheetValidationError } from "../operations/spreadsheet-document";
import {
  pluginIndexResponse,
  pluginOrigins,
  pluginScriptResponse,
  pluginSettingsIconResponse,
} from "../plugin-assets";
import { nativePdfDocument } from "../responses/native-document";
import { DOCX_CONTENT_TYPE, objectExists, streamObject } from "../storage";
import type { RouteDependencies } from "./dependencies";

export function registerOnlyOfficeRoutes(
  app: Elysia,
  dependencies: Pick<
    RouteDependencies,
    "allowedCallbackOrigins" | "callbackMaximumBytes"
  >
): void {
  const { allowedCallbackOrigins, callbackMaximumBytes } = dependencies;
  registerSpreadsheetBuilderRoutes(app);
  app
    .get("/onlyoffice/document/:key", async ({ request, params, query }) => {
      const { key } = params;
      const token = typeof query.token === "string" ? query.token : "";
      if (
        !verifyDocumentAccessToken(token, key) ||
        !verifyOnlyOfficeAuthorization(request.headers.get("authorization"), {
          url: request.url,
        })
      ) {
        fail(
          401,
          "unauthorized",
          "Document access token is invalid or expired"
        );
      }
      const exportSnapshot = spreadsheetExportSnapshot(key);
      if (exportSnapshot) {
        return new Response(exportSnapshot, {
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": XLSX_CONTENT_TYPE,
          },
        });
      }
      const objectKey = await operationDocumentKey(key);
      if (!objectKey || !(await objectExists(objectKey))) {
        fail(404, "not_found", "Document was not found");
      }
      if (query.pdf === "1" && !objectKey.endsWith(".xlsx")) {
        return new Response(await nativePdfDocument(key), {
          headers: { "Content-Type": DOCX_CONTENT_TYPE },
        });
      }
      return new Response(streamObject(objectKey), {
        headers: {
          "Content-Type": objectKey.endsWith(".xlsx")
            ? XLSX_CONTENT_TYPE
            : DOCX_CONTENT_TYPE,
        },
      });
    })
    .get("/onlyoffice-plugin/config.json", ({ request, set }) => {
      const origin = request.headers.get("origin");
      if (origin && !pluginOrigins.has(origin)) {
        fail(403, "forbidden_origin", "Origin is not allowed");
      }
      if (origin && origin !== corsOrigin) {
        set.headers["Access-Control-Allow-Origin"] = origin;
        set.headers.Vary = "Origin";
      }
      return {
        guid: pluginGuid,
        name: "ตั้งค่าฟิลด์",
        variations: [
          {
            EditorsSupport: ["word", "cell"],
            buttons: [],
            description: "แผงตั้งค่าฟิลด์สำหรับแบบฟอร์ม",
            events: [
              "onToolbarMenuClick",
              "onDocumentContentReady",
              "onChangeContentControl",
              "onTargetPositionChanged",
            ],
            icons:
              "resources/%theme-type%(light|dark)/settings.%extension%(svg)",
            initData: "",
            initDataType: "none",
            initOnSelectionChanged: true,
            isActivated: true,
            isInsideMode: false,
            isModal: false,
            isViewer: false,
            isVisual: true,
            type: "panelRight",
            url: "index.html",
          },
        ],
        version: "2.1.0",
      };
    })
    .get("/onlyoffice-plugin", pluginIndexResponse)
    .get("/onlyoffice-plugin/", pluginIndexResponse)
    .get("/onlyoffice-plugin/index.html", pluginIndexResponse)
    .get("/onlyoffice-plugin/plugin.js", pluginScriptResponse)
    .get("/onlyoffice-plugin/resources/light/settings.svg", () =>
      pluginSettingsIconResponse("light")
    )
    .get("/onlyoffice-plugin/resources/dark/settings.svg", () =>
      pluginSettingsIconResponse("dark")
    )
    .post(
      "/onlyoffice/callback",
      async ({ request }) => {
        const payload = await readJsonRecord(request, maxCallbackBodyBytes);
        if (
          !verifyOnlyOfficeAuthorization(
            request.headers.get("authorization"),
            payload
          )
        ) {
          fail(401, "invalid_onlyoffice_token", "OnlyOffice token is invalid");
        }
        const status =
          typeof payload.status === "number"
            ? payload.status
            : Number(payload.status);
        if (status !== 6 && status !== 7) {
          return { error: 0 };
        }
        if (typeof payload.userdata !== "string") {
          return { error: 1 };
        }
        const claim = callbackClaim(payload.userdata);
        if (!claim) {
          return { error: 1 };
        }
        const operation = await prisma.operation.findUnique({
          where: { id: claim.operationId },
        });
        if (
          !operation ||
          claim.documentKey !== operation.documentKey ||
          claim.operationType !== operation.type ||
          typeof payload.key !== "string" ||
          payload.key !== operation.documentKey
        ) {
          return { error: 1 };
        }
        const consumption = await consumeCallbackClaim(
          operation.id,
          payload.userdata
        );
        if (consumption === "invalid") {
          return { error: 1 };
        }
        if (
          consumption === "replayed" ||
          operation.status === OperationStatus.completed ||
          operation.status === OperationStatus.failed
        ) {
          if (
            operation.status === OperationStatus.completed ||
            operation.status === OperationStatus.failed
          ) {
            await cleanupTerminalOperationObjects(operation);
          }
          return { error: 0 };
        }
        if (status === 7) {
          await updateOperationFailed(
            operation.id,
            "onlyoffice_document_error"
          );
          return { error: 0 };
        }
        try {
          await finalizeCallback(
            operation.id,
            payload as unknown as CallbackPayload,
            undefined,
            allowedCallbackOrigins,
            callbackMaximumBytes
          );
          return { error: 0 };
        } catch (error) {
          await updateOperationFailed(
            operation.id,
            error instanceof HttpError && error.code === "invalid_template"
              ? "invalid_template"
              : "callback_processing_failed",
            undefined,
            error instanceof HttpError && error.code === "invalid_template"
              ? { errorMessage: error.message }
              : error instanceof SpreadsheetValidationError
                ? {
                    errorMessage: "ตรวจสอบช่องกรอกที่ระบุก่อนส่งคำตอบ",
                    validationErrors: error.errors,
                  }
                : undefined
          );
          // Validation is a completed application decision. Acknowledge receipt
          // so ONLYOFFICE does not replay this failed action's cached userdata
          // for the next force-save; the operation still reports failure.
          return { error: error instanceof SpreadsheetValidationError ? 0 : 1 };
        }
      },
      { parse: "none" }
    );
}
