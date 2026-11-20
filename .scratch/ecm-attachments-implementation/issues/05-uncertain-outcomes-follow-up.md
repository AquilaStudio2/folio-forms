# 05: กู้คืนผลไม่ชัดและติดตามไฟล์ค้าง

**What to build:** ทำเส้นทางติดตามและกู้สถานะจาก durable operations/intents ที่มีอยู่ให้ User กับ Admin ใช้งานจริง ผ่านข้อความค้างในหน้ากรอกและ inline expandable details ในหน้าผลลัพธ์เดิม รวมหลักฐานและ authorized settlement ไม่เพิ่ม dashboard หรือปุ่มปลดล็อกที่ยอมรับความเสี่ยงแทนการพิสูจน์ผล

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [เปลี่ยนหรือนำไฟล์ออกและแก้เลขหรือปีใน Draft](04-draft-file-replacement-cleanup.md)

**Status:** resolved

**User stories:** 65, 66, 67, 68, 69, 70, 71, 90, 91, 92, 93, 94 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [x] แยก pending/validation/saved/unknown upload/uncertain Folio commit/cleanup pending ด้วยข้อความถาวรระบุ slot/row/reason/next action ไม่ใช้ toast อย่างเดียวหรือ spinner ไม่จบ
- [x] Provider ได้ bytes แล้ว disconnect/timeout, process crash หรือ missing usable receipt คง unknown; อ่าน canonical เดิมได้ แต่ Save/Submit/Response delete ไม่ได้ และไม่มี blind resend/adopt latest
- [x] Partial/failed batch cancel ทั้งชุดและ cleanup newly uploaded unreferenced files; canceled receipts ไม่ถูก reuse รอบใหม่ต้องมี identities ใหม่และเริ่มหลัง settlement/cleanup ครบ
- [x] Folio response หายตรวจ original Operation/checkpoint/canonical result; ถ้า committed คืนผลเดิม ไม่สร้าง duplicate upload/Submission และไม่ cleanup ไฟล์ที่อาจ commit แล้วเมื่อ DB ยังตรวจไม่ได้
- [x] Durable state อยู่รอดหลัง restart; late receipts ผูก intent เดิมเพื่อ cleanup ไม่ revive commit หรือเอา failed/staged workbook มาเป็น canonical
- [x] Admin เห็น trusted scope/operation/version/name/year/category/send time/outcome/evidence ใน expandable details ที่มีสิทธิ์ดู ไม่เผย secrets หรือให้อำนาจจาก arbitrary token/URL
- [x] ปลด unknown ได้เมื่อพิสูจน์ old sender เขียนต่อไม่ได้, request ที่ถึง ECM settled และ canceled files จัดการครบ; บันทึกผู้ยืนยัน/หลักฐานจริง ไม่ใช้ checkbox/free-text/empty search/รอเวลาเป็น proof
- [x] ยังพิสูจน์ไม่ได้ต้องคง blocked ตามจริง; settlement action ตรวจสิทธิ์/generation/references/state ซ้ำ ป้องกัน competing Admins กับ late callbacks และไม่สร้าง automatic write-retry queue
- [x] HTTP integration ใช้ controlled provider holds/barriers สำหรับ before/after-send/receipt/commit/crash windows และ races โดยไม่ mock ledger ภายใน; browser ตรวจ User next action กับ authorized Admin follow-up จนสถานะ settle จริง

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments

### 2026-11-14 — ตรวจรับบน `feat/ecm-attachments`

- รวม source ของ recovery และ physical rows ใน `c2d0a4e4bd331dce971f84f854ff01372ec6ad08` และแก้ข้อพบจาก browser จริงใน `b68c59a25ef959a12b2218f39b5d90b3c6795b43` โดยใช้ตัวจัดรูปแบบวันเวลาเดิมและรักษาคำแนะนำเมื่อ Dashboard ถูกปฏิเสธการลบ `attachment_outcome_unresolved` มี regression ที่ fail ก่อนแก้สี่กรณีและผ่านหลังแก้
- ตรวจ HTTP lifecycle รวม 57 กรณี/1,994 assertions และ regression commands เดิมอีก 15 ชุด รวม 238 test invocations/7,186 assertions โดยไม่มี failures/skips จำนวนหลังเป็น invocations ไม่ใช่จำนวนกรณีที่ไม่ซ้ำ ตรวจ UI ที่ได้รับผลจากการแก้ 98 กรณี, root format/lint, forced type checks 5 tasks และ build 3 tasks ผ่าน Workflow build/check และ final committed check ผ่านจาก source จริง ไม่แก้ validator
- Browser ใช้ปุ่ม PoC และ Results เดิมจริง: provider รับ bytes แล้วพัก response, Admin fence sender ด้วย generation, late receipt ผูกรอบที่ยกเลิก, Admin ส่ง DELETE ครั้งแรกหลังตรวจสิทธิ์และ references, ได้ verified evidence และ settle ครบ จากนั้น User บันทึก File เดิมโดยไม่เลือกใหม่ด้วย version identity ใหม่ ข้อมูล canonical เดิมไม่เปลี่ยนระหว่างรอบที่ยกเลิก
- กรณี timeout 90 วินาทีคง unknown จริงทั้งก่อนและหลัง restart เฉพาะ API ข้อมูลเก่า/JSON/workbook/S3 และ public bytes เดิมไม่เปลี่ยน Save/Submit ตรวจ original checkpoint โดย GET เท่านั้น กล่อง PoC และหน้ากรอกคงคำแนะนำติดต่อผู้ดูแล และเปิด saved canonical ผ่าน native read-only viewer ได้ การปล่อย response ของ test provider หลัง timeout ไม่ถูกนับเป็น settlement หรือใช้ปลด hold
- ตรวจหน้าจริงหลังแก้ด้วย case เดิม: timeline แสดงวันที่พร้อมเวลา และ Dashboard ส่ง DELETE ได้ 409 ด้วยเหตุผล unknown จริงแล้วคงคำแนะนำติดต่อผู้ดูแล/ห้ามส่งไฟล์ซ้ำ Provider ยังคง 1 login/8 uploads/2 deletes และตรวจ public files ทั้งหกได้ bytes/hash เดิม
- หลักฐานภายนอก repo: `/tmp/ecm-joint-native-handoff.txt`, `/tmp/ecm-joint-native-ui-fixed-handoff.txt`, `/tmp/ecm-joint-regression-handoff.txt`, `/tmp/ecm-joint-integration-inclusion.json` และ `/tmp/ecm-recovery-ui-fix-inclusion.json` เก็บ canonical receipts และ tokens เป็นหลักฐานส่วนตัว ไม่คัดลอกลง workbook หรือเอกสารนี้
- ขอบเขตหลักฐาน: ไม่ได้เรียก ECM จริง ไม่อ้างผล controlled provider เป็นความสามารถ ECM จริง การเปิด OS chooser ด้วย Space และการดาวน์โหลด saved link ด้วย keyboard ยังยืนยันไม่ได้ ส่วน keyboard remove/cancel, labels และ dirty guards ตรวจจริงแล้ว File ของกรณี restart คง object/hash เดิมจน Parent จงใจปิดหน้า fixture หลังจบหลักฐาน ไม่อ้างความคงอยู่หลังปิดหน้า
- งาน [Correction ประวัติ และส่งออกฉบับที่เลือก](07-corrections-history-exports.md) ยังต้องทำ URL-only projection และตรวจ export จริง รวมการนำ static upload drawings ออก งานลบ Response พร้อมผล cleanup แยกยังอยู่ใน [ลบ Response พร้อมไฟล์ที่ไม่มีการอ้างถึง](08-response-deletion-cleanup.md) การปิดตั๋วนี้ไม่ใช่การปิดสเปกทั้งหมด
