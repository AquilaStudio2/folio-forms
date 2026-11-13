# 03: แนบไฟล์ช่องเดี่ยวแล้วบันทึกหรือส่งเป็น URL

**What to build:** ส่งมอบวงจรใช้งานจริงของ scalar attachment ตั้งแต่ popup PoC เดิมจน explicit User Save Draft/Submit และการเปิดกลับเห็น URL รองรับหลาย scalar slots ใน snapshot เดียว ใช้ Field contract/auth จากตั๋วตั้งค่าและ Operation/checkpoint/lease เดิม พร้อม durable intent/receipt และ fail-closed outcomes ตั้งแต่คำขอเขียนแรก ไม่ส่งมอบ endpoint หรือ JSON scaffold ที่ยังบันทึกเอกสารจริงไม่ได้

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [ตั้งค่าช่องแนบจากปุ่ม PoC เดิม](01-configure-existing-poc-attachments.md)

**Status:** ready-for-agent

**User stories:** 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 38, 39, 40, 43, 44, 45, 46, 47, 48, 52, 53, 54, 55, 56, 63, 64, 74, 75, 76, 77, 82, 111 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [ ] Popup เดิมแยก saved URL กับ pending name/size และเปิด URL แยกจาก choose; selection ไม่อัปโหลด มี labelled/keyboard controls และเตือนก่อน leave/reload/scope change โดยไม่อ้างว่ากู้ File จากชื่อได้
- [ ] รับไฟล์จริงทุกชนิดรวม password-protected/extensionless/0 bytes ถึง 10,000,000 bytes inclusive ต่อไฟล์; server ตรวจ actual bytes ไม่ใช้ MIME/Content-Length/ชื่อเป็นหลักฐาน และไม่เก็บ attachment bytes ถาวรใน RustFS/JSON/XLSX
- [ ] เลือกไฟล์ก่อน metadata ได้ แต่เมื่อมีไฟล์ต้อง upload ตรวจ scalar root fiscal_year/docs_number และ filename safety ก่อน write; ผิดแล้วระบุ Field เก็บ selection และ canonical เดิม ไม่ rewrite unsafe characters หรือเติม metadata สมมติ
- [ ] ส่ง multipart original bytes ไป POST /api/beeecm/public/file ด้วย template="0", year/number จาก trusted snapshot และ saved category string; filename ตาม unique-version contract แยกข้าม Form/User/slot/operation คง original extension/bytes
- [ ] Upload เฉพาะ explicit Save Draft/Submit; selection, export, Template publish, internal checkpoint หรือ implicit Save ไม่เริ่ม ECM writes และไม่ใช้ auth budget เป็น upload timeout โดยเดา
- [ ] Persist scoped intent ก่อนส่งและ receipt ที่ตรวจ URL/token คู่กันทันที; ส่งทีละไฟล์และหยุดเริ่มไฟล์ใหม่เมื่อมีปัญหา ไม่ถือ SQL transaction ระหว่าง HTTP; missing/malformed receipt หลังส่งเป็น unknown ไม่ใช่ไม่มีไฟล์
- [ ] Scalar JSON เป็น null หรือ file_link/file_token/original_name/size_bytes ตาม dedicated strict contract; ordinary Fields คง validation เดิม ทั้ง canonical JSON ไม่เกิน 262,144 UTF-8 bytes ไม่ตัด/ย้าย metadata หลบ limit
- [ ] Draft ขาด required attachment ได้ แต่ invalid selection ยังทำให้ save ไม่ผ่าน; Submit โดยตรงพร้อมไฟล์ใหม่ได้เมื่อ upload+commit ครบ และ saved zero-byte object นับเป็น present
- [ ] ตรวจ actor/ownership/lease/base revision/binding ก่อนและก่อน commit; document pointer, canonical JSON และ operation result เป็น snapshot เดียว ไม่มี partial Submission หรือ stale callback overwrite
- [ ] Known failed batch cancel และ cleanup เฉพาะ newly uploaded/unreferenced Folio files; ถ้า cleanup/ผล upload ยังไม่ยืนยันให้ block mutation โดยยังอ่าน canonical เดิม ไม่ auto resend หรือ reuse canceled receipts
- [ ] Double click/poll/reload ใช้ original operation/checkpoint; Folio commit ไม่ชัดต้องตรวจผลเดิมก่อน cleanup/เริ่มใหม่ และ File selection ถูก clear เฉพาะ snapshot ที่รับ ไม่ล้างการแก้ใหม่
- [ ] เปิด Draft ที่บันทึกแล้วได้ URL จริงพร้อม metadata จาก canonical receipt ไม่เชื่อ cell URL/client token เป็น ownership และไม่มี Bearer/file-token metadata ใน workbook projection
- [ ] HTTP integration ตรวจ actual received bytes/identity, size/UTF-8 boundaries, forged scope, direct Submit, multi-scalar atomic failure และ lost response; browser ทำ scalar flow จริงและเปิดกลับผ่าน native PoC โดย protection ไม่เปลี่ยน

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments
