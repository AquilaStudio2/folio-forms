import {
  fiscalYearChoices,
  monthChoices,
  provinceChoices,
} from "@onlyoffice/results-filters";
// oxlint-disable no-nested-ternary -- Keeps the three explicit loading, empty, and populated table states local to the route.
import { Link, createFileRoute, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { DocumentKindBadge } from "@/components/document-kind-badge";
import { ListPagination } from "@/components/list-pagination";
import { Badge, Button, Card, Input, Notice, Spinner } from "@/components/ui";
import {
  ApiError,
  apiGet,
  apiPost,
  formatDate,
  formatDateTime,
} from "@/lib/api";
import type {
  AdminResult,
  AdminResultListQuery,
  AdminResultListResponse,
  AdminResultState,
  AttachmentFollowUp,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { emptyPagination } from "@/lib/pagination";

const selectClass =
  "min-h-11 w-full rounded-[10px] border border-[var(--line-strong)] bg-[var(--paper)] px-3 text-[var(--ink)] shadow-sm focus:border-[var(--ink)] focus:outline-none";

const errorMessage = (error: unknown) => {
  if (error instanceof ApiError && error.status === 403) {
    return "คุณไม่มีสิทธิ์ดูผลลัพธ์ของระบบ";
  }
  if (error instanceof ApiError && error.status === 401) {
    return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
  }
  return "ไม่สามารถโหลดผลลัพธ์ได้ กรุณาลองใหม่อีกครั้ง";
};

const stateLabel = (state: AdminResultState) =>
  state === "submitted" ? "ส่งแล้ว" : "ฉบับร่าง";

const AdminResultsRoute = () => {
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const { form: preselectedForm } = useSearch({ from: "/admin/results" });
  const initialForm = preselectedForm ?? "";
  const [results, setResults] = useState<AdminResult[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(() => emptyPagination(25));
  const [formFilter, setFormFilter] = useState(initialForm);
  const [userFilter, setUserFilter] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [fiscalYearFilter, setFiscalYearFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<AdminResultState | "all">(
    "all"
  );
  const [correctionFilter, setCorrectionFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [draftFilters, setDraftFilters] = useState({
    correction: "",
    fiscal_year: "",
    form: initialForm,
    from: "",
    month: "",
    province: "",
    state: "all" as AdminResultState | "all",
    to: "",
    user: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [followUps, setFollowUps] = useState<AttachmentFollowUp[]>([]);
  const [followUpCase, setFollowUpCase] = useState("");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpActionError, setFollowUpActionError] = useState<string | null>(
    null
  );
  const [followUpLoading, setFollowUpLoading] = useState(true);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpConfirmation, setFollowUpConfirmation] = useState<{
    operationId: string;
    generation: number;
    versionId?: string;
    filename?: string;
  } | null>(null);
  const followUpDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = followUpDialogRef.current;
    if (!dialog) {
      return;
    }
    if (followUpConfirmation) {
      if (!dialog.open) {
        dialog.showModal();
      }
      dialog
        .querySelector<HTMLButtonElement>("#attachment-follow-up-cancel")
        ?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [followUpConfirmation]);

  useEffect(() => {
    const controller = new AbortController();
    const loadFollowUps = async () => {
      setFollowUpLoading(true);
      const query = formFilter.trim()
        ? `?${new URLSearchParams({ form: formFilter.trim() })}`
        : "";
      try {
        const payload = await apiGet<{ followUps: AttachmentFollowUp[] }>(
          `/api/admin/results/attachment-follow-up${query}`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) {
          return;
        }
        if (!Array.isArray(payload.followUps)) {
          throw new TypeError("Attachment follow-up response is invalid");
        }
        setFollowUps(payload.followUps);
        setFollowUpError(null);
      } catch {
        if (!controller.signal.aborted) {
          setFollowUpError(
            "ไม่สามารถโหลดหลักฐานไฟล์แนบได้ กรุณาตรวจหลักฐานล่าสุดอีกครั้ง"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setFollowUpLoading(false);
        }
      }
    };
    loadFollowUps();
    return () => controller.abort();
  }, [formFilter, reloadVersion]);

  const confirmFollowUp = async () => {
    if (!followUpConfirmation || followUpBusy || !canManage) {
      return;
    }
    setFollowUpBusy(true);
    setFollowUpActionError(null);
    try {
      const { operationId, generation, versionId } = followUpConfirmation;
      await apiPost(
        `/api/admin/results/attachment-follow-up/${operationId}/${versionId ? "settle" : "cancel"}`,
        { generation, ...(versionId ? { versionId } : {}) }
      );
    } catch (caughtError) {
      setFollowUpActionError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "ยังยืนยันผลคำขอไม่ได้ ห้ามส่งคำขอลบซ้ำ กรุณาเปิดหลักฐานล่าสุดและประสาน PM/ECM"
      );
    } finally {
      setFollowUpConfirmation(null);
      setFollowUpBusy(false);
      setReloadVersion((value) => value + 1);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadResults = async () => {
      setLoading(true);
      setError(null);
      const filters: AdminResultListQuery = {
        page: String(page),
        ...(formFilter.trim() ? { form: formFilter.trim() } : {}),
        ...(userFilter.trim() ? { user: userFilter.trim() } : {}),
        ...(provinceFilter ? { province: provinceFilter } : {}),
        ...(monthFilter ? { month: monthFilter } : {}),
        ...(fiscalYearFilter ? { fiscal_year: fiscalYearFilter } : {}),
        ...(stateFilter === "all" ? {} : { state: stateFilter }),
        ...(correctionFilter.trim()
          ? { correction: correctionFilter.trim() }
          : {}),
        ...(fromFilter ? { from: fromFilter } : {}),
        ...(toFilter ? { to: `${toFilter}T23:59:59.999Z` } : {}),
      };
      const query = new URLSearchParams(Object.entries(filters));
      try {
        const payload = await apiGet<AdminResultListResponse>(
          `/api/admin/results?${query.toString()}`
        );
        if (!cancelled) {
          setPagination(payload.pagination);
          if (payload.pagination.page !== page) {
            setPage(payload.pagination.page);
          }
          setResults(payload.results);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(errorMessage(caughtError));
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadResults();
    return () => {
      cancelled = true;
    };
  }, [
    correctionFilter,
    page,
    fiscalYearFilter,
    formFilter,
    fromFilter,
    monthFilter,
    provinceFilter,
    reloadVersion,
    stateFilter,
    toFilter,
    userFilter,
  ]);

  const applyFilters = () => {
    setFormFilter(draftFilters.form);
    setUserFilter(draftFilters.user);
    setProvinceFilter(draftFilters.province);
    setMonthFilter(draftFilters.month);
    setFiscalYearFilter(draftFilters.fiscal_year);
    setStateFilter(draftFilters.state);
    setCorrectionFilter(draftFilters.correction);
    setFromFilter(draftFilters.from);
    setToFilter(draftFilters.to);
    setPage(1);
  };

  const visibleFollowUps = followUps.filter(
    (entry) =>
      !followUpCase.trim() ||
      entry.caseReference === followUpCase.trim() ||
      entry.operationId === followUpCase.trim()
  );
  return (
    <div className="space-y-6">
      <dialog
        ref={followUpDialogRef}
        aria-labelledby="attachment-follow-up-confirmation"
        className="m-auto w-full max-w-lg rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 text-[var(--ink)] shadow-xl backdrop:bg-black/35"
        onCancel={(event) => {
          event.preventDefault();
          if (!followUpBusy) {
            setFollowUpConfirmation(null);
          }
        }}
      >
        {followUpConfirmation ? (
          <>
            <h2
              id="attachment-follow-up-confirmation"
              className="text-lg font-bold"
            >
              {followUpConfirmation.versionId
                ? "ยืนยันการลบไฟล์ค้างครั้งแรก"
                : "ยืนยันหยุดรอบแนบเดิม"}
            </h2>
            <p className="my-4 break-all">
              {followUpConfirmation.versionId
                ? `ลบ ${followUpConfirmation.filename} จาก ECM เมื่อไม่เหลือ references เท่านั้น ไฟล์ลบแล้วกู้คืนไม่ได้ การกระทำนี้ไม่เปลี่ยนคำตอบเดิม`
                : "หยุด sender/commit ของรอบเดิม ไม่ได้ยืนยันว่า ECM ไม่มีไฟล์ คำขอที่ส่งไปแล้วต้องตามผลและ cleanup ครบก่อนปลดค้าง"}
            </p>
            <p className="mb-4 break-all font-mono text-xs">
              {followUpConfirmation.operationId}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                id="attachment-follow-up-cancel"
                disabled={followUpBusy}
                variant="secondary"
                onClick={() => setFollowUpConfirmation(null)}
              >
                ยกเลิก
              </Button>
              <Button
                disabled={followUpBusy}
                variant="danger"
                onClick={confirmFollowUp}
              >
                ยืนยัน
              </Button>
            </div>
          </>
        ) : null}
      </dialog>
      <PageHeader
        title="ตรวจทานคำตอบ"
        description="เปิดดูฉบับร่างและคำตอบที่ส่งแล้วแบบอ่านอย่างเดียว"
      />
      <Card>
        <form
          className="grid gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
        >
          <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
            Form Public ID
            <Input
              aria-label="Form Public ID"
              onChange={(event) =>
                setDraftFilters((filters) => ({
                  ...filters,
                  form: event.target.value,
                }))
              }
              value={draftFilters.form}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
            อีเมลผู้ใช้
            <Input
              aria-label="อีเมลผู้ใช้"
              onChange={(event) =>
                setDraftFilters((filters) => ({
                  ...filters,
                  user: event.target.value,
                }))
              }
              value={draftFilters.user}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
            สถานะ
            <select
              className={selectClass}
              onChange={(event) =>
                setDraftFilters((filters) => ({
                  ...filters,
                  state: event.target.value as AdminResultState | "all",
                }))
              }
              value={draftFilters.state}
            >
              <option value="all">ทั้งหมด</option>
              <option value="draft">ฉบับร่าง</option>
              <option value="submitted">ส่งแล้ว</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
            Correction ล่าสุด
            <Input
              aria-label="Correction ล่าสุด"
              max="10000"
              min="0"
              onChange={(event) =>
                setDraftFilters((filters) => ({
                  ...filters,
                  correction: event.target.value,
                }))
              }
              step="1"
              type="number"
              value={draftFilters.correction}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
            ตั้งแต่
            <Input
              aria-label="ตั้งแต่"
              onChange={(event) =>
                setDraftFilters((filters) => ({
                  ...filters,
                  from: event.target.value,
                }))
              }
              type="date"
              value={draftFilters.from}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
            ถึง
            <Input
              aria-label="ถึง"
              onChange={(event) =>
                setDraftFilters((filters) => ({
                  ...filters,
                  to: event.target.value,
                }))
              }
              type="date"
              value={draftFilters.to}
            />
          </label>
          <div className="grid gap-4 md:col-span-2 md:grid-cols-3 xl:col-span-3">
            <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
              จังหวัด
              <select
                className={selectClass}
                onChange={(event) =>
                  setDraftFilters((filters) => ({
                    ...filters,
                    province: event.target.value,
                  }))
                }
                value={draftFilters.province}
              >
                <option value="">ทั้งหมด</option>
                {provinceChoices.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
              เดือน
              <select
                className={selectClass}
                onChange={(event) =>
                  setDraftFilters((filters) => ({
                    ...filters,
                    month: event.target.value,
                  }))
                }
                value={draftFilters.month}
              >
                <option value="">ทั้งหมด</option>
                {monthChoices.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
              ปีงบประมาณ
              <select
                className={selectClass}
                onChange={(event) =>
                  setDraftFilters((filters) => ({
                    ...filters,
                    fiscal_year: event.target.value,
                  }))
                }
                value={draftFilters.fiscal_year}
              >
                <option value="">ทั้งหมด</option>
                {fiscalYearChoices().map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-end gap-2 md:col-span-2 xl:col-span-3">
            <Button type="submit">
              <Search size={16} />
              ค้นหา
            </Button>
            <Button
              onClick={() => setReloadVersion((version) => version + 1)}
              type="button"
              variant="secondary"
            >
              โหลดใหม่
            </Button>
          </div>
        </form>
      </Card>

      {error ? (
        <Notice tone="danger">
          <div className="flex flex-wrap items-center gap-3">
            <strong>โหลดผลลัพธ์ไม่สำเร็จ</strong>
            <span>{error}</span>
            <Button
              onClick={() => setReloadVersion((version) => version + 1)}
              size="sm"
            >
              ลองใหม่
            </Button>
          </div>
        </Notice>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="font-semibold">รายการคำตอบ</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            เปิดรายละเอียดเพื่ออ่านข้อมูลและส่งออกเฉพาะคำตอบที่ส่งแล้ว
          </p>
        </div>
        {loading ? (
          <div
            className="flex min-h-48 items-center justify-center"
            aria-label="กำลังโหลดผลลัพธ์"
          >
            <Spinner />
          </div>
        ) : error ? null : results.length === 0 ? (
          <div className="p-8 text-center text-[var(--ink-soft)]">
            ไม่พบผลลัพธ์ตามตัวกรอง
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-left text-sm">
              <caption className="sr-only">รายการฉบับร่างและคำตอบที่ส่งแล้ว</caption>
              <thead className="border-b border-[var(--line)] bg-[var(--paper-soft)] text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                <tr>
                  <th className="px-4 py-3" scope="col">
                    แบบฟอร์ม
                  </th>
                  <th className="px-4 py-3" scope="col">
                    ผู้ใช้
                  </th>
                  <th className="whitespace-nowrap px-4 py-3" scope="col">
                    จังหวัด
                  </th>
                  <th className="whitespace-nowrap px-4 py-3" scope="col">
                    เดือน
                  </th>
                  <th className="whitespace-nowrap px-4 py-3" scope="col">
                    ปีงบประมาณ
                  </th>
                  <th className="px-4 py-3" scope="col">
                    สถานะ
                  </th>
                  <th className="px-4 py-3" scope="col">
                    แก้ไขล่าสุด
                  </th>
                  <th className="px-4 py-3" scope="col">
                    Correction
                  </th>
                  <th className="px-4 py-3" scope="col">
                    <span className="sr-only">เปิด</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr
                    className="border-b border-[var(--line)] last:border-0"
                    key={result.id}
                  >
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {result.formTitle}
                        </span>
                        <DocumentKindBadge documentKind={result.documentKind} />
                      </div>
                      <div className="mt-1 font-mono text-xs text-[var(--ink-soft)]">
                        {result.formPublicId}
                      </div>
                    </td>
                    <td className="max-w-64 break-all px-4 py-4 text-[var(--ink-soft)]">
                      {result.userEmail}
                    </td>
                    <td className="max-w-48 break-all px-4 py-4 text-[var(--ink-soft)]">
                      {String(result.province ?? "-")}
                    </td>
                    <td className="max-w-48 break-all px-4 py-4 text-[var(--ink-soft)]">
                      {String(result.month ?? "-")}
                    </td>
                    <td className="max-w-48 break-all px-4 py-4 text-[var(--ink-soft)]">
                      {String(result.fiscalYear ?? "-")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Badge
                        tone={
                          result.state === "submitted" ? "success" : "warning"
                        }
                      >
                        {stateLabel(result.state)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-[var(--ink-soft)]">
                      {formatDate(result.updatedAt)}
                    </td>
                    <td className="px-4 py-4 text-[var(--ink-soft)]">
                      {result.latestCorrectionNumber ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <Link
                        className="font-semibold text-[var(--accent)] underline-offset-4 hover:underline"
                        params={{ responseId: result.id }}
                        to="/admin/results/$responseId"
                        search={{ form: undefined }}
                      >
                        เปิดอ่าน
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPagination
          className="border-t border-[var(--line)] px-5 py-4"
          label="แบ่งหน้าผลลัพธ์"
          pagination={pagination}
          disabled={loading || Boolean(error)}
          onPageChange={setPage}
        />
      </Card>
      <Card className="p-5">
        <h2 className="text-lg font-bold">ติดตามไฟล์แนบ ECM</h2>
        <p className="my-2 text-sm text-[var(--ink-soft)]">
          รายการติดตามแยกจากคำตอบปกติ กรองด้วยแบบฟอร์มเท่านั้น ไม่คืนข้อมูลคำตอบที่ลบแล้ว URL
          เป็น public และอาจยังเปิดได้ระหว่าง cleanup
        </p>
        <label className="my-3 block text-sm">
          รหัสติดตามการลบหรือ Operation
          <Input
            value={followUpCase}
            onChange={(event) => setFollowUpCase(event.target.value)}
          />
        </label>
        {followUpError ? <Notice tone="danger">{followUpError}</Notice> : null}
        {followUpActionError ? (
          <Notice tone="danger">{followUpActionError}</Notice>
        ) : null}
        <Button
          disabled={followUpLoading || followUpBusy}
          variant="secondary"
          onClick={() => setReloadVersion((value) => value + 1)}
        >
          ตรวจหลักฐานล่าสุด
        </Button>
        {followUpLoading ? <p role="status">กำลังอ่านหลักฐานไฟล์แนบ…</p> : null}
        {!followUpLoading && !visibleFollowUps.length && !followUpError ? (
          <p className="mt-3">ไม่มีรายการติดตาม</p>
        ) : null}
        {visibleFollowUps.map((followUp) => (
          <details
            key={followUp.operationId}
            className="mt-4 rounded-lg border border-[var(--line)] p-4"
          >
            <summary className="cursor-pointer font-semibold">
              {followUp.formTitle ?? followUp.formId ?? "แบบฟอร์มเดิม"} —{" "}
              {followUp.mutationHeld ? "ระงับการเปลี่ยนคำตอบ" : "ติดตาม cleanup"}
              {followUp.responseDeleted
                ? " — ลบคำตอบแล้ว (หลักฐานติดตามเท่านั้น)"
                : ""}
            </summary>
            <p className="mt-3">{followUp.reason}</p>
            <p className="mt-2 text-sm">{followUp.nextAction}</p>
            <div className="my-3 grid gap-1 break-all text-sm">
              {followUp.caseReference ? (
                <div>
                  รหัสติดตามการลบ:{" "}
                  <span className="font-mono">{followUp.caseReference}</span>
                </div>
              ) : null}
              <div>
                Operation:{" "}
                <span className="font-mono">{followUp.operationId}</span>
              </div>
              <div>
                Response:{" "}
                <span className="font-mono">{followUp.responseId}</span>
              </div>
              <div>
                Form: {followUp.formPublicId ?? followUp.formId ?? "ไม่ทราบ"}
              </div>
              <div>Actor: {followUp.actorId ?? "ไม่มี batch"}</div>
              <div>
                Checkpoint: {followUp.checkpoint ?? "ไม่มี batch"} / Canonical:{" "}
                {followUp.documentKey ?? "ไม่มี batch"}
              </div>
              <div>
                สถานะ: {followUp.state} / เริ่ม:{" "}
                {formatDateTime(followUp.createdAt)}
              </div>
            </div>
            {followUp.responseDeleted ? null : (
              <Link
                className="text-[var(--accent)] underline"
                to="/admin/results/$responseId"
                params={{ responseId: followUp.responseId }}
                search={{ form: undefined }}
              >
                เปิดอ่านคำตอบที่บันทึกไว้
              </Link>
            )}
            {canManage && followUp.canFence && followUp.generation !== null ? (
              <Button
                className="ml-3"
                disabled={followUpBusy}
                variant="secondary"
                onClick={() => {
                  if (followUp.generation !== null) {
                    setFollowUpConfirmation({
                      generation: followUp.generation,
                      operationId: followUp.operationId,
                    });
                  }
                }}
              >
                หยุดรอบเดิมและติดตามผล
              </Button>
            ) : null}
            {followUp.versions.map((version) => (
              <section
                key={version.id}
                className="mt-3 border-t border-[var(--line)] pt-3 text-sm"
              >
                <h3 className="font-semibold">
                  {version.tag}
                  {version.rowIndex === null
                    ? " / ช่องเดี่ยว"
                    : ` / แถว ${version.rowIndex + 1} (index ${version.rowIndex})`}
                </h3>
                <div className="my-2 grid gap-1 break-all">
                  <div>
                    Binding: {version.bindingId} / Version: {version.id}
                  </div>
                  <div>ชื่อที่ส่ง: {version.filename}</div>
                  <div>
                    ต้นฉบับ: {version.originalName} ({version.sizeBytes} ไบต์)
                  </div>
                  <div>
                    เลข: {version.documentNumber} / ปี:{" "}
                    {version.fiscalYear ?? "-"} /
                    {version.storageMode === "template"
                      ? ` แม่แบบ: ${version.templateName ?? "-"}`
                      : ` หมวด: ${version.category}`}
                  </div>
                  <div>
                    สถานะไฟล์: {version.state} / cleanup:{" "}
                    {version.cleanupState ?? "ไม่มี"} / references:{" "}
                    {version.referenced ? "ยังมี" : "ไม่พบ"}
                  </div>
                  <div>
                    เริ่มส่ง:{" "}
                    {version.sentAt
                      ? formatDateTime(version.sentAt)
                      : "ยังไม่เริ่ม"}{" "}
                    / receipt:{" "}
                    {version.receivedAt
                      ? formatDateTime(version.receivedAt)
                      : "ไม่มีหลักฐาน"}
                  </div>
                  <div>
                    คำขอ upload สิ้นสุดพร้อม receipt:{" "}
                    {version.requestSettledAt
                      ? formatDateTime(version.requestSettledAt)
                      : "ยังพิสูจน์ไม่ได้"}
                  </div>
                  <div>
                    เริ่ม DELETE:{" "}
                    {version.deleteAttemptedAt
                      ? formatDateTime(version.deleteAttemptedAt)
                      : "ยังไม่เคยส่ง"}
                  </div>
                  <div>
                    ผู้ยืนยัน: {version.confirmedBy ?? "ยังไม่มี"} / ผลลบยืนยัน:{" "}
                    {version.confirmedAt
                      ? formatDateTime(version.confirmedAt)
                      : "ยังไม่มี"}
                  </div>
                </div>
                {version.evidence ? (
                  <pre className="overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(version.evidence, null, 2)}
                  </pre>
                ) : null}
                {canManage && version.canDelete ? (
                  <Button
                    disabled={followUpBusy}
                    variant="secondary"
                    onClick={() =>
                      setFollowUpConfirmation({
                        filename: version.filename,
                        generation: version.generation,
                        operationId: followUp.operationId,
                        versionId: version.id,
                      })
                    }
                  >
                    เริ่มลบไฟล์ค้างครั้งแรก
                  </Button>
                ) : null}
                {!version.canDelete &&
                ["started", "unknown", "deleting"].includes(version.state) ? (
                  <p role="status">
                    ยังพิสูจน์ผลคำขอเดิมไม่ได้ คงข้อค้าง ห้ามส่ง upload/DELETE ซ้ำหรือใช้
                    URL/token ที่กรอกเอง
                  </p>
                ) : null}
              </section>
            ))}
          </details>
        ))}
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/admin/results/")({
  component: AdminResultsRoute,
});
