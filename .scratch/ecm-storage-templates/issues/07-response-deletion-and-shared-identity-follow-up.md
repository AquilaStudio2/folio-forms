# 07: Response deletion ปลอดภัยต่อ shared file identity และติดตาม cleanup ต่อได้

**What to build:** User/Admin ลบ Response ตามสิทธิ์และ confirmation เดิมได้ โดยแยกผลลบข้อมูลกับผลลบไฟล์ ป้องกัน shared provider identity ที่ยังถูกอ้างอิง และเก็บ persistent warnings/evidence ใน existing Results follow-up แม้ Response ถูกลบแล้ว

**Blocked by:** 03 — Scalar Save Draft/Submit แบบ template mode พร้อม identity และ failure safety.

**Status:** ready-for-agent

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 107–110; reference protection/warnings ครอบคลุม legacy/new resources และทุกชนิด snapshot

## Acceptance criteria

- [ ] Owner discard ใช้ได้เฉพาะ Draft ของตน Admin whole-Response deletion และ Viewer read-only คงสิทธิ์/confirmation เดิม ไม่ให้ arbitrary client URL/token เป็น deletion authority
- [ ] Response deletion เก็บ durable trusted attachment context ของ Draft/Submission/Correction/workspace/eligible Operations ก่อนลบ rows; ไม่ลด scope เหลือเฉพาะ latest receipt
- [ ] คำนวณ surviving references/aliases ที่ canonical provider identity หลัง retire references ของ Response ที่ลบ ไม่ถือ separate version/attempt rows หรือ token inequality ว่าไฟล์แยกกันเสมอ
- [ ] Existing admission/reference/deletion fencing ป้องกัน race ที่ reference เกิดใหม่ระหว่าง no-reference check และ dispatch DELETE; shared/protected/current B identity ไม่ถูกลบ
- [ ] DELETE ทำได้เฉพาะ known owned received/committed identity ที่มี request settlement และไม่มี surviving references ไม่มี search/client-token ownership inference
- [ ] Unknown upload, unconfirmed in-place overwrite หรือ previously dispatched uncertain DELETE ยังคง evidence-based hold ไม่ใช้เวลารอ/empty search/operator note ปลดหรือ resend
- [ ] Same-token overwrite evidence จาก 03 ไม่ทำให้ deletion follow-up ส่ง DELETE สำหรับ retired A แล้วลบ B ที่ยังใช้อยู่; known shared references ยังคง protected หลัง reload/restart
- [ ] การลบข้อมูลกับ confirmed external cleanup แสดงผลแยกกัน Old public URL อาจเปิดได้ขณะ cleanup ค้าง ต้องมี persistent warning ไม่แสดงว่าไฟล์ถูกลบจาก JSON disappearance เพียงอย่างเดียว
- [ ] Existing Results tracking ยังอ่าน evidence ได้โดย Admin/Viewer หลัง Response deletion โดยไม่คืน answers เป็น normal Response row; เฉพาะ current enabled Admin ทำ authorized first cleanup ตาม evidence เดิมได้
- [ ] Ordinary saves หรือเปิดหน้าใหม่ไม่ retry upload/delete ไม่ล้าง warning และไม่ adopt late receipt เป็นคำตอบ; late receipts ใช้ follow-up ตาม scope/fence จริง
- [ ] Archive คง files/history และไม่ dispatch file deletion Catalog CRUD และ duplicate Form ไม่สร้าง deletion cases หรือ cleanup ของ User
- [ ] Existing HTTP seam พิสูจน์ deletion authorization, confirmed/unconfirmed outcomes, shared identity across surviving snapshots/Responses, concurrent reference claims, crash/late receipt และ durable tracking หลังลบ Response
- [ ] Smoke actual deletion/confirmation และ Results follow-up ด้วย synthetic Responses/provider double ตรวจ saved B URL ของ reference ที่ยังเหลือและ persistent warning หลัง reload
- [ ] อัปเดต cleanup/deletion consumers, fixtures และ workflow/system map โดย reuse existing recovery/follow-up surface ไม่เพิ่ม dashboard, automatic retry queue หรือ manual unlock ที่ไร้หลักฐาน

## Notes

ไม่ต้องรอ 04/05 เพื่อทำ identity-aware whole-Response cleanup เพราะใช้ shared identity/attempt contract ของ 03 และ generic references ตั๋ว 08 ต้องตรวจ table/Correction combinations อีกครั้งบน integration checkout

ไม่มีการอนุญาตให้ลบไฟล์ live ของ User หรือขยายสิทธิ์ destructive actions จากการสร้างตั๋วนี้

## Comments
