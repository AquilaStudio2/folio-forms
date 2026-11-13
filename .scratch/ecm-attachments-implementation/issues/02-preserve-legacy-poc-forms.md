# 02: เปลี่ยนผ่านฟอร์ม PoC โดยรักษาคำตอบเดิม

**What to build:** ทำเส้นทางเปลี่ยนผ่าน Template Draft/Published PoC เดิมบน editor และฟอร์มเดิมอย่างชัดเจน ใช้ configuration จากตั๋วที่บล็อกอยู่ ไม่ migrate คำตอบหรือคัดไฟล์ของ User เพื่อทำให้ฟอร์มเก่าดูเหมือนรองรับ upload

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [ตั้งค่าช่องแนบจากปุ่ม PoC เดิม](01-configure-existing-poc-attachments.md)

**Status:** ready-for-agent

**User stories:** 2, 20, 22, 102, 103, 104, 105 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [ ] Admin explicitly configure ได้เฉพาะ PoC slot ใน Template Draft ที่ตรวจ marker/binding/placement ได้; คงตำแหน่งและ Tag เดิมตามกติกา ไม่เดาจากชื่อ attachment_N หรือแปลง text ทุกช่อง
- [ ] Mapping ที่ขัดแย้งหรือพิสูจน์ไม่ได้หยุดพร้อมคำอธิบายโดยไม่เปลี่ยนข้อมูล; incomplete Draft ยังบันทึกได้และ new publication ใช้ validation ที่ตกลงแล้ว
- [ ] Published PoC เก่าคง manifest/types/required rules และ ordinary Save/Submit contract เดิม; ไม่แปลง string/URL เป็น file object, fake receipt หรือสิทธิ์ลบ และไม่ใช้ Correction เปลี่ยนชนิด Field ย้อนหลัง
- [ ] ปุ่ม upload เก่าแสดงข้อจำกัดและให้ประสาน Admin ใช้ Form ใหม่ ไม่ส่งไฟล์จริง ไม่กลับไปใช้ memory-only upload เป็น fallback และไม่ข้าม validation เก่า
- [ ] Admin duplicate/configure Form ใหม่ผ่าน flow เดิมได้ โดยไม่คัด Responses/answers/files ของ User ไม่ archive/delete/redirect หรือเดา successor อัตโนมัติ
- [ ] เตือนก่อนเปลี่ยนบริบทที่ทำ pending File หาย; ไม่บันทึก bytes จาก memory เป็น metadata ปลอม ไม่ย้ายข้าม Form/บัญชี และไม่ force reload เพื่อหลบ guard
- [ ] HTTP/browser regression ตรวจทั้ง Template Draft ที่แปลงได้/ไม่ได้, Published PoC ที่มีคำตอบ text/URL และ Form ปกติ; เปรียบเทียบข้อมูลเก่าจริงว่าไม่ถูกแปลงหรือย้าย และตรวจ native placement/protection

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments
