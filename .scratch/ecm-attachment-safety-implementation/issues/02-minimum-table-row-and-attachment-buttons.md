# 02: ทุกตาราง XLSX เหลืออย่างน้อยหนึ่งแถวและปุ่มแนบครบ

**What to build:** User เพิ่มและลบแถวตาม flow เดิมได้ แต่ลบแถวสุดท้ายไม่ได้ ทุก XLSX repeating table ต้องเหลืออย่างน้อยหนึ่ง body row โดยไม่ล้างข้อมูลหรือไฟล์ ปุ่มแนบต้องครบทุก body-row cell ของ configured attachment columns

**Blocked by:** None (can start immediately).

**Status:** in-progress — source/regressions prepared; integration checks and native control evidence pending

**Spec coverage:** ECM Attachment Safety implementation spec — US41–55; H07–H08 และ U01

**Execution gate:** ต้องให้ผู้ใช้ตรวจตั๋วและสั่งเริ่ม implementation ก่อนพัฒนา การเผยแพร่ตั๋วไม่ authorize real DCM, live-data changes, DELETE, push หรือ deploy

## Acceptance criteria

- [ ] Minimum one body row ใช้กับ ordinary XLSX tables, old Published PoC และ durable legacy/template ทั้งมีและไม่มี attachment ไม่รวมหัวตาราง และไม่เพิ่ม row controls ให้ Correction หรือพื้นที่ที่เดิมแก้ไม่ได้
- [ ] เมื่อเหลือหนึ่ง body row คำสั่ง delete-selected ถูก disabled พร้อมเหตุผลที่เข้าใจได้ Server ตรวจ trusted current document/revision ก่อนเริ่ม mutation ไม่พึ่งปุ่ม disabled, active answer count หรือ attachment-only branch
- [ ] Builder และ full-mapping consumers ไม่ clear/delete แถวสุดท้าย Direct/stale/racing requests ถูกปฏิเสธโดยไม่เปลี่ยน canonical revision/workbook ranges/input/formulas/validation/buttons/JSON/references
- [ ] Rejected last-row delete รักษา saved attachment, pending replacement/removal และ invalid-selection state เดิม ไม่มี ECM POST/DELETE และไม่ remount แล้วทำ File หาย
- [ ] ลบจากสองเหลือหนึ่งได้ตามสิทธิ์และ guards เดิม สั่งลบซ้ำไม่ได้ เพิ่มแถวกลับแล้วลบแถวที่อนุญาตต่อได้ Save Draft/Submit/reopen ใช้งานต่อได้โดยไม่สร้าง empty snapshot แทนการลบที่ถูกห้าม
- [ ] ไม่มี clear-last-row action หรือ confirmation ใหม่ ไม่ลบแถวอัตโนมัติเพื่อบังคับจำนวน และไม่กลับไปใช้ clear-one/delete-zero proposal เก่า
- [ ] ทุก configured attachment column มีปุ่มในทุก body-row cell ไม่รวมหัวตาราง แถวใหม่มีปุ่มครบแต่ไม่มีไฟล์/receipt ที่ copy จากแถวต้นแบบ
- [ ] การนำ File ออกจากคำตอบไม่ลบ control/configuration การลบปุ่มรายเซลล์โดยคง column configuration ต้องไม่ผ่าน trusted saved-button validation ไม่เปลี่ยน incomplete Template Draft rules, immutable Published configuration หรือ read-only/export URL projection
- [ ] Supported row transitions รักษา identity และ current physical position ของ survivors ไม่ใช้ compact answer index ไม่ rename/reupload unchanged files และ internal row save ไม่ dispatch ECM POST/DELETE
- [ ] Empty physical row ไม่กลายเป็น active answerเพียงเพราะมีปุ่มแนบ Attachment-only rows รวม zero-byte ยังคง active/requiredness ตาม contract เดิม ไม่มี required-file rule ใหม่จาก minimum-row policy
- [ ] ใช้ existing HTTP seam ตรวจหนึ่ง row ว่าง/ordinary/saved/zero-byte/pending/removal/invalid states, direct/stale/race และ two-to-one/repeated-delete/append cases ทั้งตารางมีและไม่มีปุ่ม ตรวจ rejected snapshots และ no-write/no-loss
- [ ] ใช้ actual browser/ONLYOFFICE ตรวจ delete control, keyboard/repeated action, buttons ทุก configured column และ Save/reopen ของ changed path Builder-only proof ไม่แทน native control evidence
- [ ] ปรับ affected UI/server/builder tests/fixtures/docs และ system map ใน change เดียวกัน คงสิทธิ์เดิมและระบุ source/runtime limits ตามจริง ไม่รัน reproduction เก่าเพื่อยืนยัน user-reported finding ซ้ำ

## Scope boundaries

ตั๋วนี้แก้ minimum-row และ column-button invariant แบบ end-to-end ไม่เพิ่ม stable row ID, per-row Tag, table engine, row commands ใน Correction หรือ native gesture support ใหม่ Full native support/guard matrix อยู่ในตั๋ว 03

ไม่มี dependency ต่อ naming change: minimum-row guard ต้องทำงานได้แม้ไม่มี Attachment Fields เลย

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown และ dependency ที่ไม่มี blocker แล้ว เผยแพร่เพื่อให้ตรวจเนื้อหาก่อน implementation ไม่เปลี่ยนหรือแทน Wayfinder minimum-row decision เดิม และยังไม่มี runtime result ใหม่

### 2026-11-18 — implementation branch `feat/ecm-safety-02`

- **Authorization:** Implemented only isolated source/test changes after the explicit implementation instruction. No real DCM/PDMS calls, live database access, DELETE, push or deployment. Historical F01 is accepted as reported; no reproduction was rerun.
- **Canonical policy:** Read the complete final-row decision, especially [latest Resolution](../../ecm-attachment-safety/issues/05-final-row-mapping.md#resolution--2026-11-18--pyw1tt--ทุกฟอร์ม-excel-ต้องเหลืออย่างน้อยหนึ่ง-row), the implementation ticket/spec, and ADR 0003 for the affected ordinary-table history regression. Minimum is physical body count, not populated answers.
- **Source changes:** `prepareSpreadsheetOperation` rejects sole-row deletion using the trusted saved artifact/contract before edit validation, attachment preparation or builder execution. Error: `spreadsheet_minimum_rows`, message `ต้องมีอย่างน้อย 1 แถว ไม่สามารถลบแถวสุดท้ายได้`. Both this guard and the resulting row-count transition checks cover ordinary/no-attachment tables, not just the attachment branch.
- **Builder defense:** Resolve and check the table body before clearing ranges or writing values; reject last-row deletion instead of clearing its inputs/hyperlinks. Two-to-one deletion and append retain the existing formula/validation/button rebuild path.
- **Plugin controls:** Disable delete-selected until native body size is known, and at one row show the reason through visible text, title and `aria-describedby`. Refresh after actions/content-ready/selection/sheet changes; recheck on delete and direct `runAction` before pending/save barriers. Correction still gets no row controls. No clear-row action, confirmation, stable row IDs, schema or new dependencies.
- **Consumer regressions prepared, not executed:** Ordinary XLSX HTTP journey covers an empty sole row, filled sole row, repeated and racing direct requests, unchanged XLSX/JSON/document key, append/two-to-one transitions and existing stale-history/callback fences. Its former clear-last-row expectation now explicitly appends a blank survivor before deleting the populated row. Native builder regression rejects the forbidden operation even when clear/write inputs were supplied. Native attachment regression covers legacy and template columns together, complete body-button counts, missing-control rejection, survivor values, empty appended slots and repeated two-to-one/append/minimum transitions. Plugin regression covers disabled/reason, no request on click/direct action, and row-count refresh.
- **Cross-owner coverage:** Ticket 01 owns saved/zero-byte attachment HTTP rejection in `ecm-scalar-save-submit.test.ts`; ticket 04 owns pending File/removal/invalid-selection and full-mapping minimum guards. Their changes must be integrated with this branch before asserting end-to-end coverage.
- **Checks deliberately not run in this worker:** No tests, build, typecheck, lint, formatter, behavioral smoke or actual browser/ONLYOFFICE interaction. CodeGraph reported this worktree unindexed, so source was read directly. Branch ancestry check succeeded before edits.

#### Exact checks for the integration owner

Run only against the isolated PostgreSQL/object-store/provider environment already approved for this effort. Do not load real provider credentials or point these commands at live services.

```sh
# From the integration repository root:
bun test apps/onlyoffice-plugin/test/spreadsheet.test.js
bun run --cwd apps/server test:spreadsheet

# Requires the isolated app/database/object-store and existing builder service:
cd apps/server
RUN_PDMS_TABLE_HISTORY_HTTP=1 bun test --timeout 120000 test/http/pdms-project-table-history.test.ts
RUN_SPREADSHEET_RUNTIME=1 bun test --timeout 120000 test/spreadsheet-runtime/builder.test.ts test/spreadsheet-runtime/upload-poc.test.ts
```

Native browser smoke remains pending: on an ordinary table and each editable attachment surface, verify delete disabled/reason at one row, keyboard/repeated action cannot clear it, two-to-one then append works, every configured body attachment cell has its control, saved/pending/removal/invalid state survives rejection without remount/provider writes, and Save Draft/Submit/reopen retain values/buttons. Builder-only results cannot close this evidence.

#### Intended shared-document deltas for the integration owner

- `CONTEXT.md` / table contract: Every XLSX repeating-table row-action surface retains at least one physical body row; rejected deletion leaves values, saved files, pending state, buttons and canonical revision unchanged. Correction permissions remain unchanged.
- `system-map.md` / spreadsheet save path: Trusted saved-body minimum guard precedes attachment preparation and builder mutation; post-builder row-count validation is shared by attachment and ordinary tables.
- System map / plugin controls: Describe disabled delete with its minimum-row reason and native count refresh; distinguish prepared plugin/native regressions from actual browser evidence.
- Acceptance evidence: Keep H07/H08/U01 and this implementation ticket open until integration checks and native controls are exercised. Retain existing saved-button validation and blank-row/requiredness semantics; do not claim Production/provider acceptance.
