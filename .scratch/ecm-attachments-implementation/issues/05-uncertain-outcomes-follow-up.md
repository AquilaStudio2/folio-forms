# 05: กู้คืนผลไม่ชัดและติดตามไฟล์ค้าง

**What to build:** ทำเส้นทางติดตามและกู้สถานะจาก durable operations/intents ที่มีอยู่ให้ User กับ Admin ใช้งานจริง ผ่านข้อความค้างในหน้ากรอกและ inline expandable details ในหน้าผลลัพธ์เดิม รวมหลักฐานและ authorized settlement ไม่เพิ่ม dashboard หรือปุ่มปลดล็อกที่ยอมรับความเสี่ยงแทนการพิสูจน์ผล

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [เปลี่ยนหรือนำไฟล์ออกและแก้เลขหรือปีใน Draft](04-draft-file-replacement-cleanup.md)

**Status:** ready-for-agent

**User stories:** 65, 66, 67, 68, 69, 70, 71, 90, 91, 92, 93, 94 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [ ] แยก pending/validation/saved/unknown upload/uncertain Folio commit/cleanup pending ด้วยข้อความถาวรระบุ slot/row/reason/next action ไม่ใช้ toast อย่างเดียวหรือ spinner ไม่จบ
- [ ] Provider ได้ bytes แล้ว disconnect/timeout, process crash หรือ missing usable receipt คง unknown; อ่าน canonical เดิมได้ แต่ Save/Submit/Response delete ไม่ได้ และไม่มี blind resend/adopt latest
- [ ] Partial/failed batch cancel ทั้งชุดและ cleanup newly uploaded unreferenced files; canceled receipts ไม่ถูก reuse รอบใหม่ต้องมี identities ใหม่และเริ่มหลัง settlement/cleanup ครบ
- [ ] Folio response หายตรวจ original Operation/checkpoint/canonical result; ถ้า committed คืนผลเดิม ไม่สร้าง duplicate upload/Submission และไม่ cleanup ไฟล์ที่อาจ commit แล้วเมื่อ DB ยังตรวจไม่ได้
- [ ] Durable state อยู่รอดหลัง restart; late receipts ผูก intent เดิมเพื่อ cleanup ไม่ revive commit หรือเอา failed/staged workbook มาเป็น canonical
- [ ] Admin เห็น trusted scope/operation/version/name/year/category/send time/outcome/evidence ใน expandable details ที่มีสิทธิ์ดู ไม่เผย secrets หรือให้อำนาจจาก arbitrary token/URL
- [ ] ปลด unknown ได้เมื่อพิสูจน์ old sender เขียนต่อไม่ได้, request ที่ถึง ECM settled และ canceled files จัดการครบ; บันทึกผู้ยืนยัน/หลักฐานจริง ไม่ใช้ checkbox/free-text/empty search/รอเวลาเป็น proof
- [ ] ยังพิสูจน์ไม่ได้ต้องคง blocked ตามจริง; settlement action ตรวจสิทธิ์/generation/references/state ซ้ำ ป้องกัน competing Admins กับ late callbacks และไม่สร้าง automatic write-retry queue
- [ ] HTTP integration ใช้ controlled provider holds/barriers สำหรับ before/after-send/receipt/commit/crash windows และ races โดยไม่ mock ledger ภายใน; browser ตรวจ User next action กับ authorized Admin follow-up จนสถานะ settle จริง

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments
