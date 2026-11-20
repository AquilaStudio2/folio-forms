# 02: เปลี่ยนผ่านฟอร์ม PoC โดยรักษาคำตอบเดิม

**What to build:** ทำเส้นทางเปลี่ยนผ่าน Template Draft/Published PoC เดิมบน editor และฟอร์มเดิมอย่างชัดเจน ใช้ configuration จากตั๋วที่บล็อกอยู่ ไม่ migrate คำตอบหรือคัดไฟล์ของ User เพื่อทำให้ฟอร์มเก่าดูเหมือนรองรับ upload

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [ตั้งค่าช่องแนบจากปุ่ม PoC เดิม](01-configure-existing-poc-attachments.md)

**Status:** resolved

**User stories:** 2, 20, 22, 102, 103, 104, 105 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [x] Admin explicitly configure ได้เฉพาะ PoC slot ใน Template Draft ที่ตรวจ marker/binding/placement ได้; คงตำแหน่งและ Tag เดิมตามกติกา ไม่เดาจากชื่อ attachment_N หรือแปลง text ทุกช่อง
- [x] Mapping ที่ขัดแย้งหรือพิสูจน์ไม่ได้หยุดพร้อมคำอธิบายโดยไม่เปลี่ยนข้อมูล; incomplete Draft ยังบันทึกได้และ new publication ใช้ validation ที่ตกลงแล้ว
- [x] Published PoC เก่าคง manifest/types/required rules และ ordinary Save/Submit contract เดิม; ไม่แปลง string/URL เป็น file object, fake receipt หรือสิทธิ์ลบ และไม่ใช้ Correction เปลี่ยนชนิด Field ย้อนหลัง
- [x] ปุ่ม upload เก่าแสดงข้อจำกัดและให้ประสาน Admin ใช้ Form ใหม่ ไม่ส่งไฟล์จริง ไม่กลับไปใช้ memory-only upload เป็น fallback และไม่ข้าม validation เก่า
- [x] Admin duplicate/configure Form ใหม่ผ่าน flow เดิมได้ โดยไม่คัด Responses/answers/files ของ User ไม่ archive/delete/redirect หรือเดา successor อัตโนมัติ
- [x] เตือนก่อนเปลี่ยนบริบทที่ทำ pending File หาย; ไม่บันทึก bytes จาก memory เป็น metadata ปลอม ไม่ย้ายข้าม Form/บัญชี และไม่ force reload เพื่อหลบ guard
- [x] HTTP/browser regression ตรวจทั้ง Template Draft ที่แปลงได้/ไม่ได้, Published PoC ที่มีคำตอบ text/URL และ Form ปกติ; เปรียบเทียบข้อมูลเก่าจริงว่าไม่ถูกแปลงหรือย้าย และตรวจ native placement/protection

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments

### Resolution — 2026-11-14

- รวมงานด้วย no-ff merge `2e2a3e1b3a5545eafe7944cc3ed00f3a9576d381` บน `feat/ecm-attachments`; source `6a87d0004dccba530401531777c9de42162d00c6` และ generated-provenance refresh `41d6b4809cbf037cdeea2b3fe9c119c9df036c18`
- HTTP native authoring ผ่าน 14 กรณี; legacy lifecycle ผ่าน 1 กรณีที่มี 104 assertions; picker ผ่าน 8 กรณี; focused UI ผ่าน 48 กรณี รวมทั้ง root format/lint/typecheck/build และ workflow build/check ผ่าน
- ตรวจ canonical XLSX ก่อน PATCH ด้วย shared native marker/binding/Tag/placement proof; mapping ที่พิสูจน์ไม่ได้ไม่เปลี่ยนข้อมูลหรือ revision และ same-PATCH Tag rename ยังทำได้เมื่อหลักฐานก่อนแก้ตรงกัน
- Native browser พิสูจน์ old Published text/URL required validation, Save Draft/ออก/Resume/Submit/history, ordinary non-PoC Form, Duplicate ที่ไม่มี Responses/คำตอบ User และการ configure ช่องเดิมอย่างชัดเจน; เปรียบเทียบ manifest และ Published artifact hash ว่าไม่เปลี่ยน และตรวจ sheet/object/workbook protection จริง
- เลือก File จริง 49 bytes ในช่องที่ตั้งค่าไว้แล้วเพื่อพิสูจน์ leave/before-unload guard ขณะ native dirty=false; cancel เก็บ selection และ discard ไม่ส่งต่อ File ข้าม Form/บัญชี โดย provider upload/delete เป็นศูนย์
- แก้ permanent legacy notice ที่เดิมถูก footer บัง: ซ่อน intro/ส่วนเลือกไฟล์ที่ใช้ไม่ได้ และใช้ notice ที่ตัดกับพื้นหลัง; ตรวจซ้ำใน native dialog จริงที่ 1365×768 แล้วข้อความ Admin/Form ใหม่แสดงครบ
- หลักฐาน isolated-runtime ชั่วคราว: `/tmp/ecm-legacy-checks-ready.txt`, `/tmp/ecm-native-legacy-result.txt`, `/tmp/ecm-legacy-merge-complete.txt` และ screenshots/XLSX inspections ที่รายงานอ้างถึง
- ยังไม่เรียก ECM จริงหรือทดสอบ attachment Save/Submit/newer-pending preservation/exports; เป็นงานของตั๋วที่เหลือ ไม่ใช่ fallback สำหรับฟอร์มเก่า และยังไม่ push/deploy
