# 02: ตั้ง Storage Template ใน popup และตรึงสัญญาเมื่อเผยแพร่ Form ใหม่

**What to build:** Admin ใช้ปุ่มแนบไฟล์ Excel และ external popup เดิม เลือก category แล้ว Storage Template ที่สัมพันธ์กัน บันทึก Template Draft และเผยแพร่ snapshot ที่ไม่เปลี่ยนตาม catalog ภายหลัง เปลี่ยน routing โดยทำสำเนาเป็น Form/link ใหม่ ไม่แก้ต้นฉบับ

**Blocked by:** 01 — Admin จัดการ Storage Template catalog ครบ CRUD.

**Status:** completed — targeted HTTP/application checks and actual isolated ONLYOFFICE smoke passed; integration owner rebuilds generated workflow artifacts.

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 23–49

## Acceptance criteria

- [x] เพิ่ม storage mode และ category/template metadata ใน Draft Field Rules และ published Manifest/Spreadsheet Contract ตาม lifecycle เดิม ไม่ใส่ routing metadata ใน placement-only Excel Binding
- [x] Existing Published Templates/Responses ระบุ legacy mode ได้โดยไม่เปลี่ยน saved values, request policy หรือ files และไม่เดา mode จากการมี `fiscal_year`
- [x] Existing external popup ให้เลือก category ก่อน template และแสดงเฉพาะ mappings ของ numeric category ID ที่เลือก User ไม่ได้สิทธิ์เลือกปลายทางและไม่มี template answer Tag ใหม่
- [x] หมวดที่ไม่มีแม่แบบเลือกไม่ได้ เปลี่ยนหมวดแล้วล้าง incompatible template; โหลดใหม่หลังย้าย/ลบรายการสุดท้ายไม่คง option ผิดหมวด
- [x] Confirm ใช้ได้เมื่อทั้งคู่ valid; loading/error/empty ยืนยันไม่ได้ Cancel/Escape ไม่สร้าง/แก้ Field หรือ button และคืน focus ตาม interaction เดิม
- [x] Backend ตรวจ current mapping ID/category/name กับ catalog ปฏิเสธ forged, renamed, moved หรือ deleted selection ที่ stale แม้ UI เคยโหลดถูกต้อง
- [x] รักษา auto-tags, label/required edits, stable binding, native saved-button proof, lease/revision checks, authoring lock และ dirty/navigation guards ตลอด multi-step save
- [x] Scalar เก็บ choice ต่อ Field; table เก็บ choice ต่อ attachment column และใช้ร่วมทุกแถว ไม่สร้างตัวเลือกรายแถว
- [x] Template Draft บันทึก config ที่ยังไม่ครบได้โดยไม่ทิ้งงาน แต่ publish แบบใหม่ต้องเลือก current valid mapping ครบทุก attachment Field/column
- [x] New-mode publication ต้องมี exactly one scalar root `docs_number`; ไม่บังคับ `fiscal_year` จาก attachment prerequisite และไม่ต้องมี User-entered values ในต้นแบบ คง Field validation อื่นตามเดิม
- [x] Publish ตรวจ local catalog และ revision อย่าง race-safe ขณะแก้/ลบ mapping; ตรึง storage mode/category ID/template name ไม่ live lookup master มาเปลี่ยน published routing ภายหลัง
- [x] Saved valid mapping publish ได้เมื่อ category provider ล่มโดยไม่บังคับ live recheck; stale local mapping ต้องเลือกใหม่ ไม่ clear Draft หรือ silently follow rename
- [x] Catalog rename/move/delete หลัง publication ไม่แก้ Published Template, Responses, URL/token หรือ files; published attachment settings ไม่แก้ในที่เดิม
- [x] Duplicate ได้ Form และ share link ใหม่ คัดเฉพาะ template/configuration ไม่คัด Responses/answers/files และไม่ redirect/archive/delete ลิงก์ต้นฉบับ
- [x] สำเนาจาก legacy Form ต้อง explicitly เลือก current Storage Template ก่อน new-mode publication ไม่สร้าง mapping จาก category name โดยเดา; valid copied new-mode choice ยังตรวจ current catalog ก่อนเผยแพร่
- [x] Existing HTTP authoring/publication seam พิสูจน์ server validation, snapshot isolation, rename/move/delete races, offline publication, no-year publication และ legacy/duplicate preservation
- [x] Smoke actual ONLYOFFICE popup ทั้ง scalar/table, cancel/confirm, save/reopen/publish และเปิด link ของสำเนาใหม่; ไม่ถือ plugin mock หรือ HTTP status อย่างเดียวเป็น native proof
- [x] อัปเดต affected bridge/API callers, fixtures และ workflow/domain/system-map documentation ใน change เดียวกัน ไม่เริ่ม upload จาก authoring/catalog/publish

## Notes

Storage mode ใหม่มีอยู่ใน published contract หลังตั๋วนี้ ส่วน file persistence path เป็นงาน 03 ห้ามนำ Form ทดสอบใหม่ไปเปิดให้ User ใช้ upload จริงก่อน behavior ของตั๋ว 03 และ acceptance ที่เกี่ยวข้องครบ Existing legacy fill path ต้องยังทำงาน

ข้อ 1–3 ปิดแล้ว ไม่ขอเปลี่ยน storage choice หรือเพิ่ม PM folder-label approval gate

## Comments

### Implementation and acceptance evidence — 2026-11-17

- Base confirmed: branch `feat/storage-templates-02` started exactly at integration `03c49064c5d1327f322bf85dc14880878d8e83b4`.
- Consumer-visible regressions were written first at the agreed HTTP authoring/publication seam. Per execution contract, tests were first executed during final verification, not as a mid-flight red run.
- `apps/server`: `bun test --timeout 120000 test/http/ecm-attachment-authoring.test.ts` — 16 passed. Includes native snapshot races for rename/move/delete between admission and publication commit, offline publication without `fiscal_year`, immutable mapping snapshots, new/legacy duplication, saved legacy URL/token preservation and saved-button proof failures.
- `apps/server`: `bun test test/spreadsheet-unit/shared-fields.test.ts` — 1 passed; `bun run check-types` and `bun run build` passed.
- `apps/onlyoffice-plugin`: `bun test test/spreadsheet-attachment-category.test.js test/spreadsheet-upload-poc-one-click.test.js test/spreadsheet-upload-poc.test.js` — 54 passed. Includes category filtering, incompatible template reset, deletion/reload, cancel/Escape, lock/dirty/binding/proof behavior and message-scope rejection.
- `apps/web`: `bun run test:ui test/ui/attachment-category-popup.test.tsx` — 3 passed; `bun run build` and `bun run check-types` passed. Build retains its existing large-chunk warning. Scoped `ultracite fix` completed without diagnostics.
- Prisma generate and migration deploy succeeded only against the named isolated Storage Templates database; no reset, working database migration or live provider request.
- Actual browser used the real local ONLYOFFICE engine through task-owned gateway `18081`, server `18185`, web `15174` and localhost provider double `18188`. Existing parent/user services were preserved.
- Created Form `d728d6dfc2e745068bd9a6300f6951fe` through the real Admin UI. Added empty root `docs_number`, scalar attachment at `B3`, and table `items` at `D5:E7` with an attachment column shared across its three rows. Actual external popup showed numeric category `201` and template `Native02-1794859104399`; category `202` had no mapping and was absent.
- Scalar Escape and table Cancel left configuration unchanged. Confirm created/saved the scalar and column through their existing native multi-step save/proof path. Reload restored all Fields; actual Publish completed without `fiscal_year` or template answers.
- Actual Duplicate created Form/link `fab6430a551e43c5a36cef3444cd577e`; its native editor retained configuration and published successfully. A User signed in through the normal login page and opened the duplicate link in real ONLYOFFICE; the original link remained published.
- Provider-double counters after this browser scenario: category reads `5`, uploads `0`, deletes `0`, original reads `0`. These are simulated-provider/native-editor results, not live DCM routing or upload-lifecycle acceptance.
- Shared contract for ticket 03: normal Field columns `attachmentStorageMode` (default `legacy`), `attachmentCategoryId`, `attachmentTemplateId`, `attachmentTemplateName`; no catalog foreign key, so published evidence survives catalog deletion. Spreadsheet `attachment` is either `{mode:"legacy",category}` or `{mode:"template",category:null,document_category_id,storage_template_id,template_name}`. New-mode members may be null in Drafts; publication requires a complete current tuple. Legacy duplicates explicitly clear the tuple.
- No upload lifecycle changes, live API calls or generated workflow rebuild. Ticket 03 and integration acceptance remain separate prerequisites for enabling new-mode uploads.

### Final review repairs — 2026-11-17

- Captured both defects before the fix at existing consumer seams: the HTTP two-stale-choice scenario returned `422` on an ordinary Draft edit instead of `200`; plugin recovery kept attachment authoring disabled after verification of a committed write. Initial harness setup failures (unexported test environment and an invalid dropdown attachment fixture) were corrected before these defect observations.
- Draft PATCH now validates only new or semantically changed attachment choices against the locked catalog. Unchanged stale choices remain editable/deletable in an incomplete Draft; individual scalar/column reselection does not require discarding other work. Publication still validates every choice at admission and completion under the existing locks.
- Recovery normalizes the explicit attachment tuple, including legacy defaults, before comparison. Binding IDs, category, storage mode, template identity/name, document revision, settlement and native-state conflict protections remain significant.
- Removed the repeated scalar/column storage mapping with one private local serializer. No new module, dependency, export or public API.
- Scoped checks: six-source lint/format and server `tsc -b` passed; plugin authoring/category/one-click suites `87/87`, shared Field consumer `1/1`, authoring HTTP suites `27/27`. The first final run exposed two response-queue fixture mistakes and a missing delete confirmation in the new tests; corrected fixtures passed without production changes.
- HTTP evidence uses only `folio_storage_templates_review_20261117_c1db2ece`, all 36 migrations, and callback `18883`. No original/user database, live DCM/PDMS request, deployment or ticket disposition change. Integrated native acceptance is recorded separately below after the source-stable merge.

### Integrated native review-fix acceptance — 2026-11-17

- Actual application and plugin imports came from delivery checkout `/tmp/folio-storage-templates-integration`, source `d8162b8c4f4d1c156a693cd61d46d2a184220c29`, after the parent's explicit SOURCE MERGED handshake. The frontend used its own delivery-source shadow/cache. Backend/provider/web/gateway/Chrome ports were `18888/18889/15874/18086/19708`; only the dedicated review database was used.
- Created Form `f36c3c8094bb4ac4864cb0c389dfbfef` through the Admin UI. Real ONLYOFFICE SDK selection and existing external popup created `docs_number`, two scalar attachment buttons at `B3`/`B5`, and ordinary cell `A1 = Review retained ordinary cell`. Both attachment Fields selected the same category `201`/Storage Template.
- Renamed that master through the real catalog endpoint. At revision `4`, actual first-Field chooser reselection and Template Draft save succeeded while the second Field retained its stale name. Actual Publish returned `422` with `แม่แบบจัดเก็บเอกสารเปลี่ยนแล้ว กรุณาเลือกใหม่ ข้อมูลร่างเดิมยังคงอยู่`; the Draft and both bindings remained intact.
- Second-Field chooser reselection committed revision `5`. The private test launcher deliberately discarded exactly one successful PATCH acknowledgement only after real `app.handle` completed, returning `503` instead. The real follow-up GET returned `200`; semantic recovery accepted the committed settings without replaying the PATCH or leaving authoring locked. No production failure hook, fabricated binding-operation payload or SDK/result mock was used.
- Further actual authoring changed that Field's label to `Recovered continued authoring`, committed revision `6`, and saved the Template Draft normally. Real SDK read back the unchanged `A1` sentinel. Actual Publish then completed as version `1`; the published manifest preserved both individually repaired choices and the subsequent label.
- Read the actual persisted published workbook: `14,339` bytes, SHA-256 `20d69acf758922f5cc14251c6b19ee34b6f0d1eb1610af06478aa1bc0ff60f16`; its XML retained the ordinary-cell sentinel. This is local canonical/native proof, not live DCM or deployed behavior.
- Sanitized evidence: `/tmp/folio-storage-templates-runtime/review-fixes/` contains `native-evidence.json`, `transport-evidence.json`, `partial-repair.json`, `recovered-and-saved.json`, `final-published-snapshot.json`, pre-fix evidence and four actual screenshots. Five semantic tuple-conflict regressions remain rejecting category/ID/name/mode changes; legacy and unchanged recovery behavior remain covered by the scoped checks above.
- Local provider counters: category reads `6`, uploads `0`, deletes `0`, original reads `0`. No live DCM/PDMS request or unrelated export replay. Browser-driver waits for absent success text and premature popup readiness were corrected from actual state without replaying successful mutations.
- Stopped only the three owned services and removed only the owned gateway. Removed owned wrappers/scripts/private account file/browser profile/frontend shadow/cache; deleted and confirmed absence of `9` object keys derived only from the dedicated review database. Kept the database, worktree and sanitized evidence for parent cleanup; retained DB fixtures no longer have their cleaned runtime objects. Original checkout, user/parent services/databases, shared bucket and unrelated keys remain untouched. Parent owns global gates, generated workflow and final ticket disposition.
