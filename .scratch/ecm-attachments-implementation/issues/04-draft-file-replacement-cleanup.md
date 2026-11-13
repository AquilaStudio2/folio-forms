# 04: เปลี่ยนหรือนำไฟล์ออกและแก้เลขหรือปีใน Draft

**What to build:** ต่อวงจร scalar Draft ที่บันทึกได้จริงให้ replace/remove/cancel และ metadata-change ได้โดยไม่ทำไฟล์เก่าหาย เพิ่ม reference-safe post-commit cleanup ที่ทำงานจริงกับ ECM พร้อมข้อความผลการบันทึกกับผลลบแยกกัน ไม่เพิ่ม storage fallback หรือ retry daemon

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [แนบไฟล์ช่องเดี่ยวแล้วบันทึกหรือส่งเป็น URL](03-scalar-save-submit.md)

**Status:** ready-for-agent

**User stories:** 35, 36, 37, 49, 50, 51, 72, 73, 96, 97 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [ ] Popup แสดง saved กับ pending ชัดเจน; cancel pending replacement คืนการใช้ saved file; remove เป็น pending จน explicit save และ invalid replacement ไม่ลบ/แทนไฟล์เดิมหรือเงียบใช้ค่าเดิมเพื่อข้าม validation
- [ ] ไฟล์/metadata ไม่เปลี่ยน reuse reference เดิมโดยไม่ upload/login; ปีหรือเลขเปลี่ยนอ่าน original bytes จาก trusted canonical URL และ reupload ด้วย identity ใหม่โดยไม่บังคับ reselect; pending replacement มี precedence
- [ ] Original name ใช้รักษานามสกุล ไม่เดาจาก URL/generated name; server fetch มี URL/redirect/egress trust boundary ไม่รับ arbitrary URL และ fetch ล้มเหลวรักษา canonical/selection เดิม
- [ ] Commit snapshot ใหม่ครบก่อนพิจารณาลบเก่า; unique versions ไม่ overwrite history และไฟล์ที่ยังมี Draft/Submission/Correction/workspace/eligible-operation reference ห้ามถูกลบ
- [ ] Reference acquisition กับ no-reference/deletion claim ใช้ transactional fencing เดียวกัน; creating reference ไปยัง deleting/deletion-unknown file ไม่ได้ ไม่ใช้ query-then-delete ที่มี race
- [ ] Physical Delete ใช้ canonical server-owned file_token และ auth เท่านั้น ไม่ยอม client token/URL เป็นสิทธิ์ลบ ไม่ลบไฟล์ระบบอื่น
- [ ] New snapshot commit สำเร็จแต่ old cleanup failed/unknown ยัง saved, usable, exportable; แสดง persistent warning ว่า URL เก่าอาจยังเปิดได้ ไม่ rollback และ warning ไม่หายเพราะ save รอบถัดไปสำเร็จ
- [ ] Canceled batch cleanup ที่ไม่ครบยัง block mutation และไม่ reuse receipts ตามสเปก; error ก่อน commit ไม่มี partial answer หรือการลบไฟล์ที่ canonical เดิมยังใช้
- [ ] HTTP integration ทดสอบ unchanged/replacement/removal/metadata refetch, malicious URL, shared/history refs และ reference-delete races; browser ตรวจ popup/persistent warning และ saved URLs ก่อน/หลัง reopen

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments
