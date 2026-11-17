# แผนตัดสินใจความปลอดภัยไฟล์แนบตารางและ DCM

Labels: wayfinder:map
Created: 2026-11-18

## Destination

จำแนกความเสี่ยงที่เหลือทั้งหมด พร้อมคำถาม ผู้ตัดสิน และหลักฐานที่ต้องมี ก่อนอนุมัติ implementation รอบถัดไป ไม่ใช่แก้ความเสี่ยงหรือรับรอง release ใน session นี้

## Notes

- งานนี้เป็น planning-only หลัง commit `67409b5` บน `feat/ecm-storage-templates` ตาม context ส่งต่อ ไม่ใช่ deployed revision ของ Folio หรือ DCM ไม่มีการทดลอง DCM ใหม่หรือแก้ application/schema/migration ในงาน charting นี้
- ข้อเสนอป้องกันชื่อชนข้าม save มีเจ้าของแยกที่ [สเปกชื่อปลายทางไฟล์ใหม่ข้ามรอบบันทึก](spec.md) ไม่คัดลอก filename/reservation contract มาตัดสินซ้ำใน map นี้
- อ่าน skills wayfinder, grilling และ domain-modeling ก่อนทำ decision; ใช้คำใน [CONTEXT.md](../../CONTEXT.md) โดยแยก Template Draft, Published Template, Draft, Submission และ Correction การตั้งชื่อไฟล์ไม่เพิ่ม row identity ใหม่
- คง [ADR 0003: Use live PDMS choices with saved project-name answers](../../docs/adr/0003-pdms-project-name-choices.md) และ [ADR 0004: Filter current Responses through designated scalar Field Tags](../../docs/adr/0004-results-filters-use-scalar-field-tags.md) ไม่เปลี่ยน project-name identity หรือความหมาย scalar `fiscal_year` ผ่านงาน attachment
- [หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง](../ecm-storage-templates/planning.md#หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง) ยืนยัน wildcard routing ปี/หมวดแล้ว: `กทอ.68* ก่อหนี้-8 *`, `กทอ.67* ขอเบิก2 *` และกรณีก่อนหน้า `กทอ.67*ก่อหนี้-4*` เข้าปี 2567 / `2. มติและการก่อหนี้` คง whitespace ตามต้นฉบับ ไม่ถามหรือทดสอบการมี routing ซ้ำ ไม่อนุมาน full path หรือ implementation ของ provider
- [พฤติกรรมปุ่ม Upload/DCM ภายในตาราง XLSX](../ecm-storage-templates/table-upload-behavior-audit.md) มี 64 cases เป็น snapshot วันที่ 2026-11-17 ที่อ้าง HEAD `0a12d91a5b72d4470ae9ceed1c3d4845d2103ced` พร้อม Working Tree และ amendment ภายหลัง ไม่ใช่ผลตรวจใหม่บน `67409b5` หรือ Production ให้รักษาขอบเขต source/native/HTTP แยกกัน
- ใช้ existing HTTP integration เป็นหลักตามที่ผู้ใช้อนุมัติแล้ว: actual app + isolated DB/store + controlled provider ตรวจ saved JSON, XLSX และ exact bytes ตามแนว [BATCH evidence](../ecm-storage-templates/acceptance-matrix.md#batch-filename-verification) และ `apps/server/test/http/ecm-scalar-save-submit.test.ts` ไม่ขออนุมัติ seam นี้ซ้ำ Native editor และ real-provider acceptance ใช้เฉพาะขอบเขตที่ HTTP พิสูจน์ไม่ได้ และต้องมีขอบเขตการเขียน/ลบที่อนุมัติแยก
- ข้อจำกัดที่ยอมรับแล้วและยังใช้ต่อ: [สิทธิ์ไฟล์และการแก้ไขหลังส่งคำตอบ](../ecm-attachments/issues/06-history-access.md#resolution--2026-11-12--ยืนยันร่วมกับผู้ใช้) เป็นเจ้าของ public-link policy; [ยืนยันสัญญา ECM ที่เอกสารยังไม่ตอบ](../ecm-attachments/issues/09-provider-contract-evidence.md#resolution--2026-11-12--pyw1tt--คำชี้แจงสัญญาและขอบเขตจากผู้ใช้) และ [ข้อสรุป Storage Templates ล่าสุด](../ecm-storage-templates/planning.md#สถานะคำถามปัจจุบัน) เป็นเจ้าของข้อจำกัด same-destination overwrite/DCM-only ผู้มี URL อาจเปิดนอก Folio ได้ และการแก้/ลบไฟล์ใน DCM ภายนอก Folio อาจเปลี่ยน bytes หรือทำให้ประวัติเปิดไม่ได้ Frozen Folio JSON ไม่ทำให้ external bytes immutable ไม่เปิด private-link หรือสำเนา originals อีกแห่งเป็นคำถามใหม่

### Tracker และ next frontier

- Map เป็น index เท่านั้น รายละเอียดอยู่ใน child tickets ใต้ `issues/` ซึ่งมี `Parent: ../map.md` ใช้ Labels เฉพาะ `wayfinder:*`; ไม่มี Status คือเปิด และ Assignee ว่างคือยังไม่ claim ตาม [convention เดิม](../ecm-attachments/map.md#วิธีทำงานใน-local-markdown-tracker)
- หา frontier จาก children ที่ไม่มี Status, Assignee ว่าง และ blockers ทุกตัว resolved แล้ว เรียงหมายเลขชื่อไฟล์; `Blocked by` ใช้เลข local effort นี้ ไม่ใช้ triage labels
- จุดเริ่ม session ถัดไปคือ [หลักฐาน DCM แยกไฟล์ชื่อเติมเลขและคง original bytes](issues/01-provider-independent-resources.md) ยังต้องทำร่วมกับ human/provider ไม่ใช่อนุญาต live calls อัตโนมัติ Child ที่ไม่มี blocker อื่นคุยได้โดยไม่ต้องรอเรียงครบทุกใบ
- Charting นี้ไม่ claim ไม่ resolve และไม่ถือคำถามหรือแนวแนะนำว่าได้รับอนุมัติ คำตอบต้องเกิดจาก human/provider ใน session ถัดไป ไม่สร้าง research branch/push เพื่อจัดหมวดคำถาม

## Decisions so far

ยังไม่มี decision ของ effort นี้ที่ resolved หรือ approved ข้อตกลงเดิมใน Notes เป็น standing constraints ไม่ใช่ผลตัดสินใหม่

## Not yet specified

ยังไม่มีความเสี่ยงที่เห็นแล้วแต่ตั้งคำถามไม่ได้ ประเด็นที่ทราบถูกแยกเป็นแปด child decisions แล้ว เมื่อหลักฐานใหม่เผยข้อจำกัดที่ยังระบุไม่ได้ ให้บันทึก fog ที่นี่ก่อนแตก ticket ไม่ซ่อน known risk ไว้ใน fog

## Out of scope

- การแก้ code, schema, migration, เปลี่ยนข้อมูล/ไฟล์จริง, ทดลอง API จริง, push หรือ deploy ใน charting session นี้
- การตัดสินหรือ implementation ชื่อข้าม save ซ้ำกับสเปกที่ลิงก์ไว้ รวมการกำหนด persistence constraint ละเอียดก่อนอนุมัติพัฒนา
- การเปิดคำถามเดิมเรื่อง DCM-only originals, หนึ่งไฟล์ต่อ slot, public-link/private-storage redesign, legacy UUID/Published contracts, category-label-to-folder equivalence หรือการมี wildcard routing
- การประกาศ Production เสียหายจาก local reproduction หรือประกาศ provider/release ผ่านจาก source, test double, HTTP 200, token ต่างกัน หรือจำนวน tests เพียงอย่างเดียว
