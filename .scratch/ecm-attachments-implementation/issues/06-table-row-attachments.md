# 06: แนบไฟล์รายแถวโดยรักษา mapping

**What to build:** ขยายวงจรบันทึก/แทนที่/ลบ scalar ที่ทำงานแล้วสู่หนึ่งไฟล์ต่อ table-row slot ใช้ category/required ของ column และ trusted physical row mapping ร่วม workbook/JSON/pending state โดยไม่สร้าง row tags หรือ upload flow แยกอีกชุด

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** [เปลี่ยนหรือนำไฟล์ออกและแก้เลขหรือปีใน Draft](04-draft-file-replacement-cleanup.md)

**Status:** resolved

**User stories:** 3, 57, 58, 59, 60, 61, 62 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [x] Admin ตั้ง category/required ราย attachment column ตาม contract เดิม ทุกแถวรวมแถวใหม่ใช้ค่าร่วมกัน; แต่ละแถวเก็บหนึ่งไฟล์ต่อช่องและใช้ column tag ไม่สร้าง tag รายแถว
- [x] Table object เพิ่ม row_index แบบ zero-based physical row ภายใน trusted table/document/revision ไม่ใช้ compact JSON array index หรือค่าที่ client ส่งเป็น proof
- [x] เก็บ attachment-only/zero-byte rows; active row คือมี input หรือไฟล์; Submit ตรวจ required attachments และ required columns อื่นใน active rows แต่ fully empty/no-file rows ไม่ถูกบังคับ
- [x] หลาย column และ empty physical gaps ไม่สลับไฟล์ข้ามแถว; metadata/year/number เดียวทั้ง Response และ row errors ระบุแถวจริง
- [x] Supported row changes ปรับ workbook/canonical metadata/pending mapping ร่วมกันโดย identity ของไฟล์ไม่เปลี่ยนและไม่ reupload เพียงเพราะแถวเลื่อน; unproven/stale/unsupported mappings หยุดโดยไม่เดาหรือเพิ่ม delete-row capability นอกขอบเขต
- [x] Add row/implicit Save Draft/internal checkpoint ไม่เริ่ม ECM uploads และ preserve pending Files ผ่าน verified document-key/remount transitions; ถ้ารักษาไม่ได้ต้องหยุดก่อน loss ไม่ force reload
- [x] Table batch ยังคง sequential uploads, canonical atomicity, size/JSON cap, ownership/fencing, cancellation และ unknown outcome ตามสเปก ไม่ partial commit แถวที่สำเร็จก่อน
- [x] HTTP/workbook integration ตรวจ gaps, compacted rows, attachment-only/zero bytes, other required columns, row shifts, stale mapping และ multi-column failures; native browser ตรวจปุ่มแถวใหม่/protection/pending continuity จริง

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments

### 2026-11-14 — ตรวจรับบน `feat/ecm-attachments`

- Source physical rows คือ `340f6c3beca294de7c942798c3a01d14c35d6dff` รวมกับ recovery ใน `c2d0a4e4bd331dce971f84f854ff01372ec6ad08` และ corrective UI ใน `b68c59a25ef959a12b2218f39b5d90b3c6795b43` Machine-readable inclusion ตรวจ actual filesystem/index/Git blobs ครบ ไม่ตกหล่น shared workbook extraction หรือ migrations
- ใช้ attachment lifecycle เดิมร่วมกันทั้ง scalar/table และ URI-encode JSON slot เฉพาะ multipart transport boundary แล้ว decode/validate ครั้งเดียว โดยไม่เปลี่ยน host slot identity หรือเพิ่ม raw-wire shim ตรวจจริงว่า Bun multipart ไม่คง literal quotes ใน field name จึงไม่อาศัย mocked FormData map
- Native browser เลือก zero-byte File ใน physical row index 2 ทั้งที่ canonical array เป็น index 0 แล้ว Add row/remount และ explicit Save โดยไม่เลือกใหม่ ไฟล์ถูกเก็บตรงคอลัมน์/แถวจริง แถวที่มีแต่ไฟล์ 0 bytes ไม่หาย ต่อมาบันทึกไฟล์คนละ bytes ในสองคอลัมน์โดยเว้น physical gap และไม่สลับไฟล์
- คำสั่ง delete-selected-row เดิมลบแถวว่างก่อนหน้าและย้าย saved zero-byte กับ pending File จาก physical index 2 เป็น 1 ผ่าน verified remount โดยไม่เพิ่ม upload/delete Saved version และ URL เดิมคงอยู่ ส่วน immutable version.rowIndex ยังคงตำแหน่งส่งครั้งแรก Pending File บันทึกครั้งถัดไปได้ bytes/hash เดิมโดยไม่เลือกใหม่
- Native SDK แสดง clean แต่ host ยังป้องกัน export/Exit เมื่อมี pending File/removal ตรวจ keyboard remove/cancel และ labels จริง การเปิด saved Draft อีกครั้งคง canonical JSON/key/object/S3 hash และ worksheet/object protection ไม่มี token ใน workbook และ unchanged Save ไม่เพิ่ม auth/upload/delete
- Gate ของ rows ก่อนรวมผ่าน HTTP 51 กรณี/1,866 assertions, native CLI 6/24, spreadsheet units 116/301 และ UI 56 กรณี หลังรวม lifecycle ผ่าน HTTP 57/1,994 และ affected regression commands อีก 15 ชุดโดยไม่มี failure/skip Type checks/build และ workflow checks ผ่าน หลักฐานเดิมเชื่อมกับ integration ด้วย checked source hashes ไม่อ้างว่ารันซ้ำทุกชุดหลังแก้เฉพาะ UI
- หลักฐานภายนอก repo: `/tmp/ecm-joint-native-handoff.txt`, `/tmp/ecm-joint-native-table-reopen-storage-proof.json`, `/tmp/ecm-joint-native-table-protection-timeline.json`, `/tmp/ecm-joint-regression-handoff.txt` และ `/tmp/ecm-recovery-ui-fix-inclusion.json` Negative required-column/unsupported-mapping/multi-column failure cases เป็น HTTP/workbook evidence ไม่อ้างว่าทดสอบ native ทุกคำสั่งที่เป็นไปได้
- ไม่ได้เรียก ECM จริง และไม่เพิ่ม delete-row capability ใหม่ ส่วน static upload drawings ใน read-only/export ยังเป็นงาน [Correction ประวัติ และส่งออกฉบับที่เลือก](07-corrections-history-exports.md) ไม่ถือว่า URL-only export เสร็จจากการปิดตั๋วนี้
