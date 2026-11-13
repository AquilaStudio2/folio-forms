# 06: แนบไฟล์รายแถวโดยรักษา mapping

**What to build:** ขยายวงจรบันทึก/แทนที่/ลบ scalar ที่ทำงานแล้วสู่หนึ่งไฟล์ต่อ table-row slot ใช้ category/required ของ column และ trusted physical row mapping ร่วม workbook/JSON/pending state โดยไม่สร้าง row tags หรือ upload flow แยกอีกชุด

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [เปลี่ยนหรือนำไฟล์ออกและแก้เลขหรือปีใน Draft](04-draft-file-replacement-cleanup.md)

**Status:** ready-for-agent

**User stories:** 3, 57, 58, 59, 60, 61, 62 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [ ] Admin ตั้ง category/required ราย attachment column ตาม contract เดิม ทุกแถวรวมแถวใหม่ใช้ค่าร่วมกัน; แต่ละแถวเก็บหนึ่งไฟล์ต่อช่องและใช้ column tag ไม่สร้าง tag รายแถว
- [ ] Table object เพิ่ม row_index แบบ zero-based physical row ภายใน trusted table/document/revision ไม่ใช้ compact JSON array index หรือค่าที่ client ส่งเป็น proof
- [ ] เก็บ attachment-only/zero-byte rows; active row คือมี input หรือไฟล์; Submit ตรวจ required attachments และ required columns อื่นใน active rows แต่ fully empty/no-file rows ไม่ถูกบังคับ
- [ ] หลาย column และ empty physical gaps ไม่สลับไฟล์ข้ามแถว; metadata/year/number เดียวทั้ง Response และ row errors ระบุแถวจริง
- [ ] Supported row changes ปรับ workbook/canonical metadata/pending mapping ร่วมกันโดย identity ของไฟล์ไม่เปลี่ยนและไม่ reupload เพียงเพราะแถวเลื่อน; unproven/stale/unsupported mappings หยุดโดยไม่เดาหรือเพิ่ม delete-row capability นอกขอบเขต
- [ ] Add row/implicit Save Draft/internal checkpoint ไม่เริ่ม ECM uploads และ preserve pending Files ผ่าน verified document-key/remount transitions; ถ้ารักษาไม่ได้ต้องหยุดก่อน loss ไม่ force reload
- [ ] Table batch ยังคง sequential uploads, canonical atomicity, size/JSON cap, ownership/fencing, cancellation และ unknown outcome ตามสเปก ไม่ partial commit แถวที่สำเร็จก่อน
- [ ] HTTP/workbook integration ตรวจ gaps, compacted rows, attachment-only/zero bytes, other required columns, row shifts, stale mapping และ multi-column failures; native browser ตรวจปุ่มแถวใหม่/protection/pending continuity จริง

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments
