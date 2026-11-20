# 12 — ตรวจรับ Excel lifecycle บน integration revision เดียว

Status: needs-triage  
Type: task  
Priority: P1 gate  
Blocked by: 03, 04, 05, 06, 07, 08, 09, 10  
Evidence: [acceptance matrix ของ audit](../map.md#เกณฑ์รับงานครั้งถัดไป)  
Separate gate: 11 สำหรับ external/provider claims ไม่บล็อก local acceptance

## ขอบเขต

รวมและตรวจบน revision ที่ส่งมอบด้วยบัญชี/ฟอร์มสังเคราะห์. ครอบคลุม missing anchor, wrong revision, staged bytes, history deletion, native retry, link integrity, routing, lifecycle races และ runtime gaps เช่น queued native removal, two openings และ hidden geometry. ตั๋วที่พบว่าไม่ต้องแก้ต้องมี evidence และ owner disposition ไม่ใช่ปิดด้วย PASS โดยอัตโนมัติ

## เกณฑ์รับงาน

- [ ] Admin authoring: Create, edit, apply, Save, Publish, duplicate, exit/reload/reconnect/rebind/delete. ทดสอบทั้งลำดับปุ่ม/ตาราง, incomplete Draft, stale revisions และ fault interleavings. เปิดแล้วได้คู่ bindings/workbook เก่าหรือใหม่ครบชุด
- [ ] User: start/prefill/resume/reopen, Save Draft, Submit, next round, append/delete row, PDMS picker, attach/replace/remove, live and saved export, unknown recovery. Admin: Correction workspace/commit/exit และคง immutable history. ตรวจ XLSX cells/links, JSON, refs, physical rows และ revision statuses
- [ ] Admin/Viewer/owner/foreign: history/Fields/preview/JSON/XLSX/PDF ใช้ revision เดียวกัน; archive/unarchive และการอ่าน/ลบตรง policy. ยืนยัน auth และดู role/output ของ Draft XLSX/PDF กับ persisted receipt JSON เป็นคนละเรื่อง. ไม่มี staged bytes และไม่ทิ้งประวัติโดยปริยาย
- [ ] Native + HTTP + UI acceptance ระบุ SHA, fixture, pass/fail และ unverified scenarios แยก; ไม่แทน native queued-delivery ด้วย bridge injection แล้วเรียกว่าผ่าน native. ใช้ controlled fault/positive control. รันคัดเฉพาะ suite ที่เกี่ยวข้องตาม seams ที่ตกลง
- [ ] อัปเดต system map สำหรับ behavior ที่แก้ ตรวจ generated artifacts และให้ human review แยกจากผลเทสต์. ไม่ push/deploy/real DCM โดยอัตโนมัติ

## Comments

- ใช้เป็น integration gate แยกจาก review ตั๋วและจาก provider acceptance
- Native preflight บน runtime `b523bb98`: บัญชี/ฟอร์มสังเคราะห์กับ ONLYOFFICE 9.4 และ loopback provider ทดสอบกรอก `docs_number`, เปิด OLE ของ physical row 0, แนบ TXT, Save Draft, Submit และเปิดรอบใหม่ที่ว่าง. ทั้ง Draft/Submission มี cell C1 และ hyperlink ตรง JSON receipt, refs ตรง physical row และ read-back SHA-256 ตรงกับไฟล์สังเคราะห์. Dashboard แสดงว่าทิ้ง Draft ที่มีประวัติไม่ได้
- เมื่อพยายาม Save ก่อน picker ยืนยันเสร็จ พบ guard และไม่มี Draft POST. การส่ง event removal ที่เข้า native queue จริงหลัง Correction capture ยังไม่พิสูจน์; ไม่ถือว่า bridge fixture หรือการคลิกหลัง host inert เป็นการจำลอง timing นั้น
- Actual native live XLSX/PDF: both downloads contained `SYNTHETIC-LIVE-EXPORT` from unsaved D1; saved Draft stayed blank and the derived XLSX did not contain managed attachment objects. This is local browser/ONLYOFFICE proof, not real DCM acceptance.
