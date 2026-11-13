# สัญญา JSON ของไฟล์แนบและ URL ใน Excel

Labels: wayfinder:prototype
Type: prototype
Parent: ../map.md
Status: resolved
Assignee: pyw1tt
Blocked by: 03, 04, 06, 07, 09

## Question

จะเก็บ `file_link` และ `file_token` ของแต่ละช่องแนบรวมใน JSON คำตอบ และแสดงเฉพาะ URL ในเอกสาร Excel/ผล export อย่างไร ให้จับคู่กับ tag/แถว/revision ถูกต้อง โดยไม่ลด validation ของ Field เดิมหรือทำให้ metadata ของประวัติหาย?

ผู้ใช้กำหนดแล้วว่าต้องเก็บสองค่านี้ใน JSON เดียวกับข้อมูลคำตอบอื่น แสดง URL ที่ได้จาก upload จริงแทนปุ่มเมื่อบันทึกสำเร็จ และมี tag อัตโนมัติที่ Admin แก้ชื่อก่อนเผยแพร่ได้ งานนี้เลือกรูปแบบและ invariants ของข้อมูล ไม่ถามให้ผู้ใช้เลือกว่าจะเก็บ URL/token หรือไม่อีก

ทำ logic prototype แบบ throwaway ตาม skill `prototype` และ `prototype/LOGIC.md` ให้ผู้ใช้เห็น JSON กับตำแหน่ง URL หลังแต่ละ action ผ่าน artifact ที่เปิดดูได้โดยไม่ใช้ credentials/ฐานข้อมูลจริง แล้วตัดสินร่วมกัน ไม่เริ่มพัฒนาการเชื่อมต่อจริงหรือแก้ production modules

ต้องตอบอย่างน้อย:

- representation ของช่องเดี่ยวและคอลัมน์ในตาราง รวมความสัมพันธ์ระหว่าง URL, file token, Field tag, binding และแถวที่ระบบรองรับ โดย metadata อยู่ใน JSON คำตอบจริง ไม่ซ่อนไว้เฉพาะ storage อื่น
- การแยกไม่มีไฟล์ ไฟล์ที่ยังเลือกค้างไว้ และไฟล์ที่บันทึกแล้ว รวมไฟล์ 0 bytes ที่นับว่ามีไฟล์ได้ ไม่ใช้ชื่อหรือขนาดเป็นหลักฐานว่าอัปโหลดแล้ว
- ค่าที่อยู่ใน workbook/export เป็น URL ขณะที่ metadata ที่ใช้ลบยังอยู่ครบใน canonical JSON; การอ่าน/บันทึกเอกสารกลับมาต้องไม่ทำ file token หายหรือยอมรับคู่ URL/token ที่ client ปลอมเอง
- snapshot ของ Draft/Submission/Correction และความหมายของการเปลี่ยนไฟล์ในร่างโดยไม่แก้คู่ข้อมูลของ revision เก่า ไม่ใช้ latest lookup แทนไฟล์ของฉบับที่กำลังดู
- การเปลี่ยนชื่อ tag ก่อนเผยแพร่ต้องไม่ผูกไฟล์ผิดช่อง การเริ่มรอบใหม่ของ Excel ว่างตามที่ตัดสินแล้ว ไม่คัด URL/ไฟล์จากรอบก่อนมาเอง
- schema/validation และข้อจำกัดขนาด JSON ที่ต้องปรับอย่างจำกัด เพื่อไม่ทำให้ text Fields ทั่วไปรับ object หรือ metadata แปลกปลอม และไม่ตัดข้อมูลทิ้งเมื่อเกินขอบเขต

การเลือก representation ต้องเห็นตัวอย่าง JSON และผลต่อผู้ใช้ผ่านการสนทนาจริงก่อนปิด ticket ไม่อ้างว่า prototype พิสูจน์การ upload/ONLYOFFICE หรือความปลอดภัยของ endpoint จริงแล้ว ไม่ใส่ ECM login token/credentials ลงตัวอย่างหรือเอกสารส่งออก

## Prerequisites

- [ระดับการตั้งค่าปลายทางไฟล์ของ Admin](03-admin-storage-policy.md)
- [แหล่งเลขที่หนังสือยืนยันและกติกาชื่อไฟล์](04-confirmation-filename.md)
- [สิทธิ์ไฟล์และการแก้ไขหลังส่งคำตอบ](06-history-access.md)
- [ข้อกำหนดชนิดไฟล์และขนาดที่รับได้](07-pdf-acceptance.md)
- [ยืนยันสัญญา ECM ที่เอกสารยังไม่ตอบ](09-provider-contract-evidence.md)

## Source context

- [manifestFieldValueMatches และ normalizeResponseData](../../../apps/server/src/responses/data.ts): text รับ string และมีขอบเขตขนาด JSON ต้องรักษาการตรวจเดิม ไม่ปิดเพื่อให้ metadata ผ่าน
- [extractSpreadsheetData](../../../apps/server/src/documents/spreadsheets/workbook.ts): อ่านค่าจาก cell/ตาราง ต้องไม่ทิ้งแถวที่มีแต่ไฟล์แนบ
- [UploadPocPendingFiles](../../../apps/web/src/features/onlyoffice/upload-poc-pending.ts): PoC เก็บ File ใน browser และยังไม่ใช่ persistence contract; มีการตรวจ document/binding/tag/row ที่ต้องคงไว้ตามสัญญาใหม่
- [automaticUploadPocField](../../../apps/onlyoffice-plugin/src/spreadsheet-upload-poc.js): pattern tag อัตโนมัติเดิม

## Notes

หัวข้อนี้ไม่รอการเลือกวิธี ECM login และห้ามเลือกวิธี login แทนงานที่รอทีม ใช้เฉพาะข้อมูลสังเคราะห์ที่ระบุชัดว่าเป็นตัวอย่าง ไม่มีการเรียก ECM จริง ไม่มีการแก้ข้อมูลผู้ใช้ ผลที่ได้เป็น decision และลิงก์ asset prototype ไม่ใช่ feature ที่อนุมัติให้ merge/deploy

## Comments

### Prototype proposal — 2026-11-13 — รอพิจารณาร่วมกับผู้ใช้

สร้าง [แบบจำลอง JSON และ URL ที่กดทดลองได้](local://ecm-attachment-json.prototype.html) แบบ HTML ไฟล์เดียว เปิดได้โดยไม่ติดตั้ง dependencies ไม่เรียก API และไม่บันทึกข้อมูลนอกหน่วยความจำ ตัวอย่างทั้งหมดเป็นข้อมูลสังเคราะห์ ไม่ใช่หน้าจอระบบจริงหรือสัญญาที่ได้รับการยืนยันแล้ว

Primary source อยู่บน throwaway branch `prototype/folio-attachment-json-20261113`, commit `080cc36`, path `apps/server/src/responses/attachment-json.prototype.html` ใน worktree `/tmp/folio-attachment-json-20261113` ไม่ได้ push, เปิด PR หรือ merge เข้าสาขาหลัก

#### ข้อเสนอที่นำมาให้พิจารณา

- ช่องแนบที่ไม่มีไฟล์เป็น `null`; ไฟล์ที่บันทึกแล้วเป็น object ใต้ tag ของช่องนั้น เก็บ `file_link` และ `file_token` คู่กัน ไม่เก็บ token แยกจนจับคู่กับ URL ผิดได้
- เพิ่ม `original_name` และ `size_bytes` จากไฟล์ที่ตรวจแล้ว เพื่อรักษานามสกุลเมื่อใช้ไฟล์เดิมส่งใหม่ และระบุขนาดจริงเป็น bytes ไม่แปลง `file_size` ของผู้ให้บริการโดยเดาหน่วย ไม่ใช้ขนาดมากกว่า 0 เป็นเงื่อนไขว่ามีไฟล์
- ในตาราง object ไฟล์อยู่ใน row object เดียวกับคำตอบแถวนั้น และมี `row_index` เริ่มที่ 0 ภายในช่วงตารางของ document/revision นั้น เพราะ extractor ปัจจุบันตัดแถวว่างออกจาก JSON; ตำแหน่งใน array จึงไม่ใช่หลักฐานตำแหน่งในชีต
- ผูกช่องด้วย stable binding และ tag จากสัญญาที่เผยแพร่แล้ว ผูกแถวด้วยตำแหน่งที่ตรวจจาก document/revision ปัจจุบัน คำสั่งเพิ่ม/ลบแถวที่ server รองรับต้องปรับ mapping ด้วย ไม่ใช้ row index ที่ client อ้างเองหรือ metadata ของเอกสารคนละฉบับ
- เลือกไฟล์ค้างไว้แยกจาก JSON ที่บันทึกแล้ว เมื่อบันทึกสำเร็จจึงมี metadata ใหม่; การบันทึกล้มเหลวไม่เปลี่ยนข้อมูลเดิมและไม่ทิ้งไฟล์ที่เลือก
- ชีต/ผล export เป็น projection ที่มีเฉพาะ URL ของไฟล์ ขณะอ่านเอกสารกลับให้นำ metadata จาก canonical JSON ของฉบับเดียวกันมาประกอบ ไม่ยอมรับ URL/token ใหม่จาก cell หรือ client เป็นหลักฐานความเป็นเจ้าของไฟล์
- Draft และแต่ละ Submission/Correction เก็บ snapshot แยกกัน การแก้ร่างหรือ Correction ไม่เปลี่ยนคู่ URL/token ของประวัติเดิม รอบ Excel ใหม่ว่างตามข้อสรุปเดิม
- ต้องมี schema เฉพาะช่องแนบที่ตั้งค่าไว้ ไม่เปลี่ยน text Fields ปกติให้รับ object; คงขอบเขต JSON 262,144 bytes รวม metadata และหยุดพร้อมแจ้งข้อผิดพลาดแทนการตัดข้อมูลทิ้งหรือเพิ่มขอบเขตโดยอัตโนมัติ

ข้อแลกเปลี่ยนที่รอผู้ใช้ตัดสินใจคือ object ต่อ tag ตามตัวอย่าง เทียบกับการคง URL เป็นค่าของ tag แล้วเก็บ metadata ในอีกส่วนหนึ่งของ JSON เดียวกัน แบบหลังต้องรักษาความตรงกันของข้อมูลสองส่วนและมี schema สำหรับส่วน metadata เพิ่ม

#### หลักฐานและการตรวจ

- อ่าน source ปัจจุบันผ่าน CodeGraph และส่วนที่ไม่ได้แสดง: `manifestFieldValueMatches` รับ text เป็น string, `normalizeResponseData` กำหนดขอบเขต JSON, `extractSpreadsheetData` ตัดแถวว่าง และ `prepareSpreadsheetOperation` ใช้ trusted saved workbook กับคำสั่งแถวฝั่ง server ไม่มีการอ้างว่าสัญญา object ใหม่นี้รองรับอยู่แล้ว
- ตรวจ browser ด้วยปุ่มจริงครบ 6 walkthroughs รวม 52 ขั้นตอน: เลือก/บันทึก/เปิดร่าง, แถวว่างกับไฟล์ 0 bytes, ประวัติ/Correction/รอบใหม่, ข้อมูลปลอมและขอบเขตขนาด, tag/binding และเปลี่ยนปีแล้วใช้ไฟล์เดิม ทุกสถานการณ์ผ่าน
- ตรวจเพิ่มเติมด้วย assertions ชั่วคราวใน browser: reducer ไม่แก้ input เดิม, เปลี่ยน tag ซ้ำไม่ทำค่าหาย, ไฟล์ไม่มีนามสกุลเมื่อเลขหนังสือมีจุด, คงนามสกุลเมื่อส่งใหม่เพราะ metadata เปลี่ยน และปฏิเสธตำแหน่งจาก document revision เก่า ผ่านทั้งหมด
- ตรวจภาพ state panel จริงและการใช้ปุ่มลูกศรสลับ scenario tab แล้ว ปิด browser tab หลังตรวจ ไม่มี permanent test เพิ่ม
- เรียก root scripts `bun run fix <prototype>` และ `bun run check <prototype>` แล้ว formatter จัดรูปแบบ HTML ได้ แต่คำสั่งรวมออกด้วย code 1 เพราะ linter ไม่ครอบคลุม HTML (`No files found to lint`); ไม่อ้างว่า lint หรือชุดทดสอบแอปผ่าน

ยังไม่พิสูจน์การอัปโหลด การเข้ารหัส/เนื้อหาไฟล์ ขนาดที่ ECM รับจริง XLSX/PDF/ONLYOFFICE round trip หรือความปลอดภัยของ endpoint จริง ไม่จำลอง delete/timeout/cleanup และไม่เลือกแนวทาง login แทนงานที่รอทีม ตั๋วยัง `claimed` จนกว่าจะได้ข้อสรุปผ่านการสนทนาจริง

### Resolution — 2026-11-13 — ยืนยันร่วมกับผู้ใช้

ผู้ใช้เลือก **“ใช้ object ใต้ tag”** หลังดูข้อเสนอและ prototype เลือกให้ข้อมูลของไฟล์หนึ่งช่องอยู่ด้วยกัน แทนการเก็บ URL ใต้ tag แล้วแยก metadata ไปอีกส่วนของ JSON ซึ่งต้องรักษาความตรงกันสองแห่ง

#### รูปแบบข้อมูล canonical

- ช่องที่ไม่มีไฟล์ใช้ `null`; ช่องแนบที่บันทึกสำเร็จใช้ object มี `file_link`, `file_token`, `original_name` และ `size_bytes` ครบทั้งสี่ค่า ไม่ใช้ URL string หรือชื่อไฟล์อย่างเดียวแทนหลักฐานการอัปโหลด
- `file_link` และ `file_token` เป็นคู่จากผล upload เดียวกันที่ server ตรวจแล้ว ไม่ใช่ URL ที่สร้างเองจาก path หรือ token ที่ client เลือก
- `original_name` เป็นชื่อ basename ของไฟล์เดิมที่รับและตรวจแล้ว ไม่ใช่ storage path เก็บไว้เพื่อรักษานามสกุล รวมกรณีไม่มีนามสกุล เมื่อใช้ไฟล์เดิมส่งใหม่เพราะเลขหนังสือหรือปีเปลี่ยน ไม่อนุมานนามสกุลจาก URL หรือชื่อที่สร้างรวมเลขหนังสือซึ่งอาจมีจุด
- `size_bytes` เป็นจำนวน bytes ของไฟล์ที่ตรวจแล้ว ใช้จำนวนเต็มตั้งแต่ 0 ถึง 10,000,000 รวมขอบเขต ไม่เดาหน่วยจาก `file_size` ในผล API และไม่ใช้ `size_bytes > 0` เป็นเงื่อนไขว่ามีไฟล์
- สำหรับตาราง object ไฟล์อยู่ใน row object เดียวกับข้อมูลแถวนั้น และเพิ่ม `row_index` เป็นจำนวนเต็มเริ่มที่ 0 ภายในช่วงตารางของ document/revision นั้น ไม่ใช่ลำดับใน JSON ที่ตัดแถวว่างแล้ว ช่องเดี่ยวไม่มี `row_index`
- ค่า `File`, binary/base64 ของไฟล์ และรายการไฟล์เลือกค้างไม่อยู่ใน JSON คำตอบที่บันทึกแล้ว ส่วนข้อมูล Field อื่นยังใช้รูปแบบและ validation เดิม

ตัวอย่างสังเคราะห์: แถวแรกของชีตว่าง จึงเหลือ row object เดียวใน JSON แต่ไฟล์ยังอ้างแถวที่สองด้วย `row_index: 1`:

```json
{
  "fiscal_year": "2569",
  "docs_number": "DEMO-001",
  "attachment_1": {
    "file_link": "https://dcm.example.invalid/files/demo-v2",
    "file_token": "DEMO_FILE_TOKEN_2",
    "original_name": "report.PDF",
    "size_bytes": 245000
  },
  "items": [
    {
      "item": "",
      "attachment_2": {
        "file_link": "https://dcm.example.invalid/files/demo-v1",
        "file_token": "DEMO_FILE_TOKEN_1",
        "original_name": "empty.txt",
        "size_bytes": 0,
        "row_index": 1
      }
    }
  ]
}
```

ค่า URL/token ในตัวอย่างไม่ใช่ค่าจริงและไม่กำหนดรูปแบบ token ของผู้ให้บริการ

#### การจับคู่และแปลงค่าเอกสาร

- ต้องมีสัญญาเฉพาะช่องแนบอย่างชัดเจนใน published field contract เฉพาะช่องชนิดนี้เท่านั้นที่รับ object ไม่เพิ่มข้อยกเว้นให้ text Fields ทั่วไปรับ object และไม่เดาจากข้อความที่ดูคล้าย URL
- Field tag เป็น key ของข้อมูล ส่วน stable binding เป็นตัวระบุช่อง/คอลัมน์ การเปลี่ยน tag ก่อนเผยแพร่คง binding เดิมและย้าย key ให้ตรง ไม่เหลือ metadata ใต้ชื่อเก่าหรือย้ายไปช่องข้างเคียง หลังเผยแพร่คงกติกาทำสำเนา Form
- Server ตรวจ Form/Response/สิทธิ์และ document/revision ปัจจุบันก่อนจับคู่ binding/แถว ห้ามใช้เพียง array index ของข้อมูลที่ compact แล้ว หรือเชื่อ `row_index`/binding ที่ client อ้างโดยไม่มีหลักฐาน
- คำสั่งแถวที่ server รองรับต้องปรับตำแหน่ง metadata ใน JSON และเอกสารฉบับใหม่ด้วยกัน ไฟล์เลื่อนไปตามแถวได้โดยคงคู่ URL/token เดิม ไม่อัปโหลดใหม่เพียงเพราะลำดับแถวเปลี่ยน และไม่เปลี่ยน mapping ใน snapshot เก่า
- workbook และ Excel/PDF export เป็น projection ที่แสดงเฉพาะ `file_link` ของฉบับที่เลือก ไม่ใส่ file token ลง cell, hidden metadata หรือสูตรเพื่อใช้กู้ข้อมูลภายหลัง และไม่แสดง file picker ในหน้าดู
- เมื่ออ่าน/บันทึกชีตกลับมา ให้อ่านข้อความทั่วไปตามกติกาเดิม แต่ประกอบ metadata ไฟล์จาก canonical JSON และผล upload ที่ server ตรวจแล้วของ workspace/ฉบับเดียวกัน การคง URL ไว้ต้องไม่ทำ token หาย การเปลี่ยน URL ใน cell หรือส่ง object/token จาก client ไม่ทำให้ยึดไฟล์ใหม่ได้
- การเปลี่ยน/นำไฟล์ออกต้องผ่านคำสั่งไฟล์แนบที่มีสิทธิ์ ไม่ใช้การแก้ URL เป็นช่องทางลัด หากข้อมูลตำแหน่งหรือเอกสารไม่ตรงให้หยุดและระบุช่อง/แถว ไม่ย้าย metadata ตามการคาดเดาหรือใช้ latest lookup

#### การบันทึก ประวัติ และ validation

- เลือกไฟล์อย่างเดียวยังไม่เกิด canonical file object ใหม่ การบันทึกไฟล์และคำตอบสำเร็จจึงเก็บ URL/token ชุดใหม่ ส่วน Draft เดิมและไฟล์ที่เลือกต้องยังอยู่เมื่อบันทึกล้มเหลว
- Draft ที่บันทึก, Submission และ Correction เก็บ JSON กับเอกสารของฉบับเดียวกัน การเปลี่ยนไฟล์หรือ metadata สร้างฉบับใหม่ตาม [กติกาชื่อไฟล์](04-confirmation-filename.md) ไม่เขียนทับ object ของประวัติเก่า ไฟล์และ metadata ที่ไม่เปลี่ยนไม่อัปโหลดซ้ำ
- ไฟล์ 0 bytes ที่อัปโหลดและบันทึกสำเร็จเป็น object จึงนับว่ามีไฟล์ตาม [ข้อกำหนดไฟล์](07-pdf-acceptance.md) แถวที่มีแต่ไฟล์ต้องไม่ถูกตัดทิ้ง การเริ่มรอบ Excel ใหม่และการเปิด Draft เดิมให้ยึด [ข้อสรุปสิทธิ์และประวัติ](06-history-access.md)
- ตรวจ schema ตามบริบทช่องเดี่ยว/ตารางและข้อมูลผู้ให้บริการที่ยืนยันได้ ปฏิเสธชนิดหรือ key แปลกปลอม ตรวจ URL สำหรับเปิดลิงก์อย่างปลอดภัย และตรวจชื่อ multipart ทั้งชื่อรวมถึงนามสกุลตามกติกาเดิม ไม่ยก validator ของ prototype ไปใช้โดยถือว่าเป็น production validator
- คงขอบเขต canonical JSON **262,144 bytes แบบ UTF-8** รวม metadata ไม่เพิ่มขอบเขต ไม่ตัด URL/token/แถว หรือย้าย metadata ออกเพื่อให้บันทึกผ่าน เมื่อเกินขอบเขตต้องแจ้งข้อผิดพลาดและรักษาข้อมูลเดิม/ไฟล์ที่เลือก ข้อจำกัดขนาดไฟล์ไม่ใช่ขนาด JSON
- File token เป็นตัวระบุไฟล์ ไม่ใช่อำนาจลบโดยตัวมันเอง การลบต้องตรวจ ownership และการอ้างอิงจากข้อมูล canonical ฝั่ง server ห้ามมี ECM credentials หรือ login Bearer token ใน JSON คำตอบหรือเอกสารส่งออก

#### Asset หลักฐาน และงานที่ส่งต่อ

- เก็บ prototype ฉบับที่ใช้พิจารณาใน branch `prototype/folio-attachment-json-20261113`, commit `080cc36`, path `apps/server/src/responses/attachment-json.prototype.html` และ [ไฟล์ HTML เปิดทดลอง](local://ecm-attachment-json.prototype.html) ข้อความว่าเป็นข้อเสนอในตัว artifact เป็นสถานะ ณ ตอนนำมาพิจารณา; verdict ล่าสุดคือ resolution นี้ ไม่ merge HTML หรือยก model ทั้งก้อนไปเป็น feature
- หลักฐาน browser คือ walkthroughs 6 สถานการณ์/52 ขั้นตอน พร้อม edge assertions และภาพ state panel ตามบันทึกด้านบน เป็นหลักฐานของแบบจำลอง ไม่ใช่ผลทดสอบ ECM, ONLYOFFICE หรือ XLSX/PDF จริง Root formatter ใช้ได้ แต่ linter ไม่ครอบคลุม HTML; ไม่อ้างว่า application tests/lint ผ่าน
- [วงจรไฟล์ร่างและการบันทึกโดยไม่สูญหาย](05-safe-draft-lifecycle.md) ใช้รูปแบบนี้ตัดสินลำดับ upload/save/delete การประสานคำสั่งแถวและไฟล์ค้าง การตรวจ/อ่าน URL เดิมอย่างปลอดภัย และผลสำเร็จบางส่วน/ไม่ทราบผล
- [หน้าตั้งค่าปลายทางและสถานะไฟล์ที่ผู้ใช้เข้าใจ](08-admin-user-prototype.md) ใช้ representation นี้และข้อสรุปวงจรไฟล์ ไม่สร้าง schema อีกชุดใน UI
- เรื่องนำไปใช้กับ PoC/คำตอบเก่ามีคำถามชัดเจนแล้ว แยกเป็น [การเปลี่ยนฟอร์ม PoC เดิมไปใช้ช่องแนบจริง](12-poc-form-cutover.md) ไม่สมมติว่า text เดิมหรือชื่อไฟล์เป็นไฟล์ที่อัปโหลดแล้ว และไม่ดำเนิน migration ในรอบวางแผน
- [การใช้บัญชี ECM ร่วมโดยไม่ตัด token ของระบบอื่น](10-shared-ecm-login.md) ยังรอผู้ใช้ปรึกษาทีม ไม่มีการเลือกแนวทางหรือปิดหัวข้อนั้นจาก resolution นี้

ปิดเฉพาะการตัดสินใจรูปแบบ JSON ไม่เปลี่ยน application, DB, API contract ของ Ongoing หรือข้อมูลจริง และไม่อนุมัติให้เรียก ECM จริงโดยอัตโนมัติ
