# สัญญาลบแถวสุดท้าย: ล้างคงหนึ่งแถวหรือเหลือศูนย์แถว

Labels: wayfinder:grilling Type: grilling Parent: ../map.md Assignee: pyw1tt Status: resolved

## Question

เมื่อลบ physical row สุดท้าย จะกำหนด end-to-end behavior เป็น clear-and-keep-one หรือ delete-to-zero และให้ workbook, server guard, canonical attachments กับ pending mapping ตรงกันอย่างไร?

เป็น HITL domain decision ของแถวว่างและคำสั่งลบ ไม่ใช่แก้ 409 ด้วยการยอมรับจำนวนที่ไม่รู้ความหมาย

## หลักฐานที่ขัดกัน

[รายงานตาราง: เพิ่ม/ลบแถว](../../ecm-storage-templates/table-upload-behavior-audit.md#b-เพิ่มลบแถว) กรณีสุดท้ายและ finding F01 รายงานว่า native builder ที่รันล้างค่าแต่คงหนึ่งแถว/ปุ่ม ขณะที่ server transition guard ต้องการลดเหลือศูนย์ เป็น source contradiction พร้อม native reproduction ใน snapshot เก่า การถูกปฏิเสธ HTTP 409 ยังเป็น inference ในรายงานนั้น ไม่เคยอ้างว่ามี HTTP/UI evidence หรือว่า Production เกิดปัญหาแล้ว ไม่รันซ้ำเพื่อยืนยันรายงานเดิม

## ประเด็นสำหรับรอบ grilling

1. ผู้ใช้ต้องการให้คำสั่ง “ลบ” แถวสุดท้ายเหลือแถวว่างเป็น prototype หรือไม่มี body row? คำอธิบาย UI และผล requiredness ต้องสอดคล้องกับคำตอบ
2. กรณีแถวสุดท้ายมี ordinary inputs, saved file, pending File, pending removal หรือ invalid candidate ต้องอนุญาต/หยุดอย่างไร? Guard เดิมที่ไม่ทิ้ง pending ยังใช้ ไม่ถือว่าล้างค่าเท่ากับผู้ใช้ยืนยัน discard
3. Complete old/new mapping จะยืนยัน row count, button count, table range, row indices, canonical references และ pending transition อย่างไร? ห้ามยกเว้น last row แล้วข้ามการตรวจ mapping
4. หลังคำสั่ง เพิ่มแถวต่อ/Save Draft/Submit/reopen/Undo ต้องเห็นอะไร? Completely empty row ไม่ active แต่ attachment-only รวม zero-byte เป็น active ตามกฎเดิม
5. Internal row save ต้องไม่มี ECM POST/DELETE; ลบไฟล์เก่าได้เฉพาะ lifecycle หลัง complete snapshot commit และไม่มี protected references ไม่ใช่ทันทีเพราะแถวหาย

## Evidence ที่ต้องมีหลังเลือกสัญญา

- [x] Human ยืนยัน **ไม่ให้ลบต่อเมื่อเหลือหนึ่ง body row** สำหรับทุกฟอร์ม XLSX ไม่ว่าจะมีปุ่มแนบหรือไม่ แทน clear-one/delete-zero พร้อมคง column-button invariant
- [ ] หลังอนุมัติ implementation รัน existing HTTP integration กับ actual app/isolated DB/store ตรวจ min-row guard ทั้งฟอร์มมี/ไม่มี attachment, saved JSON/XLSX และ no-write/no-loss ทุก state ที่เกี่ยวข้อง
- [ ] หลังอนุมัติ implementation ตรวจ actual native control เมื่อเหลือหนึ่ง row, การลบจากสองเหลือหนึ่ง, repeated action และ before/after pending/mapping proof
- [ ] หลังอนุมัติ implementation พิสูจน์ UI/server/builder/full-mapping consumers สอดคล้องกัน ไม่ fallback ย้ายไฟล์ ล้างคำตอบ หรือบันทึกครึ่งเดียว

## Comments

2026-11-18: ยังไม่เลือก clear-one หรือ delete-zero และไม่แก้ builder/server ใน charting session นี้

### 2026-11-18 — pyw1tt — เริ่ม session; รอเลือก final-row semantics

- Claim ตาม frontier เป็น grilling/HITL งานนี้ตัดสินสัญญาแถวสุดท้ายและ UI/data-loss policy ไม่แก้ application, guards, tests, config, schema หรือข้อมูล/ไฟล์จริง ไม่รัน reproduction เดิมซ้ำเพื่อยืนยันรายงาน
- **Canonical local evidence:** อ่าน [historical finding F01](../../ecm-storage-templates/table-upload-behavior-audit.md#f01--ลบแถวเดียวสุดท้าย-contract-ไม่ตรงกัน), [CONTEXT: Attachment Field](../../../CONTEXT.md#attachment-field), [Tables/Correction contract](../../ecm-storage-templates/spec.md#11-tables-และ-correction) และ [support/guard policy ที่ผู้ใช้อนุมัติ](04-native-table-editing-support.md#resolution--2026-11-18--pyw1tt--อนุมัติ-support-matrix-และ-guard-policy) เป็น snapshots ที่อ่านวันที่ 2026-11-18 ไม่ใช่ Production หรือ native/HTTP proof ใหม่
- **Current Source — supported เฉพาะ source ที่อ่าน:** CodeGraph เปิด `spreadsheetBuilderScript` ใน `apps/server/src/documents/spreadsheets/builder-script.ts` และ `prepareSpreadsheetOperation` ใน `apps/server/src/operations/spreadsheet-document.ts`; อ่านเฉพาะ omitted details เพิ่ม พบ builder `count === 1` ล้าง input/hyperlinks และคง body count 1 ขณะที่ server ตรวจ delete เป็น `oldRowCount - 1` และ mapping ของแถวที่ลบเป็น null จากนั้นเอา attachments ของแถวนั้นออกจาก current data การคงหนึ่งแถวจึงต้องมี contract ที่ครอบคลุมทั้ง count/data/references/pending ไม่ใช่แก้ guard ตัวเลขอย่างเดียว ไม่มี runtime/HTTP 409 evidence ใหม่และไม่ได้ตรวจ deployed revision
- **Current UI scope:** อ่าน omitted row-control section ใน `apps/onlyoffice-plugin/src/spreadsheet.js` พบ “ลบแถวที่เลือก” เรียก internal Save Draft ผ่าน row action และ “เพิ่มแถว” ปฏิเสธ count ต่ำกว่า 1 ไม่มี row controls ใน Correction จึงไม่ถือว่า delete-to-zero ใช้งานกับ add-row flow เดิมได้โดยไม่ปรับ contract
- **Q1 — ข้อเสนอรออนุมัติ:** แนะนำ clear-and-keep-one เมื่อเหลือหนึ่งแถว ล้างเฉพาะข้อมูลช่องกรอกและ attachment selection ของแถวนั้น คงหนึ่งแถวว่างพร้อมรูปแบบ/สูตร/validation/ปุ่มที่ถูกต้อง ไม่แตะ scalar Fields หรือแถวอื่น Current answer data ต้องไม่เก็บ stale attachment ของแถวเดิม แถวว่างจริงไม่เป็น active answer/ไม่ trigger requiredness และต้องเพิ่มแถว/Save Draft/Submit/reopen ต่อได้ตาม contract ส่วนอีกตัวเลือกคือ delete-to-zero ซึ่งต้องรองรับ empty body, named ranges/buttons และการเพิ่มแถวกลับจากศูนย์ให้ครบก่อนรับรอง ยังไม่ได้เลือกแทน human
- **Q2 — ข้อเสนอรออนุมัติ:** เมื่อแถวสุดท้ายมี ordinary inputs หรือ saved attachment ให้ยืนยันก่อนนำข้อมูลออก โดยบอกผลตาม semantics ที่เลือก หากแถวว่างจริงไม่เพิ่ม confirmation ที่ไม่จำเป็น ยกเลิกต้องคงข้อมูล/receipt/pending เดิม ข้อนี้เป็น intended UI policy ใหม่ที่เสนอ ไม่อ้างว่า native row control มี confirmation อยู่แล้ว และไม่เปลี่ยนคำสั่งลบแถวอื่นในงานนี้
- **Standing guards ไม่เปิดถามซ้ำ:** แถวที่มี pending File/removal/invalid selection ต้องเคารพ guard ที่ผู้ใช้อนุมัติ ไม่ discard หรือ remount จนไฟล์หายเอง ให้แก้ pending ผ่าน flow เดิมก่อน ไม่มี ECM POST/DELETE จาก internal row save และไม่ลบไฟล์ที่ Submission/Correction/workspace/eligible Operation ยังอ้าง สิทธิ์ Correction และ unknown-operation holds คงเดิม การเอาไฟล์ออกจาก current answer ไม่ใช่หลักฐานว่า DCM original ถูกลบแล้ว
- **แผนหลักฐานหลังตัดสิน:** ใช้ approved HTTP seam เดิมและ native-only boundary ตรวจ old/new counts, named table range, input/formula/validation/button state, canonical JSON/references และ pending mapping ให้เป็น snapshot เดียว รวม empty/ordinary/saved/zero-byte/pending/removal/invalid candidate, append หลังล้างหรือลบ, repeated action, Save Draft/Submit/reopen/Undo ตาม support matrix ไม่กำหนด semantics-dependent snapshots จน Q1 ได้คำตอบ
- ยังไม่ resolve หรือเพิ่ม Decisions so far ไม่มี final-row approval ใหม่ และคง workflow คุยตั๋วให้ครบก่อนทบทวน remaining HOLD จาก Resolution ล่าสุด

### 2026-11-18 — pyw1tt — ยืนยันแถวว่างพร้อมปุ่มทั้งคอลัมน์

- **Human decision — approved, Q1:** ผู้ใช้เลือกตามคำแนะนำ clear-and-keep-one และเพิ่ม invariant ว่าเมื่อกำหนดคอลัมน์เป็นปุ่มแนบแล้ว ทุกแถวใน table body ของคอลัมน์นั้นต้องมีปุ่มเสมอ ไม่รวมหัวตาราง และห้ามลบปุ่มเฉพาะเซลล์โดยคง attachment-column configuration ไว้
- “แถวว่าง” หมายถึงไม่มีค่าคำตอบหรือไฟล์แนบที่บันทึกในแถวนั้น ไม่ได้หมายถึงเซลล์ปุ่มว่าง การล้างแถวสุดท้ายต้องคงหนึ่งแถวพร้อมปุ่มครบทุก attachment column เช่นเดียวกับการเพิ่มแถวใหม่ แยกการนำไฟล์ออกจากคำตอบออกจากการลบ control/configuration ของช่องแนบ ไม่เพิ่ม required-file rule เพียงเพราะต้องมีปุ่ม
- ข้อกำหนดนี้ใช้กับตารางที่มี attachment controls ในพื้นผิวออกแบบ/กรอกที่เกี่ยวข้อง ไม่เปลี่ยน read-only/results/export contract ที่แสดง saved `file_link` แทนปุ่ม และไม่ปลด immutable Published Template rules การเปลี่ยน attachment-column configuration ยังใช้ authoring flow และสิทธิ์เดิม ไม่ตีความเป็นอนุญาตเปลี่ยน Published config หรือห้าม incomplete Template Draft ตามกฎเดิม
- **Current Source ที่ตรวจเพิ่ม:** CodeGraph เปิด `spreadsheetUploadPocTargets`, `savedSpreadsheetUploadPocButtons`, `validateSpreadsheetAttachmentButtons`, `savedSpreadsheetUploadPocBindingComplete` ใน `apps/server/src/documents/spreadsheets/upload-poc.ts` พบ expected button count เท่ากับจำนวนแถวใน body สำหรับ configured column และตรวจ target/physical position; `spreadsheetUploadPocDeleteCommand` ใน `apps/onlyoffice-plugin/src/spreadsheet-upload-poc-delete.js` ใช้ binding-scoped metadata/deletion proof ไม่ใช่การยืนยันว่าทุก native gesture ลบปุ่มรายเซลล์ถูกป้องกันแล้ว ไม่มี native test ใหม่หรือ deployed revision check
- **Q2 ยังไม่ตัดสิน:** ผู้ใช้ขออธิบายขั้นยืนยันก่อนล้างข้อมูลอีกครั้ง Q1 ตอบเรื่องโครงสร้างแถว/ปุ่ม ส่วน Q2 ตอบเรื่องต้องถามซ้ำก่อนล้างค่ากรอกและ saved attachment หรือไม่ ไม่ถือว่าการเลือก A และปุ่มครบคอลัมน์อนุมัติ confirmation แล้ว
- ข้อเสนอ Q2 ยังเป็นถามยืนยันเมื่อแถวสุดท้ายมี ordinary input หรือ saved attachment โดย Cancel คงค่า/receipt/ปุ่มเดิม และ Confirm จึงล้างคำตอบโดยคงปุ่ม หากแถวว่างจริงไม่ถามเพิ่ม Pending Files/removals/invalid selection ยังเคารพ guards เดิม ไม่ใช้ confirmation เป็นทางทิ้ง pending หรือทำ ECM DELETE ทันที
- บันทึก Q1 และ column-button invariant ใน Storage Templates spec แล้ว รอ human ตอบ Q2 ก่อนปิด ticket/เพิ่ม Decisions so far ไม่มี application/config/tests/schema/DB changes หรือ live DCM calls

### Resolution — 2026-11-18 — pyw1tt — ทุกฟอร์ม Excel ต้องเหลืออย่างน้อยหนึ่ง row

- **Human decision — approved:** ผู้ใช้ยืนยันว่า “เหลือหนึ่ง row: ไม่ให้ลบต่อ” และระบุให้ใช้กับ “ทุกฟอร์มใน Excel ไม่ว่าจะมีปุ่มหรือไม่มี” หลังได้รับคำอธิบายว่าไม่จำเป็นต้องมีคำสั่งล้างแถวสุดท้าย จึงปิดตั๋วด้วย minimum-one-row policy ไม่ใช่ clear-and-keep-one หรือ delete-to-zero
- **Scope:** ใช้กับ repeating-table body ของทุก XLSX Form ที่มีคำสั่งแถวตาม flow เดิม ทั้งตารางไม่มี attachment, ตารางมีปุ่มแนบ, durable legacy/template modes และ old Published PoC ที่มีตาราง ไม่รวมหัวตาราง ไม่ใช่ column สุดท้ายหรือหมายเลข worksheet row และไม่เพิ่มสิทธิ์ row commands ใน Correction/พื้นที่ที่เดิมแก้ไม่ได้ ไม่ใช่การยอมให้ native gestures ฝ่า support/guard matrix เดิม
- **Minimum-row rule:** เมื่อมีมากกว่าหนึ่ง body row ให้ลบ row ที่เลือกได้ตามสิทธิ์และ guards เดิม เมื่อเหลือหนึ่ง body row ต้องไม่ให้ลบต่อ ไม่ล้างค่ากรอก ไม่เอา saved attachment ออกจากคำตอบ ไม่เปลี่ยนปุ่ม ไม่สร้าง snapshot ว่างแทน และไม่ลดเหลือศูนย์ ระบบไม่ลบ rows อัตโนมัติเพื่อให้เหลือหนึ่ง
- **UI/server contract:** ปิดการใช้งานคำสั่ง “ลบแถวที่เลือก” เมื่อเหลือหนึ่ง row พร้อมบอกว่า “ต้องมีอย่างน้อย 1 แถว ไม่สามารถลบแถวสุดท้ายได้” ฝั่ง server ต้องตรวจจำนวน body rows จาก trusted current document/revision ก่อนเริ่ม row mutation ไม่พึ่งปุ่ม disabled หรือจำนวน active answer objects จาก client และไม่วาง guard ไว้เฉพาะ `hasSpreadsheetAttachments` การเรียกข้าม UI หรือคำขอ stale/race ต้องไม่ทำให้ค่ากรอก/ไฟล์/pending สูญหาย
- **Expected rejected snapshot:** last-row delete ที่ถูกปฏิเสธต้องคง workbook body/ranges, input values, formulas/validation, buttons, canonical JSON/references และ pending File/removal/invalid-selection state เดิม ไม่มี ECM POST/DELETE จากคำสั่งนี้ และไม่เปลี่ยน canonical document/revision เพียงเพื่อแทนการลบที่ถูกห้าม การมีหนึ่ง physical row ว่างยังไม่ทำให้เป็น active answer และไม่สร้าง required-file rule ใหม่
- **Column-button invariant คงเดิม:** เมื่อกำหนดคอลัมน์เป็นช่องแนบแล้ว ทุก body-row cell ของคอลัมน์นั้นต้องมีปุ่ม ไม่รวมหัวตาราง ไม่ให้ลบ control รายเซลล์โดยคง column configuration การเปลี่ยนค่า/นำไฟล์ออกผ่าน flow ปกติไม่ลบปุ่ม แถวใหม่มีปุ่มครบทุก configured attachment column ไม่มีไฟล์แนบได้ตาม requiredness เดิมแต่ไม่มีปุ่มไม่ได้ใน editable attachment-control surface ข้อนี้ไม่เปลี่ยน read-only/results/export ที่ใช้ URL projection หรือ immutable Published configuration
- **Q2 — no longer applicable:** ยกเลิกข้อเสนอ confirmation สำหรับ “ล้างแถวสุดท้าย” เพราะไม่ให้ลบหรือล้างทั้ง row นี้ผ่านคำสั่งแถวตั้งแต่ต้น จึงไม่เพิ่มปุ่มล้างแถวหรือกล่องยืนยันใหม่จากตั๋วนี้ ผู้ใช้ยังแก้ค่าทีละช่อง/จัดการไฟล์ผ่าน flow เดิมได้ตาม Field rules ไม่ใช่การอนุญาตทิ้ง pending เงียบ ๆ
- **Supersession:** แทนการเลือก clear-and-keep-one ใน comment ก่อนหน้าและทำให้คำถาม Q2 เดิมยุติ โดยยังรักษา all-column button invariant ที่ผู้ใช้เพิ่ม ไม่เปลี่ยนการลบ rows อื่นนอก guards เดิม ไม่เปลี่ยน counter ข้าม Save, external overwrite acceptance, known history/ownership/reference fencing หรือ unknown-operation holds
- **แผนพิสูจน์หลัง implementation:** ใช้ existing HTTP seam เดิมกับ ordinary XLSX table/old PoC/durable legacy/template และ native-only control boundary ตรวจหนึ่ง row ว่าง/มีข้อมูล/มี saved file/zero-byte/pending replacement/removal/invalid candidate, direct/stale requests, ลบจากสองเหลือหนึ่งแล้วสั่งซ้ำ, เพิ่มแถวกลับให้ลบได้ตามปกติ, Save Draft/Submit/reopen และ Undo ตาม support matrix ยืนยัน snapshots/receipts/exact bytes ของ survivors และ no external writes จาก internal row actions ไม่ทดสอบด้วยการยอมให้ guard ข้ามข้อมูลที่ไม่รู้ความหมาย
- **Evidence status:** minimum-row rule, all-XLSX scope, column-button invariant และการไม่ใช้ Q2 confirmation **supported โดย human decision** ส่วน UI/server/builder alignment และ runtime regression ยังไม่ได้ implement/รัน ไม่อ้างว่าปัญหาปัจจุบันถูกแก้หรือ Production ผ่านแล้ว ไม่มี application/config/tests/schema/DB changes หรือ live DCM calls จาก session นี้
- **Tracking:** อัปเดต map และ canonical spec links ให้ชี้ Resolution นี้ พร้อม amendment ให้ตั๋ว native matrix ไม่ค้างข้อความว่ารอ final-row choice ไม่มี fog/ตั๋วใหม่จากคำตัดสินนี้ ตาม workflow ให้คุยตั๋วที่เหลือก่อนแล้วค่อยทบทวน remaining HOLD จาก Resolution ล่าสุด ไม่ claim/resolve ตั๋วถัดไปใน session นี้
