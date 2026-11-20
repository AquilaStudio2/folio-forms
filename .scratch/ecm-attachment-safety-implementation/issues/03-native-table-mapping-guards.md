# 03: กัน native table edits ที่ทำไฟล์ผิดแถว

**What to build:** User และ Admin ใช้ตารางตาม support matrix ที่อนุมัติแล้วได้ ไฟล์และ pending state ยังคงผูกกับ physical row/published column ที่ถูกต้อง Native action ที่ยืนยัน mapping ไม่ได้ต้องไม่ทำให้บันทึกไฟล์ผิดแถวหรือทิ้ง File ระหว่าง remount

**Blocked by:** 02 — ทุกตาราง XLSX เหลืออย่างน้อยหนึ่งแถวและปุ่มแนบครบ.

**Status:** resolved — scoped native evidence accepted

**Spec coverage:** ECM Attachment Safety implementation spec — US52–63; H08 และ U02

**Execution gate:** ต้องให้ผู้ใช้ตรวจตั๋วและสั่งเริ่ม implementation ก่อนพัฒนา การตรวจ native runtime ใช้ระบบแยก ไม่ authorize real DCM หรือข้อมูลใช้งานจริง

**Human acceptance:** pyw1tt ยืนยันตรวจรับและให้ปิด 03 ตามขอบเขตที่ทดสอบ รวม [Undo/Redo ขณะมีไฟล์รอบันทึก](#native-b12-edit-and-undoredo-with-a-pending-row-0-replacement) โดยไม่รับรองชุด role/contract/gesture ที่ยังไม่ได้ตรวจ.

## Acceptance criteria

- [x] ใช้ minimum-row/column-button/verified-row-transition contract จากตั๋ว 02 รักษา trusted physical positions และ published column binding ไม่เพิ่ม stable row ID/per-row Tag หรือใช้ compact/visible-row index เป็น identity
- [x] Ordinary typing/paste ตาม Field rules และ Undo/Redo ที่ mapping ยังถูกต้องใช้ได้ โดยไม่ถือเป็นการย้ายไฟล์หรือสร้าง receipt Undo ไม่ย้อน pending attachment/committed snapshot/DCM effects และไม่ฟื้น stale receipt
- [x] Folio append/delete-selected ใน User Draft รักษา saved/pending/removal/invalid state ของ survivors ผ่าน verified transitions แถวใหม่ไม่ copy File ไม่เพิ่ม row controls ให้ Correction
- [x] Sort, drag/move, cut-paste ทั้งแถว/คอลัมน์ และ native insert-delete ไม่ถูกยอมรับเป็นวิธีย้ายไฟล์ที่รองรับ ต้องป้องกันคำสั่งหรือหยุด save ที่ mapping ไม่ยืนยันก่อน external writes/canonical commit รวม same-row-count reorder
- [x] Copy/paste URL/drawing/button ไม่สร้างหรือย้าย canonical attachment และไม่ adopt client token/link เป็น ownership evidence
- [ ] Filter/hidden rows/columns ใช้ file actions ได้เฉพาะเมื่อพิสูจน์ physical target จาก trusted document ได้ Hidden/zero-geometry combinations ต้องมี native proof ก่อนรับรอง ไม่เดา target จากแถวที่มองเห็น
- [x] Merge ข้ามแถวหรือย้าย mapped table ข้าม sheet ระหว่างกรอกไม่ผ่าน mapping guard ไม่ใช้ warning อย่างเดียวแทนการป้องกันไฟล์ผิดช่อง
- [x] หยุด command ก่อน scope change/remount เมื่อ intercept ได้ และหยุด unproven save ก่อน write/commit เสมอ คง saved snapshot กับ pending Files/removals/invalid selections ใน scope เดิม ไม่ reload/discard/rebind ไปแถวข้างเคียงเพื่อให้ผ่าน
- [x] การเลื่อนแถวที่รองรับไม่ rename/reupload และ internal row/project/workspace save ไม่ ECM POST/DELETE คง ownership/history/unknown-operation/reference fencing เดิม
- [x] Reconnect/หลายแท็บคง lease/revision/opening/scope guards ไม่ส่งต่อ browser Files ข้ามแท็บ Stale transition ไม่ทิ้ง pending หรือ commit snapshot ผิด
- [x] ใช้ existing HTTP seam ตรวจ A/B rows ที่ข้อมูลและ bytes ต่างกัน หลาย attachment columns, empty gaps, saved/pending replacement/removal/invalid/zero-byte states ตรวจ saved JSON/XLSX/current references และ exact bytes ของ survivors ตาม local mapping plan
- [ ] เปิด actual supported browser/ONLYOFFICE ตรวจ native commands และ combinations ข้างต้น แยก User Draft/Admin Correction และ durable legacy/template โดยบันทึก version/command/before-after workbook/mapping/pending/no-extra-write evidence ไม่ใช้ row-count check, VM, Builder หรือ warning อย่างเดียวประกาศ safely rejected
- [x] หาก boundary ใดป้องกันหรือตรวจไม่ได้ ให้รายงาน exact unverified boundary และ acceptance ที่ยังไม่ผ่าน ไม่ลด matrix เงียบ ๆ หรืออ้างว่าตั๋วสมบูรณ์เพียงเพราะ unsupported label ปรากฏ
- [x] อัปเดต affected consumer tests/fixtures/docs/system map พร้อม changed behavior ไม่ขยายข้อจำกัด fill/Correction ไปห้าม Admin จัด layout ใน Template Draft โดยปริยาย

## Scope boundaries

Blocker 02 จำเป็นเพราะตั๋วนี้ตรวจ native commands ต่อกับ final trusted row/button transition contract ที่ต้องไม่ clear แถวสุดท้าย ไม่พึ่งการเปลี่ยนชื่อไฟล์ในตั๋ว 01 จึงไม่เพิ่ม dependency นั้น

ขอบเขตยังเป็น repeating table เดิมใน editable worksheet เดิม ไม่เพิ่มหลาย repeating tables/หลาย editable worksheets หรือ native gestures นอก approved support matrix ผล local bytes/native proof ไม่ใช่ provider acceptance และไม่เพิ่ม provider type/size byte-comparison workload

## Comments

2026-11-18: ผู้ใช้อนุมัติให้ตั๋วนี้ขึ้นกับ 02 แล้ว เผยแพร่เพื่อให้ตรวจเนื้อหาก่อน implementation ไม่มี native/browser/provider trial ใหม่จากการสร้างตั๋ว

### 2026-11-18 — Ticket 03 source implementation; integration verification pending

- Native input ranges now exclude explicitly configured Attachment Fields/columns. Their cell values and hyperlinks remain canonical projections, not editable input or ownership evidence. Ordinary input ranges remain editable; old Published PoC text/URL fields remain ordinary fields.
- Protected fill workbooks explicitly prohibit native sort and autofilter changes. Locked attachment cells, existing sheet/workbook structure protection, and existing managed-object `noMove`/`noResize` activation locks form the native command barriers. Managed OLE controls remain independently selectable/unlocked; no worksheet unlock or stable row identity was added.
- Before attachment preparation/provider writes, table-attachment saves require the protected native surface, explicit sort/autofilter barriers, locked attachment-cell formats, unchanged binding/merge geometry, and unchanged worksheet sort metadata. This rejects weakened/old native captures rather than inferring identity from unchanged row counts. Canonical attachment writes still clear the attachment cells/hyperlinks before projecting trusted saved data.
- Editable `/onlyoffice/document/:key` delivery reprotects existing Response Drafts and Correction workspaces from their trusted published contract and current physical positions. Response Prefill locks remain effective; Correction retains its existing Prefill policy. Delivery does not write canonical objects, answers, receipts, references, revisions, or Published metadata. Template Draft authoring and read-only/export projection are unchanged.
- The native opening HMAC includes a protection-generation namespace, so a newly opened/refreshed config cannot reuse a pre-guard native cache key. A genuinely new opening fetches the protected projection without requiring a User Save. Already-open pre-change frames do not hot-upgrade; their old unsafe table captures fail before attachment dispatch and retain the current page/pending state. Do not claim safe editing in an old frame or force a reload/discard.
- Tests were written before their corresponding production changes and were not executed in the worker. Added existing HTTP consumer regressions for distinct A/B physical rows, multiple attachment columns and gaps, forged URL/unprotected/unlocked/same-count-sort captures, unchanged saved JSON/XLSX and exact survivor bytes, no provider writes, and successful ordinary edits afterward. Added old-artifact delivery coverage for User Draft/Admin Correction in durable legacy/template modes. Existing removal coverage now checks cleared canonical URL cells/hyperlinks. Existing protection tests cover locked attachment body cells and preserved ordinary input.
- Existing minimum-one-row, verified append/delete, pending transition, reconnect/lease/history and unknown-operation code paths were retained, not replaced. Their integrated regressions still require the parent's checks.

#### Exact documentation deltas for integration owner

1. `CONTEXT.md`, Attachment Field / physical-row paragraphs: add that configured attachment URL cells are protected projections, while managed OLE controls remain usable; native row identity relies on blocked structural gestures plus trusted Folio transitions, never equal row counts.
2. Canonical table/native support docs: record explicit sort/autofilter protection, rejection of weakened/old native table captures before upload, protected editable delivery for old Draft/Correction artifacts, and unchanged ordinary inputs/old Published PoC contracts.
3. System map: show authenticated editable document delivery reprojecting protection without a canonical write, followed by native capture validation before `prepareAttachments`; show opening-generation cache isolation. Keep Template Draft and read-only/export branches separate.
4. Evidence register: source implementation is not native gesture proof. Record integration revision, ONLYOFFICE/browser version, observed outcomes and parent/human review separately. Do not promote historical evidence or a controlled provider result to DCM acceptance.

#### Parent verification and native smoke instructions

- Run existing spreadsheet protection/validation unit suites, HTTP attachment/table/save/reopen/Correction and history suites, existing pending-row/lease/reconnect UI regressions, and existing native upload-control/runtime tests after integration. No worker build/test/lint/format command ran.
- Seed an isolated pre-change initialized Draft and an immutable Submission with unlocked attachment cells and absent sort/autofilter flags. Open User Draft and Admin Correction through their real routes. Verify each delivered workbook has locked attachment cells and explicit structural barriers without changing stored source bytes/answers/receipts/revisions. Repeat with the same opening ID; compare pre-change and new native cache keys. Confirm an already-open old frame is not represented as hot-upgraded.
- For each durable legacy/template contract and both User Draft/Admin Correction, use at least two attachment columns, A at physical row 0, an empty gap, and B at physical row 2. Give A/B distinct synthetic bytes; include a saved zero-byte file. Repeat with pending replacement, pending removal and invalid selected File state. Record physical targets, pending names/states, saved JSON/current references, XLSX values/buttons, selected history and controlled-provider POST/DELETE counts.
- Positive native cases: type and paste ordinary values only into ordinary input cells; Undo/Redo those values; activate every managed body-cell attachment control by pointer and keyboard; confirm/cancel the picker without changing canonical URL cells. On User Draft only, Folio append then delete from two body rows to one, repeat delete and append back. Confirm disabled final delete/reason, survivor state and no internal provider dispatch. Correction must not gain row controls.
- Negative native cases: Data ribbon/context-menu ascending, descending and custom sort on the mapped table, including sort from an ordinary column; drag/drop whole rows/columns; whole-row and whole-column Cut/Paste and Copy/Paste onto mapped rows/columns; native Insert/Delete; cross-row Merge; moving the table to another sheet; paste a URL or copied drawing/button into attachment cells. Test consecutive combinations and Undo/Redo. The editor must refuse the structural command, or save must fail before writes/remount with unchanged canonical state and pending selections. Merely unchanged row count or a warning is not a pass.
- Hidden/filter cases: use preconfigured filtered/hidden rows/columns and zero-height/zero-width attachment geometry. Activate only targets whose native object anchor, binding marker and physical row agree. Verify no visible-index substitution or action on a neighboring file. Record inaccessible/ambiguous targets as blocked or unverified; never infer success from absence of a visible button.
- Keep source artifacts and sanitized observations for every native command. Native gestures, old-session behavior, keyboard/OLE activation over locked cells, hidden/zero-geometry combinations and HTTP regressions remain unverified until the parent runs them. DCM identity/settlement/type-size evidence and release authorization remain separate external prerequisites.

### Integration corrections and evidence — 2026-11-18

- Integrated as `c0387cf9c07e20439084536833f3dfa50142fc42`, followed by integration-owner source/test corrections. Structural and attachment-cell protection checks were separated into two private validators to retain all checks without suppressing the complexity rule. XML fixture removal now handles the actual serialized non-self-closing protection element.
- The old-artifact HTTP regression exposed a real delivery bug: native storage keys created by `objectKey(..., "xlsx")` end in `/xlsx`, not `.xlsx`. Delivery now uses the owning Form's trusted document kind rather than a filename suffix. No artifact rename, canonical/history rewrite or migration was added. Correction fixtures now choose the submitted workspace key without first requiring an absent Draft key.
- Supporting tests now use the real composite reference identity, full authenticated fixture identity, trusted saved receipt locals and a correctly typed byte view without casts or extra byte copies.
- Observed after repairs: six targeted actual-app HTTP cases passed, 348 assertions, covering unsafe captures and old stored User Draft/Admin Correction artifacts in both durable legacy/template modes. Stored canonical bytes/data/keys and provider dispatch counts remained unchanged on protected delivery/rejection. Spreadsheet-unit passed 118 tests, 324 assertions. Root format/lint and typecheck 5/5 passed; server types were fresh, four tasks cached. Plugin build also passed in the preceding check.
- Actual browser pilot on the pre-final source: HeadlessChrome/150.0.0.0 and ONLYOFFICE 9.4.0-129 showed disabled native sort/filter/insert/delete/merge controls. A real protected managed OLE opened through native context menu `Edit object`; a real disk-backed 4-byte File could be selected, canceled, confirmed as pending and observed after reopening. This is not proof of every shortcut or gesture. The attempted newer-candidate sequence did not complete before the isolated auth session expired; no File recovery is claimed.
- Full final-source U02 matrix, keyboard/OLE activation, hidden/zero-geometry, four role/contract combinations and combined loading/continuation behavior remain for integrated acceptance. No real DCM or Production acceptance is claimed.

### Final integration evidence and exact remaining native boundary — 2026-11-19

- Source is integrated and HTTP/native changed paths were exercised; this ticket is not certified complete. [Final native report N17/N18](../acceptance/06-native-final/report.md) owns the bounded support matrix.
- Real protected structural affordances, trusted drags with unchanged anchors, invalid drawing/capture rejection, ordinary external paste, pending retention and verified internal row transitions are observed. Forbidden mutations were not forced through disabled controls.
- Actual hidden row height0 and actual initialized historical C-column width0/drawing extX0 are observed. Visible adjacent D control genuinely confirms rows.other, not rows.proof. Hidden C namebox selection has no distinct pointer hit region/picker; no hidden-target invocation/export rejection is certified. Cold hidden-column initialization separately failed; literal-width0 returned engine(-3)/HTTP500, cause unproved.
- Successful cut/reorder/cross-sheet mutation and every role/contract/queued-removal combination remain unverified, not PASS or an approved scope reduction. Human review of this explicit support boundary is pending. Guards/security were not weakened to manufacture evidence.

### Local continuation from1071d3c — 2026-11-19

- Fixed the cold hidden-column failure in the shared native projection and anchor normalizer, then found and fixed the same root boundary for explicitly hidden zero/positive-height rows. Zero-area previews retain exact physical bindings; default-height rows remain visible. Negative/nonfinite geometry, native protection and saved-button/ownership checks remain enforced.
- Actual User/Admin native evidence now includes both stored hidden column widths0/12 and hidden row heights0/22. Tab can select a collapsed OLE; Shift+F10 / Edit object activates its actual saved binding. Named keyboard-targeted hidden slots and visible neighbors saved distinct bytes at physical rows0/1 without visible-index substitution. No SDK mutation or fabricated bridge supplied the target.
- Template pending removal survived genuine two-to-one Folio transition, retained both column controls and disabled final-row deletion without provider writes; explicit later Save alone applied removal. Eligible native Admin Correction retained its no-row-controls boundary and immutable Submission originals. Actual URL-only Excel export and normal User Submit/default-next clean Exit also passed within their recorded source scopes.
- [Continuation report](../acceptance-report.md#local-continuation-from-1071d3c--2026-11-19) and [typed evidence](../acceptance/06-local-continuation/evidence.json) distinguish width-only journeys from the later final row-geometry source. Runtime/button7 tests/267 assertions, plugin343 and spreadsheet-unit118 passed; malformed hidden widths remain rejected.
- **Status remains needs-info.** The two unchecked criteria are not silently waived: combined/filter geometry, every role/contract/native-gesture permutation and queued confirmed-removal combinations are not certified. Native footer clipping during resize remains a separate observed risk. No original Wayfinder edit or provider/human acceptance.

### Combined native geometry continuation — 2026-11-19

- [Added report](../acceptance-report.md#combined-native-matrix-continuation--2026-11-19) and [typed evidence](../acceptance/06-native-matrix-continuation/evidence.json) now prove seven actual picker targets in each User/Admin × legacy/template scope with hidden C width0, hidden row heights22/0, a preconfigured filter and A/gap/B physical rows0/1/2. No neighbor/compact-index substitution or SDK mutation supplied a target.
- Coupled genuine Saves/Corrections/removals preserve exact originals, paired canonical XLSX/JSON/reference targets and immutable history. Final native reopen maps canonical array index1 to physical row2. Actual missing-scalar-control Cut was rejected before provider writes; Undo restored all seven controls and retained the pending File.
- Settled768/600/520 and cold520 footer samples fit and Cancel works; no source layout patch or all-resize guarantee. This narrows the earlier immediate-clipping risk without erasing its transient observation.
- Both unchecked acceptance criteria remain unchecked: named combined targets are supported, not every gesture/state/old-session/browser combination. Already-queued confirmed-removal proof and human acceptance remain missing. Guards, permissions, original nine tickets and07–10 HOLD are unchanged.

### 2026-11-19 — Capped native guard verification

[Attempt ledger](../acceptance/03-06-capped-continuation/evidence.json) adds actual visible legacy User Draft and Admin Correction drag/Sort/Cut-Paste checks with a confirmed replacement. Observed positions and canonical artifacts/references stayed equal; reopened exact physical picker held the same three-byte File. Sort disabled, no bypass, no successful clipboard payload transfer claimed. The broader native matrix remains `needs-info`.

The [capped template-native continuation](../acceptance-report.md#capped-template-native-continuation) adds real User pending replacement → Exit → Stay and pending removal → reopen on the original row, with no provider POST or canonical change during those transitions. Native B12 edit while a replacement was pending did not reach the expected value in three attempts; Undo/Redo is unverified. Status stays `needs-info`.

### Native B12 edit and Undo/Redo with a pending row-0 replacement

Passed the named User Draft case in private Chromium/ONLYOFFICE with Storage Template bindings. With `replacement.TXT` confirmed pending at physical row 0, native pointer selection of unlocked B12 and keyboard typing changed `B-ORIGINAL` to `edited-03`. The native toolbar Undo restored `B-ORIGINAL`; Redo restored `edited-03`. The native canvas origin was included in pointer coordinates; earlier capped results remain separate.

The same row-0 picker still showed pending `replacement.TXT` and saved `original.TXT`. All four button coordinates and bindings, row A and the blank gap, canonical attachment/link/reference, and provider POST count remained unchanged. pyw1tt accepted and closed the tested scope; the unchecked full role/contract/gesture matrix remains unverified.
