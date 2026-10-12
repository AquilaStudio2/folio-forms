import { FormStatus, Prisma, prisma, ResponseStatus } from "@onlyoffice/db";

import { fail } from "../http/errors";
import { formDto } from "./query";

const pageSize = 10;
const queryValue = (params: URLSearchParams, key: string): string | null => {
  if (params.getAll(key).length > 1) {
    fail(400, "invalid_request", `${key} must occur only once`);
  }
  return params.get(key);
};

const catalogQuery = (params: URLSearchParams) => {
  const search = (queryValue(params, "search") ?? "").trim();
  const status = queryValue(params, "status");
  const pageValue = queryValue(params, "page") ?? "1";
  const page = Number(pageValue);
  if (search.length > 200) {
    fail(400, "invalid_request", "search must not exceed 200 characters");
  }
  if (
    !/^[1-9]\d*$/u.test(pageValue) ||
    !Number.isSafeInteger(page) ||
    page > 2_147_483_647
  ) {
    fail(400, "invalid_request", "page must be a positive integer");
  }
  if (
    status !== null &&
    status !== "all" &&
    status !== FormStatus.draft &&
    status !== FormStatus.published &&
    status !== FormStatus.archived
  ) {
    fail(400, "invalid_request", "status is invalid");
  }
  // Prisma contains uses LIKE: escape pattern characters for literal search.
  const contains = search.replaceAll(/[\\%_]/gu, "\\$&");
  const where: Prisma.FormWhereInput = {
    ...(status && status !== "all" ? { status: status as FormStatus } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains, mode: "insensitive" } },
            { description: { contains, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  return { page, where };
};

export const listAdminForms = (params: URLSearchParams) => {
  const query = catalogQuery(params);
  return prisma.$transaction(
    async (tx) => {
      const total = await tx.form.count({ where: query.where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(query.page, totalPages);
      const items = await tx.form.findMany({
        include: {
          _count: {
            select: {
              responses: { where: { status: ResponseStatus.draft } },
              submissions: true,
            },
          },
          publishedTemplate: true,
          templateDraft: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: query.where,
      });
      return {
        forms: items.map((item) =>
          formDto(item, {
            activeDraftCount: item._count.responses,
            submissionCount: item._count.submissions,
          })
        ),
        pagination: { page, pageSize, total, totalPages },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
};
