# 05 — Commit XLSX Template Draft พร้อมกันทั้ง bindings และ workbook

Status: needs-triage  
Type: task  
Priority: P1  
Blocked by: 01, 02  
Evidence: [A1–A3](../map.md#1-ต้นเหตุและหลักฐาน)

## ขอบเขต

เปลี่ยน Admin XLSX mutation ให้ใช้สัญญาจาก 01 ทุก caller: create/edit scalar, merged scalar, date/dropdown/validation, picture, table/column, PDMS source, attach/place/convert/change category/promote, delete, repair/rebind และ native tracking. ตรวจ candidate workbook และผูกกับ draft/base revision; เปลี่ยนชุด bindings, artifact pointer/hash, revision และ Operation ใน DB transaction เดียว. คง fail-closed scope/recovery และข้อจำกัด Publish เดิม. ตัดเส้นทางที่เขียน canonical metadata ล่วงหน้าออกเมื่อ migrate ครบ. ไม่แก้ DOCX หรือประวัติเดิม

## เกณฑ์รับงาน

- [ ] Red-before: ordinary `A1:A2` และ scalar เปิดใหม่หลัง Apply ก่อน Save; attachment auto-save fail และ lost ACK. Green-after: อ่านได้คู่เก่าหรือคู่ใหม่ครบเท่านั้น; ไม่เกิด metadata ใหม่กับ workbook เก่า
- [ ] Inject failure ก่อน/หลัง write artifact, callback, DB transaction และ ACK รวม delayed/replayed callback, stale tab/lease และสอง editor openings. ไม่มี success ก่อน commit, ไม่มี replay, ไม่มี rollback ทับ revision ใหม่; old snapshot ยังอ่านได้และ object กำพร้ามี cleanup intent
- [ ] Native browser: ทั้งลำดับสร้างปุ่ม/ตาราง, บันทึกใหม่, เปิดใหม่, ลบ, แก้ geometry, Publish และ Duplicate จาก snapshot ที่บันทึกแล้ว. กรณี intentionally incomplete ยัง Save ได้ แต่ Publish ถูกปฏิเสธตาม contract; broken placement ไม่ถูกบันทึกเหมือน binding ที่ valid
- [ ] ข้อความแยก “ค่ารอ Save” กับ “บันทึกแล้ว”; ปิด/รีเฟรช/reconnect ไม่อ้างว่าจะกู้ editor-only work ที่ยังไม่ persisted. อัปเดต system map ตาม workflow maintenance

## Comments

- ไม่ใช้ auto-save เพิ่มเป็นวิธีแก้หลัก; auto-save ที่มีอยู่ต้องผ่าน commit point เดียวกัน
