// oxlint-disable unicorn(filename-case) -- TanStack Router requires this dynamic route filename.
import {
  createFileRoute,
  Link,
  useBlocker,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { OnlyOfficeEditor } from "@/components/onlyoffice-editor";
import { Button, Card, Input, Notice } from "@/components/ui";
import type { EditorBridgeMessage } from "@/features/onlyoffice/editor-protocol";
import { shouldBlockDirtyNavigation } from "@/lib/form-lifecycle";
import { useReauthenticationGuard } from "@/lib/use-reauthentication-guard";

const AdminCorrectionRoute = () => {
  const navigate = useNavigate();
  const { responseId } = useParams({
    from: "/admin/results/$responseId/correction",
  });
  const { submissionId } = useSearch({
    from: "/admin/results/$responseId/correction",
  });
  const editorConfigUrl = submissionId
    ? `/api/admin/results/${responseId}/correction/editor-config?submissionId=${encodeURIComponent(submissionId)}`
    : `/api/admin/results/${responseId}/correction/editor-config`;
  const [reason, setReason] = useState("");
  const [saveRequest, setSaveRequest] = useState(0);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorCommandReady, setEditorCommandReady] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  const retiredWorkspaceRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [completedWithPendingAttachments, setCompletedWithPendingAttachments] =
    useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const exitDialogRef = useRef<HTMLDialogElement>(null);
  const allowNavigationRef = useRef(false);
  const hasUnsavedChanges =
    completedWithPendingAttachments ||
    saving ||
    unresolved ||
    dirty ||
    Boolean(reason);
  const navigationBlocker = useBlocker({
    disabled: !hasUnsavedChanges,
    enableBeforeUnload: hasUnsavedChanges,
    shouldBlockFn: () =>
      shouldBlockDirtyNavigation(hasUnsavedChanges, allowNavigationRef.current),
    withResolver: true,
  });
  useEffect(() => {
    const dialog = exitDialogRef.current;
    if (!dialog) {
      return;
    }
    if (navigationBlocker.status === "blocked") {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
  }, [navigationBlocker.status]);
  useReauthenticationGuard(hasUnsavedChanges, () => {
    setMessage(
      completedWithPendingAttachments
        ? "Correction รอบก่อนบันทึกแล้ว แต่ไฟล์หรือการนำออกที่เลือกภายหลังยังไม่บันทึก กรุณารักษาหน้านี้ไว้"
        : "กรุณาบันทึก Correction ให้สำเร็จก่อนเปลี่ยนเซสชัน เพื่อเก็บการแก้ไขไว้"
    );
  });
  useEffect(() => {
    if (message && !saving) {
      feedbackRef.current?.focus();
    }
  }, [message, saving]);

  const handleBridgeMessage = (bridgeMessage: EditorBridgeMessage) => {
    if (
      bridgeMessage.type !== "operation" ||
      (bridgeMessage.action !== "save-correction" &&
        bridgeMessage.action !== "save-correction-workspace")
    ) {
      return;
    }
    if (
      retiredWorkspaceRef.current &&
      bridgeMessage.action === "save-correction-workspace"
    ) {
      return;
    }
    if (bridgeMessage.status === "pending") {
      setSaving(true);
      setMessage(
        bridgeMessage.action === "save-correction-workspace"
          ? "กำลังบันทึกการเลือกโครงการ…"
          : "กำลังบันทึก Correction…"
      );
      return;
    }
    if (bridgeMessage.status === "failed") {
      setSaving(false);
      setUnresolved(bridgeMessage.attachmentCommitUnresolved === true);
      setMessage(bridgeMessage.error ?? "บันทึก Correction ไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setSaving(false);
    setUnresolved(false);
    if (
      bridgeMessage.action === "save-correction" &&
      (bridgeMessage.hasPendingAttachments ||
        bridgeMessage.hasUnsavedDocumentChanges)
    ) {
      retiredWorkspaceRef.current = true;
      setCompletedWithPendingAttachments(true);
      setDirty(true);
      setMessage(
        "Correction รอบก่อนบันทึกแล้ว แต่ไฟล์หรือการนำออกที่เลือกภายหลังยังไม่บันทึก ไฟล์ยังอยู่ในหน้านี้ ไม่สามารถบันทึกซ้ำด้วย workspace เดิมได้ หากออกจะทิ้งเฉพาะการเปลี่ยนแปลงที่ยังไม่บันทึก แล้วจึงเปิด Correction ฉบับปัจจุบันและเลือกไฟล์ใหม่"
      );
      return;
    }
    if (bridgeMessage.action === "save-correction-workspace") {
      setMessage(null);
      if (
        bridgeMessage.editorRemountSafe ||
        (!bridgeMessage.hasPendingAttachments &&
          !bridgeMessage.hasUnsavedDocumentChanges)
      ) {
        setRevision((value) => value + 1);
      }
      return;
    }
    allowNavigationRef.current = true;
    retiredWorkspaceRef.current = true;
    navigationBlocker.reset?.();
    void navigate({
      params: { responseId },
      search: { form: undefined },
      to: "/admin/results/$responseId",
    });
  };

  const submitCorrection = () => {
    const trimmedReason = reason.trim();
    if (completedWithPendingAttachments || unresolved) {
      return;
    }
    if (!trimmedReason || saving || !editorCommandReady) {
      setMessage("กรุณาระบุเหตุผลการแก้ไข");
      return;
    }
    setMessage(null);
    setSaving(true);
    setSaveRequest((request) => request + 1);
  };

  let exitDescription =
    "การออกจากหน้านี้จะทิ้งการแก้ไข เหตุผล และไฟล์ที่ยังไม่บันทึก โดยไม่เปลี่ยนฉบับที่บันทึกแล้ว";
  if (saving) {
    exitDescription = "กำลังบันทึก Correction กรุณารอผลก่อนออกจากหน้านี้";
  } else if (completedWithPendingAttachments) {
    exitDescription =
      "Correction รอบก่อนบันทึกแล้ว การออกจะทิ้งไฟล์ การนำออก และการแก้ไขที่เลือกภายหลังซึ่งยังไม่บันทึก ต้องเปิด Correction ฉบับปัจจุบันแล้วเลือกไฟล์ใหม่ หากต้องการรักษาไฟล์ในหน้านี้ ให้เลือกอยู่ต่อ";
  } else if (unresolved) {
    exitDescription =
      "ยังยืนยันผลคำขอเดิมไม่ได้ การออกไม่ยกเลิกคำขอนั้นและไม่ล้าง checkpoint ไฟล์และการแก้ไขที่ยังไม่บันทึกในหน้านี้จะหาย";
  }

  return (
    <div className="space-y-6">
      <dialog
        ref={exitDialogRef}
        aria-labelledby="correction-exit-title"
        className="m-auto w-full max-w-lg rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] p-6 text-[var(--ink)] shadow-xl backdrop:bg-black/35"
        onCancel={(event) => {
          event.preventDefault();
          navigationBlocker.reset?.();
        }}
      >
        <h2 id="correction-exit-title" className="text-lg font-semibold">
          มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
        </h2>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">{exitDescription}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            autoFocus
            onClick={() => navigationBlocker.reset?.()}
          >
            อยู่หน้านี้ต่อ
          </Button>
          <Button
            disabled={saving}
            variant="danger"
            onClick={() => {
              allowNavigationRef.current = true;
              navigationBlocker.proceed?.();
            }}
          >
            ทิ้งการเปลี่ยนแปลงและออก
          </Button>
        </div>
      </dialog>
      <PageHeader
        title="แก้ไขคำตอบที่ส่งแล้ว"
        description="Correction จะสร้างฉบับใหม่โดยไม่แก้ไข Submission เดิม"
        action={
          <Link
            search={{ form: undefined }}
            to="/admin/results/$responseId"
            params={{ responseId }}
          >
            <Button variant="secondary">ยกเลิก</Button>
          </Link>
        }
      />
      <Card className="space-y-4 p-5">
        <label className="grid gap-1 text-sm font-semibold text-[var(--ink-soft)]">
          เหตุผลการแก้ไข
          <Input
            aria-describedby="correction-reason-help"
            disabled={saving || unresolved || completedWithPendingAttachments}
            aria-label="เหตุผลการแก้ไข"
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="ระบุเหตุผลที่ตรวจสอบได้"
            required
            value={reason}
          />
        </label>
        <p
          id="correction-reason-help"
          className="text-sm text-[var(--ink-soft)]"
        >
          ระบบจะบันทึกผู้แก้ไข เวลา เหตุผล และข้อมูลฉบับใหม่เป็นประวัติถาวร
        </p>
        <div
          ref={feedbackRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="outline-none"
        >
          {message ? (
            <Notice tone={saving ? "neutral" : "danger"}>{message}</Notice>
          ) : null}
        </div>
        <div>
          <Button
            disabled={
              saving ||
              !editorCommandReady ||
              unresolved ||
              completedWithPendingAttachments ||
              reason.trim().length === 0
            }
            onClick={submitCorrection}
          >
            บันทึก Correction
          </Button>
          {unresolved ? (
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                setSaveRequest((request) => request + 1);
              }}
            >
              ตรวจผลคำขอเดิม
            </Button>
          ) : null}
        </div>
      </Card>
      <Card className="min-h-[640px] overflow-hidden p-0">
        <OnlyOfficeEditor
          configUrl={editorConfigUrl}
          onBridgeMessage={handleBridgeMessage}
          onCommandReadyChange={setEditorCommandReady}
          onDirtyChange={(value) => {
            if (!retiredWorkspaceRef.current || value) {
              setDirty(value);
            }
          }}
          trackNativeDirty
          revision={revision}
          saveAction="save-correction"
          saveReason={reason}
          saveRequest={saveRequest}
          title="Correction editor"
        />
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/admin/results/$responseId/correction")({
  component: AdminCorrectionRoute,
  validateSearch: (search) => ({
    submissionId:
      typeof search.submissionId === "string" ? search.submissionId : undefined,
  }),
});
