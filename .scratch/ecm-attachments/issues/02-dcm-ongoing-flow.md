# โครงสร้าง DCM และการตั้งชื่อไฟล์ที่ Ongoing ใช้จริง

Labels: wayfinder:research
Type: research
Parent: ../map.md
Status: resolved
Assignee: pyw1tt (research agent: DcmFlowFacts)
Blocked by:

## Question

Ongoing management เลือกปีงบประมาณ โครงการหรือเลขที่หนังสือยืนยัน หมวดหรือโฟลเดอร์ และชื่อไฟล์อย่างไร ก่อนส่งผ่าน backend ไป ECM/DCM? ส่วนใดมาจาก API ส่วนใดเป็นรายการหรือ convention ในแอป และแนวคิดใดนำมาใช้กับ Form/ช่องแนบของ Folio ได้โดยไม่ยกข้อจำกัดเดิมมาทั้งชุด?

ตาม flow จาก UI ถึง service และ payload จริง ระบุแหล่งเลขที่หนังสือ หน่วยเจ้าของเลข รูปแบบชื่อ ตัวระบุไฟล์ที่เก็บไว้ การกลับมาเปิด/เปลี่ยนไฟล์ และสิทธิ์เท่าที่พบ แยกพฤติกรรมปัจจุบันออกจากแผนในเอกสาร ห้ามสรุปว่า Folio ต้องใช้ความสัมพันธ์แบบเดียวกับ Ongoing

อ่าน repo แบบ read-only ไม่เปลี่ยนข้อมูล ไม่เรียกบริการจริง ผลวิจัยต้องมี source references และข้อจำกัดความมั่นใจ

## Context

- Sources: pdms-ongoing-project-management และ pdms-ongoing-backend โดยเริ่มจาก docs/architecture/README.md และ domain docs ของแต่ละ repo
- Research branch: research/folio-dcm-flow-20261111
- Findings path on research branch: .scratch/ecm-attachments/research/dcm-ongoing-flow.md

## Comments

### Resolution — 2026-11-11 — pyw1tt / DcmFlowFacts

flow UI ของ Ongoing ที่ตรวจใช้เลขที่หนังสือยืนยันระดับ Project ประกอบชื่อ PDF กับชนิดเอกสารจากรายการในแอป แล้วส่ง `template=1`; ไม่ใช่ตัวเลือกโฟลเดอร์จาก ECM และไม่ส่งปี/เลข/หมวดแยกใน flow นี้ Backend รองรับอีกโหมดแต่ยังไม่ใช่หลักฐานของหน้าตั้งค่าปลายทางตามที่ Folio ต้องการ

หลักฐานของ UI/services/payload, ประวัติและสิทธิ์ พร้อมข้อจำกัดอยู่ใน [ผลวิจัย Ongoing ใช้ ECM อย่างไร](https://github.com/AquilaStudio2/folio-forms/blob/f5addf9d3899a60dc379e2ad1108611803e3ce91/.scratch/ecm-attachments/research/dcm-ongoing-flow.md) — commit `f5addf9d3899a60dc379e2ad1108611803e3ce91`, research branch เผยแพร่แล้วโดยไม่เปิด PR หรือ merge

ประวัติ DB ที่เก็บลิงก์ไม่รับรองว่า bytes ของไฟล์เก่ายังเหมือนเดิม และการตรวจ role ฝั่ง UI ไม่ใช่หลักฐาน backend authorization ของ deployment จึงไม่คัดลอก flow นี้เป็นคำตอบ Folio ระดับการตั้งค่า Admin และหน่วยเจ้าของเลขหนังสือยังรอการตัดสินใจของผู้ใช้

คำถาม provider ที่ source ตอบไม่ได้ส่งต่อ [ยืนยันสัญญา ECM ที่เอกสารยังไม่ตอบ](09-provider-contract-evidence.md) ไม่ได้เรียก ECM/DB จริง ไม่อ่าน secrets และไม่รัน tests
