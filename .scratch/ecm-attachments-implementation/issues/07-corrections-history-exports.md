# 07: Correction ประวัติ และส่งออกฉบับที่เลือก

**What to build:** ต่อวงจร scalar/table และ recovery สู่ valid Admin Correction, immutable history และ read-only/export surfaces เดิม ส่งมอบ URL ที่ตรงฉบับที่เลือกจริงทั้งใน Folio และ XLSX/PDF โดยไม่เปลี่ยน main viewer หรือ workflow ดาวน์โหลด ordinary unsaved edits ของ Excel Fill

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [กู้คืนผลไม่ชัดและติดตามไฟล์ค้าง](05-uncertain-outcomes-follow-up.md); [แนบไฟล์รายแถวโดยรักษา mapping](06-table-row-attachments.md)

**Status:** ready-for-agent

**User stories:** 41, 42, 78, 79, 80, 81, 83, 84, 85, 86, 87, 88, 89, 112 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [ ] Admin upload ได้เฉพาะ final explicit Save Correction ที่มี reason, submitted-state eligibility, lease/current base/workspace และ required validation; User แก้ Draft ตนเอง Viewer ไม่ mutate/delete และไม่เพิ่มสิทธิ์แก้ Draft คนอื่น
- [ ] Internal workspace/project saves ไม่ upload; pending selections ข้าม document-key transition ได้เฉพาะ verified scope/mapping มิฉะนั้นหยุดก่อน discard พร้อมข้อความ ไม่สลับ File จากอีก Response/บัญชี
- [ ] Correction ใหม่สร้าง JSON/document/file versions ของตัวเองไม่แก้ Submission/Correction เดิม; removal/metadata changes ไม่ลบไฟล์ที่ revision เก่ายังอ้าง
- [ ] Resume Draft ใช้ saved canonical เดิม; new XLSX round หลัง Submission เริ่ม blank Published Template ไม่ seed answers/URLs/files จากรอบเก่า และ old history ยังอ่านได้
- [ ] Read-only/results/receipt/history ภายใต้สิทธิ์เดิมแสดง URL จาก selected revision แทน picker ไม่ lookup latest หรือ substitute broken historical link และไม่บังคับ login ECM เพื่ออ่าน saved link
- [ ] Saved XLSX/PDF exports ใช้ selected revision, URL ถูกต้องและเปิดได้ ไม่มี upload controls, service credentials หรือ file-token metadata ใน cell/hidden/formula/other workbook parts
- [ ] Excel Fill Download ยังจับ current workbook กับ ordinary unsaved edits ตามเดิม ไม่เปลี่ยนเป็น saved-only; ถ้ามี pending attachment ต้อง explicit Save/Submit ก่อน ไม่ export filename/blob/fake URL และ export ไม่เริ่ม upload
- [ ] URL เป็น public/nonexpiring ตาม risk ที่รับแล้ว ไม่สร้าง proxy หรืออ้างว่า Folio permissions ปิด origin; ไม่มี attachment preview/decryption และ main Form document viewer ไม่เปลี่ยน
- [ ] HTTP integration ตรวจ scalar/table Correction, workspace transitions, stale eligibility, permissions และ immutable snapshots; browser ตรวจ selected older Correction กับ exported XLSX/PDF จริง รวม ordinary-unsaved download/pending guard และ native protection
- [ ] ปรับ workflow/domain explanation ให้บอก XLSX blank-reopen exception โดยไม่เปลี่ยนพฤติกรรมให้ตรง generic seeded Response description

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments
