import { useState } from "react";

import { Button, Notice } from "@/components/ui";
import { isRecord } from "@/features/onlyoffice/editor-protocol";
import type { CapabilityRequestMessage } from "@/features/onlyoffice/editor-protocol";
import type { UploadPocHostOptions } from "@/features/onlyoffice/upload-poc-pending";
import { apiPost } from "@/lib/api";

export const xlsxPublishCheckpointKey = (scope: string) =>
  `folio-host-xlsx-publish:${scope}`;

export const rememberXlsxPublishCheckpoint = (
  request: CapabilityRequestMessage,
  scope: UploadPocHostOptions | undefined,
  leaseId: string
) => {
  const { draftCheckpoint } = request;
  if (
    request.action !== "publish" ||
    scope?.action !== "template-edit" ||
    typeof draftCheckpoint !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu.test(
      draftCheckpoint
    )
  ) {
    throw new Error("Invalid Publish checkpoint");
  }
  // Retain the checkpoint in the host before the plugin can dispatch Publish.
  const key = xlsxPublishCheckpointKey(scope.scopeIdentity);
  const value = JSON.stringify({ checkpoint: draftCheckpoint, leaseId });
  sessionStorage.setItem(key, value);
  return { key, value };
};

export const XlsxPublishRecovery = ({
  publicId,
  actorId,
}: {
  publicId: string;
  actorId: string;
}) => {
  const storageKey = xlsxPublishCheckpointKey(
    JSON.stringify([actorId, publicId, "template"])
  );
  const [stored, setStored] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "success" | "danger";
  } | null>(null);

  const recover = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await apiPost<unknown>(
        `/api/admin/forms/${encodeURIComponent(publicId)}/xlsx-draft/recover`,
        JSON.parse(stored ?? "null")
      );
      if (
        !isRecord(result) ||
        result.action !== "publish" ||
        typeof result.operationId !== "string"
      ) {
        throw new Error("Unverified Publish checkpoint");
      }
      const completed =
        result.status === "completed" &&
        isRecord(result.result) &&
        result.result.publicId === publicId &&
        typeof result.result.documentKey === "string" &&
        typeof result.result.version === "number";
      if (!completed && result.status !== "failed") {
        throw new Error("Unsettled Publish checkpoint");
      }
      if (sessionStorage.getItem(storageKey) === stored) {
        sessionStorage.removeItem(storageKey);
      }
      setStored(null);
      setFeedback(
        completed
          ? { message: "ยืนยันว่าเผยแพร่รอบเดิมสำเร็จแล้ว", tone: "success" }
          : { message: "คำขอเผยแพร่รอบเดิมไม่สำเร็จ", tone: "danger" }
      );
    } catch {
      setFeedback({
        message: "ยังยืนยันผลเผยแพร่รอบเดิมไม่ได้ กรุณาลองตรวจผลอีกครั้ง",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return stored || feedback ? (
    <div className="my-4 space-y-2">
      {feedback ? (
        <Notice tone={feedback.tone}>{feedback.message}</Notice>
      ) : null}
      {stored ? (
        <Button
          variant="secondary"
          type="button"
          disabled={busy}
          onClick={recover}
        >
          ตรวจผลเผยแพร่รอบเดิม
        </Button>
      ) : null}
    </div>
  ) : null;
};
