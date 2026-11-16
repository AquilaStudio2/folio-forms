# 08: ตรวจ integrated native journey, selected-revision exports และ release evidence

**What to build:** ปิดวงจรผู้ใช้จริงตั้งแต่ Admin CRUD/authoring/duplicate ไปถึง Draft, Submit, Correction, read-only/export และ deletion บน integration checkout เดียวกัน ตรวจ exports ของ revision ที่เลือก และจัดหลักฐานว่า local behavior, real ONLYOFFICE และ authorized DCM acceptance ผ่านหรือยัง HOLD ส่วนใด

**Blocked by:** 06 — Final Correction ใช้ frozen Storage Template และปกป้องประวัติ; 07 — Response deletion ปลอดภัยต่อ shared file identity และติดตาม cleanup ต่อได้.

**Status:** ready-for-agent

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 100–106, 111–112; integrated acceptance ครอบคลุม stories 1–112 ไม่แทน checks ระดับตั๋วก่อนหน้า

## Acceptance criteria

- [ ] รวม 01–07 และตรวจ behavior บน delivery integration checkout เดียว ไม่ใช้ผล passing ของ worktree/branch แยกมาแทน final integrated result
- [ ] Actual Admin page ทำ persisted list/filter/create/rename/move/delete confirmation ครบ category ID/type semantics ถูกต้อง และไม่มี User/Viewer write access
- [ ] Real ONLYOFFICE external popup ใช้ dependent category/template selects ทั้ง scalar/table, empty/error/reload, Cancel/Escape/focus และ dirty guards ไม่เปลี่ยนเป็น demo/sidebar flow
- [ ] Complete native journey: author/save/publish no-year new-mode Form → duplicate new link → User Save Draft/reopen/replace/Submit → Admin final Correction → selected-revision views/exports → authorized Response deletion/follow-up
- [ ] Legacy published Form/old Draft/Submission/Correction ใช้ contract เดิม ไม่มี file/data migration; catalog changes และ duplicate ไม่เปลี่ยน original link, saved URLs/tokens หรือประวัติ
- [ ] User/Admin/Viewer read-only results ใช้สิทธิ์เดิมและเลือก revision จริง ไม่ทำ upload หรือเปิด mutation controls จากหน้าดู
- [ ] Read-only workbook และ downloaded XLSX/PDF จริงใช้ saved `file_link` แทน attachment buttons ของ revision ที่กำลังดู ไม่ substitute latest/search/path-derived URLs เมื่อประวัติมีปัญหา
- [ ] ตรวจ workbook/export package จริงว่าไม่มี separate file_token fields/hidden metadata/service Bearer/credentials และไม่แก้ canonical editable workbook เพื่อทำ export
- [ ] ส่ง provider URL ตามจริง โดยระบุ caveat ว่า token อาจอยู่ใน query และ URL เป็น public ตาม accepted policy ไม่อ้าง privacy หรือ immutable DCM bytes จาก frozen Folio config
- [ ] Pending File/removal ขัดขวาง export ที่จะทำให้เข้าใจว่าบันทึกแล้ว; export ไม่ upload ไม่ปล่อย fake URL/blob/filename และ ordinary unsaved Fill Download ยังใช้ได้เมื่อไม่มี attachment change ค้าง
- [ ] Native scalar/table docs_number change ไม่ต้องเปิด picker เพื่อเลือกไฟล์เดิมใหม่ ได้ exact original bytes จาก DCM-only flow; same-identity overwrite ไม่ DELETE ซ้ำ และ cleanup failure หลัง B commit แสดง warning ค้าง
- [ ] UI controls มี labels, keyboard access, correct focus และ slot/row-specific safe errors; User เห็น unknown-outcome hold ต่างจาก successful save with cleanup warning
- [ ] Existing HTTP integration suites และ affected native/UI checks ผ่านแบบรวม ครอบคลุม catalog races, persisted modes, global names, original bytes/limits, physical rows, protected history/shared identity และ no automatic write retries
- [ ] Before release มี authorized DCM evidence ของ supported original-download flow ทุก in-scope file type/boundary, filename ที่มีขีด/extensionless, actual object receipt และ same-token/link no-extra-DELETE; ใช้ synthetic fixtures ตรวจ collision ก่อน write และไม่ retry unknown writes
- [ ] หากยังไม่มีสิทธิ์ live API หรือ provider capability/settlement proof ที่ต้องใช้ ให้รายงาน exact missing prerequisite, tested/untested และ HOLD release ไม่เรียก live ด้วยสิทธิ์เก่าที่หมดขอบเขต ไม่ขอคำตอบข้อ 1–3 ซ้ำ และไม่ลด all-type/DCM-only/CRUD scope
- [ ] เตือน duplicate-name/shared-URL limitation ก่อนเปิดใช้ ไม่อ้างว่าไฟล์ทุกช่อง/แถว independent; ownership/history guards และ safe conflict rejection ยังคงทำงาน
- [ ] ปิด traceability ของ stories 1–112 และ acceptance ทุกตั๋ว ระบุ observed verification กับ outstanding human/provider approval แยกกัน ไม่ mark resolved จากเอกสารหรือ test count เพียงอย่างเดียว
- [ ] อัปเดต domain/workflow/system map พร้อม generated outputs ตาม repo convention เปิดตรวจ rendered guide จริง และใช้ root scripts ตรวจ format/lint/type/build ที่เกี่ยวข้องก่อน commit
- [ ] นำ throwaway probes/fixtures/services ที่สร้างเฉพาะรอบทดสอบออกหลังเก็บ sanitized evidence ไม่เก็บ credentials/tokens/private receipts ใน public repo และไม่กระทบ runtime/ข้อมูลที่ผู้ใช้มีอยู่ก่อน

## Notes

06 มี dependencies 04/05 ซึ่งรวม 03/02/01 อยู่แล้ว จึงไม่เพิ่ม redundant blocking edges; 07 เป็น deletion/follow-up path ที่ต้องผ่านเพิ่ม ไม่มีความจำเป็นให้ 04 กับ 05 block กันเอง

ตั๋วนี้เป็น integrated behavior/export/native acceptance ไม่ใช่สิทธิ์ postpone validation, identity safety หรือ docs ของตั๋วก่อนหน้า การปิดงานไม่เท่ากับ production deployment approval

## Comments
