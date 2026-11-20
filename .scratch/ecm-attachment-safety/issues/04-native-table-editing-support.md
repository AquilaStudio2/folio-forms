# ขอบเขต native table edits ที่รองรับหรือหยุดด้วย guard

Labels: wayfinder:grilling Type: grilling Parent: ../map.md Assignee: pyw1tt Status: resolved

## Question

Native table operations ใดต้องรองรับ และ operation ใดต้องหยุดอย่างปลอดภัย เมื่ออาจเปลี่ยน physical-row/column mapping ของ saved files, pending Files และ removals?

เป็น HITL decision เรื่อง support boundary ไม่ถือว่า native editor ทำได้เท่ากับ Folio รองรับ และไม่เพิ่ม stable row ID โดยอัตโนมัติ

กรณีแถวสุดท้ายมี known source contradiction แยกตัดสินที่ [สัญญาลบแถวสุดท้าย: ล้างคงหนึ่งแถวหรือเหลือศูนย์แถว](05-final-row-mapping.md) ไม่ใช้ native combinations ticket นี้กลบ finding นั้น ทั้งสองคำถามคุยได้อิสระ จึงไม่มี blocker ระหว่างกัน

## หลักฐานตั้งต้น

- [รายงานพฤติกรรมตาราง 64 cases](../../ecm-storage-templates/table-upload-behavior-audit.md) เป็น snapshot วันที่ 2026-11-17 ตามข้อจำกัด revision ใน parent map ไม่ใช่ current full native acceptance
- [CONTEXT: Attachment Field](../../../CONTEXT.md#attachment-field) ผูกไฟล์กับ physical row และ published column binding ใช้ verified transition สำหรับ pending remount ไม่ใช้ตำแหน่ง compact answer array เป็น row identity
- Existing append/delete-selected proof ไม่ครอบคลุมทุก combination ของ native editing; ยังไม่สรุปว่ากรณีที่ไม่ทดสอบเสียหรือปลอดภัยแน่นอน

## ประเด็นสำหรับรอบ grilling

1. กำหนด support/guard/ยังไม่ยืนยัน สำหรับ sort, drag/move rows/columns, copy/paste/cut ข้ามช่วง, Undo/Redo, native insert/delete และ combinations ต่อเนื่องอย่างไร?
2. Filter/hidden rows, merged cells และหลาย tabs/sheets เปลี่ยนการเลือกแถวหรือ binding อย่างไร? ต้องครอบคลุมตารางที่ Form map ไว้และหลาย attachment columns โดยไม่ย้ายไฟล์ตาม visual index อย่างเดา และไม่เพิ่มการรองรับหลาย repeating tables ใน Form โดยปริยาย
3. เมื่อ proof mapping หาย/กำกวม ให้หยุดคำสั่งใด ณ จุดใด และคง canonical document กับ pending bytes/removals อย่างไร? Fail หลัง remount ที่ทิ้ง File แล้วไม่ใช่ guard ที่พอ
4. Native Undo หลังบันทึกหรือเปลี่ยนเอกสาร จะถือเป็น local edit หรือย้อน canonical state ได้แค่ไหน? Internal saves ต้องไม่ upload/DELETE และห้ามฟื้น stale receipt เข้าประวัติใหม่
5. User Draft และ Admin Correction มี support boundary ต่างกันตรงไหนตาม UI/authorization เดิม? ไม่เพิ่ม row commands ให้ Correction โดยปริยาย

## Evidence checklist

- [x] Human อนุมัติ intended support matrix และแผนตรวจ operation/combinations/mode/saved/pending/removal/zero-byte ตาม Resolution; ไม่ใช่ผล runtime ผ่าน
- [ ] หลังอนุมัติ implementation ให้ใช้ approved HTTP seam ตรวจ saved JSON, canonical XLSX, exact provider bytes และ no-write guards
- [ ] หลังอนุมัติ implementation ให้ตรวจ native-only boundary ด้วย actual ONLYOFFICE ระบุ version/คำสั่ง/before-after workbook/mapping/pending proof ไม่ใช้ builder-only proof แทน UI
- [x] อนุมัติ policy ว่า guard ต้องไม่ discard pending หรือเปลี่ยน identity ของ surviving row และ row movement ไม่เป็นเหตุ rename/reupload; การพิสูจน์ implementation ยังต้องทำ
- [x] Human ยืนยัน support/guard matrix และข้อความก่อน implementation; ปิดขั้นตัดสินเท่านั้น ไม่ใช้ checklist นี้เป็น acceptance ที่ผ่านแล้ว

## Comments

2026-11-18: ยังไม่ได้เลือก support matrix ไม่ได้รัน native combinations ใหม่ และไม่เปลี่ยน editor guards

### 2026-11-18 — pyw1tt — เริ่ม session; เสนอ support matrix สำหรับตารางกรอกคำตอบ

- Claim ตาม frontier เป็น grilling/HITL ยังไม่ resolve งานนี้เลือก intended support/guard policy เท่านั้น ไม่แก้ application, editor configuration, guards, tests, fixtures, schema หรือข้อมูล/ไฟล์จริง
- **Canonical local evidence:** อ่าน [CONTEXT: Attachment Field และ Excel Binding](../../../CONTEXT.md#attachment-field), [Storage Templates: Tables และ Correction](../../ecm-storage-templates/spec.md#11-tables-และ-correction), [canonical JSON/trusted row mapping](../../ecm-attachments-implementation/spec.md#5-canonical-json-และ-trusted-row-mapping) และ [historical native cases](../../ecm-storage-templates/table-upload-behavior-audit.md#h-การแก้ตารางผ่าน-native-editor-และกรณียังไม่ยืนยัน) เป็น Markdown snapshots ที่อ่านวันที่ 2026-11-18 ไม่ใช่ Production/native acceptance ใหม่ รายงานเก่ามี revision/scope ตาม parent map
- **Current Source — supported เฉพาะส่วนที่อ่าน:** CodeGraph เปิด `UploadPocPendingFiles.complete`, `verifyTransitionScope`, `verifyRowDestinations`, `requirePendingRowsPreserved`, `remapPendingRows`, `setScope`, `bindDocument` ใน `apps/web/src/features/onlyoffice/upload-poc-pending.ts`, `isValidAttachmentTransition` ใน `editor-protocol.ts`, `changeRows` ใน `apps/onlyoffice-plugin/src/spreadsheet.js` และ `reconcileSpreadsheetColumns` ใน `apps/server/src/documents/spreadsheets/columns.ts` พบ explicit transition/pending-preservation guards, named-column reconciliation และ scope ที่ไม่สร้าง row controls ใน Correction ไม่อ้างว่า guards เหล่านี้ตรวจพบหรือป้องกันทุก same-row-count sort/copy/Undo ได้ ไม่ได้ตรวจ committed/deployed revision หรือรัน runtime ใหม่
- **Scope ของข้อเสนอ:** จำกัดตารางที่ Folio map ไว้ในหน้า User Draft/ตอบ Form และ Admin Correction ไม่ใช้ข้อจำกัดของการกรอกคำตอบไปห้าม Admin จัด layout ใน Template Draft โดยปริยาย คงหนึ่ง repeating table ในหนึ่ง editable worksheet และไม่เพิ่ม stable row ID/per-row Tag การลบแถวสุดท้ายยังเป็นของ [สัญญาลบแถวสุดท้าย](05-final-row-mapping.md)
- **Q1 — ข้อเสนอรออนุมัติ support matrix:** (ก) กรอก/วางค่าในช่องข้อมูลทั่วไปได้โดยไม่ถือเป็นการย้ายไฟล์; (ข) User Draft ใช้เพิ่ม/ลบแถวของ Folio ตาม verified transitions ไม่เพิ่ม row controls ใน Correction; (ค) ไม่รับรอง sort/ลากย้าย/cut-paste ทั้งแถวหรือคอลัมน์/native insert-delete เป็นการย้ายไฟล์ในตารางนี้; (ง) paste URL/drawing ไม่สร้างหรือย้าย canonical attachment; (จ) Undo/Redo ช่องข้อมูลทั่วไปไม่ย้อน pending attachment/committed snapshot/DCM effects และ combinations ที่ทำ mapping กำกวมไม่ผ่าน; (ฉ) filter/hidden ใช้ดูได้เฉพาะ boundary ที่ยังพิสูจน์ physical target ได้ ไม่ใช้ visible-row index และต้อง guard file actions หากพิสูจน์ไม่ได้; (ช) ไม่รองรับ merge ข้ามแถวหรือย้าย mapped table ข้าม sheet ระหว่างกรอก; (ซ) หลายแท็บใช้ lease/revision guards เดิม ไม่ส่งต่อ browser Files ระหว่างแท็บเอง
- **Q2 — ข้อเสนอรออนุมัติ failure policy:** หยุดคำสั่งที่กระทบ mapping ก่อนเปลี่ยน document scope/remount หาก intercept ได้; การบันทึกที่พิสูจน์ mapping ไม่ได้ต้องหยุดก่อน external writes/canonical commit และคง saved state กับ pending Files/removals/invalid-selection state ไม่ reload/discard/rebind ไปแถวใกล้เคียงเอง ไม่ upload/DELETE จาก internal row/project/workspace saves ไม่ล้าง hold ของ unknown operation
- **ข้อจำกัดของ guard:** การระบุ “ไม่รองรับ” ไม่เท่ากับมี guard แล้ว ต้องพิสูจน์การป้องกันคำสั่งหรือการตรวจ transition ที่กระทบไฟล์จริง โดยเฉพาะ reorder ที่จำนวนแถวเท่าเดิม หาก native boundary ที่เลือกป้องกัน/ตรวจไม่ได้ ห้ามประกาศว่า safely rejected จาก source หรือ row-count check อย่างเดียว ต้องบันทึก boundary ที่ยังไม่ยืนยันก่อนรับรอง implementation ไม่ใช้ warning เฉย ๆ แทนการกันข้อมูลผิดไฟล์
- **แผนหลักฐาน:** ใช้ approved HTTP seam เดิม ไม่ขออนุมัติ seam ซ้ำ ตรวจ JSON/XLSX/exact bytes ของแถว A/B ที่ต่างกันและหลาย attachment columns พร้อม empty gaps, saved/pending/removal/zero-byte states Native-only commands ต้องเปิด actual ONLYOFFICE เพื่อตรวจ before/after mapping และ no-loss/no-extra-write ตาม matrix ที่ human เลือก ไม่ยก historical builder/HTTP results เป็นการผ่านทุก combination
- ยังไม่มี human answers หรือ support matrix approval ใหม่ ไม่ทดลอง native UI หรือ real DCM ใน session นี้ ให้คุยตั๋วให้จบก่อน แล้วทบทวน remaining HOLD จาก Resolution ตาม workflow ล่าสุด

### Resolution — 2026-11-18 — pyw1tt — อนุมัติ support matrix และ guard policy

- **Human decision — approved:** ผู้ใช้ตอบ “เห็นด้วยทั้งหมด” ต่อ Q1 support matrix และ Q2 failure/pending-preservation policy จึงปิดขั้นตัดสินตั๋วนี้ ไม่ใช่การอนุญาต implementation หรือรับรอง native/provider acceptance
- **Scope:** ใช้กับ repeating table ที่มี configured Attachment Fields ใน User Draft/ตอบ Form และ Admin Correction ตามสิทธิ์/Field rules เดิม ไม่ใช้ข้อจำกัดนี้ไปห้าม Admin จัด layout ใน Template Draft โดยปริยาย ไม่เปลี่ยน old Published PoC contracts ไม่เพิ่มหลาย repeating tables/หลาย editable worksheets/stable row ID/per-row Tag

#### Q1 — Intended support matrix ที่อนุมัติ

| Operation | Intended behavior / guard |
| --- | --- |
| พิมพ์/วางค่าในช่องข้อมูลทั่วไป | รองรับตาม Field rules และตำแหน่งที่อนุญาต โดยไม่ถือเป็นการย้ายไฟล์แนบหรือสร้าง receipt |
| เพิ่ม/ลบแถวด้วยปุ่ม Folio | รองรับ User Draft ผ่าน verified transitions รักษา identity/pending ของผู้รอด ไม่ copy ไฟล์ลงแถวใหม่ ไม่เพิ่ม row controls ใน Correction; แถวเป้าหมายที่มี pending ต้องเคารพ guard เดิมไม่ discard เงียบ ๆ ส่วน semantics แถวสุดท้ายตัดสินแยก |
| Sort/ลากย้าย/cut-paste ทั้งแถวหรือคอลัมน์/native insert-delete ใน mapped table | ไม่รองรับเป็นวิธีย้ายไฟล์ ต้องป้องกันไม่ให้ canonical save/external writes ยอมรับการจับคู่ผิด ไม่อนุมานว่าจำนวนแถวเท่าเดิมแปลว่า mapping ถูก |
| Copy/paste URL หรือปุ่มแนบไฟล์ | ไม่สร้าง/ย้าย canonical attachment และไม่ adopt client URL/token/drawing เป็นหลักฐานไฟล์ การเปลี่ยนไฟล์ผ่าน attachment flow ที่มีสิทธิ์เท่านั้น |
| Undo/Redo | รองรับข้อมูลทั่วไปเมื่อ mapping ยังถูกต้อง ไม่ย้อน pending attachment, committed snapshot หรือ external DCM effects; combinations ที่ทำ mapping กำกวมต้องหยุด ไม่ resurrect stale receipt |
| Filter/hidden rows หรือ columns | การใช้ไฟล์ต้องยืนยัน physical row/published column binding ของ trusted document ได้ ไม่ใช้ลำดับแถวที่มองเห็นแทน หากพิสูจน์ target ไม่ได้ให้หยุด file actions; hidden/zero-geometry combinations ต้องมี native proof ก่อนรับรอง |
| Merge ข้ามแถว หรือย้าย mapped table ข้าม sheet ระหว่างกรอก | ไม่รองรับ ต้องไม่ยอมรับการเปลี่ยน mapping ที่ทำให้ไฟล์ย้ายผิด หรือใช้ warning อย่างเดียวแทน guard |
| หลาย tabs/reconnect | คง lease/revision/scope guards เดิม ไม่ส่งต่อ browser Files ข้ามแท็บหรือ reload เอง stale transition ต้องไม่ discard งานใน scope เดิมหรือ commit snapshot ผิด |

#### Q2 — Failure/pending-preservation policy ที่อนุมัติ

- หยุดคำสั่งที่กระทบ mapping ก่อนเปลี่ยน document scope/remount หาก intercept ได้ และต้องไม่ปล่อยให้การบันทึกที่พิสูจน์ mapping ไม่ได้เริ่ม external writes หรือ canonical commit
- คง saved canonical state และ pending Files/removals/invalid-selection state ของหน้าปัจจุบัน ไม่ reload, discard, rebind ไปแถวข้างเคียง หรือสร้าง receipt จาก URL ในเซลล์เพื่อให้บันทึกผ่าน การหยุดหลัง remount ที่ทำ File สูญหายไม่ผ่าน policy นี้
- ข้อความที่อนุมัติ: **“ยังยืนยันตำแหน่งไฟล์กับแถวไม่ได้ ยังไม่บันทึก กรุณาคงหน้านี้ไว้”** ใช้กับกรณี mapping ไม่ยืนยัน ไม่ใช้แทนคำแนะนำ unknown upload/DELETE ซึ่งเป็นอีกสถานะ
- Internal row/project/workspace saves ไม่เป็นเหตุ ECM POST/DELETE และการเลื่อนแถวไม่ rename/reupload ไฟล์ที่ไม่เปลี่ยน ไม่ใช้ guard policy นี้ปลด unknown-operation HOLD หรือยกเว้น ownership/history/reference fencing
- การกำหนดว่า operation ไม่รองรับไม่ใช่หลักฐานว่าป้องกันได้แล้ว ต้องพิสูจน์การควบคุมคำสั่งหรือการตรวจ transition ที่กระทบไฟล์จริง โดยเฉพาะ same-row-count reorder หาก implementation ป้องกัน/ตรวจ boundary ที่เลือกไม่ได้ ต้องรายงาน unverified ไม่ประกาศ safely rejected จาก source, row-count check หรือ warning เฉย ๆ

#### แผนพิสูจน์และผลต่อแผนงาน

- ใช้ approved HTTP seam เดิม ตรวจ saved JSON/XLSX/exact bytes และ no-extra-write assertions ก่อน Native-only commands ตรวจ actual ONLYOFFICE พร้อม version/คำสั่ง/before-after artifacts และ pending proof ไม่ขออนุมัติ testing seam เดิมซ้ำ
- Matrix verification ต้องครอบคลุม User Draft/Admin Correction, durable legacy/template modes ตาม contract เดิม, saved/pending replacement/pending removal/invalid selection/zero-byte/empty gaps และหลาย attachment columns รวมคำสั่งต่อเนื่องที่กระทบ mapping ใช้ A/B ที่ข้อมูลและ bytes ต่างกันตรวจว่า survivor ไม่เปลี่ยนไฟล์ ไม่ใช้ green row-count หรือ URL-only assertion แทน byte proof
- [สัญญาลบแถวสุดท้าย: ล้างคงหนึ่งแถวหรือเหลือศูนย์แถว](05-final-row-mapping.md) ยังเปิดและเป็นเจ้าของ final-row semantics ไม่ถือว่าการอนุมัติเพิ่ม/ลบแถวในตั๋วนี้เลือก clear-one/delete-zero แล้ว [คำเตือน refresh/navigation](07-pending-navigation-warning.md) ยังคุย trigger/discard matrix แยก โดยไม่เปลี่ยนโมเดล File-in-memory
- **Evidence status:** support matrix, guard/pending policy และข้อความ **supported โดย human approval**; guard coverage/native combinations และ runtime correctness ยังไม่ได้พิสูจน์ใหม่ ไม่มี application/config/tests/schema/DB changes ไม่มี native UI run หรือ real DCM calls ใน session นี้ ไม่ relabel historical acceptance เป็นผลของ policy ใหม่นี้
- อัปเดต map และเชื่อม policy จากสเปกเจ้าของ flows แล้ว ไม่มี fog หรือตั๋วใหม่จากการเลือกขอบเขตรอบนี้ ไม่ claim/resolve ตั๋วถัดไป ตาม workflow ให้คุยตั๋วที่เหลือก่อน แล้วทบทวน remaining HOLD จาก Resolution ล่าสุดครั้งเดียว

### Amendment — 2026-11-18 — final-row policy ยืนยันแล้ว

- [สัญญาลบแถวสุดท้ายที่ยืนยันล่าสุด](05-final-row-mapping.md#resolution--2026-11-18--pyw1tt--ทุกฟอร์ม-excel-ต้องเหลืออย่างน้อยหนึ่ง-row) ปิดด้วย minimum-one-row policy สำหรับทุก XLSX Form ที่มี repeating table ทั้งมี/ไม่มี attachment ไม่เลือก clear-one หรือ delete-zero ข้อความใน Resolution เดิมที่ระบุว่ารอ final-row choice เป็นประวัติก่อนคำตัดสินนี้
- คง support/guard matrix และ pending-preservation policy เดิม ไม่เพิ่ม row controls ใน Correction และไม่ใช้ native gestures เป็นทางลบแถวสุดท้าย bypass server guard การยืนยัน minimum-row policy ไม่ใช่ native runtime proof และไม่มี application/native UI tests ใหม่จาก amendment นี้
