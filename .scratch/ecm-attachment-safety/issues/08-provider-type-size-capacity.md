# หลักฐาน provider รองรับ original files ทุกชนิด ขอบเขตขนาด และ capacity

Labels: wayfinder:task
Type: task
Parent: ../map.md
Assignee:

## Question

Human/provider ต้องรับรองหรืออนุมัติ evidence plan อย่างไรสำหรับ upload และ original retrieval ทุกชนิดไฟล์ในขอบเขต 0–10,000,000 bytes ต่อไฟล์ รวม batch capacity โดยไม่ใช้ผล local parser หรือ PDF ตัวเดียวรับรองทั้งระบบ?

Task แบบ HITL จัดหา acceptance evidence/approved plan ไม่ลด product requirements เป็น PDF-only และไม่เรียก live API จาก charting session นี้

Guarantee เรื่องหลายชื่อเป็นอิสระอยู่ที่ [หลักฐาน DCM แยกไฟล์ชื่อเติมเลขและคง original bytes](01-provider-independent-resources.md) ไม่ถือว่าชนิดไฟล์เปิดได้แล้วแปลว่า identity แยก หลักฐานชนิด/ขนาดจัดหาได้อิสระจึงไม่เพิ่ม blocker

## ขอบเขตที่ตัดสินแล้ว

- [ข้อกำหนดชนิดไฟล์และขนาดที่รับได้](../../ecm-attachments/issues/07-pdf-acceptance.md) เป็น resolved owner: ทุกชนิด, zero-byte ได้, decimal 10 MB แบบ inclusive, encrypted/password-protected ได้โดยไม่ขอ password/ถอดรหัส/รับรองความปลอดภัยของเนื้อหา
- [รายงานตาราง: Requiredness แถวว่าง และขอบเขตไฟล์](../../ecm-storage-templates/table-upload-behavior-audit.md#d-requiredness-แถวว่าง-และขอบเขตไฟล์) แยก local Folio size/JSON proof จาก provider acceptance ที่ยังไม่ครบ
- [CONTEXT: ECM Service Account](../../../CONTEXT.md#ecm-service-account) ระบุ per-file 10,000,000 bytes และ canonical JSON 262,144 UTF-8 bytes; shared listener ไม่ใช้ default aggregate 128 MiB กับ attachment batch ไม่เท่ากับ provider รับ batch ไม่จำกัด

## Evidence checklist สำหรับ human/provider

- [ ] Matrix ระบุชนิดตัวแทน เช่น PDF, DOCX/XLSX, image, text, binary, HTML original, encrypted และ extensionless รวม original extension/casing ไม่เปลี่ยนไฟล์ให้เป็น preview
- [ ] ตรวจ 0, 10,000,000 และ 10,000,001 bytes โดยแยก Folio reject ก่อน dispatch ออกจาก provider-reported limits ไม่จงใจ upload oversize ไป live provider โดยไม่ได้อนุมัติ
- [ ] ตรวจ returned originals เทียบ exact original bytes/hash ไม่ใช้ MIME, HTTP 200, ชื่อไฟล์ หรือ viewer เปิดได้อย่างเดียวเป็น proof; HTML original ต้องไม่สับสนกับ HTML viewer/error ที่มีขนาดเท่ากัน
- [ ] แยก initial upload, reopen/read และเปลี่ยน `docs_number` โดย reuse saved original; ไม่ขอให้ User เลือกไฟล์ใหม่เพื่อปกปิด retrieval ที่ไม่รองรับ
- [ ] ระบุ batch counts/aggregate sizes, concurrency, provider quota/rate/timeouts และ environment/version ที่รับรอง รวมหลายแถว/คอลัมน์ ไม่แปลการไม่มี 128 MiB transport cap เป็น unlimited provider capacity
- [ ] ถ้า capacity หรือชนิดใดไม่รับรอง ให้บันทึก partial/insufficient และ human release disposition ไม่เปลี่ยน one-file-per-slot/JSON limit หรือเพิ่ม config/caps โดยไม่ได้ตัดสินแยก
- [ ] แผน live evidence ใช้ synthetic fixtures ที่อนุมัติ ตรวจ collision/ownership ก่อน write มีผู้รับผิดชอบ cleanup และหยุดเมื่อ unknown outcome ไม่ retry POST/DELETE

## เกณฑ์คำตอบ

แนบ sanitized matrix ระบุ result, exact bytes evidence, provider/human owner, วันที่และขอบเขตที่ยัง HOLD หรือ approved plan พร้อม acceptance ที่ยังต้องรัน การอนุมัติแผนไม่ใช่ผล DCM trial และ local HTTP proof ไม่ใช่ Production capacity guarantee

## Comments

2026-11-18: ยังไม่มี all-type/size/capacity provider acceptance ใหม่ ไม่มี live upload/download/DELETE ในงานนี้
