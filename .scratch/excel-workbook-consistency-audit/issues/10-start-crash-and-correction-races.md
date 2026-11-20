# 10 — ตรวจ crash ตอนเริ่มรอบ และ User reopen ชน Admin Correction

Status: needs-triage  
Type: task  
Priority: P2  
Blocked by: —  
Evidence: [R10](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3)

## ขอบเขต

สร้าง deterministic fault probes สองจุดแยกกัน: (ก) process stop หลัง initial object write ก่อน Response pointer commit และ (ข) User reopen หลัง Correction admission/dispatch แต่ก่อน final DB commit. ยืนยัน cleanup intent/sweeper และ existing fencing ก่อนตัดสินใจแก้. หากพบ gap ให้จำกัดการแก้ที่ write/intent ordering หรือ admission/commit scope ที่เกิดจริง ไม่เปลี่ยนสัญญาเริ่มรอบ XLSX ใหม่และไม่ถือ DB transaction ว่า rollback DCM ได้

## เกณฑ์รับงาน

- [x] Crash-injection ใน sandbox แสดงว่ารอบใหม่ไม่อ้างไฟล์ที่ยังไม่ commit. Artifact กำพร้าต้อง retire ด้วย intent ที่พิสูจน์ ownership ได้; ไม่ลบของ canonical หรือของ concurrent winner
- [x] ใช้ loopback receipt barrier บังคับลำดับ reopen ก่อน dispatch และหลัง dispatch: Correction ที่ stale ไม่เขียนทับประวัติ/ร่างใหม่. Late receipt ถูกเก็บตาม Operation เดิมและเข้า cleanup/recovery guards โดยไม่มี resend หรือ DELETE ที่ผลเดิมไม่ชัด
- [x] ตรวจ next-opening failure แยกจาก Submit สำเร็จ, พร้อม key/lease/response version ที่ใช้. รายงานว่าเคสใด regression, เคสใด guard เดิมรองรับ และเคสใดไม่ยืนยันบน provider จริง

## Comments

- ยังไม่สรุปว่า orphan ค้างถาวรหรือพบ provider corruption จริง
- **Regression ที่ยืนยันแล้ว — ordinary XLSX Start:** รัน child process ขณะ PostgreSQL ล็อก Form, ตรวจพบ candidate ใน RustFS และส่ง `SIGKILL` ก่อน commit. บน baseline `ba89561` Response ยังเป็น `submitted` แต่ไม่มี intent ของ candidate (`P2025`). แก้ให้บันทึก intent ของ key ใหม่ก่อนเขียน และถอน intent ใน transaction เดียวกับ pointer. หลังแก้ Start พร้อมกันสองคำขอตอบ 200, Draft ใช้ workbook จาก Published Template และ sweeper ลบเฉพาะ candidate ที่ตายก่อน commit. Submission และ Draft ของผู้ชนะยังอยู่
- **Guard เดิม — Correction:** หลัง 202 ให้ loopback หยุดที่ login ก่อน dispatch (`prepared`) หรือเก็บ bytes แล้วแต่ยังไม่ส่ง receipt (`started`). ตรวจว่า batch ใช้ Correction workspace document key และ lease เดิม; Start ใช้ Draft document key ใหม่และ `publishedVersion` เดิม. Correction จบเป็น `failed` ทั้งสองกรณี. ก่อน dispatch ไม่มี `sentAt` หรือ POST; หลัง dispatch มี POST เดียว ไม่มี DELETE ระหว่างรอ receipt และบันทึก late receipt พร้อม cleanup intent ใต้ Operation เดิม. ไม่ลบไฟล์ประวัติหรือเปลี่ยน Submission / Draft ใหม่
- **Next-opening failure ไม่ใช่ Submit failure:** หลัง Submit `completed` ทำให้เฉพาะ Published Template object ไม่พร้อมชั่วคราว; Start ตอบ 409 `document_unavailable`, สถานะและ bytes ของ Submission ไม่เปลี่ยน. คืน fixture ก่อนเริ่ม crash probe
- **การตรวจ:** `bun --no-env-file test --timeout 45000 test/http/ecm-scalar-save-submit.test.ts -t 'Start crash|User Start .* dispatch'` ผ่าน 3 เคส บน PostgreSQL/RustFS แยกและ loopback DCM. ไม่ได้ทดสอบการตอบสนองของ DCM จริงหรือยืนยันพฤติกรรม Production
