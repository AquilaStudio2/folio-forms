# 03 — Preview, Fields และดาวน์โหลดต้องอ้าง Submission และ revision เดียวกัน

Status: resolved  
Type: task  
Priority: P1  
Blocked by: 02  
Evidence: [R1](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3), [ADR 0004](../../../docs/adr/0004-results-filters-use-scalar-field-tags.md)

## ขอบเขต

ตรึง `submissionId + revision` ในหน้า Admin Form History. แก้ current Results ให้ข้อมูลและ preview ไม่สลับรอบระหว่างคำขอเมื่อ User reopen/resubmit. ใช้ revision-selection เดิมเป็นเจ้าของกฎร่วมกันสำหรับ preview, Fields, JSON, XLSX และ PDF และคง auth/ownership เดิม. ไม่เปลี่ยน ADR การเลือก current result ของรายการหรือ filter

## เกณฑ์รับงาน

- [x] Fixture หนึ่ง Response มี Submission อย่างน้อยสองรอบ ทั้งคู่มี revision `0` และอย่างน้อยหนึ่ง Correction; ใช้ค่าเซลล์และ hash ที่แยกได้. ยืนยัน browser และ HTTP ว่า preview/Fields/ดาวน์โหลดอ้างคู่ที่เลือกจริง
- [x] เปิดร่างรอบใหม่หรือ submit รอบถัดไประหว่างโหลด; History เก่ายังเปิดได้และ current Results ไม่ผสม snapshot. Revision ไม่มีให้แจ้ง unavailable/404 โดยไม่ fallback ไป latest
- [x] ทดสอบ Admin/Viewer/owner และบัญชีอื่นตามสัญญาสิทธิ์เดิม; ไม่มี write action สำหรับ Viewer

## Comments

- Audit ยืนยัน historical data `200` คู่กับ preview `404` เมื่อเปิดร่างรอบใหม่ และ preview รอบใหม่เมื่อเลือก revision `0` ของรอบเก่า
- รวม `66f2106686` และ `ac51de14e7`; ตัวหลังแก้ History ของ XLSX ที่เคยแสดงปุ่ม DOCX. Browser บน `70bd3dfa`: Original `committed`, Correction `replacement` และ Original จากรอบถัดไป `staged` ตรงกันใน A1/Fields, XLSX SHA-256 ตรง และ PDF มีข้อความของแต่ละฉบับ. History ไม่เปลี่ยนเมื่อเปิดร่างใหม่; Viewer ไม่มีคำสั่งเขียน
- HTTP integration `efc80e6`: saved viewer, submission history และ Viewer role รวม 16 tests / 410 assertions; native/HTTP หลัง format follow-up รวม 80 UI tests และ saved-viewer 80 assertions. Sandbox เท่านั้น
