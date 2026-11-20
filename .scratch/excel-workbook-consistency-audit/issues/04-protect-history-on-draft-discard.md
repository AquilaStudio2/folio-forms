# 04 — ป้องกัน Submission/Correction สูญหายจาก “ทิ้งฉบับร่าง”

Status: resolved  
Type: task  
Priority: P1  
Blocked by: ยืนยัน policy การทิ้งร่างหลังเคยส่ง  
Evidence: [R3](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3)

## ขอบเขตและโจทย์ที่ต้องตกลง

Dashboard ใช้ wording ว่าทิ้งร่าง แต่ owner endpoint เรียก whole-Response delete. เสนอ guard ฝั่ง server สำหรับ Draft ที่มีประวัติพร้อมข้อความอธิบายเป็นขั้นแรก. ถ้าต้องรองรับ draft-only discard ให้ตกลงสถานะหลังทิ้ง, next open, refs/workspace ที่ retire และทางกลับมาอ่านประวัติก่อนทำ. ไม่กำหนด policy แทนเจ้าของระบบ. Explicit Admin whole-Response delete คงความหมายเดิม; รีวิวผล revoke ทุก session และความชัดของคำยืนยันแยกจาก guard นี้

## เกณฑ์รับงาน

- [x] ฝั่ง server ป้องกัน history loss แม้เรียก endpoint ตรง; FE แจ้งผลตาม policy ที่อนุมัติและไม่ใช้ข้อความ “ทิ้งร่างแล้ว” เมื่อถูกบล็อก
- [x] Fixture owner ที่เคย Submit + Correction แล้วเริ่ม Draft ใหม่: หลังการกระทำตาม policy ที่อนุมัติ ประวัติ, hashes และ attachment refs เดิมยังอยู่. กรณี guard ไม่แตะ storage/provider เลย
- [x] ทดสอบร่างที่ไม่เคยส่ง, foreign account, Viewer, Admin confirmed delete และ active operation/lease/unresolved attachment guards; การทิ้งงาน local ใน Fill ไม่มี DELETE/implicit Save
- [x] รันเฉพาะข้อมูลสังเคราะห์ใน sandbox และใช้ loopback ถ้าต้องทดสอบ cleanup; ไม่แตะประวัติหรือ DCM จริง

## Comments

- Audit ยืนยัน destructive scope จาก source ยังไม่รัน DELETE ของกรณีนี้. ต้องอนุมัติ guard หรือ draft-only semantics ก่อนเริ่มแก้
- เลือก fail-safe guard ตามแผน. `3276c470d8` คืน `409 draft_has_history` เมื่อเจ้าของทิ้ง Draft ที่มี Submission; เก็บ Draft/history และไม่เรียก DELETE. Regression รักษา Submission/Correction, bytes/hash และ attachment refs. ผ่าน 11 HTTP, Dashboard 15 และ Fill local-discard 1
