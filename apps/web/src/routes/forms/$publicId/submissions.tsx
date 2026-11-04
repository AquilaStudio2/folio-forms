// oxlint-disable unicorn/filename-case -- TanStack Router requires this dynamic route filename.
import {
  createFileRoute,
  Link,
  Navigate,
  useParams,
} from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Download, Inbox } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, PageHeader } from "@/components/app-shell";
import { ListPagination } from "@/components/list-pagination";
import { Button, Card, Notice, Spinner } from "@/components/ui";
import { ApiError, apiGet, downloadArtifact, formatDateTime } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { paginateItems } from "@/lib/pagination";

interface SubmissionHistoryEntry {
  id: string;
  createdAt: string;
}

interface PublicFormTitle {
  title: string;
}

const historyErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
    }
    if (error.status === 404) {
      return "ไม่พบแบบฟอร์มนี้";
    }
  }
  return "โหลดประวัติการส่งแบบฟอร์มไม่ได้ กรุณาลองใหม่";
};

const Centered = ({ message }: { message: string }) => (
  <div className="grid min-h-64 place-items-center text-sm text-[var(--ink-soft)]">
    <Spinner />
    <span className="sr-only">{message}</span>
  </div>
);

const FormSubmissionHistoryRoute = () => {
  const { publicId } = useParams({ from: "/forms/$publicId/submissions" });
  const { user, loading: authLoading, signedOut } = useAuth();
  const [formTitle, setFormTitle] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionHistoryEntry[]>([]);
  const [page, setPage] = useState(1);
  const { items: visibleSubmissions, pagination } = paginateItems({
    items: submissions,
    page,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const loadHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const [formPayload, submissionsPayload] = await Promise.all([
          apiGet<{ form: PublicFormTitle } | PublicFormTitle>(
            `/api/forms/${publicId}`
          ),
          apiGet<{ submissions: SubmissionHistoryEntry[] }>(
            `/api/forms/${publicId}/my-submissions`
          ),
        ]);
        if (cancelled) {
          return;
        }
        const form = "form" in formPayload ? formPayload.form : formPayload;
        setFormTitle(form.title);
        setSubmissions(submissionsPayload.submissions);
      } catch (caughtError) {
        if (!cancelled) {
          setError(historyErrorMessage(caughtError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [publicId, user]);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadArtifact(
        `/api/forms/${publicId}/my-submissions/export`,
        `${publicId}-submissions.json`
      );
    } catch {
      setExportError("ไม่สามารถดาวน์โหลดข้อมูลที่ส่งได้ กรุณาลองใหม่");
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return <Centered message="กำลังตรวจสอบเซสชัน…" />;
  }
  if (!user) {
    return (
      <Navigate
        to="/login"
        search={{
          returnTo: signedOut ? undefined : `/forms/${publicId}/submissions`,
        }}
        replace
      />
    );
  }

  let content: React.ReactNode;
  if (error) {
    content = <Notice tone="danger">{error}</Notice>;
  } else if (loading) {
    content = <Centered message="กำลังโหลดประวัติการส่งแบบฟอร์ม…" />;
  } else if (submissions.length === 0) {
    content = (
      <div className="grid min-h-56 place-items-center p-8 text-center">
        <div>
          <Inbox className="mx-auto mb-3 text-[var(--ink-soft)]" size={30} />
          <h2 className="font-semibold">ยังไม่มีประวัติการส่งแบบฟอร์ม</h2>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">ประวัติการส่งแบบฟอร์มของคุณ</caption>
          <thead className="border-b border-[var(--line)] bg-[var(--paper-soft)] text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            <tr>
              <th className="px-4 py-3" scope="col">
                ลำดับ
              </th>
              <th className="px-4 py-3" scope="col">
                วันที่ส่ง
              </th>
              <th className="px-4 py-3" scope="col">
                <span className="sr-only">ดูใบรับคำตอบ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleSubmissions.map((entry, index) => (
              <tr
                className="border-b border-[var(--line)] last:border-0"
                key={entry.id}
              >
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {submissions.length -
                    (pagination.page - 1) * pagination.pageSize -
                    index}
                </td>
                <td className="px-4 py-3">{formatDateTime(entry.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] underline-offset-4 hover:underline"
                    params={{ submissionId: entry.id }}
                    to="/receipt/$submissionId"
                  >
                    ดูใบรับคำตอบ <ArrowUpRight size={15} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={formTitle ? `ประวัติการส่ง: ${formTitle}` : "ประวัติการส่งแบบฟอร์ม"}
        description="รายการทุกครั้งที่คุณส่งแบบฟอร์มนี้"
        action={
          <div className="flex items-center gap-2">
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-soft)] underline-offset-4 hover:underline"
              to="/dashboard"
            >
              <ArrowLeft size={15} /> กลับไปหน้าแดชบอร์ด
            </Link>
            <Button
              disabled={exporting || submissions.length === 0}
              onClick={handleExport}
              size="sm"
              variant="secondary"
            >
              <Download size={15} />
              {exporting ? "กำลังดาวน์โหลด…" : "ดาวน์โหลดข้อมูลที่ส่งทั้งหมด"}
            </Button>
          </div>
        }
      />
      {exportError ? (
        <div className="mb-4">
          <Notice tone="danger">{exportError}</Notice>
        </div>
      ) : null}
      {error ? (
        content
      ) : (
        <Card className="overflow-hidden">
          {content}
          {loading ? null : (
            <ListPagination
              className="border-t border-[var(--line)] px-5 py-4"
              label="แบ่งหน้าประวัติการส่งแบบฟอร์ม"
              pagination={pagination}
              disabled={loading}
              onPageChange={setPage}
            />
          )}
        </Card>
      )}
    </AppShell>
  );
};

export const Route = createFileRoute("/forms/$publicId/submissions")({
  component: FormSubmissionHistoryRoute,
});
