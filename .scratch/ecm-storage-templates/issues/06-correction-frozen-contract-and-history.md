# 06: Final Correction ใช้ frozen Storage Template และปกป้องประวัติ

**What to build:** Admin แก้ attachments ของ Submission ผ่าน final Save Correction เดิม ใช้ storage contract ที่ตรึงไว้ รองรับ scalar/table และเปลี่ยน docs_number ด้วย original bytes จาก DCM โดยไม่ย้ายปลายทางตาม catalog หรือเขียนทับไฟล์ที่ประวัติยังปกป้องอยู่

**Blocked by:** 04 — เปลี่ยน docs_number โดย reuse original bytes จาก DCM แห่งเดียว; 05 — Table attachments แบบ Storage Template รักษา physical rows และ shared-identity safety.

**Status:** ready-for-agent

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 95–99; legacy/new history protection และ safe identity เป็นข้อกำหนดร่วม

## Acceptance criteria

- [ ] Correction ใช้ storage mode/category/template snapshot ของ Submission ที่แก้ ไม่อ่าน master ปัจจุบันมา redirect routing; legacy Correction คง legacy contract
- [ ] ตรวจ Admin authorization, reason, currently submitted/latest eligibility, base revision, capability/lease และ requiredness ตามเดิมก่อน external writes ไม่ใช้ flow นี้แก้ Draft ของ User โดยตรง
- [ ] Final explicit Save Correction เท่านั้นที่ upload selected replacements หรือ original bytes เมื่อ metadata เปลี่ยน; internal project/workspace saves ไม่ upload/delete
- [ ] Scalar และ table physical-row slots ใช้ shared trusted-original and identity paths ที่ผ่าน 04/05 ไม่สร้าง adapter/cache หรือ cleanup policy แยกเฉพาะ Correction
- [ ] Before dispatch ป้องกัน destination ที่ Submission/older Correction/other owner/workspace/eligible Operation ยัง reference อยู่; same name/token overwrite ที่ทำลาย protected bytes ต้องหยุดก่อน write ไม่อ้าง frozen JSON ว่าปกป้องเนื้อหา URL ได้
- [ ] New valid revision เก็บ document/JSON/receipt/reference ของ captured snapshot ครบ ไม่แก้ URL/token หรือ evidence ของ older revisions
- [ ] Replacing/removing current file ไม่ทำให้ older revision สูญเสียไฟล์ และไม่มี DELETE shared canonical/protected identity หรือ cleanup จาก token inequality เพียงอย่างเดียว
- [ ] Catalog rename/move/delete ระหว่างเปิด workspace ไม่เปลี่ยน published choice และไม่ทำให้ live lookup เปลี่ยนปลายทางย้อนหลัง
- [ ] Pending Files/removals ข้าม internal workspace document transition ได้เฉพาะ verified scope/physical-row mapping; ambiguity คง editor/pending state และหยุดก่อน remount ทำไฟล์หาย
- [ ] Final completion ยอมรับเฉพาะ captured snapshot; newer unsaved File/removal ไม่ถูกล้างหรือแสดงว่าบันทึกแล้ว ไม่ส่งต่อเข้า operation ถัดไปอัตโนมัติ
- [ ] In-place external overwrite/unknown commit ใช้ durable original-operation evidence และ hold ที่ถูกต้อง ไม่สัญญา external rollback หรือ resend หลัง timeout
- [ ] Existing HTTP seam พิสูจน์ Correction reason/eligibility/requiredness, frozen routing หลัง catalog changes, original-byte number change, physical slots, protected-reference rejection ก่อน upload และ selected historical revision ที่ยังถูกต้อง
- [ ] Smoke real ONLYOFFICE Correction ของทั้ง legacy/new Form ตรวจ workspace/internal-save no-write, final save, old Submission/Correction read และ actual selected-revision exports
- [ ] หาก filename grammar เดิมทำให้แก้ slot โดยไม่ overwrite protected history ไม่ได้ ให้รายงาน protected conflict อย่างชัดเจน ไม่เพิ่ม suffix หรือปลด guard เอง; feature acceptance ต้องแยก allowed success path จาก safe rejection
- [ ] อัปเดต affected Correction callers/fixtures และ workflow/domain/system map ใน change เดียวกัน ไม่เปลี่ยนสิทธิ์ Viewer/User หรือ main-document viewer

## Notes

Snapshot ที่ immutable ใน Folio ไม่ทำให้ mutable DCM URL เก็บ bytes เก่าได้ การป้องกันต้องเกิดก่อน external write ไม่ใช่แก้ references หลัง upload สำเร็จ หาก external proof ที่จำเป็นยังขาดต้อง HOLD ไม่ปิดตั๋วด้วยการสมมติ provider isolation

## Comments

### 2026-11-17 — Ticket06 isolated implementation and acceptance evidence

- Fresh worktree `/tmp/folio-storage-templates-06`, branch `feat/storage-templates-06`, confirmed clean at dependency-complete integration `d399a810f89cede072d621cf3a3b94202ce80b9c` before editing. No production change was needed: inherited03 identity fencing,04 verified initial-workspace source and05 current physical-row references already implement the required shared Correction behavior.
- Added one consumer-visible regression at the existing scalar HTTP seam. It submits scalar binary and zero-byte physical row2, opens Correction, renames/moves/deletes the exact saved catalog identities through Admin HTTP, then proves: protected Submission destination rejected with explicit overwrite message before any original GET/POST/DELETE; internal workspace save performs no file writes; changed-number final Correction uploads exact originals with frozen names and exactly `documentFile`/`template="1"`; no-year mode remains valid; current row references remain2; selected original/Correction XLSX use their exact saved URLs; immutable manifest/Submission remain unchanged. A subsequent same-filename replacement also rejects against protected Correction history before write and leaves its actual bytes unchanged. No filename suffix or guard relaxation.
- Existing reason/required physical-slot/authorization/currently-submitted/base/capability/lease/workspace/history cases remain unchanged. Existing consumer UI tests prove verified workspace continuity, conservative remapping and preservation of newer File/removal after captured final completion; another Save stays disabled rather than transferring those changes into another Operation. `CONTEXT.md` already states those domain rules and shared identity protection, so it was intentionally not duplicated or rewritten. Updated the authoritative workflow prose; generated workflow artifacts/full gates remain parent-owned.

#### Final scoped commands and results

Private wrapper `/tmp/folio-storage-templates-runtime/ticket06.env` was sourced explicitly. Verified `current_database()` equals `folio_storage_templates06_20261117_c1db2ece` before own `db:generate` and `db:migrate`; all36 migrations deployed there only. No reset, original/shared/Production migration or live DCM/PDMS request.

- `bun test apps/server/test/http/ecm-scalar-save-submit.test.ts --timeout 120000 --test-name-pattern "Correction|workspace|template.*protected|template.*unknown"`: **12 passed,0 failed,128 filtered,1225 assertions**,87.91s.
- After adding the explicit older-Correction destination/message assertions, final `bun test apps/server/test/http/ecm-scalar-save-submit.test.ts --timeout 120000 --test-name-pattern "template Correction freezes"`: **1 passed,0 failed,139 filtered,118 assertions**,5.77s.
- `bunx oxfmt apps/server/test/http/ecm-scalar-save-submit.test.ts`: completed. `bun run --cwd apps/server check-types`: PASS.
- `bun run build` in `apps/web`: PASS; needed to generate the ignored route tree for the existing UI seam. `bun run test:ui test/ui/correction-preview.test.tsx test/ui/upload-poc-pending.test.tsx`: **28 passed,2 files**. No full-repository gate or live-provider acceptance claimed.

#### Actual ONLYOFFICE smoke and exports

- Own runtime only: backend18488/provider18489/web15474/gateway18084, Chrome CDP19606/private profile, DB06. Local provider preserves new-mode HTML viewer plus authenticated public original GET and legacy direct-link transport. Native OLE picker used actual disk-backed4-byte File `[6,0,255,12]`; awaited host pending-File acknowledgement. Native cell edits used the real SDK; internal workspace saves invoked the real `FormBridge.runAction("save-correction-workspace")`, not mocked SDK replies or fabricated attachment-operation requests. Both legacy and no-year template Forms completed actual reasoned final Correction through the host button.
- Template Form `7c56413936b94dc3a4c3f3b1b5a041f4`, Response `a423d229-9f51-40e9-b612-417a7912e27d`, selected Submission `0a8587a6-f856-4427-9a0a-f47758276d42`: workspace save caused0 provider writes; changed-number Corrections1/2 each reused the exact4 original bytes. Legacy Form `fae4e1d8743f4177bcda414474c651ca`, Response `47a0b207-3fc6-4101-bd65-b987d9c9bb6b`, Submission `4ee6738e-599b-4620-8122-9278d393a4cc`: same workspace/final/revision lifecycle with original UUID filename/multipart/direct-link transport.
- Native totals: **7 uploads,0 DELETE,4 original reads**; includes the first template Submission used while discovering the existing new-entry behavior. All7 upload hashes equal `f525fdbec6b78308b01cd44038318e96211f1913d76405c6e2c301cfdb8a0fd0`. Template requests contain only2 fields; legacy requests contain the original5 fields. All protected historical links still return exact original bytes.
- Downloaded actual selected-revision XLSX/PDF through Results buttons for each original Submission, Correction1 and older Correction1 after Correction2 existed: **6 XLSX +6 PDF**. Workbook assertions compare exact saved document number/URL, remove OLE controls and expose no separate `file_token` or service secret. PDF extraction shows each selected revision's number and exact saved URL, not latest substitution. Native/export evidence under `/tmp/folio-storage-templates-runtime/correction06/`: `provider-evidence.json`, `selected-data.json`, `export-evidence.json`, `template-{original,correction1,older-correction1}.{xlsx,pdf}` and `legacy-{original,correction1,older-correction1}.{xlsx,pdf}`.

#### Fixture limitations and release boundary

- Observed existing Fill behavior automatically starts the next Draft after completed Submit; that made the Response ineligible for Correction as designed by the current eligibility guard. For the final submitted fixtures, browser interception aborted **only the automatic next-round POST `/start` after real Submit completed**, simulating leaving before the next entry. Original Submit artifacts were preserved; no DB status edits, upload/original/Correction interception or eligibility relaxation. This is not proof of uninterrupted default Submit→Correction or approval of business intent inferred from source.
- Initial native setup failed Builder callback routing until the seed used its own18683 app/listener; initial Vite optimizer cache symlink failed until an isolated cache directory was configured. Incorrect browser selectors/Chrome quoting and an ambiguous button locator were corrected. These are disclosed fixture/automation failures, not application fixes or suppressed product failures.
- No new adapter/cache/policy/schema/caller path, no inherited behavior rewritten. Provider-double evidence does not establish live DCM isolation, unknown-request settlement, rollback, Production behavior or external acceptance. Ticket closure, generated workflow refresh and final integrated native/two-axis acceptance remain with the parent; this worktree result does not close the ticket.
- Cleanup complete: closed only own browser handle; stopped own backend/provider, frontend and Chrome services; stopped/removed `folio-storage-templates-gateway06`; removed own launchers, seed/export-check scripts, credentials, frontend/cache/profile and picker File. Synthetic DB06, worktree and native/export JSON/XLSX/PDF/screenshot evidence remain for parent inspection. User/parent services and databases untouched.

### 2026-11-17 — Parent integration gate

- Merged06 at `e1ecca1448415a260824c5a5f3df78af0d69d311`. The first parent run of its new regression failed with `P2002` on global `template_name`: the task-owned integration DB already contained unrelated catalog entries. This was fixture isolation, not a reason to relax catalog uniqueness or edit existing mappings.
- A dedicated test repair made the case's frozen names unique before publication, retained filename/history assertions and preserved all7 pre-existing catalog entries unchanged. Its46-case Correction/table/original selection passed on that existing DB. Source lint repair separately preserved public original-reader/current-row/workspace contracts; neither repair changed the Correction policy.
- After both repairs merged at `90b9e9b4235629a876343a5b8bd81d3e8ab2e2d8`, Parent root scoped lint/format44 files passed, forced types5/5 passed, forced build3/3 passed, and integrated frozen-Correction/current-B smoke passed **2 tests,0 failures,178 assertions**,8.29s.
- Final native/export08 runs the delivery integration source after this gate. Full39 HTTP workflow and global UI results remain separately tracked; no worktree-only result or this limited smoke closes final review/release gates.

### 2026-11-17 — Parent inspection of retained native artifacts

- Independently inspected all6 actual XLSX exports (template/legacy × original/Correction1/older Correction1 selected after Correction2). Every full SHA-256 and size matched the retained export evidence; every worksheet value and external hyperlink matched that selected revision, not the latest.
- Parsed every ZIP XML/VML part: no OLE/control/shape/drawing anchor, embedded file, separate `file_token` field or literal service Bearer remained. Empty drawing/VML containers are not controls. This is inspection of actual exported packages, not copied renderer input.
- Extracted all6 actual PDF texts/links; document numbers and links matched each selected revision, including older Correction1. These retained06 artifacts complement, not replace, final08 execution on the current delivery source.
