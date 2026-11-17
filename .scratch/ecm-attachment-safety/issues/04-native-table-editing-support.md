# ขอบเขต native table edits ที่รองรับหรือหยุดด้วย guard

Labels: wayfinder:grilling
Type: grilling
Parent: ../map.md
Assignee:

## Question

Native table operations ใดต้องรองรับ และ operation ใดต้องหยุดอย่างปลอดภัย เมื่ออาจเปลี่ยน physical-row/column mapping ของ saved files, pending Files และ removals?

เป็น HITL decision เรื่อง support boundary ไม่ถือว่า native editor ทำได้เท่ากับ Folio รองรับ และไม่เพิ่ม stable row ID โดยอัตโนมัติ

กรณีแถวสุดท้ายมี known source contradiction แยกตัดสินที่ [สัญญาลบแถวสุดท้าย: ล้างคงหนึ่งแถวหรือเหลือศูนย์แถว](05-final-row-mapping.md) ไม่ใช้ native combinations ticket นี้กลบ finding นั้น ทั้งสองคำถามคุยได้อิสระ จึงไม่มี blocker ระหว่างกัน

## หลักฐานตั้งต้น

- [รายงานพฤติกรรมตาราง 64 cases](../../ecm-storage-templates/table-upload-behavior-audit.md) เป็น snapshot วันที่ 2026-11-17 ตามข้อจำกัด revision ใน parent map ไม่ใช่ current full native acceptance
- [CONTEXT: Attachment Field](../../../CONTEXT.md#attachment-field) ผูกไฟล์กับ physical row และ published column binding ใช้ verified transition สำหรับ pending remount ไม่ใช้ตำแหน่ง compact answer array เป็น row identity
- Existing append/delete-selected proof ไม่ครอบคลุมทุก combination ของ native editing; ยังไม่สรุปว่ากรณีที่ไม่ทดสอบเสียหรือปลอดภัยแน่นอน

## ประเด็นสำหรับรอบ grilling

1. กำหนด support/guard/ยังไม่ยืนยัน สำหรับ sort, drag/move rows/columns, copy/paste/cut ข้ามช่วง, Undo/Redo, native insert/delete และ combinations ต่อเนื่องอย่างไร?
2. Filter/hidden rows, merged cells และหลาย tabs/sheets เปลี่ยนการเลือกแถวหรือ binding อย่างไร? ต้องครอบคลุมตารางที่ Form map ไว้และหลาย attachment columns โดยไม่ย้ายไฟล์ตาม visual index อย่างเดา และไม่เพิ่มการรองรับหลาย repeating tables ใน Form โดยปริยาย
3. เมื่อ proof mapping หาย/กำกวม ให้หยุดคำสั่งใด ณ จุดใด และคง canonical document กับ pending bytes/removals อย่างไร? Fail หลัง remount ที่ทิ้ง File แล้วไม่ใช่ guard ที่พอ
4. Native Undo หลังบันทึกหรือเปลี่ยนเอกสาร จะถือเป็น local edit หรือย้อน canonical state ได้แค่ไหน? Internal saves ต้องไม่ upload/DELETE และห้ามฟื้น stale receipt เข้าประวัติใหม่
5. User Draft และ Admin Correction มี support boundary ต่างกันตรงไหนตาม UI/authorization เดิม? ไม่เพิ่ม row commands ให้ Correction โดยปริยาย

## Evidence checklist

- [ ] ตาราง support matrix ระบุ operation, combinations, mode, saved/pending/removal/zero-byte state และ expected safe rejection หรือ success
- [ ] ใช้ approved HTTP seam ตรวจ extracted saved JSON, canonical XLSX, exact provider bytes และ no-write guards ก่อน
- [ ] เฉพาะ native-only boundary ใช้ actual ONLYOFFICE พร้อมระบุ version, คำสั่งจริง, before/after workbook และ mapping/pending proof ไม่ใช้ builder-only proof แทน UI ทุกกรณี
- [ ] Guard ที่เลือกต้องไม่ discard pending หรือเปลี่ยน identity ของ surviving row; row movement ไม่เป็นเหตุ rename/reupload
- [ ] Human ยืนยัน support/guard matrix ที่ต้องสื่อสารก่อน implementation ไม่ใช้ checklist นี้เป็น acceptance ที่ผ่านแล้ว

## Comments

2026-11-18: ยังไม่ได้เลือก support matrix ไม่ได้รัน native combinations ใหม่ และไม่เปลี่ยน editor guards
