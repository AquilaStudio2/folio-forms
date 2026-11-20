# ใช้ชื่อฐานซ้ำและแยกไฟล์แนบด้วย receipt ของแต่ละอัปโหลด

Status: ready-for-human Decision resolution: 2026-11-18 — ผู้ใช้ตอบ “เลือกA” ต่อข้อเสนอให้ Storage Template mode ใช้ชื่อเดิมซ้ำโดยไม่เติมเลขหรือเวลา ตาม [Resolution ล่าสุด](issues/02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--ใช้ชื่อฐานซ้ำและแยกไฟล์ด้วย-receipt) แทนทั้ง per-batch counter, timestamp และ durable cross-save counter/reservation Implementation gate: [ขอบเขต guard สำหรับไฟล์ชื่อซ้ำและ receipt ที่ชนข้อมูลเดิม](issues/09-duplicate-name-guard-policy.md#resolution--2026-11-18--pyw1tt--guard-และคำเตือนที่จำแนกได้) ปิดขั้นตัดสินแล้ว สเปกนี้ยัง planning-only รอคำสั่งอนุมัติ implementation ไม่ใช่การอนุญาต migration, live API, deploy หรือการรับรอง release

## Problem Statement

การใช้ชื่อไฟล์เป็นตัวแทน resource ทำให้ Folio อาจบล็อก actual new upload ที่ DCM สามารถเก็บเป็นไฟล์ใหม่ได้ โดยเฉพาะ Submit รอบใหม่ที่ใช้ `docs_number` และ frozen `template_name` เดิมขณะที่ Submission เก่ายังอ้างไฟล์เดิมอยู่ เป้าหมายคือให้ไฟล์แต่ละช่อง/แถว/revision ผูกกับ receipt ที่บันทึกจริงและคง bytes เดิมของ references ที่ยังอยู่ ไม่ใช่บังคับให้ทุก upload มีชื่อไม่ซ้ำ

[หลักฐานล่าสุด](issues/06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต) มี user finding และ authorized same-name PDF POST ที่สร้างรายการใหม่ โดย originals เดิมทั้งสามยังมี size/hash เดิม และ original ใหม่ตรง fixture ที่ส่ง สนับสนุนกรณี project/template/PDF/runtime นั้น ไม่ใช่ guarantee ทุกชนิดไฟล์/แม่แบบ/concurrency/DELETE หรือผล Production ที่ระบุ deployed revision แล้ว

## Solution

Storage Template mode ใช้ชื่อฐานจาก root `docs_number`, frozen `template_name` และ original extension ตามจริงซ้ำได้ ไม่เติม generated counter, timestamp, UUID, binding ID หรือ row suffix และไม่สร้าง durable filename reservation เพื่อบังคับความใหม่ แต่ละ actual upload ต้องเก็บ original response receipt ของตนเองผ่าน operational evidence และ canonical references ตาม lifecycle เดิม ไม่ใช้ search ชื่อแล้วเลือกตัวแรก/ล่าสุด

คำตอบเรื่องชื่อไม่ยกเลิก validation, permissions, lease/revision, ownership, protected references, unknown-outcome หรือ cleanup safeguards รายละเอียดการแยก filename collision ออกจาก resource conflict เป็นของ decision ticket เรื่อง guard ไม่ใช่สิทธิ์ให้ agent ปิด checks ทั้งหมด

## User Stories

1. As a User, I want ส่งรอบถัดไปด้วยเลขเอกสารและแม่แบบเดิมได้, so that ชื่อเดิมไม่ถูกเหมารวมว่าเป็นการแก้ไฟล์ของ Submission เก่า
2. As a User, I want scalar และหลายแถว/คอลัมน์ที่ใช้ชื่อฐานเดียวกันอ้างไฟล์ของตนเอง, so that ไฟล์ไม่สลับแถวหรือเปลี่ยนตามการแก้ช่องอื่น
3. As a Viewer, I want เปิด/ส่งออก revision ที่เลือกแล้วได้ receipt ของ revision นั้น, so that ไม่ใช้ไฟล์ล่าสุดจากการค้นชื่อแทนประวัติ
4. As a User, I want ไฟล์ที่ไม่เปลี่ยน reuse canonical reference เดิม, so that Save/reopen/row movement ไม่สร้าง duplicate uploads
5. As an Admin, I want legacy UUID contracts และชื่อ/receipts เก่าคงเดิม, so that การเปลี่ยนนโยบายชื่อไม่ migrate หรือ rename ข้อมูลย้อนหลัง
6. As a User, I want replacement/metadata change อ่านและตรวจ original ที่เชื่อถือได้ก่อนเขียนใหม่, so that ไม่สร้างไฟล์จาก bytes ที่ยืนยันไม่ได้
7. As a User, I want failed/unknown operations รักษา saved snapshot และ pending Files ที่ยังอยู่, so that ไม่เกิด partial commit, automatic resend หรือข้อมูลหาย
8. As an Admin, I want cleanup อ้าง resource และ surviving references ไม่ใช่ชื่ออย่างเดียว, so that ไม่ลบไฟล์อื่นที่ชื่อซ้ำหรือไฟล์ของ history

## Implementation Decisions

1. **Scope:** นโยบายนี้ใช้ actual new uploads ใน storage mode `template` ของ explicit Save Draft, Submit และ final Save Correction รวม scalar/table ทั้งใน batch เดียวและข้าม rounds/Responses ส่วน legacy UUID policy คงเดิม ไม่เปลี่ยน explicit storage mode หรือ frozen Published metadata
2. **Filename:** ใช้ `<docs_number>-<template_name>.<original-extension>` ซ้ำได้ คง original extension/casing; ไม่มี extension ให้จบที่ `template_name` ไม่เติมนามสกุลเอง ไม่ตีความจุดในเลขหนังสือ/แม่แบบเป็น extension ของ original File
3. **No generated suffix/reservation:** ไม่เติม `-(n)`, timestamp, UUID หรือ row/binding suffix ใน template mode และไม่จัดทำ durable cross-save filename allocator/reservation Counter ที่ implementation ปัจจุบันเติมภายใน batch ต้องถูก cut over เมื่ออนุมัติแก้ application ไม่คงเป็น optional mode หรือ compatibility shim สำหรับ new uploads
4. **Literal template text:** หาก frozen `template_name` มี `-(1)`, ตัวเลข, จุด หรือ whitespace อยู่จริงให้คงตามต้นฉบับ ไม่ตัดออกเหมือน generated suffix Validation เดิมยังปฏิเสธ unsafe characters ไม่ rewrite/normalize/truncate ให้ผ่าน และไม่เดา DCM routing แทน provider
5. **Receipt ทุก upload/ทุกรอบ:** ใช้ trusted original response/checkpoint ของแต่ละ upload บันทึก destination จริงและ paired `file_token`/`file_link` ใน attempt ledger ตาม lifecycle เดิม เมื่อ canonical commit แต่ละ scalar/table slot ของ current Draft, Submission แต่ละรอบและ Correction แต่ละ revision เก็บ `file_token`, `file_link`, `original_name`, `size_bytes` และ trusted `row_index` สำหรับ table ตาม schema เดิม ไม่จำกัดเฉพาะรอบแรก/รอบสอง ไม่ adopt client receipt หรือ search result จากชื่อ ไม่เลือก version จาก filename/timestamp/ขนาด และไม่เพิ่ม fields/history ของทุก Draft save โดยเดา
6. **Guard and distinct warnings approved:** ยึด [Resolution ของ guard](issues/09-duplicate-name-guard-policy.md#resolution--2026-11-18--pyw1tt--guard-และคำเตือนที่จำแนกได้) ไม่บล็อก actual new template upload เพียงชื่อซ้ำ Valid new receipt ผูกกับ slot/snapshot ของรอบนั้น ส่วน actual new upload ที่คืน receipt ชน protected history (Q3) หรือ own current Draft (Q4) ต้องหยุด canonical commit พร้อม semantic reason และคำเตือนคนละประเภท ถ้ามีทั้ง history/Draft refs ใช้ Q3; incomplete/partial aliases คง fail-closed ไม่เดาประเภทจากชื่อ ระบุ slot/row/รายการอ้างอิงภายใต้สิทธิ์ ไม่เผย raw token/secrets ไม่เปลี่ยน permissions/lease/revision/unknown safeguards และไม่อ้าง rollback remote bytes Unchanged-file reuse ที่ไม่มี POST ไม่เข้า Q3/Q4 ส่วน legacy contracts คงเดิม
7. **No extra upload:** ไฟล์และ metadata ที่ไม่เปลี่ยน reuse canonical reference เดิม การเลือก File/Cancel dialog, read/export, internal row/project/workspace save และการย้ายแถวที่รองรับไม่ dispatch upload/DELETE เพิ่ม ไม่เปลี่ยนชื่อของ survivors เพื่อให้เรียงสวย
8. **Metadata/original reuse:** การเปลี่ยน root `docs_number` ที่ต้อง upload ใหม่ใช้ original จาก trusted committed receipt และตรวจ size/hash ตามเดิม Replacement ใช้ bytes/extension ของ File ใหม่ การเปลี่ยนเฉพาะ `fiscal_year` ใน template mode ไม่ upload ใหม่ ไม่บังคับ User เลือกไฟล์เดิมใหม่เพื่อปกปิด retrieval failure
9. **Snapshot and unknown:** canonical JSON/document pointers/references/Operation ต้อง commit เป็น snapshot ครบตามเดิม Unknown upload/DELETE ไม่ resend ทั้งชื่อเดิมหรือชื่อใหม่เพื่อหนีผลค้าง ไม่มี manual token/URL/note unlock และไม่ adopt late canceled receipt เป็นคำตอบใหม่
10. **Cleanup/history:** พิจารณา cleanup เฉพาะหลัง new canonical commit และไม่มี surviving Draft/Submission/Correction/workspace/eligible-Operation references ไม่ DELETE ทุกไฟล์ชื่อเดียวกันหรือ resource ร่วมเพราะ attempt เก่าเลิกใช้ Postcommit cleanup ล้ม/unknown ไม่ undo snapshot ใหม่ และไม่ retry/ล้าง warning จาก ordinary Save
11. **Existing data:** ไม่ rename/reupload ไฟล์เก่า ไม่เปลี่ยน old canonical receipts/URLs หรือ backfill original hashes การมีชื่อซ้ำไม่ใช่ corruption หรือ shared identity โดยตัวมันเอง [Inventory/recovery policy ที่อนุมัติ](issues/03-existing-aliases-recovery.md#resolution--2026-11-18--pyw1tt--เห็นด้วยกับ-q1-ถึง-q3) คงเดิม และ execution ต้องอนุมัติแยก
12. **External namespace:** คง Q2 ที่ไม่บังคับ external inventory/search/หาเจ้าของเพียงเพราะ Folio ไม่มีข้อมูลจาก writers อื่น ไม่ถือ residual-overwrite acceptance ว่า overwrite เกิดจริงทุกกรณี หรือเป็นสิทธิ์ adopt/delete/retry ไฟล์ที่ไม่ทราบผล
13. **Unchanged contract:** DCM-only originals, original bytes ทุกชนิด, 0–10,000,000 bytes inclusive, requiredness, one-file-per-slot, canonical JSON shape/budget เดิม และ trusted `row_index` คงเดิม ไม่มี binary/base64/new answer JSON columns, per-row Tag, stable row ID, temporary archive หรือ main-document viewer/download-policy changes
14. **Row/editor scope:** ยึด [native support/guard policy](issues/04-native-table-editing-support.md#resolution--2026-11-18--pyw1tt--อนุมัติ-support-matrix-และ-guard-policy) และ [minimum one body row สำหรับทุก XLSX Form](issues/05-final-row-mapping.md#resolution--2026-11-18--pyw1tt--ทุกฟอร์ม-excel-ต้องเหลืออย่างน้อยหนึ่ง-row) ไม่ใช้การเปลี่ยน naming เพิ่ม native gestures หรือ clear-last-row action

### ขอบเขตงานแก้หลังอนุมัติ implementation

1. Cut over actual template uploads จาก per-batch generated counter ไปชื่อฐานซ้ำทุก shared scalar/table/Submit/Correction consumer ไม่คง counter เป็น fallback และไม่ rename/reupload old files หรือเปลี่ยน legacy UUID
2. ปรับ shared destination/reference/receipt admission ให้แยก filename ออกจาก provider identity และคง scope/owner/history/unknown requirements ไม่ patch เฉพาะ `test_4` หรือปิด guard ทั้งหมด
3. เก็บ original attempt/receipt และ canonical metadata ทุก upload/round ผ่าน transaction เดิม แยก Q3/Q4/incomplete-identity outcomes ให้ UI/plugin แสดงเหตุผลตรงกันโดยไม่เพิ่ม answer JSON fields
4. รักษา original upstream HTTP status และ safe error details ที่จำเป็นผ่าน existing diagnostic/error channels ก่อน adapter กลืนเหตุผล ไม่ส่ง raw body/credentials/tokens ให้ browser ไม่เพิ่ม logging subsystem หรือ automatic file POST/DELETE retry
5. อัปเดต existing consumer regressions ตาม Testing Decisions และออกแรง smoke ที่ changed path จริง: Submit รอบแรก/รอบถัดไปเลขเดิม, selected historical revision และ Q3/Q4 warnings/pending state ไม่แทนด้วย helper/mock echoes
6. อัปเดต caller contracts/tests/docs/system map ที่ได้รับผลตาม repo workflow เมื่อทำ code change และรายงาน scoped provider/UI limits ตามจริง ไม่ใช้ผล docs-only รอบนี้เป็น implementation acceptance

## Testing Decisions

ใช้ existing HTTP integration กับ application, isolated DB/store และ controlled provider เป็น seam หลักตามที่อนุมัติไว้ ตรวจ canonical JSON, saved XLSX, original bytes และ dispatch counts ไม่สร้าง seam ใหม่หรือใช้ raw helper assertion แทน consumer behavior Native/browser และ real-provider tests ใช้เฉพาะ boundary ที่ HTTP พิสูจน์ไม่ได้และต้องอยู่ใน execution scope ที่อนุมัติ

เกณฑ์ที่ต้องพิสูจน์หลังอนุมัติ implementation และสรุป guard policy:

1. Submit ครั้งแรก แล้วเริ่มรอบใหม่ใช้เลข/แม่แบบ/extension เดิม: actual upload ครั้งใหม่ใช้ชื่อฐานเดิม แต่ canonical receipts และ selected-revision downloads ถูกต้อง Original Submission ยังอ่าน bytes เดิม
2. Same-base scalar, หลายคอลัมน์/physical rows และหลาย Responses: ใช้ชื่อฐานซ้ำโดยไม่ generated suffix และแต่ละช่องผูก original receipt/bytes ของตนเองหลัง save/reopen/partial replacement
3. ตรวจ before/after exact bytes ของทุก surviving old reference เมื่อแทนไฟล์บางช่องหรือ final Correction ไม่ใช้จำนวน rows, token ต่างกันหรือ HTTP 200 เพียงอย่างเดียวพิสูจน์ independence
4. Unchanged save, read/export, row/project/workspace transition และ Cancel ไม่เพิ่ม POST/DELETE Pending และ saved mappings รักษาตาม guard policy ไม่ย้าย receipt ไปช่องข้างเคียง
5. Literal suffix/whitespace ใน template, original extension/casing, extensionless และ metadata change คง contract จริง ไม่มี allocator/reservation requirement หรือ counter reset/recycle tests ของนโยบายที่ยกเลิก
6. ใช้ create-new provider model สำหรับ same-name happy path และ explicit alias/receipt-conflict models สำหรับ safeguards ไม่บังคับ filename-keyed overwrite เป็น current DCM truth ไม่เปลี่ยน fake ให้ผ่านโดยซ่อน protected-resource conflict
7. Batch partial failure, lost Folio response, late canceled receipt, restart และ uncertain DELETE รักษา atomic snapshot/unknown/cleanup-warning behavior ไม่มี automatic write resend หรือ search-adopt-latest
8. ตรวจ concurrent operations, permission/lease/revision, old/new snapshots และ reference/delete barriers ตาม guard decision ไม่ปฏิเสธ consumer path เพียงเพื่อรักษา assertion ชื่อไม่ซ้ำของ counter เดิม
9. คง validation และ behavior เดิมของ legacy UUID, 0/10 MB boundaries, originals/hash verification, requiredness, physical row transitions และ selected-revision export
10. Provider evidence ต้องระบุ environment/version/date/scope ที่ทราบ แยก [same-name original independence](issues/01-provider-independent-resources.md#amendment--2026-11-18--เปลี่ยนแผนหลักฐานเป็นชื่อฐานซ้ำตามคำตอบล่าสุด), [unknown settlement](issues/06-unknown-settlement-contract.md#resolution--pyw1tt--อนุมัติแผนหลักฐานสองชั้น), [ชนิดไฟล์/ขนาดต่อช่องตามขอบเขตที่ผู้ใช้ปรับ](issues/08-provider-type-size-capacity.md#resolution--pyw1tt--อนุมัติแผนชนิดไฟล์และขนาดต่อช่อง) และ DELETE isolation ไม่ใช้ PDF sample ปิดทุก gate; type/size matrix ไม่บังคับ exact-byte comparison หรือ aggregate capacity workload ตาม Resolution ล่าสุด ไม่ใช่การลบ runtime integrity checks หรือหลักฐานคุ้มครอง history ในขอบเขตอื่น

รายการนี้เป็น acceptance ที่ต้องทำภายหลัง ไม่ใช่ผลทดสอบใหม่ของนโยบายนี้จากการแก้เอกสาร

## Out of Scope

- ไม่มี application/schema/DB/live API/commit/push/deploy changes จากสเปกหรือ human naming answer นี้
- ไม่เปลี่ยน legacy/frozen contracts, หนึ่งไฟล์ต่อ slot, PDMS Field/filter semantics หรือ selected-revision/main-viewer behavior
- ไม่เปิด private-link/storage redesign, temporary original storage, auto-upload/retry, manual unlock, native file moves หรือ operator dashboard ใหม่
- ไม่กู้ bytes ด้วยการตั้งชื่อ ไม่ทำ old-data remediation/DELETE โดยไม่มีขอบเขตและอนุญาตแยก

## Further Notes

- **Current intended policy:** [Resolution ใช้ชื่อฐานซ้ำและแยกไฟล์ด้วย receipt](issues/02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--ใช้ชื่อฐานซ้ำและแยกไฟล์ด้วย-receipt) เป็นเจ้าของ human decision ส่วนสเปกนี้เป็นเจ้าของ filename contract ไม่ใช่ deployed/current source behavior
- **Historical policies/results:** counter ภายใน batch, timestamp และ durable cross-save reservation ถูกแทนแล้ว เก็บลำดับคำตัดสินใน ticket และ [planning history](../ecm-storage-templates/planning.md) ไม่ relabel [BATCH 143/143](../ecm-storage-templates/acceptance-matrix.md#batch-filename-verification) เป็น acceptance ของกฎปัจจุบัน
- **Current source inspected:** `numberDuplicateAttachmentFilenames` / `planAttachmentUploads` ยังจัดเลขภายใน batch; identity admission มี filename-first checks ไม่ถือว่านโยบายใหม่ implement แล้ว และไม่ได้ยืนยัน deployed revision จากการอ่าน Working Tree
- **Evidence:** [latest scoped provider proof](issues/06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต), [provider research](../ecm-storage-templates/provider-contract-research.md#authorized-duplicate-name-original-byte-evidence--2026-11-18), [existing HTTP seam](../../apps/server/test/http/ecm-scalar-save-submit.test.ts) และ [historical table audit](../ecm-storage-templates/table-upload-behavior-audit.md) ต้องอ่านตาม provenance/scope ของแต่ละ snapshot ไม่ใช่ Production guarantee
- **Domain/remaining decisions:** ใช้ [CONTEXT](../../CONTEXT.md), [ADR 0003](../../docs/adr/0003-pdms-project-name-choices.md), [ADR 0004](../../docs/adr/0004-results-filters-use-scalar-field-tags.md) และ [risk map](map.md) ไม่เปิดคำตัดสินที่ไม่เกี่ยวกับ naming เป็นคำถามซ้ำ
