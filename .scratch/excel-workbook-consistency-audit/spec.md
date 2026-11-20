# แผนงาน Folio XLSX — กฎ, workbook และผลลัพธ์ต้องตรง revision

**สถานะ:** ข้อเสนอรอตรวจรับแผน ยังไม่เริ่ม implementation  
**ฐานหลักฐาน:** `ba89561`; [รายงาน audit และ source refs](map.md). ตรวจ HEAD และทำ red-capable probe ใหม่ก่อนลงมือแต่ละตั๋ว หาก source เปลี่ยน ห้ามถือว่าผลเดิมใช้แทนได้

## เป้าหมายและขอบเขต

- **Template Draft:** กฎและไฟล์ XLSX ที่ถือว่าบันทึกแล้วต้องมาจาก snapshot เดียวกัน เมื่อเปิดใหม่ต้องเห็นคู่เก่าหรือคู่ใหม่ครบชุด ไม่เห็น `bindingRevision` ใหม่กับ workbook เก่า แยก “ตั้งใจยังไม่ผูกตำแหน่ง” จาก “ตำแหน่งที่เคยผูกหาย” รักษาการบันทึกร่างไม่ครบและการตรวจ Publish เดิม
- **Saved reads:** หน้า Document, Fields และดาวน์โหลดใช้ snapshot ที่ผู้ใช้เลือก ไม่อ่านไฟล์ระหว่างประมวลผล ไม่แทน revision ที่ไม่พบด้วย latest
- **Response/history:** ทิ้งงาน local, ทิ้งร่างที่บันทึกแล้ว และลบทั้ง Response เป็นคนละคำสั่ง ไม่เปลี่ยนประวัติหรือไฟล์โดยปริยาย
- **Attachments:** ตรวจ XLSX/JSON/receipt/แถวจริงก่อน commit ไม่เพิ่ม upload หรือ DELETE ใน internal row/project Save ไม่ตีความ timeout, HTTP status หรือ empty search ว่า original request ยุติแล้ว
- **นอกขอบเขต:** DOCX behavior, เปลี่ยนนโยบาย DCM filename/สิทธิ์/role โดยไม่มีการอนุมัติ, migration ที่เดาตำแหน่งหรือแก้ประวัติ, production inventory, push และ deploy. สร้างฟอร์มและบัญชีสังเคราะห์ใหม่ใน sandbox เท่านั้นเมื่อได้อนุมัติเริ่มงาน

## ตั๋วตามลำดับ

`Blocked by` คือ dependency จริง ไม่ใช่แค่ลำดับความสำคัญ. เริ่ม 01, 02 และ 04 แยกกันได้หลังอนุมัติ; 03 ตาม 02 เพื่อทดสอบ end-to-end ว่าได้ทั้ง revision และ bytes ถูกชุด. 07, 08 และ 10 ให้วางแผนการแก้ไฟล์ callback/shared pipeline ไม่ชนกับ 05 แม้ไม่ต้องรอ contract เดียวกันทุกกรณี

| # | ตั๋ว | Priority | Blocked by | Audit |
|---|---|---|---|---|
| 01 | [กำหนดสัญญา commit/recovery ของ Template Draft](issues/01-template-draft-commit-contract.md) | P1 | — | A1–A3 |
| 02 | [Saved viewer อ่านเฉพาะไฟล์ที่ commit](issues/02-committed-only-viewer.md) | P1 | — | R2 |
| 03 | [ตรึง Submission และ revision ของ preview](issues/03-pin-history-preview-revision.md) | P1 | 02 | R1 |
| 04 | [ป้องกันประวัติหายจากการทิ้งร่าง](issues/04-protect-history-on-draft-discard.md) | P1 | ยืนยัน policy | R3 |
| 05 | [บันทึก bindings และ workbook พร้อมกัน](issues/05-atomic-template-draft-save.md) | P1 | 01, 02 | A1–A3 |
| 06 | [จำแนกและซ่อม Template Draft ที่ค้างเดิม](issues/06-diagnose-and-repair-existing-drafts.md) | P2 | 05 | A1–A3, R8 |
| 07 | [ตรวจและแก้ retry เมื่อ ONLYOFFICE ตอบ unchanged](issues/07-plain-xlsx-unchanged-retry.md) | P1 | — | R4 |
| 08 | [ตรวจ link/receipt ใน workbook สุดท้าย](issues/08-verify-final-attachment-projections.md) | P2 | — | R6 |
| 09 | [ตกลงพฤติกรรม routing ระหว่าง internal Save](issues/09-internal-save-attachment-routing.md) | P2 | ยืนยัน policy | R5 |
| 10 | [ตรวจ crash ตอนเริ่มรอบ และ reopen ชน Correction](issues/10-start-crash-and-correction-races.md) | P2 | — | R10 |
| 11 | [แยกหลักฐาน DCM จากผลบันทึก Folio](issues/11-dcm-evidence-and-release-boundary.md) | P1 ด้านข้อมูล | หลักฐาน/สิทธิ์แยกเมื่อจำเป็น | R7 |
| 12 | [ตรวจรับ XLSX ทั้ง flow ใน integration](issues/12-integrated-xlsx-acceptance.md) | P1 gate | 03–10 | A1–A3, R1–R6, R8–R10 |

## การอนุมัติและการตรวจรับ

- หยุดที่ review แผนก่อนแก้โค้ด. ตั๋ว `needs-triage` ยังไม่อนุมัติเริ่ม; `needs-info` มี decision/evidence gate ตามตั๋ว
- เริ่มจาก P1 ที่พิสูจน์แล้ว: 01 → 05, 02 → 03 และพิจารณา guard ของ 04. ทำ 07 เมื่อมี red-capable repro; ไม่รวมทุกเรื่องเป็น patch เดียว
- Local acceptance (12) ไม่ต้องรอ DCM จริง (11) แต่ไม่ใช่ provider/Production release approval. อ้างผลตาม revision และแยก sandbox, native, provider และ human review
- เมื่อ implementation เปลี่ยน flow ให้แก้ [system map](../system-workflow/system-map.md) ตาม [workflow maintenance](../../docs/agents/system-workflow.md). รอบวางแผนไม่เปลี่ยน map ของระบบที่ทำงานอยู่

## Comments

- ผู้ใช้ขอให้จัดแผนเป็นตั๋วตามลำดับ ยังไม่ให้แก้โค้ด
