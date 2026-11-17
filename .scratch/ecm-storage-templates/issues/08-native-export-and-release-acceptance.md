# 08: ตรวจ integrated native journey, selected-revision exports และ release evidence

**What to build:** ปิดวงจรผู้ใช้จริงตั้งแต่ Admin CRUD/authoring/duplicate ไปถึง Draft, Submit, Correction, read-only/export และ deletion บน integration checkout เดียวกัน ตรวจ exports ของ revision ที่เลือก และจัดหลักฐานว่า local behavior, real ONLYOFFICE และ authorized DCM acceptance ผ่านหรือยัง HOLD ส่วนใด

**Blocked by:** 06 — Final Correction ใช้ frozen Storage Template และปกป้องประวัติ; 07 — Response deletion ปลอดภัยต่อ shared file identity และติดตาม cleanup ต่อได้.

**Status:** ready-for-human

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 100–106, 111–112; integrated acceptance ครอบคลุม stories 1–112 ไม่แทน checks ระดับตั๋วก่อนหน้า

## Acceptance criteria

- [x] รวม 01–07 และตรวจ behavior บน delivery integration checkout เดียว ไม่ใช้ผล passing ของ worktree/branch แยกมาแทน final integrated result
- [x] Actual Admin page ทำ persisted list/filter/create/rename/move/delete confirmation ครบ category ID/type semantics ถูกต้อง และไม่มี User/Viewer write access
- [x] Real ONLYOFFICE external popup ใช้ dependent category/template selects ทั้ง scalar/table, empty/error/reload, Cancel/Escape/focus และ dirty guards ไม่เปลี่ยนเป็น demo/sidebar flow
- [x] Complete native journey: author/save/publish no-year new-mode Form → duplicate new link → User Save Draft/reopen/replace/Submit → Admin final Correction → selected-revision views/exports → authorized Response deletion/follow-up
- [x] Legacy published Form/old Draft/Submission/Correction ใช้ contract เดิม ไม่มี file/data migration; catalog changes และ duplicate ไม่เปลี่ยน original link, saved URLs/tokens หรือประวัติ
- [x] User/Admin/Viewer read-only results ใช้สิทธิ์เดิมและเลือก revision จริง ไม่ทำ upload หรือเปิด mutation controls จากหน้าดู
- [x] Read-only workbook และ downloaded XLSX/PDF จริงใช้ saved `file_link` แทน attachment buttons ของ revision ที่กำลังดู ไม่ substitute latest/search/path-derived URLs เมื่อประวัติมีปัญหา
- [x] ตรวจ workbook/export package จริงว่าไม่มี separate file_token fields/hidden metadata/service Bearer/credentials และไม่แก้ canonical editable workbook เพื่อทำ export
- [x] ส่ง provider URL ตามจริง โดยระบุ caveat ว่า token อาจอยู่ใน query และ URL เป็น public ตาม accepted policy ไม่อ้าง privacy หรือ immutable DCM bytes จาก frozen Folio config
- [x] Pending File/removal ขัดขวาง export ที่จะทำให้เข้าใจว่าบันทึกแล้ว; export ไม่ upload ไม่ปล่อย fake URL/blob/filename และ ordinary unsaved Fill Download ยังใช้ได้เมื่อไม่มี attachment change ค้าง
- [x] Native scalar/table docs_number change ไม่ต้องเปิด picker เพื่อเลือกไฟล์เดิมใหม่ ได้ exact original bytes จาก DCM-only flow; same-identity overwrite ไม่ DELETE ซ้ำ และ cleanup failure หลัง B commit แสดง warning ค้าง
- [x] UI controls มี labels, keyboard access, correct focus และ slot/row-specific safe errors; User เห็น unknown-outcome hold ต่างจาก successful save with cleanup warning
- [x] Existing HTTP integration suites และ affected native/UI checks ผ่านแบบรวม ครอบคลุม catalog races, persisted modes, global names, original bytes/limits, physical rows, protected history/shared identity และ no automatic write retries
- [ ] Before release มี authorized DCM evidence ของ supported original-download flow ทุก in-scope file type/boundary, filename ที่มีขีด/extensionless, actual object receipt และ same-token/link no-extra-DELETE; ใช้ synthetic fixtures ตรวจ collision ก่อน write และไม่ retry unknown writes
- [x] หากยังไม่มีสิทธิ์ live API หรือ provider capability/settlement proof ที่ต้องใช้ ให้รายงาน exact missing prerequisite, tested/untested และ HOLD release ไม่เรียก live ด้วยสิทธิ์เก่าที่หมดขอบเขต ไม่ขอคำตอบข้อ 1–3 ซ้ำ และไม่ลด all-type/DCM-only/CRUD scope
- [x] เตือน duplicate-name/shared-URL limitation ก่อนเปิดใช้ ไม่อ้างว่าไฟล์ทุกช่อง/แถว independent; ownership/history guards และ safe conflict rejection ยังคงทำงาน
- [x] ปิด traceability ของ stories 1–112 และ acceptance ทุกตั๋ว ระบุ observed verification กับ outstanding human/provider approval แยกกัน ไม่ mark resolved จากเอกสารหรือ test count เพียงอย่างเดียว
- [x] อัปเดต domain/workflow/system map พร้อม generated outputs ตาม repo convention เปิดตรวจ rendered guide จริง และใช้ root scripts ตรวจ format/lint/type/build ที่เกี่ยวข้องก่อน commit
- [x] นำ throwaway probes/fixtures/services ที่สร้างเฉพาะรอบทดสอบออกหลังเก็บ sanitized evidence ไม่เก็บ credentials/tokens/private receipts ใน public repo และไม่กระทบ runtime/ข้อมูลที่ผู้ใช้มีอยู่ก่อน

## Notes

06 มี dependencies 04/05 ซึ่งรวม 03/02/01 อยู่แล้ว จึงไม่เพิ่ม redundant blocking edges; 07 เป็น deletion/follow-up path ที่ต้องผ่านเพิ่ม ไม่มีความจำเป็นให้ 04 กับ 05 block กันเอง

ตั๋วนี้เป็น integrated behavior/export/native acceptance ไม่ใช่สิทธิ์ postpone validation, identity safety หรือ docs ของตั๋วก่อนหน้า การปิดงานไม่เท่ากับ production deployment approval

## Comments

### Acceptance evidence ownership — 2026-11-17

- [Canonical acceptance matrix](../acceptance-matrix.md) is the single traceability owner for all112 stories and135 ticket acceptance criteria. Evidence status is separate from ticket disposition.
- Worktree08 base confirmed `e1ecca1448415a260824c5a5f3df78af0d69d311`. Final native runtime must import the delivery integration checkout after SOURCE READY, not this worktree.
- Verified exact isolated DB08 with `current_database()`, then deployed all36 migrations there only. Integration-only launcher, private env and gateway are prepared outside the repository; no application/browser launch before the source gate.
- Parent owns final full checks, generated workflow/rendered guide, two-axis review and closure. External provider/human prerequisites remain HOLD; no live DCM/PDMS calls by ticket08.

### Final integrated local acceptance — 2026-11-17

- Actual runtime imported only delivery integration production source `90b9e9b4235629a876343a5b8bd81d3e8ab2e2d8` after explicit SOURCE READY. Later integration `6ae84f9` changed tests/docs only. No08 production, schema, eligibility or authorization changes were needed.
- [Canonical matrix](../acceptance-matrix.md#final-integrated-native-evidence) records every story/criterion,40 chronological native observations, source/artifact revisions and exact limits. Actual Admin persisted CRUD/keyboard/error paths; scalar/table native authoring, empty/error/reload/cancel/dirty guards, no-year publication and independent duplicate; User Save/reopen/replace, shared-row deletion/current-B reuse and saved0-byte row; frozen new/legacy Correction, selected revisions, roles, deletion/follow-up and unknown-upload HOLD were exercised with the real SDK, external pickers and disk-backed Files. No SDK mocks or fabricated attachment-operation payloads.
- Actual6 XLSX+6 PDF plus1 ordinary-unsaved XLSX were retained and inspected. Saved scalar/table URLs and selected document numbers match exactly; PDF URI annotations agree, OLE controls/separate file_token/local provider service secret are absent, and6 canonical object hashes remain unchanged. Artifacts: `/tmp/folio-storage-templates-runtime/acceptance08/{native-evidence,export-evidence,legacy-export-evidence,final-revisions,legacy-revisions,unknown-final,source-revision,cleanup-evidence}.json`, exported files and `viewer-follow-up.webp`.
- Both actual template/legacy Submit committed, but only the subsequent automatic next-round POST `/start` was aborted to preserve an eligible submitted fixture. Existing default Fill still starts another Draft and then correctly blocks Correction. This is not uninterrupted default Submit→Correction, no business-policy approval is inferred, and no status/eligibility guard was weakened. Initial selector/readiness/remount/wait failures are disclosed in evidence, not counted as passes or application fixes.
- Parent reported final integration root lint/format, types5/5, build3/3, UI267, plugin312, spreadsheet116 and503 distinct HTTP cases across all39 suites. These are parent-run results, not08-run full gates. Workflow/domain behavior is unchanged by this documentation-only ticket; owner prose already covers the observed paths. Parent retains generated workflow/rendered-guide, two-axis review and closure.
- No live DCM/PDMS calls by08. Parent's one629-byte PDF proves only that sample; remaining all-type/boundary/overwrite/no-extra-DELETE/settlement/deployed-revision evidence is unexercised and keeps release HOLD. This does not assert that the user prohibited all other file types. Public/shared URLs can expose later bytes; frozen Folio metadata does not make provider files independent or immutable.
- Cleanup completed: released only own browser; stopped exact own backend/provider/frontend/Chrome services; removed gateway08, own private scripts/env/accounts/Files/provider-double continuity archive/shadow/cache/profile/wrapper. Isolated DB08, worktree, sanitized evidence and exports remain. Parent/user runtimes, original checkout and real provider files were untouched. No ticket is closed from counts or documentation.

### Parent integration disposition — 2026-11-17

Local native/export/role/deletion/unknown acceptance and all112-story/135-criterion traceability are complete, with qualified default-next-Draft fixtures. Before-release provider AC14 remains unchecked; human/provider acceptance is still required.

- Delivery branch `feat/ecm-storage-templates`; production source `d8162b8`, final fixture merge `baf64cb`. See the [canonical acceptance matrix](../acceptance-matrix.md) for final integrated HTTP/native/export/root/review evidence and exact source qualifications. This disposition is based on observed consumer behavior and source review, not copied worktree checkboxes or counts alone.
- Final Standards and Spec rechecks have no code findings. Workflow/source inventory/rendered guide were rebuilt and opened; owned test runtimes/databases/bucket/worktrees and private scaffolds were removed after retaining evidence. Original checkout and existing user services remain; no user schema/answer migration, push or deployment. Normal coordinated live authentication is not represented as zero DB writes.
- Provider all-type/boundary/overwrite/settlement/deployed-version and human release evidence remain HOLD. One authorized synthetic PDF remains for the user to remove; local resolution is not provider/Production approval.
