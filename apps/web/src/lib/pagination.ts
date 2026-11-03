export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const emptyPagination = (pageSize = 10): PaginationInfo => ({
  page: 1,
  pageSize,
  total: 0,
  totalPages: 1,
});

export const pageNumbers = (page: number, totalPages: number) => {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const start = Math.max(1, Math.min(page - 1, totalPages - 2));
  return [start, start + 1, start + 2];
};

export const paginateItems = <T>({
  items,
  page,
  pageSize = 10,
}: {
  items: T[];
  page: number;
  pageSize?: number;
}) => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  return {
    items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    pagination: { page: currentPage, pageSize, total, totalPages },
  };
};
