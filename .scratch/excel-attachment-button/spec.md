# แผนปุ่มแนบไฟล์ในฟอร์ม Excel

สถานะปัจจุบัน: POC วางปุ่ม บันทึกแบบร่าง และลบช่องใน Admin Excel โดยไม่เปิด editor ใหม่ผ่านแล้ว ดู [ticket 11](issues/11-preserve-manual-save-delete.md) ทดสอบข้อมูลและปุ่มจาก storage จริง พร้อมเปิดใหม่และ reviewer ตรวจซ้ำผ่าน ยังไม่เชื่อม API ภายนอก

รอบเลือก/ลบปุ่ม: [ticket 09](issues/09-select-delete-button.md) แก้การอ่านวัตถุ OLE ที่เลือก เพื่อแสดง Title/Tag และลบช่องที่ตรงกับปุ่ม โดยการลบปุ่ม POC บันทึกต้นแบบต่อให้อัตโนมัติ ดู [วิธีใช้งาน](usage.md)

รอบบันทึกเบื้องหลัง: [ticket 10](issues/10-background-placement-save.md) คง editor session เฉพาะการวางปุ่ม พร้อมบันทึก canonical artifact และยืนยันปุ่มเป้าหมายครบก่อนเลือกไฟล์ ไม่รีเฟรช Excel ทุกครั้งที่วางปุ่ม

รอบบันทึกและลบ: [ticket 11](issues/11-preserve-manual-save-delete.md) ขยายการคง editor session ไปยัง Admin บันทึกแบบร่างและลบช่อง โดยมี checkpoint ยืนยัน snapshot ล่าสุดและลบ managed OLE ในชีตปัจจุบันก่อนบันทึก

## Admin รุ่นคลิกเดียว

ตรวจรับ [ticket 05](issues/05-one-click-admin.md): เลือกเซลล์ว่างแล้วกดวางปุ่มได้ทันที สร้าง Title/Tag อัตโนมัติและแสดงปุ่มในคำสั่งเดียว ช่องเดิม/คอลัมน์เดิมใช้ metadata เดิม ดู [คู่มือ](usage.md)

## ขอบเขตเพิ่มเติมล่าสุด

ผู้ใช้สั่งว่า “ในปุ่มมันต้องเทสลองใส่ไฟล์จริงได้ด้วย” จึงอนุญาตให้เพิ่ม local file picker, ชื่อไฟล์ และการเลือกไฟล์ใหม่ทดแทน พร้อมทดสอบปุ่มจริง ดู [ticket 04](issues/04-local-file-picker.md) คำสั่งนี้ยังไม่ขยายไปถึง API ภายนอกหรือการบันทึกไฟล์/URL งานที่กล่าวถึง display-only ด้านล่างคือขอบเขตและผลตรวจของ POC รอบแรก

## การใช้งาน POC เลือกไฟล์

File จริงอยู่ในหน่วยความจำของ parent page ผูกกับ response/binding/rowIndex การเพิ่มแถวท้ายตารางคงไฟล์เดิมไว้ ขณะมีไฟล์ค้างจะกัน explicit Save/Submit/export และการลบแถว ยังไม่ส่ง API หรือเขียน filename/bytes/URL ลง answer JSON หรือ XLSX ดู [วิธีใช้งานและข้อจำกัด ONLYOFFICE 9.4](usage.md)

ONLYOFFICE 9.4 import ทิ้ง object protection ของ OLE จึงต้องใช้ internal `Drawing.setProtectionLocked` ผ่าน adapter ที่ตรวจเฉพาะ managed POC controls เมื่อ editor พร้อม คง noMove/noResize และ worksheet protection ไว้ เป็น dependency ของ POC ที่ต้องทบทวนก่อน production

## ขอบเขตที่ผู้ใช้อนุญาตในรอบแรก

รอบนี้ทำได้เฉพาะ POC ให้ปลั๊กอินวางและแสดงปุ่มแนบไฟล์ใน Excel **รวมปุ่มที่แสดงในแถวใหม่เมื่อผู้กรอกเพิ่มแถว** แล้วทดสอบและรีวิว ก่อนเริ่มงานลำดับถัดไปต้องได้รับคำยืนยันใหม่ ห้ามนำความสามารถอัปโหลดทันทีของตัวอย่าง `examples/sheet-upload` มาต่อเข้าฟอร์มจริงในรอบนี้

เอกสารนี้แยกข้อกำหนดที่ได้รับแล้ว ข้อเสนอ และคำถามที่ยังไม่ตกลง งานในอนาคตไม่ถือว่าได้รับอนุญาตเพียงเพราะปรากฏในแผน

## ข้อกำหนดของฟีเจอร์เต็มที่ได้รับแล้ว

- Admin มีตัวเลือกในปลั๊กอินเพื่อวางปุ่มแนบไฟล์ในฟอร์ม Excel
- รองรับช่องเดี่ยวและช่องในคอลัมน์ของตารางรายการ
- ผู้กรอกเลือกและเปลี่ยนไฟล์ได้ก่อนบันทึก; การเลือกไฟล์ต้องไม่ส่งไฟล์ไป API ทันที
- เริ่มส่งไฟล์เมื่อผู้กรอกกด Save Draft หรือ Submit Response เท่านั้น; Publish Template ของ Admin เก็บเฉพาะการตั้งค่าปุ่ม ตาม Q2
- ปุ่มต้องปรากฏในแถวที่ผู้กรอกเพิ่มด้วยในฟีเจอร์เต็ม
- URL ของไฟล์ต้องอยู่ใน tag ที่ตั้งไว้เหมือนฟิลด์อื่น; กรณีตารางต้องอยู่ใน object ของแถวนั้น ไม่เป็นข้อมูลระดับฟอร์มแยกต่างหาก
- XLSX/PDF ที่ส่งออกจากข้อมูลที่บันทึกแล้วต้องแสดง URL แทนปุ่มเมื่อมีไฟล์ และเว้นว่างเมื่อไม่มีไฟล์ ไม่มีปุ่มหลงเหลือในผลส่งออก
- การแก้ไขโดย User/Admin และการลบหลังบันทึกยังพักไว้ เสนอแนวคิดได้แต่ยังไม่เลือกแนวทางหรือเริ่มทำ

## ต้นไม้การตัดสินใจ

1. ขอบเขต POC — Q1 ยืนยันแล้ว
   - ตัวเลือกในปลั๊กอิน + ปุ่มในช่องเดี่ยว/คอลัมน์ตาราง ไม่มีการเลือกหรือส่งไฟล์
   - **รวมการสร้างปุ่มตามแถวใหม่ฝั่งผู้กรอกใน POC นี้**
   - ใช้ action แยกใน Admin designer ผูกตำแหน่งกับช่อง/คอลัมน์ข้อความที่ตั้งค่าแล้ว เป็น marker สำหรับพิสูจน์การแสดงผล ยังไม่ใช่ attachment FieldType จริง
2. จุดเริ่มอัปโหลด — Q2 ยืนยันแล้ว
   - explicit Save Draft / Submit Response เท่านั้น; Publish Template เก็บการตั้งค่าฟิลด์ ไม่มีไฟล์ตั้งต้นของ Admin
   - ต้องแยก implicit save จาก Add row ออกจากการยืนยันส่งไฟล์
3. รูปแบบค่า — Q3 ยืนยันแล้ว
   - หนึ่งไฟล์ต่อ tag/ช่อง/แถว เก็บ URL เดียว เปลี่ยนไฟล์ก่อนบันทึกได้
   - รูปร่างข้อมูลตัวอย่าง: `{ "attachment": "https://.../files/<id>" }`
   - ตาราง: `{ "items": [{ "description": "...", "attachment": "https://.../files/<id>" }] }`
4. การจัดเก็บและ URL — Q4/Q5 ได้คำตอบแล้ว
   - Q4: **ต้องใช้ API ภายนอกตั้งแต่แรก** ไม่เก็บ binary ไฟล์แนบใหม่ใน RustFS
   - Q5: ใช้ URL ที่ได้หลัง API จัดเก็บไฟล์สำเร็จ เพื่อแทนปุ่มเมื่อแสดงผลที่บันทึก/ส่งออก
   - สิทธิ์เปิดลิงก์และอายุ URL ยังไม่ได้ระบุในคำตอบ Q5 ต้องตรวจ API contract ก่อนทำเฟสอัปโหลด ไม่ตีความว่าเป็น public URL หรือเปลี่ยนเป็น Folio URL เอง
   - ไม่ขอให้ผู้ใช้ค้นหาข้อเท็จจริงในโค้ดแทน agent
5. การแก้ไข/ลบหลังบันทึก — พักตามคำสั่งผู้ใช้ ไม่ใช่เงื่อนไขบังคับให้ตัดสินใจเพื่อเริ่ม POC

## ข้อค้นพบจากระบบเดิม

สำรวจด้วย CodeGraph MCP และ `sol_worker` สองงานแยกกัน: storage audit กับ plugin integration ก่อนเริ่มแก้โค้ด POC

- การตั้งค่า Excel อยู่ใน `apps/onlyoffice-plugin/src/spreadsheet.js`; ชนิดฟิลด์ปัจจุบันมี text/date/number/dropdown/boolean/picture ยังไม่มี attachment
- รูปปัจจุบันฝังอยู่ใน DOCX/XLSX; อย่าอนุมานว่ารูปทุกภาพมี URL หรือ object แยกใน storage
- ระบบใช้ S3-compatible storage ผ่าน `Bun.S3Client` และค่า `RUSTFS_*`
- **Add row มีการ save Draft ภายในอยู่แล้ว**: `changeRows` เรียก `operations.runAction(SAVE_DRAFT)` จึงต้องออกแบบการคงไฟล์ที่เลือกไว้ข้ามการเพิ่มแถวและการโหลด editor ใหม่ โดยไม่อัปโหลดก่อน explicit Save/Submit
- รูปแบบข้อมูลเดิมใช้ scalar tag และ column tag `tableKey.columnKey` โดย answer JSON เป็น nested array; ต้องรักษาสัญญานี้
- Published Template และ Submission เป็น immutable ตาม `CONTEXT.md`; งานแก้ไข/ลบในอนาคตต้องไม่ทำลายไฟล์ที่ประวัติเดิมยังอ้างถึง

### หลักฐานการเก็บรูป

| เรื่อง | พฤติกรรมจริง | ตำแหน่งโค้ด |
| --- | --- | --- |
| Storage | `Bun.S3Client` ใช้ bucket จาก `RUSTFS_*`; validate object key ก่อนอ่าน/เขียน | `apps/server/src/storage.ts:6–57` |
| รูปใน DOCX | เขียน bytes ลง `word/media/picture-{UUID}.{jpeg\|png}` และเพิ่ม relationship ใน ZIP | `apps/server/src/documents/picture-overlay.ts:221–253` |
| Native DOCX form | เก็บเป็น browser File แล้วส่ง multipart `picture:{tag}` ตอน Save Draft/Submit; ตรวจ tag/ขนาด/MIME/มิติภาพ | `apps/web/src/features/forms/native-response.ts:87–126`, `apps/server/src/responses/native-request.ts:95–131` |
| รูปใน XLSX | อ่าน File เป็น data URL แล้วแทรก native image ใน editor; canonical saved file ฝัง bytes ใน `xl/media/picture-{UUID}.{format}` | `apps/onlyoffice-plugin/src/spreadsheet-pictures.js:51–100,209–248`, `apps/server/src/documents/spreadsheets/pictures.ts:333` |
| ความหมายของ “ยังไม่อัปโหลด” | XLSX แทรกรูปใน editor ทันที จึงไม่ใช่หลักฐานว่าไม่มี bytes ไปถึง ONLYOFFICE ก่อนกดบันทึก; ฟีเจอร์ใหม่ต้องแยก pending File ออกจากเอกสาร | `apps/onlyoffice-plugin/src/spreadsheet.js:1850–1869` |
| บันทึกภาพ XLSX | ตรวจ editor snapshot แล้วสร้างเอกสารจาก trusted artifact ก่อน extract | `apps/server/src/operations/spreadsheet-document.ts:166–253` |
| ข้อมูลภาพ | picture ถูกข้ามระหว่าง extract answer JSON; presence เป็น metadata boolean; table picture ยังไม่รองรับ | `apps/server/src/documents/spreadsheets/workbook.ts:550–560`, `apps/server/src/forms/spreadsheet-fields.ts:354–368`, `apps/onlyoffice-plugin/src/spreadsheet.js:1119–1125` |

### Object keys และการบันทึกเดิม

ส่วนท้าย `{documentKind}` คือ component จริงของ key เช่น `docx`/`xlsx` ไม่ใช่คำแนะนำให้เปลี่ยนรูปแบบเดิม

| ประเภท | Object key | หลักฐาน |
| --- | --- | --- |
| Template Draft | `forms/{formId}/template-draft/{UUID}/{documentKind}` | `apps/server/src/routes/form-authoring.ts:444` |
| Published Template | `forms/{formId}/published/{version}/{UUID}/{documentKind}` | ไฟล์เดียวกัน `:565` |
| Response Draft | `responses/{responseId}/draft/{UUID}/{documentKind}` | `apps/server/src/routes/response-actions.ts:158` |
| Submission | `submissions/{submissionId}/filled/{UUID}/{documentKind}` | ไฟล์เดียวกัน `:320` |
| Operation staging | `operations/{operationId}/{purpose}/{UUID}/{documentKind}` | ไฟล์เดียวกัน `:144,309` |

- Draft commit ข้อมูลและ document reference ใน transaction เดียว; Submission commit ข้อมูล/เอกสาร/สถานะ Response/Operation ร่วมกัน: `apps/server/src/operations/response-completion.ts:59–85,131–181`
- Cleanup ตรวจ canonical document references ก่อนลบ แต่ยังไม่รู้จัก attachment references: `apps/server/src/operations/object-cleanup.ts:61–100`
- การลบ Response รวบรวม document/operation keys ที่รู้จัก ไม่ได้ลบทุกไฟล์ใน prefix โดยอัตโนมัติ: `apps/server/src/responses/deletion.ts:204–255`
- ONLYOFFICE อ่านเอกสารผ่าน access token/authorization; export Submission ตรวจ `canReadSubmission` และเลือก saved revision ก่อน stream/convert PDF: `apps/server/src/routes/onlyoffice.ts:45–85`, `apps/server/src/routes/submissions.ts:236–301`

## ข้อเสนอการจัดเก็บไฟล์แนบ (รออนุมัติเฟสเต็ม)

1. แยก binary ออกจาก `xl/media` และ OLE metadata ใช้ backend เรียก API ภายนอกตั้งแต่แรกตาม Q4 โดย RustFS เดิมยังเก็บเอกสาร DOCX/XLSX ตามระบบปัจจุบัน
2. โครงสร้างเชิงตรรกะที่เสนอให้ API จัดเก็บรองรับคือ Form → Response → attachmentId โดยเชื่อม operation และ revision ใน metadata ไม่ใช้ชื่อไฟล์เดิมเป็น identity รูปแบบ folder/key จริงต้องตรวจความสามารถ API และตกลงในเฟสถัดไป ไม่สมมติว่าควบคุม path ของ provider ได้
3. Metadata ที่เสนอ: attachmentId, responseId, bindingId, stable rowId ถ้ามี, original filename, MIME, size, hash, provider, object key/provider file ID, operation state และความสัมพันธ์กับ revision ที่อ้างถึง
4. Backend เป็นผู้เรียก API ภายนอกและเก็บ stable provider ID ถ้า API มีให้; ไม่ส่ง token ไปปลั๊กอิน ต้องตรวจ API contract จริงก่อน implementation
5. เก็บ **URL ที่ API คืนหลังจัดเก็บสำเร็จ** ใน answer tag ตาม Q5 ไม่สร้าง Folio download endpoint แทนโดยพลการ ต้องตรวจ URL scheme/origin ตาม provider ที่กำหนด รวมถึงอายุ URL และวิธีเปิดจาก XLSX/PDF ก่อนยืนยันเฟสเต็ม
6. Commit references + answer JSON + saved XLSX ให้เป็น canonical ใน DB transaction เดียวหลังจัดเตรียม artifacts สำเร็จ ส่วน object store/API ไม่ได้ร่วม DB transaction จึงต้องมี operation state, idempotency และ cleanup เมื่อบางขั้นล้มเหลว
7. ขยาย cleanup/deletion ให้รู้จัก attachment และ retained revision references ก่อนเปิดใช้จริง ไม่ลบไฟล์ประวัติโดยอาศัยเพียงว่าคำตอบปัจจุบันไม่ใช้แล้ว

## แนวทาง POC จากผลสำรวจ

- เสนอ action แยก “วางปุ่มแนบไฟล์ (POC)” ใน Admin designer แทนเพิ่ม attachment เข้า persisted FieldType ทันที เพราะ enum/schema/extraction ยังไม่รองรับ
- แทรก native OLE ณ selection จริง พร้อมภาพปุ่มเล็กสีเทาคล้าย `input type="file"` (ตามคำขอเพิ่มเติม) และ metadata ของ binding เท่านั้น ไม่มี handler เลือกไฟล์ ตัวอย่างเดิม hardcode `Upload!B8` และส่งไฟล์ทันทีจึงนำมาใช้ทั้งชุดไม่ได้
- ใช้ action wrapper และ `ensureAuthoringReady` เดิมเพื่อไม่ข้าม pending-recovery safeguards: `apps/onlyoffice-plugin/src/spreadsheet.js:366–412`
- ปุ่มผูกกับ managed marker ของ binding ที่ตั้งค่าแล้ว; server ต้องสร้างปุ่มตามตำแหน่งทุกแถวในคอลัมน์ที่เลือกอีกครั้งเมื่อเพิ่มแถว ไม่อาศัยสมมติฐานว่า copy เซลล์แล้ว OLE จะถูก copy เสมอ
- POC ไม่เขียนคำตอบลงเซลล์ ไม่เก็บ File/URL และไม่เปลี่ยน validation ของฟิลด์ข้อความเดิม ปุ่มเป็นการแสดงผลบนเอกสารเท่านั้น
- ไม่เพิ่ม attachment เป็นชนิดปลอมของ text/picture เพื่อให้ validation ผ่าน: `apps/server/src/documents/spreadsheets/contract.ts:12–55`, `apps/server/src/forms/spreadsheet-fields.ts:80–94`
- User workbook ปัจจุบัน lock objects เว้นมี scalar picture: `apps/server/src/documents/spreadsheets/protection.ts:265–275`; POC ใน editable Admin template ไม่พิสูจน์การใช้งานใน protected User workbook และห้ามปลด protection ทั้งชีตเพื่อเลี่ยงปัญหา
- POC ใช้ GUID แยกสำหรับระบุ OLE ที่ระบบจัดการ การแสดงภาพปุ่มไม่ต้องลงทะเบียน handler แต่การเปิดหน้ารับไฟล์ในเฟสถัดไปต้องมี handler ของ ONLYOFFICE; Microsoft Excel ไม่ได้รัน ONLYOFFICE plugin

## การแบ่งงาน

| ลำดับ | เจ้าของความรับผิดชอบ | ผลส่งมอบ | เงื่อนไขเริ่ม |
| --- | --- | --- | --- |
| 00 | `sol_worker` ฝั่ง storage / plugin | ข้อเท็จจริงพร้อมตำแหน่งโค้ด, ผลกระทบ, เส้นทางทดสอบ | เริ่มได้: สำรวจอย่างเดียว |
| 01 | Agent หลัก + ผู้ใช้ | ขอบเขต POC ที่ตกลงและ decision log | Q1–Q5 ตอบแล้ว |
| 02 | `sol_worker` ฝั่ง plugin | ตัวเลือกวางปุ่มและการแสดงปุ่มตามขอบเขตที่ตกลง | หลังขอบเขต POC ชัดเจน |
| 03 | Agent หลัก | targeted tests, ตรวจ native ONLYOFFICE, หลักฐานผลจริง | หลัง 02 |
| 04 | `sol_reviewer` | ข้อบกพร่องพร้อมระดับความสำคัญและหลักฐาน | หลัง 03; agent หลักตัดสินใจและแก้ |
| 05 | Agent หลัก | ผล POC และรายการงานที่เหลือ | หลังแก้ review แล้วหยุดรอผู้ใช้ |
| 06 | Worker ฝั่ง schema/contract | attachment type, tag และ row binding | ห้ามเริ่มก่อนยืนยันเฟสถัดไป |
| 07 | Worker ฝั่ง plugin/web | เลือก/เปลี่ยนไฟล์ชั่วคราว, เพิ่มแถว, คง selection ข้าม editor lifecycle | ห้ามเริ่มก่อนยืนยันเฟสถัดไป |
| 08 | Worker ฝั่ง server/storage | upload orchestration และ metadata/authorization | ห้ามเริ่มก่อนยืนยันเฟสถัดไป |
| 09 | Worker ฝั่งเอกสาร/export | แทนปุ่มด้วย URL/ช่องว่างในสำเนาส่งออก | ห้ามเริ่มก่อนยืนยันเฟสถัดไป |
| 10 | Agent หลัก + `sol_reviewer` | integration tests และทบทวนฟีเจอร์เต็ม | ห้ามเริ่มก่อนยืนยันเฟสถัดไป |

กำหนดเจ้าของไฟล์ก่อนสั่ง worker ลงมือจริง ไม่ให้แก้ไฟล์ซ้อนกัน และไม่ย้อน uncommitted changes ของงานตัวอย่างเดิม

## เกณฑ์ทดสอบ POC ที่เสนอ

- เปิดฟอร์ม Excel ในโหมด Admin แล้วเห็นตัวเลือกวางปุ่ม
- วางปุ่มในตำแหน่งที่เลือกได้จริงใน native ONLYOFFICE ไม่ใช่ลิงก์เปิดเว็บหรือรูป mockup
- ตรวจช่องเดี่ยวและคอลัมน์ตาราง รวมถึงการเลือกตำแหน่งไม่ถูกต้อง
- User เพิ่มแถวแล้วเห็นปุ่มในคอลัมน์ที่ตั้งไว้ในแถวใหม่ ปุ่มเดิมไม่ซ้ำ ไม่ทับช่องอื่น และ protection ยังคงเดิม
- ไม่มีคำขออัปโหลดไฟล์จากการวาง/เปิด/กดปุ่ม POC
- ปุ่มและข้อความระบุว่าเป็น POC ยังไม่รับไฟล์ ไม่แสดงผลสำเร็จหลอก
- ไม่แก้ค่าในเซลล์/สูตร/ฟิลด์ข้างเคียง และไม่แอบทำให้ชนิดฟิลด์ไม่รองรับผ่าน validation
- ทดสอบ keyboard access ของตัวเลือกในแผงปลั๊กอิน
- รัน root formatter/lint และชุดทดสอบที่เกี่ยวข้องตามไฟล์ที่เปลี่ยน; บันทึกสิ่งที่ผ่านกับสิ่งที่ยังไม่ได้ทดสอบแยกกัน
- ให้ `sol_reviewer` ตรวจหลังทดสอบ ส่ง feedback ให้ agent หลักตัดสินใจและแก้ แล้วตรวจซ้ำเมื่อจำเป็น

## เงื่อนไขสำคัญสำหรับแผนเต็ม (ยังไม่ลงมือ)

- Pending File ต้องมีตัวตนผูกกับ Response + binding + แถว ไม่อาศัยแค่เลขแถวที่เปลี่ยนได้เมื่อเพิ่ม/ย้ายแถว
- ห้าม serialize ตัว File หรือ local blob URL เป็นคำตอบที่บันทึกแล้ว
- การอัปโหลดสำเร็จบางไฟล์แต่บันทึกเอกสารล้มเหลวต้อง retry ได้โดยไม่สร้างไฟล์ซ้ำ และไม่รายงานว่า Draft/Submission สำเร็จจนทั้งข้อมูลและเอกสารครบ
- กำหนดขนาด/ชนิดไฟล์และจำนวนก่อนเปิดใช้งานจริง ตรวจทั้ง client/server
- URL ที่ API คืนต้องมีอายุและสิทธิ์อ่านที่ตรวจยืนยันก่อนใช้งานจริง หาก API คืนเฉพาะ URL อายุสั้นต้องนำข้อจำกัดมาให้ผู้ใช้ตัดสินใจก่อนทำเฟสเต็ม
- ผลส่งออกควรถูกสร้างจาก saved snapshot ที่ตรงกับข้อมูล; ลบปุ่มเฉพาะสำเนาส่งออกเพื่อไม่ทำลายต้นแบบแก้ไข
- ไฟล์ชั่วคราว/ไฟล์ที่การบันทึกไม่สำเร็จต้องมีแนวทาง cleanup; ห้ามลบไฟล์ที่ Submission หรือ Correction เดิมยังอ้างถึง

## แนวคิดแก้ไขและลบที่พักไว้

ข้อเสนอเท่านั้น: หน้าดูข้อมูลแสดงชื่อไฟล์/ลิงก์; หน้าแก้ไขแสดงไฟล์เดิมพร้อม “เปลี่ยนไฟล์” และ “นำไฟล์ออก” การเปลี่ยน/นำออกยังเป็น pending จนกดบันทึก การยกเลิกกลับสู่ไฟล์เดิม ส่วน export แสดง URL หรือช่องว่างตาม saved version เสมอ

หากนำออกจากคำตอบรุ่นใหม่ ให้ยกเลิกการอ้างอิงในรุ่นนั้นก่อน การลบ bytes จริงต้องรอแนวทาง retention และตรวจประวัติที่ยังอ้างถึง ทั้งหมดนี้ยังไม่ถือเป็นคำตัดสินใจ

## บันทึกการทดสอบ/รีวิว

- งานรอบนี้เสร็จ: action วางปุ่มเล็กในปลั๊กอิน, server projection, ทดสอบ Admin บันทึก/เปิดกลับและ User เพิ่มแถวผ่านหน้าจอจริง ดู [ผลทดสอบและรีวิว](verification.md) และ [วิธีใช้งาน](usage.md)
- หลักฐานตัวอย่าง OLE เดิมเป็นเพียงต้นแบบแยกจาก production flow ไม่เท่ากับฟีเจอร์ที่เชื่อมเข้าฟอร์มจริง
- ตรวจเอกสารด้วย root `bun run check .scratch/excel-attachment-button/spec.md`: formatter ผ่าน; command จบด้วย exit 1 เพราะไม่มีไฟล์ Markdown ให้ linter ตรวจ จึงไม่รายงานว่า root check ผ่านทั้งคำสั่ง
- `sol_reviewer` ตรวจร่างแผนและใช้ CodeGraph ยืนยันความเสี่ยงหลักแล้ว ไม่พบ actionable finding ในรอบเอกสาร Agent หลักรับผลโดยไม่เปลี่ยนขอบเขต ต่อมา reviewer ตรวจ actual diff และ native tests แล้ว ผลสุดท้าย no actionable findings ตามรายงาน verification
- Q1–Q5 ตอบแล้ว: รวมแถวใหม่, explicit Save/Submit, หนึ่งไฟล์, external API ตั้งแต่แรก, ใช้ URL ที่ API คืนหลังสำเร็จ คำตอบเหล่านี้ไม่ใช่การอนุญาตให้เริ่มงานเฟสเต็ม
