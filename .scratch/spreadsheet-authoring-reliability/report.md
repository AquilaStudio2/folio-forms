# สรุปการแก้ไขและทดสอบ Spreadsheet Authoring

วันที่ตรวจ: 20 ตุลาคม 2026

ขอบเขต: แก้และทดสอบบน local ของ Folio Forms ด้วย ONLYOFFICE `9.4.0.1` เริ่มจาก dropdown หายหลังบันทึก Template Draft เปิดกลับมา และเพิ่มตัวเลือก จากนั้นตรวจตาราง การแทรก/ย้าย/group column ชนิดฟิลด์ และความสอดคล้องระหว่าง editor กับ metadata รายงานนี้ไม่ใช่หลักฐานว่า deploy แล้วหรือได้ตรวจข้อมูล production แล้ว

## สิ่งที่แก้เสร็จ

### Dropdown และการเปลี่ยนชนิดฟิลด์

- แก้ native list validation และการคำนวณรายการใหม่ เพื่อให้ dropdown และตัวเลือกยังใช้ได้หลังเพิ่มตัวเลือก บันทึก และเปิดกลับมา ทั้ง scalar Field และคอลัมน์ตาราง
- รองรับข้อความไทย รายการยาว comma เครื่องหมายคำพูด และค่าที่เริ่มด้วย `=` โดยใช้ hidden/protected helper ranges เมื่อจำเป็น และเก็บค่าตัวเลือกเป็นข้อความ
- การรักษาค่าพิเศษข้างต้นเป็นพฤติกรรมของ native storage สำหรับ option ที่กำหนดไว้แล้ว ช่อง Add ยังแยก comma/semicolon/newline และ trim ตามเดิม ไม่ได้เพิ่มตัวอ่าน quoted CSV ขั้นตอนยังเป็น Add/Update → บันทึกการแก้ไขฟิลด์ → บันทึก Template Draft
- number ใช้กฎ `ISNUMBER` ที่ตรงกับพฤติกรรมตัวเลขของ editor
- เมื่อเปลี่ยนจาก date จะเปลี่ยนเฉพาะรูปแบบวันที่ `dd/mm/yyyy` ที่ระบบจัดการเป็น `General` โดยไม่ล้างรูปแบบ custom อื่นของผู้สร้าง ไม่สามารถคืนรูปแบบตัวเลขเก่าที่ไม่เคยบันทึกไว้ก่อนเปลี่ยนเป็น date
- เก็บและคืน native validation, format และ named ranges เมื่อการแก้ล้มเหลว รวมถึง mixed rules ในตาราง การคืนเฉพาะช่วงที่เกี่ยวข้อง และ anchor ที่เพิ่งสร้าง
- ถ้าเพิ่มกฎใหม่ไม่ได้ หรือ helper เต็ม จะไม่ทิ้ง dropdown เดิม

### ตารางและการจัดคอลัมน์

- เพิ่ม named range `folio_column_<columnId>` ต่อคอลัมน์ และ marker `folio_columns_<tableId>` เพื่อให้ identity ติดตามคอลัมน์ที่แทรกหรือย้ายใน editor
- คำนวณ offset จากตำแหน่งจริงก่อนแก้ฟิลด์และก่อนบันทึก/เผยแพร่ ส่ง offset map ครบชุดเมื่อจำเป็น และให้ server ตรวจ workbook พร้อมบันทึกค่าที่ reconcile แล้ว
- คอลัมน์ที่เพิ่งแทรกยังไม่มี field mapping และไม่ได้กลายเป็นฟิลด์ใหม่อัตโนมัติ panel ปัจจุบันแก้ได้เฉพาะคอลัมน์ที่ผูกไว้แล้ว ยังไม่รองรับเพิ่ม mapping คอลัมน์ใหม่ให้ตารางเดิม
- ปฏิเสธคอลัมน์ที่ถูกลบ อ้างอิงหาย ย้ายออกนอกตาราง หรือชนกัน แทนการเลือกคอลัมน์ข้างเคียงแทนโดยเงียบ ๆ
- รองรับการ reanchor ตารางอย่างชัดเจนเมื่อช่วงที่เลือกมีโครงสร้างตรงกัน
- ทดสอบ nested column grouping, merged headers, freeze panes, column widths และการเพิ่ม/ลบแถวคำตอบ โดยโครงสร้างเหล่านี้ยังคงอยู่ ไม่ได้เพิ่ม UI สำหรับ Group Column ใหม่
- ฟอร์มเก่าที่ไม่มี tracking เริ่มสร้างตัวติดตามได้เมื่อความกว้างตรงกับ metadata เท่านั้น ข้อจำกัดเรื่องการสลับคอลัมน์ย้อนหลังยังอยู่ในข้อ 1 ด้านล่าง

### ค่าที่ยังไม่ได้ใช้และข้อความผิดพลาด

- เก็บ draft ของ panel ตาม field/selection รวมถึงตัวเลือกที่ยังพิมพ์ไม่เสร็จและโหมด Edit เมื่อเปลี่ยนเซลล์แล้วกลับมา
- บล็อก save/publish ถ้ายังมี panel draft ที่ไม่ได้จัดการ ป้องกันการบันทึกเฉพาะส่วนที่ถูกใช้ไปแล้ว
- tag ซ้ำของ scalar/table/column ใช้ HTTP `409`, code `duplicate_field_tag` และข้อความตรงตัว **tag นี้ซ้ำ กรุณาใช้ tag อื่น** ข้อผิดพลาดประเภทอื่นยังแสดงเหตุผลที่ตรงกับปัญหา
- API client เก็บ `message`, `code`, `httpStatus` และ `detail` ที่จำเป็นสำหรับแสดงผลและตัดสิน recovery
- เพิ่มปุ่ม × สำหรับ error notice พร้อมชื่อ accessible **ปิดข้อความแจ้งเตือน** ใช้ได้ด้วย keyboard และ pointer เลือกวิธีปิดเองตามคำขอ ไม่ได้เพิ่ม timer ปิดอัตโนมัติ
- การปิด notice ไม่ปลด pending guard หรือยกเลิกปุ่ม retry; เมื่อมีข้อผิดพลาดครั้งใหม่จะแสดงข้อความอีกครั้ง
- ปรับความอ่านง่ายของ notice บน host สีเข้ม และเลื่อน panel ไปด้านบนเมื่อเข้าสถานะ recovery ครั้งแรกให้เห็นปุ่มยืนยัน

### กู้คืนเมื่อไม่ทราบผลการบันทึกฟิลด์

- ตรึง native editor ก่อนเก็บ baseline snapshot และก่อนแก้ไข รวมถึง resolve คอลัมน์ด้วย stable anchor ภายใต้ lock เพื่อไม่ใช้ตำแหน่งเก่าจากก่อน freeze
- เก็บ document key, base revision, prior/intended metadata ทั้งชุด, column offsets และ native before/applied snapshots พร้อม panel drafts
- ถ้า response สูญหาย จะคงค่าที่กรอกไว้และบล็อก mutations/outer document actions พร้อมปุ่ม **ลองยืนยันอีกครั้ง** โดยไม่ replay PATCH เดิม
- รับผล committed เฉพาะเมื่อ document เดิม, revision เดิมบวกหนึ่ง และ metadata ตรงกับ intended ทั้งชุด
- เพิ่ม `POST /api/admin/forms/:publicId/spreadsheet-bindings/recover` รับ `{documentKey, revision}` และคืน authoritative bindings พร้อม `recovery: {baseRevision, settled: true}`
- Recovery ใช้ Form row lock, capability, active lease, document และ lifecycle/active-operation guards เช่นเดียวกับ PATCH ถ้า revision ยังไม่เปลี่ยน จะเพิ่มหนึ่งโดยไม่แก้ metadata ทำให้ PATCH เก่าที่มาถึงภายหลังถูกปฏิเสธ ถ้าผ่าน base ไปแล้วจะคืนสถานะเดิมโดยไม่เพิ่มซ้ำ
- GET ที่อ่านได้ค่าเก่าเพียงอย่างเดียวไม่ถือเป็นหลักฐานว่า PATCH จะไม่ commit ภายหลัง ต้องมี fence proof ก่อน rollback คำขอที่ไม่ทราบผล
- คืน native snapshot เมื่อยืนยัน prior metadata ได้อย่างปลอดภัยเท่านั้น คงสถานะบล็อกเมื่อ document/revision/metadata/native state ขัดกัน
- รองรับกรณี freeze/unlock acknowledgement สูญหาย, lock-only recovery, คืนค่าบางส่วนแล้ว retry และกรณี native state กลับเป็น before อยู่แล้ว

### ลดการสะสมข้อมูล dropdown helper

- รายการตัวเลือกเหมือนกันใช้ immutable range ร่วมกันได้ทั้งการแก้ซ้ำและหลายฟิลด์ ไม่เขียนทับรายการเก่าที่ undo/rollback ยังต้องใช้
- `compactSpreadsheetDraftOptions` ทำงานกับ saved copy ระหว่าง save-template หลังตรวจ snapshot ลบเฉพาะ managed names/cells ที่พิสูจน์ว่าไม่มีผู้ใช้อ้างถึง และจัด shared strings พร้อมแก้ index ให้ถูกต้อง
- ช่องที่คืนพื้นที่ใช้ marker `folio draft options free` และนำกลับมาใช้ในการแก้ครั้งถัดไปหลังเปิดเอกสารที่บันทึก
- ไม่เก็บกวาด live editor ระหว่างแก้ฟิลด์ สำเนาเดิมยังอยู่ให้ rollback จน save สำเร็จและ editor ถูกแทนด้วยเอกสารใหม่
- คงข้อมูลที่มีสูตรหรือการอ้างอิง custom/dynamic ซึ่งพิสูจน์การเลิกใช้ไม่ได้ รวมถึง helper-local formula, validation และ conditional formatting; native allocator ไม่ใช้ช่องเหล่านี้ทับ

## สถานะประเด็นที่หารือ 1–5

| ข้อ | ประเด็น | สถานะและสิ่งที่ควรทำ |
| --- | --- | --- |
| 1 | ฟอร์มเก่าสลับคอลัมน์ก่อนมีตัวติดตาม | ยังไม่สามารถกู้ความหมายเดิมโดยอัตโนมัติ โดยเฉพาะสลับแล้วความกว้างเท่าเดิม ตรวจเฉพาะฟอร์มที่เข้าข่ายและให้เจ้าของยืนยัน mapping ก่อนแก้ ไม่ได้เกิดกับฟอร์มเก่าทุกฟอร์ม |
| 2 | native editor กับ metadata ไม่ตรงกันเมื่อผล request ไม่แน่ชัด | แก้ด้วย snapshots, lock, outcome verification และ revision fence; conflict ที่ยืนยันไม่ได้ยังบล็อกให้ตรวจ |
| 3 | ข้อความ tag ซ้ำไม่ชัดเจน | แก้ข้อความตรงตัว `tag นี้ซ้ำ กรุณาใช้ tag อื่น` และแยก error code แล้ว |
| 4 | helper options สะสมหลังแก้รายการหลายครั้ง | แก้ด้วย immutable reuse และ conservative cleanup ใน saved copy; custom references อาจทำให้ต้องเก็บข้อมูลต่อ |
| 5 | การพึ่ง ONLYOFFICE internal APIs บางส่วน | รุ่นที่ทดสอบผ่านคือ `9.4.0.1`; ทดสอบ regression ก่อน deploy image ที่ rebuild หรืออัปเกรด editor ไม่ใช่ข้อพิสูจน์ว่ารุ่นอนาคตจะใช้ได้ |

ข้อ 1: การตรวจ DB แบบอ่านอย่างเดียวช่วยคัดกรองได้ แต่ต้องเทียบกับไฟล์ XLSX ที่ DB อ้างอิงด้วย เมื่อไม่มี tracking/history เดิม บางกรณียังต้องให้เจ้าของ Form ยืนยันว่าคอลัมน์ควรตรงกับ `tag` ใด ยังไม่ได้เชื่อมต่อ DB production หรือแก้ historical mapping ในงานนี้

สำหรับฟอร์มเก่าที่ยังไม่เคยเปลี่ยนโครงสร้าง ให้เปิด panel รอ initialization เสร็จและบันทึกก่อนแทรกหรือย้ายคอลัมน์ เพื่อให้ตัวติดตามเริ่มจาก mapping ที่ทราบว่าถูกต้อง

ข้อ 5: [Dockerfile](../../onlyoffice/Dockerfile) ใช้ `onlyoffice/documentserver:9.4.0.1` และ [Compose](../../compose.yaml) สร้าง `folio-onlyoffice:9.4.0.1` อยู่แล้ว รอบนี้ไม่ได้เปลี่ยนเวอร์ชันหรือเพิ่ม digest การใช้ digest เป็นการเพิ่มความแน่นอนว่า rebuild จะได้ base image เดิม แม้ publisher เปลี่ยน image ภายใต้ tag เดิม ไม่ได้เป็นเงื่อนไขจำเป็นเพื่อใช้การแก้นี้ และ container ที่กำลังรันไม่เปลี่ยนเองเมื่อ tag เปลี่ยน

## ผลทดสอบบน local

ผลรอบสุดท้ายก่อนจัดทำเอกสาร:

| ชุดทดสอบ                                                      | ผ่าน |
| ------------------------------------------------------------ | --: |
| Plugin                                                       | 151 |
| Spreadsheet unit                                             |  78 |
| Native ONLYOFFICE runtime                                    |  35 |
| Spreadsheet HTTP authoring/initialization/column persistence |  27 |
| Real engine HTTP                                             |   1 |
| Web UI                                                       |  27 |
| รวม                                                          | 319 |

Native runtime รอบดังกล่าว skip HTTP engine หนึ่งรายการตาม flag แล้วรัน HTTP engine แยกจนผ่าน จึงไม่นับซ้ำ Root formatting/lint, TypeScript และ `git diff --check` ผ่าน ผล 319 รายการเป็นชุดที่เลือกสำหรับงานนี้ ไม่ใช่การอ้างว่ารันทดสอบทุกระบบของ repository

ก่อน commit ตรวจ root formatting/lint, TypeScript และ build อีกครั้งผ่านทั้งหมด รวมถึงตรวจ local links ในเอกสารที่ปรับทั้งหกไฟล์

HTTP recovery tests ใช้ DB จริงและทดสอบทั้งลำดับ PATCH ได้ lock ก่อน fence และ fence ได้ lock ก่อน PATCH รวมถึง acknowledgement สูญหาย การ retry และ authorization guards Runtime commands ใช้ sandbox แบบ `Asc.scope` เช่นเดียวกับปลั๊กอินจริง

ตรวจ browser ที่ `http://localhost:8080` เพิ่มเติม:

- บันทึก dropdown เปิดกลับมา เพิ่มตัวเลือก และบันทึกเปิดใหม่ พบ native dropdown พร้อมรายการล่าสุด
- ข้อความ tag ซ้ำตรงตามที่ขอ และปุ่ม × ปิดได้ด้วย keyboard
- ปิด error แล้ว pending guard และปุ่ม retry ยังอยู่; GET ล้มเหลวซ้ำทำให้ error กลับมาแสดง
- จำลอง PATCH commit แต่ response สูญหาย แล้วตรวจยืนยันสำเร็จโดยไม่ยิง PATCH ซ้ำ
- จำลอง PATCH ไม่ commit แล้ว recovery fence ก่อนคืน native dropdown เดิม; panel draft ยังพร้อมให้แก้ต่อ
- สร้าง/ลบ anchor ฟิลด์ใหม่ภายใต้ native lock ได้
- หลัง save พบ orphan helper ถูกล้าง ช่วงเดิมถูกนำกลับมาใช้ และรายการที่ยังใช้ไม่สูญหาย
- ปุ่ม recovery เลื่อนมาอยู่ในส่วนที่มองเห็นเมื่อเข้าสถานะค้างครั้งแรก

คำสั่งที่ใช้กับ source suites:

```bash
bun test ./apps/onlyoffice-plugin/test/*.test.js
bun run --cwd apps/server test:spreadsheet
bun run --cwd apps/server test:spreadsheet:runtime
RUN_SPREADSHEET_HTTP=1 bun test --timeout 120000 ./apps/server/test/spreadsheet-runtime/http.test.ts
bun test --timeout 120000 ./apps/server/test/http/spreadsheet-authoring.test.ts ./apps/server/test/http/spreadsheet-initialization.test.ts ./apps/server/test/http/spreadsheet-column-persistence.test.ts
bun run --cwd apps/web test:ui
bun run fix
bun run check
bun run check-types
git diff --check
```

HTTP tests ต้องมี environment ที่ชี้ไป DB แยกซึ่ง migrate แล้วและ private bucket สำหรับทดสอบเท่านั้น Native runtime ต้องมี Docker กับ image ที่กำหนด ส่วน HTTP engine ต้องมี server/ONLYOFFICE environment ตาม harness คำสั่งเหล่านี้ไม่ใช่คำสั่งตรวจข้อมูล production

## การเก็บกวาดและสิ่งที่ยังไม่ได้ทำ

- ปิด browser tabs ที่เปิดสำหรับงานนี้แล้ว
- ปิด fault injection และคืน local API ปกติแล้ว
- ปิดบัญชีทดสอบชั่วคราวและลบ sessions ของบัญชีนั้นแล้ว
- ลบ isolated HTTP test database/bucket แล้ว; คง local proof fixtures ที่ใช้ตรวจผลไว้
- ไม่มี schema migration ใหม่ ไม่มีการ deploy หรือ push remote ในขอบเขตงานนี้
- ยังไม่มี production DB/workbook audit ของข้อ 1 และไม่ได้รับประกัน ONLYOFFICE รุ่นอื่นนอกเหนือจากรุ่นที่ทดสอบ

เอกสารที่ปรับให้ตรงกัน: [README](../../README.md), [คำศัพท์](../../CONTEXT.md), [Product](../../PRODUCT.md), [Architecture](../../docs/ARCHITECTURE.th.md) และ [โครงสร้างไฟล์](../../docs/STRUCTURE.th.md)
