# Admin เปิดตัวเลือกไฟล์หลังสร้างช่องใหม่

Type: prototype Status: resolved

Owner: sol_worker storage_audit; Agent หลัก UI/คู่มือ; sol_reviewer ตรวจ

## ข้อผิดพลาด

Admin วางปุ่มคลิกเดียวแล้วดับเบิลคลิกทันที พบข้อความตำแหน่งเลือกไฟล์ไม่ตรงกับช่องหรือแถวปัจจุบัน และตัวเลือกไฟล์ disabled เพราะ host ตรวจ metadata จาก editor config ตอนเริ่มหน้า ซึ่งยังไม่มีช่องที่สร้างใหม่

## ตรวจรับ

- ช่องใหม่หลังเปิด editor เลือก File จริงได้ทันทีโดยไม่ Save/reload
- ใช้ binding ล่าสุดจากแหล่งที่ตรวจสิทธิ์ได้ ไม่เชื่อ metadata จาก picker โดยตรง
- คง origin/source/bridge/document/scope/binding/tag/row guards และปฏิเสธช่องที่ลบหรือไม่ตรงข้อมูลปัจจุบัน
- การตอบกลับ async ต้องไม่ยอมรับ File จาก editor/document ที่เปลี่ยนไปแล้ว
- คงพฤติกรรม User และไฟล์อยู่เฉพาะหน่วยความจำ ไม่มี upload/storage API
- ทดสอบจริง Admin สร้างช่องใหม่ → เปิด picker → เลือก/เปลี่ยน/เปิดซ้ำ ก่อน Save และให้ reviewer ตรวจ

## Comments

Host อ่าน config ล่าสุดจาก endpoint เดิมที่ตรวจสิทธิ์ก่อนแต่ละคำขอ Admin แล้วตรวจ document/action/scope/lease และ iframe หลัง async โดยไม่ remount editor หรือใช้ metadata จาก picker เป็น authority คงพฤติกรรม User และขอบเขต row validation เดิม

UI จริง: สร้าง D15 / attachment_6 หลังเปิดหน้า เลือกไฟล์ A แล้วเปลี่ยนเป็น B ก่อน Save; B7 เลือกไฟล์ตารางแยกกัน และเปิด D15 ซ้ำยังเป็น B ผ่าน 24 focused tests, root typecheck และ reviewer no actionable findings
