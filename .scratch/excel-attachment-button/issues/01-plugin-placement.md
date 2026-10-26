# ปลั๊กอินวางปุ่มแนบไฟล์ POC

Type: prototype Status: resolved

Owner: sol_worker / button_scope

## ขอบเขตไฟล์

`apps/onlyoffice-plugin/src/` และ `apps/onlyoffice-plugin/test/` ห้ามย้อนงาน `examples/` เดิม; shared projector ฝั่ง server เป็นของ ticket 02

## ผลที่ต้องได้

- Admin มี action “วางปุ่มแนบไฟล์ (POC)” ในปลั๊กอิน Excel
- ใช้ช่อง/คอลัมน์ข้อความที่ตั้งค่า tag แล้วและไม่ใช่ computed เป็นตำแหน่งทดลอง ไม่เพิ่ม production attachment FieldType หรือเปลี่ยน validation เดิม
- แทรก OLE ปุ่มจริงที่เซลล์/merged scalar หรือทุกแถวในคอลัมน์ที่เลือก พร้อม managed marker
- คง authoring readiness, panel draft และ recovery fences; invalid selection แสดง error ที่แก้ได้
- ไม่มี file input, upload request, cell answer mutation; ระบุ display-only ชัดเจน

## ตรวจรับ

Mapping/command/guard tests, plugin regression suite, plugin build และ root scoped format/lint; ส่งหลักฐานให้ Agent หลักทดสอบ native editor

## Comments

Q1 ยืนยันว่า POC รวมปุ่มเมื่อเพิ่มแถวด้วย งานส่วนนี้ประสาน ticket 02

ตรวจรับเสร็จ 22 ต.ค. 2026: ดู [ผลตรวจและหลักฐาน](../verification.md) รอบนี้หยุดที่ POC ไม่มีงานอัปโหลดจริง
