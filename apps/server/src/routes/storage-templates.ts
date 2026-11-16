// oxlint-disable func-style -- Route registration follows the existing server route modules.
import { prisma } from "@onlyoffice/db";
import type { Elysia } from "elysia";

import { requireAdmin, requireIdentity } from "../auth/identity";
import { databaseErrorCode } from "../db-errors";
import type { EcmClient } from "../ecm/client";
import { fail } from "../http/errors";
import { readJsonRecord, validateId } from "../http/input";

const categoryId = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < -2_147_483_648 ||
    value > 2_147_483_647
  ) {
    fail(400, "invalid_category", "กรุณาเลือกหัวข้อเอกสารที่ถูกต้อง");
  }
  return value;
};
const readMapping = async (request: Request) => {
  const input = await readJsonRecord(request, 8192);
  const name = input.template_name;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 255 ||
    /[\p{Cc}<>:"/\\|?*]/u.test(name)
  ) {
    fail(
      400,
      "invalid_template_name",
      "ชื่อแม่แบบต้องไม่ว่าง ไม่มีอักขระควบคุมหรืออักขระที่ไม่ปลอดภัยสำหรับชื่อไฟล์"
    );
  }
  return {
    document_category_id: categoryId(input.document_category_id),
    template_name: name,
  };
};
const admin = async (request: Request) =>
  requireAdmin(await requireIdentity(request));
const save = async <T>(write: () => Promise<T>): Promise<T> => {
  try {
    return await write();
  } catch (error) {
    if (databaseErrorCode(error) === "P2002") {
      fail(409, "duplicate_template_name", "ชื่อแม่แบบนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น");
    }
    throw error;
  }
};

export function registerStorageTemplateRoutes(
  app: Elysia,
  ecm: EcmClient
): void {
  const verifyCategory = async (id: number) => {
    const categories = await ecm.categoryEntries();
    if (!categories.some((category) => category.id === id)) {
      fail(400, "invalid_category", "ไม่พบหัวข้อเอกสารนี้ กรุณาโหลดรายการใหม่");
    }
  };
  app
    .get("/api/admin/storage-templates/categories", async ({ request }) => {
      await admin(request);
      return { categories: await ecm.categoryEntries() };
    })
    .get("/api/admin/storage-templates", async ({ request }) => {
      await admin(request);
      const filter = new URL(request.url).searchParams.get(
        "document_category_id"
      );
      if (filter !== null && !/^-?\d+$/u.test(filter)) {
        fail(400, "invalid_category", "หัวข้อเอกสารไม่ถูกต้อง");
      }
      const where =
        filter === null
          ? {}
          : { document_category_id: categoryId(Number(filter)) };
      return {
        templates: await prisma.storageTemplate.findMany({
          orderBy: [{ template_name: "asc" }, { id: "asc" }],
          where,
        }),
      };
    })
    .post(
      "/api/admin/storage-templates",
      async ({ request }) => {
        await admin(request);
        const data = await readMapping(request);
        await verifyCategory(data.document_category_id);
        return {
          template: await save(() => prisma.storageTemplate.create({ data })),
        };
      },
      { parse: "none" }
    )
    .patch(
      "/api/admin/storage-templates/:id",
      async ({ request, params }) => {
        await admin(request);
        const id = validateId(params.id, "Storage Template");
        const data = await readMapping(request);
        const previous = await prisma.storageTemplate.findUnique({
          where: { id },
        });
        if (!previous) {
          fail(404, "not_found", "ไม่พบแม่แบบจัดเก็บเอกสาร");
        }
        if (previous.document_category_id !== data.document_category_id) {
          await verifyCategory(data.document_category_id);
        }
        const result = await save(() =>
          prisma.storageTemplate.updateMany({
            data,
            where: { document_category_id: previous.document_category_id, id },
          })
        );
        if (!result.count) {
          fail(409, "catalog_changed", "รายการเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก");
        }
        return { template: { id, ...data } };
      },
      { parse: "none" }
    )
    .delete(
      "/api/admin/storage-templates/:id",
      async ({ request, params }) => {
        await admin(request);
        const id = validateId(params.id, "Storage Template");
        const input = await readJsonRecord(request, 8192);
        if (input.confirm !== true) {
          fail(400, "confirmation_required", "กรุณายืนยันการลบแม่แบบ");
        }
        const result = await prisma.storageTemplate.deleteMany({
          where: { id },
        });
        if (!result.count) {
          fail(404, "not_found", "ไม่พบแม่แบบจัดเก็บเอกสาร");
        }
        return { ok: true };
      },
      { parse: "none" }
    );
}
