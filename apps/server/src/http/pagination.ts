import { fail } from "./errors";

export const paginationPage = (params: URLSearchParams): number => {
  if (params.has("cursor")) {
    fail(400, "invalid_request", "Use page instead of cursor");
  }
  if (params.getAll("page").length > 1) {
    fail(400, "invalid_request", "page must occur only once");
  }
  const value = params.get("page") ?? "1";
  const page = Number(value);
  if (
    !/^[1-9]\d*$/u.test(value) ||
    !Number.isSafeInteger(page) ||
    page > 2_147_483_647
  ) {
    fail(400, "invalid_request", "page must be a positive integer");
  }
  return page;
};

export const paginationInfo = ({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(page, totalPages), pageSize, total, totalPages };
};
