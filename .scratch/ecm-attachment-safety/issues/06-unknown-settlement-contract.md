# หลักฐานยุติ unknown upload และ DELETE ที่เชื่อถือได้

Labels: wayfinder:task
Type: task
Parent: ../map.md
Assignee:

## Question

Human/provider จะส่ง contract และหลักฐานใดที่ผูกกับ original request จนพิสูจน์ได้ว่า unknown upload/DELETE ยุติจริง โดยแยก mutation HOLD ออกจาก postcommit cleanup warning ที่ยังใช้งาน snapshot ใหม่ได้?

Task แบบ HITL ต้องมี provider contract หรือ evidence ที่อนุมัติ ไม่ใช่ให้ผู้ดูแลรับรองด้วย checkbox/note ว่าคงเสร็จแล้ว

## หลักฐานตั้งต้นและขอบเขต

- [วงจรไฟล์ร่างและการบันทึกโดยไม่สูญหาย](../../ecm-attachments/issues/05-safe-draft-lifecycle.md) เป็น resolved owner ของ upload-before-complete-commit-before-eligible-cleanup และความต่างระหว่าง unknown batch กับ cleanup หลัง commit
- [CONTEXT: Attachment Field](../../../CONTEXT.md#attachment-field) ระบุ original receipt, sender fence และหลักฐานที่ยังขาดสำหรับ receiptless upload/uncertain dispatched DELETE; elapsed time, restart, search ว่าง, operator note ไม่ใช่ settlement
- [รายงานตาราง: Batch, failure และ cleanup](../../ecm-storage-templates/table-upload-behavior-audit.md#f-batch-failure-และ-cleanup) เป็น local/source snapshot ไม่ใช่หลักฐานว่า provider มี settlement API

## Checklist ส่งให้ human/provider

- [ ] ระบุ correlation ของ original request, provider processing window/finality และหลักฐานที่พิสูจน์ accepted/rejected/not-dispatched/finished โดยไม่ใช้การส่ง POST/DELETE ซ้ำเพื่อทดสอบผล
- [ ] แยกผลเมื่อ upload ไม่มี receipt, late receipt หลัง sender fence/cancel, known received uncommitted file และ DELETE dispatch แล้วไม่ทราบผล; ระบุสิ่งที่ provider ไม่รับรองตามจริง
- [ ] ระบุวิธียืนยัน resource/aliases และ ownership ก่อน first authorized DELETE พร้อม surviving references; sender fence ห้าม future dispatch แต่ไม่พิสูจน์ request เก่าจบแล้ว
- [ ] ระบุว่าใครตรวจ ใครมีอำนาจรับรอง และ evidence ใดเก็บอย่างคงทนให้ audit ได้หลัง restart; ไม่เพิ่ม manual unlock จาก note/token/URL ที่ operator ป้อนเอง
- [ ] Unknown canceled upload/uncertain mutation ยังคง HOLD ตาม scope จนมี proof จริง ส่วน complete committed snapshot ที่ cleanup เก่าล้ม/unknown ยังอ่าน ใช้ export และทำงานต่อได้พร้อม persistent warning ว่า old public URL อาจยังเปิดได้
- [ ] Ordinary saves/reload ต้องไม่ retry cleanup หรือทำ warning หายเอง; unknown DELETE ไม่ resend เพื่อหวังให้ได้ผลชัดเจน
- [ ] หากจำเป็นต้องทดลอง ต้องมี approved synthetic scope, no-retry/stop rule และ cleanup owner แยก Charting นี้ไม่อนุมัติ real API

## เกณฑ์คำตอบ

บันทึก provider contract/version และ human acceptance หรือ approved evidence plan พร้อม remaining HOLD แยกกัน การปิดขั้นจัดหาแผนไม่เท่ากับรับรอง settlement ผ่าน หากไม่มี contract ที่ปลอดภัยให้บันทึก insufficient/HOLD ไม่ออกแบบ unlock ปลอมเพื่อปิด ticket

## Comments

2026-11-18: ยังไม่มี settlement contract ใหม่ ไม่มี trial หรือการปลด HOLD ในงานนี้
