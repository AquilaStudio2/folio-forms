# 01: ส่งชื่อเดิมได้ พร้อม receipt และคำเตือนถูกประเภท

**What to build:** User บันทึกหรือส่ง Response ทุกรอบด้วยเลขเอกสารและ Storage Template เดิมได้ แต่ละ scalar/table slot และ Correction ใช้ receipt ของไฟล์ที่บันทึกจริง เมื่อ actual new upload คืน receipt ที่ชนประวัติหรือ Draft เดิม ต้องหยุดพร้อมเหตุผลที่จำแนกได้โดยไม่สูญเสีย saved answer หรือ pending File

**Blocked by:** None (can start immediately).

**Status:** in-progress — integrated; isolated HTTP naming/receipt paths pass; final full-suite and actual warning/pending smoke remain

**Spec coverage:** ECM Attachment Safety implementation spec — US01–40, US88; H01–H06, H09–H10 และส่วน receipt warnings ของ U05

**Execution gate:** เผยแพร่ตั๋วเพื่อให้ผู้ใช้ตรวจเนื้อหาเท่านั้น ต้องมีคำสั่งเริ่ม implementation หลังตรวจตั๋วก่อนพัฒนา ไม่ authorize real DCM, live-data changes, DELETE, push หรือ deploy

## Acceptance criteria

- [ ] First Submit แล้วเริ่มรอบใหม่ตาม flow ปกติ ใช้เลขเอกสาร/แม่แบบ/extension เดิมส่งรอบที่สองและรอบถัดไปสำเร็จผ่าน actual app HTTP ไม่เปลี่ยนเลข ไม่บังคับ Save Draft ก่อน และไม่สกัด automatic next-round flow เพื่ออ้างว่าผ่าน
- [ ] Actual template uploads ใช้ชื่อฐานซ้ำได้ทั้ง scalar, หลาย physical rows/columns, ต่าง Responses และ final Save Correction ไม่มี generated counter/timestamp/UUID/row suffix หรือ filename reservation คง original extension/casing, extensionless, literal suffix/dots/whitespace ที่ valid และ unsafe-input rejection ตาม naming decision ล่าสุด
- [ ] Shared prepare, before-send, receipt, reference และ deletion admission แยก filename-only coincidence จาก actual resource/scope conflict ทุก affected consumer ใช้ contract เดียวกัน ไม่ patch เฉพาะ second Submit และไม่ถอด actor/owner/role/lease/revision/opening/slot/unknown/reference fences
- [ ] แต่ละ actual upload เก็บ original attempt, destination และ paired receipt ตาม ledger เดิม ทุก current Draft/Submission/Correction snapshot มี canonical metadata ของไฟล์ที่อ้างจริงตาม schema เดิม รวม trusted table row_index ไม่ adopt client receipt หรือเลือก search result แรก/ล่าสุดจากชื่อ
- [ ] Actual new template upload ที่คืน paired receipt ของ surviving Submission/Correction หยุด canonical commit ด้วย semantic history-conflict reason ส่วน paired receipt ของ own unprotected current Draft หยุดด้วย semantic Draft-conflict reason ทั้งสองมีเหตุผลจำแนกผ่าน HTTP/Operation/host/plugin ตามสิทธิ์ ไม่ใช้ Q3/Q4 เป็นศัพท์ผู้ใช้
- [ ] Resource ที่มีทั้ง Draft และ history ใช้ history precedence; one-sided/partial/multiple/held aliases และ protected conflicts อื่นคง fail-closed ตามหลักฐาน ไม่เดาประเภทจากชื่อหรือ match ข้างเดียว และไม่ผ่อน same-batch alias safeguards
- [ ] Warning ระบุ Field/Tag/physical row และ references ที่พิสูจน์ได้ภายใต้สิทธิ์ บอกว่ารอบนี้ยังไม่บันทึก ไม่เผย raw tokens/service secrets/ประวัติของผู้อื่น และไม่อ้างว่า cancel หรือ DB rollback คืน remote bytes ได้
- [ ] Conflict/failure ไม่ partial commit document/JSON/references/Operation ไม่แก้ history ไม่ล้าง pending ที่ยังอยู่ในหน้า ไม่ DELETE shared resource ไม่ resend/เปลี่ยนชื่อ/สั่ง refresh เพื่อหนี conflict Original receipt/conflict evidence ยังคงตรวจย้อนกลับได้
- [ ] Unchanged reuse ที่ไม่มี POST ไม่ถูกบล็อกด้วย actual-new-upload policy และไม่บังคับ token ใหม่ Number change อ่าน trusted original พร้อม existing size/hash/origin checks; replacement ใช้ File ใหม่; year-only template edit ไม่ upload เพิ่ม Legacy UUID/Published PoC/frozen contracts และ old filenames/receipts ไม่เปลี่ยน
- [ ] Existing multipart และ receipt adapter contract คงเดิม: template mode ส่ง original documentFile กับ template ข้อความ "1" โดยไม่เพิ่ม legacy metadata parts รับ valid object/one-item-array receipt และปฏิเสธ malformed receipt ตามเดิม ไม่สร้าง parser/retrieval layer ซ้ำ
- [ ] Safe diagnostics เก็บ upstream HTTP status/details ที่จำเป็นผ่านช่องทางเดิมก่อนถูก generic adapter error กลืน ไม่ส่ง raw provider body/credentials/tokens ไป browser ไม่เพิ่ม logging subsystem หรือ automatic POST/DELETE retry และไม่เดาสาเหตุ HTTP 500 เดิม
- [ ] Lost Folio acknowledgement, unknown upload, late canceled receipt, restart และ uncertain DELETE คง original-checkpoint/no-resend/reference fencing behavior B ที่ commit แล้วแต่ cleanup A ค้างยังใช้ได้พร้อม persistent warning ไม่กลายเป็น failed save
- [ ] ใช้ existing isolated HTTP seam กับ create-new provider model สำหรับ happy path และ explicit history/Draft/partial-alias/unknown models สำหรับ guards ตรวจ canonical JSON/XLSX/receipt และ exact bytes ของ survivors ตาม local history/mapping plan ไม่ใช้ filename-keyed overwrite เป็น universal DCM truth
- [ ] ทำ targeted browser/plugin smoke ของ warnings และ pending preservation บน changed path ของตั๋วนี้ ไม่รอให้ตั๋ว 06 เป็น verification แรก ปรับ affected consumer tests/fixtures/types และลบ obsolete suffix-only/incidental-wording assertions โดยไม่ลด legacy/security regressions
- [ ] อัปเดต affected domain/canonical behavior และ system map ใน change เดียวกัน ระบุ source revision และผลที่รันจริง โดยไม่ relabel historical BATCH/provider samples เป็น acceptance ใหม่

## Scope boundaries

Reuse existing planner, attempt/identity/reference ledger, Operation/error surfaces และ canonical transaction ไม่สร้าง allocator, answer JSON fields, schema หรือ compatibility mode ใหม่ งานนี้แก้ behavior ตาม approved naming/guard policy ไม่ใช่เปลี่ยน public-link/DCM-only/requiredness/size policy

ผล HTTP และ byte assertions ของตั๋วนี้เป็น isolated implementation proof ไม่ใช่ provider acceptance และไม่เพิ่ม byte-comparison requirement กลับเข้า provider type/size plan การแก้ navigation/loading เต็ม matrix อยู่ในตั๋ว 04–05 แต่ตั๋วนี้ต้องไม่ทำ pending safeguards เดิมถดถอย

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown ชุด 10 ตั๋วและ blocking edges ผ่าน /to-tickets แล้ว อนุมัติเฉพาะการเผยแพร่ตั๋วและหยุดให้ตรวจเนื้อหาก่อนเริ่ม implementation ไม่มีผลทดสอบหรือ provider approval ใหม่จากการสร้างตั๋ว

### Implementation — 2026-11-18 — integration verification pending

- Work branch: `feat/ecm-safety-01`, based on integration planning baseline `838056b`. Canonical policy: naming specification `../ecm-attachment-safety/spec.md` and resolved guard decision D09 (2026-11-18; SHA-256 recorded by the parent implementation specification).
- Removed the template batch filename counter, preserving original extensions and frozen literal template text. Shared destination admission now permits settled, active template resources with the same filename, including other Responses and history. Unresolved attempts, held/deleting resources, scope/lease/revision guards, and receipt/reference/delete fences remain.
- Actual template uploads classify exact original paired receipts before canonical commit: `attachment_history_receipt_conflict`, `attachment_draft_receipt_conflict`, or `attachment_receipt_conflict` for incomplete/ambiguous/protected aliases. History takes precedence over Draft. Conflict receipt evidence commits to the existing attempt ledger before the error is raised; the shared identity is held before cancellation can schedule cleanup.
- Existing `Operation.result` gains optional `attachmentErrorReason`; the top-level Operation failure remains `document_save_failed`. Existing `errorMessage` carries the semantic notice, Field/Tag/physical row, and proven same-Response Submission/Correction IDs. No raw token/link or foreign reference IDs enter the notice. Existing host/plugin message rendering remains the consumer contract; ticket 04 owns pending/loading lifecycle changes.
- Upstream upload rejection preserves its numeric HTTP status in the existing safe error message and retains `ecm_rejected` rather than swallowing it into `ecm_unavailable`. Response bodies, credentials, and raw tokens are not included; no retry or logging subsystem was added.
- Consumer regressions now cover same-name create-new receipts across physical rows/columns, Responses, Correction, and three direct-Submit rounds. Added separate paired history/Draft and partial-alias checks, retained receipt evidence/no canonical commit/no DELETE assertions, safe upstream status checks, and one-row zero-byte deletion rejection for ticket 02.
- Historical shared-receipt regression fixtures are seeded explicitly after distinct HTTP uploads. They are pre-policy data fixtures, not evidence that new uploads may create shared receipts. Existing survivor/delete/original-hash coverage remains on the public HTTP consumer paths.
- Verification performed here: integration ancestry check only. No tests, build, lint, formatter, browser, native editor, real provider, live DB, or real DELETE was run. This ticket remains unresolved pending integrated execution and native warning/pending-preservation proof.

#### Exact verification commands for integration owner

Run with the existing isolated PostgreSQL/object-store/native Builder environment and a non-default isolated callback port; do not load production credentials:

```sh
cd apps/server
bun test --timeout 120000 test/http/ecm-scalar-save-submit.test.ts
bun test --timeout 120000 test/http/ecm-auth.test.ts
bun test --timeout 120000 test/http/submission-history.test.ts
```

Then run the repository's existing integrated type/lint/build checks and actual supported browser/plugin warning smoke. Verify both semantic warnings preserve pending File/removal, display Tag/physical row, and do not instruct refresh/resend/discard. Isolated HTTP results are not DCM/provider acceptance.

#### Intended shared documentation deltas for parent

- `CONTEXT.md` / domain behavior: replace template per-batch suffix and filename-ownership claims with base-name reuse plus original receipt identity. Legacy UUID naming and old canonical receipts remain unchanged.
- System map / generated guide: upload planning uses the unchanged base name; admission fences uncertain requests rather than settled filename coincidences; exact receipt conflicts persist evidence, hold shared resources, and stop canonical commit. Document `Operation.result.attachmentErrorReason` and safe numeric upstream status diagnostics.
- Preserve historical BATCH/provider records with their original revision/scope. Do not relabel them as acceptance of this implementation. Record the final integration revision and actual HTTP/native outcomes after execution.

### Integration evidence — 2026-11-18

- Integrated as `108fb942dc434b8d7f4e3079852039f3ebdfc36a`. First complete scalar/table HTTP run observed 151 pass and one fixture failure across 152 cases. Same-number three-round Submit, distinct scalar/table/foreign-Response/Correction receipts, semantic history/Draft/partial-alias conflicts, safe upstream status and surviving-original checks passed in that run.
- The failed generic whole-Response cleanup case still seeded the old same-receipt replacement policy after normal cleanup had retired its original resource. Its scenario now starts from one real saved upload and tests failed/unknown deletion tracking directly; dedicated pre-policy shared-identity cases remain. Both repaired cleanup cases passed, 74 assertions. This is a targeted repair result, not a claim of one uninterrupted green full run. Final integration must rerun the complete suite.
- During an intermediate fixture variant, immediate Response deletion after an unrelated replacement encountered serialization conflicts while earlier postcommit cleanup could still run. No runtime cleanup change or retry was made. The final acceptance/review must assess that interleaving separately; the generic fixture repair does not prove it cannot return HTTP 500.
- Root format/lint passed after correcting seven new awaited-member style violations without changing assertions. Updated domain terminology/current naming/admission/semantic-error descriptions and the system map, retaining superseded batch evidence as historical. Workflow generation/check and generated HTML inspection passed before the final paragraph clarification.
- Actual host/plugin warning and pending-preservation smoke remains pending until the latest native/active-save slices are integrated. No real DCM calls or provider acceptance occurred.
