# 10 — ตรวจ crash ตอนเริ่มรอบ และ User reopen ชน Admin Correction

Status: needs-triage  
Type: task  
Priority: P2  
Blocked by: —  
Evidence: [R10](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3)

## ขอบเขต

สร้าง deterministic fault probes สองจุดแยกกัน: (ก) process stop หลัง initial object write ก่อน Response pointer commit และ (ข) User reopen หลัง Correction admission/dispatch แต่ก่อน final DB commit. ยืนยัน cleanup intent/sweeper และ existing fencing ก่อนตัดสินใจแก้. หากพบ gap ให้จำกัดการแก้ที่ write/intent ordering หรือ admission/commit scope ที่เกิดจริง ไม่เปลี่ยนสัญญาเริ่มรอบ XLSX ใหม่และไม่ถือ DB transaction ว่า rollback DCM ได้

## เกณฑ์รับงาน

- [ ] Crash-injection ใน sandbox แสดงว่ารอบใหม่ไม่อ้างไฟล์ที่ยังไม่ commit. Artifact กำพร้าต้อง retire ด้วย intent ที่พิสูจน์ ownership ได้; ไม่ลบของ canonical หรือของ concurrent winner
- [ ] ใช้ loopback receipt barrier บังคับลำดับ reopen ก่อน dispatch และหลัง dispatch: Correction ที่ stale ไม่เขียนทับประวัติ/ร่างใหม่. Late receipt ถูกเก็บตาม Operation เดิมและเข้า cleanup/recovery guards โดยไม่มี resend หรือ DELETE ที่ผลเดิมไม่ชัด
- [ ] ตรวจ next-opening failure แยกจาก Submit สำเร็จ, พร้อม key/lease/response version ที่ใช้. รายงานว่าเคสใด regression, เคสใด guard เดิมรองรับ และเคสใดไม่ยืนยันบน provider จริง

## Comments

- ยังไม่สรุปว่า orphan ค้างถาวรหรือพบ provider corruption จริง
