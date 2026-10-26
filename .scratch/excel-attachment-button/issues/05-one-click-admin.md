# Admin วางปุ่มพร้อมสร้างช่องในคลิกเดียว

Type: prototype Status: resolved

Owner: sol_worker button_scope; Agent หลักทดสอบ UI/คู่มือ; sol_reviewer ตรวจ

## คำขอ

Admin เลือกเซลล์แล้วกด วางปุ่มแนบไฟล์ (POC) เพียงครั้งเดียว ให้สร้าง Title/Tag อัตโนมัติและแสดงปุ่มทันที ไม่ต้องกดเพิ่มช่องจากช่วงที่เลือกก่อน

## ตรวจรับ

- เซลล์ที่ยังไม่มี binding: สร้างช่องข้อความ POC ที่มี Title และ Tag ไม่ชนช่องเดิม แล้วแสดงปุ่มในชีตโดยไม่ต้อง Save/Publish ก่อน
- ช่องเดิมหรือคอลัมน์ตารางที่รองรับ: ใช้ binding เดิม ไม่สร้างซ้ำหรือเปลี่ยนชื่อ/Tag ที่มีอยู่
- กดซ้ำไม่ทำให้ช่องหรือปุ่มซ้ำ
- รักษาการตรวจช่วง/การซ้อนทับ/ชนิดข้อมูล และ recovery ของการบันทึก binding; หากยืนยัน binding ไม่ได้ห้ามรายงานว่าสำเร็จ
- แผงตั้งค่าต้องแสดง Title/Tag ที่สร้างและแก้ไขได้ภายหลัง
- การบันทึกต้นแบบยังใช้ปุ่มบันทึกแบบร่างของฟอร์มตามเดิม
- ทดสอบ UI จริงในฟอร์มทดลองแยก และ reviewer ตรวจผล

## ขอบเขต

เปลี่ยนขั้นตอนวางปุ่มของ Admin เท่านั้น ไม่เริ่ม external API, persistent file storage หรือ export URL

## Comments

UI จริงผ่าน: B3 สร้าง Title/Tag และแสดงปุ่มทันที, กดซ้ำไม่สร้างช่องใหม่, D3/F3 ได้ attachment_2/3, คอลัมน์ตารางแสดงปุ่มทุกแถวและใช้ metadata เดิม บันทึกต้นแบบแล้วปุ่มยังอยู่

แก้ selection snapshot ก่อนรอ network ตาม reviewer และทดสอบ binding failure/retry ไม่สร้างปุ่มหรือช่องซ้ำ Plugin suite 181 tests / 834 assertions ผ่าน; reviewer รันแยกและสรุป no actionable findings ดู verification.md และ usage.md
