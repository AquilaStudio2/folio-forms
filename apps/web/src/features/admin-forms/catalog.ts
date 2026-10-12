import type { FormStatus, FormSummary } from "@/lib/api";

export interface FormCatalogQuery {
  page: number;
  search: string;
  status: FormStatus | "all";
}

export interface FormCatalogResponse {
  forms: FormSummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export const formCatalogPath = ({ page, search, status }: FormCatalogQuery) => {
  const params = new URLSearchParams({ page: String(page) });
  if (search) {
    params.set("search", search);
  }
  if (status !== "all") {
    params.set("status", status);
  }
  return `/api/admin/forms?${params}`;
};

export const catalogPageNumbers = (page: number, totalPages: number) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  return (
    [...new Set([1, page - 1, page, page + 1, totalPages])]
      .filter((value) => value >= 1 && value <= totalPages)
      // oxlint-disable-next-line unicorn/no-array-sort -- Sort this freshly created array; the app targets ES2022.
      .sort((left, right) => left - right)
  );
};
