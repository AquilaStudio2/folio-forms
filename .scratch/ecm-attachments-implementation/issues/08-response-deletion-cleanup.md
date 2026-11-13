# 08: ลบ Response พร้อมไฟล์ที่ไม่มีการอ้างถึง

**What to build:** รวม ECM reference-safe cleanup เข้ากับ whole-Response deletion และ durable tombstone/recovery เดิม ผู้มีสิทธิ์ลบเห็นผลลบข้อมูลกับผลลบไฟล์แยกกัน และ Admin ติดตามไฟล์ค้างต่อได้จาก case reference แม้ Response rows ถูกลบ ไม่สร้างหน้าใหม่หรือฟื้นคำตอบที่ลบ

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [Correction ประวัติ และส่งออกฉบับที่เลือก](07-corrections-history-exports.md)

**Status:** ready-for-agent

**User stories:** 95, 98, 99, 100, 101 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [ ] คง authorization/confirmation, active-operation/editor-lease/stale guards เดิม; ไม่ให้ Viewer ลบหรือเพิ่มสิทธิ์ลบ Published Form และ unknown upload ที่ยังไม่ settle ยังห้ามลบ Response
- [ ] ก่อนลบ rows เก็บ cleanup context ของ Folio-owned files/intents ทุก revision รวม Draft/Submission/Correction/workspace และ eligible operations; durable records อยู่รอดหลัง rows gone/crash
- [ ] ลบเฉพาะ proven Folio uploads ที่ไม่มี surviving references จริง ตรวจและ claim ด้วย fencing เดิม; ไม่ลบไฟล์ระบบอื่น/ไฟล์จาก URL text/client token หรือไฟล์ที่อีก revision/operation ยังใช้
- [ ] Reference creation กับ deleting/deletion-unknown state race กันไม่ได้; late callbacks/receipts ไม่คืน canonical ที่ลบหรือหลบ cleanup และไม่ reuse identity ของ canceled work
- [ ] Data deletion สำเร็จแต่ file cleanup failed/unknown ต้องรายงานแยกอย่างถาวรว่า URL อาจยังใช้ได้ ไม่อ้าง complete deletion และไม่ต้องคืน Response เป็น normal results row เพื่อให้ติดตามได้
- [ ] Authorized Admin เปิด follow-up ด้วย durable case reference ใน surface เดิมและดำเนิน settlement ตามหลักฐาน/สิทธิ์จริงได้หลัง Response rows หาย; ไม่มี token-only/manual arbitrary delete หรือ blind resend
- [ ] Archive เก็บไฟล์/history เดิมไม่เรียก Delete; การลบที่ยืนยันแล้วเป็น irreversible และมีข้อความตาม flow เดิม
- [ ] HTTP integration ใช้ real isolated references/tombstones กับ controlled provider เพื่อพิสูจน์ shared/history/workspace refs, deletion races, failures/unknown และ restart หลัง rows gone; browser ตรวจ confirmation, separated outcome และ follow-up access หลังลบจริงใน fixture

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments
