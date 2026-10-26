# เลือกปุ่มเพื่อดู Title/Tag และลบช่องได้

Type: task

Status: resolved

Owner: button_scope (plugin), storage_audit (native regression), Agent หลัก (UI/เอกสาร), sol_reviewer (ตรวจ)

## ปัญหาที่ผู้ใช้แจ้ง

คลิกปุ่ม Upload แล้วแผงไม่แสดง Title/Tag ของปุ่ม และไม่พบ “ลบช่องนี้”

## สาเหตุที่ตรวจพบ

คำสั่งอ่าน selection เดิมอ่านเฉพาะช่วงเซลล์ ขณะที่ ONLYOFFICE เลือกปุ่มเป็นวัตถุ OLE จึงยังคืนเซลล์ที่เลือกก่อนหน้า ทดลองจริงจาก H18 ไปคลิกปุ่ม D13 แล้ว Name box เปลี่ยนเป็น Object -1 แต่แผงยังแสดง field_2 ที่ H18 ซึ่งเสี่ยงแก้หรือลบผิดช่อง

## ตรวจรับ

- คลิกปุ่มจริงช่องเดี่ยวแล้วแสดง Title/Tag และการลบของช่องนั้น โดยตรวจ identity และตำแหน่งวัตถุเทียบ binding
- คลิกปุ่มในแถวตารางแล้วเลือกคอลัมน์ที่ถูกต้อง ไม่ใช่เซลล์เดิมหรือคอลัมน์ข้างเคียง
- วัตถุอื่น/หลายวัตถุ/ข้อมูลปุ่มไม่ถูกต้องต้องไม่เปิดการแก้หรือลบช่องจาก stale cell
- การลบปุ่ม POC ใช้ field mutation เดิมและบันทึกต้นแบบผ่าน operation เดิม หลังบันทึกและเปิดกลับปุ่มเป้าหมายหาย ส่วนช่องอื่นยังอยู่
- ตรวจ pending File ก่อนเปลี่ยน metadata; ถ้าบันทึกล้มเหลวแสดงวิธีลองใหม่ ไม่รายงานสำเร็จ
- คง dirty/recovery guards, save-before-picker และไม่มี external upload หรือ URL persistence
- ทดสอบชุด regression, UI จริง และให้ sol_reviewer ตรวจ

## Comments

- ตอนเริ่มทดสอบ ฟอร์มผู้ใช้ e43f39118450457c95d2c21b9b5b60ee มี File ค้างในหน่วยความจำ จึงไม่ reload หรือทิ้งไฟล์เหล่านั้น ทดสอบการลบในฟอร์มใหม่ b7660e376b964169bae26a0527fb74d7 แทน
- Server save-template มีการลบ OLE ที่ marker/binding ถูกนำออกแล้ว จึงใช้ save/remount เพื่อให้หายจากชีต โดยไม่เพิ่ม private deletion shim
- ตรวจ actual selected drawing พร้อม GUID, metadata, marker และตำแหน่งจริงก่อนเลือก binding; ไม่ fallback ไปยัง stale cell เมื่อเลือกวัตถุอื่นหรือหลายวัตถุ
- UI จริง: คลิก B3/D3 พบ Title/Tag และลบช่องนี้; คลิก B8 พบคอลัมน์ column_2; ลบ B3 แล้วเปิดใหม่ B3 หายและ D3/ปุ่มตารางยังอยู่; ลบ column_2 แล้วปุ่ม B7:B9 หายพร้อม mapping ส่วน column_1 และข้อมูลเซลล์ยังอยู่
- Plugin 198 tests / 915 assertions, native ONLYOFFICE 9.4 145 assertions, root check-types, scoped format/lint และ git diff --check ผ่าน; sol_reviewer ตรวจซ้ำและสรุป no actionable findings
- ขอบเขตการทดสอบ native: headless DocBuilder ต้อง seed selected flag เพราะ ApiDrawing.Select() ไม่มี browser controller; การคลิกจริงตรวจด้วย UI แยกต่างหาก
- พบภาพ D3 ว่างชั่วคราวใน editor session ระหว่างทดสอบ แม้ OLE/marker/preview ยังครบใน XLSX; A/B ยืนยันไฟล์เดิมที่ไม่แก้ XML แสดงได้เมื่อใช้ document key ใหม่ จึงไม่เพิ่ม row-height/anchor/redraw patch ที่ยังไม่มีหลักฐานรองรับ ดูรายละเอียด verification.md
