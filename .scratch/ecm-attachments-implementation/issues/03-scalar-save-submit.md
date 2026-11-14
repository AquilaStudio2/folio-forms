# 03: แนบไฟล์ช่องเดี่ยวแล้วบันทึกหรือส่งเป็น URL

**What to build:** ส่งมอบวงจรใช้งานจริงของ scalar attachment ตั้งแต่ popup PoC เดิมจน explicit User Save Draft/Submit และการเปิดกลับเห็น URL รองรับหลาย scalar slots ใน snapshot เดียว ใช้ Field contract/auth จากตั๋วตั้งค่าและ Operation/checkpoint/lease เดิม พร้อม durable intent/receipt และ fail-closed outcomes ตั้งแต่คำขอเขียนแรก ไม่ส่งมอบ endpoint หรือ JSON scaffold ที่ยังบันทึกเอกสารจริงไม่ได้

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [ตั้งค่าช่องแนบจากปุ่ม PoC เดิม](01-configure-existing-poc-attachments.md)

**Status:** resolved

**User stories:** 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 38, 39, 40, 43, 44, 45, 46, 47, 48, 52, 53, 54, 55, 56, 63, 64, 74, 75, 76, 77, 82, 111 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [x] Popup เดิมแยก saved URL กับ pending name/size และเปิด URL แยกจาก choose; selection ไม่อัปโหลด มี labelled/keyboard controls และเตือนก่อน leave/reload/scope change โดยไม่อ้างว่ากู้ File จากชื่อได้
- [x] รับไฟล์จริงทุกชนิดรวม password-protected/extensionless/0 bytes ถึง 10,000,000 bytes inclusive ต่อไฟล์; server ตรวจ actual bytes ไม่ใช้ MIME/Content-Length/ชื่อเป็นหลักฐาน และไม่เก็บ attachment bytes ถาวรใน RustFS/JSON/XLSX
- [x] เลือกไฟล์ก่อน metadata ได้ แต่เมื่อมีไฟล์ต้อง upload ตรวจ scalar root fiscal_year/docs_number และ filename safety ก่อน write; ผิดแล้วระบุ Field เก็บ selection และ canonical เดิม ไม่ rewrite unsafe characters หรือเติม metadata สมมติ
- [x] ส่ง multipart original bytes ไป POST /api/beeecm/public/file ด้วย template="0", year/number จาก trusted snapshot และ saved category string; filename ตาม unique-version contract แยกข้าม Form/User/slot/operation คง original extension/bytes
- [x] Upload เฉพาะ explicit Save Draft/Submit; selection, export, Template publish, internal checkpoint หรือ implicit Save ไม่เริ่ม ECM writes และไม่ใช้ auth budget เป็น upload timeout โดยเดา
- [x] Persist scoped intent ก่อนส่งและ receipt ที่ตรวจ URL/token คู่กันทันที; ส่งทีละไฟล์และหยุดเริ่มไฟล์ใหม่เมื่อมีปัญหา ไม่ถือ SQL transaction ระหว่าง HTTP; missing/malformed receipt หลังส่งเป็น unknown ไม่ใช่ไม่มีไฟล์
- [x] Scalar JSON เป็น null หรือ file_link/file_token/original_name/size_bytes ตาม dedicated strict contract; ordinary Fields คง validation เดิม ทั้ง canonical JSON ไม่เกิน 262,144 UTF-8 bytes ไม่ตัด/ย้าย metadata หลบ limit
- [x] Draft ขาด required attachment ได้ แต่ invalid selection ยังทำให้ save ไม่ผ่าน; Submit โดยตรงพร้อมไฟล์ใหม่ได้เมื่อ upload+commit ครบ และ saved zero-byte object นับเป็น present
- [x] ตรวจ actor/ownership/lease/base revision/binding ก่อนและก่อน commit; document pointer, canonical JSON และ operation result เป็น snapshot เดียว ไม่มี partial Submission หรือ stale callback overwrite
- [x] Known failed batch cancel และ cleanup เฉพาะ newly uploaded/unreferenced Folio files; ถ้า cleanup/ผล upload ยังไม่ยืนยันให้ block mutation โดยยังอ่าน canonical เดิม ไม่ auto resend หรือ reuse canceled receipts
- [x] Double click/poll/reload ใช้ original operation/checkpoint; Folio commit ไม่ชัดต้องตรวจผลเดิมก่อน cleanup/เริ่มใหม่ และ File selection ถูก clear เฉพาะ snapshot ที่รับ ไม่ล้างการแก้ใหม่
- [x] เปิด Draft ที่บันทึกแล้วได้ URL จริงพร้อม metadata จาก canonical receipt ไม่เชื่อ cell URL/client token เป็น ownership และไม่มี Bearer/file-token metadata ใน workbook projection
- [x] HTTP integration ตรวจ actual received bytes/identity, size/UTF-8 boundaries, forged scope, direct Submit, multi-scalar atomic failure และ lost response; browser ทำ scalar flow จริงและเปิดกลับผ่าน native PoC โดย protection ไม่เปลี่ยน

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments

### Resolution: scalar Save Draft/Submit และการกู้ผลรอบเดิม

- Source commit `22dbd6f9f6c8b055cc0ae50f960bb55e1eebac25`; real-source-SHA workflow derivatives `d6ea9dfda7236419cd1b9fa1f31654313db28523`; integration merge `70305f6003a20ed061ba8b7cb88600b0b7b8fce2` บน `feat/ecm-attachments`
- ตรวจ root scoped format/lint 36 paths, type checks 5/5, build 3/3 และ workflow build/check/visual ผ่าน ใช้ HTTP integration 39 tests/672 assertions, authentication 18 tests/82 assertions, plugin 290 tests/1,366 assertions และ UI กลุ่มที่กระทบ 58 tests ผ่าน หลังแก้ contract ของ cold Submit ตรวจซ้ำ editor recovery/pending 45 tests ผ่าน
- ใช้ ONLYOFFICE จริงกับ isolated PostgreSQL, S3-compatible test storage และ controlled ECM HTTP provider ตรวจไฟล์จาก disk ทุกขอบเขต รวม 0 bytes, extensionless, encrypted ZIP, PDF และ 10,000,000 bytes; ปฏิเสธ 10,000,001 bytes โดยคง selection ตรวจ bytes/ชื่อ/metadata/URL และ canonical JSON/XLSX จริง ไม่ถือ provider double เป็นหลักฐาน ECM production
- พบและแก้ active-cell capture ข้าม origin, cross-frame File multipart, ผลตอบกลับหลัง provider รับ bytes แล้ว, negative-admission checkpoint fence, replay ของ failed operation และการกู้ checkpoint ก่อนเปิด native editor รักษา native protection และไม่ลด validation
- Native ตรวจ lost real 202/lookup ทั้ง same-page และ reload, original Submit ที่ผู้ใช้กด Save/Save-and-exit ภายหลัง, bounded retry/readOnly และ cold Submit หลัง editor-config เดิมปิด ยึด original Operation/Submission โดยไม่ relabel เป็น snapshot ใหม่ ตรวจ DB ไม่เกิด Submission ซ้ำ Cold recovery มีสอง POST `/start` ตาม flow เดิม ไม่ใช่ข้ออ้างว่าไม่มี POST ใดเลย; ไม่มี POST `/draft` หรือ `/submit` เพิ่ม และ provider uploads คง 14
- แก้บั๊กผลสำเร็จรอบเก่าถูกแสดงแทนการบันทึกข้อความใหม่ ยืนยัน latest ordinary edit โดยไม่กด Enter ถูกบันทึกทั้ง canonical JSON และ XLSX ใน operation ใหม่ ไฟล์ XLSX ที่ตรวจจริงมี SHA-256 `74f28e5886c8c2b5ba19abe646080a55914a4287078b9e2354a287e8b74b6694` และข้อความ `LIFECYCLE_NEW_CANONICAL_MUST_SAVE_06`
- Native newer-file race ยืนยัน File ใหม่ยัง pending หลัง receipt เก่ารับสำเร็จและ remount; native แสดง All changes saved แต่ host ยังเตือน pending/ป้องกันออก ข้อมูล File ที่ยังไม่ส่งไม่ถูกนับว่า saved
- รายละเอียดและ artifact pointers ของงานรอบนี้: `/tmp/ecm-scalar-final-check-handoff.txt`, `/tmp/ecm-scalar-final-native-handoff.txt` และ `/tmp/ecm-scalar-source-complete-handoff.txt` เป็นหลักฐาน local ไม่ใช่เอกสารที่เผยแพร่หรือ deployment evidence
- ยังไม่ตรวจ live ECM/DCM, production RustFS หรือ production deployment งาน replace/remove/metadata cleanup, follow-up, table rows, Correction/history/export projection และ Response deletion อยู่ในตั๋วถัดไปตามกราฟ ช่อง Choose file ที่ยังติดใน PDF ที่สังเกตจริงถูกบันทึกให้ตั๋ว Correction/history/exports แก้ ไม่อ้างว่า feature ทั้งสเปกเสร็จแล้ว

### Integration artifact correction

หลัง merge พบว่า explicit source manifest ตกหล่น shared `workbook.ts` แม้ source worktree ที่ตรวจ native มี attachment extraction ครบ ส่งผลให้ initial scalar Save ใน worktree ของตั๋วถัดไปล้มเหลวก่อนทดสอบ metadata change ตรวจ actual tracked delta พบไฟล์ตกหล่นเพียงไฟล์นี้ และไม่พบ untracked source ที่ตกหล่น จึงนำ implementation ที่ตรวจแล้วมารวมใน integration

ตรวจบน integration โดยตรงหลังคืน extraction: native HTTP 39 tests/679 assertions ผ่าน, scoped formatter/lint ผ่าน, root types 5/5 และ build 3/3 ผ่าน Full spreadsheet-unit ที่รันเพิ่มได้ 115 ผ่าน/2 ล้มเหลวจาก picture-editor mock ที่ยังไม่มี ECM model และ assertion ที่เปรียบเทียบ copied field manifest/defaults ทั้ง object บันทึกเป็นงานต้องแก้ก่อน final acceptance ไม่ถือเป็นผลผ่านทั้ง suite หลักฐาน `artifact://1104`, ผล types/build จาก parent job bg70 และ context pointer `local://ecm-integration-artifact-followup.md`

แก้ full-unit follow-up โดยลบ assertion ที่เทียบ copied manifest/defaults และลบ editor mock-echo wrapper/harness ซึ่งแทน renderer ด้วยการคืน options เดิม ไม่เพิ่ม stub ของ ledger และไม่แก้ production เพื่อหลบ mock ที่ไม่ครบ คง round-trip/validation/picture-presence tests และตรวจ actual ONLYOFFICE Picture เพิ่ม ผล integration spreadsheet-unit 116 tests/301 assertions ผ่าน; native Picture 2 tests/16 assertions ผ่าน ครอบคลุม published/reopened geometry และ real protected-workbook insertion/replacement/removal/PDF export หลักฐาน `artifact://1125`

Read-only CLI smoke บน integration ใช้ saved native XLSX จริงและ original completed Operation/Response ใน isolated browser DB ตรวจ exact canonical data/receipts, B10 URL, original size 49 bytes และ latest B6 note ผ่าน ไม่มี write และลบ throwaway script แล้ว
