# แผนแม่แบบจัดเก็บเอกสาร DCM

บันทึกการวางแผนเท่านั้น ยังไม่ใช่ spec ที่พร้อม implement และยังไม่ได้เปลี่ยน application, schema, migration หรือข้อมูล Forms/Responses รอบล่าสุดผู้ใช้อนุญาตทดสอบ DCM จริงด้วยไฟล์สังเคราะห์ตามขอบเขตท้ายเอกสาร การใช้ shared auth coordinator อาจอัปเดต operational auth cache ตามการทำงานปกติ

## สถานะคำถามปัจจุบัน

- **ข้อ 2 — ปิดแล้ว:** ผู้ใช้ยืนยันพร้อมภาพทดสอบว่าชื่อ/ปลายทางเดิมเขียนทับไฟล์เดิมโดยใช้ token/URL เดิม ไม่ DELETE token เดิมซ้ำหลัง B เขียนทับสำเร็จ และไม่ถามยืนยันเรื่องนี้อีก
- **ข้อ 1 — ปิดแล้ว:** เก็บไฟล์ที่ DCM แห่งเดียว ใช้ `file_link` จาก original upload response เป็นจุดเริ่มต้นดาวน์โหลดไฟล์ต้นฉบับเมื่อจำเป็นต้องนำกลับมาใช้ ไม่เก็บสำเนา attachment originals ใน RustFS หรือ DB
- **ข้อ 3 — ปิดแล้ว:** ใช้ category `id` จาก API เป็น key ผูก `template_name`; `type` ใช้แสดงหัวข้อ/ตัวเลือกเท่านั้น ไม่ใช้ตรวจชื่อโฟลเดอร์หรือรับรองปลายทาง และไม่รอ PM ยืนยันความตรงกันของข้อความก่อนเดินแผน

คำตัดสินเดิมข้อ 1–3 ปิดครบแล้ว ผู้ใช้ยืนยันเพิ่มว่าหน้า Admin ต้องจัดการรายการแม่แบบครบทั้ง list/filter เพิ่ม แก้ไข และลบ การดาวน์โหลดต้นฉบับจาก file_link ให้ได้ทุกชนิดไฟล์และการป้องกัน ownership/history/failure เป็นงานออกแบบและ verification ใน implementation ไม่ใช่คำถามให้ผู้ใช้เลือกที่เก็บไฟล์ซ้ำอีก ผลทดสอบและคำถามเก่าด้านล่างคงไว้เป็นลำดับหลักฐาน ไม่ใช่รายการ blocked ปัจจุบัน

## หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง

- **User-reported runtime evidence:** ผู้ใช้ยืนยันว่า DCM ใช้กฎแพทเทิร์นที่แจ้งจริง และได้ทดลอง upload เข้าเงื่อนไขอื่นแล้ว ระบบจับแพทเทิร์นและแยก folder ปีและหมวดหมู่ได้จริง ตัวอย่างที่แจ้งตามข้อความต้นฉบับคือ `กทอ.68* ก่อหนี้-8 *` และ `กทอ.67* ขอเบิก2 *` ก่อนหน้านี้แจ้ง `กทอ.67*ก่อหนี้-4*` เข้าปี 2567 และหมวด `2. มติและการก่อหนี้`
- รับข้อมูลนี้เป็นหลักฐานจากผู้ใช้ ไม่เปิดคำถามว่ามี wildcard routing หรือแยก folder ปี/หมวดหมู่ได้จริงหรือไม่ซ้ำ ไม่ถือผลจำลอง wildcard ของผู้ช่วยเป็นหลักฐานแทนผลทดสอบของผู้ใช้ และไม่แก้ whitespace ของแพทเทิร์นที่แจ้งโดยเดา semantics
- หลักฐานนี้เพิ่มเติมและแทนสถานะไม่ทราบว่ามีการจับแพทเทิร์นหรือไม่ใน snapshot เก่า เฉพาะ scenario ที่ผู้ใช้ยืนยัน ไม่ได้ระบุผลทดสอบ byte independence ของไฟล์ชื่อเติมเลข, case normalization, namespace ที่ใช้ร่วมกับระบบอื่น หรือ unknown-request settlement จึงแยกประเด็นเหล่านั้นไว้โดยไม่ลดน้ำหนักผล routing ที่ยืนยันแล้ว
- ผู้ใช้สั่งให้ commit งานเดิมทั้งหมดก่อน แล้วเก็บแนวทางป้องกันชื่อชนข้ามรอบเป็นสเปก และใช้ Wayfinder หรือ grill-with-docs กับความเสี่ยงคงเหลือ คำสั่งนี้เป็นงานวางแผน ไม่ใช่การอนุญาตแก้ application/DB หรือทดสอบเขียน DCM จริงเพิ่มเติม

## ข้อแก้ไขนโยบายชื่อซ้ำภายใน batch — 2026-11-17

ผู้ใช้อนุญาตให้เปลี่ยนนโยบายเฉพาะ storage mode `template`: หนึ่ง explicit Save Draft/Submit/final Save Correction upload batch ใช้ namespace เดียวรวม scalar/table upload plans ตามลำดับ slot เดิมที่ deterministic รายการแรกของ natural base filename คงเดิม รายการซ้ำเติม `-(1)`, `-(2)` ทันทีหน้า original extension โดยคง casing; ไม่มี original extension ให้เติมท้าย เช่น `กทอ.xx-xx-xxxx-ก่อหนี้-4_ขยาย(45)-(1)`

จอง natural base filenames ทั้ง batch ก่อนจัดชื่อ และข้าม suffix ที่ชน natural base ของแม่แบบอื่นหรือชื่อที่จัดให้แล้ว เช่นแม่แบบที่มี literal `-(1)` ต้องได้ชื่อเดิม Counter reset ทุก batch ไม่จองข้าม save ไม่ rename ไฟล์เก่า ไม่แก้ frozen `template_name`, original answer metadata หรือ ledger schema และ ledger เก็บ destination filename ที่ส่งจริง Legacy UUID policy คงเดิม ไม่เพิ่ม row IDs/schema/config/UI

ข้อแก้ไขนี้ supersede การยอมส่งชื่อซ้ำ unchanged ภายใน batch และข้อห้าม suffix เฉพาะกรณีนี้ ไม่เปลี่ยนคำตัดสินปิดแล้วข้อ 1–3 ไม่ข้าม ownership/history/unknown-operation guards และไม่เพิ่ม POST/DELETE retry ดู contract ฉบับเต็มที่ [spec ข้อ 6](spec.md#6-template-mode-upload)

**Local implementation verified:** [BATCH evidence](acceptance-matrix.md#batch-filename-verification) มี final HTTP 143 ผ่าน/0 fail และ standalone real-listener smoke ที่ได้ชื่อเดิม/`-(1)`/`-(2)` พร้อม bytes แยก physical rows คง guard เดิม ผล native/HTTP/provider ก่อนหน้าเป็น historical evidence ไม่ใช่หลักฐานใหม่นี้ ไม่มี live DCM calls การจับแม่แบบ/ปลายทางของชื่อเติมเลขยัง **unverified / HOLD** ไม่รับรอง DCM acceptance, cross-batch uniqueness หรือ token/URL อิสระทุกไฟล์


## สิ่งที่ผู้ใช้ต้องการ

1. เพิ่มตารางเก็บ `template_name` กับ `document_category_id` โดย ID มาจาก DCM `GET /api/beeecm/public/document/category`
2. เพิ่มหน้าใน Admin navigation สำหรับกรอกชื่อแม่แบบและเลือกหมวดจาก DCM เพื่อบันทึก mapping
3. ใช้ popup ของปุ่มแนบไฟล์ Excel เดิม เลือกหมวดก่อน แล้วเลือกแม่แบบที่สัมพันธ์กับ category ID นั้น หมวดที่ไม่มีแม่แบบต้องเลือกไม่ได้
4. เปลี่ยน multipart upload เป็น `template="1"` กับ `documentFile` เท่านั้น ไม่ส่ง `documentYear`, `documentNumber`, `documentCategory` แยกใน flow ใหม่
5. ผู้ใช้เสนอ filename stem เป็น `<docs_number>-<template_name>` และแจ้งว่า DCM จะสร้างโฟลเดอร์ให้ การแยกฉบับ การรักษานามสกุล และพฤติกรรม provider ต้องตรวจให้ชัดก่อนล็อก contract

## ข้อสรุปจากผู้ใช้

- สำหรับรูปแบบใหม่ ไม่บังคับว่าปุ่มแนบไฟล์ต้องมี Tag `fiscal_year` ตรวจ metadata สำหรับตั้งชื่อเหลือ `docs_number` กับ `template_name`; ฟอร์มที่เผยแพร่แล้วคง contract เดิมตามคำตอบ Q2
- ข้อนี้ไม่ใช่การลบ Field/คำตอบปีเดิม ไม่ใช่การยกเลิก file validation, requiredness, authorization หรือการป้องกันข้อมูลสูญหาย
- ใช้คำว่า **Storage Template / แม่แบบจัดเก็บเอกสาร** สำหรับตัวเลือกปลายทางที่ Admin ควบคุม ภายใต้ Document Category แยกจาก Template Draft/Published Template ของ Form และไม่ใช่คำตอบที่ User กรอก บันทึกคำจำกัดความใน domain context แล้ว

## ข้อสรุปรอบแรก

### Q1 — ไฟล์ร่างที่ถูกแทนที่ กับข้อมูลเดิม

คำชี้แจงล่าสุดของผู้ใช้: ร่างที่เคยบันทึกไฟล์ A แล้วกลับมาเปลี่ยนเป็น B และส่งสำเร็จ ต้องเหลือ B โดย A ถูกลบและเปิดไม่ได้ ไม่ต้องเก็บทุกไฟล์ร่างเป็นประวัติ เมื่อส่งสำเร็จปุ่มแนบไฟล์แสดง URL ของ B แทน

เรื่องนี้แยกจากการคงข้อมูล User ที่บันทึกภายใต้การตั้งค่าเก่า และไม่ใช่คำสั่งให้ลบไฟล์ที่ข้อมูลฉบับอื่นยังอ้างอิง การยืนยันก่อนหน้าว่ารักษาประวัติไม่ควรถูกตีความว่าเก็บ A ทุกฉบับร่างตลอดไป

### Q2 — ฟอร์มที่เผยแพร่แล้ว

ผู้ใช้ยืนยัน: ใช้รูปแบบใหม่กับฟอร์มที่เผยแพร่ใหม่/ทำสำเนา โดยคง Published Template และ Responses เดิม

ผลต่อแผน: ไม่ทำ migration ปลายทาง ไม่แก้ published contracts หรือข้อมูลเดิมย้อนหลัง การคง contract เดิมไม่ใช่การอนุญาตให้ใช้ชื่อไฟล์ใหม่ทับข้อมูลประวัติ

### Q4 — ที่มาของ template_name

ผู้ใช้ยืนยัน: `template_name` เป็นค่าที่ Admin เลือกจากรายการแม่แบบใน popup ของแต่ละปุ่ม/คอลัมน์ ไม่ใช่ Tag ใหม่ที่ User ต้องกรอก

ผลต่อแผน: รักษา User `docs_number` Tag เดิม ส่วน Storage Template เป็น attachment configuration ที่ Admin กำหนดและตรึงเมื่อเผยแพร่ หมวดที่ไม่มี Storage Template เลือกไม่ได้ และต้องตรวจความสัมพันธ์ category ID กับ template ฝั่ง server ไม่อาศัยการ disable ใน UI อย่างเดียว

## หลักฐานและข้อจำกัด

- Canonical ปัจจุบัน: [ECM attachment implementation spec](../ecm-attachments-implementation/spec.md) ส่วน 2–7 เป็น contract เดิม ไม่ใช่หลักฐานว่าแผนใหม่นี้ implement แล้ว
- [Domain context](../../CONTEXT.md): Attachment Field, Document Category, ECM Service Account และ immutable Published Template
- [ADR 0003](../../docs/adr/0003-pdms-project-name-choices.md): project-name answer ไม่ใช่ project identity จึงไม่อนุมานเลขหนังสือจากชื่อโครงการ
- [ADR 0004](../../docs/adr/0004-results-filters-use-scalar-field-tags.md): `fiscal_year` เป็น scalar root Tag สำหรับค้นหา การเลิกใช้เป็น upload prerequisite ไม่ได้เปลี่ยน filter contract
- Current Folio Working Tree: `EcmClient.categories` ทิ้ง numeric category ID และคืนชื่อ; `loadAttachmentCategories` cache/validate เป็นชื่อ; `planAttachmentFile` ใช้ `fiscal_year`, `docs_number`, category และ UUID ในชื่อไฟล์ การปรับใหม่จึงต้องตามถึง authoring, publication, saved contracts, correction/refetch และ filename/upload planning ไม่ใช่แก้เฉพาะ popup
- Scope investigation อ้าง baseline `3ec718a5c7ec34549c0c8c5521310a38f66ee00c` พร้อม Working Tree ไม่ใช่ deployed/Production evidence
- Hindsight discovery ครั้งแรก failed: `recall-timeout`, 20,029 ms การค้นอัตโนมัติหลังคำชี้แจง `fiscal_year` retrieved แต่เป็นผลเรื่อง filters/dashboard ที่ไม่ยืนยัน ECM template contract จึงไม่ใช้แทน canonical/source
- ณ รอบอ่านเอกสารก่อนอนุญาตทดสอบจริง: อ่านเอกสาร DCM และ current Ongoing multipart construction แล้ว รองรับรูปแบบคำขอ `template="1"` กับ `documentFile` ตามรายละเอียดด้านล่าง แต่ยังไม่ยืนยัน filename grammar, category disambiguation, folder creation หรือ duplicate/version semantics ของ provider รอบนั้นไม่ได้เรียก live ECM หรือใช้ credentials ผล live รอบที่ได้รับอนุญาตจะแยกบันทึกด้านท้าย

## ผลตรวจรูปแบบคำขอ

- **Supported — request shape:** [เอกสาร UploadFile ทางการ](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1) ระบุ `documentFile` เป็น File, `template=true` คือการอัปโหลดตามเงื่อนไขจากชื่อ และสาม field `documentYear`, `documentNumber`, `documentCategory` มีเงื่อนไขเมื่อ `template=false` อ่านเฉพาะ upload contract จาก public collection ที่ตอบ HTTP 200 ไม่คัดลอก login metadata, credentials หรือ token ตัวอย่าง เอกสารออนไลน์ไม่ให้ revision จึงไม่อ้างเป็น snapshot version ที่ระบุไม่ได้
- **Supported — current caller/provider adapter:** [Ongoing ECM service](../../../pdms-ongoing-backend/src/features/ECM/ecm.service.ts#L268-L291) append ไฟล์จริงพร้อม `fileName`, append `template` เป็น `"1"`/`"0"` และ append สาม metadata เฉพาะเมื่อ template เป็น false นี่เป็นหลักฐานโครงสร้างคำขอใน Working Tree ไม่ใช่ผลการอัปโหลดจริงหรือหลักฐานว่า DCM สร้างโฟลเดอร์ได้ตามตัวอย่างทุกกรณี
- **Partial — canonical snapshot:** [Ongoing services — ECM](../../../pdms-ongoing-backend/docs/knowledge/integrations/ongoing-services.md#ecm), Stable Document ID `pdms-ongoing-backend.integration.ongoing-services`, baseline `e51f2245fab13d55676de46ceb4781903ec41470` พร้อม Working Tree ที่ตรวจวันที่ `2026-11-11T21:04:08.237156+00:00`, status `phase2-partial`, Human Review `pending` เอกสารระบุชัดว่าไม่มี external ECM implementation/deployed contract จึงใช้เป็นหลักฐาน local request handling เท่านั้น
- **ช่องว่าง ณ รอบอ่านเอกสาร:** ชื่อแม่แบบต้องมีอยู่ใน DCM ก่อนหรือไม่, ชื่อเดียวกันหลาย category จะแยกอย่างไรเมื่อไม่ส่ง category ใน body, วิธีเลือกปี/สร้างโฟลเดอร์, การเขียนทับ และวิธีแยกเวอร์ชันที่ไม่ทำลายการจัดเส้นทาง ยังไม่มีหลักฐานเพียงพอที่จะยืนยันจากเอกสาร ไม่ใช้ regex เฉพาะ PDF ของ Ongoing เป็นข้อจำกัดไฟล์ของ Folio คำตอบผู้ใช้และผล live เพิ่มเติมอยู่ท้ายเอกสาร ไม่ถือว่ารายการช่องว่างเดิมเป็นผลทดสอบปัจจุบัน

## ขอบเขตหน้า Admin ตามโจทย์

- เพิ่มหน้า navigation **แม่แบบจัดเก็บเอกสาร** สำหรับ Admin โหลด category จาก DCM แสดง `type` เป็นหัวข้อใน select และใช้ `id` กรอง/ผูก Storage Template ใต้หัวข้อนั้น หน้าเดียวกันต้อง list เพิ่ม แก้ไขชื่อ/หมวดที่ผูก และลบรายการได้ครบ ไม่เพิ่มการกรอกปลายทางให้ User
- ตรวจสิทธิ์ Admin ฝั่ง backend ด้วย ไม่อาศัยการซ่อนเมนูเพียงอย่างเดียว ใช้ ECM service account/shared login coordinator เดิม ไม่ส่ง credentials หรือ service Bearer ให้ browser
- CRUD นี้จัดการ catalog ใน Folio เท่านั้น ไม่สร้าง/แก้/ลบ template หรือโฟลเดอร์ DCM และไม่ลบไฟล์ User การแก้/ลบรายการกลางไม่เปลี่ยน snapshot ที่ตรึงใน Published Template หรือคำตอบเดิม
- ตารางที่วางแผนมี identity ภายใน, `template_name` ที่ไม่ซ้ำทั้งรายการส่วนกลาง และ `document_category_id` จากรายการ DCM ปุ่ม/คอลัมน์เลือก mapping ที่สัมพันธ์กัน และ published contract ตรึงค่าที่เลือกไว้ ไม่เปลี่ยนตามรายการส่วนกลางย้อนหลัง ยังไม่สร้างตารางหรือ migration ระหว่างการวางแผน

## ข้อสรุปรอบสองและคำถามที่ยังเปิดอยู่

### Q5 — ชื่อแม่แบบซ้ำข้ามหมวด

ผู้ใช้ยืนยัน: `template_name` ต้องไม่ซ้ำทั้งรายการส่วนกลาง แม้คนละ Document Category

ผลต่อแผน: กำหนด uniqueness ของชื่อข้าม category ใน Folio เพราะ request ใหม่ไม่ส่ง category แยกและยังไม่มีหลักฐานว่า DCM จะแยกชื่อแม่แบบเดียวกันข้ามหมวดได้ Local uniqueness ไม่ใช่หลักฐานว่า template มีอยู่หรือปลายทาง DCM ถูกต้อง

### Q6 — สถานะข้อเสนอรหัสแยกฉบับ

ประวัติคำตัดสินก่อนข้อแก้ไขนโยบายชื่อซ้ำด้านบน: ยังไม่ได้อนุมัติ UUID/รหัสฉบับเพื่อเก็บ A หลังแทนด้วย B ข้อแก้ไขล่าสุดอนุญาตเฉพาะ counter ของชื่อซ้ำภายใน batch ไม่ใช่ version ID และไม่เปิดคำถามเดิมเรื่องเก็บ A ซ้ำ

คำถามรอบแรกเรื่องชื่อซ้ำ/token ปิดแล้วตามคำตอบและภาพทดสอบของผู้ใช้วันที่ 2026-11-17: กรณีชื่อ/ปลายทางเดิมใช้ token/URL เดิมและเขียนทับไฟล์เดิม ห้ามอัปโหลด B แล้ว DELETE token A ซ้ำเมื่อเป็น identity เดียวกัน ยังคง ownership/reference checks ไม่เปลี่ยนชื่อโดยพลการนอกข้อแก้ไข batch numbering ที่ผู้ใช้อนุญาตด้านบน

## วงจรไฟล์ User ที่ยืนยันล่าสุด

- User บันทึกร่างด้วยไฟล์ A จากนั้นเปิดร่างเดิม เลือก B และกดส่ง ต้องบันทึก canonical file_link/file_token ของ B และแสดง URL ของ B หลังส่งสำเร็จ
- การเลือก B อย่างเดียวไม่ทำ external upload/delete ตามจังหวะ Save/Submit เดิม เพื่อกันข้อมูลหาย ข้อเสนอคือยืนยัน upload และ canonical save ของ B ก่อนลบ A ถ้า B ไม่สำเร็จต้องไม่ลบ A ล่วงหน้า
- ลบ A ผ่าน reference ที่ server เชื่อถือและตรวจว่าไม่ใช่ไฟล์ B/ไม่ถูกข้อมูลฉบับอื่นอ้างอิงแล้ว ต้องมีผลยืนยันการลบ ไม่อ้างว่า A เปิดไม่ได้จากการเปลี่ยน JSON หรือ UI เพียงอย่างเดียว ผู้ใช้ยืนยันว่าหาก DELETE ล้มเหลวให้ B ส่งสำเร็จพร้อมคำเตือนว่า A ยังลบไม่สำเร็จตาม Q7

## การเผยแพร่ค่าจัดเก็บใหม่ของ Admin

- ตัวอย่างผู้ใช้: ชุดแรกเลือกหมวดชื่อ `2.มติ` กับแม่แบบ `ยืนยันรับสนับสนุน`; อีกสองเดือนเลือกหมวด `3.บันทึกตรวจเบิก` กับแม่แบบ `ตรวจเบิก1-Checklist` แล้วเผยแพร่ใหม่ หมายเลขหน้าชื่อหมวดไม่ใช่หลักฐานของ numeric category ID ต้องใช้ ID ที่ API ตอบจริง
- ข้อมูล User ที่บันทึกไว้ก่อนหน้า, file_link/file_token และปลายทางที่ใช้แล้วต้องไม่ถูกเปลี่ยนตาม master/config ใหม่ ไม่ย้าย ไม่ rename ไม่ re-upload และไม่ลบไฟล์เก่าเพียงเพราะ Admin เผยแพร่ค่าชุดใหม่
- ผู้ใช้ยืนยันให้ Admin ทำสำเนาฟอร์ม เปลี่ยน category/template แล้วเผยแพร่เป็นฟอร์มใหม่ ได้ลิงก์กรอกใหม่ ข้อมูลและร่างในฟอร์มต้นฉบับคงชุดเดิม ผู้ใช้ที่เข้า link ของสำเนาเริ่มด้วยชุดใหม่ ไม่เปลี่ยนหรือ redirect ลิงก์ต้นฉบับอัตโนมัติ
- ใช้กลไก immutable Published Template/duplicate ที่มีอยู่ ไม่เพิ่มการแก้ Published Template หรือการเผยแพร่ค่าจัดเก็บเวอร์ชันใหม่บนลิงก์ฟอร์มเดิมในแผนนี้

## ข้อสรุปรอบล่าสุด

### Q7 — บันทึก B แล้ว แต่ลบ A ไม่สำเร็จ

ผู้ใช้ยืนยัน: ให้ B ส่งสำเร็จพร้อมคำเตือนว่า A ยังลบไม่สำเร็จ

รักษา B และติดตามงานลบที่ค้างตาม recovery/cleanup pattern เดิม ไม่อ้างว่า A ถูกลบแล้ว ไม่ rollback B หรือ retry DELETE ที่ผลไม่แน่นอนอัตโนมัติ

### Q8 — ฟอร์มเดิมหรือลิงก์ใหม่

ผู้ใช้ยืนยัน: ทำสำเนาฟอร์มเป็นฟอร์มใหม่ มีลิงก์กรอกใหม่ โดยข้อมูล/ร่างในฟอร์มต้นฉบับยังใช้ค่าชุดเดิม

ไม่เพิ่มระบบแก้ฟอร์มที่เผยแพร่แล้วหรือใช้ลิงก์เดิมสำหรับค่าชุดใหม่ การทำสำเนาคัดลอกเฉพาะต้นแบบและการตั้งค่า ไม่คัดลอก Responses/ไฟล์ User หรือย้ายข้อมูลเดิม

## แผนรวมสำหรับยืนยันความเข้าใจ

### ข้อมูลและหน้า Admin

1. เพิ่ม Storage Template catalog ในฐานข้อมูล Folio มี identity ภายใน, `template_name` ที่ไม่ซ้ำข้าม category และ `document_category_id` ที่มาจาก API จริง ไม่อนุมาน ID จากเลขหน้าชื่อหมวด
2. เพิ่มหน้า navigation **แม่แบบจัดเก็บเอกสาร** สำหรับ Admin เลือกหัวข้อจาก `type` ของ category API โดยเก็บ/ส่ง category `id` เป็นค่าของ select จากนั้น list/filter template_name ใต้ ID นั้น และเพิ่ม แก้ไขชื่อหรือหมวดที่ผูก และลบรายการได้ครบ ฝั่ง backend ตรวจ Admin/ข้อมูล/ชื่อซ้ำ ใช้ ECM client และ shared auth เดิม ไม่ส่ง credentials หรือ service Bearer ไป browser
3. CRUD mapping เป็นการจัดการ catalog ใน Folio ไม่ใช่จัดการ DCM โดยตรง การแก้/ลบไม่ย้าย/rename/re-upload/DELETE ไฟล์ ไม่แก้ค่าที่ตรึงใน Published Template/Responses และไม่ทำ live lookup มาเปลี่ยนสัญญาเก่า รายการที่ลบไม่ปรากฏให้เลือกตั้งค่าใหม่ ส่วน Template Draft ที่ยังไม่เผยแพร่ต้องเลือก mapping ปัจจุบันที่ถูกต้องก่อน publish โดยยังบันทึกร่างที่ไม่ครบได้ตามกติกาเดิม

### การตั้งค่าปุ่มใน Excel

4. ใช้ปุ่มและ external popup เดิม เลือก category ก่อน จากนั้นเลือก Storage Template ที่อยู่ใน category ID นั้น หมวดที่ไม่มี mapping ให้เลือกไม่ได้ เปลี่ยนหมวดแล้วต้องไม่เหลือ template จากหมวดก่อน
5. ยืนยันทั้งสองค่าก่อนบันทึกปุ่ม/การตั้งค่า ฝั่ง server ตรวจ mapping กับ category ID ไม่เชื่อ client หรือการ disable UI ลำพัง ใช้กติกา auto-tag/requiredness/native binding/dirty state เดิม
6. เก็บค่าปลายทางที่เลือกใน contract ของฟอร์ม ไม่ให้ User กรอก template_name เป็น Tag ใหม่ และไม่ lookup ค่า master ปัจจุบันมาเปลี่ยนปลายทางของข้อมูลที่บันทึกแล้ว

### Upload และการเปลี่ยนไฟล์

7. รูปแบบใหม่ตรวจ `docs_number` จาก root Tag กับ Storage Template ที่ Admin เลือก ไม่บังคับ Tag `fiscal_year` แต่ไม่ลบ Field/คำตอบปีหรือข้าม required Field rules อื่นของฟอร์ม
8. ส่ง original bytes เป็น multipart `documentFile` พร้อม `template="1"` เท่านั้น Base filename เป็น `<docs_number>-<template_name>.<original-extension>`; คง original extension/casing และไม่เติมนามสกุลเอง ชื่อซ้ำภายใน batch ใช้ counter ตามข้อแก้ไขนโยบายด้านบน ไม่เพิ่ม UUID/รหัสฉบับหรือ row identity
9. เลือกไฟล์อย่างเดียวไม่ upload ใช้จังหวะ Save Draft/Submit เดิม เมื่อ B เขียนทับด้วย token/identity เดียวกับ A ไม่ DELETE token นั้นซ้ำ กรณีไฟล์คนละ identity ทำ cleanup A หลัง canonical B commit และผ่าน ownership/reference checks เท่านั้น ถ้าลบ A ไม่สำเร็จ B ยังส่งสำเร็จพร้อม warning ที่คงอยู่ และไม่อ้างว่า external in-place overwrite สามารถ rollback ด้วย DB transaction ได้
10. Canonical JSON เก็บ URL/token/ชื่อเดิม/ขนาดตาม contract เดิม หลัง Submit แสดง URL ของไฟล์ที่บันทึกแทนปุ่มในโหมดดู/ส่งออก ส่ง URL ของ provider ตามจริง ไม่ export file token เป็น field แยก และไม่ส่ง service Bearer/credentials ลง workbook ทั้งนี้ URL ของ provider อาจมี file token อยู่ใน query ตามผล live ท้ายเอกสาร
11. คงทุกชนิดไฟล์, ขอบเขต 0–10,000,000 bytes, requiredness, row ownership, validation และการป้องกัน unknown outcomes ของระบบเดิม ไม่ยืม PDF-only gate ของ Ongoing หรือเพิ่มการ retry upload/delete อัตโนมัติ

### เผยแพร่และข้อมูลเดิม

12. เปลี่ยนค่าชุดใหม่ผ่านการทำสำเนาฟอร์มแล้วเผยแพร่ ได้ Form/link ใหม่ ต้นฉบับและข้อมูล/ร่างเดิมไม่เปลี่ยน ไม่มี migration/rename/re-upload ของไฟล์เดิมจากการแก้ตั้งค่า และไม่มี redirect ลิงก์เก่าอัตโนมัติ
13. ฟอร์มเผยแพร่เดิมใช้ contract เดิมต่อ ฟอร์มใหม่ต้องเลือก mapping ครบก่อนเผยแพร่ ข้อมูลที่สร้างผ่านสำเนาชุดใหม่ใช้ค่าชุดใหม่ ไม่เพิ่ม in-place form/config versioning

### ลำดับงานและการตรวจ

- ข้อ 1–3 ได้คำตอบครบ ใช้ DCM-only, category-ID grouping และ overwrite/no-extra-DELETE เป็นข้อกำหนดของแผน เพิ่ม Admin CRUD ครบตามคำยืนยันล่าสุด ยังไม่เริ่มแก้ application
- ใช้ HTTP integration seams เดิมกับฐานข้อมูลแยกและ DCM จำลอง: Admin-only CRUD/filter ตาม category ID, ชื่อซ้ำข้าม category, แก้/ย้าย/ลบแล้ว list สองชั้นไม่ค้างค่าผิดหมวด, mapping ที่ถูกลบกับ Draft/Published snapshots, ไม่มี fiscal_year, multipart สอง field/original bytes, ดาวน์โหลดจาก trusted file_link ที่เป็น viewer/redirect/download flow โดยไม่รับ HTML แทนไฟล์, B สำเร็จ/ล้มเหลว, same-token overwrite ไม่ DELETE ซ้ำ, saved-reference reuse และข้อมูลเดิมไม่เปลี่ยนจากการแก้ catalog
- ตรวจ native Excel popup และปุ่ม/URL จริงด้วย ONLYOFFICE รวมการเปิดอ่าน/ส่งออก ภายหลัง implementation ไม่ใช้ unit tests หรือ HTTP 200 เพียงอย่างเดียวแทน UI/provider acceptance
- ทดสอบ live ECM ได้เฉพาะขอบเขตที่ผู้ใช้อนุญาตล่าสุดตามหัวข้อท้ายเอกสาร ตรวจการชนก่อนเขียน ใช้ไฟล์สังเคราะห์ และไม่ใช้ข้อมูลหรือไฟล์จริงของ User เป็น fixture

## หลักฐาน DCM ที่ยังขาดก่อนเปิดใช้ upload ใหม่

1. งานตรวจเทคนิคก่อนเปิดใช้: filename grammar ที่มีขีด/นามสกุลและไม่มีนามสกุล, การโหลด original bytes จาก trusted file_link สำหรับทุกชนิดไฟล์และขนาดที่อยู่ในขอบเขต, auth/redirect/error/timeout และผล in-place overwrite ตรวจเนื้อหาจริง ไม่ใช้เพียง HTTP 200 หรือการเปิดหน้า viewer สำเร็จแทน proof ข้อนี้ไม่ใช่ gate ให้ PM ตรวจชื่อ type เทียบกับ folder label
2. **ปิดแล้ว:** กรณี overwrite ที่ผู้ใช้ยืนยันใช้ token/URL เดิม ไม่ DELETE token เดิมซ้ำ ผลรอบก่อนที่ได้ token ใหม่เป็นหลักฐานเฉพาะตัวอย่างนั้น ไม่ใช่เหตุให้ถามข้อ 2 ซ้ำหรือรอ DCM มายืนยันคำตอบเดิมอีก
3. ข้อยกเว้นชั่วคราวเดิมที่ยอมส่งชื่อซ้ำ unchanged ภายใน batch **ถูกแทนที่แล้ว** ด้วยข้อแก้ไขนโยบายด้านบน ต้องตรวจ batch-wide numbering และ natural-base reservation โดย parent ส่วนชื่อข้าม batch ยังอาจ overwrite และ provider suffix routing ยัง unverified / HOLD ไม่รับรอง independence
4. เดิมเอกสาร Postman/current Ongoing code ยืนยันได้เฉพาะ request shape ต่อมาผู้ใช้ให้คำตอบจาก DCM และอนุญาตทดสอบ API จริงเฉพาะชื่อที่ระบุในหัวข้อรอบทดสอบด้านล่าง การยืนยันคำตอบยังต้องแยก user-reported contract ออกจากผล runtime ที่สังเกตจริง

สถานะ: คำตัดสินข้อ 1–3 ปิดครบแล้วตามผู้ใช้ เก็บ DCM แห่งเดียว ใช้ category ID สำหรับ grouping และทำ Admin CRUD ครบ ไม่มีคำถามเดิมค้างให้ตอบ ยังไม่ได้เริ่ม implementation/migration และการปิดแผนไม่ใช่การรับรองว่า downloader/CRUD ถูกพัฒนาหรือผ่าน Production acceptance แล้ว

## ผลตรวจ DB และ metadata เพิ่มเติม

- ไม่ใช่แค่เพิ่ม catalog ใหม่: [Prisma schema ของ Folio](../../packages/db/prisma/schema.prisma) ปัจจุบันมี `DraftFieldRule.attachmentCategory` และ `ManifestField.attachmentCategory` สำหรับ metadata ที่ตรึงตาม lifecycle ส่วน `EcmAttachmentVersion.fiscalYear` ยังเป็น String ที่บังคับ และ `fileToken` มี unique constraint (Working Tree ที่ตรวจ: schema lines 257, 319, 704–720)
- แผน migration ต้องเพิ่ม metadata แม่แบบ/หมวด ID/โหมดจัดเก็บในชั้น Draft/Published และ operational receipts ตาม pattern เดิม ให้โหมดใหม่ไม่มี fiscalYear ได้โดยรักษาค่าของข้อมูลเก่า ไม่ใส่ปีปลอม ไม่ยัด routing metadata ลง ExcelBinding ที่มีหน้าที่ placement เท่านั้น และไม่ถอด file-token uniqueness เพื่อกลบ provider collision โดยไม่มี contract รองรับ
- สำหรับโหมดใหม่ การแก้ fiscal_year อย่างเดียวไม่ทำให้อัปโหลดใหม่ หาก docs_number เปลี่ยนและไม่มีไฟล์ใหม่ ให้ server โหลด original bytes จาก file_link/token ของ committed reference ที่ตรวจ ownership/account แล้ว ก่อนตั้งชื่อและส่งไป DCM ใหม่ ไม่บังคับ User เลือกไฟล์ซ้ำและไม่เพิ่ม RustFS original cache
- ตรวจ public collection ครบพบ 5 endpoints: login, document/category, search, POST file และ DELETE file ไม่พบ template/version lookup contract ที่ตอบเรื่องชื่อซ้ำหรือ identity เพิ่มเติม การอ่านครั้งนี้ติดต่อเฉพาะ Postman ไม่ติดต่อ ECM host

## คำตอบจาก DCM และขอบเขตทดสอบที่ผู้ใช้อนุญาตล่าสุด

1. ผู้ใช้แจ้งจาก DCM ว่าอัปโหลดชื่อซ้ำจะเขียนทับ ใช้ `file_token` เดิม และเปลี่ยนเวลาอัปเดตฝั่ง DCM คำว่า `update_at` เป็นถ้อยคำที่ผู้ใช้แจ้ง ยังไม่สมมติว่าชื่อ field ใน API response ตรงกัน
2. ผู้ใช้แจ้งว่าการจัดการ A ไม่กระทบ B ซึ่งผล live รองรับสำหรับตัวอย่างที่ทดสอบ แต่คำอธิบาย token เดิมไม่ตรงกับ response จริง จึงยังไม่รับรองว่า DELETE token หลัง B เขียนทับปลอดภัยในกรณี identity เดียวกันหรือ aliases เพราะ request DELETE ไม่มีตัวแยก A/B ใน contract ที่เปิดได้
3. DCM จัดปลายทางโดยจับจาก `template_name`; Admin ต้องกรอกชื่อให้ตรงกับแม่แบบที่ตั้งใน DCM การบันทึกชื่อใน Folio ไม่ได้สร้างแม่แบบ DCM ใหม่
4. ผู้ใช้อนุญาตทดสอบ API จริงด้วยชื่อหลัก `กทอ.67-00-0001-แจ้งมติสนับสนุน` หากใช้ไม่ได้ให้ใช้ชื่อสำรอง `กทอ.67-02-0003-แจ้งมติสนับสนุน` การทดสอบใช้ PDF สังเคราะห์กับนามสกุล `.pdf` ไม่ใช้เอกสาร/ข้อมูลของ User
5. ตรวจ search ก่อนเขียน ถ้าพบไฟล์เดิมชื่อเป้าหมายจะไม่เขียนทับโดยไม่แจ้ง ทดสอบ DELETE เฉพาะ token ที่พิสูจน์ว่ารอบนี้สร้างเอง ไม่ลบไฟล์ที่มีอยู่ก่อน ไม่แก้ข้อมูล Forms/Responses และไม่แก้ `.env` ใช้ shared auth coordinator เดิมแทน login นอก coordination
6. ไม่ retry upload/delete หรือสลับชื่อหลังผลที่ยังไม่แน่นอน เก็บแยกผลคำขอ, เนื้อหาไฟล์, token equality และ URL readability ไม่อ้าง HTTP 200 หรือ response DELETE อย่างเดียวว่าไฟล์ถูกลบ/ไม่กระทบ B

### ข้อจำกัดชั่วคราวที่ต้องเตือนอีกครั้ง

**Historical decision ก่อนข้อแก้ไขนโยบายชื่อซ้ำด้านบน:** ผู้ใช้เคยยอมให้หลายช่อง/หลายแถวส่งชื่อซ้ำ unchanged ไปก่อน ไม่ใช่ intended policy ปัจจุบันภายใน batch เดียวกัน คำแจ้งเดิมเรื่อง overwrite/token เดิมขัดกับตัวอย่าง live ที่ได้ token/URL ใหม่และพบรายการ A/B แยกกัน ผล live เดิมไม่รองรับการ routing ของชื่อเติมเลขใหม่และไม่รับรองว่าไฟล์แต่ละช่องเป็นอิสระทุกกรณี

ข้อยกเว้นนี้ไม่ใช่การอนุญาตให้ลบ B ตามไปด้วย ข้าม ownership/reference checks หรือเขียนทับไฟล์ที่มีอยู่ก่อนในรอบทดสอบ และยังไม่ขยายเป็นการอนุญาตให้แก้เนื้อหาข้อมูลคนอื่น/ประวัติเดิมโดยไม่แจ้ง

### Discovery ของรอบนี้

Hindsight `pdms-knowledge` recall ได้ผล retrieved แต่ส่วนใหญ่เป็น snapshot POC เดิม/หัวข้ออื่น baseline `318d0d89a0f57f06dc0317304646e03f97ab6a35` ไม่ใช่หลักฐาน external DCM overwrite/token contract จึงแยกคำตอบผู้ใช้, canonical local notes, current EcmClient source และผล API จริงออกจากกัน ไม่เขียนข้อมูลกลับ knowledge bank

## ผลทดสอบ DCM จริง วันที่ 2026-11-16

### ขอบเขตและที่มาหลักฐาน

- ได้รับอนุญาตจากผู้ใช้ในบทสนทนา ใช้ชื่อหลัก `กทอ.67-00-0001-แจ้งมติสนับสนุน.pdf` กับ PDF สังเคราะห์ A/B คนละเนื้อหา ตรวจ search ก่อนเขียน ไม่พบชื่อเป้าหมายเดิม จึงไม่ได้เขียนทับไฟล์ที่มีอยู่ก่อน ใช้ multipart สอง field `template="1"` และ `documentFile` โดยส่ง bytes จริง
- หลักฐานนี้เป็น runtime ของ `ECM_API_URL` ที่ตั้งใน environment รอบทดสอบ ไม่ทราบ deployed revision ของ DCM ไม่อ้างว่าเป็นพฤติกรรมทุก environment หรือทุกแม่แบบ ส่วน Current Folio Source อ้าง baseline `3ec718a5c7ec34549c0c8c5521310a38f66ee00c` พร้อม Working Tree ไม่ใช่ผล Production ของ Folio
- ใช้ shared ECM auth coordinator เดิม cached token ถูกปฏิเสธครั้งแรก จากนั้น login จริงหนึ่งครั้งสำเร็จ ไม่มี login เพิ่มจาก probes รอบต่อมา การ login อาจทำให้ token ก่อนหน้าของบริการอื่นที่ใช้บัญชีเดียวกันหมดอายุตามกติกา DCM ไม่ได้พิสูจน์ว่าบริการอื่นเสียหรือใช้บัญชีร่วมกันอยู่
- ไม่เปลี่ยน `.env`, application code, schema, migrations หรือ Forms/Responses การอัปเดต operational auth cache ตาม coordinator เป็นคนละเรื่องกับการเปลี่ยนข้อมูล User

### Supported — bytes, receipts และผล DELETE A

| จุดตรวจผ่าน flow viewer ปกติ | ขนาด bytes | ผล |
| --- | ---: | --- |
| A หลังอัปโหลด ก่อนส่ง B | 24,478 | SHA-256 ตรงกับ fixture A |
| B ก่อน DELETE A | 24,770 | SHA-256 ตรงกับ fixture B |
| B หลัง DELETE A | 24,770 | SHA-256 ยังตรงกับ fixture B |

- อัปโหลด B ชื่อเดียวกับ A แล้ว response ของ B มี `file_name` และ `file_path` เท่ากับ A แต่ได้ `file_token` และ `file_link` คนละค่า ก่อน DELETE พบรายการ A/B แยกกันใน search ต้องใช้ receipt ที่ API ตอบจริง ไม่ใช้ token A แทน receipt B
- `file_datetime_edit` ของ A/B ต่างกัน นี่ไม่พิสูจน์ว่า DCM update แถวเดิม เพราะผลรอบนี้มี token/URL ใหม่และรายการ A/B แยกกัน ไม่แปลงชื่อ field เป็น `update_at` ตามคำอธิบายเดิม
- DELETE token A ตอบ HTTP 200 / `status=200` / `data=null` หลัง DELETE search ไม่พบรายการ A แต่ยังพบ B จากนั้นเปิด URL B ใน browser context ใหม่แล้วได้ bytes B ครบตามตาราง ข้อที่ว่า DELETE A ไม่กระทบ B จึง supported สำหรับตัวอย่างนี้
- URL A หลัง DELETE ไม่คืน PDF A และ lookup ของ viewer ตอบ HTTP 500 ไม่ใช่ 404 ไม่อ้างว่าตรวจการลบทุกสำเนาบน filesystem/backup ของ DCM แล้ว
- บาง probe เก็บ body ผ่าน browser tooling ไม่สำเร็จ จึงไม่ใช้ `bytes=null` เป็นหลักฐานว่า B ถูกลบ ตรวจ flow viewer ปกติซ้ำจนได้ bytes/hash ครบตามตาราง ส่วนการ replay request ภายใน viewer นอก flow ปกติตอบ 500 แยกจากผล native viewer ที่อ่าน B สำเร็จ ไม่ใช้ replay นั้นสรุปว่า DELETE A ทำ B เสีย

### ผลที่เคยต่างกัน — ต้องแยกขอบเขตตัวอย่าง

ผลรอบ 2026-11-16 ของชื่อ `กทอ.67-00-0001-แจ้งมติสนับสนุน.pdf` ได้ token/URL ใหม่และ search พบ A/B แยกกันก่อนลบ เป็นหลักฐานเฉพาะกรณีนั้น ไม่ใช่กฎว่าชื่อซ้ำต้องได้ identity ใหม่เสมอ ต่อมาผู้ใช้ส่งผลทดสอบวันที่ 2026-11-17 แสดงการเขียนทับโดยได้ token/URL เดิมตามหัวข้อหลักฐานผู้ใช้ด้านท้าย ต้องรองรับกรณีที่ผู้ใช้ยืนยันนี้ ไม่ถามย้ำเพื่อปฏิเสธผลทดสอบของผู้ใช้

ห้ามใช้ token ต่างกันเพียงอย่างเดียวรับรองว่า provider objects แยกกัน และห้าม DELETE token A หลัง B ถ้าเป็น token/identity เดียวกัน เพราะเป็นการลบไฟล์ปัจจุบันด้วย ข้อกำหนด ownership/reference checks, การป้องกันข้อมูลคนอื่นและประวัติเดิม และการไม่ retry คำขอเขียนที่ผลยังไม่แน่นอนยังคงอยู่

### Compatibility ที่ implementation ต้องจัดการ

- **Receipt:** original response ของ POST B มี `data` เป็น object ของไฟล์ ไม่ใช่ array แต่ [EcmClient.upload ปัจจุบัน](../../apps/server/src/ecm/client.ts) รับ array หนึ่งรายการ จึงปฏิเสธ receipt ทั้งที่ DCM เก็บไฟล์แล้ว ต้องปรับ adapter/contract สำหรับ mode ใหม่และทดสอบ original response โดยไม่ upload ซ้ำหรือใช้ search เป็น production receipt fallback
- POST A ตอบ HTTP 200 / `status=200` แต่ probe รุ่นแรกไม่ได้เก็บ shape เดิมครบ จึงไม่อ้างว่า `data` ของ A เป็น null หรือมี shape เดียวกับ B การกู้ metadata A จาก search ใช้เฉพาะการตรวจไฟล์สังเคราะห์ที่ยืนยัน bytes เป็นของรอบนี้แล้ว ไม่ใช่การอนุมัติ fallback ใน application
- **Original bytes:** `file_link` ของตัวอย่างเป็นหน้า HTML viewer ไม่ใช่ direct binary URL การ GET ลิงก์แล้วคาดหวัง PDF bytes ใช้ไม่ได้กับตัวอย่างนี้ Native viewer อ่าน PDF ได้โดยมีขั้นตอน permission/read ภายในของ DCM แต่ route ของเว็บ/รุ่น PDF.js และ authorization ที่เว็บสร้างไม่ใช่ supported server-download contract สำหรับ Folio ต้องยืนยัน API ดาวน์โหลด original bytes ทุกชนิดไฟล์ หรือยืนยัน existing trusted byte source ก่อนทำ saved-reference re-upload เมื่อ `docs_number` เปลี่ยน ไม่แก้ด้วยการผูกระบบเข้ากับ private viewer route
- **Exports:** ส่ง URL ของ provider ตามที่ได้รับ ไม่ export file token เป็นคอลัมน์/metadata แยก และไม่ส่ง service Bearer/credentials ไป browser/workbook ตัว URL ในตัวอย่างมี file token เป็นส่วนประกอบตาม provider จึงไม่รับรองว่าผู้ถือ URL มองไม่เห็น token หรือเปิดไฟล์ไม่ได้ ตาม public-link policy ที่ผู้ใช้ยอมรับไว้

### Partial / ยังไม่ตรวจ

- Provider รายงาน `file_path` ของ A/B เป็นโฟลเดอร์เดียวกันและมีเลขหนังสือที่ทดสอบ แต่ยังไม่ได้ตรวจตำแหน่งผ่านหน้า DCM กับ PM หรือยืนยัน mapping ของทุก Document Category ID การที่ API รับไฟล์ได้ไม่พิสูจน์ว่าเลือกหมวดปลายทางถูกตาม intended policy ทุกกรณี
- กฎที่ผู้ใช้ยืนยันแล้วคือ Admin กรอก `template_name` ให้ตรงกับ DCM การเพิ่ม mapping ใน Folio ไม่สร้างแม่แบบใน DCM และ numeric category ID ไม่ได้ส่งใน body แบบใหม่
- ไม่ใช้ชื่อสำรอง เพราะชื่อหลักรับไฟล์ได้ ไม่ทดสอบไฟล์ชนิดอื่น, 0/10 MB, ไฟล์มีรหัสผ่าน, template_name ที่มีขีดเพิ่ม เช่น `ตรวจเบิก1-Checklist`, concurrent uploads หรือข้ามบริการในรอบนี้ ไม่ลดขอบเขต validation/ชนิดไฟล์เดิมเพียงเพราะ fixture เป็น PDF
- รายละเอียด receipts/token/URL อยู่ใน private evidence directory `/tmp/folio-dcm-contract.hbhwi0` ไม่เผยแพร่ raw artifacts ที่มี token และไม่เขียนกลับ Knowledge Bank

### Cleanup และสถานะส่งต่อ

- ลบเฉพาะ synthetic A และ B ที่ยืนยัน ownership/bytes แล้ว อย่างละหนึ่ง DELETE ไม่มีการ retry คำขอเขียน DELETE ทั้งสองตอบ HTTP 200 / `status=200` / `data=null` หลัง cleanup search ไม่พบชื่อไฟล์ทดสอบ/token A/B และ URL B ไม่คืน PDF B โดย lookup ของ viewer ตอบ HTTP 500
- Search ยังมีรายการอื่นที่ไม่ใช่ชื่อไฟล์ทดสอบหนึ่งรายการ คงไว้ ไม่ลบโฟลเดอร์หรือรายการที่ไม่ได้อยู่ในขอบเขตไฟล์ทดสอบ ไม่อ้างว่าได้ล้างโครงสร้าง DCM ทั้งหมด
- Suffix ของปลายทางที่ API รายงานคือ `กทอ.67-00-0001/2. มติและการก่อหนี้` เป็น reported folder ของตัวอย่าง ไม่ใช่การรับรอง category ID หรือ Human Review ของตำแหน่งเก็บ
- เก็บ private receipts, synthetic fixtures และ evidence manifest สำหรับ audit ไว้นอก repo ปิด browser context/tab ที่เปิดเอง และนำ executable probe scripts ออกหลังจบรอบ ไม่คัดลอก token/URL จริงหรือ credentials มาไว้ในแผน
- ข้อ 1–3 ปิดตามคำตอบผู้ใช้ล่าสุด: DCM-only, overwrite/token เดิม และ category ID สำหรับ select สองชั้น รายการที่เคยรอเรื่อง private original copy หรือ PM เทียบข้อความปลายทางไม่ใช่ blocked ปัจจุบัน ยังไม่เริ่ม implementation/migration

## รอบตรวจส่วน blocked เพิ่มเติม — ยังเป็นการวางแผน

ผู้ใช้ขอให้ดำเนินการส่วน blocked ต่อ รอบนี้ตรวจ source, canonical documents และ API จริงตามสิทธิ์เดิม ไม่ได้เริ่ม implementation ของ catalog/template_name, หน้า Admin, popup ใหม่ หรือ migration หลังผู้ใช้ถามขอบเขตการทำงาน ได้หยุดการทดสอบเพิ่มและทำเฉพาะ cleanup ของไฟล์สังเคราะห์ที่สร้างไว้

### สิ่งที่ตรวจได้เพิ่ม

- อ่าน category API จริงผ่าน shared coordinator โดยไม่ login ใหม่ ได้ id=2, type="2. มติ" ส่วน folder label ที่รายงานคือ "2. มติและการก่อหนี้" ต่อมาผู้ใช้ยืนยันว่า type ใช้แสดงผลเท่านั้น จึงไม่เปรียบเทียบข้อความทั้งสองหรือใช้ความต่างเป็น blocker ของ Folio หากชื่อ API ผิดให้แจ้งเจ้าของ DCM แก้ต้นทาง
- [ผลวิจัย provider contract](provider-contract-research.md) ตรวจ public collection และ canonical Ongoing owners แล้ว: request สอง field และ object receipt มีหลักฐานรองรับ แต่ไม่พบ supported original-download API ใน collection ที่เปิดได้ ไม่ถือว่า DCM ไม่มี API นี้ในระบบทั้งหมด
- Current Folio [originalForChangedMetadata](../../apps/server/src/ecm/attachments.ts#L265-L310) ใช้ `EcmClient.originalBytes` โดยตรงเมื่อ metadata เปลี่ยน ไม่มี existing trusted original-byte source อื่นในเส้นทางนี้ ตัว File อยู่ใน request/browser memory และ version/reference ledger เก็บ metadata ไม่เก็บ bytes ส่วน [storage wrapper](../../apps/server/src/storage.ts) มี RustFS put/read/delete สำหรับเอกสารอยู่แล้ว แต่ยังไม่ได้เก็บ attachment originals
- Recall ของ parent รอบนี้ retrieved พร้อม provenance ที่ส่งต่อในรายงานวิจัย ส่วน Recall ของ worker แยกกัน failed (`recall-timeout` ประมาณ 20 วินาที) จึงใช้ canonical Markdown/current source ที่เปิดตรวจแยกต่างหาก ไม่กล่าวว่า worker ได้ข้อมูลจาก Recall และไม่เขียนกลับ Knowledge Bank

### ตรวจว่า A ถูกเขียนทับหลังอัปโหลด B หรือไม่

ใช้ PDF สังเคราะห์ชุดใหม่ใน DCM ชื่อเดิมที่ได้รับอนุญาต ตรวจไม่พบไฟล์ชื่อเป้าหมายก่อนสร้าง A และยืนยัน A ก่อนส่ง B ไม่มีการ login เพิ่ม

| จุดตรวจ | ขนาด bytes | ผล SHA-256 |
| --- | ---: | --- |
| A ก่อนส่ง B | 24,478 | ตรงกับ fixture A |
| URL/token A หลังส่ง B ชื่อเดียวกัน | 24,478 | ยังตรงกับ fixture A ไม่ใช่ B |
| URL/token B หลังส่ง B | 24,770 | ตรงกับ fixture B ไม่ใช่ A |

รอบนี้จึง supported ว่า A/B ของตัวอย่างเก็บเนื้อหาคนละฉบับ ไม่ใช่เพียง token/URL ต่างกัน แต่ไม่รับรอง semantics ทุก environment หรือการอัปโหลดพร้อมกัน เครื่องมือ DevTools เก็บ response body บางรอบไม่ได้ (`Network.getResponseBody` ไม่มี resource) จึงไม่นับรอบเหล่านั้นเป็นผลไฟล์เสีย การตรวจสำเร็จใช้ bounded diagnostic proxy ส่ง read request เดิมจาก viewer เพียงครั้งเดียวไป origin เดิม ตรวจ bytes ก่อนส่งกลับหน้าเดิม ไม่สร้าง URL เดา ไม่ login และไม่ใช้ผลนี้อนุมัติ private viewer route เป็น production download contract

### ข้อสรุปที่ปิดแล้วและตัวเลือกที่ยังค้าง

1. **กำหนดแล้ว:** ใช้ receipt ที่ POST ตอบจริง กรณี B เขียนทับด้วย token/identity เดียวกับ A ไม่ DELETE ซ้ำ กรณีไฟล์คนละ identity จัดการ cleanup ตาม ownership/reference checks หลัง canonical commit ข้อกำหนดเดิมเรื่อง immutable history และข้อมูลของคนอื่นยังคงอยู่ ไม่เปิดคำถาม overwrite/token เดิมซ้ำ
2. **กำหนดแล้ว:** ไม่เก็บสำเนา attachment originals ใน RustFS/DB เก็บไฟล์ที่ DCM แห่งเดียว และใช้ trusted file_link จาก upload receipt โหลดตัวไฟล์จริงเมื่อต้อง reuse การหา download flow ที่ใช้งานจาก backend ได้และรักษา original bytes ทุกชนิดไฟล์เป็นงาน implementation/verification ไม่เปลี่ยนเป็น private copy หรือบังคับ reselection โดยเงียบ ๆ
3. **กำหนดแล้ว:** category id เป็นความสัมพันธ์ของ local catalog/ตัวเลือกสองชั้น ส่วน type เป็นหัวข้อแสดงผลจาก DCM ไม่ใช้ยืนยัน physical folder หรือเป็นส่วนของ filename/upload body และไม่เพิ่ม PM folder-label approval gate

### Cleanup รอบเพิ่มเติม

- DELETE synthetic A และ B อย่างละหนึ่งครั้ง ตอบ HTTP 200 / `status=200` / `data=null` หลัง cleanup search ไม่พบชื่อไฟล์ทดสอบเหลืออยู่ ไม่มีการ retry upload/delete และไม่ลบโฟลเดอร์หรือไฟล์ที่มีอยู่ก่อน
- หลักฐานอยู่ใน private directory `/tmp/folio-dcm-retention.4R7XSz` ไม่เผยแพร่ receipt/token/URL จริง ปิด browser context/tab ที่เปิดเองและนำ executable probes ออกหลัง cleanup เก็บเฉพาะหลักฐานสำหรับ audit นอก repo
- เปลี่ยนเฉพาะเอกสารวางแผน/วิจัย ไม่เปลี่ยน application code, DB schema/migration, Forms/Responses หรือ `.env` ยังไม่ถือว่าผู้ใช้อนุมัติข้อเสนอด้านนโยบายหรือให้เริ่ม implementation

## คำชี้แจงและหลักฐานผู้ใช้ วันที่ 2026-11-17

### การเขียนทับโดย token/URL เดิม

- หลักฐาน: ภาพ response ที่ผู้ใช้แนบสามภาพและคำยืนยันจากการทดสอบของผู้ใช้ ไม่ใช่การเรียก API เพิ่มของผู้ช่วย ภาพแสดง `file_name=blank_A4.pdf`, ปลายทางหมวด `1. หนังสือยืนยัน`, `file_token`/`file_link` เดิม และ timestamp เปลี่ยน รับเป็นหลักฐานว่ากรณีนี้เขียนทับไฟล์เดิม ไม่คัดลอกค่า token หรือ URL จริงจากภาพลงเอกสาร
- ภาพเป็น response ไม่แสดง request body จึงไม่เดาค่า template flag หรือสรุปสาเหตุว่าทำไมกรณีนี้ต่างจากชื่อ/หมวดที่ทดสอบก่อนหน้า ไม่ใช้ผลรอบก่อนมาบังคับว่าทุก upload ต้องสร้าง token ใหม่
- สำหรับกรณี overwrite ด้วย identity เดียว เมื่อ B สำเร็จ ไม่ DELETE token A ซ้ำ เพราะ token นั้นอ้างไฟล์ปัจจุบัน B ด้วย การเขียนทับคือการแทนเนื้อหา A แล้ว ไม่ต้องทำ DELETE เพิ่มเพื่อให้ชื่อ A หาย
- URL เดิมที่ถูกเก็บในหลายช่อง/แถวหรือประวัติจะชี้ไปเนื้อหาใหม่ด้วยตาม semantics นี้ ข้อยกเว้นชื่อซ้ำที่ผู้ใช้ยอมรับชั่วคราวไม่ใช่การรับรองความเป็นอิสระของแต่ละช่อง และไม่ใช่การอนุญาตให้แก้ข้อมูลคนอื่นหรือ immutable history ต้องตรวจ protected references/destination ก่อน dispatch ไม่ใช่อาศัยการเทียบ token หลังส่งเสร็จอย่างเดียว
- ยังต้องออกแบบ failure/reconciliation ของ in-place overwrite ก่อน implementation: DCM อาจเปลี่ยน bytes ที่ URL เดิมก่อน canonical commit ของ Folio สำเร็จ ห้ามสัญญาว่า A ยังคงเดิมทุกกรณีเมื่อ save ล้มเหลว หรือแก้ด้วย rollback/retry อัตโนมัติที่ไม่ได้รับอนุมัติ

### การเก็บต้นฉบับ — ผู้ใช้เลือก DCM แห่งเดียวแล้ว

ปัญหานี้เกิดเมื่อ User กลับมาแก้เลขหนังสือแต่ไม่เลือกไฟล์ใหม่ ระบบต้องนำ bytes ของไฟล์เดิมไปส่งด้วยชื่อใหม่ URL/token อย่างเดียวไม่ใช่ตัวไฟล์ และ URL ในตัวอย่างที่ตรวจเป็นหน้า viewer ไม่ใช่ supported original-download API หาก User เลือกไฟล์ใหม่เอง จะมี bytes ใหม่ใน request อยู่แล้ว จึงเป็นคนละกรณี

ข้อเสนอเก็บสำเนา original bytes ใน RustFS ไม่ใช้ตามคำตอบล่าสุด ผู้ใช้เลือกให้เก็บไฟล์ที่ DCM แห่งเดียว และให้ server ใช้ file_link จาก upload response โหลดไฟล์เดิมเมื่อจำเป็น ต้องได้ original bytes จริง ไม่ upload HTML ของ viewer, preview หรือไฟล์ที่ถูกแปลงแทนต้นฉบับ และไม่เพิ่ม private copy เป็น fallback โดยไม่ได้รับอนุมัติ

URL ของ DCM ที่ถูกเขียนทับจะชี้ไฟล์ล่าสุด การเก็บ configuration snapshot ของ Folio ไม่ทำให้เนื้อหาที่ URL นั้นเป็น immutable ข้อกำหนด ownership/history และการตรวจ destination/reference ก่อน dispatch ยังคงอยู่ แต่ไม่ใช้เปิดคำถามเลือกที่เก็บไฟล์เดิมซ้ำ

### ความหมายของ category — ผู้ใช้ยืนยันใช้ ID grouping เท่านั้น

ไม่ต้องให้ PM ยืนยันว่า type มีข้อความตรงกับ folder label category มาจาก API ของ DCM โดยตรง ใช้ id เป็น key และใช้ type แสดงหัวข้อ/ตัวเลือก ถ้าข้อความผิดให้แจ้ง DCM แก้ต้นทาง ไม่ hardcode ชื่อหมวดให้ตรงตามที่ Folio เดา

หน้า Admin เลือกหัวข้อจาก category API แล้วจัดการ template_name ใต้ category ID นั้นได้ครบ list/filter เพิ่ม แก้ไข และลบ ส่วน popup ปุ่มแนบไฟล์เดิมเลือก category แล้วเลือก template ที่สัมพันธ์กัน request upload ยังคงมีเพียง template="1" และ documentFile ที่ตั้งชื่อตาม docs_number-template_name ไม่ส่ง category ID/type เพิ่ม และไม่แก้รายการใน DCM จาก CRUD นี้

ยังวางแผนเท่านั้น ไม่เรียก live API เพิ่ม ไม่เปลี่ยน application code, DB schema/migration, Forms/Responses หรือ `.env` ในรอบคำอธิบายนี้

## ขอบเขตล่าสุดที่ยืนยัน — DCM-only, ID grouping และ Admin CRUD ครบ

### ที่เก็บไฟล์และการนำกลับมาใช้

- DCM เป็นที่เก็บ attachment originals แห่งเดียว Folio เก็บ URL/token และ metadata ที่จำเป็นร่วม canonical JSON/ledger ตามกติกาเดิม ไม่เพิ่ม original-byte objects ใน RustFS หรือ blobs ใน DB
- ใช้ file_link จาก original upload response เป็นจุดเริ่มดาวน์โหลดเมื่อ Save Draft/Submit ต้อง reuse ไฟล์เดิม เช่น docs_number เปลี่ยนโดยไม่มี File ใหม่เลือกไว้ ใช้เฉพาะ committed reference ของเจ้าของ/account ที่ตรวจแล้ว ไม่รับ URL จาก client เป็นอำนาจดาวน์โหลด
- การเปิดลิงก์ใน browser ตามภาพผู้ใช้ยืนยันว่าเอกสารเปิดได้ แต่ยังไม่เท่ากับพิสูจน์ server downloader สำหรับทุกชนิดไฟล์ ต้อง resolve viewer/download flow ให้ได้ต้นฉบับ ไม่รับ HTML/preview/converted PDF แทนไฟล์เดิม ไม่ส่ง service credentials ออกนอก origin ที่อนุญาต และคง bounds/timeout/ownership ของระบบเดิม
- หากอ่านต้นฉบับไม่ได้ ให้หยุดก่อน external write ใหม่และรักษาข้อมูลที่บันทึกไว้ ไม่แกล้งสำเร็จ ไม่บังคับเลือกไฟล์เดิมซ้ำ ไม่เพิ่มสำเนานอก DCM หรือ retry คำขอเขียนอัตโนมัติ ทั้งนี้ external overwrite ที่เกิดแล้วไม่ถูก rollback ด้วย Folio DB transaction

### ความสัมพันธ์ของข้อมูลและหน้าจอ

- ตาราง Storage Template catalog มี identity ภายใน, template_name และ document_category_id ใช้ numeric id ที่ API ตอบจริงเป็นความสัมพันธ์ ชื่อ template_name ยังคงไม่ซ้ำข้ามหมวดตามข้อสรุปเดิม
- โหลด category ผ่าน backend/shared ECM auth โดยแนบ Bearer ฝั่ง server แสดง type ตาม API เป็นหัวข้อใน select และใช้ id เป็นค่า ไม่ใช้ type เป็น key, filename, upload parameter หรือกฎเทียบ physical folder และไม่แก้ชื่อหมวดแทนต้นทาง
- หน้า navigation ใหม่มี select **หัวข้อเอกสาร** จาก categories เมื่อเลือกแล้ว list/filter เฉพาะแม่แบบที่ผูก ID นั้น Admin กรอก template_name เพื่อสร้างใต้หัวข้อที่เลือกได้
- **Read/list:** แสดงแม่แบบของหมวดที่เลือกได้จริงจากข้อมูลที่บันทึก ไม่ใช่รายการจำลอง พร้อมสถานะว่างเมื่อไม่มีรายการ
- **Create:** เพิ่มชื่อที่ Admin กรอกพร้อม category ID ที่เลือก ตรวจสิทธิ์และ uniqueness ฝั่ง server
- **Update:** แก้ชื่อและเปลี่ยนหมวดที่ผูกได้ รายการใต้หมวดเก่า/ใหม่ต้องสะท้อนผล และไม่เหลือ selection ที่ไม่สัมพันธ์กับหมวด
- **Delete:** มีการยืนยันก่อนลบรายการ catalog และนำออกจากตัวเลือกตั้งค่าใหม่ ไม่ลบไฟล์ User, ไม่ DELETE ด้วย file_token และไม่ลบ template/folder ใน DCM
- Popup ของปุ่มแนบไฟล์เดิมใช้ select สองชั้นเดียวกัน เปลี่ยนหมวดแล้วล้าง template เดิมที่ไม่อยู่ในหมวด หมวดที่ไม่มีแม่แบบเลือกไม่ได้ การลบ/ย้ายแม่แบบรายการสุดท้ายต้องสะท้อนสถานะนี้ด้วย

### ผลต่อฟอร์มเดิม

การแก้/ลบ catalog ไม่ตามไปแก้ Published Template หรือคำตอบ/ไฟล์เดิม ให้ใช้ค่าที่ตรึงในสัญญาฟอร์มเดิม ไม่ lookup master ปัจจุบันมาเขียนทับย้อนหลัง สำหรับ Template Draft ที่ยังไม่เผยแพร่ รายการที่ถูกลบ/ย้ายจน mapping เดิมใช้ไม่ได้ต้องเลือกใหม่ก่อน publish โดยไม่ทิ้ง Draft หรือย้ายไฟล์เดิมโดยอัตโนมัติ การคง config ไม่ใช่คำสัญญาว่า DCM URL ที่ถูก overwrite จะคง bytes รุ่นเก่า

### สถานะงาน

ข้อ 1–3 เดิมปิดครบแล้ว ไม่มีการรอให้เลือก RustFS หรือให้ PM เทียบข้อความชื่อหมวดอีก CRUD ครบเป็น acceptance ของฟีเจอร์ ไม่ใช่งานตัดทอนเหลือ create/list เท่านั้น รอบนี้แก้เอกสารแผน/ศัพท์/งานวิจัยให้ตรงกัน ยังไม่เปลี่ยน application, DB schema/migration, Forms/Responses หรือ .env และไม่เรียก live API เพิ่ม การโหลดต้นฉบับจาก file_link และ CRUD ทุกทางยังต้องพัฒนาและพิสูจน์ก่อนส่งงาน

