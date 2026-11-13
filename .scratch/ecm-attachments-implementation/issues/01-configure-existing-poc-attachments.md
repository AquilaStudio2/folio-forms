# 01: ตั้งค่าช่องแนบจากปุ่ม PoC เดิม

**What to build:** ต่อยอดกลไกสร้างปุ่ม PoC และ Field settings เดิมให้ Admin กำหนดช่องแนบ scalar/column, Document Category, required และ Tag ได้จริง พร้อม Folio-only ECM authentication ที่ category picker ใช้ผ่าน server พัฒนาครบจากสัญญาข้อมูลถึงหน้าตั้งค่าและการบันทึก/เผยแพร่ ไม่แยก schema หรือ auth เป็น foundation ที่ยังใช้งานไม่ได้

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**User stories:** 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 106, 107, 108, 109, 110 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [ ] สร้างปุ่มด้วยตำแหน่ง/binding และ automatic attachment_N ตามกติกาเดิม; เปลี่ยน Tag ก่อนเผยแพร่แล้ว settings/ปุ่มยังชี้ Field เดิม ไม่เกิดชื่อซ้ำหรือเปิดสิทธิ์ปลด sheet/object protection
- [ ] Admin เลือก category จาก GET /api/beeecm/public/document/category ผ่าน server; เก็บ type/name string ต่อ scalar หรือ column ไม่ใช้ id แทนชื่อ ทุกแถวใช้ค่าของ column และ User เปลี่ยนปลายทางไม่ได้
- [ ] Template Draft บันทึก configuration ที่ยังไม่ครบได้; publish ต้องมี categories ครบและ scalar root fiscal_year/docs_number อย่างละหนึ่ง Field โดยไม่ต้องมีค่าของ User และไม่มีปุ่ม PoC ที่ไม่ได้ตั้งค่าหรือถูกนำออก
- [ ] Saved category คงเดิมเมื่อ API ล่มหรือชื่อเปลี่ยน; publish ด้วยค่าที่เคยเลือกครบได้โดยไม่บังคับ live recheck; เลือกค่าใหม่ไม่ได้จากรายการสมมติ และ published contract แก้ย้อนหลังไม่ได้
- [ ] ใช้เฉพาะ ECM_API_URL/ECM_USERNAME/ECM_PASSWORD ฝั่ง server กับบัญชี Folio แยก; ไม่มี Ongoing fallback, browser credentials, token endpoint หรือ ECM login UI; integration ที่ไม่ตั้งค่าไม่ทำให้ Form ปกติหรือ Folio session ใช้ไม่ได้
- [ ] Login ตรวจ data.token/data.expire ตามสัญญา; encrypted PostgreSQL cache และ claim/lease/generation เป็น shared truth ข้าม processes ไม่มี DB transaction ค้างระหว่าง HTTP และผลเก่าหรือ late 401 ไม่ล้าง generation ใหม่
- [ ] Reuse token เมื่อ verified expiry ครอบคลุม request budget กับ skew; ไม่เดา timezone/อายุ token และกุญแจเข้ารหัสอยู่นอก cache row ผ่าน secret management
- [ ] Shared auth job มีไม่เกิน 3 attempts รวมครั้งแรก เฉพาะ transient failures ตามสเปก; 15 วินาทีต่อครั้ง, 30 วินาทีรวม, backoff 1/2 วินาที และ Retry-After ภายใน deadline; permanent errors หยุดและ waiters ไม่เริ่ม budget ของตนเอง
- [ ] ECM rejection เป็น integration error ที่ปลอดภัย ไม่ logout ผู้ใช้ Folio ไม่เผย raw secrets และไม่ resend category/upload/delete หลัง token refresh อัตโนมัติ
- [ ] HTTP integration พิสูจน์ publication/outage/permission/auth concurrency/deadline invariants ด้วย isolated persistence และ ECM HTTP double; browser ตรวจ category/Tag/required controls, keyboard access, native buttons และ protection จริง

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments
