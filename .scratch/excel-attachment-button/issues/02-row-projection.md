# สร้างปุ่ม POC ตามแถวในเอกสาร Excel

Type: prototype Status: resolved

Owner: sol_worker / storage_audit

## ขอบเขตไฟล์

`apps/server/src/documents/spreadsheets/` และจุดเชื่อม server/test ที่จำเป็น ห้ามแก้ plugin พร้อม worker 01

## ผลที่ต้องได้

- Shared native projector/constants สำหรับ plugin และ document builder
- Marker `_folio_upload_poc_<bindingId>` อ้างตำแหน่ง scalar/column ที่มีการตั้งค่าแล้ว ใช้ GUID แยกจากตัวอย่างที่อัปโหลดได้
- Save/publish/เริ่มกรอก/เพิ่มแถวคงการแสดงปุ่ม และสร้างปุ่มในแถวใหม่ครบโดยไม่ซ้ำ
- ลบ/แทนเฉพาะภาพและ OLE ที่ระบบ POC จัดการขณะสร้างเอกสารใหม่ รักษา drawing, สูตร, ค่า และ style อื่น
- คง object protection เดิม; ไม่เปลี่ยน FieldType, ระบบเก็บไฟล์, upload API หรือ export URL

## ตรวจรับ

Unit tests สำหรับ markers/invalid bindings/การไม่แตะ drawing อื่น และ native ONLYOFFICE runtime สำหรับเพิ่มแถว/จำนวนปุ่ม/ค่า/การเปิดกลับ ตรวจ format/lint และ types

## Comments

การบันทึก Draft ภายใน Add row ยังคงเป็นพฤติกรรมเดิม ไม่มี pending File หรือการอัปโหลดให้กระตุ้นใน POC นี้

ตรวจรับเสร็จ 22 ต.ค. 2026: ดู [ผลตรวจและหลักฐาน](../verification.md) รอบนี้หยุดที่ POC ไม่มีงานอัปโหลดจริง
