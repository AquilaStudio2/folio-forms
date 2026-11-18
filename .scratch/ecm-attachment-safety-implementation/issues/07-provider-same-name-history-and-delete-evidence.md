# 07: หลักฐาน DCM สำหรับ same-name receipts และ history/DELETE isolation

**What to build:** รวบรวมหลักฐานจริงภายใน scope ที่อนุญาตว่า uploads ชื่อฐานเดียวกันอ้างไฟล์ของแต่ละคำขอและไม่เปลี่ยน surviving originals รวม DELETE isolation เฉพาะเมื่อได้รับอนุญาตแยก ให้ pyw1tt ตรวจรับโดยไม่ใช้ simulation หรือ sample เดียวรับรองทั้ง provider

**Blocked by:** 01 — ส่งชื่อเดิมได้ พร้อม receipt และคำเตือนถูกประเภท.

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US84, US90; Testing Decisions C.1 และ approved resource/history evidence plan

**Execution prerequisites:** ต้องมีคำสั่งเริ่มงานหลังตรวจตั๋ว และ real-provider account/environment/synthetic destination/write scope/ownership-collision boundary/stop conditions/cleanup owner ที่อนุญาตจริง การอนุมัติตั๋วไม่ขยายเป็น DELETE หรือการทดลองกับข้อมูลใช้งานจริง

## Acceptance criteria

- [ ] เริ่มจาก isolated naming/receipt/history proof ของตั๋ว 01 ที่ผ่านแล้ว ไม่ต้องรอ browser/loading ทั้งชุดใน 06 จึงไม่มี dependency ต่อ 06 แต่ต้องบันทึก local source และแยก local result จาก provider observations
- [ ] ใช้แผนชื่อฐานซ้ำตาม latest human decision ไม่เรียกคืน generated suffix/counter/timestamp/reservation หรือ suffix-routing HOLD ที่ superseded
- [ ] Real API พิจารณาได้เฉพาะฐาน กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45) โดย root docs_number และ frozen template ตรง scope นี้ Extension ใช้ของ File ตาม contract ไม่สลับ project/template/ชื่อทดสอบเพื่อหลบ known files หรือ unknown
- [ ] ก่อน write ยืนยัน authorized boundary ของ account/environment/destination และการจัดการ known same-name files จากหลักฐานเดิม ไม่ถือ search ว่างว่าปลอดภัย และไม่ถือไฟล์ที่พบเป็น disposable synthetic fixture ของงานนี้โดยเดา
- [ ] ใช้ synthetic files ที่แยกกันตาม approved plan เก็บ original request-to-receipt correlation และตรวจ saved references/old originals ก่อนและหลัง upload/reopen/retrieve เท่าที่ scope อนุญาต ไม่ adopt search-by-name/latest เป็น receipt ของคำขอ
- [ ] หลักฐาน independence/history ใช้ original bytes/size/digest ตาม approved plan เจ้าของเรื่องนี้ ไม่ใช้ token ต่างกัน จำนวนรายการเพิ่ม หรือ HTTP 200 อย่างเดียว การตรวจนี้ไม่ใช่การเพิ่ม byte-comparison กลับเข้า type/size ticket 08
- [ ] Same-name scalar/table/revision claims และ literal text/extension/casing/extensionless claims ระบุเฉพาะที่ทดลองจริง หาก scenario ต้องเปลี่ยน docs_number/template ออกนอกฐานที่อนุญาต ให้ provider cell pending ไม่สร้าง scenario สำรองเอง
- [ ] Existing PDF sample ที่ old originals สามรายการคง 26,275 bytes/digest และ new original 667 bytes ตรง fixture ถูกอ้างเป็น historical scoped evidence เท่านั้น ไม่ทดลองซ้ำเพื่อยืนยันคำรายงานเดิม ไม่ขยายเป็น every-type/template/concurrency/deployed guarantee
- [ ] DELETE isolation ตรวจได้เมื่อมี authorization แยกเท่านั้น ลบเฉพาะ resource ที่พิสูจน์ว่าสร้างใน scope นี้และไม่มี survivor/history/workspace/eligible Operation ใช้ ไม่ลบ shared alias หรือทุกไฟล์ชื่อเดียวกันเพียงเพราะ token ต่าง
- [ ] หาก DELETE ยังไม่มีสิทธิ์หรือ resource ownership/reference proof ไม่พอ ให้คง criterion นั้น pending/HOLD และระบุ prerequisite ไม่ใช้การไม่ทำ DELETE เป็นผลว่าปลอดภัย
- [ ] หยุดเมื่อ bytes ไม่ตรง, unsafe alias/name change, unexpected error หรือ unknown เก็บ original evidence ไม่ auto POST/DELETE retry ไม่เปลี่ยนชื่อส่งใหม่ ไม่ลบไฟล์เก่า และไม่อ้าง rollback external bytes ได้
- [ ] จัด sanitized manifest ระบุ source/environment/date/provider revision เท่าที่ทราบ, original correlation, receipt/reference aliases และ before-after claims ห้าม credentials/raw tokens/private receipt URLs หรือสำเนา original attachment นอก DCM ลง repo
- [ ] แยก supported/partial/conflicting/insufficient/unverified ราย guarantee พร้อม pyw1tt human review และ remaining HOLD การส่งรายงานหรือ approval ของแผนไม่ทำให้ provider acceptance ที่ยังไม่มีผลกลายเป็น PASS

## Scope boundaries

งานนี้เป็น external evidence ไม่ใช่ implementation policy ใหม่ ไม่รอผู้ประสาน DCM เดิมที่ติดต่อไม่ได้ และไม่สมมติว่ามี provider-wide guarantee หรือสิทธิ์ดู logs แล้ว Unknown settlement ยังเป็นตั๋ว 09 และ per-button type/size เป็นตั๋ว 08

ไม่ใช้ accepted residual external-collision risk เป็นสิทธิ์ลบไฟล์ที่ไม่ทราบเจ้าของ ปลด known-reference guards หรือทำ mutation นอก scope

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown/edge 01 และยืนยันกรอบชื่อทดสอบไว้แล้ว การเผยแพร่ตั๋วนี้ยังไม่เรียก DCM หรือ authorize DELETE; ต้องตรวจ execution prerequisites ก่อนลงมือจริง
