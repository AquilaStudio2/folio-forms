# ข้อเท็จจริง ECM: login และความสามารถจัดการไฟล์

Labels: wayfinder:research Type: research Parent: ../map.md Status: resolved Assignee: pyw1tt (research agent: EcmApiFacts) Blocked by:

## Question

จากเอกสาร Postman และ ECMService ของ Ongoing backend อะไรคือสัญญาจริงที่ Folio ใช้ได้สำหรับ login, token expiry, upload, browse/search, read/download, rename/replace และ delete? อะไรมีหลักฐาน อะไรยังไม่ทราบ และข้อจำกัดใดกระทบการแทนที่ไฟล์ร่างโดยไม่สูญหาย?

ตรวจรูปแบบ request/response, การใช้ token, error semantics, file identity, duplicate names, PDF/size limits และ atomicity เฉพาะเท่าที่มีหลักฐาน ห้ามตีความว่า endpoint ที่หาไม่พบไม่มีอยู่จริง แยกข้อเสนอปรับปรุงจากพฤติกรรมปัจจุบัน และไม่คัดลอกการจัดการ token/error ของ Ongoing โดยอัตโนมัติ

ใช้ source และ public docs เท่านั้น ห้ามอ่านหรือพิมพ์ค่า credentials ห้าม login/upload/delete จริง ผลวิจัยต้องมีแหล่งอ้างอิงและระบุสิ่งที่ยังไม่ตรวจ runtime

## Context

- API docs: https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#0bb164e9-85fc-4886-9227-12c6f8c1d8e7
- Source: pdms-ongoing-backend/src/features/ECM/ecm.service.ts, ecm.route.ts, ecm.schema.ts
- Research branch: research/folio-ecm-api-20261111
- Findings path on research branch: .scratch/ecm-attachments/research/ecm-api.md

## Comments

### Resolution — 2026-11-11 — pyw1tt / EcmApiFacts

อ่าน public Postman collection และ source ของ Ongoing backend แล้ว พบสัญญา login, category, search, upload และ delete แต่เอกสารยังไม่พอรับรองการแทนที่ไฟล์โดยรักษา bytes เดิมและประวัติ; upload response ที่เอกสารระบุต่างจาก schema ของ Ongoing

หลักฐาน รายละเอียด token/request/response ข้อเสนอปรับปรุง และสิ่งที่ยังไม่ทราบอยู่ใน [ผลวิจัย ECM API สำหรับไฟล์แนบ Excel ของ Folio](https://github.com/AquilaStudio2/folio-forms/blob/4098cb7/.scratch/ecm-attachments/research/ecm-api.md) — commit `4098cb7`, research branch เผยแพร่แล้วโดยไม่เปิด PR หรือ merge

คำถามที่ต้องได้หลักฐานจากผู้ให้บริการแยกไปที่ [ยืนยันสัญญา ECM ที่เอกสารยังไม่ตอบ](09-provider-contract-evidence.md) จึงปิดเฉพาะงานค้นข้อเท็จจริงจาก docs/source ไม่ได้อนุมัติ flow replacement หรือยืนยันว่าสเปกพร้อมพัฒนา

พบข้อมูลลักษณะ credentials ใน metadata ของเอกสาร public โดยไม่ได้เก็บหรือใช้ค่า ไม่ยืนยันว่า active หรือเป็นบัญชีเดียวกับ environment ของผู้ใช้ แจ้งผู้ใช้แล้วว่าควรให้เจ้าของบริการตรวจและพิจารณาเพิกถอน/เปลี่ยน

ไม่ได้ login/upload/download/delete ECM จริง ไม่แก้ application/DB และไม่รัน tests
