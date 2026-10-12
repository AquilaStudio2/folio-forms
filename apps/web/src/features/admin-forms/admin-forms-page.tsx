import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiDelete, formatDate } from "@/lib/api";
import type { FormStatus, FormSummary } from "@/lib/api";

import { catalogPageNumbers } from "./catalog";
import type { FormCatalogQuery } from "./catalog";
import { SearchStatus } from "./search-status";
import { useFormCatalog } from "./use-form-catalog";

const CatalogNotice = ({
  children,
  danger = false,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) => (
  <Alert
    variant={danger ? "destructive" : "default"}
    role={danger ? "alert" : "status"}
  >
    <AlertDescription>{children}</AlertDescription>
  </Alert>
);

const formStatusDetails: Record<
  FormStatus,
  { label: string; className: string }
> = {
  archived: { className: "bg-muted text-muted-foreground", label: "เก็บถาวร" },
  draft: { className: "bg-accent text-accent-foreground", label: "ร่าง" },
  published: {
    className: "bg-[var(--success-soft)] text-[var(--success)]",
    label: "เผยแพร่แล้ว",
  },
};
const canDeleteDraft = (form: FormSummary): boolean =>
  form.status === "draft" &&
  form.version === 0 &&
  form.activeDraftCount === 0 &&
  form.submissionCount === 0;

const formsErrorMessage = (caughtError: unknown, fallback: string): string => {
  if (caughtError instanceof ApiError) {
    switch (caughtError.code) {
      case "form_has_responses": {
        return "ลบแบบฟอร์มนี้ไม่ได้ เพราะมีคำตอบที่เกี่ยวข้องแล้ว";
      }
      case "editor_in_use": {
        return "ลบไม่ได้ขณะที่ผู้ดูแลระบบรายอื่นกำลังแก้ไขแบบฟอร์มนี้";
      }
      case "form_not_draft": {
        return "ลบได้เฉพาะแบบฟอร์มร่างที่ยังไม่เผยแพร่เท่านั้น";
      }
      case "operation_in_progress": {
        return "แบบฟอร์มนี้กำลังประมวลผลอยู่ กรุณารอแล้วลองใหม่";
      }
      case "not_found": {
        return "ไม่พบแบบฟอร์มนี้ อาจถูกลบไปแล้ว";
      }
      case "unauthorized": {
        return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
      }
      case "password_change_required": {
        return "กรุณาเปลี่ยนรหัสผ่านก่อนจัดการแบบฟอร์ม";
      }
      default: {
        break;
      }
    }
  }
  return fallback;
};

// oxlint-disable-next-line complexity -- Coordinates catalog feedback, deletion guards, and the existing empty/error states.
export const AdminFormsPage = () => {
  const [query, setQuery] = useState<FormCatalogQuery>({
    page: 1,
    search: "",
    status: "all",
  });
  const [searchInput, setSearchInput] = useState("");
  const [composing, setComposing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const onPageClamp = useCallback((page: number) => {
    setQuery((current) =>
      current.page === page ? current : { ...current, page }
    );
  }, []);
  const {
    data,
    error: loadError,
    loading,
    reload: load,
  } = useFormCatalog(query, onPageClamp);
  const { forms, pagination } = data;
  const waitingForSearch = composing || searchInput.trim() !== query.search;
  const error = loadError
    ? formsErrorMessage(
        loadError,
        "ไม่สามารถโหลดรายการแบบฟอร์มได้ กรุณาลองใหม่อีกครั้ง"
      )
    : null;
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removingPublicId, setRemovingPublicId] = useState<string | null>(null);
  const [confirmingPublicId, setConfirmingPublicId] = useState<string | null>(
    null
  );
  const restoreFocusId = useRef<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const changeQuery = useCallback((updates: Partial<FormCatalogQuery>) => {
    setMutationError(null);
    setSuccess(null);
    setConfirmingPublicId(null);
    setQuery((current) => ({ ...current, ...updates }));
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    changeQuery({ page: 1, search: "" });
    searchRef.current?.focus();
  }, [changeQuery]);

  useEffect(() => {
    if (composing || removingPublicId || searchInput.trim() === query.search) {
      return;
    }
    const timer = window.setTimeout(() => {
      changeQuery({ page: 1, search: searchInput.trim() });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [changeQuery, composing, query.search, removingPublicId, searchInput]);

  useEffect(() => {
    if (
      mutationError ||
      success ||
      (error &&
        !loading &&
        !waitingForSearch &&
        document.activeElement !== searchRef.current)
    ) {
      feedbackRef.current?.focus();
    }
  }, [error, loading, mutationError, success, waitingForSearch]);

  useEffect(() => {
    if (confirmingPublicId) {
      document
        .querySelector<HTMLButtonElement>(
          `button[data-confirm-form-id="${confirmingPublicId}"]`
        )
        ?.focus();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape" && !removingPublicId) {
          restoreFocusId.current = confirmingPublicId;
          setConfirmingPublicId(null);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }

    const publicId = restoreFocusId.current;
    if (publicId) {
      document
        .querySelector<HTMLButtonElement>(
          `button[data-remove-form-id="${publicId}"]`
        )
        ?.focus();
      restoreFocusId.current = null;
    }
  }, [confirmingPublicId, removingPublicId]);

  const removeDraft = async (form: FormSummary) => {
    if (!canDeleteDraft(form) || removingPublicId) {
      return;
    }
    setRemovingPublicId(form.publicId);
    setMutationError(null);
    setSuccess(null);
    try {
      await apiDelete<{ deleted: boolean }>(
        `/api/admin/forms/${form.publicId}`
      );
      await load();
      setSuccess("ลบแบบฟอร์มร่างเรียบร้อยแล้ว");
    } catch (caughtError) {
      setMutationError(
        formsErrorMessage(caughtError, "ไม่สามารถลบแบบฟอร์มนี้ได้ กรุณาลองใหม่อีกครั้ง")
      );
    } finally {
      restoreFocusId.current = form.publicId;
      setRemovingPublicId(null);
      setConfirmingPublicId(null);
    }
  };

  let formsContent: React.ReactNode;
  if (error) {
    formsContent = (
      <div ref={feedbackRef} className="space-y-4" tabIndex={-1}>
        <CatalogNotice danger>{error}</CatalogNotice>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            void load();
          }}
          disabled={loading}
        >
          <RefreshCw size={15} />
          ลองโหลดอีกครั้ง
        </Button>
      </div>
    );
  } else if (loading) {
    formsContent = (
      <div className="grid min-h-56 place-items-center gap-3" aria-busy="true">
        <Spinner
          role="presentation"
          aria-hidden="true"
          aria-label={undefined}
        />
        <span className="text-sm text-[var(--ink-soft)]">
          กำลังโหลดรายการแบบฟอร์ม…
        </span>
      </div>
    );
  } else if (forms.length === 0) {
    formsContent = (
      <Card className="grid min-h-56 place-items-center p-8 text-center">
        <div>
          <FileText className="mx-auto mb-3 text-[var(--ink-soft)]" size={30} />
          <h2 className="font-semibold">
            {query.search || query.status !== "all"
              ? "ไม่พบแบบฟอร์มที่ตรงกับการค้นหา"
              : "ยังไม่มีแบบฟอร์ม"}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {query.search || query.status !== "all"
              ? "ลองเปลี่ยนคำค้นหรือสถานะแบบฟอร์ม"
              : "สร้างแบบร่างแรก แล้วเปิดตัวแก้ไขเพื่อจัดรูปแบบ"}
          </p>
          <Button asChild variant="link" className="mt-4">
            <Link to="/admin/forms/new">สร้างแบบฟอร์ม</Link>
          </Button>
        </div>
      </Card>
    );
  } else {
    formsContent = (
      <Card className="gap-0 overflow-hidden py-0">
        <div className="divide-y divide-[var(--line)]">
          {forms.map((form) => {
            const status = formStatusDetails[form.status];
            const isConfirming = confirmingPublicId === form.publicId;
            const isRemoving = removingPublicId === form.publicId;
            const isDeletable = canDeleteDraft(form);
            return (
              <div
                key={form.publicId}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-4">
                  <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-soft)]">
                    <FileText size={18} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold">{form.title}</h2>
                    <p className="mt-1 max-w-xl break-words text-sm text-[var(--ink-soft)]">
                      {form.description || "ยังไม่มีคำอธิบาย"}
                    </p>
                    <p className="mt-2 text-xs text-[var(--ink-soft)]">
                      แก้ไขล่าสุด {formatDate(form.updatedAt)}
                    </p>
                    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      <div>
                        <dt className="text-[var(--ink-soft)]">
                          ฉบับร่างที่กำลังแก้ไข
                        </dt>
                        <dd className="font-semibold">
                          {form.activeDraftCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--ink-soft)]">คำตอบที่ส่งแล้ว</dt>
                        <dd className="font-semibold">
                          {form.submissionCount}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 pl-14 sm:pl-0">
                  <Badge variant="secondary" className={status.className}>
                    {status.label}
                  </Badge>
                  {isDeletable && !isConfirming ? (
                    <Button
                      data-remove-form-id={form.publicId}
                      variant="destructive"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setConfirmingPublicId(form.publicId);
                        setMutationError(null);
                        setSuccess(null);
                      }}
                      disabled={Boolean(removingPublicId)}
                    >
                      <Trash2 size={15} />
                      ลบแบบร่าง
                    </Button>
                  ) : null}
                  {isDeletable && isConfirming ? (
                    <div
                      className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-2"
                      aria-labelledby={`confirm-${form.publicId}`}
                      role="group"
                    >
                      <span
                        className="px-1 text-sm font-semibold"
                        id={`confirm-${form.publicId}`}
                      >
                        ลบแบบร่างนี้หรือไม่
                      </span>
                      <Button
                        data-confirm-form-id={form.publicId}
                        variant="destructive"
                        size="sm"
                        type="button"
                        onClick={() => {
                          void removeDraft(form);
                        }}
                        disabled={Boolean(removingPublicId)}
                      >
                        {isRemoving ? <Spinner /> : <Trash2 size={15} />}
                        {isRemoving ? "กำลังลบ…" : "ยืนยันการลบ"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => {
                          restoreFocusId.current = form.publicId;
                          setConfirmingPublicId(null);
                        }}
                        disabled={Boolean(removingPublicId)}
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  ) : null}
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      to="/admin/forms/$formId"
                      params={{ formId: form.publicId }}
                    >
                      เปิดแบบฟอร์ม <ArrowUpRight size={15} />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="แบบฟอร์ม"
        description="จัดทำแบบฟอร์ม เผยแพร่เมื่อพร้อม และติดตามคำตอบได้ในที่เดียว"
        action={
          <Button asChild>
            <Link to="/admin/forms/new">
              <Plus size={17} />
              สร้างแบบฟอร์ม
            </Link>
          </Button>
        }
      />
      <Card className="mb-5 gap-0 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="form-search">ค้นหาแบบฟอร์ม</Label>
            <div className="relative">
              <Input
                id="form-search"
                type="search"
                ref={searchRef}
                value={searchInput}
                placeholder="ค้นหาจากชื่อหรือคำอธิบาย"
                maxLength={200}
                className="pr-11 [&::-webkit-search-cancel-button]:appearance-none"
                aria-describedby="form-search-help"
                disabled={Boolean(removingPublicId)}
                onChange={(event) => setSearchInput(event.target.value)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
              />
              {query.search ? (
                <Button
                  className="absolute top-0 right-0"
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="ล้างคำค้น"
                  onClick={clearSearch}
                  disabled={Boolean(removingPublicId)}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : (
                <span
                  aria-label="ค้นหา"
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                >
                  <Search aria-hidden="true" size={18} />
                </span>
              )}
            </div>
            <SearchStatus
              waiting={waitingForSearch}
              loading={loading}
              error={Boolean(error)}
              total={pagination.total}
              page={pagination.page}
              totalPages={pagination.totalPages}
            />
          </div>
          <div className="space-y-2 sm:w-48 sm:pb-6">
            <Label htmlFor="form-status">สถานะแบบฟอร์ม</Label>
            <Select
              value={query.status}
              disabled={Boolean(removingPublicId)}
              onValueChange={(value) => {
                if (
                  value === "all" ||
                  value === "draft" ||
                  value === "published" ||
                  value === "archived"
                ) {
                  changeQuery({ page: 1, status: value });
                }
              }}
            >
              <SelectTrigger id="form-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                <SelectItem value="draft">ร่าง</SelectItem>
                <SelectItem value="published">เผยแพร่แล้ว</SelectItem>
                <SelectItem value="archived">เก็บถาวร</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>
      {mutationError || success ? (
        <div ref={feedbackRef} className="mb-4 space-y-2" tabIndex={-1}>
          {mutationError ? (
            <CatalogNotice danger>{mutationError}</CatalogNotice>
          ) : null}
          {success ? <CatalogNotice>{success}</CatalogNotice> : null}
        </div>
      ) : null}
      <section aria-label="รายการแบบฟอร์ม" aria-busy={loading}>
        {formsContent}
      </section>
      {!loading && !error ? (
        <div className="mt-5 space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            {pagination.total === 0
              ? "0 รายการ"
              : `แสดง ${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} จาก ${pagination.total} รายการ`}
            {` · หน้า ${pagination.page} จาก ${pagination.totalPages}`}
          </p>
          <Pagination aria-label="แบ่งหน้ารายการแบบฟอร์ม">
            <PaginationContent>
              <PaginationItem>
                <Button
                  variant="outline"
                  type="button"
                  aria-label="หน้าก่อนหน้า"
                  disabled={
                    pagination.page <= 1 ||
                    Boolean(removingPublicId) ||
                    Boolean(confirmingPublicId)
                  }
                  onClick={() => changeQuery({ page: pagination.page - 1 })}
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
              {catalogPageNumbers(pagination.page, pagination.totalPages).map(
                (page, index, pages) => (
                  <PaginationItem
                    key={page}
                    className="hidden items-center gap-1 sm:flex"
                  >
                    {index > 0 && page - (pages[index - 1] ?? page) > 1 ? (
                      <PaginationEllipsis />
                    ) : null}
                    <Button
                      type="button"
                      size="icon"
                      variant={page === pagination.page ? "default" : "outline"}
                      aria-label={`ไปหน้า ${page}`}
                      aria-current={
                        page === pagination.page ? "page" : undefined
                      }
                      disabled={
                        Boolean(removingPublicId) || Boolean(confirmingPublicId)
                      }
                      onClick={() => changeQuery({ page })}
                    >
                      {page}
                    </Button>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <Button
                  variant="outline"
                  type="button"
                  aria-label="หน้าถัดไป"
                  disabled={
                    pagination.page >= pagination.totalPages ||
                    Boolean(removingPublicId) ||
                    Boolean(confirmingPublicId)
                  }
                  onClick={() => changeQuery({ page: pagination.page + 1 })}
                >
                  <span className="hidden sm:inline">ถัดไป</span>
                  <ChevronRight aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
      <Button
        className="mt-5"
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => {
          void load();
        }}
        disabled={
          loading || Boolean(removingPublicId) || Boolean(confirmingPublicId)
        }
        aria-busy={loading}
      >
        <RefreshCw size={14} />
        รีเฟรชรายการ
      </Button>
    </>
  );
};
