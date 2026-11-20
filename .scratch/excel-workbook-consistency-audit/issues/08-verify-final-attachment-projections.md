# 08 — ตรวจ final XLSX เทียบ receipt และ physical row ก่อน commit

Status: resolved  
Type: task  
Priority: P2  
Blocked by: —  
Evidence: [R6](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3)

## ขอบเขต

ตรวจ workbook หลัง Builder/overlay เทียบ canonical attachment plan ที่ server สร้าง: binding, physical row, cell value และ hyperlink รวม removed slots. แยก assertion ของ effective routing ตามกติกาเดิมและ decision 09; ไม่ถือ URL ที่ผู้ใช้พิมพ์เองเป็น receipt หรือเปลี่ยน identity policy. ใช้กับ User Draft/Submit, internal row/project transitions และ final Correction ที่เปลี่ยน workbook. อ่านผลของ upload ที่ส่งไปแล้วตาม original Operation หาก validation หลัง dispatch ล้ม

## เกณฑ์รับงาน

- [x] Fixture สองคอลัมน์, gap, hidden row/column, merged scalar, retained/replaced/removed attachment และ last-row guard. สลับ URL/physical row หรือเอา hyperlink ออกหลัง rebuild แล้ว commit ต้อง fail; ก่อนหน้าต้องยังอ่าน/เทียบ hash ได้
- [x] Valid cases ให้ persisted XLSX, JSON และ refs ตรงกัน; internal saves ไม่มี provider upload/DELETE. Verify protection และ old history ไม่เปลี่ยน
- [x] Fault หลัง provider dispatch ไม่ทำให้เกิด resend; receipt/cleanup ตาม machinery เดิม. Native Builder และ HTTP regression วัด final bytes และ refs แยกจาก status

## Comments

- เป็นช่องว่างของ final validation ไม่ใช่รายงานว่าไฟล์ผู้ใช้ปัจจุบันผิด
- รวม `8d3da47`. สอง fault probes ผ่าน native Builder: เปลี่ยน final projection ให้ผิดแล้ว server ปฏิเสธ commit; canonical SHA-256, JSON และ refs เดิมคงอยู่; ไม่ upload ซ้ำและ cleanup เฉพาะ receipt ใหม่ที่ไม่มี refs. 15 targeted HTTP cases ผ่าน. ไม่ถือว่าทดสอบทุก permutation ของ browser/geometry
