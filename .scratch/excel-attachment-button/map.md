# แบ่งงาน Excel attachment POC

รายละเอียดและ decision log: [spec.md](spec.md)

| Ticket | ผู้รับผิดชอบ | สถานะ |
| --- | --- | --- |
| [01 ปลั๊กอินวางปุ่ม](issues/01-plugin-placement.md) | sol_worker: button_scope | resolved |
| [02 ปุ่มในแถวใหม่](issues/02-row-projection.md) | sol_worker: storage_audit | resolved |
| [03 ตรวจระบบจริงและรีวิว](issues/03-verification.md) | Agent หลัก → sol_reviewer | resolved |

งานเพิ่มเติมตามคำสั่งล่าสุด: [04 ทดลองเลือกไฟล์จริง](issues/04-local-file-picker.md) — resolved; plugin / host / Agent หลัก / reviewer

ขอบเขตล่าสุด: ผู้ใช้อนุญาต local file picker ใน ticket 04 เพิ่มจากรอบแสดงปุ่ม หยุดก่อน upload API, save attachment, export URL หรือแก้ไข/ลบไฟล์ที่บันทึกแล้วจนกว่าผู้ใช้จะสั่งเฟสถัดไป งานเก็บไฟล์ต้องใช้ API ภายนอกตั้งแต่แรกตามคำตอบผู้ใช้

ผลทดสอบ: [verification.md](verification.md) · วิธีทดลองพร้อมภาพ: [usage.md](usage.md)

งานลดขั้นตอน Admin: [05 วางปุ่มพร้อมสร้างช่องในคลิกเดียว](issues/05-one-click-admin.md) — resolved

แก้ Admin picker หลังวางปุ่มใหม่: [06 ตรวจ binding ล่าสุด](issues/06-admin-picker-current-bindings.md) — resolved

ตรวจช่องที่ตำแหน่งหาย: [07 ระบุช่องและวิธีผูกกลับ](issues/07-missing-anchor-placement.md) — ซ่อมฟอร์มจริงต่อใน ticket 08

งานปัจจุบัน: [08 วางปุ่มพร้อมบันทึกต้นแบบก่อนเลือกไฟล์](issues/08-save-before-pick.md) — resolved; ซ่อม 6/7 และทดสอบเปิดฟอร์มใหม่ผ่าน

งานเลือกและลบปุ่ม: [09 คลิกปุ่มเพื่อดู Title/Tag และลบช่อง](issues/09-select-delete-button.md) — resolved; คลิกเลือกจริง ลบช่องเดี่ยว/คอลัมน์ เปิดใหม่ และ reviewer ผ่าน

งานบันทึกเบื้องหลัง: [10 วางปุ่มโดยไม่เปิด Excel ใหม่](issues/10-background-placement-save.md) — resolved; สร้างต่อเนื่อง ตรวจไฟล์จริง และเปิดใหม่ครบ 8 ปุ่ม พร้อม reviewer ผ่าน

งานบันทึกและลบ: [11 บันทึกแบบร่างและลบช่องโดยไม่เปิด Excel ใหม่](issues/11-preserve-manual-save-delete.md) — resolved; manual Save และลบจนเหลือศูนย์ผ่านใน iframe เดิม เปิดใหม่ข้อมูลครบ และ reviewer ผ่าน
