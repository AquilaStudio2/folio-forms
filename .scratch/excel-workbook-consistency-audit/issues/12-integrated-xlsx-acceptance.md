# 12 — ตรวจรับ Excel lifecycle บน integration revision เดียว

Status: needs-info  
Type: task  
Priority: P1 gate  
Blocked by: 03, 04, 05, 06, 07, 08, 09, 10  
Evidence: [acceptance matrix ของ audit](../map.md#เกณฑ์รับงานครั้งถัดไป)  
Separate gate: 11 สำหรับ external/provider claims ไม่บล็อก local acceptance

## ขอบเขต

รวมและตรวจบน revision ที่ส่งมอบด้วยบัญชี/ฟอร์มสังเคราะห์. ครอบคลุม missing anchor, wrong revision, staged bytes, history deletion, native retry, link integrity, routing, lifecycle races และ runtime gaps เช่น queued native removal, two openings และ hidden geometry. ตั๋วที่พบว่าไม่ต้องแก้ต้องมี evidence และ owner disposition ไม่ใช่ปิดด้วย PASS โดยอัตโนมัติ

## เกณฑ์รับงาน

- [x] Admin authoring: Create, edit, apply, Save, Publish, duplicate, exit/reload/reconnect/rebind/delete. ทดสอบทั้งลำดับปุ่ม/ตาราง, incomplete Draft, stale revisions และ fault interleavings. เปิดแล้วได้คู่ bindings/workbook เก่าหรือใหม่ครบชุด
- [ ] User: start/prefill/resume/reopen, Save Draft, Submit, next round, append/delete row, PDMS picker, attach/replace/remove, live and saved export, unknown recovery. Admin: Correction workspace/commit/exit และคง immutable history. ตรวจ XLSX cells/links, JSON, refs, physical rows และ revision statuses
- [x] Admin/Viewer/owner/foreign: history/Fields/preview/JSON/XLSX/PDF ใช้ revision เดียวกัน; archive/unarchive และการอ่าน/ลบตรง policy. ยืนยัน auth และดู role/output ของ Draft XLSX/PDF กับ persisted receipt JSON เป็นคนละเรื่อง. ไม่มี staged bytes และไม่ทิ้งประวัติโดยปริยาย
- [ ] Native + HTTP + UI acceptance ระบุ SHA, fixture, pass/fail และ unverified scenarios แยก; ไม่แทน native queued-delivery ด้วย bridge injection แล้วเรียกว่าผ่าน native. ใช้ controlled fault/positive control. รันคัดเฉพาะ suite ที่เกี่ยวข้องตาม seams ที่ตกลง
- [x] อัปเดต system map สำหรับ behavior ที่แก้ ตรวจ generated artifacts และให้ human review แยกจากผลเทสต์. ไม่ push/deploy/real DCM โดยอัตโนมัติ

## Comments

- ใช้เป็น integration gate แยกจาก review ตั๋วและจาก provider acceptance
- Native preflight บน runtime `b523bb98`: บัญชี/ฟอร์มสังเคราะห์กับ ONLYOFFICE 9.4 และ loopback provider ทดสอบกรอก `docs_number`, เปิด OLE ของ physical row 0, แนบ TXT, Save Draft, Submit และเปิดรอบใหม่ที่ว่าง. ทั้ง Draft/Submission มี cell C1 และ hyperlink ตรง JSON receipt, refs ตรง physical row และ read-back SHA-256 ตรงกับไฟล์สังเคราะห์. Dashboard แสดงว่าทิ้ง Draft ที่มีประวัติไม่ได้
- เมื่อพยายาม Save ก่อน picker ยืนยันเสร็จ พบ guard และไม่มี Draft POST. การส่ง event removal ที่เข้า native queue จริงหลัง Correction capture ยังไม่พิสูจน์; ไม่ถือว่า bridge fixture หรือการคลิกหลัง host inert เป็นการจำลอง timing นั้น
- Actual native live XLSX/PDF: both downloads contained `SYNTHETIC-LIVE-EXPORT` from unsaved D1; saved Draft stayed blank and the derived XLSX did not contain managed attachment objects. This is local browser/ONLYOFFICE proof, not real DCM acceptance.
- เปิดและยกเลิก archive ผ่าน Admin UI ของฟอร์มสังเคราะห์: historical Submission ยังมี cell/hyperlink/refs ตรงกัน และ read-back ของไฟล์เดิม SHA-256 ตรงทั้งสองสถานะ
- R9 exact native queue remains unverified: the earlier post-capture barrier verified no POST from an unconfirmed candidate, inert blocking a new click, and old history retention when removal was confirmed before Save. The test in `correction-preview.test.tsx` injects an event to verify pending-generation behavior; it does not verify the ONLYOFFICE event queue. A native check must observe original confirmation enqueue, workbook capture, attachment snapshot, delivery, and completion in that order without replacing the event.
- Initial integration sweep: 386 HTTP cases once fixture setup was corrected (fresh bootstrap DB for the Admin workflow; exact tracking names for 4 PDMS table journeys). Includes 179 ECM attachment lifecycle cases against the loopback provider and real ONLYOFFICE Builder; no real DCM POST/DELETE. Six related web suites ran serially (174 cases), plus 12 form lifecycle cases. Build passed 3/3 on `22b747634f`; these are pre-review-fix results, not a claim that each earlier native case ran on final SHA.
- Reviewed runtime `20f4486902`, delivery test/format commit `fb4fc7daad`: 78 selected HTTP cases across 9 suites, 122 workbook unit tests, all 355 plugin tests, 176 related web UI tests, 12 form lifecycle tests, lint/format on 77 changed app files, typecheck 5/5, and build 3/3 passed. The selected HTTP total includes the rerun with the declared Builder callback port; the prior 386-case sweep is separate, not additive.
- Final native Chromium smoke used synthetic Forms and ONLYOFFICE 9.4. New attachment saved in one revision; native pre-admission Publish rejection left the committed hash unchanged and the local scalar editable/savable without reload. Earlier native Authoring / User / Viewer evidence keeps its original source pin. No production, real DCM, or human acceptance is asserted.
- `docs:workflow:check` verified 22 rendered diagrams, inventory, and sharing ZIP; chapters 05, 06, 09, and 10 rendered in Chromium. Native already-queued confirmed removal after Correction capture is the remaining R9 evidence gap. Keep this ticket open; HTTP, simulated bridge tests and the real inert/candidate controls do not certify the precise queue timing.
