import type { EditorLease } from "./editor-protocol";

export interface NegativeAdmissionProof {
  admission: "not-admitted";
  lease: EditorLease;
  revokedLeaseId: string;
}

export class AttachmentAdmissionRecoveredError extends Error {
  readonly recoveredLease: EditorLease;
  readonly revokedLeaseId: string;

  constructor(proof: NegativeAdmissionProof) {
    super("ยืนยันแล้วว่ารอบก่อนยังไม่เริ่มบันทึก ไฟล์และข้อมูลยังอยู่ กรุณากดบันทึกหรือส่งอีกครั้ง");
    this.name = "AttachmentAdmissionRecoveredError";
    this.recoveredLease = proof.lease;
    this.revokedLeaseId = proof.revokedLeaseId;
  }
}

export const recoveredAttachmentLease = (
  error: unknown,
  expectedLeaseId: string | undefined,
  activeLease: EditorLease | null
): EditorLease | null => {
  if (
    error instanceof AttachmentAdmissionRecoveredError &&
    expectedLeaseId !== undefined &&
    expectedLeaseId === error.revokedLeaseId &&
    activeLease?.id === expectedLeaseId
  ) {
    return error.recoveredLease;
  }
  return null;
};
