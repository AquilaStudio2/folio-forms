# Excel PDMS project dropdown — design interview

Date: 2026-10-30 (Asia/Bangkok)

This document records discovery and the agreed product decisions. The user has answered Q1–Q12 and added the Title/Tag requirement; the product interview frontier is empty. Technical implementation proposals remain subject to the documented prototype gates. No production code has been changed.

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

No product questions remain open: Q1–Q12 were individually answered, including the concrete Title/Tag and removal clarification. The product-design interview is complete and consolidated in `spec.md`. Remaining technical work is explicitly listed as prototype/implementation gates; no implementation outcome is claimed and no production code has been changed. The original request was feature design, so implementation is a separate follow-on task.

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

## to-spec / to-tickets publication review

The user subsequently requested the to-spec and to-tickets workflows. A [review package](review/README.md) contains the skill-template spec and eight separate ticket drafts, including acceptance criteria and blocking edges. Product requirements are settled; only the two skills' requested review of testing boundaries and ticket granularity/dependencies is pending. These drafts are ready-for-human and are not published implementation issues. After approval, publish the canonical spec and individual local issues as ready-for-agent. No feature implementation or tests have been run as part of this documentation task.

## Implementation started

The user invoked implement-spec and explicitly instructed implementation. This accepts the previously proposed test boundaries and ticket graph. The canonical spec and eight tickets are published as ready-for-agent. Integration branch: codex/excel-pdms-project-dropdown; baseline commit: ced39002574331a347b59cd868535fc4eb90ef05.

Execution frontier: 01. Each implementation ticket has its own branch/worktree and fresh TDD implementer; merger agents integrate completed work. Completion uses the local wayfinding convention: Type prototype/task, Status claimed while active and resolved only with acceptance evidence in Comments. The ready-for-agent value records initial triage. No deployment is planned.
