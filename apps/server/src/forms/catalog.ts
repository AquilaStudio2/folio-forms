import {
  DocumentKind,
  FormStatus,
  Prisma,
  prisma,
  ResponseStatus,
} from "@onlyoffice/db";

import { fail } from "../http/errors";
import { paginationInfo, paginationPage } from "../http/pagination";
import { formDto } from "./query";

const pageSize = 10;
const queryValue = (params: URLSearchParams, key: string): string | null => {
  if (params.getAll(key).length > 1) {
    fail(400, "invalid_request", `${key} must occur only once`);
  }
  return params.get(key);
};

const documentKindFilter = (params: URLSearchParams): Prisma.FormWhereInput => {
  const documentKind = queryValue(params, "documentKind");
  if (documentKind === null || documentKind === "all") {
    return {};
  }
  if (
    documentKind !== DocumentKind.docx &&
    documentKind !== DocumentKind.xlsx
  ) {
    fail(400, "invalid_request", "documentKind is invalid");
  }
  return { documentKind };
};

const catalogQuery = (params: URLSearchParams) => {
  const search = (queryValue(params, "search") ?? "").trim();
  const status = queryValue(params, "status");
  const page = paginationPage(params);
  if (search.length > 200) {
    fail(400, "invalid_request", "search must not exceed 200 characters");
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
    ...documentKindFilter(params),
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
      const pagination = paginationInfo({ page: query.page, pageSize, total });
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
        skip: (pagination.page - 1) * pageSize,
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
        pagination,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
};
