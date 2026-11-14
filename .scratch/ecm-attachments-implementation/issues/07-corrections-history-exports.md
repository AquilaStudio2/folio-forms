# 07: Correction ประวัติ และส่งออกฉบับที่เลือก

**What to build:** ต่อวงจร scalar/table และ recovery สู่ valid Admin Correction, immutable history และ read-only/export surfaces เดิม ส่งมอบ URL ที่ตรงฉบับที่เลือกจริงทั้งใน Folio และ XLSX/PDF โดยไม่เปลี่ยน main viewer หรือ workflow ดาวน์โหลด ordinary unsaved edits ของ Excel Fill

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [กู้คืนผลไม่ชัดและติดตามไฟล์ค้าง](05-uncertain-outcomes-follow-up.md); [แนบไฟล์รายแถวโดยรักษา mapping](06-table-row-attachments.md)

**Status:** resolved

**User stories:** 41, 42, 78, 79, 80, 81, 83, 84, 85, 86, 87, 88, 89, 112 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [x] Admin upload ได้เฉพาะ final explicit Save Correction ที่มี reason, submitted-state eligibility, lease/current base/workspace และ required validation; User แก้ Draft ตนเอง Viewer ไม่ mutate/delete และไม่เพิ่มสิทธิ์แก้ Draft คนอื่น
- [x] Internal workspace/project saves ไม่ upload; pending selections ข้าม document-key transition ได้เฉพาะ verified scope/mapping มิฉะนั้นหยุดก่อน discard พร้อมข้อความ ไม่สลับ File จากอีก Response/บัญชี
- [x] Correction ใหม่สร้าง JSON/document/file versions ของตัวเองไม่แก้ Submission/Correction เดิม; removal/metadata changes ไม่ลบไฟล์ที่ revision เก่ายังอ้าง
- [x] Resume Draft ใช้ saved canonical เดิม; new XLSX round หลัง Submission เริ่ม blank Published Template ไม่ seed answers/URLs/files จากรอบเก่า และ old history ยังอ่านได้
- [x] Read-only/results/receipt/history ภายใต้สิทธิ์เดิมแสดง URL จาก selected revision แทน picker ไม่ lookup latest หรือ substitute broken historical link และไม่บังคับ login ECM เพื่ออ่าน saved link
- [x] Saved XLSX/PDF exports ใช้ selected revision, URL ถูกต้องและเปิดได้ ไม่มี upload controls, service credentials หรือ file-token metadata ใน cell/hidden/formula/other workbook parts
- [x] Excel Fill Download ยังจับ current workbook กับ ordinary unsaved edits ตามเดิม ไม่เปลี่ยนเป็น saved-only; ถ้ามี pending attachment ต้อง explicit Save/Submit ก่อน ไม่ export filename/blob/fake URL และ export ไม่เริ่ม upload
- [x] URL เป็น public/nonexpiring ตาม risk ที่รับแล้ว ไม่สร้าง proxy หรืออ้างว่า Folio permissions ปิด origin; ไม่มี attachment preview/decryption และ main Form document viewer ไม่เปลี่ยน
- [x] HTTP integration ตรวจ scalar/table Correction, workspace transitions, stale eligibility, permissions และ immutable snapshots; browser ตรวจ selected older Correction กับ exported XLSX/PDF จริง รวม ordinary-unsaved download/pending guard และ native protection
- [x] ปรับ workflow/domain explanation ให้บอก XLSX blank-reopen exception โดยไม่เปลี่ยนพฤติกรรมให้ตรง generic seeded Response description

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments

### Resolution

- Source `2fe0b287bdf4b1a2f4aee55992e766dd9f63d14d` และ native-discovered fixes `60bd63fd7b27eb6538ede1496b8582dd2bab4127` รวมแล้วบน integration; workflow checkpoint `8d08cddb07ff46295ab9505ef79c119faa7de401` ใช้ source baseline จริงก่อน generated-doc commit Parent ตรวจ exact29-file union: Git/index/filesystem/SHA ตรงกันทั้งหมด และตรวจ rendered workflows ที่เปลี่ยนจริง
- Gates ที่รันจริง: full ECM HTTP63/2509 assertions, native builder15/264, plugin297/1409, full UI257/18 suites, typecheck5/5, build3/3 และ enabled cross-feature regressions ตาม command/activation เดิม ข้อผิดพลาด legacy export2กรณีแก้ที่ shared projection แล้วเดิม7tests/131 assertions ผ่าน ไม่ลด fixture/permission
- Native Correction2 ใช้ File จริง scalar33B และ physical table-row0 zero-byte; reason ว่าง/whitespace ส่งไม่ได้ เลือกไฟล์ยังไม่ upload; final reasoned Save ครั้งเดียว commit ทั้งสองไฟล์และเพิ่ม references10เป็น15 โดยไม่เปลี่ยน Original/Correction1 หรือ DELETE ไฟล์อดีต
- แก้ปุ่ม Correction ที่เดิมไม่ activate และ Cancel ที่เดิมทิ้ง pending Files โดยไม่เตือน ตรวจหลังแก้ด้วย pending-only/native-modified-false: Stay, Escape และ actual Chrome beforeunload dismissal คง File2objects/iframe/timeOrigin เดิม; final Save ออกจากหน้าได้ตามปกติ Permanent real-router regression จับ declined navigation, busy discard guard, workspace reason continuity และ final-save navigation
- Admin/Viewer ตรวจ Original, older Correction1 และ latest Correction2 ทั้ง Document/Fields/native protection; ตรวจ actual XLSX/PDF12ไฟล์ที่แยกชื่อเก็บถาวรใน evidence directory และ current Fill XLSX/verified PDF ที่จับ ordinary active-cell edits ก่อน Enter Canonical Draft/JSON/document/provider ไม่เปลี่ยนจาก export; pending replacement บล็อกทั้งสอง export และคง File เดิม
- Normal User new round ใช้ Published Template defaults2570/DOC.42 ไม่คัด old2572/ROWS.NATIVE.02/URLs/files/notes; ไม่มี route barrier หรือ SDK seeding Actual User Add row remount คง File34B object เดิมและไม่ upload; explicit Save Draft จึง uploadครั้งเดียว Read-only Draft และ receipt/history หลังเปิดรอบใหม่ยังอ่านได้
- Evidence: `/tmp/ecm-revisions-native-handoff.txt`, `ecm-revisions-native-interaction-proof.json`, `ecm-revisions-native-final-preservation-proof.json`, `ecm-revisions-native-final-download-inspection.json` และ `ecm-revisions-native-fixes-inclusion.json` ใต้ `/tmp/` Parent ตรวจ checksum retained exports15ไฟล์ตรงทั้งหมด โดย PDF attempt แรกที่ไม่ได้อยู่ใน active-cell mode ไม่ถูกนับเป็นหลักฐานนั้น Unknown scalar ledger คงเดิม; public fixture files10ไฟล์อ่าน anonymous ได้ตรง bytes
- Limits: fixture ไม่มี unrelated artwork/Correction project selector จึงใช้ native picture/runtime และ HTTP/client transition coverage ประกอบ ไม่อ้าง native proof ของสิ่งที่ไม่มี; ไม่เพิ่ม Correction Add row รูปแบบตารางแคบเดิมยังตัด/ซ้อนข้อความ URL ยาว แต่ annotation/link ตรงฉบับ ไม่มี upload-control overlap แล้ว ไม่มี JSON-download action บน surface ที่ตรวจ Earlier download paths บางชื่อถูกใช้ซ้ำ; latest12เก็บชื่อเฉพาะและตรวจแล้ว ไม่มี live ECM/production verification
- ส่งต่อ [ลบ Response พร้อมไฟล์ที่ไม่มีการอ้างถึง](08-response-deletion-cleanup.md); spec ทั้งหมดยังไม่ปิดจนงานลบ/recovery, final reviews และ integrated acceptance ครบ
