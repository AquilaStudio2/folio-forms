# คำเตือน refresh และ navigation สำหรับ pending Files ใน memory

Labels: wayfinder:grilling
Type: grilling
Parent: ../map.md
Assignee:

## Question

ภายใต้โมเดลที่ยอมรับแล้วว่า pending File อยู่ใน browser memory เท่านั้น ต้องเตือนและขอยืนยันการทิ้งงานในจังหวะใด เพื่อไม่ให้ User เข้าใจว่า file selection ถูกบันทึกหรือกู้คืนหลัง reload ได้?

เป็น HITL decision เรื่องขอบเขตคำเตือนและ discard ไม่ใช่เปิดคำถาม temporary storage, auto-upload หรือ persistence ใหม่

Provider settlement อยู่ที่ [หลักฐานยุติ unknown upload และ DELETE ที่เชื่อถือได้](06-unknown-settlement-contract.md) คำเตือน navigation ต้องเคารพ HOLD ที่มีอยู่ แต่กำหนดข้อความ memory-loss ได้ก่อน จึงไม่บล็อกกัน

## ข้อเท็จจริงและข้อจำกัด

- [รายงานตาราง: เลือกไฟล์และสถานะที่ยังไม่บันทึก](../../ecm-storage-templates/table-upload-behavior-audit.md#c-เลือกไฟล์และสถานะที่ยังไม่บันทึก) แยก candidate ใน dialog, confirmed host pending และ canonical saved receipt; checkpoint ไม่ได้เก็บ bytes
- [CONTEXT: Attachment Field](../../../CONTEXT.md#attachment-field) กำหนด Cancel/X ของ dialog รักษา baseline; final Correction completion ไม่ล้างการเลือกใหม่ที่ไม่ได้อยู่ใน captured snapshot และไม่สัญญาว่า browser Files อยู่ข้าม reload
- Saved Draft ที่เปิดใหม่อ่าน saved receipts ได้ ไม่ใช่การกู้ unsaved File จาก memory การกู้ original Operation ไม่เท่ากับยอมรับ ordinary answers/selection ที่เพิ่งเลือกใหม่

## ประเด็นสำหรับรอบ grilling

1. Browser refresh/close, internal navigation, route switch และหลาย tabs ต้องเตือนช่วงใดสำหรับ candidate, confirmed pending replacement, pending removal และ native unsaved inputs? Browser อาจจำกัดหรือไม่แสดง beforeunload prompt ต้องระบุ best-effort ตามจริง
2. คำยืนยัน discard ต้องบอกว่าสูญเสียเฉพาะงานใดและรักษา saved canonical state ใด? อย่าบอกว่ากู้ File ได้จาก filename/checkpoint หรือว่า Cancel navigation ยกเลิก external request ที่ส่งแล้ว
3. Save กำลังทำ/unknown checkpoint กับ completed save ที่ยังมี newer pending จะออกจากหน้าได้เมื่อใด? คงคำแนะนำ unknown-outcome และ no-resend ไม่แทนด้วย “ลองส่งใหม่”
4. Final Correction ที่ operation เสร็จแล้วแต่มี pending ใหม่ต้องยืนยัน discard-and-exit อย่างไร? ไม่เปิดอีก Save บน retired workspace หรือย้าย File เข้า Correction ใหม่เอง
5. ข้อความสั้นใดแยก “เลือกแล้ว”, “ยืนยันในกล่องแล้ว”, “บันทึกจริงแล้ว” และ “ไฟล์ใหม่ยังไม่บันทึก” โดยไม่เพิ่ม upload stage/UI ที่ไม่จำเป็น?

## Evidence ที่ต้องมี

- [ ] Human ยืนยัน trigger matrix และข้อความ รวมข้อจำกัด browser prompt และเส้นทางที่เตือนอย่างรับประกันไม่ได้
- [ ] ใช้ existing UI/native seam เฉพาะ navigation/browser behavior; HTTP ใช้ตรวจว่า canceled navigation/unchanged save ไม่ทำ external writes หรือแก้ canonical receipt
- [ ] ทดสอบ saved state เทียบ pending ก่อน/หลัง confirm/cancel/reload ใน actual supported browser โดยไม่อ้างการกู้ bytes ที่ไม่มี
- [ ] ไม่มี sessionStorage/IndexedDB/server temporary copy หรือ auto-upload เพิ่มเพื่อเลี่ยงโมเดล memory-only

## Comments

2026-11-18: ยังไม่อนุมัติ trigger/message matrix ใหม่ ไม่มี browser trial หรือการเปลี่ยน persistence ใน charting session นี้
