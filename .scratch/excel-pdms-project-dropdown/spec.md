# PDMS Project Name Source for XLSX Fields

Status: ready-for-agent Approval: The user invoked implement-spec and instructed implementation, accepting the proposed testing boundaries and eight-ticket graph.

## Problem Statement

Admins need project-name choices in Excel Forms without copying and maintaining a large option list. Users need to find a project quickly, select a valid name without entering text directly, and have that answer saved under the same Title/Tag conventions as other Fields. Static choices become outdated, while refreshing choices must not erase a previously saved answer or interrupt work when PDMS is unavailable.

## Solution

An Admin maps a scalar cell, complete merged cell, or repeating-table column to the PDMS Project Name Source using the existing Title, Tag and required-field controls. Every applicable authorized opening of Folio's web editor requests the current PDMS names through Folio's backend. All source-enabled Fields in that editor session share the successfully loaded list, which remains fixed while the editor is open.

Users search project names and select a result; only the selected name is written to the cell and stored under its configured Tag. Direct typing, formula entry, paste and autofill into these managed cells are blocked. Prefer search inside the cell dropdown; the already authorized fallback is a custom searchable picker if native customization is unsuitable. Search-input typing does not write an answer. There is no Clear-answer button.

Previously saved names remain valid unchanged after upstream removal or renaming. Failed loading offers Retry and preserves Draft saving, while submission requires a successful catalog load in the current session. Admins remove a Field using the existing Template Draft removal action, which removes mapping and dropdown but preserves visible cell text and formatting.

## User Stories

1. As an Admin, I want to choose the PDMS Project Name Source for a scalar Field, so that I do not maintain its project options manually.
2. As an Admin, I want to map a complete merged cell, so that an existing spreadsheet layout can use the source.
3. As an Admin, I want to configure a repeating-table column with the same source, so that each row can record a selected project name.
4. As an Admin, I want every usable name returned by PDMS to be available automatically, so that I do not curate a separate subset.
5. As an Admin, I want the normal generated Title and Tag defaults, so that this Field follows the existing authoring workflow.
6. As an Admin, I want to edit Title and Tag under normal uniqueness and validation rules, so that answers fit my Form's data model.
7. As an Admin, I want one stable Title/Tag pair per mapped Field or column, so that refreshing choices never changes answer keys.
8. As an Admin, I want to mark the Field required or optional, so that completion follows the Form's existing rules.
9. As an Admin, I want to save and reopen a Template Draft with this source, so that unfinished authoring can resume.
10. As an Admin, I want publication to preserve the source definition and Field identity, so that later list refreshes do not structurally republish my Form.
11. As an Admin, I want to inspect current names while authoring, so that I can verify the configured source.
12. As a User, I want a fresh project-name request when I open a source-enabled Form, so that I can select from current PDMS choices.
13. As a User, I want reopening my saved Draft to request the list again, so that one-time workbook initialization does not leave outdated choices.
14. As a User, I want multiple project Fields in the same session to share one list, so that opening the Form does not repeatedly request identical data.
15. As a User, I want the list to remain fixed during an active session, so that background changes do not alter choices while I am filling.
16. As a User, I want each separately authorized new editor opening to load again, so that an earlier session's cache cannot substitute for a new request.
17. As a User, I want reconnecting the same active session to retain its list, so that transient reconnection does not unexpectedly replace choices.
18. As a User, I want a replacement editor session after expiry to load again, so that renewed editing has an authoritative session list.
19. As a User, I want to search by part of a Thai project name, so that I can find a project in a long list.
20. As a User, I want search to work with Thai input methods and long names, so that I can enter the intended query naturally.
21. As a User, I want to navigate choices with a keyboard and cancel search, so that selection is accessible and cancellation preserves my answer.
22. As a User, I want every eligible match to remain reachable in a large result set, so that rendering limits do not silently hide my project.
23. As a User, I want only the project name displayed in the answer cell, so that document numbers or hidden project identities do not change my answer format.
24. As a User, I want identical names combined into one choice, so that duplicate names do not clutter a name-list feature.
25. As a User, I want missing or blank names excluded, so that the picker offers usable choices.
26. As a User, I want direct cell typing, paste, formula-bar entry and autofill blocked, so that new answers can only be set through selection.
27. As a User, I want typing a search query to leave the cell unchanged, so that incomplete search text is never mistaken for an answer.
28. As a User, I want a later selection to replace an earlier one, so that I can correct my choice without a separate Clear action.
29. As a User, I want other ordinary input Fields to remain editable, so that project-cell protection does not block the rest of my work.
30. As a User, I want the selected name and extracted answer saved together in a Draft, so that reopening reproduces the same answer.
31. As a User, I want scalar answers stored under the configured Tag and table answers under their column keys, so that results use the existing data shape.
32. As a User, I want to submit after successful loading and valid selection, so that my completed workbook and data form one consistent Submission.
33. As a User, I want a renamed or removed previously saved name preserved and accepted unchanged, so that a catalog change does not force me to rewrite history.
34. As a User, I want any replacement for an old name selected from current choices, so that historical exceptions cannot introduce new arbitrary values.
35. As a User, I want inserted or deleted table rows to keep selections associated with their correct records, so that another row cannot inherit my answer accidentally.
36. As a User, I want an error and Retry when loading fails, so that failure is visible and recoverable.
37. As a User, I want to edit other inputs and save a Draft while loading fails, so that an upstream outage does not lose my work.
38. As a User, I want submission blocked until this session successfully loads its list, so that failure cannot silently use stale choices.
39. As a User, I want a successful empty list distinguished from loading failure, so that required, optional and unchanged historical answers follow the correct rules.
40. As an Admin, I want editable Corrections to load current choices and respect historical answers, so that I can revise results without rewriting the original Submission.
41. As a Viewer, I want read-only results to show their saved answers without catalog refresh or write capabilities, so that viewing history cannot mutate it.
42. As an Admin, I want removing a source-enabled Field to remove its Title/Tag mapping and dropdown while keeping cell text and formatting, so that I can revise Template Draft structure safely.
43. As an Admin, I want removing a column mapping to preserve its physical worksheet column, so that deletion does not damage my layout.
44. As an Admin, I want published structural changes to require the existing duplication workflow, so that existing published contracts and saved results remain stable.
45. As an Admin, I want ordinary dropdowns and unrelated Forms to retain their behavior, so that introducing this source does not regress existing Forms.
46. As a User, I want expired permissions and stale selection requests rejected without changing another document or row, so that delayed operations cannot corrupt my answers.
47. As an Admin, I want PDMS access credentials kept on the backend, so that workbook and browser clients cannot obtain service credentials.

## Implementation Decisions

1. Reuse existing Field authoring, shared Draft Field Rules, published Manifest Fields and Spreadsheet Contract reconstruction. Represent the source in common Field configuration for scalar Fields and repeating-table columns; Excel Binding remains placement-only. The exact additive source representation and any persistence migration are implementation choices to settle during the first working slice.
2. Reuse the existing XLSX Title/Tag controls, generated defaults, validation, stable binding identity and nested table answer conventions. Title maps to the common label; Tag maps to the common key/tag. Changing options or choosing a project never creates another Field or regenerates its metadata.
3. Answers are project-name strings. Identical name strings represent one choice; this feature does not reference uniquely identifiable projects or retain hidden PDMS project IDs. Follow the accepted domain decision on stable historical names.
4. Use the existing upstream GET endpoint named getAllProjectNamesAndDocumentNumbersRoute. Its current response is a bare array containing confirmation_document_number and an optional nullable name, with no search or pagination. It excludes projects without usable document numbers. Folio consumes usable names, excludes blank/null names and exact duplicates, and preserves deterministic upstream order without adding year/status/owner filters.
5. Keep upstream access in an authenticated Folio backend adapter using the user-provided ONGOING_API_URL base and X_ONGOING_SECRET credential. Call api/pages/projects/names-and-doc-numbers with the ongoing-secret-token header; avoid duplicating api if it is already included in the configured base. These values remain server-only. Client requests use Folio authorization and editor capabilities scoped to their current document, owner/action and lease. Validate upstream shape, apply bounded request timeout, and fail visibly on malformed/incomplete responses. Do not leak credentials through the browser, workbook or logs. Wire the exact variable names through validated server environment, deployment configuration and example/operator documentation without committing their values.
6. Establish one catalog snapshot per applicable authorized editor opening. Successful snapshots are immutable within that active session and shared across its mapped Fields. New sessions/tabs/reopenings fetch again; reconnecting the same session retains its snapshot. A failed load can be retried, but another session's cache cannot satisfy the fresh-open requirement.
7. Refresh for Admin Template Draft editing, User filling/resuming and Admin editable Corrections. Do not fetch or rewrite on read-only previews, or fetch for Forms without this source. Loading is independent of one-time Response initialization.
8. Prefer a supported native in-cell search route. Inspection of the local pinned editor found a plain native menu and no established supported search-injection hook; do not promise native customization. The custom-picker fallback is already authorized. A bounded prototype must choose and demonstrate the supported UI and protected-write approach before broader implementation.
9. Source-enabled answer cells are picker managed and remain protected from direct typing, formula-bar entry, paste, drag-fill and equivalent edits, even for valid names. Search-input typing remains allowed. Preserve existing unrelated protection settings, other inputs and supported table operations. Do not expose protection credentials or create an unlocked editing interval to simulate picker-only behavior.
10. Authoritative Folio picker operations choose a name in the session catalog for a stable Field/row target and current document revision. Membership validation alone does not establish selection origin. Coordinate accepted selections, workbook bytes and extracted data during save/submit/Correction operations using trusted server state.
11. Historical-value exceptions come only from the correct saved Response or Correction baseline, Field and row. A saved name can remain unchanged when absent from the new catalog; selecting a replacement requires a current choice. Do not allow copied values or another row's history to grant this exception. Table row identity or revision-fenced remapping must be demonstrated before table provenance is accepted.
12. Workbook and extracted values persist together through existing save operations. Failure retains current values and recovery state. Load failure permits Draft saving but blocks submission until successful loading; apply the same source-validity rule when persisting a new Correction. A successful empty list is not a load failure: existing required/optional and trusted historical rules apply.
13. There is no picker Clear action. Admin's existing Field removal on an unpublished Template Draft removes mapping, Title/Tag, source, picker management, managed anchors and validation, while preserving cell contents and formatting. Remove a column mapping without deleting the physical column. Reconcile source-specific protection and selection state without altering unrelated protection.
14. Published source configuration is immutable with the published Field contract; runtime choices may change between openings. Structural changes to a published Form follow duplication. Existing static dropdowns and unrelated DOCX/XLSX Fields remain compatible. Do not redefine unrelated Prefill or resubmission policies.
15. Direct protected live writes remain unproven. If a server-authorized save/reload flow is required, verify all unsaved work is preserved and document the resulting interaction before accepting it. Prototype failure is not permission to weaken picker-only input.
16. Deliver behind an unexposed development/test configuration until all acceptance slices are complete. Each slice remains independently verifiable and preserves existing behavior; partial completion is not a production release of the complete source.

## Testing Decisions

1. Primary proposed boundary: exercise the existing Folio HTTP workflow from authorized Admin Field configuration and publication through User editor opening, picker operation, Draft save/resume, submission and reading saved workbook/data. Assert externally observable responses, catalog request counts, correct Title/Tag extraction, persisted artifacts and ownership/permission failures.
2. Reuse the application's existing createApp request harness, isolated database/storage fixtures, editor-capability requests and save-operation polling. Existing spreadsheet authoring, column persistence, initialization and preserved-session HTTP suites are the relevant prior art. Stub PDMS only at the external network adapter; supply controlled catalogs, latency and failure. A private local fake upstream is sufficient for deterministic integration tests.
3. Necessary complementary boundary: run the actual pinned ONLYOFFICE editor/plugin for protection, protected writes, Thai/IME search, keyboard use, merged cells, row changes and save/reopen. HTTP tests and a fake Office API cannot prove these interactions. Reuse current runtime workbook/validation tests and the plugin authoring/save-lifecycle harness for deterministic UI/revision scenarios; do not build a separate general test framework.
4. Good tests observe selection outcomes and unchanged data on failure, not helper names, internal object layouts, exact private call order or snapshots that merely reproduce implementation. Add lower-level tests only for essential behavior that cannot be expressed economically through the two boundaries above.
5. Verify name deduplication and blank-name removal, complete result reachability, fixed session snapshots, fresh requests for reopening and new sessions, no background refresh, Retry, valid empty results, failed/malformed/timed-out loads, and absence of requests for read-only or source-free editors.
6. Verify valid names entered through typing/paste still cannot bypass picker-only cells. Verify forged selection claims, stale document/lease/revision, cross-Response targets, another row's historical value and uncertain save outcomes cannot be persisted as accepted selections.
7. Verify exact scalar and nested-table name extraction under stable Tags, workbook/data consistency, saved historical names after upstream rename/removal, row insertion/deletion/reordering/undo outcomes, editable Corrections and immutable original Submissions.
8. Verify Admin Field removal preserves content/layout, removes source metadata and extraction, clears managed artifacts and source-specific protection correctly, preserves unrelated custom validation/anchors, and respects Published Template structural restrictions.
9. Register new HTTP suites in the standard server HTTP command rather than leaving tests outside its explicit suite list. Document and run required runtime opt-ins explicitly; an all-skipped runtime suite is not successful runtime evidence.
10. The default CI presently runs formatting/lint, types, web tests and server spreadsheet unit tests; it does not establish that HTTP, plugin or real-editor scenarios ran. Each ticket records its appropriate executed checks using isolated integration resources and the real-editor environment where needed. Run the relevant existing regressions; broaden only for uncovered risks.
11. The user accepted the proposed HTTP and real-editor boundaries and ticket graph by invoking implement-spec. Implement through these agreed boundaries without reopening the product interview.

## Out of Scope

- Automatic fetching by downloaded files opened in desktop Microsoft Excel.
- Editing ONLYOFFICE vendor UI as the assumed solution, or guaranteeing the native validation popup can host a custom search input.
- Hidden PDMS project IDs, linking answers to distinct same-name projects, automatic historical renaming, or reconstructing project identity from names.
- Admin-maintained project subsets, new year/status/owner filters, or exposing projects omitted by the existing upstream endpoint.
- Arbitrary text entry, paste/autofill as answer entry, and a User-facing Clear-answer button.
- Background catalog refresh, stale cached catalogs substituting for a new editor opening, or fetching on read-only previews.
- Rewriting original Submissions, mutating published structure in place, changing unrelated Prefill/resubmission policy, or persistent uploads for the separate attachment POC.
- Replacing the upstream API with pagination/search, broad credential architecture changes, a new generic integration framework, deployment as part of the implementation task.

## Further Notes

- Latest UI clarification: the user supplied an image of an in-cell validation arrow and dropdown, reiterating that clicking the configured cell control should show all project names there. The implemented side panel alone does not establish acceptance of that clarified interaction. Investigate and demonstrate the in-cell route while preserving selection-only protection; do not silently weaken the prohibition on typing or claim native behavior without a pinned-editor proof. The earlier fallback authorization and its technical findings remain recorded, but the clarified UI is still an outstanding acceptance item.

- Product behavior was agreed through Q1–Q12 plus the added Title/Tag requirement. The existing name-answer ADR and domain vocabulary remain authoritative.
- The real PDMS record count, payload size and latency were not measured. Measure a representative authorized catalog before accepting performance; document list size, full-result reachability, search latency, editor-open latency and Thai input responsiveness without inventing an unagreed numerical SLA.
- Repository source and a local test container identify the pinned editor family as 9.4.0.1; production deployment was not verified.
- The prototype must report which supported picker and protected-write path works, what did not work, test evidence and resulting limitations. If neither the authorized custom picker nor a safe protected-write path satisfies the agreed behavior, report the blocker rather than marking the gate complete.
- No speculative prefactoring or wide refactor is required by current evidence. Introduce only additive source support needed by the first full slice; extract shared behavior when the later slice demonstrates a concrete need.
- Proposed tickets are vertical slices with explicit blockers. The user has authorized implementation through implement-spec. Deployment is outside the authorized scope.
