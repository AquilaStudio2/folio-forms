import type { Ref } from "react";

import { ApiError } from "@/lib/api";

export const isResponseDeleteConflict = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 409 &&
  error.code === "operation_in_progress";

export const ResponseDeleteConflictNotice = ({
  action,
  failed,
  loading,
  ref,
  subject,
}: {
  action: "ลบ" | "ทิ้ง";
  failed: boolean;
  loading: boolean;
  ref: Ref<HTMLDivElement>;
  subject: string;
}) => {
  let guidance = `กรุณาตรวจสอบข้อมูลล่าสุดก่อนยืนยันการ${action}อีกครั้ง`;
  if (failed) {
    guidance = "โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่";
  } else if (loading) {
    guidance = "กำลังโหลดข้อมูลล่าสุด…";
  }
  return (
    <div
      ref={ref}
      className="mb-4 rounded-[10px] border border-[var(--line)] bg-[var(--muted-soft)] px-4 py-3 text-sm text-[var(--ink-soft)]"
      role="alert"
      tabIndex={-1}
    >
      {subject}มีการดำเนินการอื่นอยู่ จึงยังไม่ได้{action} {guidance}
    </div>
  );
};
