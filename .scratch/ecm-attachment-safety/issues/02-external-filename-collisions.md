# ป้องกันชื่อชนกับไฟล์นอก Folio ledger

Labels: wayfinder:grilling Type: grilling Parent: ../map.md Assignee: pyw1tt Status: resolved

## Question

จะยอมรับแนวทางและหลักฐานแบบใดเพื่อไม่ให้ชื่อใหม่ของ Folio เขียนทับไฟล์ที่สร้างนอก Folio ledger โดยไม่อ้างว่า local reservation รู้จักทุกไฟล์ใน DCM?

คุยแบบ HITL ด้วย grilling และ domain-modeling ทีม Folio ตัดสินจากหลักฐานที่หาได้และความเสี่ยงที่ human ยอมรับ ไม่รอผู้ประสาน DCM เดิมที่ไม่มีช่องทางติดต่อ และไม่เลือกคำตอบแทน human

## หลักฐานและขอบเขต

- [รายงานตาราง: กรณีชื่อชนกับเจ้าของอื่น](../../ecm-storage-templates/table-upload-behavior-audit.md#e-save-และชื่อปลายทาง-dcm) แยก ledger guards จากการรู้จักไฟล์ภายนอก Folio แล้ว
- Wildcard routing ที่ผู้ใช้ยืนยันอยู่ใน [หลักฐาน routing จากผู้ใช้](../../ecm-storage-templates/planning.md#หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง) การ route สำเร็จไม่พิสูจน์ exclusive namespace
- [สเปกชื่อปลายทางไฟล์ใหม่ข้ามรอบบันทึก](../spec.md) เป็นเจ้าของ cross-save reservation ภายใน Folio ไม่ขยาย claim ว่ามองเห็น external writers

## ประเด็นสำหรับรอบ grilling

1. เจ้าของ DCM รับรอง namespace หรือการปฏิเสธ overwrite แบบ atomic ให้ Folio ได้หรือไม่? ต้องครอบคลุมทั้ง Folio และ external writers ที่ใช้ปลายทางเดียวกัน ไม่สมมติว่าบัญชี Folio แยกเท่ากับ namespace แยก
2. หากมีเพียง search-before-write จะยอมรับ race ระหว่างตรวจและ POST อย่างไร? Search ว่างไม่ใช่ exclusivity proof และไม่ settle คำขอ unknown
3. เมื่อพบชื่อ/identity ที่ไม่รู้จัก จะหยุดก่อนเขียนและให้ใครตัดสิน? ต้องไม่ adopt receipt, rename routing input เอง หรือ DELETE ไฟล์เพื่อเปิดทาง
4. ถ้า provider ไม่มี guarantee ที่พอ จะคง release HOLD หรือมีขอบเขตใช้งานที่เจ้าของอนุมัติพร้อมความเสี่ยงชัดเจนอย่างไร? อย่าบันทึกคำแนะนำเป็นการอนุมัติ

## หลักฐานที่ทำให้ตัดสินได้

- [x] ระบุขอบเขตที่ตรวจได้/ตรวจไม่ได้: Folio ledger ไม่ใช่ inventory ทั้ง DCM; ผู้ใช้ยอมรับ residual external-collision risk โดยไม่รอ exclusive namespace/provider atomic reject-overwrite ไม่มีข้อมูลยืนยันรายชื่อ external writers
- [x] ระบุมาตรการและข้อจำกัด: counter พร้อม durable atomic reservation ข้าม Save ฝั่ง Folio ป้องกันการใช้ชื่อที่ Folio เคยจองซ้ำ แต่ไม่รับประกัน time-of-check/time-of-use safety ต่อ external writers; ข้อเสนอ timestamp ถูกแทนด้วย Q1 A ใน Resolution
- [x] ระบุผลเมื่อไม่มีข้อมูลภายนอก: human ยอมให้อัปโหลดต่อและยอมรับ overwrite หากชื่อ/ปลายทางตรงกัน ไม่บังคับหาเจ้าของหรือ external preflight; หากมีหลักฐาน conflict ใน Folio ให้ guards เดิมหยุด ไม่เพิ่มสิทธิ์ DELETE/retry unknown
- [x] ระบุแผนพิสูจน์ Folio guards ด้วย existing HTTP seam และ controlled external-file/race fixtures ในสเปกแล้ว; รันหลังอนุมัติ implementation ไม่ใช่ผลผ่านจาก session นี้ และไม่แทน real-provider acceptance

## Comments

2026-11-18: ยังไม่มี namespace policy หรือ provider guarantee ที่อนุมัติใหม่ ไม่มี external collision trial ใน session นี้

### 2026-11-18 — pyw1tt — เริ่ม session; รอ human ตัดสิน external namespace gate

- Claim ตาม frontier ของ map; ยังไม่ resolve และยังไม่มี namespace guarantee หรือ provider acceptance ใหม่ ขอบเขตการเปลี่ยนครั้งนี้มีเพียง ticket นี้ ไม่แก้ spec ชื่อข้าม Save, application, callers, tests, fixtures, config, exports, schema หรือข้อมูลจริง
- อ่าน Resolution ของ [หลักฐาน DCM แยกไฟล์ชื่อเติมเลขและคง original bytes](01-provider-independent-resources.md#resolution--2026-11-18--pyw1tt--อนุมัติแผนเก็บหลักฐานโดยทีม-folio) แล้ว: ไม่มีช่องทางประสานผู้รับรอง DCM ทีม Folio เก็บหลักฐานเองได้ตามแผนที่อนุมัติ แต่ยังต้องอนุมัติ execution scope แยก ไม่เสนอให้รอผู้ประสานเดิมอีก
- **Canonical local snapshots:** [สเปกชื่อข้าม Save ข้อ 8, 13 และ 17](../spec.md#implementation-decisions), [สถานะคำถามปัจจุบันและหลักฐาน routing](../../ecm-storage-templates/planning.md#สถานะคำถามปัจจุบัน) และ [รายงานตารางกรณีชื่อชนกับไฟล์ที่ Folio รู้จัก](../../ecm-storage-templates/table-upload-behavior-audit.md#e-save-และชื่อปลายทาง-dcm) แยก local ledger จาก external namespace; routing ที่ผู้ใช้ยืนยันแล้วไม่ใช่ exclusivity proof เอกสารเหล่านี้เป็น Working Tree snapshots ที่อ่านใน session นี้ ไม่ได้ตรวจ committed/deployed revision ใหม่ Baseline `67409b5` เป็น context จาก map ไม่ใช่การยืนยัน revision ของทุกเอกสาร
- **Current Source — supported เฉพาะส่วนที่อ่าน:** CodeGraph เปิด `numberDuplicateAttachmentFilenames` และ `planAttachmentUploads` ใน `apps/server/src/ecm/attachments.ts` ซึ่งจัดชื่อจาก plans ภายใน request และ `EcmClient.upload` ใน `apps/server/src/ecm/client.ts` ซึ่งส่ง POST แล้วตรวจ receipt Source ที่อ่านไม่ใช่หลักฐานว่า provider มี atomic create-only หรือ namespace แยก ไม่ได้รัน application/tests หรือทดลอง collision ใหม่ในงาน planning นี้
- **Recall:** session recall retrieved เวลา 2026-11-18 03:26 UTC ใช้นำทางเท่านั้น; ไม่ยืนยันว่าเป็น Bank `pdms-knowledge` การค้น Bank นี้แบบ `types:["world"]`, `budget:"low"` จึง **skipped** เพราะเครื่องมือที่เปิดให้ใช้ไม่มีพารามิเตอร์เลือก bank/types/budget ไม่มี Hindsight canonical `document_id`, `chunk_id`, `source_path`, `stable_document_id`, `source_revision`/`source_revisions` ให้ยืนยัน ใช้ Markdown ที่เปิดอ่านข้างต้นเป็นหลักฐานแยกต่างหาก ไม่มีการเขียน Hindsight
- **ข้อเสนอรออนุมัติ — release gate:** ทีม Folio รวบรวมขอบเขตปลายทาง ผู้มีสิทธิ์เขียน และหลักฐาน configuration/สิทธิ์ที่บังคับแยก namespace จาก external writers หรือหลักฐาน atomic create-only/reject-overwrite ที่ครอบคลุม writer paths ที่เกี่ยวข้อง หากยังยืนยันไม่ได้ให้ external namespace acceptance คง **HOLD** ไม่อ้างว่าการทดสอบตัวอย่างผ่าน, บัญชีแยก, search ไม่พบ หรือการจองใน Folio ป้องกัน race กับทุกระบบได้ ไม่เพิ่ม prefix/UUID หรือแก้ frozen routing input เพื่อหลบปัญหาเอง การทดสอบที่ทีม Folio ทำเองต้องรายงานเฉพาะ boundary ที่พิสูจน์ได้ ไม่ยกระดับเป็น guarantee ทั่ว provider
- **ข้อเสนอรออนุมัติ — escalation:** เมื่อทราบชื่อ/identity ที่ไม่รู้จักก่อน dispatch ให้หยุด batch ก่อนเขียนและส่งให้ pyw1tt ตรวจขอบเขต/เจ้าของ ไม่ adopt receipt ไม่ DELETE และไม่เปลี่ยนชื่อเพื่อเปิดทางเอง หากพบ conflict หลัง POST ให้ HOLD และรายงานว่าภายนอกอาจถูกเขียนทับแล้ว ไม่อ้างว่า rollback bytes ได้ Unknown outcome ไม่อนุญาต POST/DELETE retry หรือเปลี่ยนชื่อส่งใหม่
- **หลักฐานที่ต้องตามมา:** ใช้ existing HTTP seam กับ controlled external-file และ race fixtures หลังได้รับอนุมัติ implementation ตรวจ exact bytes และ prior saved state ร่วมกัน แยกจาก real-provider acceptance; ไม่มี live calls หรือ authorization ใหม่จากข้อเสนอเหล่านี้ คำตอบด้าน gate และ escalation ยังรอ human จึงไม่ปิด ticket ไม่เปลี่ยน blockers และไม่เพิ่ม Decisions so far

### 2026-11-18 — pyw1tt — เสนอใช้วันเวลาแทนเลขต่อท้าย; ขออธิบาย collision เพิ่ม

- **คำตอบ/ทิศทางจากผู้ใช้:** เสนอ stamp วันเวลาไทยตอน upload และให้กลับไปเปลี่ยนนโยบาย `-(1)`, `-(2)` ฝั่ง Folio เป็นวันเวลา ตัวอย่างที่ให้คือ `18/10/69 10.43.01` ผู้ใช้ยังขอคำอธิบายว่า “ไฟล์ที่ไม่รู้ว่าเป็นของใคร” หมายถึงกรณีใด จึงยังไม่ถือว่าอนุมัติ escalation หรือยอมรับ external collision risk แล้ว
- **ประเด็นที่ต้องยืนยันก่อนแก้สเปก:** `/` ใช้ใน destination filename ไม่ได้ตาม validation เดิม; วันเวลาระดับวินาทีซ้ำได้ใน batch และ requests พร้อมกัน ข้อเสนอรอยืนยันคือวันที่ปี พ.ศ. 4 หลัก เวลา `Asia/Bangkok` และ milliseconds เช่น `18-10-2569_10.43.01.123` ต่อท้ายฐานชื่อก่อน original extension ทุก actual new upload ใน template mode ไม่ใช่เฉพาะชื่อซ้ำ โดยคง durable atomic reservation ฝั่ง Folio และไม่ rename/reupload ไฟล์เก่า
- วันเวลาช่วยลดโอกาสชื่อชนกับระบบอื่น แต่ไม่พิสูจน์ exclusivity หรือ atomic reject-overwrite ของ DCM ต้องให้ human ตัดสินแยกว่าจะคง external namespace gate เดิม หรือยอมรับความเสี่ยงที่เหลือภายใต้ขอบเขตที่ระบุ การเพิ่ม milliseconds ไม่ใช่การรับประกัน uniqueness ข้าม writers
- ตัวอย่าง collision ที่ใช้อธิบายคือระบบอื่นสร้าง destination เดียวกันโดยไม่มีรายการใน Folio ledger; เป็นสถานการณ์ความเสี่ยง ไม่ใช่รายงานว่าพบไฟล์ดังกล่าวจริง หรืออ้างว่า Folio มี external-file search อยู่แล้ว Receipt ที่ไม่เคยพบไม่ใช่ conflict โดยตัวมันเอง เพราะไฟล์ใหม่ปกติก็ต้องได้ receipt ใหม่
- ยังไม่แก้ naming spec หรือประกาศ supersede นโยบายเดิมจนรูปแบบและขอบเขตตรงกัน เมื่อยืนยันแล้วต้องอัปเดตสเปกชื่อข้าม Save และบันทึกการแทนนโยบาย per-batch เดิมโดยรักษาประวัติหลักฐาน ไม่มี application changes หรือ live DCM calls จากรอบสนทนานี้

### 2026-11-18 — pyw1tt — อนุมัติ timestamp และยอมรับ external collision risk

- **Human decision — approved:** ผู้ใช้ตอบ Q1.1 “ได้เลย” ต่อรูปแบบ `<docs_number>-<template_name>-18-10-2569_10.43.01.123.pdf` และการใช้ timestamp แทน `-(n)` สำหรับ actual new uploads ใน template mode และตอบ Q1.2 “ยอมรับความเสี่ยงได้” ต่อชื่อชนจากระบบอื่น ส่วน legacy UUID policy และไฟล์เก่าคงเดิม
- ไม่คง release HOLD เพียงเพราะยังไม่มี exclusive namespace หรือ provider atomic reject-overwrite ผู้ใช้ยอมรับ residual external collision risk ไม่ใช่รับรองว่าไม่มีความเสี่ยง ไม่ใช่การอนุญาตให้เขียนทับไฟล์ที่ทราบว่าเป็นของผู้อื่น และไม่ปลด owner/history/unknown-operation guards หรือ provider acceptance อื่น
- **คำถามเพิ่มเติมยังอยู่ระหว่างอธิบาย:** ผู้ใช้ถามว่า milliseconds ทำให้ชื่อยาว/รกเกินจำเป็นหรือไม่ และยังไม่เข้าใจคำว่าไม่มีรายการใน ledger จึงยังไม่ปิด ticket หรือถือว่าอนุมัติ escalation แล้ว รูปแบบที่อนุมัติมี `.SSS` อยู่; ยังไม่มีคำสั่งตัด milliseconds ออก
- `.123` เพิ่มจากระดับวินาที 4 อักขระ ลดโอกาสหลายไฟล์ฐานเดียวกันชนในวินาทีเดียว แต่แม้ระดับ milliseconds ก็ไม่รับประกัน uniqueness จึงคง durable reservation และตรวจ destination เต็ม ไม่อ้างว่าจำนวนหลักเวลาแทน atomic reservation ได้
- **Ledger ในขอบเขตนี้:** บันทึกการอัปโหลด/ไฟล์/การอ้างอิงในฐานข้อมูล Folio ไม่ใช่รายชื่อทั้งหมดใน DCM Source ที่อ่านผ่าน CodeGraph ในรอบนี้มี `ecmAttachmentVersion`, `ecmAttachmentIdentity` และ `ecmAttachmentReference`; `receiveAttachmentIdentity` สร้าง identity ใหม่เมื่อยังไม่มี paired receipt จึงยืนยันว่า receipt ใหม่ปกติไม่ใช่ conflict โดยตัวมันเอง
- กรณีสมมติที่ใช้ชี้ความเสี่ยงคือคนหรือระบบอื่นอัปโหลดเข้าปลายทาง DCM เดียวกันโดยไม่ผ่าน Folio ฐานข้อมูล Folio จึงไม่ได้รับบันทึกจากการอัปโหลดนั้น หากภายหลัง Folio ส่งชื่อที่ provider map เข้าปลายทางเดียวกัน อาจเขียนทับโดยไม่รู้ก่อน POST ไม่ใช่ผลพบไฟล์จริง ไม่อ้างว่า external upload UI/paths ใดมีอยู่หรือ Folio มี inventory/search ครบ
- อัปเดต [สเปกชื่อข้าม Save](../spec.md), [Storage Templates spec](../../ecm-storage-templates/spec.md), [planning](../../ecm-storage-templates/planning.md), map และ amendment แผน provider evidence ให้ชี้ intended timestamp policy โดยคง historical counter/source/test evidence เดิม ไม่มี application/callers/tests/fixtures/config/exports/schema/DB changes ไม่มี live calls หรือผล timestamp runtime ใหม่

- **Document check:** ตรวจ 11 links/anchors ของ timestamp decision และ canonical implementation/testing sections ใน Markdown ที่แก้ 6 ไฟล์แล้ว ผ่านทั้งหมด ไม่ใช่การรัน application, allocator หรือ DCM และไม่ใช่ provider acceptance

### 2026-11-18 — pyw1tt — อนุญาต overwrite เมื่อไม่มีข้อมูลภายนอก และขอย่อ timestamp

- **Human decision — approved, Q2:** ผู้ใช้ระบุว่าเมื่อไม่มีข้อมูลจากการ upload ที่อื่นและไม่รู้ว่าจะทับหรือไม่ “ให้ทับไปได้เลย” จึงให้ actual upload ดำเนินต่อโดยไม่บังคับพิสูจน์ว่าไม่มีไฟล์ภายนอกหรือหาเจ้าของก่อน ยอมรับความเสี่ยง bytes ของ external file ที่ Folio ไม่รู้จักถูกเขียนทับ ไม่อ้างว่ามี rollback หรือกู้ original ได้
- คำตอบนี้แทนข้อเสนอ escalation สำหรับการขาด external inventory ไม่ใช่การปลด known ownership/history/reference guards และไม่ใช่สิทธิ์ DELETE ไฟล์ไม่ทราบเจ้าของหรือ retry unknown outcome ไม่มีการอนุญาต live calls/implementation/release เพิ่มจาก planning decision นี้ รายละเอียดกฎเจ้าของอยู่ใน [สเปกข้อ 17](../spec.md#implementation-decisions)
- **Q1 ยังเปิดเฉพาะรูปแบบที่ย่อ:** ผู้ใช้ขอให้ย่อ date/time เพราะชื่อเริ่มยาว ข้อเสนอรอยืนยันคือ `YYMMDDHHmmssSSS` เช่น `691018104301123` ใช้ปี พ.ศ. สองหลักและ `Asia/Bangkok` เช่นเดิม มี 15 อักขระเทียบกับรูปแบบเดิม 23 อักขระ คง milliseconds และ durable reservation ไม่แปลว่าชื่อไม่มีทางซ้ำ และไม่แก้ filename ของไฟล์เก่า
- ปีสองหลักแสดงศตวรรษไม่ครบและวนทุก 100 ปี ไม่ใช้ stamp เป็นตัวแทน unique resource/version identity; durable destination reservation ยังต้องไม่ recycle ชื่อ ผู้ใช้ยังไม่ได้อนุมัติรูปแบบย่อนี้ จึงยังไม่แก้ format ใน canonical spec หรือปิด ticket

### 2026-11-18 — pyw1tt — ทบทวน timestamp เพราะ DCM มี stamp แล้ว

- **User-reported evidence:** ผู้ใช้แจ้งว่า DCM stamp เก็บไว้ในระบบอยู่แล้ว และเริ่มเห็นว่าวิธีเติมวันเวลาในชื่อไม่เหมาะ จึงขอคำแนะนำใหม่ รับข้อมูลนี้เป็นหลักฐานจากผู้ใช้ ไม่ทดลองซ้ำ แต่ยังไม่มี field/format/timezone/provider revision หรือ guarantee ว่า stamp ของ DCM ทำให้ชื่อซ้ำเป็น independent versions
- พักการยืนยัน timestamp ทั้งรูปแบบเต็มและแบบย่อ เปิด Q1 ที่ระดับวิธีตั้งชื่อใหม่ ไม่ถือว่าผู้ใช้อนุมัติ counter กลับมาแล้ว ส่วน Q2 และ residual external-overwrite acceptance คงเดิม ไม่เปิดถามซ้ำ
- **ข้อเสนอรอ human ยืนยัน:** ใช้ชื่อฐานเดิมครั้งแรกที่ยังไม่เคยใช้/จอง และเติม `-(1)`, `-(2)` สำหรับ actual new uploads ถัดไป โดยใช้ durable atomic reservation ตรวจ destination เต็มร่วมกันข้าม Save/Responses/scalar/table/process ไม่ reset ทุก batch และไม่ recycle หลังลบ ไม่ใช้ counter ใน memory เป็น guarantee ไม่ยึด row index เป็น identity ไม่ rename/reupload ไฟล์เก่า
- นี่คือ counter แบบข้ามรอบตามแนวสเปกก่อน timestamp ไม่ใช่กลับไปใช้นโยบาย per-batch ที่มีบั๊ก partial replacement การมี stamp ใน DCM ไม่แทนหลักฐาน byte independence ของแต่ละชื่อ และไม่กู้ original bytes ที่ถูก overwrite แล้ว
- เพิ่มป้าย naming decision reopened ในสเปกและปรับ map ให้ตรงสถานะ แต่ยังไม่เปลี่ยน canonical filename contract กลับเป็น counter จนผู้ใช้ยืนยัน ไม่มี application, schema, DB หรือ live DCM changes

### Resolution — 2026-11-18 — pyw1tt — Q1 A และ Q2 A

- **Human decision — approved:** หลังทวนคำถามและตัวเลือกครบ ผู้ใช้ตอบ “q1 : A”, “q2 : A”, “สรุปตามนี้ได้เลย” จึงปิด decision ticket นี้ตามสองคำตอบด้านล่าง ไม่ถือว่าการปิด ticket คือ implementation/release/provider acceptance
- **Q1 A — counter ข้าม Save:** ใช้ชื่อฐานเมื่อยังไม่เคยใช้/จอง แล้วเติม `-(1)`, `-(2)` ก่อน original extension เมื่อฐานไม่ว่าง โดยจอง destination เต็มแบบ durable และ atomic ร่วมกันทุก scalar/table/Response ที่ใช้ namespace ปลายทางเดียวกัน ข้าม Save, processes และ restart ไม่ reset ทุก batch ไม่ recycle หลังลบ/ยกเลิก ไม่เพิ่ม timestamp และไม่เปลี่ยนชื่อไฟล์เก่า ไฟล์/metadata ที่ไม่เปลี่ยนไม่ upload เพิ่ม คง literal suffix, original extension/casing, extensionless และ legacy UUID policy ตาม [canonical filename/reservation contract](../spec.md#implementation-decisions)
- **Q2 A — unknown external files:** เมื่อ Folio ไม่มีข้อมูลจากการ upload ที่อื่น ให้อัปโหลดต่อได้แม้ DCM อาจเขียนทับไฟล์ภายนอกที่ชื่อ/ปลายทางตรงกัน ไม่บังคับ external inventory/search/หาเจ้าของ และไม่ HOLD เพียงเพราะไม่มี exclusive namespace หรือ provider atomic reject-overwrite ผู้ใช้ยอมรับความเสี่ยง bytes เดิมของ external file สูญหาย ไม่อ้าง rollback หรือ recovery
- **ข้อคุ้มครองที่ไม่ถูกยกเว้น:** known ownership/protected-history/reference/eligible-operation conflicts ยังคงหยุดตาม guards เดิม ไม่ authorize arbitrary DELETE หรือ resend unknown POST/DELETE Counter ใหม่ไม่เป็นทางหลบ unknown outcome และการเพิ่มชื่อใหม่ไม่กู้ bytes ที่ถูก overwrite แล้ว
- **Supersession:** ข้อสรุปนี้แทนข้อเสนอ timestamp ทั้งแบบเต็มและแบบย่อ รวมสถานะ naming reopened ในรอบก่อน แต่ไม่ย้อนแก้ผลทดสอบ/source evidence เดิม และไม่กลับไปใช้ per-batch counter ที่เกิด partial-replacement bug ผู้ใช้แจ้งว่า DCM มี stamp อยู่แล้ว; ไม่อนุมานว่า stamp ทำให้แต่ละชื่อมี independent original bytes
- **Evidence status:** intended naming policy และ residual external-risk acceptance **supported โดย human decision**; durable cross-save implementation/tests ยังไม่ได้ทำ Provider suffix/name/case preservation, independent bytes และ unknown settlement ยัง **unverified / HOLD** ตาม tickets เจ้าของเดิม ไม่ได้ยกเลิก release gates อื่น
- **Artifacts:** อัปเดต [สเปกชื่อข้าม Save](../spec.md), [Storage Templates spec](../../ecm-storage-templates/spec.md), [planning](../../ecm-storage-templates/planning.md), map และ [amendment แผน provider evidence](01-provider-independent-resources.md#amendment--2026-11-18--ยืนยัน-counter-ข้าม-save-แทน-timestamp) ให้ชี้กฎล่าสุด ไม่แก้ application/callers/tests/fixtures/config/exports/schema/DB ไม่มี live calls, push หรือ deploy
- **ผลต่อ frontier:** ปิดขั้นตัดสินนี้และ dependency ของ [ตรวจ shared identities เดิมและนโยบายกู้ไฟล์ที่ถูกเขียนทับ](03-existing-aliases-recovery.md) แต่ไม่ส่งต่อ provider independence/recovery guarantee ที่ยังไม่มี ไม่ claim หรือ resolve child ถัดไปใน session นี้ และไม่มี fog ใหม่ที่ต้องแตก ticket

### 2026-11-18 — pyw1tt — เปิดทบทวน Q1 หลังพบ create-new semantics

- ผู้ใช้ขอไล่คุยสิ่งที่ต้องตัดสินและแก้ทีละส่วนหลังทราบ root cause ของ second Submit จึง reopen/claim เฉพาะการทบทวนนโยบายชื่อ ไม่ถือว่าอนุมัติยกเลิก counter หรือให้ implement แล้ว Resolution Q1 A/Q2 A ก่อนหน้ายังคงเก็บเป็นประวัติและเป็น intended policy จนมี amendment ที่ human ยืนยัน
- หลักฐานใหม่มีเจ้าของที่ [หลักฐานยุติ unknown upload และ DELETE ที่เชื่อถือได้](06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต): user finding และ scoped same-name POST สำเร็จ พร้อม before/after original-byte checks ไม่ใช่การรับรองทุกแม่แบบ/ชนิดไฟล์หรือ DELETE isolation
- **Q1 รอคำตอบ:** สำหรับ actual new uploads ใน Storage Template mode จะใช้ฐาน `<docs_number>-<template_name>.<original-extension>` ซ้ำได้โดยไม่เติม counter/timestamp และแยก canonical files ด้วย receipt ของแต่ละ upload หรือจะคง durable cross-save counter ตามเดิม ข้อเสนอแนะนำคือใช้ชื่อฐานซ้ำได้เมื่อ scope ใช้ create-new semantics โดยไม่ถือ filename เป็น file identity; receipt/resource conflict และ unknown guards ยังต้องอยู่
- ไม่เปิด Q2 เรื่องการขาด external inventory เป็นคำถามซ้ำ ไม่เปลี่ยน legacy UUID policy, original extension/casing, JSON shape, one-file-per-slot, unchanged-file reuse หรือไฟล์/Published contracts เดิม และยังไม่ตัดสิน implementation รายละเอียดของ guard แทน human

### Resolution — 2026-11-18 — pyw1tt — ใช้ชื่อฐานซ้ำและแยกไฟล์ด้วย receipt

- **Human decision — approved:** ผู้ใช้ตอบ “เลือกA” ต่อ Q1 ล่าสุดที่เสนอให้ใช้ชื่อเดิมซ้ำโดยไม่เติมเลขหรือเวลา และแยก canonical files ด้วย `file_token`/`file_link` จากแต่ละ original upload response ไม่ใช่ Q1 A แบบ counter ใน Resolution ก่อนหน้า
- **Current template-mode filename:** actual new uploads ใช้ `<docs_number>-<template_name>.<original-extension>` ซ้ำได้ ทั้ง scalar/table slots ใน batch เดียวกันและข้าม Save/Submit/final Save Correction คง original extension/casing; ไม่มีนามสกุลให้จบที่ `template_name` ไม่เติม suffix, counter หรือ timestamp โดย Folio และไม่จัดทำ durable filename reservation เพื่อบังคับชื่อใหม่ทุก upload
- **Supersession:** แทนทั้ง counter ภายใน batch, ข้อเสนอ timestamp และ durable cross-save counter/reservation เดิม เก็บ Resolution/ผลทดสอบเก่าเป็นประวัติ ไม่ถือเป็น acceptance ของกฎปัจจุบัน ถ้า frozen `template_name` มีตัวเลขหรือ `-(1)` อยู่จริงให้คงตามต้นฉบับ ไม่ตัดออกเหมือน generated suffix
- **Identity and unchanged files:** แต่ละคำตอบ/แถว/revision เก็บ receipt ของไฟล์ที่บันทึกจริง ไม่ lookup ชื่อแล้วเลือกตัวแรก/ล่าสุด ไฟล์และ metadata ที่ไม่เปลี่ยนยัง reuse canonical reference เดิม ไม่ upload ใหม่เพราะ Save/reopen/row movement
- **Unchanged boundaries:** legacy UUID policy, old filenames/receipts, frozen Published metadata, original bytes, JSON shape, one-file-per-slot, requiredness/size, permissions, protected references และ unknown no-auto-retry คงเดิม ไม่ rename/reupload/migrate ข้อมูลเก่า
- **Q2 remains:** ไม่เพิ่ม mandatory external inventory/search/หาเจ้าของเพียงเพราะ Folio ไม่มีข้อมูลจาก external writers การยอมรับ residual risk เดิมไม่ใช่หลักฐานว่า DCM overwrite ทุกกรณี ไม่ authorize arbitrary DELETE, adoption จากชื่อ หรือ retry unknown operations
- **Guard dependency:** ชื่อไม่ใช่ file identity แต่รายละเอียดการปรับ admission/receipt/alias guards ต้องคุยใน [ขอบเขต guard สำหรับไฟล์ชื่อซ้ำและ receipt ที่ชนข้อมูลเดิม](09-duplicate-name-guard-policy.md) ไม่ใช้คำตอบเรื่องชื่อเป็นการอนุญาตลบ owner/history/unknown checks ทั้งหมด
- **Evidence / execution:** human naming decision supported; create-new/non-overwriting runtime evidence ยัง scoped ตาม [หลักฐานยุติ unknown upload และ DELETE ที่เชื่อถือได้](06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต) ไม่ใช่ all-type/template/concurrency/DELETE acceptance ยังไม่มี application/schema/DB/live API/commit/deploy changes จากคำตอบนี้
