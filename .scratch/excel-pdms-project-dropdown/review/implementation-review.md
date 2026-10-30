# Implementation review — PDMS project dropdown

Date: 2026-10-31 (Asia/Bangkok)

Status: resolved. Two fresh independent reviewers examined the integration branch from baseline `ced39002574331a347b59cd868535fc4eb90ef05`. Initial production review HEAD was `aab76251af54dc9fe9ea83314aca9e5d9f8c4ce3`; `649ccbe` added map closure only. One fresh implementer addressed all findings. Final production/test code is `4507cd9d44dd5aca1d2e8a3c59c3c55a0c44e7be`; later closure changes are documentation only. Source paths below refer to the integrated checkout, with line references from the stated review commits.

The reports remain separated by axis. Earlier open findings and pending native gates are retained as review history; the final closures and handoff evidence below supersede their statuses.

## Standards

### Initial report

Standards review of `ced39002574331a347b59cd868535fc4eb90ef05...aab76251af54dc9fe9ea83314aca9e5d9f8c4ce3`.

**Documented-standard violation**

- **[P2] Give popup controls readable foreground/background pairs in the native dark theme.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/onlyoffice-plugin/pdms-project/index.html:54-55` sets `background: white; color: inherit`; the selected state at lines 84-86 changes only background/border. When ONLYOFFICE's SDK applies its dark theme, inherited near-white foreground makes ordinary/selected project names and paging/Cancel controls barely readable. This is visible in the actual 9.4 screenshot `/tmp/folio-pdms-implementation/artifacts/09-correction-two-previews.png`, which I inspected. It violates `/Users/pyw1tt/Desktop/Github/folio-forms/.omp/AGENTS.md:10`: “Preserve … accessible HTML with labelled controls and keyboard access.” Pair explicit foreground/background colors for every control state and verify both actual native themes, including search, selection, paging, Retry, Cancel, and compact reopen.

**Heuristic judgement call**

- **Possible Duplicated Code: remove the retired hidden picker renderer.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/onlyoffice-plugin/src/pdms-project-picker.js:150-187` contains `const matches = names.filter((name) => name.includes(query.value));`, option creation and `aria-activedescendant` management, while `/Users/pyw1tt/Desktop/Github/folio-forms/apps/onlyoffice-plugin/src/pdms-popup.js:133-173` repeats `state.catalog.names.filter((name) => name.includes(query.value))` and the same option/active-descendant logic. Both additionally maintain IME, arrow/Enter navigation and paging handlers. The first renderer's section is permanently hidden at `pdms-project-picker.js:27`; its public API never reveals it. Retain the shared selection/retry/owner controller and remove its unused DOM/search implementation, or share the presentation logic if a real fallback is intended. Otherwise accessibility and query fixes must be maintained in two copies, one invisible in production.

Reviewed the added catalog/capability validation, trusted history/row targeting, save/callback/completion/cleanup, authoring/removal, plugin owner and host relay paths using CodeGraph first and source diff inspection. Repo rules override all twelve Fowler heuristics; tooling-enforced issues are omitted. A separate source-only save-recovery correctness finding is recorded in `final-review-recovery.md`, not counted as a Standards violation.

Counts: **1 documented violation (P2); 1 optional smell judgement call.**

### Follow-up at74254fb

Standards follow-up at pinned `74254fb3642858b56b451f4acd921ce1aa7234cb`, compared with `649ccbeb778b1c56c725458dd6fbad76732404ab`.

**Original findings**

- **Contrast: code addressed; actual native verification pending.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/onlyoffice-plugin/pdms-project/index.html:35-36,57` now pairs white backgrounds with `#172033` foreground on the popup surface and controls. Selected controls keep that foreground. The new computed-style regression exercises light/dark body palettes, selection, focus, disabled controls, Retry, Cancel and reopen. This addresses the cause of the `.omp/AGENTS.md:10` accessibility violation, but this read-only review cannot replace the requested actual ONLYOFFICE screenshot.
- **Possible Duplicated Code: closed.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/onlyoffice-plugin/src/pdms-project-picker.js:4-89` now owns only catalog/choice/retry/controller state. The retired hidden search/list/IME/navigation renderer and unused panel CSS/wrapper are removed; presentation remains in the active popup.

**New actionable finding**

- **[P2] Preserve cleanup ownership before uploading raw captures.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/operations/callback.ts:225-231` uploads the `.native` object before persisting `nativeCaptureObjectKey`. A process crash between those writes leaves an existing raw workbook without a metadata reference. `object-cleanup.ts:15-19,41-42` recognizes only metadata-proven captures, so recovery cleanup skips the object. Response deletion (`responses/deletion.ts:212-215`) and Form deletion (`routes/form-catalog.ts:545-551`) likewise queue only the persisted metadata key; neither enumerates storage. Subsequent deletion can therefore report success while retaining response bytes. This conflicts with `/Users/pyw1tt/Desktop/Github/folio-forms/README.md:341`, which documents durable cleanup ownership before hard deletion makes objects unreachable. Register durable cleanup ownership before upload, or derive the operation-owned `.native` key for deletion independently of the stricter reuse proof. Preserve current recoverable captures and canonical objects. Add crash-window/deletion coverage. Worker and root were notified.

The separate recovery finding is structurally addressed: raw bytes precede overlays; action inputs cannot inject capture metadata; managed-key proof and existing target/document/workspace checks gate reuse; a newer failed unknown capture blocks older raw, and retries inherit proof. Non-PDMS paths retain their prior behavior. Actual native recovery remains pending.

Counts: **1 original smell closed; original contrast code addressed with native evidence pending; 1 new P2 cleanup finding open.** CodeGraph reported this worktree unindexed, so source fallback was used without indexing.

### Final closure at4507cd9

Standards closure at final pinned `4507cd9d44dd5aca1d2e8a3c59c3c55a0c44e7be`, including the final authoritative-Prefill refinement since `0f9351e66cf71a80198998c08d47bf04261884e1`.

**Code findings closed**

- **Raw-capture cleanup P2: closed.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/operations/object-cleanup.ts:11-28` separates the deterministic operation-owned upload location from persisted reuse proof. Cleanup derives the former even if a crash prevented metadata registration (`:50,92-96`); reuse still requires the exact persisted key. Response deletion now queues that owned location at `/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/responses/deletion.ts:216`, as does Form deletion at `/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/routes/form-catalog.ts:550`. The public regression covers terminal polling, Response discard and Form deletion after an uploaded capture lacks proof. This resolves the documented durable-deletion gap identified against `README.md:341`.
- **Retired hidden-renderer duplication: closed.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/onlyoffice-plugin/src/pdms-project-picker.js:4-89` remains a headless controller, with only the active popup owning search/IME/navigation presentation.
- **Contrast P2: closed, including native evidence.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/onlyoffice-plugin/pdms-project/index.html:35-36,57` explicitly pairs foregrounds/backgrounds. I independently inspected the saved actual ONLYOFFICE 9.4 Light/Dark initial/final popup and compact screenshots: ordinary/selected names, search, count, focus, paging, Cancel and reopen are readable. Artifacts: `review-dark-initial.jpg`, `review-dark-popup-final.jpg`, `review-light-popup-initial.jpg`, `review-light-popup-final.jpg`, and both `review-{dark,light}-compact.jpg`, under `/tmp/folio-pdms-implementation/artifacts/`. This closes the `.omp/AGENTS.md:10` accessibility finding.

**Additional safety review**

The known unchanged-storage-read failure phase still preserves preceding proof, while fresh uncertain capture failures fence older raw (`/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/operations/force-save.ts:199-226,253-264`; `object-cleanup.ts:83-96`). Canonical fallback checks current Response/workspace identity and resolves the frozen contract against the saved workbook (`force-save.ts:85-123`). It requires an empty `spreadsheetInputRanges` result using only the authoritative saved Response Prefill entries whose value is exactly `true`; Corrections use an empty lock set (`:124-144`). The shared helper applies these locks to scalars only, so an ordinary table column remains editable and blocks fallback (`documents/spreadsheets/protection.ts:28-53`). Pictures remain excluded. Actual sheet/workbook structural/format/object protection and every cell style's explicit lock remain required (`force-save.ts:48-69`). Row actions keep the existing pipeline. The final public regressions exercise readonly Prefill recovery and reject false locks despite locked styles, preserving saved bytes/data (`apps/server/test/http/pdms-project-outage.test.ts:792-843`). No new documented input-validation, data-loss-prevention, accessibility or scope violation found. Non-PDMS behavior remains outside this branch.

Root's `/tmp/folio-pdms-implementation/notes/final-native-acceptance.md` additionally records required-Submit failure followed by successful picker Draft recovery without an ordinary edit, unchanged public JSON/XLSX/protection, and disabled native structural/style controls. These observations do not claim physical drag/fill gestures.

**Result: 0 open Standards findings, including the native contrast gate.** Review used local images/source only; no UI, services or fixtures were operated.

## Spec

### Initial report

Reviewed `ced39002574331a347b59cd868535fc4eb90ef05...aab76251af54dc9fe9ea83314aca9e5d9f8c4ce3`, the complete commit list, canonical spec and issues01–09. Read-only review; no services, fixtures, app requests or repository edits.

1. **[P1] A failed Submit can permanently prevent the missing project selection.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/operations/force-save.ts:75–95` rejects every subsequent unchanged-native fallback whenever _any_ failed operation shares the document key. A Form containing only a required PDMS Field can therefore become stuck: Submit while blank reaches required validation and fails; selecting a valid project next makes no native cell edit because the picker writes on the server. When ONLYOFFICE returns no changes, the historical failed operation now rejects that selection, Draft save and later Submit. Reopening retains the same Draft document key and failed-operation history, and there is no ordinary editable input to produce the requested fresh capture. Scope the recovery fence so validation failures and a proven fresh opening cannot permanently poison the document while retaining protection against uncertain native captures. Canonical spec `/Users/pyw1tt/Desktop/Github/folio-forms/.scratch/excel-pdms-project-dropdown/spec.md:82`: **“Failure retains current values and recovery state.”** Line50 also promises **“submit after successful loading and valid selection.”** This is implemented recovery behavior that is wrong.

2. **[P2] The adjacent picker is unreadable in the actual dark editor theme.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/onlyoffice-plugin/pdms-project/index.html:54–55` pairs white control backgrounds with inherited text. The independently inspected saved native artifact `/tmp/folio-pdms-implementation/artifacts/09-correction-two-previews.png` shows near-white project names, selected text, paging and Cancel labels. Users cannot reliably identify choices or controls. Explicitly pair readable foreground/background colors for ordinary, selected and action/input states and verify both native themes. Canonical spec `/Users/pyw1tt/Desktop/Github/folio-forms/.scratch/excel-pdms-project-dropdown/spec.md:39`: **“navigate choices with a keyboard and cancel search, so that selection is accessible.”** This is the already recorded partial UI requirement, not an additional discovery.

No separate scope-creep finding. Counts: **2 Spec findings — 1 P1, 1 P2 (known contrast defect)**. Physical IME/fill-handle and representative performance remain documented evidence limits, not asserted behavior failures.

### Follow-up at74254fb

Read-only review of `649ccbeb778b1c56c725458dd6fbad76732404ab...74254fb3642858b56b451f4acd921ce1aa7234cb`. CodeGraph reports this isolated worktree unindexed; used direct source/diff reads. Original report remains frozen. Reported green checks were inspected, not rerun here.

**Closed in code:** The original P1's normal incomplete-Submit and downstream Builder cases now retain raw native XLSX before processing/selection overlays (`/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/operations/callback.ts:221–242`). No-change retries resolve the latest terminal attempt for the same form, target/type and document (`apps/server/src/operations/force-save.ts:76–117`); managed capture keys are bound to their operation's server staging key (`apps/server/src/operations/object-cleanup.ts:11–19`). The added public HTTP regressions cover source-only reopen, mixed newly unsaved ordinary values, Builder failure and newer uncertain captures (`apps/server/test/http/pdms-project-outage.test.ts:409–580`). This addresses spec line82's preservation requirement without reusing processed failed selections as history.

**Open behavioral finding — [P2]: pre-capture failures still permanently poison source-only Forms.** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/operations/force-save.ts:94–105` still rejects a failed predecessor without a retained capture. If the first picker request encounters a temporary ONLYOFFICE command503/timeout, no capture exists; after service recovery, unchanged-native replies keep failing, and these Forms have no ordinary input to edit. A transient read of a retained raw object can likewise fail at line117 before provenance is copied; latest-failure cleanup then discards the earlier trusted raw (`object-cleanup.ts:74–82`). Complement trusted-capture reuse with the proposed server-proven protected-scalar-only safe fallback, while retaining unknown-capture fences for Forms with native editable content. Canonical spec `/Users/pyw1tt/Desktop/Github/folio-forms/.scratch/excel-pdms-project-dropdown/spec.md:82`: **“Failure retains current values and recovery state.”** Sent to root/implementer.

**P2 contrast code corrected, native verification open:** explicit surface/control foreground/background at `apps/onlyoffice-plugin/pdms-project/index.html:35–36,56–57`; light/dark computed-style regression added. Actual pinned-editor dark/light proof remains pending. The retired target/search/results renderer and its CSS/container are removed; the owner retains only catalog/action logic (`apps/onlyoffice-plugin/src/pdms-project-picker.js:5–91`). No public protocol/schema change or separate scope creep found.

Counts: **1 remaining behavioral finding; 1 pending native verification gate.**

### Subsequent recovery checks

Before closure the Spec reviewer also identified protected all-source repeating tables and ordinary scalar Fields locked by authoritative saved Prefill as supported no-native-input cases. Both would remain stuck after a pre-capture failure under the narrower predicate. These were reviewed as additional P2 recovery variants under the same requirement, “Failure retains current values and recovery state.” The final implementation reuses existing input-range rules with authoritative Response locks, preserves Correction policy, and requires actual canonical protection and locked styles. Public positive and negative cases cover both variants; no schema or client protocol was added.

### Final closure at4507cd9

Read-only review through `4507cd9d44dd5aca1d2e8a3c59c3c55a0c44e7be` in `/tmp/folio-pdms-implementation/worktrees/review-fixes`; HEAD matches and checkout is clean. CodeGraph reports the worktree unindexed, so direct source/diff reads were used. Reported green checks were inspected, not rerun here. Original review remains unchanged.

**Closed in code:** the original recovery P1 and its reviewed residual cases: incomplete Submit, downstream Builder failure, mixed newly unsaved inputs, newer uncertain captures, retained-storage-read failure, and pre-capture failure in protected scalar/table Forms. The actual canonical protection/style proof at `/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/operations/force-save.ts:29–68` remains required before fallback; current Response/workspace and frozen contract are resolved at lines85–123. Raw captures precede processing/selection overlays, require their persisted server-owned staging proof, and retain/retire through latest-attempt, polling, completion and deletion boundaries. No unsafe validation-error exemption or stale mixed-input fallback was introduced.

**Readonly Prefill gap closed:** `/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/operations/force-save.ts:125–142` reads only authoritative saved Response scalar locks and reuses existing `spreadsheetInputRanges`. Corrections explicitly receive an empty lock set. The shared helper at `/Users/pyw1tt/Desktop/Github/folio-forms/apps/server/src/documents/spreadsheets/protection.ts:28–53` applies scalar locks only to scalar Fields; an ordinary table column with the same key remains an editable range and prevents fallback. Picture exclusion and all-native-styles-locked gates remain. Public HTTP regressions cover saved locked Prefill values through retry/Submit and false authoritative locks with unchanged artifact/data (`apps/server/test/http/pdms-project-outage.test.ts:792–845`). This preserves the canonical spec's existing Prefill policy.

The original contrast P2 is corrected in code with explicit readable surface/control colors; meaningful light/dark style checks cover control states. The retired side-panel target/search/results renderer is removed, leaving the adjacent-popup owner/catalog/action path. No additional missing requirement, scope creep, public protocol/schema change or code-level correctness finding remains in the reviewed changes.

**Native gates closed after local evidence review:** inspected `/tmp/folio-pdms-implementation/notes/final-native-acceptance.md`, eight saved native screenshots and both `review-native-dark/light-comparison.json` artifacts. Dark/light names, search, count, paging, Cancel and compact reopen are readable. Root's actual failed required Submit→picker0050 Draft save required no unrelated edit; true light reopening preserved0050, cancellation preserved it, and replacement0002 saved. Both public comparisons establish exact JSON/XLSX agreement, unchanged anchors/body/global protection and no save-time provider refresh. Existing09 native row/sheet/style menus visibly disable the relevant global operations despite an unlocked ordinary column; separate executed HTTP proves all-source-table fallback and unsafe-protection rejection. Admin screenshot confirms one creator and retained common metadata/source/adjacent preview.

**Open Spec findings:0; reviewed native gates closed.** Physical row drag/move, fill-handle dragging and keyboard-layout IME are not claimed. No deployment or production enablement is implied. The final Admin read-only export audit remains the implementer's separate handoff check.

## Final handoff evidence

Root executed the actual ONLYOFFICE 9.4.0.1 checks, with one temporary Brave task tab. Workers did not operate browsers. Actual dark and scoped light editor themes showed readable ordinary/selected names, query, count, focus, paging, Cancel and same-cell reopen. Required-field Submit failure was followed by a successful project selection and Draft save without an unrelated native edit; true reopening retained the answer and permitted a replacement. Provider counts7 and8 remained fixed during their respective saves.

The existing native table's source A/B cells were locked while ordinary C stayed editable. Native insert/delete controls and relevant row/style/sheet operations were observed disabled; no structural/style command was applied. Separate HTTP evidence establishes the all-source-table safety predicate and rejection of weakened protection/unlocked styles. Physical row drag/move, fill-handle dragging and hardware keyboard-layout IME composition were not exercised. Deterministic composition tests and native Thai search/blocked valid-name paste are separately documented; no broader hardware claim is made.

The final Admin one-button check selected full merge A1:B1 and clicked the single creator again. Template save succeeded with the same Title `ช่อง $A$1:$B$1`, Tag `field_1`, source and adjacent preview. Normal metadata editing remained and the retired project panel region was absent. Independent public export corroboration subsequently PASS: exactly one scalar anchor, every anchor/body/column tracker unchanged, and the exact existing D1 note retained. This completes the separate handoff check mentioned in the Spec closure.

Evidence is saved outside the repository as required by the implementation workflow:

- [Root native execution and evidence boundaries](/tmp/folio-pdms-implementation/notes/final-native-acceptance.md)
- [Dark JSON/XLSX, anchors and protection comparison](/tmp/folio-pdms-implementation/artifacts/review-native-dark-comparison.json)
- [Light JSON/XLSX, anchors and protection comparison](/tmp/folio-pdms-implementation/artifacts/review-native-light-comparison.json)
- [Admin repeated-creation anchor comparison](/tmp/folio-pdms-implementation/artifacts/review-admin-template-comparison.json)
- [Final Admin one-button screenshot](/tmp/folio-pdms-implementation/artifacts/review-admin-one-button-expanded.jpg)

Executed checks are recorded per run rather than summing overlapping suites or variable polling assertions: final recovery/outage HTTP15 tests/577 assertions; other real HTTP groups6/305 (Correction),4/176 (removal),3/60 (popup), and the earlier common48/721 group. New cleanup cases remain in the registered outage file. Plugin268/1263, spreadsheet94/276, web174 plus12 lifecycle, build, root format/lint and workspace types passed; final guard changes received the final15-case run and format/types rechecks. The merger records its integration checks separately. No skipped native/runtime suite is presented as execution evidence.

Root logged out, closed only the verified task tab, verified it was gone, and reset CUA. Owned API58219/Vite51209 were stopped; shared Office/Postgres/storage and user tabs were preserved. No push, deployment or production flag enablement was performed.

Standards: 3 reported items (2 documented P2 findings and 1 heuristic), all closed; worst reported severity P2. Spec: 2 initial findings plus 3 reported recovery variants, all closed; worst reported severity P1. Both axes have 0 open findings, including native gates.
