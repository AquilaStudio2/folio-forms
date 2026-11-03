import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { pageNumbers } from "@/lib/pagination";
import type { PaginationInfo } from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface NumberedPages {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}

type ListPaginationProps = NumberedPages & {
  label: string;
  disabled?: boolean;
  className?: string;
};

const numberedSummary = ({
  page,
  pageSize,
  total,
  totalPages,
}: PaginationInfo) =>
  `${total === 0 ? "0 รายการ" : `แสดง ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} จาก ${total} รายการ`} · หน้า ${page} จาก ${totalPages}`;

const NumberedControls = ({
  pagination,
  onPageChange,
  disabled,
}: NumberedPages & { disabled: boolean }) => (
  <>
    <PaginationItem>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="หน้าแรก"
        title="หน้าแรก"
        disabled={disabled || pagination.page <= 1}
        onClick={() => onPageChange(1)}
      >
        <ChevronsLeft aria-hidden="true" />
      </Button>
    </PaginationItem>
    <PaginationItem>
      <Button
        variant="ghost"
        type="button"
        aria-label="หน้าก่อนหน้า"
        disabled={disabled || pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        <ChevronLeft aria-hidden="true" />
        <span className="hidden sm:inline">ก่อนหน้า</span>
      </Button>
    </PaginationItem>
    <PaginationItem className="sm:hidden">
      <span className="px-3 text-sm" aria-current="page">
        {pagination.page} / {pagination.totalPages}
      </span>
    </PaginationItem>
    {pageNumbers(pagination.page, pagination.totalPages).map(
      (page, index, pages) => (
        <PaginationItem
          key={page}
          className="hidden items-center gap-1 sm:flex"
        >
          {index === 0 && page > 1 ? <PaginationEllipsis /> : null}
          <Button
            type="button"
            size="icon"
            variant={page === pagination.page ? "outline" : "ghost"}
            aria-label={`ไปหน้า ${page}`}
            aria-current={page === pagination.page ? "page" : undefined}
            disabled={disabled || pagination.totalPages <= 1}
            onClick={() => onPageChange(page)}
          >
            {page}
          </Button>
          {index === pages.length - 1 && page < pagination.totalPages ? (
            <PaginationEllipsis />
          ) : null}
        </PaginationItem>
      )
    )}
    <PaginationItem>
      <Button
        variant="ghost"
        type="button"
        aria-label="หน้าถัดไป"
        disabled={disabled || pagination.page >= pagination.totalPages}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        <span className="hidden sm:inline">ถัดไป</span>
        <ChevronRight aria-hidden="true" />
      </Button>
    </PaginationItem>
    <PaginationItem>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="หน้าสุดท้าย"
        title="หน้าสุดท้าย"
        disabled={disabled || pagination.page >= pagination.totalPages}
        onClick={() => onPageChange(pagination.totalPages)}
      >
        <ChevronsRight aria-hidden="true" />
      </Button>
    </PaginationItem>
  </>
);

export const ListPagination = (props: ListPaginationProps) => {
  const disabled = props.disabled ?? false;
  return (
    <div
      className={cn(
        "flex w-full flex-col items-start justify-between gap-3 sm:flex-row sm:items-center",
        props.className
      )}
      data-slot="list-pagination"
    >
      <p className="min-w-0 text-sm text-[var(--ink-soft)]" aria-live="polite">
        {numberedSummary(props.pagination)}
      </p>
      <Pagination
        aria-label={props.label}
        className="max-w-full shrink-0 self-end sm:ml-auto sm:self-auto"
      >
        <PaginationContent className="flex-wrap justify-end">
          <NumberedControls {...props} disabled={disabled} />
        </PaginationContent>
      </Pagination>
    </div>
  );
};
