# 06 — จำแนกและซ่อม Template Draft เดิมที่ bindings ไม่ตรง workbook

Status: resolved  
Type: task  
Priority: P2  
Blocked by: 05  
Evidence: [A1–A3](../map.md#1-ต้นเหตุและหลักฐาน), [R8](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3)

## ขอบเขต

เริ่มจาก read-only classifier และ repair ใน Admin editor สำหรับ Template Draft เท่านั้น. แยก intentionally unbound, missing/broken name, missing/ambiguous column tracking, mismatched marker/OLE/validation และ mapping เก่าที่พิสูจน์ไม่ได้. ตรวจเส้นทาง Duplicate ว่าไม่คัด mismatch โดยไม่แจ้ง; ให้ต้นฉบับยังเปิดอ่านได้. ประเมินเวลา/ขนาดของ rollback snapshot บนช่วงใหญ่ก่อนกำหนด limit. ไม่ทำ bulk remediation หรือแก้ Published Template/Response history

## เกณฑ์รับงาน

- [x] Synthetic fixture ครบ valid, intentionally incomplete, missing scalar/table anchor, duplicate/legacy same-width reorder, invalid marker และ draft ที่ซ่อมแล้ว; classifier ไม่เขียนข้อมูล ไม่เปิดเผย token/URL และไม่ฟันธงช่องกรณีหลักฐานไม่พอ
- [x] Admin เห็น binding ที่เสียและเลือกช่วงที่ยืนยันเอง หรือ revert เฉพาะ revision ที่พิสูจน์ได้เมื่อระบบมีหลักฐาน; ซ่อมผ่าน commit point 05 เท่านั้น. Error ไม่ปิดทางดูข้อมูลเดิมหรือ recovery
- [x] Verify rebind/repair ทั้งสำเร็จ, ยกเลิก, fail และ concurrent stale base; ไม่จับคู่ด้วย Tag/offset/ปุ่มอย่างเดียว. Duplicate กรณีผิดปกติไม่สร้างสำเนาที่ผู้ใช้เข้าใจว่า valid
- [x] ทดสอบช่วงใหญ่ใน sandbox และบันทึกข้อจำกัดที่วัดได้. จะสแกนหรือซ่อมข้อมูลจริงต้องขออนุญาตแยก

## Comments

- วางแผน repair สำหรับข้อมูลเก่าแยกจากการป้องกัน regression ใน 05
- Admin editor diagnoses the saved bytes and rules together. The diagnostics carry only binding IDs and codes, not references, URLs, or credentials. An unproved draft remains downloadable; Duplicate blocks an unproved Draft source but permits explicit `unbound: true`. Published Template source selection is unchanged.
- Native sandbox fixture: use the synthetic Admin Draft with a table configured for `A1:A2` and no saved table name. Download the saved XLSX first and record its SHA-256. Select `A1:A2` without headers, choose the existing table in “ช่องที่บันทึกแล้ว”, and enter `1` for its column. Cancel by leaving the panel entry before clicking rebind; verify the saved hash is unchanged. Repeat, click “ผูกตำแหน่งใหม่กับช่วงที่เลือก”, then “บันทึกแบบร่าง”. Reopen and verify the diagnostic clears, the tracked column and table names match the chosen cells, and Duplicate succeeds. A local rebind does not change the saved download before Save.
- Rollback snapshot measurement in isolated ONLYOFFICE Builder `9.4.0.1`: three runs per range, median capture only. `1,000×1` uniform: 52,914 bytes / 4 ms. `10,000×10` uniform: 606,811 bytes / 64 ms; alternating formats: 5,628,009 bytes / 81 ms. `25,000×10` uniform: 1,566,811 bytes / 342 ms. The snapshot scans every cell and compresses runs within each row; formatting fragmentation can dominate payload size. No browser bridge, rollback timing or peak-memory measurements; no production limit inferred.
- Sandbox HTTP passed classification, Duplicate, saved download, repair and rejection of failed/stale rebind and removal. Plugin harness passed explicit column selection, cancel, and local-only Apply. Real browser acceptance remains separate from those checks.
- Native Chromium + ONLYOFFICE 9.4 บน integration `b523bb98`: เปิดร่าง A1:A2 ที่ทำให้เสียจริงบน baseline พบค่าตำแหน่งไม่ครบและ Duplicate ถูกบล็อก. กรอกตำแหน่ง `1` แล้ว reload โดยไม่ยืนยัน เลข revision และ SHA-256 เดิมไม่เปลี่ยน. เลือก A1:A2 ให้คอลัมน์ 1 โดยตรงและกด rebind: hash ยังเดิมจน Save. หลัง Save revision 1 เป็น 2, reopen ไม่เตือนและ Duplicate สำเร็จ
