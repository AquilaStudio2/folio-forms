# 08: ลบ Response พร้อมไฟล์ที่ไม่มีการอ้างถึง

**What to build:** รวม ECM reference-safe cleanup เข้ากับ whole-Response deletion และ durable tombstone/recovery เดิม ผู้มีสิทธิ์ลบเห็นผลลบข้อมูลกับผลลบไฟล์แยกกัน และ Admin ติดตามไฟล์ค้างต่อได้จาก case reference แม้ Response rows ถูกลบ ไม่สร้างหน้าใหม่หรือฟื้นคำตอบที่ลบ

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [Correction ประวัติ และส่งออกฉบับที่เลือก](07-corrections-history-exports.md)

**Status:** resolved

**User stories:** 95, 98, 99, 100, 101 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [x] คง authorization/confirmation, active-operation/editor-lease/stale guards เดิม; ไม่ให้ Viewer ลบหรือเพิ่มสิทธิ์ลบ Published Form และ unknown upload ที่ยังไม่ settle ยังห้ามลบ Response
- [x] ก่อนลบ rows เก็บ cleanup context ของ Folio-owned files/intents ทุก revision รวม Draft/Submission/Correction/workspace และ eligible operations; durable records อยู่รอดหลัง rows gone/crash
- [x] ลบเฉพาะ proven Folio uploads ที่ไม่มี surviving references จริง ตรวจและ claim ด้วย fencing เดิม; ไม่ลบไฟล์ระบบอื่น/ไฟล์จาก URL text/client token หรือไฟล์ที่อีก revision/operation ยังใช้
- [x] Reference creation กับ deleting/deletion-unknown state race กันไม่ได้; late callbacks/receipts ไม่คืน canonical ที่ลบหรือหลบ cleanup และไม่ reuse identity ของ canceled work
- [x] Data deletion สำเร็จแต่ file cleanup failed/unknown ต้องรายงานแยกอย่างถาวรว่า URL อาจยังใช้ได้ ไม่อ้าง complete deletion และไม่ต้องคืน Response เป็น normal results row เพื่อให้ติดตามได้
- [x] Authorized Admin เปิด follow-up ด้วย durable case reference ใน surface เดิมและดำเนิน settlement ตามหลักฐาน/สิทธิ์จริงได้หลัง Response rows หาย; ไม่มี token-only/manual arbitrary delete หรือ blind resend
- [x] Archive เก็บไฟล์/history เดิมไม่เรียก Delete; การลบที่ยืนยันแล้วเป็น irreversible และมีข้อความตาม flow เดิม
- [x] HTTP integration ใช้ real isolated references/tombstones กับ controlled provider เพื่อพิสูจน์ shared/history/workspace refs, deletion races, failures/unknown และ restart หลัง rows gone; browser ตรวจ confirmation, separated outcome และ follow-up access หลังลบจริงใน fixture

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments

### Resolution — 14 พฤศจิกายน 2026

- รวม source `203245ec331106737040dfa02c42705a7836a0b0` และ workflow `93c800412b0dd343af35be7b6f98ba5c5f68569e` เข้า `feat/ecm-attachments` แล้ว ตรวจ actual HEAD/index/filesystem ตรง checked source ครบ 23 paths รวม migration; ไม่มี source ตกหล่น
- ตรวจ HTTP lifecycle 76 tests/2,882 assertions, UI 260 tests/18 suites, forced types 5/5 และ build 3/3 ผ่าน รวม plugin 297, spreadsheet-unit 116, form-lifecycle 12 และ native ONLYOFFICE 15 tests/264 assertions ในสอง invocations ตรวจ cross-feature HTTP ครบ 16 commands โดย 15 ผ่านเดิม และ ordinary-six ผ่าน 21 tests/6,038 assertions หลังลบเพียง strict whole-payload assertions ที่ผูก implementation ทั้งหกจุด ไม่ re-pin payload ใหม่หรือถอด behavior guards
- ตรวจจริงผ่านปุ่ม PoC เดิมบน Form ทดสอบแยก: Fill discard และ Dashboard discard ลบข้อมูลพร้อมไฟล์สำเร็จ ส่วน Admin ยกเลิก confirmation แล้วยังรักษาข้อมูล ก่อนยืนยันลบจริงภายใต้ controlled provider failure ข้อมูลหายแต่แสดง pending cleanup/case แยกอย่างถูกต้อง URL เดิมยังเปิดได้ ไม่อ้างลบไฟล์สำเร็จ
- Admin และ Viewer เปิดหลักฐานจาก case เดิมหลัง Response rows หายได้ โดย Viewer อ่านอย่างเดียว เจ้าของเห็น warning หลัง reload และ navigation ตรวจ actual API process restart `16528 → 17898` แล้ว case/context/warning คงเดิม และไม่มี DELETE ซ้ำ Provider counts คง `4 logins / 16 uploads / 5 deletes`; ไฟล์เก่า 11 ไฟล์, protected canonical/history และ export artifacts 15 ไฟล์ไม่เปลี่ยน
- Parent อ่านหลักฐาน HTTP/commit/native และตรวจ screenshots ของ confirmation, separated outcome, owner warning หลัง restart และ existing Results follow-up รวมเปิด workflow HTML จริง ตรวจภาพ 10, คำอธิบาย, fit/zoom และ source-link targets แล้ว Workflow build/check ผ่าน ไม่ได้ยืนยันว่า source commit ที่ยังไม่ push เปิดผ่าน GitHub ได้
- การตรวจนี้ใช้ isolated PostgreSQL/ONLYOFFICE และ controlled ECM provider ไม่ใช่ live ECM/PDMS หรือ production ไม่แก้ planning map/decision tickets; spec ทั้งหมดยังรอ independent Standards/Spec reviews และการแก้ blocking Correction newer-pending selection ก่อนส่งมอบ
