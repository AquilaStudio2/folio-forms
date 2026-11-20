# 06 — จำแนกและซ่อม Template Draft เดิมที่ bindings ไม่ตรง workbook

Status: needs-triage  
Type: task  
Priority: P2  
Blocked by: 05  
Evidence: [A1–A3](../map.md#1-ต้นเหตุและหลักฐาน), [R8](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3)

## ขอบเขต

เริ่มจาก read-only classifier และ repair ใน Admin editor สำหรับ Template Draft เท่านั้น. แยก intentionally unbound, missing/broken name, missing/ambiguous column tracking, mismatched marker/OLE/validation และ mapping เก่าที่พิสูจน์ไม่ได้. ตรวจเส้นทาง Duplicate ว่าไม่คัด mismatch โดยไม่แจ้ง; ให้ต้นฉบับยังเปิดอ่านได้. ประเมินเวลา/ขนาดของ rollback snapshot บนช่วงใหญ่ก่อนกำหนด limit. ไม่ทำ bulk remediation หรือแก้ Published Template/Response history

## เกณฑ์รับงาน

- [ ] Synthetic fixture ครบ valid, intentionally incomplete, missing scalar/table anchor, duplicate/legacy same-width reorder, invalid marker และ draft ที่ซ่อมแล้ว; classifier ไม่เขียนข้อมูล ไม่เปิดเผย token/URL และไม่ฟันธงช่องกรณีหลักฐานไม่พอ
- [ ] Admin เห็น binding ที่เสียและเลือกช่วงที่ยืนยันเอง หรือ revert เฉพาะ revision ที่พิสูจน์ได้เมื่อระบบมีหลักฐาน; ซ่อมผ่าน commit point 05 เท่านั้น. Error ไม่ปิดทางดูข้อมูลเดิมหรือ recovery
- [ ] Verify rebind/repair ทั้งสำเร็จ, ยกเลิก, fail และ concurrent stale base; ไม่จับคู่ด้วย Tag/offset/ปุ่มอย่างเดียว. Duplicate กรณีผิดปกติไม่สร้างสำเนาที่ผู้ใช้เข้าใจว่า valid
- [ ] ทดสอบช่วงใหญ่ใน sandbox และบันทึกข้อจำกัดที่วัดได้. จะสแกนหรือซ่อมข้อมูลจริงต้องขออนุญาตแยก

## Comments

- วางแผน repair สำหรับข้อมูลเก่าแยกจากการป้องกัน regression ใน 05
