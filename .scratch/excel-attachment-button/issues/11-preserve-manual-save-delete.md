# บันทึกแบบร่างและลบช่องโดยไม่เปิด Excel ใหม่

Type: task

Status: resolved

Owner: button_scope (plugin/native deletion), storage_audit (server/regression), Agent หลัก (web/UI/เอกสาร), sol_reviewer (ตรวจ)

## คำสั่งผู้ใช้

ให้กดบันทึกแบบร่างและลบช่องใน Admin Excel ได้โดยไม่รีเฟรช ทดสอบเปิดใหม่ว่าข้อมูลและปุ่มบันทึกหรือลบถูกต้อง และให้ reviewer ตรวจซ้ำ

## ขอบเขตและแนวทาง

- เฉพาะต้นแบบ XLSX ของ Admin ใช้ preserved save แยก purpose placement/manual/delete; DOCX, publish และการกรอกคำตอบยังใช้เส้นทางเดิม
- Placement ยังต้องยืนยัน target binding เดิม ห้ามปล่อย missing target กลายเป็น manual save โดยปริยาย
- Manual/delete สร้าง checkpoint ใหม่ใน hidden defined name หลัง freeze ก่อน flush และตรวจ strict retained POC manifest จาก snapshot ล่าสุดก่อน ACK เพื่อกัน forceSave(false) fallback ที่ค่าหรือรูปแบบเก่า
- ลบ metadata ผ่าน transaction/recovery เดิมให้ทราบผลแน่นอนก่อน จากนั้นลบ OLE เป้าหมายใน native editor ภายใต้ freeze พร้อม pending cleanup/retry โดยไม่อ้างว่า native snapshot เดิม rollback drawings ได้
- 9.4 ไม่มี public spreadsheet OLE Delete ใช้ adapter จำกัดเป้าหมาย `Drawing.deleteDrawingBase()` ตาม GUID, metadata, native ID และตำแหน่งที่ตรวจสอบแล้ว ห้ามลบ foreign image/other OLE หรือเคลียร์ undo history ทั้งชีต
- Server ต้องตรวจ absence ของ deleted IDs/markers/OLE และความถูกต้องของทุกปุ่มที่เหลือก่อนแจ้งสำเร็จ คง lease, capability, bindingRevision, callback claim/replay, dirty/recovery และ pending File guards

## ตรวจรับ

- บันทึกค่าข้อความ สูตร และรูปแบบ โดย iframe/zoom/expanded คงอยู่ และเปิดใหม่ได้ข้อมูลตรงไฟล์จริง
- ลบช่องเดี่ยว คอลัมน์ตาราง และตารางทั้งชุดโดยไม่รีเฟรช ปุ่มเป้าหมายหายทั้ง live และ saved artifact ส่วนค่าเซลล์ ปุ่มช่องอื่น รูปภาพและ OLE อื่นยังอยู่
- ล้มเหลว/ลองใหม่ไม่แจ้งสำเร็จก่อนพิสูจน์ ไม่ลบ binding ซ้ำ และไม่ฟื้นปุ่มใต้ binding อื่นหลัง Undo
- ตรวจ native 9.4 เปิด canonical bytes จาก storage โดยไม่พึ่ง browser cache และ reviewer ตรวจ implementation/tests

## Comments

- Reviewer เน้นว่า anchor snapshot อย่างเดียวไม่ยืนยันค่าหรือ format ล่าสุด และกลไก rollback ของ field mutation เดิมยังไม่ครอบ drawings จึงใช้ checkpoint และ staged post-commit deletion
- ใช้ hidden local defined name ที่ชื่อมี UUID ใหม่และอ้าง A1 เพราะ native 9.4 ไม่รองรับ constant defined name ตามที่ทดลอง เซิร์ฟเวอร์ตรวจ checkpoint ใหม่และ manifest ก่อนปรับ canonical bytes และก่อน commit รวมถึงปฏิเสธ nonce เดิมที่ใช้แล้ว
- ลบช่องที่ไม่มี POC ก็ autosave ด้วย manual purpose โดยไม่เพิ่มข้อจำกัดรูปแบบ ID ของช่องทั่วไป
- Reviewer พบ P1 หลังเปลี่ยน POC text เป็น number: marker หายแต่ OLE ยังอยู่ ทำให้ manual Save ใหม่ถูก block แก้ capture ก่อน mutation แล้ว enqueue cleanup/reprojection เฉพาะ confirmed commit สำหรับ type/computed/key/table-key changes ภายใต้ manual Save freeze คง strict proof และ identity guard
- Plugin 238 tests / 1148 assertions, web focused 25 tests, spreadsheet units 92 tests / 274 assertions, isolated HTTP/native integration 2 tests, root types/build/scoped format/lint ผ่าน; reviewer ตรวจอิสระซ้ำ P1 แล้ว no actionable findings
- UI จริงฟอร์ม a3be7e8fb308464d912dcc9391e85d8a: manual Save ไม่มีปุ่มและมี 8 ปุ่มผ่านใน iframe เดิม ซูม 90%; scalar 8→7, column 7→4, table 4→1, last scalar 1→0; no-op manual Save ผ่าน; POC H3 เปลี่ยนเป็น number แล้ว Save ต่อและลบช่อง non-POC ผ่าน ทั้งหมดไม่ remount
- Canonical DB/storage ยืนยัน 14 completed operations มี preserved ACK และ documentKey เดิมทั้งหมด; final fields=0/table=null/POC=0 แต่ค่าข้อความ สูตรและรูปแบบยังอยู่ เปิด browser ใหม่และ cold native 9.4 จาก bytes จริงผ่าน
