# 09 — กำหนดพฤติกรรมเมื่อคำตอบ routing เปลี่ยนระหว่าง internal Save

Status: needs-info  
Type: task  
Priority: P2  
Blocked by: ยืนยัน policy ของ internal row/project Save  
Evidence: [R5](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3)

## ขอบเขตและโจทย์ที่ต้องตกลง

ทำซ้ำด้วย existing receipt และ `docs_number` ใหม่ (หรือ `fiscal_year` ใน legacy) จากนั้นกดเพิ่ม/ลบแถวหรือเลือกโครงการ. ยืนยันว่าฉบับที่ internal Save เก็บแสดงค่า routing ใหม่เทียบกับ receipt เดิมอย่างไร. เสนอให้คง no-upload semantics และอธิบายว่าการเปลี่ยนปลายทางยังรอ explicit Save/Submit หรือแยก effective routing ที่ commit กับค่าที่รอยืนยัน หาก owner ต้องการ. ห้ามตีความว่า internal action อนุญาต re-upload

## เกณฑ์รับงาน

- [ ] เจ้าของระบบตกลงเรื่อง visibility/state และทบทวนผลต่อออกหน้า/เปิดใหม่/Correction. ใช้ fixture แยก storage mode `legacy`/`template`; ไม่ใช้ปีเป็น prerequisite ใน template mode
- [ ] หลัง internal action ไม่มี upload/DELETE หรือ silent retarget; file ref เดิมตาม physical row ที่ถูกต้อง. explicit Save/Submit ใช้กฎ relocation/validation และผล failure เดิม
- [ ] ผลแตกต่างระหว่าง files ที่ยัง pending, saved receipt เดิม และคำตอบ routing ใหม่อ่านเข้าใจได้; ไม่เปิด token/private URL. หากตัดสินว่าเป็น behavior ตามเจตนา ให้ลงหลักฐานและระบุว่าทำอะไร/ไม่ทำอะไรแทนการแก้โค้ดโดยเดา

## Comments

- Audit พบจาก source ยังไม่ยืนยัน runtime จึงไม่ถือเป็นข้อมูลเสียหรือ policy ที่อนุมัติแล้ว
