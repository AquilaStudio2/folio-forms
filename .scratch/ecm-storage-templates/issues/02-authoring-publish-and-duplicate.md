# 02: ตั้ง Storage Template ใน popup และตรึงสัญญาเมื่อเผยแพร่ Form ใหม่

**What to build:** Admin ใช้ปุ่มแนบไฟล์ Excel และ external popup เดิม เลือก category แล้ว Storage Template ที่สัมพันธ์กัน บันทึก Template Draft และเผยแพร่ snapshot ที่ไม่เปลี่ยนตาม catalog ภายหลัง เปลี่ยน routing โดยทำสำเนาเป็น Form/link ใหม่ ไม่แก้ต้นฉบับ

**Blocked by:** 01 — Admin จัดการ Storage Template catalog ครบ CRUD.

**Status:** ready-for-agent

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 23–49

## Acceptance criteria

- [ ] เพิ่ม storage mode และ category/template metadata ใน Draft Field Rules และ published Manifest/Spreadsheet Contract ตาม lifecycle เดิม ไม่ใส่ routing metadata ใน placement-only Excel Binding
- [ ] Existing Published Templates/Responses ระบุ legacy mode ได้โดยไม่เปลี่ยน saved values, request policy หรือ files และไม่เดา mode จากการมี `fiscal_year`
- [ ] Existing external popup ให้เลือก category ก่อน template และแสดงเฉพาะ mappings ของ numeric category ID ที่เลือก User ไม่ได้สิทธิ์เลือกปลายทางและไม่มี template answer Tag ใหม่
- [ ] หมวดที่ไม่มีแม่แบบเลือกไม่ได้ เปลี่ยนหมวดแล้วล้าง incompatible template; โหลดใหม่หลังย้าย/ลบรายการสุดท้ายไม่คง option ผิดหมวด
- [ ] Confirm ใช้ได้เมื่อทั้งคู่ valid; loading/error/empty ยืนยันไม่ได้ Cancel/Escape ไม่สร้าง/แก้ Field หรือ button และคืน focus ตาม interaction เดิม
- [ ] Backend ตรวจ current mapping ID/category/name กับ catalog ปฏิเสธ forged, renamed, moved หรือ deleted selection ที่ stale แม้ UI เคยโหลดถูกต้อง
- [ ] รักษา auto-tags, label/required edits, stable binding, native saved-button proof, lease/revision checks, authoring lock และ dirty/navigation guards ตลอด multi-step save
- [ ] Scalar เก็บ choice ต่อ Field; table เก็บ choice ต่อ attachment column และใช้ร่วมทุกแถว ไม่สร้างตัวเลือกรายแถว
- [ ] Template Draft บันทึก config ที่ยังไม่ครบได้โดยไม่ทิ้งงาน แต่ publish แบบใหม่ต้องเลือก current valid mapping ครบทุก attachment Field/column
- [ ] New-mode publication ต้องมี exactly one scalar root `docs_number`; ไม่บังคับ `fiscal_year` จาก attachment prerequisite และไม่ต้องมี User-entered values ในต้นแบบ คง Field validation อื่นตามเดิม
- [ ] Publish ตรวจ local catalog และ revision อย่าง race-safe ขณะแก้/ลบ mapping; ตรึง storage mode/category ID/template name ไม่ live lookup master มาเปลี่ยน published routing ภายหลัง
- [ ] Saved valid mapping publish ได้เมื่อ category provider ล่มโดยไม่บังคับ live recheck; stale local mapping ต้องเลือกใหม่ ไม่ clear Draft หรือ silently follow rename
- [ ] Catalog rename/move/delete หลัง publication ไม่แก้ Published Template, Responses, URL/token หรือ files; published attachment settings ไม่แก้ในที่เดิม
- [ ] Duplicate ได้ Form และ share link ใหม่ คัดเฉพาะ template/configuration ไม่คัด Responses/answers/files และไม่ redirect/archive/delete ลิงก์ต้นฉบับ
- [ ] สำเนาจาก legacy Form ต้อง explicitly เลือก current Storage Template ก่อน new-mode publication ไม่สร้าง mapping จาก category name โดยเดา; valid copied new-mode choice ยังตรวจ current catalog ก่อนเผยแพร่
- [ ] Existing HTTP authoring/publication seam พิสูจน์ server validation, snapshot isolation, rename/move/delete races, offline publication, no-year publication และ legacy/duplicate preservation
- [ ] Smoke actual ONLYOFFICE popup ทั้ง scalar/table, cancel/confirm, save/reopen/publish และเปิด link ของสำเนาใหม่; ไม่ถือ plugin mock หรือ HTTP status อย่างเดียวเป็น native proof
- [ ] อัปเดต affected bridge/API callers, fixtures และ workflow/domain/system-map documentation ใน change เดียวกัน ไม่เริ่ม upload จาก authoring/catalog/publish

## Notes

Storage mode ใหม่มีอยู่ใน published contract หลังตั๋วนี้ ส่วน file persistence path เป็นงาน 03 ห้ามนำ Form ทดสอบใหม่ไปเปิดให้ User ใช้ upload จริงก่อน behavior ของตั๋ว 03 และ acceptance ที่เกี่ยวข้องครบ Existing legacy fill path ต้องยังทำงาน

ข้อ 1–3 ปิดแล้ว ไม่ขอเปลี่ยน storage choice หรือเพิ่ม PM folder-label approval gate

## Comments
