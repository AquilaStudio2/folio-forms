# 07 — Retry plain XLSX ไม่ยอมรับ canonical เก่าแทน native edits

Status: needs-triage  
Type: task  
Priority: P1  
Blocked by: —  
Evidence: [R4](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3)

## ขอบเขต

พิสูจน์เส้นทาง plain XLSX ที่ไม่มี `pdmsCatalogSessionId`: native callback มี edits → fail ก่อน commit → same opening force-save รายงาน `unchanged`. ถ้าทำซ้ำได้ ให้ใช้เฉพาะ captured bytes ที่ตรวจ document/action/opening/lease ได้ หรือแจ้งว่าไม่สามารถยืนยันการบันทึก ไม่รับ canonical เก่าแทนงานใหม่. ตรวจ Admin Save/Publish ด้วยเมื่อใช้ fallback เดียวกัน; ไม่เปลี่ยน recovery ของ DCM original checkpoint

## เกณฑ์รับงาน

- [ ] Red-capable test inject failure หลัง capture และก่อน commit; เปรียบเทียบ native edit, stored XLSX, JSON และสถานะ Operation. รันทดสอบ same-opening retry และ fresh opening control
- [ ] Fresh opening, cross-action, stale document/lease หรือ capture ที่พิสูจน์ไม่ได้ต้องไม่ reuse bytes จาก session เดิม. Successful unchanged handling ที่ถูกต้องและ PDMS path เดิมไม่ถดถอย
- [ ] ถ้า reproducer จับไม่ได้ ให้บันทึกเงื่อนไขและ evidence gap; ไม่แก้โดยเดา. ถ้ายืนยัน ให้พิสูจน์ด้วย real ONLYOFFICE ใน sandbox เพิ่มจาก HTTP fixture

## Comments

- พบ fallback ใน source แต่ยังไม่ยืนยัน timing/behaviour จริงของ ONLYOFFICE สำหรับ plain XLSX
