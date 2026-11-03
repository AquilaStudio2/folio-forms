import type { DocumentKind, FormStatus, FormSummary } from "@/lib/api";
import type { PaginationInfo } from "@/lib/pagination";

export interface FormCatalogQuery {
  documentKind: DocumentKind | "all";
  page: number;
  search: string;
  status: FormStatus | "all";
}

export interface FormCatalogResponse {
  forms: FormSummary[];
  pagination: PaginationInfo;
}

export const formCatalogPath = ({
  documentKind,
  page,
  search,
  status,
}: FormCatalogQuery) => {
  const params = new URLSearchParams({ page: String(page) });
  if (search) {
    params.set("search", search);
  }
  if (status !== "all") {
    params.set("status", status);
  }
  if (documentKind !== "all") {
    params.set("documentKind", documentKind);
  }
  return `/api/admin/forms?${params}`;
};
