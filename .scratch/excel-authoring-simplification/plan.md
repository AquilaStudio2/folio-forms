# Plan: ทำให้สร้างแบบฟอร์ม Excel ได้ง่ายขึ้น

## เป้าหมายและขอบเขตที่ตกลง

- ใช้ความสามารถมาตรฐานของ ONLYOFFICE Spreadsheet Editor ก่อนตามคำสั่งล่าสุด: การเขียน/จัดรูปแบบข้อความ การสร้างตาราง และรูปแบบเซลล์ใช้ native editor; plugin มีเฉพาะส่วนที่ native editor ไม่ให้สัญญาข้อมูลแบบฟอร์ม (mapping Title/Tag, required, typed fields) ไม่สร้าง toolbar/table designer ซ้ำของเดิม
- เอาอัปโหลด XLSX ออกจากหน้าสร้างและเส้นทางรับไฟล์ฝั่ง server รวมถึงโค้ดเฉพาะการนำเข้าและ tests ที่ไม่ใช้แล้ว; คงอัปโหลด DOCX ตามคำยืนยันของผู้ใช้
- เอาปุ่มทดลองกรอกต้นแบบ Excel และโค้ด preview ที่ไม่มีผู้ใช้แล้วออก
- เปิดแผงตั้งค่าฟิลด์ด้านขวาเมื่อเปิด Excel
- แทรกช่องข้อความ วันที่ ตัวเลข และรายการเลือกในเซลล์ที่เลือก โดยให้ตั้งชื่อ (Title) และรหัส (Tag) ได้เหมือนแนวคิดของ DOCX
- ไม่อ้างว่า XLSX มี native DOCX content controls หรือ rich-text controls: ใช้เซลล์ named ranges และ data validation ตาม API ที่รองรับ
- สร้างตารางจากช่วงที่เลือกพร้อมกำหนดคอลัมน์และ Title/Tag อัตโนมัติ ให้แก้ชื่อได้ โดยไม่ให้ผู้ใช้คำนวณ offset เอง
- แสดงเฉพาะตัวเลือกที่ตรงกับชนิดช่อง ใช้ตัวเลือกหนึ่งรายการต่อบรรทัดแทนเครื่องหมาย |; เอา Prefill JSON pointer ออกจากหน้าตั้งค่าสำหรับผู้ใช้ทั่วไป และรักษาค่าเดิมของแบบฟอร์มที่มีอยู่
- แยกการเพิ่มช่องกับการแก้ไข ใช้ข้อความปุ่มชัดเจน แก้ช่องเดิมไม่สร้างรายการซ้ำ และไม่แสดงรายการเป็นปุ่มยาวเพิ่มตลอด
- เอาคำอธิบายยาว “จัดวางข้อความในชีตได้โดยตรง...” ออก
- แสดงข้อผิดพลาดที่นำไปแก้ได้ และตรวจการบันทึก/เผยแพร่ไม่ให้ค้างไม่สิ้นสุด

## หลักฐานจาก ONLYOFFICE

- https://helpcenter.onlyoffice.com/docs/userguides/document_editor/InsertContentControls.aspx — native Plain Text/Rich Text/Date content controls เป็นของ Document Editor
- https://api.onlyoffice.com/docs/plugins/interacting-with-editors/spreadsheet-api/ — spreadsheet plugins ทำงานกับ worksheets/ranges ผ่าน callCommand และมี selection events
- https://api.onlyoffice.com/docs/office-api/usage-api/spreadsheet-api/ApiWorksheet/Methods/GetSelection/ — อ่านช่วงที่เลือก
- https://api.onlyoffice.com/docs/office-api/usage-api/spreadsheet-api/ApiWorksheet/Methods/AddDefName/ — ผูก named range
- https://helpcenter.onlyoffice.com/docs/userguides/spreadsheet_editor/DataValidation.aspx — validation สำหรับวันที่ ตัวเลข รายการเลือก

## การแบ่งงานและสิทธิ์แก้ไฟล์

ใช้ worker ตาม .codex/agents/sol_worker.toml: gpt-6.1-sol / medium ใช้ reviewer ตาม .codex/agents/sol_reviewer.toml: gpt-6.1-sol / high

1. Worker plugin: apps/onlyoffice-plugin/** เท่านั้น — ออกแบบ panel และ interaction ใหม่, selection-aware editing, table setup, timeout handling ใน plugin, tests
2. Worker web: apps/web/** เท่านั้น — blank-only XLSX creation, remove preview UI/state/protocol, actionable errors and bounded saving, tests
3. Worker server: apps/server/** เท่านั้น — remove XLSX import and preview backend, table creation contract, sidebar config, save/publish errors and operation lifecycle, tests
4. Agent หลัก: plan, integration, CONTEXT.md และการทดสอบ browser; ไม่แก้ไฟล์ที่ worker กำลังถืออยู่

ต้องแจ้ง Agent หลักก่อนแก้ข้ามขอบเขตหรือเปลี่ยน API ร่วมกัน เก็บ baseline ก่อนงานนี้ใน baseline.tar.gz เพื่อแยกงานใหม่จาก uncommitted work เดิม

## สัญญาการทำงานร่วมกัน

- คง SpreadsheetBindings version 1 และ fields/table/columns keys เดิมเพื่อรองรับข้อมูลที่มีอยู่
- การสร้างตารางใหม่ส่ง kind=table พร้อม columns ในคำขอเดียว ให้ server รับและตรวจทั้งชุด; การแก้ table เดิมต้องรักษา columns เมื่อไม่ได้ส่ง columns
- คงชื่อ form-bridge และ endpoints บันทึก/เผยแพร่หลักไว้
- การลบ preview ต้องครอบคลุม caller, route, temporary preview state และ tests เฉพาะฟีเจอร์ที่เลิกใช้ โดยไม่ลบ export ของคำตอบจริง
- ไม่ทำลายเอกสารหรือคำตอบเดิม และไม่เผยแพร่แบบฟอร์มของผู้ใช้ระหว่างทดสอบ

## ขั้นตอนและเกณฑ์เสร็จ

1. [x] อ่าน instructions, ตรวจ docs, ยืนยันเอา upload ออกเฉพาะ Excel และบันทึก baseline
2. [x] สร้าง Plan ก่อน implementation
3. [x] Workers ทำงานแยกไฟล์ พร้อม targeted tests
4. [x] Agent หลักรวมงาน ตรวจ type/lint และทดสอบ browser กับแบบฟอร์มทดสอบ
5. [x] Reviewers ตรวจแยก plugin และ web/server เทียบ baseline; ส่งผลให้ Agent หลักมอบหมายแก้
6. [x] แก้ข้อบกพร่องและตรวจซ้ำจนไม่มีข้อบกพร่องที่ขัดขวางการใช้งาน
7. [x] เตรียมผลลัพธ์พร้อมวิธีใช้ ข้อจำกัด และหลักฐานการทดสอบ

เกณฑ์ใช้งาน: สร้าง Excel เปล่า → sidebar เปิด → เพิ่ม text/date → แก้ Title/Tag ไม่ซ้ำ → สร้างตารางและคอลัมน์โดยไม่กรอก offset → บันทึก → เปิดใหม่ → เผยแพร่แบบทดสอบได้; DOCX upload ยังใช้งานได้; ไม่มี preview button หรือ XLSX upload path

## บันทึกการทดสอบและรีวิว

### ขอบเขตเพิ่มเติมจากผู้ใช้

- เมื่อสร้างตาราง ใส่เส้นแบ่งเซลล์อัตโนมัติด้วย API มาตรฐาน ONLYOFFICE โดยรักษาข้อมูลและรูปแบบเดิม
- แถวที่ผู้กรอกเพิ่มต้องสืบทอดเส้นตาราง ตรวจทั้งเอกสารขณะกรอกและไฟล์ส่งออก
- แบบฟอร์มชนิด Excel ส่งออกได้ทั้ง XLSX และ PDF ตรวจชื่อไฟล์ MIME และข้อมูล/เส้นตารางจริง
- เมื่อทำครบ สอนวิธีใช้จากหน้าจอจริงด้วยตัวอย่าง Title/Tag, ช่องข้อความ/วันที่, ตาราง, เพิ่มแถว และส่งออก

เจ้าของงานเพิ่มเติม: plugin worker ดูเส้นตารางตอนตั้งค่า; server worker ดูการเพิ่มแถวและเอกสารส่งออก; web worker ดู UI ส่งออกและแก้ sidebar lifecycle แต่ละคนคงขอบเขต directory เดิม

- Runtime เพิ่ม text/date/table, แก้ช่องเดิมไม่ซ้ำ และ Save draft ผ่าน ข้อมูลกลับมาครบ
- Runtime publish สำเร็จใน DB แต่ detail GET เรียก DOCX parser กับ XLSX; server แก้แล้ว พร้อม regression tests และ reviewer ตรวจผ่าน
- Web แก้สถานะ published ให้คงอยู่แม้ detail refresh ล้มเหลว; reviewer ตรวจผ่าน
- Plugin reviewer ตรวจแก้ selection/dropdown แล้ว ไม่มี actionable findings; 42 tests ผ่าน
- Root check-types และ production build ผ่านก่อนงานเพิ่มเติม
- Runtime published detail หลังแก้แสดงเผยแพร่แล้วถูกต้อง; สร้างสำเนาทดสอบ a3b1f6de80784a2a9981382e5a698514 พบ sheet protection ของ published ติดมาด้วย ให้ server ตรวจ
- Runtime ฝั่งผู้กรอกพบ label ดาวน์โหลด DOCX บน XLSX และคำแนะนำแท็บ Form ที่ไม่มีใน Spreadsheet Editor ให้ web/plugin ประสานแก้ documentKind และปุ่มบันทึก/ส่งคำตอบ
- รอบท้าย: browser สร้างตาราง A5:C7 พร้อมหัวคอลัมน์ไทย, text B2/date B3 บนแบบทดสอบ 9003d0708cf247008bad6857cb445b68; Save draft ผ่านและ sidebar เปิดเองหลัง remount
- ดาวน์โหลด XLSX ต้นแบบผ่าน UI; ตรวจ OOXML จริงว่าทั้ง 9 เซลล์มีเส้น thin ครบสี่ด้าน
- Builder runtime ONLYOFFICE9.4 ผ่าน 9 tests ตรวจแถวใหม่รักษาเส้นและสูตร; พบ ClearContents ล้าง style จึงเปลี่ยนเฉพาะการล้างช่องกรอกเป็น SetValue("")
- Reviewer web ขอแก้ command ที่ bridge ไม่ตอบอาจหมุนค้าง; worker เพิ่ม readiness gate และ timeout30s พร้อมกัน late handshake, 68 UI tests ผ่าน รอตรวจซ้ำ
- Reviewer server ขอ pin PDF conversion กับ saved artifact ป้องกันอ่าน staged snapshot ระหว่าง save; worker กำลังแก้
- แก้ PDF snapshot race แล้ว; reviewer server ตรวจซ้ำผ่าน ใช้สำเนา immutable พร้อมตรวจ token/JWT และ cleanup
- Runtime ต้นแบบและคำตอบดาวน์โหลด XLSX/PDF ผ่าน; กรอกถึงแถวที่เพิ่มแล้วตรวจ OOXML 12 เซลล์มีเส้นครบ และค่าคำตอบคงอยู่; กดส่งคำตอบสำเร็จ
- PDF ตัวอย่างวันที่แสดง #### เพราะคอลัมน์แคบ จัดความกว้างด้วย native editor ในสำเนา d8b087c1b3514e5795e0f9efc666085c แล้ว PDF แสดง14/10/2026ครบ; ต้องอธิบายในวิธีใช้
- Reviewers ทุกส่วนผ่านหลังแก้ command timeout/accepted-save และ export race; web69tests, plugin48tests, server34unit+8HTTP+9runtime, root typecheck/buildผ่าน
- Sidebar: hideRightMenu:false สำหรับ XLSX และการลบ automatic Select ยังไม่แก้อาการ hidden หลัง remountทั้งหมด; ใช้ documented ActivateWindow เปิดครั้งเดียวตอนเอกสารพร้อม (https://api.onlyoffice.com/docs/plugins/customization/windows-and-panels/) รอตรวจ runtime
- ปิดงาน sidebar: ActivateWindow เปิดครั้งเดียวผ่าน GUID บน runtime9.4 สำเร็จ ทั้ง reload และหลังเพิ่มแถว/remount; reviewer plugin ตรวจผ่าน49tests/206assertions
- Root final check-types/buildผ่าน; reviewersทุกส่วนไม่มี actionable findings คงการแบ่ง directory ownership และไม่ได้ commit/deploy
- หลักฐานภาพ: excel-fields-and-borders.jpg, excel-response-rows.jpg, template-pdf.png, wide-date-pdf.png
- ตัวอย่างแก้ไขได้: /admin/forms/d8b087c1b3514e5795e0f9efc666085c (สำเนาแยกจากแบบฟอร์มผู้ใช้ มีวันที่ตัวอย่าง14/10/2026 และคอลัมน์กว้าง)
- ข้อจำกัดที่ต้องสอน: XLSXใช้เซลล์/named range ไม่ใช่ Word content control; รองรับหนึ่งชีตแก้ไขและหนึ่งตารางรายการ; จัดความกว้างคอลัมน์/หน้ากระดาษด้วย native editor ก่อนเผยแพร่; ดาวน์โหลดต้นแบบใช้ฉบับที่บันทึกแล้ว

- Initial typecheck ก่อนรวมงานผ่าน
- Worker web: lifecycle 10 tests + UI 60 tests + TypeScript + scoped formatter/lint ผ่าน
- Reviewer web: ไม่มี actionable findings; ทดสอบอิสระ 3 suites / 11 tests ผ่าน
- Worker plugin: 39 tests + scoped formatter/lint ผ่าน; รอ runtime review
- Runtime รอบแรก: Excel ไม่มี upload/preview/Fill Method แล้ว; สร้างแบบทดสอบ 42e22d94f1c845159f6d43c9913a23aa สำเร็จ
- Runtime พบ checkbox header แสดงผิดโหมดเพราะ CSS override hidden; worker แก้แล้ว
- Runtime พบเลือก B2 แล้ว panel ยังแสดง A1; ส่ง worker plugin แก้ selection lifecycle
- Runtime พบ reload แล้ว sidebar กลับเป็น Cell settings; ส่ง worker server ตรวจ startup behavior
