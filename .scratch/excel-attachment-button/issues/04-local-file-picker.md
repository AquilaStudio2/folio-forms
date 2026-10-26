# ทดลองเลือกไฟล์จริงจากปุ่มในชีต

Type: prototype Status: resolved

Owner: sol_worker button_scope (plugin); sol_worker storage_audit (host/config); Agent หลักทดสอบ UI; sol_reviewer ตรวจ

## ขอบเขตเพิ่มเติมที่ผู้ใช้สั่ง

หลัง POC แสดงปุ่มผ่าน ผู้ใช้ระบุว่า “ในปุ่มมันต้องเทสลองใส่ไฟล์จริงได้ด้วย” จึงเพิ่มการเปิดตัวเลือกไฟล์จริง แสดงชื่อ และเลือกไฟล์ใหม่ทดแทนในช่องเดิม โดยยังไม่เชื่อม API ภายนอกหรือบันทึกไฟล์ลง storage

## ตรวจรับ

- เปิดตัวเลือกไฟล์จากปุ่ม OLE ในชีตจริง ทั้งช่องเดี่ยวและคอลัมน์/แถวใหม่
- เลือก File จริง เก็บเฉพาะในหน่วยความจำของหน้าฟอร์ม และแสดงชื่อ/ขนาดพร้อมสถานะว่าไฟล์ยังไม่อัปโหลดหรือบันทึก
- เปลี่ยนไฟล์แล้วทดแทนช่องเดิม ยกเลิกการเลือกไม่ล้างไฟล์เดิม
- ปิด/เปิดหน้าต่างปุ่มซ้ำและเพิ่มแถวท้ายตารางแล้วไฟล์เดิมยังผูกช่องถูกต้อง
- ไม่ใส่ File bytes, base64, filename หรือ URL ลง answer JSON/เอกสาร และไม่ส่งไฟล์ผ่าน network
- คงการตรวจ origin/source/document/binding ของข้อความข้าม iframe และคง worksheet protection
- ไม่รายงานว่าไฟล์บันทึกสำเร็จเมื่อยังเป็น local pending; ระบุข้อจำกัดการ reload/ออกจากหน้า
- ทดสอบพฤติกรรมและให้ reviewer ตรวจหลังแก้

## การตัดสินใจเชิงเทคนิคสำหรับ POC

UI เพิ่มแถวเดิม append ที่ท้ายตารางเท่านั้น จึงใช้ binding + rowIndex ภายใน response/session เดิม และกันการลบแถวเมื่อมีไฟล์รออยู่ เพื่อไม่ย้ายไฟล์ไปผิดแถว งาน stable row identity สำหรับการแทรก/ย้าย/ลบทั่วไปยังอยู่ในแผนเต็ม

## งานที่ยังพัก

API ภายนอก, การส่งไฟล์เมื่อ Save/Submit, URL ใน tag, export URL/ช่องว่าง, การแก้ไขและลบไฟล์ที่บันทึกแล้ว

## Comments

ทดลองกับ User จริงผ่านทั้งช่องเดี่ยว ตาราง และแถวใหม่ รวมเปลี่ยนไฟล์/เปิดซ้ำ/คง File หลัง editor remount กัน explicit Save/Submit ขณะยังเป็น local File ตรวจ draft ที่บันทึกจากเพิ่มแถวไม่มี filename หรือ file content ใน JSON/XLSX

ONLYOFFICE 9.4 import ทิ้ง OLE protection จึงเพิ่ม adapter เฉพาะ managed controls พร้อม lifecycle retry และ rollback คง worksheet/ordinary object protection ตรวจ native 123 assertions ผ่าน Reviewer ยืนยัน no actionable findings รายละเอียดและข้อจำกัดใน [verification](../verification.md) และ [usage](../usage.md)
