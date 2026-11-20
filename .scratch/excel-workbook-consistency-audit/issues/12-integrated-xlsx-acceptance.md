# 12 — ตรวจรับ Excel lifecycle บน integration revision เดียว

Status: resolved  
Type: task  
Priority: P1 gate  
Blocked by: 03, 04, 05, 06, 07, 08, 09, 10  
Evidence: [acceptance matrix ของ audit](../map.md#เกณฑ์รับงานครั้งถัดไป)  
Separate gate: 11 สำหรับ external/provider claims ไม่บล็อก local acceptance

## ขอบเขต

รวมและตรวจบน revision ที่ส่งมอบด้วยบัญชี/ฟอร์มสังเคราะห์. ครอบคลุม missing anchor, wrong revision, staged bytes, history deletion, native retry, link integrity, routing, lifecycle races และ runtime gaps เช่น queued native removal, two openings และ hidden geometry. ตั๋วที่พบว่าไม่ต้องแก้ต้องมี evidence และ owner disposition ไม่ใช่ปิดด้วย PASS โดยอัตโนมัติ

## เกณฑ์รับงาน

- [x] Admin authoring: Create, edit, apply, Save, Publish, duplicate, exit/reload/reconnect/rebind/delete. ทดสอบทั้งลำดับปุ่ม/ตาราง, incomplete Draft, stale revisions และ fault interleavings. เปิดแล้วได้คู่ bindings/workbook เก่าหรือใหม่ครบชุด
- [x] User: start/prefill/resume/reopen, Save Draft, Submit, next round, append/delete row, PDMS picker, attach/replace/remove, live and saved export, unknown recovery. Admin: Correction workspace/commit/exit และคง immutable history. ตรวจ XLSX cells/links, JSON, refs, physical rows และ revision statuses
- [x] Admin/Viewer/owner/foreign: history/Fields/preview/JSON/XLSX/PDF ใช้ revision เดียวกัน; archive/unarchive และการอ่าน/ลบตรง policy. ยืนยัน auth และดู role/output ของ Draft XLSX/PDF กับ persisted receipt JSON เป็นคนละเรื่อง. ไม่มี staged bytes และไม่ทิ้งประวัติโดยปริยาย
- [x] Native + HTTP + UI acceptance ระบุ SHA, fixture, pass/fail และ unverified scenarios แยก; ไม่แทน native queued-delivery ด้วย bridge injection แล้วเรียกว่าผ่าน native. ใช้ controlled fault/positive control. รันคัดเฉพาะ suite ที่เกี่ยวข้องตาม seams ที่ตกลง
- [x] อัปเดต system map สำหรับ behavior ที่แก้ ตรวจ generated artifacts และให้ human review แยกจากผลเทสต์. ไม่ push/deploy/real DCM โดยอัตโนมัติ

## Comments

- ใช้เป็น integration gate แยกจาก review ตั๋วและจาก provider acceptance
- Native preflight บน runtime `b523bb98`: บัญชี/ฟอร์มสังเคราะห์กับ ONLYOFFICE 9.4 และ loopback provider ทดสอบกรอก `docs_number`, เปิด OLE ของ physical row 0, แนบ TXT, Save Draft, Submit และเปิดรอบใหม่ที่ว่าง. ทั้ง Draft/Submission มี cell C1 และ hyperlink ตรง JSON receipt, refs ตรง physical row และ read-back SHA-256 ตรงกับไฟล์สังเคราะห์. Dashboard แสดงว่าทิ้ง Draft ที่มีประวัติไม่ได้
- เมื่อพยายาม Save ก่อน picker ยืนยันเสร็จ พบ guard และไม่มี Draft POST. การส่ง event removal ที่เข้า native queue จริงหลัง Correction capture ยังไม่พิสูจน์; ไม่ถือว่า bridge fixture หรือการคลิกหลัง host inert เป็นการจำลอง timing นั้น
- Actual native live XLSX/PDF: both downloads contained `SYNTHETIC-LIVE-EXPORT` from unsaved D1; saved Draft stayed blank and the derived XLSX did not contain managed attachment objects. This is local browser/ONLYOFFICE proof, not real DCM acceptance.
- เปิดและยกเลิก archive ผ่าน Admin UI ของฟอร์มสังเคราะห์: historical Submission ยังมี cell/hyperlink/refs ตรงกัน และ read-back ของไฟล์เดิม SHA-256 ตรงทั้งสองสถานะ
- Initial R9 evidence did not reach exact native queue timing: the earlier post-capture barrier verified no POST from an unconfirmed candidate, inert blocking a new click, and old history retention when removal was confirmed before Save. The test in `correction-preview.test.tsx` injects an event to verify pending-generation behavior; it does not verify the ONLYOFFICE event queue.
- Initial integration sweep: 386 HTTP cases once fixture setup was corrected (fresh bootstrap DB for the Admin workflow; exact tracking names for 4 PDMS table journeys). Includes 179 ECM attachment lifecycle cases against the loopback provider and real ONLYOFFICE Builder; no real DCM POST/DELETE. Six related web suites ran serially (174 cases), plus 12 form lifecycle cases. Build passed 3/3 on `22b747634f`; these are pre-review-fix results, not a claim that each earlier native case ran on final SHA.
- Reviewed runtime `20f4486902`, delivery test/format commit `fb4fc7daad`: 78 selected HTTP cases across 9 suites, 122 workbook unit tests, all 355 plugin tests, 176 related web UI tests, 12 form lifecycle tests, lint/format on 77 changed app files, typecheck 5/5, and build 3/3 passed. The selected HTTP total includes the rerun with the declared Builder callback port; the prior 386-case sweep is separate, not additive.
- Final native Chromium smoke used synthetic Forms and ONLYOFFICE 9.4. New attachment saved in one revision; native pre-admission Publish rejection left the committed hash unchanged and the local scalar editable/savable without reload. Earlier native Authoring / User / Viewer evidence keeps its original source pin. No production, real DCM, or human acceptance is asserted.
- `docs:workflow:check` verified 22 rendered diagrams, inventory, and sharing ZIP; chapters 05, 06, 09, and 10 rendered in Chromium. Initial delivery left R9 open because those tests did not trace the exact native queue.

### R9 follow-up — native Correction queue on the shared gateway

- [Sanitized Chromium trace and saved revision checks](../native-correction-queue.json), source `f4f4f17cb3`, Chrome `150.0.7871.24`, ONLYOFFICE `9.4.0`. Two independent synthetic Submissions, genuine native row-0 attachment and signed workbook capture, isolated database/storage and loopback provider. Real picker and toolbar input only. Non-pausing CDP logpoints recorded stamps; matching `SchedulePostMessage`/`HandlePostMessage` IDs identified original browser tasks. No fabricated or replayed event.
- Unconfirmed removal blocked Save with no POST. In a rapid native Remove/Confirm/Save sequence, row-0 removal reached the holder before the precheck; the candidate had not cleared, so Save still produced zero POSTs. After the native confirmation acknowledgement, one explicit Save sent `attachmentRemovals` for row 0, zero Files, returned `202`, and completed once. Only the new Correction lost the receipt, ref, cell value, and hyperlink. The Submission workbook and JSON hashes stayed unchanged; the original file still returned `200` with matching SHA-256.
- In the second Correction, CDP held the one actual POST after both snapshots. Real on-screen Remove and footer clicks while the surface was inert sent no candidate or confirmation message. The original POST continued once with `attachmentRemovals: []` and completed. Both revisions still had matching receipt, ref, XLSX cell/link and read-back SHA-256. Across both fixtures: two setup uploads; zero DELETE.
- **Reachability for the tested topology:** `pending-file-save` cannot overtake a removal enqueued before workbook capture to the same active top window in this renderer. [Pinned Chromium](https://github.com/chromium/chromium/blob/791ba97058eb8c1e257ea50380b0d8c6bb9b8f64/third_party/blink/renderer/core/frame/local_dom_window.cc#L1265-L1296) uses the target's `kPostedMessage` runner. [HTML queues `postMessage` in the target window](https://html.spec.whatwg.org/multipage/web-messaging.html#window-post-message-steps) and [serializes tasks from the same source](https://html.spec.whatwg.org/multipage/webappapis.html#task-source). The [picker](../../../apps/onlyoffice-plugin/src/upload-poc-picker.js#L198-L210) and [Save relay](../../../apps/onlyoffice-plugin/src/upload-poc-save.js#L46-L56) both post to `top`. The Save relay runs [after native capture returns](../../../apps/onlyoffice-plugin/src/operations.js#L170-L187), and Folio [applies the Correction removal before that handler's first awaited refresh](../../../apps/web/src/components/onlyoffice-editor.tsx#L1078-L1119). These are a bounded source argument plus native trace, not a reproduction of late delivery.
- **Disposition:** local gate resolved for the declared shared gateway (`PUBLIC_ORIGIN` for Folio and `/office` in [Compose](../../../compose.yaml#L116-L120)). The companion holder/retired-workspace UI regression suites passed 35 cases, including intentionally injected late delivery; that evidence checks handling, not native scheduling. No claim for a different renderer/gateway topology, real DCM settlement, Production behavior, or human release approval.
