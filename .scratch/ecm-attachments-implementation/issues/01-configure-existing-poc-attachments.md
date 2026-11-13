# 01: ตั้งค่าช่องแนบจากปุ่ม PoC เดิม

**What to build:** ต่อยอดกลไกสร้างปุ่ม PoC และ Field settings เดิมให้ Admin กำหนดช่องแนบ scalar/column, Document Category, required และ Tag ได้จริง พร้อม Folio-only ECM authentication ที่ category picker ใช้ผ่าน server พัฒนาครบจากสัญญาข้อมูลถึงหน้าตั้งค่าและการบันทึก/เผยแพร่ ไม่แยก schema หรือ auth เป็น foundation ที่ยังใช้งานไม่ได้

อ่าน [สเปกเต็มของ Folio Excel ECM/DCM Attachments](../spec.md) ก่อนเริ่ม ทุกข้อจำกัดร่วมและ Testing Decisions ยังคงบังคับใช้ ไม่ลดขอบเขตเหลือเฉพาะ happy path หรือรายการ stories ของตั๋วนี้

**Blocked by:** None (can start immediately).

**Status:** resolved

**User stories:** 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 106, 107, 108, 109, 110 ในสเปกเต็ม เป็น primary coverage ของตั๋วนี้

## Acceptance criteria

- [x] สร้างปุ่มด้วยตำแหน่ง/binding และ automatic attachment_N ตามกติกาเดิม; เปลี่ยน Tag ก่อนเผยแพร่แล้ว settings/ปุ่มยังชี้ Field เดิม ไม่เกิดชื่อซ้ำหรือเปิดสิทธิ์ปลด sheet/object protection
- [x] Admin เลือก category จาก GET /api/beeecm/public/document/category ผ่าน server; เก็บ type/name string ต่อ scalar หรือ column ไม่ใช้ id แทนชื่อ ทุกแถวใช้ค่าของ column และ User เปลี่ยนปลายทางไม่ได้
- [x] Template Draft บันทึก configuration ที่ยังไม่ครบได้; publish ต้องมี categories ครบและ scalar root fiscal_year/docs_number อย่างละหนึ่ง Field โดยไม่ต้องมีค่าของ User และไม่มีปุ่ม PoC ที่ไม่ได้ตั้งค่าหรือถูกนำออก
- [x] Saved category คงเดิมเมื่อ API ล่มหรือชื่อเปลี่ยน; publish ด้วยค่าที่เคยเลือกครบได้โดยไม่บังคับ live recheck; เลือกค่าใหม่ไม่ได้จากรายการสมมติ และ published contract แก้ย้อนหลังไม่ได้
- [x] ใช้เฉพาะ ECM_API_URL/ECM_USERNAME/ECM_PASSWORD ฝั่ง server กับบัญชี Folio แยก; ไม่มี Ongoing fallback, browser credentials, token endpoint หรือ ECM login UI; integration ที่ไม่ตั้งค่าไม่ทำให้ Form ปกติหรือ Folio session ใช้ไม่ได้
- [x] Login ตรวจ data.token/data.expire ตามสัญญา; encrypted PostgreSQL cache และ claim/lease/generation เป็น shared truth ข้าม processes ไม่มี DB transaction ค้างระหว่าง HTTP และผลเก่าหรือ late 401 ไม่ล้าง generation ใหม่
- [x] Reuse token เมื่อ verified expiry ครอบคลุม request budget กับ skew; ไม่เดา timezone/อายุ token และกุญแจเข้ารหัสอยู่นอก cache row ผ่าน secret management
- [x] Shared auth job มีไม่เกิน 3 attempts รวมครั้งแรก เฉพาะ transient failures ตามสเปก; 15 วินาทีต่อครั้ง, 30 วินาทีรวม, backoff 1/2 วินาที และ Retry-After ภายใน deadline; permanent errors หยุดและ waiters ไม่เริ่ม budget ของตนเอง
- [x] ECM rejection เป็น integration error ที่ปลอดภัย ไม่ logout ผู้ใช้ Folio ไม่เผย raw secrets และไม่ resend category/upload/delete หลัง token refresh อัตโนมัติ
- [x] HTTP integration พิสูจน์ publication/outage/permission/auth concurrency/deadline invariants ด้วย isolated persistence และ ECM HTTP double; browser ตรวจ category/Tag/required controls, keyboard access, native buttons และ protection จริง

## Verification and handoff

- ใช้ HTTP/application integration seam และ harness เดิมกับ isolated persistence, workbook/callback fixtures และ controlled ECM HTTP provider; ไม่ mock ledger/transactions/cleanup ภายใน ไม่เพิ่ม framework และไม่ถือ provider double แทนหลักฐาน ECM จริง
- ตรวจ browser/native-editor/export surfaces ที่ตั๋วกระทบจริงตามสเปก พร้อมสิทธิ์และข้อมูลทดสอบแยก; live ECM ต้องมีบัญชี Folio เฉพาะ, secure credentials, operator และ authorization ก่อน ไม่ใช้บัญชี Ongoing หรือข้อมูลจริงโดยพลการ
- อัปเดต system map/workflow/domain documentation ที่กระทบใน implementation change เดียวกัน และใช้ build/check/visual review ตาม workflow เดิม รักษา validation, error handling, accessibility และ ONLYOFFICE protection
- สเปกและตั๋วนี้ไม่อนุญาตให้แก้ parent planning map หรือ resolved decision tickets ไม่เปิดใช้บางส่วนแล้วรายงานว่าฟีเจอร์ทั้งหมดเสร็จ

## Comments

### Resolution — 2026-11-14

- รวมงานบน integration branch `feat/ecm-attachments` ด้วย merge `0edb0483456b2683667d472884fef3a2bf38cc83`; source commit `0ccd5c6b90f32babb1bc5a8e09f00a3ce50a2082` และ generated-guide refresh `daf9fbf678a666a3da63c156ec8afd32d7e85a03`
- ตรวจ HTTP authoring ผ่าน 9 กรณี, auth ผ่าน 18 กรณี รวมการรอ PostgreSQL row lock จนพ้น deadline จริง 30 วินาที และ focused plugin ผ่าน 84 กรณี; root format/lint/typecheck/build และ workflow build/check ผ่าน
- ตรวจใน native ONLYOFFICE จริง: ปุ่ม PoC เดิม scalar/สี่แถว, stable binding และ Tag, category/required, บันทึกและเปิดกลับ, incomplete publication, outage/rename retention, publication ขณะ API ล่ม และ duplication boundary; ตรวจ artifact XLSX จริงว่ามี sheet/object/workbook protection ใน Published/Fill
- หลักฐาน isolated-runtime ชั่วคราว: `/tmp/ecm-config-automated-gate-results.txt`, `/tmp/ecm-config-native-result.txt`, `/tmp/ecm-config-merge-complete.txt`; มี screenshots และ XLSX inspections อ้างจาก native report โดยไม่ใช้ข้อมูลจริง
- เพิ่มข้อกำหนด provision `ECM_TOKEN_ENCRYPTION_KEY` ฝั่ง server ผ่าน secret management; ไม่ส่ง credentials/token ไป browser และไม่ใช้บัญชี Ongoing
- ยังไม่เรียก ECM จริงหรือพิสูจน์ upload/delete/zero-byte/encrypted/10 MB กับผู้ให้บริการจริง และยังไม่ push/deploy; นี่คือการปิดงานตั้งค่าตามขอบเขตตั๋ว ไม่ใช่ประกาศว่าฟีเจอร์ทั้งสเปกเสร็จแล้ว
- พบ Fill Download Excel ล้มเหลวหนึ่งครั้งระหว่าง smoke โดยไม่มีไฟล์ที่เลือก; เก็บเป็น integration gate ของงาน scalar/export ที่เหลือ ไม่รันทวนเพื่อยืนยัน ไม่ถือว่าผ่าน และไม่ขยายขอบเขตตั๋วตั้งค่าเพื่อซ่อนปัญหา
