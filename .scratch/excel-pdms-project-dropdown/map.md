# Excel PDMS project dropdown — design interview

Date: 2026-10-30 (Asia/Bangkok)

This document records discovery and the agreed product decisions. The user has answered Q1–Q12 and added the Title/Tag requirement. Technical execution is tracked below: prototype 01 and slices 02–05 are resolved, and the implementation frontier is 06/08. The latest clarification requires the cell's own dropdown arrow to show all project names; root is evaluating that interaction. The complete feature remains unfinished and production exposure stays disabled. The prototype also fixes an existing merged-cell save bug.

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

## Technical design and verification remaining

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

The user subsequently requested the to-spec and to-tickets workflows. A [review package](review/README.md) contains the skill-template spec and eight separate ticket drafts, including acceptance criteria and blocking edges. Product requirements are settled; only the two skills' requested review of testing boundaries and ticket granularity/dependencies is pending. These drafts are ready-for-human and are not published implementation issues. After approval, publish the canonical spec and individual local issues as ready-for-agent. No feature implementation or tests have been run as part of this documentation task.

## Implementation started

The user invoked implement-spec and explicitly instructed implementation. This accepts the previously proposed test boundaries and ticket graph. The canonical spec and eight tickets are published as ready-for-agent. Integration branch: codex/excel-pdms-project-dropdown; baseline commit: ced39002574331a347b59cd868535fc4eb90ef05.

Execution frontier: 06 and 08 are ready for fresh implementers after integration of resolved tickets03/04/05. Ticket07 still awaits06; its03 blocker is resolved. Each implementation ticket has its own branch/worktree and fresh TDD implementer; merger agents integrate completed work. Completion uses the local wayfinding convention: Type prototype/task, Status claimed while active and resolved only with acceptance evidence in Comments. The ready-for-agent value records initial triage. No deployment is planned.

Latest user clarification: clicking the native in-cell validation dropdown arrow must expose all project names there. The current side-panel picker differs from that requested interaction. Root is investigating a supported in-cell approach while preserving picker-only input and the existing protection boundary; no native customization capability or completed final UX is claimed. The integrated backend/session/table provenance remains applicable.

### Active work

Ticket [01](issues/01-prove-protected-project-picker.md) is resolved as a prototype, integrated from `codex/pdms-project-01` through `96a0559`. The pinned real editor demonstrated a supported custom picker and protected server-save/reload path, consecutive merged/table selections, unsaved ordinary-input preservation and representative row insertion. Direct protected live writes failed and were not adopted. Native protection checks plus exported lock styles support the managed-cell policy; physical IME composition and fill-handle dragging were not performed and remain explicit verification limits.

Ticket [02](issues/02-scalar-project-field-roundtrip.md) is resolved and integrated from `codex/pdms-project-02` through `0444b21`. The scalar slice persists common source metadata, loads a durable catalog per logical opening, and applies server-authorized selections through the real protected save/callback boundary with atomic artifact/data/session advancement. Root demonstrated actual merged/scalar selection, preservation of unsaved ordinary inputs, consecutive selection, submit and matching immutable JSON/XLSX results. Deterministic HTTP/plugin/web/runtime checks are recorded in the ticket; no fixture postprocessing adapter became production state.

Ticket [04](issues/04-saved-name-history.md) is resolved and integrated from `codex/pdms-project-04` through `bf95b38`, including ticket 03's signed per-opening catalog scope at `5281f4b`. Its public native-engine history workflows PASS 3 tests / 279 assertions without introducing a second history model. Root's actual editor proof retained the exact saved name through upstream failure, ordinary outage Draft Save, successful Retry with 2500 names excluding that name, and Submit; public immutable JSON and downloaded XLSX independently match the exact historical name and latest ordinary answers. The subsequent native next-entry transition opened a ready catalog and a blank source cell, completing ticket 02's deferred native check. Acceptance details and artifact pointers are in ticket 04.

Ticket [03](issues/03-session-refresh-and-outage-recovery.md) is resolved and integrated from `codex/pdms-project-03` through `f793a94`, including signed catalog-session scope, scoped Retry, replacement-catalog delivery without native reload, and the failed-capture/no-change fallback guard. Root's actual normal-outage proof preserved the historical answer and unsaved ordinary notes through Retry and Submit. The initial callback-origin failure and subsequent note loss remain recorded failure evidence. The fallback guard and replacement propagation passed automated regressions after that native proof; they were not separately rerun in the actual editor.

Ticket [05](issues/05-repeating-project-column-roundtrip.md) is resolved and integrated from `codex/pdms-project-05` through `d4027b2`. Root demonstrated actual scalar/two-column selections, blocked valid-name paste, append/new-row selection, first-row deletion with correct remapping, Submit and the blank new-entry transition. Public immutable Submission JSON and downloaded XLSX independently match the final scalar and three nested records. Historical removed-name row behavior remains06's acceptance rather than being inferred from this current-catalog proof.

Tickets [06](issues/06-table-history-and-row-changes.md) and [08](issues/08-remove-field-and-preserve-forms.md) are ready; ticket [07](issues/07-correction-and-readonly-results.md) awaits06. Physical IME/fill-handle checks from01 and the latest in-cell interaction clarification remain explicit limits. `PDMS_PROJECT_NAME_SOURCE_ENABLED` remains false until the complete feature is accepted. Shared environment research remains outside the repository; integration uses private isolated test resources, not existing demo data.

Integration revalidation after the normal03/05 merges: full root `bun run fix` / `bun run check`, main-checkout Prisma generation and workspace types passed. Production plugin248 tests /1201 assertions, spreadsheet units94 /276, focused web reconnect18, catalog session HTTP10 /71 and legacy force-save recovery1 /2 passed. HTTP checks used the private isolated integration resources sequentially. The merger did not rerun the already accepted native HTTP suites or operate a browser. Ticket04's exact historical-name documentation now uses quotes inside code spans so formatting cannot remove its significant leading/trailing spaces; runtime/test literals are unchanged.
