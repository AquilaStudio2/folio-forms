# 02 — Saved viewer ต้องอ่านเฉพาะ workbook ที่ commit

Status: needs-triage  
Type: task  
Priority: P1  
Blocked by: —  
Evidence: [R2](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3)

## ขอบเขต

กำหนดทางอ่านของ saved XLSX viewer ให้ผูกกับ artifact ที่ commit แล้วตั้งแต่ config และไม่ใช้ staged-first resolver. ครอบคลุม Admin/Viewer Results และ saved Response Draft ที่ owner เปิดดู. ตรวจ caller ของ document resolver ทั้งหมดก่อนแก้; ไม่เปลี่ยน Builder, capture, editable Correction workspace หรือ live export ซึ่งมีคนละสัญญา

## เกณฑ์รับงาน

- [ ] ใช้ fixture ที่ committed workbook กับ staged workbook ต่าง hash. ตอน active Operation, คำขอ saved viewer ได้ bytes ของ committed revision เดิมเท่านั้น; หลัง Operation fail ยังได้ฉบับเดิม
- [ ] ถ้า canonical pointer ขยับระหว่าง config กับ download ให้ได้ snapshot ที่ pin ไว้หรือ error ของ snapshot นั้น ไม่คืน bytes ของ revision ใหม่แทน
- [ ] ยืนยัน existing auth, role/ownership, expiry, native opening, read-only protection และ attachment projection ต่อเนื่อง. Builder และ editable workspace ยังใช้ snapshot ที่ workflow อนุญาต
- [ ] ทดสอบ sandbox HTTP และ browser saved viewer อย่างน้อย Draft + historical revision. วัด hash/ค่าเซลล์ ไม่ใช้ `200` อย่างเดียว

## Comments

- Audit ยืนยัน `viewer bytes: staged; committed pointer unchanged: true` บน synthetic non-ECM active Operation
