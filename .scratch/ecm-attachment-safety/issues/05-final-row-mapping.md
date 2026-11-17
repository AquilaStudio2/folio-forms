# สัญญาลบแถวสุดท้าย: ล้างคงหนึ่งแถวหรือเหลือศูนย์แถว

Labels: wayfinder:grilling
Type: grilling
Parent: ../map.md
Assignee:

## Question

เมื่อลบ physical row สุดท้าย จะกำหนด end-to-end behavior เป็น clear-and-keep-one หรือ delete-to-zero และให้ workbook, server guard, canonical attachments กับ pending mapping ตรงกันอย่างไร?

เป็น HITL domain decision ของแถวว่างและคำสั่งลบ ไม่ใช่แก้ 409 ด้วยการยอมรับจำนวนที่ไม่รู้ความหมาย

## หลักฐานที่ขัดกัน

[รายงานตาราง: เพิ่ม/ลบแถว](../../ecm-storage-templates/table-upload-behavior-audit.md#b-เพิ่มลบแถว) กรณีสุดท้ายและ finding F01 รายงานว่า native builder ที่รันล้างค่าแต่คงหนึ่งแถว/ปุ่ม ขณะที่ server transition guard ต้องการลดเหลือศูนย์ เป็น source contradiction พร้อม native reproduction ใน snapshot เก่า การถูกปฏิเสธ HTTP 409 ยังเป็น inference ในรายงานนั้น ไม่เคยอ้างว่ามี HTTP/UI evidence หรือว่า Production เกิดปัญหาแล้ว ไม่รันซ้ำเพื่อยืนยันรายงานเดิม

## ประเด็นสำหรับรอบ grilling

1. ผู้ใช้ต้องการให้คำสั่ง “ลบ” แถวสุดท้ายเหลือแถวว่างเป็น prototype หรือไม่มี body row? คำอธิบาย UI และผล requiredness ต้องสอดคล้องกับคำตอบ
2. กรณีแถวสุดท้ายมี ordinary inputs, saved file, pending File, pending removal หรือ invalid candidate ต้องอนุญาต/หยุดอย่างไร? Guard เดิมที่ไม่ทิ้ง pending ยังใช้ ไม่ถือว่าล้างค่าเท่ากับผู้ใช้ยืนยัน discard
3. Complete old/new mapping จะยืนยัน row count, button count, table range, row indices, canonical references และ pending transition อย่างไร? ห้ามยกเว้น last row แล้วข้ามการตรวจ mapping
4. หลังคำสั่ง เพิ่มแถวต่อ/Save Draft/Submit/reopen/Undo ต้องเห็นอะไร? Completely empty row ไม่ active แต่ attachment-only รวม zero-byte เป็น active ตามกฎเดิม
5. Internal row save ต้องไม่มี ECM POST/DELETE; ลบไฟล์เก่าได้เฉพาะ lifecycle หลัง complete snapshot commit และไม่มี protected references ไม่ใช่ทันทีเพราะแถวหาย

## Evidence ที่ต้องมีหลังเลือกสัญญา

- [ ] Human ยืนยันหนึ่ง semantics พร้อม expected snapshots และข้อความที่ User เห็น
- [ ] Regression บน existing HTTP integration ตรวจ actual app/isolated DB/store, saved JSON, XLSX และ no-write behavior ทั้ง empty/saved/pending cases
- [ ] Actual native boundary เฉพาะ row command/mapping ที่ HTTP พิสูจน์ไม่ได้ ต้องตรวจ before/after ไม่ใช้ source expectation แทน
- [ ] ทุก consumer ของ full mapping สอดคล้องกัน ไม่ทำ fallback ย้ายไฟล์ไปแถวอื่นหรือบันทึกคำตอบครึ่งเดียว

## Comments

2026-11-18: ยังไม่เลือก clear-one หรือ delete-zero และไม่แก้ builder/server ใน charting session นี้
