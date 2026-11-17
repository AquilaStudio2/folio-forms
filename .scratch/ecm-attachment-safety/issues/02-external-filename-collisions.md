# ป้องกันชื่อชนกับไฟล์นอก Folio ledger

Labels: wayfinder:grilling
Type: grilling
Parent: ../map.md
Assignee:

## Question

จะยอมรับแนวทางและหลักฐานแบบใดเพื่อไม่ให้ชื่อใหม่ของ Folio เขียนทับไฟล์ที่สร้างนอก Folio ledger โดยไม่อ้างว่า local reservation รู้จักทุกไฟล์ใน DCM?

คุยแบบ HITL ด้วย grilling และ domain-modeling ตัดสินขอบเขต namespace และผู้รับผิดชอบร่วมกับเจ้าของ DCM ไม่เลือกคำตอบแทน human

## หลักฐานและขอบเขต

- [รายงานตาราง: กรณีชื่อชนกับเจ้าของอื่น](../../ecm-storage-templates/table-upload-behavior-audit.md#e-save-และชื่อปลายทาง-dcm) แยก ledger guards จากการรู้จักไฟล์ภายนอก Folio แล้ว
- Wildcard routing ที่ผู้ใช้ยืนยันอยู่ใน [หลักฐาน routing จากผู้ใช้](../../ecm-storage-templates/planning.md#หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง) การ route สำเร็จไม่พิสูจน์ exclusive namespace
- [สเปกชื่อปลายทางไฟล์ใหม่ข้ามรอบบันทึก](../spec.md) เป็นเจ้าของ cross-save reservation ภายใน Folio ไม่ขยาย claim ว่ามองเห็น external writers

## ประเด็นสำหรับรอบ grilling

1. เจ้าของ DCM รับรอง namespace หรือการปฏิเสธ overwrite แบบ atomic ให้ Folio ได้หรือไม่? ต้องครอบคลุมทั้ง Folio และ external writers ที่ใช้ปลายทางเดียวกัน ไม่สมมติว่าบัญชี Folio แยกเท่ากับ namespace แยก
2. หากมีเพียง search-before-write จะยอมรับ race ระหว่างตรวจและ POST อย่างไร? Search ว่างไม่ใช่ exclusivity proof และไม่ settle คำขอ unknown
3. เมื่อพบชื่อ/identity ที่ไม่รู้จัก จะหยุดก่อนเขียนและให้ใครตัดสิน? ต้องไม่ adopt receipt, rename routing input เอง หรือ DELETE ไฟล์เพื่อเปิดทาง
4. ถ้า provider ไม่มี guarantee ที่พอ จะคง release HOLD หรือมีขอบเขตใช้งานที่เจ้าของอนุมัติพร้อมความเสี่ยงชัดเจนอย่างไร? อย่าบันทึกคำแนะนำเป็นการอนุมัติ

## หลักฐานที่ทำให้ตัดสินได้

- [ ] ระบุผู้มีสิทธิ์เขียน namespace เดียวกันและขอบเขตที่ตรวจได้/ตรวจไม่ได้ พร้อม owner/provider confirmation
- [ ] ระบุ guarantee ที่ป้องกัน time-of-check/time-of-use collision หรือข้อจำกัดของมาตรการที่เลือก
- [ ] ระบุผลเมื่อพบ collision และขั้นตอน human escalation ที่ไม่เขียนทับ/ลบไฟล์ไม่ทราบเจ้าของ
- [ ] ใช้ existing HTTP seam พิสูจน์ Folio guards ด้วย controlled external-file/race fixture; แยกสิ่งที่ test double พิสูจน์ไม่ได้เกี่ยวกับ real provider

## Comments

2026-11-18: ยังไม่มี namespace policy หรือ provider guarantee ที่อนุมัติใหม่ ไม่มี external collision trial ใน session นี้
