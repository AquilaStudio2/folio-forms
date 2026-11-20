# 04: เปลี่ยนหรือนำไฟล์ออกและแก้เลขหรือปีใน Draft

**What to build:** ต่อวงจร scalar Draft ที่บันทึกได้จริงให้ replace/remove/cancel และ metadata-change ได้โดยไม่ทำไฟล์เก่าหาย เพิ่ม reference-safe post-commit cleanup ที่ทำงานจริงกับ ECM พร้อมข้อความผลการบันทึกกับผลลบแยกกัน ไม่เพิ่ม storage fallback หรือ retry daemon

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [แนบไฟล์ช่องเดี่ยวแล้วบันทึกหรือส่งเป็น URL](03-scalar-save-submit.md)

**Status:** resolved

**User stories:** 35, 36, 37, 49, 50, 51, 72, 73, 96, 97 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [x] Popup แสดง saved กับ pending ชัดเจน; cancel pending replacement คืนการใช้ saved file; remove เป็น pending จน explicit save และ invalid replacement ไม่ลบ/แทนไฟล์เดิมหรือเงียบใช้ค่าเดิมเพื่อข้าม validation
- [x] ไฟล์/metadata ไม่เปลี่ยน reuse reference เดิมโดยไม่ upload/login; ปีหรือเลขเปลี่ยนอ่าน original bytes จาก trusted canonical URL และ reupload ด้วย identity ใหม่โดยไม่บังคับ reselect; pending replacement มี precedence
- [x] Original name ใช้รักษานามสกุล ไม่เดาจาก URL/generated name; server fetch มี URL/redirect/egress trust boundary ไม่รับ arbitrary URL และ fetch ล้มเหลวรักษา canonical/selection เดิม
- [x] Commit snapshot ใหม่ครบก่อนพิจารณาลบเก่า; unique versions ไม่ overwrite history และไฟล์ที่ยังมี Draft/Submission/Correction/workspace/eligible-operation reference ห้ามถูกลบ
- [x] Reference acquisition กับ no-reference/deletion claim ใช้ transactional fencing เดียวกัน; creating reference ไปยัง deleting/deletion-unknown file ไม่ได้ ไม่ใช้ query-then-delete ที่มี race
- [x] Physical Delete ใช้ canonical server-owned file_token และ auth เท่านั้น ไม่ยอม client token/URL เป็นสิทธิ์ลบ ไม่ลบไฟล์ระบบอื่น
- [x] New snapshot commit สำเร็จแต่ old cleanup failed/unknown ยัง saved, usable, exportable; แสดง persistent warning ว่า URL เก่าอาจยังเปิดได้ ไม่ rollback และ warning ไม่หายเพราะ save รอบถัดไปสำเร็จ
- [x] Canceled batch cleanup ที่ไม่ครบยัง block mutation และไม่ reuse receipts ตามสเปก; error ก่อน commit ไม่มี partial answer หรือการลบไฟล์ที่ canonical เดิมยังใช้
- [x] HTTP integration ทดสอบ unchanged/replacement/removal/metadata refetch, malicious URL, shared/history refs และ reference-delete races; browser ตรวจ popup/persistent warning และ saved URLs ก่อน/หลัง reopen

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments

### Implementation progress — not resolved

กำลังดำเนินการบน `feat/ecm-attachments-draft` โดยรวมเข้า `feat/ecm-attachments` เมื่อผ่านเกณฑ์ครบเท่านั้น ยังไม่ปิดตั๋วและยังไม่ปลด blocker ของตั๋วถัดไป

- ต่อยอด popup จากปุ่ม PoC เดิม ไม่สร้างหน้าอัปโหลดหรือเดโมแยก
- พบและแก้ปัญหาเปิด Draft ซ้ำแล้ว ONLYOFFICE ใช้ cache key ของรอบที่ปิดไปแล้ว โดยแยก native editor opening identity ออกจาก canonical document identity พร้อม signed capability/Operation/callback fencing
- พบ regression ที่เปิด editor รอบใหม่แล้วนำ ordinary input จาก failed capture ของรอบเก่ากลับมาใช้ ทดสอบให้ล้มก่อนแก้จริง และเพิ่ม native-opening fence โดยรักษา recovery ภายในรอบเดิม
- ตรวจ working tree ล่าสุดแล้ว: scalar HTTP 41 tests, outage/recovery HTTP 16 tests, focused cross-opening regressions 2 tests, scoped format/lint, types และ build ผ่าน ผลนี้ยังไม่ใช่หลักฐานของ artifact ที่ merge เข้า integration
- ตรวจ native ONLYOFFICE จริงแล้วว่าเปิด Response เดิมซ้ำได้โดยไม่เปลี่ยน canonical JSON/key/object หรือ bytes ของเอกสารที่บันทึกไว้ และ popup เดิมแสดง saved file/cleanup warning ได้ครบหลังปรับความสูง
- Native ordinary Save สองรอบไม่ upload/login/delete เพิ่ม และ warning ยังอยู่หลังเปิด popup ซ้ำ ส่วนการตรวจ remaining replacement/removal/precedence/in-flight selection และผลรวมของตั๋วยังดำเนินอยู่
- ยังไม่ได้เรียก ECM จริง, push, deploy หรือยืนยัน readiness ของ provider จริง เกณฑ์รับงานยังไม่ถูกทำเครื่องหมายว่าผ่านจนกว่าจะตรวจครบและยืนยัน artifact ที่รวมแล้ว

### Native acceptance progress — not resolved

- ตรวจหลักฐานจาก native editor แล้วว่าแก้ `fiscal_year` เป็น `2571` และ `docs_number` เป็น `DRAFT.NATIVE-06` ได้ผ่าน input เดิม หลังปิด warning dialogs ที่ค้างอยู่ตามปกติ ไม่แก้ protection หรือ source เพื่อข้ามข้อจำกัด
- ตรวจ popup ที่เปิดซ้ำจน host reply พร้อมแล้ว: แสดง saved file `zero-extensionless`, URL จริง และขนาด `0 ไบต์` โดยไม่มี pending File; การอ่านก่อน host reply พร้อมไม่ใช่ผลสุดท้ายของการเปิด popup
- ตรวจ pending removal ขณะ native workbook ไม่ dirty: host ยังแจ้งการเปลี่ยนแปลงค้าง, Exit มีคำเตือน, export แสดงข้อความหยุด และ dismiss การออกจากหน้ารักษา URL/time origin เดิม ไม่มี provider write เพิ่มในหลักฐานช่วงนี้
- หลักฐาน diagnostic อยู่ที่ `/tmp/ecm-draft-native-verified-metadata-input.json`, `/tmp/ecm-draft-native-zero-normal-reopen-host-reply.json` และ `/tmp/ecm-draft-native-removal-native-clean-guards.json` การตรวจ native รวมรอบสุดท้ายและ integrated artifact ยังไม่จบ จึงยังไม่ปิดตั๋ว

### Resolution

รวม implementation เข้า `feat/ecm-attachments` แล้ว: source `eaa95e8c91b040f397be151fe5b3ccf2a4dd8c99`, generated workflow `008d9cee177e6a1207b63d507b3fcfc1903000f5`, merge `5587b206a476c1d58754dd072807f9dd1a128518`

- ตรวจ actual integrated working tree และ committed blobs 520 paths: source 60 paths รวม companion UI และ migration ครบ ไม่มี mismatch; generated derivatives 27 paths ผูกกับ source SHA จริง
- Integration รัน build 3 tasks และ type checks 5 tasks แบบ uncached ผ่าน หลังสร้าง ignored route artifact ด้วย build เดิม; own Prisma 6.19 generate ครั้งเดียว ไม่ migrate ซ้ำ
- Integration scalar/native HTTP lifecycle ผ่าน 41 tests / 1,374 assertions; workflow check ผ่าน ส่วน expanded primary gates, plugin/UI และ regression suites มีคำสั่งกับผลครบใน checker handoff
- Native ONLYOFFICE จริงตรวจ saved/pending/invalid/cancel/remove, เปิด Draft ซ้ำและ protection, metadata refetch, replacement precedence, newer File/removal ที่ไม่ถูก accepted snapshot เก่าล้าง, ordinary unchanged Save และ persistent old-cleanup warning
- Native ตรวจ explicit removal เป็น null และเปิดซ้ำ, saved zero-byte Submit โดย provider count ไม่เพิ่ม, ordinary active-cell edits ในไฟล์ XLSX/PDF จริง, original checkpoint recovery และ unknown upload ที่ block Save/Submit/Delete โดย canonical JSON/S3/history ไม่เปลี่ยน ทั้ง 14 provider files เดิมยัง byte-identical
- หลักฐาน: `/tmp/ecm-draft-final-native-handoff.txt`, `/tmp/ecm-draft-final-check-handoff.txt`, `/tmp/ecm-draft-source-checkpoint-inclusion.json`, `/tmp/ecm-draft-workflow-checkpoint-inclusion.json`, `/tmp/ecm-draft-integration-checkpoint-inclusion.json`

ข้อที่ยังต้องทำในตั๋วถัดไปไม่ถูกอ้างว่าผ่าน: [กู้คืนผลไม่ชัดและติดตามไฟล์ค้าง](05-uncertain-outcomes-follow-up.md) ต้องแก้ unknown-state popup ที่ยังอ้างว่าไม่ได้ upload และข้อความ contact-Admin ที่ถูก generic 409 แทน; [Correction ประวัติ และส่งออกฉบับที่เลือก](07-corrections-history-exports.md) ต้องนำ static upload controls/URL overlap ออกจาก export จริง Keyboard OS chooser ยังตรวจผ่าน tool ไม่ได้ ไม่ใช่ข้อสรุปว่า application เสียหรือทดสอบผ่านแล้ว

การปิดตั๋วนี้ไม่ใช่การปิดสเปกทั้งชุด ไม่มี live ECM/PDMS, push, deploy หรือ production migration; provider จริงและ operational readiness ยังไม่ยืนยัน เก็บ original native tab/FileTXT49 กับ unknown case ไว้เพื่อพิสูจน์ตั๋วกู้คืนต่อโดยไม่ reset ข้อมูล
