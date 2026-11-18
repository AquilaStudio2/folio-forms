// oxlint-disable unicorn/filename-case -- TanStack Router requires this dynamic route filename.
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  FileCheck2,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { DocumentKindBadge } from "@/components/document-kind-badge";
import { ListPagination } from "@/components/list-pagination";
import { Badge, Button, Card, Notice, Spinner } from "@/components/ui";
import { apiDelete, apiGet, ApiError, formatDate } from "@/lib/api";
import type { Submission } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { paginateItems } from "@/lib/pagination";

const deleteErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.code === "only_submission") {
      return "ลบไม่ได้: นี่เป็น Submission เดียวของคำตอบนี้ กรุณาใช้การลบคำตอบถาวรที่หน้า Inspect แทน";
    }
    if (error.code === "editor_in_use") {
      return "ลบไม่ได้: มีคนกำลังเปิดแก้ไขคำตอบนี้อยู่ กรุณาลองใหม่ภายหลัง";
    }
    if (error.code === "operation_in_progress") {
      return "ลบไม่ได้: กำลังมีการประมวลผลคำตอบนี้อยู่ กรุณาลองใหม่ภายหลัง";
    }
  }
  return "ลบ Submission ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
};

const SubmissionsRoute = () => {
  const { formId } = useParams({
    from: "/admin/forms/$formId/submissions",
  });
  const { user } = useAuth();
  const canEdit = user?.role === "admin";
  const [rows, setRows] = useState<Submission[]>([]);
  const [page, setPage] = useState(1);
  const { items: visibleRows, pagination } = paginateItems({
    items: rows,
    page,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteFeedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (deleteError) {
      deleteFeedbackRef.current?.focus();
    }
  }, [deleteError]);

  const requestDelete = (row: Submission, trigger: HTMLButtonElement) => {
    deleteTriggerRef.current = trigger;
    setDeleteError(null);
    setDeleteTarget(row);
  };

  const cancelDelete = () => {
    if (deleting) {
      return;
    }
    setDeleteTarget(null);
    setDeleteError(null);
    deleteTriggerRef.current?.focus();
    deleteTriggerRef.current = null;
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete(`/api/admin/submissions/${deleteTarget.id}`);
      setRows((current) => current.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      deleteTriggerRef.current = null;
    } catch (caughtError) {
      setDeleteError(deleteErrorMessage(caughtError));
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setLoading(true);
    setError(null);
    let cancelled = false;
    const loadSubmissions = async () => {
      try {
        const payload = await apiGet<
          { submissions: Submission[] } | Submission[]
        >(`/api/admin/forms/${formId}/submissions`);
        if (!cancelled) {
          setRows(Array.isArray(payload) ? payload : payload.submissions);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load submissions."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSubmissions();
    return () => {
      cancelled = true;
    };
  }, [formId]);

  let submissionsContent: React.ReactNode;
  if (error) {
    submissionsContent = <Notice tone="danger">{error}</Notice>;
  } else if (loading) {
    submissionsContent = (
      <div className="grid min-h-56 place-items-center">
        <Spinner />
      </div>
    );
  } else if (rows.length === 0) {
    submissionsContent = (
      <div className="grid min-h-56 place-items-center p-8 text-center">
        <div>
          <FileCheck2
            className="mx-auto mb-3 text-[var(--ink-soft)]"
            size={30}
          />
          <h2 className="font-semibold">No submissions yet</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Published responses will appear here.
          </p>
        </div>
      </div>
    );
  } else {
    submissionsContent = (
      <div className="divide-y divide-[var(--line)]">
        {visibleRows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold">{row.userEmail ?? "Respondent"}</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Submitted {formatDate(row.submittedAt ?? row.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <DocumentKindBadge documentKind={row.documentKind} />
              <Badge tone="success">{row.status ?? "Submitted"}</Badge>
              <Link
                to="/admin/forms/$formId/submissions/$submissionId"
                params={{ formId, submissionId: row.id }}
                className="inline-flex items-center gap-1 text-sm font-semibold"
              >
                Inspect <ArrowUpRight size={15} />
              </Link>
              {canEdit && row.responseId ? (
                <Link
                  search={{ form: undefined, submissionId: row.id }}
                  to="/admin/results/$responseId/correction"
                  params={{ responseId: row.responseId }}
                  className="inline-flex items-center gap-1 text-sm font-semibold"
                >
                  แก้ไข <Pencil size={15} />
                </Link>
              ) : null}
              {canEdit ? (
                <button
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--danger)]"
                  onClick={(event) => requestDelete(row, event.currentTarget)}
                  type="button"
                >
                  ลบ <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5"
          role="presentation"
        >
          <div
            aria-labelledby="delete-submission-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] p-6 shadow-xl"
            role="dialog"
          >
            <h2 className="text-lg font-semibold" id="delete-submission-title">
              ยืนยันการลบ Submission
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              ข้อมูลที่ส่งโดย {deleteTarget.userEmail ?? "ผู้ตอบแบบฟอร์มนี้"}{" "}
              รวมถึงเอกสารและ Correction ทั้งหมดของ Submission
              นี้จะหายไปทันทีและกู้คืนไม่ได้
            </p>
            {deleteError ? (
              <div
                className="mt-4 focus:outline-none"
                ref={deleteFeedbackRef}
                role="alert"
                tabIndex={-1}
              >
                <Notice tone="danger">{deleteError}</Notice>
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                disabled={deleting}
                onClick={cancelDelete}
                type="button"
                variant="ghost"
              >
                ยกเลิก
              </Button>
              <Button
                disabled={deleting}
                onClick={confirmDelete}
                type="button"
                variant="danger"
              >
                {deleting ? <Spinner /> : <Trash2 size={16} />}
                {deleting ? "กำลังลบ…" : "ยืนยันการลบ"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <Link
        to="/admin/forms/$formId"
        params={{ formId }}
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        <ArrowLeft size={15} />
        Back to editor
      </Link>
      <PageHeader
        title="Submissions"
        description="Every completed response for this form, with owner-protected downloads."
      />
      {error ? (
        submissionsContent
      ) : (
        <Card className="overflow-hidden">
          {submissionsContent}
          {loading ? null : (
            <ListPagination
              className="border-t border-[var(--line)] px-5 py-4"
              label="แบ่งหน้าคำตอบรายแบบฟอร์ม"
              pagination={pagination}
              onPageChange={setPage}
            />
          )}
        </Card>
      )}
    </>
  );
};

export const Route = createFileRoute("/admin/forms/$formId/submissions/")({
  component: SubmissionsRoute,
});
