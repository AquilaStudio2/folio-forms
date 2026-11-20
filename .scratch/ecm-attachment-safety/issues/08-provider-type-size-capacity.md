# หลักฐาน provider รองรับ original files ทุกชนิด ขอบเขตขนาด และ capacity

Labels: wayfinder:task Type: task Parent: ../map.md Assignee: pyw1tt Status: resolved

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
- [ ] แยก initial upload, reopen/read และเปลี่ยน `docs_number` โดย reuse saved original; ไม่ขอให้ User เลือกไฟล์ใหม่เพื่อปกปิด retrieval ที่ไม่รองรับ
- [ ] ถ้าชนิด/ขนาดหรือการเข้าถึงไฟล์ใดยังไม่รับรอง ให้บันทึก partial/insufficient และ human release disposition ไม่เปลี่ยน one-file-per-slot/JSON limit หรือเพิ่ม config/caps โดยไม่ได้ตัดสินแยก
- [ ] แผน live evidence ใช้ synthetic fixtures ที่อนุมัติ ตรวจ collision/ownership ก่อน write มีผู้รับผิดชอบ cleanup และหยุดเมื่อ unknown outcome ไม่ retry POST/DELETE

## เกณฑ์คำตอบ

แนบ sanitized matrix ระบุผล API/receipt/การเข้าถึง URL, provider/human owner, วันที่และขอบเขตที่ยัง HOLD หรือ approved plan พร้อม acceptance ที่ยังต้องรัน การอนุมัติแผนไม่ใช่ผล DCM trial และไม่รับรอง original-byte identity หรือ Production aggregate capacity ที่ไม่ได้ตรวจ

## Comments

2026-11-18: ยังไม่มี all-type/size/capacity provider acceptance ใหม่ ไม่มี live upload/download/DELETE ในงานนี้

### Discussion — pyw1tt — แผนชนิดไฟล์ ขนาด และ capacity รอ human

- Claim เป็น task/HITL เพื่ออนุมัติ evidence plan ไม่ใช่เลือกชนิดไฟล์ใหม่ อ่าน [Resolution เกณฑ์รับไฟล์](../../ecm-attachments/issues/07-pdf-acceptance.md#resolution--2026-11-12--ยืนยันร่วมกับผู้ใช้), [canonical account/transport boundary](../../../CONTEXT.md#ecm-service-account) และรายงานส่วน D แล้ว Product requirement ยังคงทุกชนิด หนึ่งไฟล์ต่อ slot ขนาด 0–10,000,000 bytes รวม encrypted/extensionless ไม่ขอรหัส ไม่ถอดรหัส และไม่มี allowlist/aggregate cap ใหม่
- **Q1 proposed — matrix และเกณฑ์ผ่าน:** ใช้ synthetic representative families ได้แก่ PDF, DOCX/XLSX, image, text, HTML original, benign binary/ZIP, password-protected และ extensionless/case-preserved extensions ตรวจ initial upload, reopen/read และเปลี่ยน `docs_number` โดย reuse saved original ของแต่ละกรณี ไม่บังคับเลือก File ใหม่เพื่อกลบ retrieval failure
- ทุก completed case ต้องมี trusted original receipt และ original bytes/size/SHA-256 ตรง fixture ไม่ใช้ MIME/HTTP 200/viewer หรือ search ชื่อเดียวกันเป็น proof HTML original ต้องได้ original ที่ส่ง ไม่ใช่หน้า preview/error และไม่ถอดไฟล์เข้ารหัสเพื่อรับรองเนื้อหา Matrix เป็นชุดตัวแทนทดสอบ ไม่ใช่ allowlist หรือการรับรองทุก format/combination ที่ไม่ได้ตรวจ
- ตรวจ boundary fixtures 0, 10,000,000 และ 10,000,001 bytes แยกจาก format families โดย 10,000,001 ต้องถูก Folio ปฏิเสธก่อน provider dispatch ไม่ส่ง oversize ไป DCM จริงจากการอนุมัติแผนนี้ คง JSON 262,144 UTF-8 bytes และ trusted slot budget ตามเดิม
- ใช้แนวสองชั้นตามแผนที่อนุมัติแล้ว: isolated actual-app/HTTP + controlled provider พิสูจน์ Folio ก่อน จากนั้น real DCM เฉพาะ matrix/scope ที่ได้รับ execution approval แยก เก็บ environment/date/version เท่าที่ตรวจได้และ result/receipt/bytes evidence แบบ sanitized แยกแต่ละชั้น ทีม Folio เก็บและเสนอให้ pyw1tt ตรวจรับ
- **Q2 proposed — capacity workload:** ในระบบแยกเริ่ม batch 1, 10 และ 20 ไฟล์ที่ไฟล์ละ 10,000,000 bytes รวม 10,000,000 / 100,000,000 / 200,000,000 bytes ของไฟล์ ไม่รวม multipart overhead ครอบคลุม scalar และหลายแถว/คอลัมน์ตาม trusted slots และสอง Responses ต่างกันที่บันทึกพร้อมกัน ไม่ใช้ same-Response lease rejection เป็น capacity result ตัวเลขนี้เป็น workload ทดสอบ ไม่ใช่ product cap หรือคำรับรอง real-provider capacity
- เก็บผลจำนวนไฟล์/ขนาดรวม/จำนวน concurrent Responses/เวลา/timeout/error/resource observations ที่วัดได้ หยุดเพิ่ม workload เมื่อพบ unexpected error หรือ unknown ไม่ retry POST/DELETE เพื่อให้ผ่าน และไม่ตีความการถอด default 128 MiB listener ceiling ว่า batch ไม่จำกัด Real DCM batch/concurrency/quota/rate/timeout scope ต้องอนุมัติแยก ไม่ใช้ workload ระบบแยกเป็นสิทธิ์ยิง DCM จริง
- **เมื่อยังไม่ผ่าน/ไม่ทราบ:** ระบุ partial/insufficient และ remaining release HOLD ตาม type/size/path/capacity ที่ยังขาด ไม่แอบลดเป็น PDF-only/ห้ามไฟล์ว่าง/เปลี่ยนไฟล์/เพิ่ม caps/config หรืออ้างว่า representative samples รับรองทุก Production workload การเปลี่ยน product limit ต้องเป็น decision แยก
- รอผู้ใช้ตอบ Q1/Q2 ไม่มี implementation/fixtures/tests/DB/browser/real API/DELETE/cleanup/commit/push/deploy จากการเปิดตั๋วนี้ การเห็นด้วยภายหลังอนุมัติเฉพาะแผน ไม่ใช่ผล DCM trial หรือ execution authorization

### Resolution — pyw1tt — อนุมัติแผนชนิดไฟล์และขนาดต่อช่อง

- **Human decision:** ผู้ใช้ตอบ Q1 “ตามแนะนำได้เลย” แต่ตัดเกณฑ์เทียบ bytes ของไฟล์อ่านคืนกับต้นฉบับออก และตอบ Q2 ให้ตรวจแต่ละปุ่มของตัวเอง ไม่ต้องตรวจขนาดรวมต่อรอบ จึงปิดขั้นอนุมัติแผนตามขอบเขตที่แก้แล้ว ไม่ถือข้อเสนอ workload/byte comparison ก่อนหน้าเป็นงานที่ต้องรันในตั๋วนี้
- **Approved type/path matrix:** synthetic representative families ยังคง PDF, DOCX/XLSX, image, text, HTML, benign binary/ZIP, password-protected และ extensionless/case-preserved extensions ตรวจ initial upload, reopen/access และเปลี่ยน `docs_number` ผ่าน saved reference ตาม workflow เดิม ไม่บังคับผู้ใช้เลือกไฟล์ใหม่เพื่อกลบ retrieval failure ทีม Folio เก็บหลักฐานและ pyw1tt ตรวจรับ
- **Per-slot size:** ตรวจขนาดจริงของแต่ละ File แยกกันที่ 0 และ 10,000,000 bytes รวมเพดาน ส่วน 10,000,001 ต้องถูก Folio ปฏิเสธก่อน provider dispatch ไม่ส่ง oversize ไป live DCM จากการอนุมัติแผน คงหนึ่งไฟล์ต่อ slot และ requiredness เดิม ไม่เปลี่ยนเป็น PDF-only/ห้ามไฟล์ว่าง/ขอรหัสหรือถอดรหัส
- **Evidence criterion ที่ตัดออก:** ไม่บังคับ upload-versus-download exact bytes/SHA-256 comparison สำหรับ matrix ชนิด/ขนาดของตั๋วนี้ เก็บ API outcome, validated original receipt/paired token-link และ URL access result ตามรอบ/slot แทน ไม่ adopt search result จากชื่อหรือรับ response ผิด schema เพื่อให้ผ่าน ผลชุดนี้รายงานได้เพียงการรับส่ง/อ้างอิง/เข้าถึงตามที่ตรวจ ไม่ใช่ proof ว่าไฟล์ที่อ่านคืนตรงต้นฉบับ ไม่เสียหาย หรือปลอดภัย
- **Calculation clarification:** คำอธิบายของผู้ใช้ว่าต้นทางอาจคำนวณอีกวิธียังไม่ใช่ provider finding การเทียบ bytes/SHA-256 เดิมจะคำนวณจากไฟล์ส่งและรับฝั่งเดียวกัน ไม่ได้เทียบค่า rounded `file_size` หรือ hash ที่ DCM คำนวณคนละวิธี การตัดเกณฑ์นี้เป็นการลดขอบเขต evidence ไม่ใช่หลักฐานว่า original bytes เท่ากัน
- **Capacity workload ที่ตัดออก:** ไม่รันแผน 1/10/20 full-size files หรือ two-Response concurrency เพื่อรับรอง aggregate capacity ในตั๋วนี้ ไม่เพิ่ม batch/aggregate cap/config ใหม่จากตัวเลขทดสอบ และไม่รับรองว่าทุกปุ่มผ่านขนาดแล้ว batch ใด ๆ จะไม่ timeout/เกินทรัพยากร ไม่ใช้การไม่รัน capacity workload นี้เป็น planning/release gate เพิ่มในตั๋วนี้
- **Unchanged safeguards:** ข้อยกเว้นเป็นแผน evidence ของตั๋วนี้ ไม่ใช่อนุญาตลบ runtime integrity/security/original-reuse checks, JSON 262,144-byte/trusted-slot validation หรือ concurrency/reference guards เดิม และไม่ยกเลิกแผนตรวจ identity/history/data recovery ของตั๋วเจ้าของอื่น ผล bytes ที่เคยตรวจจริงยังคงเป็น historical evidence ไม่ลบหรือ relabel ว่าไม่ได้ตรวจ
- **Execution / stop:** ใช้แนว isolated Folio proof ก่อน scoped DCM proof ตามแผนเดิม แต่รอ authorization ให้รันแยก โดยเฉพาะบัญชี/environment/เลขโครงการ/synthetic destination/write/DELETE scope และ cleanup owner หยุดเมื่อ unexpected error/unknown ไม่ auto POST/DELETE retry ไม่แปลง approval นี้เป็น real API permission
- **Remaining acceptance:** matrix ต่อช่องที่ยังไม่รันเป็น pending/insufficient ไม่ใช่ PASS ของ DCM หรือ release ไม่อนุมานว่าไม่มี capability เพียงเพราะยังไม่ตรวจ ข้อกำหนด product และ known ownership/history/unknown guards คงเดิม
- **Tracking:** อัปเดต canonical spec pointers และ map ปิด decision ทั้งเก้าตั๋ว พร้อมทบทวน remaining HOLD ใน parent planning document ตาม workflow ไม่มี application/schema/DB/runtime/browser/live API/commit/push/deploy changes จากการปิดแผนนี้
