# Excel PDMS project dropdown — design interview

Date: 2026-10-30 (Asia/Bangkok) Final acceptance: 2026-10-31

This document records discovery and the agreed product decisions. The user has answered Q1–Q12 and added the Title/Tag requirement. Prototype 01 and functional slices 02–09 are resolved and integrated. The accepted final interaction is a searchable dropdown beside the selected cell, with one Admin create-dropdown button and normal Title/Tag metadata. The final two-axis review findings are fixed and independently closed, including actual dark/light popup verification, safe save recovery and the final Admin one-button check. Production exposure stays disabled. The prototype also fixes an existing merged-cell save bug.

## Requested behavior

- Fetch project names from PDMS `getAllProjectNamesAndDocumentNumbersRoute` every time Excel opens.
- Let an Admin configure which spreadsheet Fields use these projects as dropdown choices.
- Provide search within the project selection experience because the list can be large.

## Verified current behavior

### PDMS source

- `GET /api/pages/projects/names-and-doc-numbers`; no query/body, search, pagination, or incremental-fetch contract.
- Requires the `ongoing-secret-token` header verified against a server-side secret. Folio must keep this credential on its backend and authorize its own callers.
- Returns a bare array of `{ confirmation_document_number: string, name?: string | null }`. There is no database project ID in the response.
- Selects projects with non-null document numbers, then excludes blank document numbers. Null/blank project names can remain. No owner, year, or project-status filtering is implemented here.
- Document numbers are unique in the database, but immutability has not been established. Names are nullable and not unique.
- Sorts all eligible rows in memory by document number, descending, with Thai numeric-aware comparison. Actual production count, payload size and latency have not been measured.

Sources in `/Users/pyw1tt/Desktop/Github/pdms-ongoing-backend`:

- `src/features/projects/project.route.ts:325` — route and auth.
- `src/features/projects/project.schema.ts:618` — response schema.
- `src/features/projects/project.service.ts:210` — inclusion, selection and ordering.
- `prisma/schema.prisma:577` — document-number uniqueness.
- `src/index.ts:64` and `:455` — route mounting.

### Folio spreadsheet behavior

- Current dropdowns contain static string options and use native list validation. There is no project data source or custom searchable picker established in the inspected code.
- Server extraction validates cell text against `field.options` and returns that text. A UI-only change would not establish correct persistence or server validation for dynamic choices.
- The existing spreadsheet plugin has a custom HTML panel and document-ready initialization. A custom searchable picker can build on this integration; changing the native dropdown's own UI has not been demonstrated.
- Response initialization is guarded by `spreadsheetInitialized`, so it cannot alone satisfy refresh on every open.
- Published Templates have immutable field contracts. A fixed source definition and a changing runtime list must be considered separately; this is a design constraint, not yet an accepted storage design.

Sources in this repository:

- `apps/onlyoffice-plugin/src/spreadsheet.js:80` and `:1508` — manual option editing and dropdown settings.
- `apps/onlyoffice-plugin/src/spreadsheet-commands.js:98` and `:164` — native list validation and in-cell dropdown.
- `apps/server/src/forms/spreadsheet-fields.ts:144` and `:210` — option persistence and reconstruction.
- `apps/server/src/documents/spreadsheets/workbook.ts:488` — static membership validation and extracted string value.
- `apps/server/src/responses/spreadsheet-document.ts:54` — one-time response initialization guard.
- `apps/server/src/routes/form-authoring.ts:111` — Admin editor configuration.
- `apps/server/src/responses/editor.ts:297` — User editor configuration.
- `apps/server/src/responses/editor.ts:52` — Correction editor configuration.
- `apps/onlyoffice-plugin/src/spreadsheet.js:383` and `:393` — document-ready lifecycle and custom panel.
- `apps/onlyoffice-plugin/src/api.js:41` — capability-scoped plugin requests through Folio.
- Root `CONTEXT.md` — Field, Spreadsheet Contract, Published Template, Draft, Submission and Correction definitions.

ONLYOFFICE official references:

- [Data validation](https://helpcenter.onlyoffice.com/docs/userguides/spreadsheet_editor/DataValidation.aspx): native list validation.
- [Windows and panels](https://api.onlyoffice.com/docs/plugins/customization/windows-and-panels): plugin HTML windows and panels.
- [Autocomplete sample](https://api.onlyoffice.com/docs/plugins/samples/autocomplete): input-helper suggestions support spreadsheets. This supports investigating a custom searchable selection experience, not a claim that the native validation dropdown can be replaced directly.

### Native-search feasibility follow-up

- Repo `onlyoffice/Dockerfile:1` pins `onlyoffice/documentserver:9.4.0.1`; `compose.yaml:63` builds the corresponding local image. A running local test container uses that image and reports package `onlyoffice-documentserver 9.4.0-129`. Production deployment was not inspected.
- Read-only inspection of vendor files inside that container found the native validation popup constructed from plain menu items: `/var/www/onlyoffice/documentserver/web-apps/apps/spreadsheeteditor/main/app/controller/DocumentHolderExt.js:2867`, anchored at the active cell at `:2908`. The menu is constructed in `.../view/DocumentHolderExt.js:1949` with no search input.
- The generic menu's optional key search (`web-apps/apps/common/main/lib/component/Menu.js:480`) focuses ASCII prefix matches and does not supply a visible input or Thai substring filtering.
- No supported plugin hook for adding a search input to that native renderer was established. Modifying these vendor files is possible but entails maintaining a Document Server UI change. Do not describe native customization as impossible.
- Use the already authorized custom-picker fallback as the current design direction. Prefer convenient invocation from the mapped cell and investigate input-helper/cell-adjacent presentation through supported APIs; use a plugin window/panel if required. Exact placement remains a prototype result, not an accepted promise. A native solution may replace this direction if a supported hook is demonstrated. Do not modify vendor UI during this design interview.

## Round 1 — accepted decisions

1. **Admin configuration:** Admin chooses a PDMS project-name source for a cell or repeating-table column. All eligible names returned by the API become available automatically; there is no Admin-maintained subset.
2. **Cell contents:** Display only the project name in the cell. Round 2 further settled name-string answer semantics and duplicate-name collapsing; no hidden project ID is needed for this feature.
3. **Search interaction:** Prefer search inside the cell dropdown. If infeasible or disproportionately troublesome, the user authorizes a custom searchable picker as the fallback, without requiring another fallback-approval round. Native feasibility remains a prototype question; no promise has been made that the native dropdown can be modified through a supported API.
4. **Opening scope:** Applicable XLSX Forms opened in Folio's web editor by Admins editing or Users filling/resuming refresh the source for each open. Downloaded desktop Excel auto-refresh is outside this accepted scope. Round 2 adds editable Corrections and excludes read-only previews.

The source is named **PDMS Project Name Source** in root `CONTEXT.md`. This is a domain definition for the proposed feature, not a claim that the feature is implemented.

## Round 2 — accepted decisions

5. **Names versus project references:** Store only the selected name string, collapse identical names to one choice, and do not retain a hidden PDMS project identity. This is a name-list feature, not a relationship to individually identifiable projects.
6. **Previously saved selections:** Retain saved names when renamed or absent from a refreshed list; an unchanged previously saved value remains valid for submission. Replacements must come from current choices. Never automatically clear or rename answers. Saved Submissions remain immutable. Historical-value trust must be based on saved server state, not client claims.
7. **API failure:** The workbook remains open and Draft saving remains available. The picker reports failure and offers Retry. Submission requires a successful catalog load for the current editor session. Preserve all current answers and do not silently substitute stale cached choices.
8. **Selection only (user correction):** User rejected manual entry: “ห้ามพิมเอง”. The project cell must accept choices only through the picker, including blocking direct typing, paste, autofill and formula-bar edits. The picker's search input remains typeable; entering a query does not change the cell. Merely rejecting names outside the list does not meet this requirement, because typing a valid name is also forbidden. Technical enforcement requires a protection/controlled-write prototype.
9. **Additional editor modes:** Editable Corrections refresh the source. Read-only result previews display the saved document without fetching the catalog or rewriting the workbook.

## Round 3 — accepted decisions

10. **No Clear action:** The user rejected an explicit Clear action: “ไม่ต้อง เอาแค่ลบตัวdropdownนี้ได้”. Do not add a Clear button. Q12 confirmed this means existing Admin Field removal from Template Draft, with visible cell text and formatting preserved.
11. **Session freshness:** Accepted: load a fresh list per applicable editor opening and hold it fixed for that session, with Retry after loading failure and no automatic background refresh. Multiple configured fields share the session load; new tabs/reopenings fetch again. Reconnecting the same active editor keeps its list; a replacement session after expiry reloads.

## Additional requirement — title and tag

The user requires the project dropdown to create `title` and `tag` the same way as other mapped datasets/Fields. Reuse the existing shared Field metadata and authoring workflow rather than creating an unlabelled dropdown whose value is absent from extracted data. The answer is extracted under that Field's tag/key, with only the selected project-name string as the value. Refreshing choices or changing the selected project never regenerates the Field's title/tag.

Verified existing behavior:

- `apps/onlyoffice-plugin/src/spreadsheet.js:1393` / `:1394`: exact UI labels are `Title · ชื่อช่อง` and `Tag · รหัสช่อง`.
- `:1480` / `:1540`: root Tag default is the first unused `field_N`; scalar Title defaults to a cell-based label. Admin may edit both through the normal controls.
- `:1779`: save uses common `{id, key, label, type, required, ...}` metadata with stable binding identity.
- `:1851`: table columns start with `column_N` and a header-derived/default Title, editable through the same controls. Answer data uses nested arrays; manifest column tags are table-key/column-key qualified under existing conventions.
- `:1952` / `:2054`: Admin's `ลบช่องนี้` removes a Field/column mapping, then saves Template Draft. Failed saving retains the recovery barrier.
- `apps/onlyoffice-plugin/src/spreadsheet-field-state.js:252`: mapping removal deletes native validation and managed anchors, preserving cell contents, physical rows/columns and formatting apart from a plugin-managed date mask.
- `apps/server/src/forms/field-rules.ts:158` and `apps/server/src/routes/spreadsheet-authoring.ts:270`: Admin authoring capability/lease is required; structural changes are blocked for published Forms and require duplication.

## Round 4 — accepted clarification

12. **Meaning of deleting the dropdown:** User confirmed “q12 ตามแนะนำครับ”: reuse Admin's existing `ลบช่องนี้` action on the Template Draft. Remove Field mapping (including Title/Tag and extraction), source, picker management and native dropdown/validation; preserve visible cell text and formatting. Do not convert it into a still-mapped plain-text Field. No User Clear-answer action is added. Published Forms retain their existing duplication requirement.

## Current frontier and completion

No product questions remain open: Q1–Q12 were individually answered, including the concrete Title/Tag and removal clarification. The product-design interview is complete and consolidated in `spec.md`. The user subsequently authorized implementation; current outcomes and remaining technical work are tracked under Implementation started below.

## Selection-only enforcement findings

- `apps/server/src/documents/spreadsheets/protection.ts:28` currently treats normal dropdown scalar Fields and table columns as editable. `validateSpreadsheetEdits` at `:62` rejects formulas in editable inputs, not all direct value entry.
- `apps/server/src/documents/spreadsheets/workbook.ts:488` checks option membership, with no record of a picker operation. A typed valid option therefore passes today.
- `apps/server/src/operations/spreadsheet-document.ts:212` reads workbook values and at `:250` reconstructs them on the trusted base. A selection-only feature must change which project values this process trusts.
- Existing server-private reconstruction can unprotect a copy, apply values and protect it again. The live plugin's ability to write into protected, locked cells without exposing a user-editable interval has not been proven on 9.4. This is an implementation gate, not permission to weaken the requirement or distribute a protection credential to the browser.
- Proposed picker operations identify a chosen **name** in the session catalog, together with the source, Field/row target and revision. They do not add a hidden PDMS project ID. Server state supplies authoritative selection provenance; checking only that cell text belongs to the catalog is insufficient.
- Native row operations currently use row indices; stable row identity or transactional remapping with revision checks is required before treating historical values or picker selections as valid after row changes.
- If no supported direct locked-cell write is available, a server operation followed by preserving/reloading the workbook is a possible fallback. Its UX and preservation of unsaved work must be evaluated before finalizing implementation; do not silently introduce reloads after each selection.

## Original technical design and verification checklist

These discovery questions led to the implementation slices below. Their executed evidence and remaining limits are recorded per ticket; this list is not the current execution frontier.

- Implement the accepted session snapshot and reconnect semantics; deduplicate within one open session without skipping the required fresh request for a later opening.
- Failed loading and an actual empty list must be distinct states. Empty optional fields and unchanged historical values follow existing Field rules after a successful empty load; required empty fields remain incomplete.
- Prototype preventing all direct cell edits while allowing controlled picker writes, row operations and other fields. Do not downgrade the user's selection-only constraint to plain list membership validation.
- Validate picker selections and historical baselines using authoritative server-side state, scoped to the document/editor session, stable Field and current target. Table-row movement and duplication need correct value association.
- Preserve the existing endpoint's inclusion policy: all usable names it returns, no additional year/status/owner filtering. Exclude null or blank names, deduplicate identical strings, and preserve deterministic API order. Search only names; document numbers are not answer identities.
- Row insertion and correct target validation when selection changes during asynchronous search/write; both mapped single cells and repeating-table columns are included by the accepted Admin configuration.
- Performance measurements, local filtering and rendered result limits; revisit server search only if measured scale warrants it.
- Published source-definition immutability versus live catalog freshness; compatibility for existing published Forms.
- Feasibility prototype on the deployed ONLYOFFICE version, including keyboard use, merged cells, scrolling and safe writes.

## Documentation policy

Use existing domain terms in root `CONTEXT.md`; do not create a competing glossary. The accepted name-string and historical-value trade-off is recorded in `docs/adr/0003-pdms-project-name-choices.md`. Agreed product behavior and proposed technical implementation are assembled in `spec.md`, with their statuses distinguished. Completion of this design interview does not itself implement the feature.

### Resumed execution

The user resumed implementation after changing model. Ticket01 is integrated at51d9f18 with a demonstrated protected server-save/reload path and merged-cell resave fix. Ticket02 is resolved on codex/pdms-project-02 through0444b21 with the production scalar operation/UI roundtrip; its completion unblocked03/04/05, which are now resolved. Shared UI control is exclusive to root. Root completed the combined03/04 and05 proofs, closed the sole temporary proof tab and reset CUA; workers must not open UI. User's provider config was corrected and independently returned200 with3606 rows and2696 exact unique names; no private names/credentials are stored in the repo.

## to-spec / to-tickets publication review

The user subsequently requested the to-spec and to-tickets workflows. A [review package](review/README.md) contains the skill-template spec and eight separate ticket drafts, including acceptance criteria and blocking edges. At that documentation stage, review of testing boundaries and ticket granularity/dependencies was pending and the drafts were ready-for-human. The later implement-spec invocation accepted that graph and published the canonical spec/tickets below; the review package remains historical context.

## Implementation started

The user invoked implement-spec and explicitly instructed implementation. This accepts the previously proposed test boundaries and ticket graph. The canonical spec and initial eight tickets were published as ready-for-agent; ticket09 records the subsequently accepted adjacent-dropdown interaction. Integration branch: codex/excel-pdms-project-dropdown; baseline commit: ced39002574331a347b59cd868535fc4eb90ef05.

Execution frontier: all tickets 01–09 and final Standards/Spec findings are resolved. One fresh implementer fixed all final review findings through `4507cd9`, and root completed actual pinned-editor dark/light, failed-Submit recovery, protection-menu and Admin one-button acceptance on that frozen code. Both independent reviewers closed their code and native gates with zero open findings. Each implementation ticket used its own branch/worktree and fresh TDD implementer; merger agents integrated completed work. Completion uses the local wayfinding convention: Type prototype/task, Status claimed while active and resolved with acceptance evidence in Comments. The ready-for-agent value records initial triage. No deployment is planned.

Latest UI decision: the user reviewed the working background-plugin popup beside the selected cell and explicitly accepted “ใช้ dropdown ชิดเซลล์จากต้นแบบ (แนะนำ)”. Clicking the cell opens its searchable project list there; the original native arrow is not required. Ticket09 integrates this presentation with the existing backend/session/table provenance and protected save protocol. The side panel alone does not complete the accepted UX; prototype-only placement is not production save acceptance.

### Resolved functional slices

Ticket [01](issues/01-prove-protected-project-picker.md) is resolved as a prototype, integrated from `codex/pdms-project-01` through `96a0559`. The pinned real editor demonstrated a supported custom picker and protected server-save/reload path, consecutive merged/table selections, unsaved ordinary-input preservation and representative row insertion. Direct protected live writes failed and were not adopted. Native protection checks plus exported lock styles support the managed-cell policy; physical IME composition and fill-handle dragging were not performed and remain explicit verification limits.

Ticket [02](issues/02-scalar-project-field-roundtrip.md) is resolved and integrated from `codex/pdms-project-02` through `0444b21`. The scalar slice persists common source metadata, loads a durable catalog per logical opening, and applies server-authorized selections through the real protected save/callback boundary with atomic artifact/data/session advancement. Root demonstrated actual merged/scalar selection, preservation of unsaved ordinary inputs, consecutive selection, submit and matching immutable JSON/XLSX results. Deterministic HTTP/plugin/web/runtime checks are recorded in the ticket; no fixture postprocessing adapter became production state.

Ticket [04](issues/04-saved-name-history.md) is resolved and integrated from `codex/pdms-project-04` through `bf95b38`, including ticket 03's signed per-opening catalog scope at `5281f4b`. Its public native-engine history workflows PASS 3 tests / 279 assertions without introducing a second history model. Root's actual editor proof retained the exact saved name through upstream failure, ordinary outage Draft Save, successful Retry with 2500 names excluding that name, and Submit; public immutable JSON and downloaded XLSX independently match the exact historical name and latest ordinary answers. The subsequent native next-entry transition opened a ready catalog and a blank source cell, completing ticket 02's deferred native check. Acceptance details and artifact pointers are in ticket 04.

Ticket [03](issues/03-session-refresh-and-outage-recovery.md) is resolved and integrated from `codex/pdms-project-03` through `f793a94`, including signed catalog-session scope, scoped Retry, replacement-catalog delivery without native reload, and the failed-capture/no-change fallback guard. Root's actual normal-outage proof preserved the historical answer and unsaved ordinary notes through Retry and Submit. The initial callback-origin failure and subsequent note loss remain recorded failure evidence. The fallback guard and replacement propagation passed automated regressions after that native proof; they were not separately rerun in the actual editor.

Ticket [05](issues/05-repeating-project-column-roundtrip.md) is resolved and integrated from `codex/pdms-project-05` through `d4027b2`. Root demonstrated actual scalar/two-column selections, blocked valid-name paste, append/new-row selection, first-row deletion with correct remapping, Submit and the blank new-entry transition. Public immutable Submission JSON and downloaded XLSX independently match the final scalar and three nested records. Historical removed-name row behavior remains06's acceptance rather than being inferred from this current-catalog proof.

Ticket [06](issues/06-table-history-and-row-changes.md) is resolved and integrated from `codex/pdms-project-06` through `864b234`. Its actual native-engine HTTP workflows passed3tests/485assertions, establishing exact physical-row history across empty gaps, canonical row changes, rejected copies/native changes, delayed operations and immutable Submissions. The existing saved-workbook/revision mechanism needed no production change or persistent row model. Root's actual editor proof reopened a ready2500-name catalog excluding both old names, retained them with ordinary edits, appended a blank row, deleted the initial empty row, and submitted successfully into a new blank entry. Independent immutable JSON/XLSX exports match two historical records and their empty gaps. The first Append failed from a private fixture callback-origin override; the API-only repair, unchanged saved-state fingerprint and genuinely fresh ordinary edit before the successful capture are recorded separately from acceptance in ticket06.

Ticket [08](issues/08-remove-field-and-preserve-forms.md) is resolved and integrated from `codex/pdms-project-08` through `e128c24`. Root's actual Admin workflow removed and saved the merged scalar, one project-column mapping, then the remaining table mapping. Independent public XLSX/JSON exports and audit events at every stage confirm source/Title/Tag anchors disappear while visible text, merge, styling, physical rows/columns, unrelated custom names/validation and ordinary static choices remain. A fresh author-page reload retained the source-free state and F1's original ordinary dropdown Title/Tag/options. Artifacts include `08-removal-reopened.png` and the three `08-admin-*-confirmed` XLSX/JSON stages under the external implementation directory. Native provider counts were not instrumented; deterministic HTTP proves source-free no-fetch behavior. The owned 08 API/web listeners are stopped.

Ticket [07](issues/07-correction-and-readonly-results.md) is resolved and integrated from `codex/pdms-project-07` through `da8bc07`, merged normally as `098bdcd`. Its first actual preview failed at the parent upload-POC action guard; fix `1115105` and that failed attempt remain explicit evidence. Root's combined07/09 proof subsequently completed two scalar/table workspace previews while retaining the typed reason, ordinary unsaved cells and historical names. Public immutable JSON/XLSX audits established revision0 only and zero Corrections before the explicit final Save, then exactly one reasoned Correction with the original artifact/data unchanged. Actual Viewer UI and saved exports remained read-only without a catalog refresh. The registered real-engine Correction HTTP suite and deterministic plugin/route tests complement that native proof.

Ticket [09](issues/09-cell-adjacent-project-dropdown.md) is functionally resolved and integrated from `codex/pdms-project-09` through `7f7b368`, merged normally as `aab7625`. Root demonstrated the accepted adjacent dropdown and immediate same-cell reopen, one Admin creation button with generated/preserved Title/Tag, source-first activation with unsaved Template content, outage Draft Save/Retry, scalar and physical table/new-row choices, protected valid-name paste rejection, successful Submit/new entry, Correction previews/final Save and Viewer mode. The first legacy-table popup failure was reproduced and fixed at `bdc248f` using the existing canonical column resolver with current-document fences; partial/conflicting tracking and legacy body drift stay closed. Public immutable JSON/XLSX and provider-count audits corroborate the final native state. Ticket09 records the precise executed HTTP/plugin/web evidence and external artifact pointers.

### Final review closure — 2026-10-31

The original Standards/Spec reports and final closure are consolidated in the [implementation review](review/implementation-review.md). Final code `4507cd9` pairs popup/control colors explicitly, removes the retired hidden search renderer, and retains trusted raw native captures before picker overlays and processing. Later unknown captures still fence older data. A canonical no-change fallback requires the current target/revision, frozen scalar/table contract, complete native protection/style proof and no editable inputs; only authoritative Response scalar Prefill locks apply, while Corrections keep their existing editability.

The public outage workflow passed15tests/577assertions, including incomplete Submit, unsaved ordinary inputs, Builder/command/storage failures, newer unknown captures, source-only scalar/table recovery, protection negatives, Prefill and unregistered raw-upload cleanup. Full plugin268tests, spreadsheet94, web UI174 plus12 lifecycle tests, build, workspace types and root formatting/lint passed. Focused session/callback/authoring/column/initialization, Correction, removal and popup HTTP checks also passed with required native opt-ins. Runs overlap and are not summed into a misleading assertion total.

Root's actual dark opening failed Submit for required D1, then chose0050 and saved a Draft without editing an ordinary cell. Light reopening retained0050; Cancel preserved it, same-cell reopen allowed replacement0002, and both saved JSON/XLSX comparisons matched exactly with unchanged body A4:C7, anchors and global protection. The new light opening fetched once (count7→8); selections/audits did not refresh it. Native row/sheet/style menus visibly disabled relevant commands; no physical drag/move command was performed. Final Admin selection of the existing merged mapping still exposed one creator, retained common Title/Tag/source, saved successfully and showed the adjacent preview. Its export retained one scalar anchor, the same body/three column anchors and the exact unsaved authoring note; count9→9 during audit.

Root closed only the owned proof tab and reset CUA. The implementer performed no browser/CUA actions and stopped only its API58219/Vite51209; shared services stayed untouched. External evidence is under `/tmp/folio-pdms-implementation/notes/final-native-acceptance.md` and `artifacts/review-*`. Physical keyboard-layout IME composition, fill-handle/row dragging and representative performance remain explicit limits. `PDMS_PROJECT_NAME_SOURCE_ENABLED` remains false; no push, deployment or PR occurred.

Integration revalidation after the normal03/05 merges: full root `bun run fix` / `bun run check`, main-checkout Prisma generation and workspace types passed. Production plugin248 tests /1201 assertions, spreadsheet units94 /276, focused web reconnect18, catalog session HTTP10 /71 and legacy force-save recovery1 /2 passed. HTTP checks used the private isolated integration resources sequentially. The merger did not rerun the already accepted native HTTP suites or operate a browser. Ticket04's exact historical-name documentation now uses quotes inside code spans so formatting cannot remove its significant leading/trailing spaces; runtime/test literals are unchanged.

Ticket06 merger revalidation: root `bun run fix` / `bun run check` and workspace `bun run check-types` passed; all four type tasks used matching Turbo cache entries. The branch changes tests/HTTP registration and acceptance documentation only. The already executed3-test/485-assertion native-engine HTTP proof and root's actual editor acceptance were retained without broad reruns. No merger browser activity, push, deployment or PR occurred.

Ticket 08 merger revalidation: the normal merge from `e128c24` was conflict-free and retained both table-history and removal suites in the explicit HTTP command. Full root `bun run fix` / `bun run check`, main-checkout Prisma generation and workspace `bun run check-types` passed; all four type tasks used matching Turbo cache entries. Focused authoring/picker plugin tests passed 44 tests / 276 assertions; validation/helper unit tests passed 20 / 56; explicitly enabled pinned 9.4 validation/helper/plugin runtime tests passed 16 / 160 without skips. The runtime containers were isolated and network-disabled. The accepted native removal HTTP and actual Admin evidence were retained without broad reruns. No merger browser activity, shared-demo mutation, push, deployment or PR occurred. Tickets07/09 were still active at that earlier merger stage and are resolved above.

Ticket07/09 merger revalidation: both normal merges were conflict-free, with ticket09's final branch first including the latest integration merge. Root `bun run fix` / `bun run check` and workspace `bun run check-types` passed; the server type task executed and the other three used matching cache entries. All plugin tests passed269/1276 assertions, spreadsheet units94/276, web lifecycle12/75 and the complete web UI suite172 tests across14 files with `--maxWorkers=1`. Formatting changed no source files. The explicit HTTP command retains every prior suite, including Correction, removal and popup registration. Previously accepted real-engine HTTP and root actual-editor evidence were retained without broad reruns; no native services or UI were operated by this merger. Logs are outside the repository at `/tmp/folio-pdms-implementation/notes/merge-07-09-*.log`. The only new authored repository change for closure is this map; the pre-existing untracked implement-spec skill and lock file were preserved and not staged. At that merger checkpoint final review/fix remained open; it is closed in the final review section above. No push, deployment or PR occurred.

Final review-fix merger revalidation: the normal merge from `933118b7727dca7268f82af3100b8b60048f0196` completed without conflicts as `892ae6fddd2f34fd95128e46ecaa39b009e42d60`. Root `bun run fix` / `bun run check` and workspace `bun run check-types` passed; all four type tasks used matching Turbo cache entries, so no Prisma generation was needed. All plugin tests passed268/1263 assertions, spreadsheet units94/276, web lifecycle12/75 and the complete web UI suite174 tests across15 files with `--maxWorkers=1`. All28 HTTP suite registrations remain, including every PDMS suite and the outage file containing the final recovery/cleanup cases. Formatting changed no production or test source. The root-owned aggregate was copied into `review/implementation-review.md` with only formatter normalization, preserving the separate Standards/Spec reports, follow-ups, final closures and native evidence limits.

The already executed final15-test/577-assertion outage run, other real-engine HTTP checks, build and root's actual pinned-editor acceptance were reused; the merger did not rerun native/runtime suites, operate a browser, modify fixtures or change shared services. Integration check logs are outside the repository at `/tmp/folio-pdms-implementation/notes/merge-final-*.log`. The pre-existing untracked implement-spec skill and lock file remain unchanged and unstaged. Production exposure remains disabled; no push, deployment or PR occurred. Implementer worktree cleanup remains the root agent's final workflow step.
