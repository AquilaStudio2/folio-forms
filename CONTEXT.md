# Domain glossary

## Admin

An authenticated person who creates, edits, publishes, and shares Forms and can inspect every Draft and Submission. Admin includes the form-designer responsibility; there is no separate Designer role. An Admin may sign in locally or through a linked Legacy Identity.

## User

An authenticated person who fills Forms and can inspect only their own Drafts and Submissions. A User may sign in locally or through a linked Legacy Identity; their Responses remain owned by the same Folio account.

## Viewer

An authenticated person who can inspect and download every saved Draft, Submission and Correction through the existing results pages. A Viewer cannot fill or change Responses, author Forms, or manage the application. An Admin can create a local Viewer or change an existing account to Viewer. A Viewer may sign in locally or through a reviewed, linked Legacy Identity; both login methods use the same effective role.

## Legacy Identity

A person authenticated by PDMS, identified by a stable subject and an explicit provider, whose stored email does not establish mailbox ownership. A Legacy Identity links to at most one Folio account, which may be a User, Viewer or Admin; matching email alone never establishes a link, and changed email does not replace a completed link's owner.

## SSO Bridge

The login handoff in which PDMS authenticates a Legacy Identity and Folio creates its own session for an eligible linked account, using authenticated identity evidence rather than verified mailbox ownership. PDMS supplies all currently active role names; `admin (กปม.)` (case-insensitive, including `Admin` and `ADMIN`) maps to Admin; otherwise the exact name `เจ้าหน้าที่ กปม.` maps to Viewer, and every other valid list maps to User. The systems do not share passwords or login tokens.

## SSO Role Baseline

The last successfully applied PDMS role mapping stored on the linked Account. The first successful SSO after introduction establishes the baseline and applies that role, including for existing accounts. Later SSO preserves a manual Folio role change while the PDMS mapping is unchanged; an observed mapping transition replaces the effective role. Manual role edits never change the baseline. Effective role is shared by local and SSO login. Raw PDMS role lists are not retained, and changes between logins are not monitored. A downgrade that would remove the last enabled Admin fails without changing the baseline or effective role.

## Pending Account Link

An authenticated Legacy Identity awaiting an Admin's review of current identity evidence and ownership of an existing Folio account, including an Admin; changed incomplete evidence requires new review. Approval alone grants no access: a fresh SSO attempt after approval must complete the binding. Privileged PDMS roles never bypass this review.

## Form

A shareable questionnaire-like document owned by the application. A Form has a title, description, immutable document kind (DOCX or XLSX), Template Draft, optional Published Template, and one stable share link. Each Form has its own field keys and responses.

XLSX Forms start from a blank workbook; importing an XLSX template is not supported. DOCX Forms may start blank or from an uploaded DOCX. Spreadsheet layout and formatting use the native editor; the field-settings panel supplies the application-specific mapping between cells and response data.

Creating a repeating table adds cell borders across the selected range, including an explicitly selected header row. Added response rows inherit the prototype row's formatting while input values are cleared without removing borders. Admins can download the saved Excel template as XLSX or PDF; unsaved editor changes are included only after saving the Template Draft.

## Fill Method

An Admin-selected DOCX Form setting that routes all current and new Responses through either the native web form or ONLYOFFICE. Changing the method does not change the shared Fields or saved DOCX. XLSX Forms use ONLYOFFICE.

## AI Authoring Session

An Admin's temporary workspace for creating or editing a Form from a PDF or chat description. It contains an iterative conversation and a generated DOCX that the Admin can preview and download.

## OmniRoute

The external model gateway used by AI Authoring Sessions. Folio calls it server-side; the upstream provider and model are configured in OmniRoute.

## Template Draft

The editable document an Admin is currently preparing. Saving it does not change the document available through the Form's share link.

An XLSX Template Draft may contain unfinished field or table configuration so an Admin can save work in progress. Its configuration uses the shared Draft Field Rules, with optional label/type/options/order and placement-only binding metadata. DOCX draft metadata remains in content controls and uses its existing rules. Publication requires a complete, valid Spreadsheet Contract.

Attachment configuration may also remain incomplete in a Template Draft. Publication requires a saved Document Category for each declared attachment Field or table column, exactly one scalar root Field each for `fiscal_year` and `docs_number`, and configured existing attachment buttons. These metadata Fields need no User-entered values in the template. Saved category names remain valid for publication when the category provider is unavailable or has renamed a category; changing a category requires a successful actual category list, not a guessed destination.

Unapplied field-panel edits remain local drafts and must be resolved before saving or publishing the Template Draft. An uncertain field-settings write blocks further mutations until the current document, revision, and complete bindings establish its outcome. Safe rollback additionally requires settlement of any delayed write and a matching native editor snapshot; dismissing an error notice does not settle the write.

## Published Template

The immutable document and field contract used to start new Responses. A published Form cannot be structurally edited or republished; changing its structure requires duplicating it into a new Form, including its document and field configuration.

## Field

A mapped input in a Form. For DOCX, it is a tagged content control: its Title/Alias is the user-facing label, its Tag is the stable identity in prefill and extracted data, and its Placeholder guides entry. If the Title/Alias is blank, use the Tag as the label. For XLSX, a Field maps a cell or complete merged cell to a key, label, type, and rules through a named range. Keys must be unique within their containing object and may be reused by different Forms.

## Attachment Field

An explicitly configured XLSX Field or table column associated with the existing attachment button and stable binding. Its Title, editable pre-publication Tag and requiredness use the existing Field settings. Attachment intent is never inferred from an `attachment_N` Tag, filename or URL string. A table column shares one Document Category across all its rows. A published attachment contract is immutable; changing it requires duplicating the Form.

An old Published PoC remains an ordinary text/URL contract, including its required rules and immutable history. Its old button explains that durable attachments need a newly configured Form; it cannot retain a File as a memory-only fallback. Duplicating the Form copies only its template and configuration, never User Responses, answers or files. An Admin must explicitly configure verified old PoC slots in the new Template Draft; the application never chooses a successor or archives, deletes, redirects or migrates the original Form.
Attachment selection is a pending browser File, not a saved answer. Explicit User Save Draft or Submit persists its original bytes to ECM and commits the document, canonical receipt and Operation together. A saved attachment may contain zero bytes. Unknown upload or canceled-batch cleanup outcomes keep the previous canonical Draft readable but prevent further response mutations until settled. A saved public URL is a projection, not ownership or deletion authority.

A missing attachment checkpoint lookup is not proof that an earlier sender cannot start. Explicit recovery shares the existing Form/lease admission locks: it returns the original Operation if admitted, or atomically rotates the old lease UUID before reporting non-admission. The host retains the File and native edits, then uses normal capability renewal for a new user-triggered save; absence or elapsed time alone never permits resend.

A recovered completion is evidence for the earlier snapshot, not acceptance of newly captured ordinary answers. Persisted checkpoints reconcile before editing opens; an own unresolved commit keeps the native editor read-only while bounded recovery stays usable. Recovery reads the original Operation before requesting a mutation capability, preserves its Draft/Submit action, and opens the latest canonical document before accepting new edits.

Replacing or removing a Draft attachment remains pending until an explicit save; canceling the pending change restores the saved file. Changing the year or document number reuses the saved original bytes as a distinct version on the next explicit save, unless a replacement was selected. Unchanged files and metadata reuse their saved references without a new upload or service login. Internal row and project saves preserve the canonical attachments without uploading.

A table attachment belongs to one physical row and one published column binding. Its zero-based `row_index` is the row's position within the current trusted table body, not its position in a compact answer array. Empty gaps do not move files to neighboring answers. A row with ordinary input or a saved/selected attachment, including a zero-byte file, is active and must satisfy every required column at Submit; a completely empty row is excluded.

Supported append and existing delete-selected commands preserve file identity while updating current row positions. The original upload position remains audit evidence, not a permanent row identity. Internal row/project saves do not upload or delete ECM files. Pending Files and removals survive a remount only with verified old/new document and physical-row mapping; stale, ambiguous or loss-producing transitions stop without discarding selections. No per-row Tag or stable row ID is introduced.

Old files become eligible for deletion only after the complete new snapshot commits and no Draft, immutable history, workspace or eligible Operation still references them. A failed or uncertain old-file cleanup does not undo the saved snapshot or prevent its use and export. Its persistent warning states that old public URLs may still work; later ordinary saves neither retry that deletion nor dismiss the warning. This differs from an unsettled canceled batch, which continues to block mutations.

Admin follow-up is expandable inside the existing Results page. Tracking records remain separate from live Responses, including after Response deletion, and do not restore deleted answer rows. Admin and Viewer can read trusted operation, slot and destination evidence with date-and-time timestamps; only a current enabled Admin can fence an original batch or initiate authorized cleanup.

A sender fence prevents future dispatch and canonical commit for the canceled batch; it does not prove an already dispatched request has finished at ECM. Only the validated receipt from that original request establishes its known received outcome. A late receipt remains canceled work for cleanup, never a new answer. Admin may initiate the first deletion of a known received, unreferenced canceled file after rechecking its generation and sender fence. An unknown upload or a previously dispatched uncertain deletion remains held: elapsed time, restart, an empty search or an operator note is not settlement proof.

The picker, fill page and dashboard Response-deletion dialog retain actionable unknown-outcome instructions. A rejected action does not replace these instructions with an invitation to resend. When original-checkpoint recovery cannot open an editable document, the saved canonical Excel copy remains separately readable without clearing the checkpoint or uploading pending files.

## Response Deletion Case

A durable record of an authorized whole-Response deletion. It retains the original Response owner's identity and attachment reference evidence, not a restored answer. Deleting Response data and confirming deletion of unreferenced Folio files are separate outcomes. Pending cleanup may leave public URLs usable and prevents removing the owner's account until that cleanup is resolved.

Owner discard applies only to that person's Draft, including an Admin's own Draft. It cannot replace the confirmed Admin deletion flow for another person's Response or a submitted Response. Whole-Response deletion retires that Response's Draft, Submission, Correction, workspace and eligible Operation references together; references surviving elsewhere still protect their files. Archive preserves files and history.

The owner can still read a pending deletion warning after leaving Fill or reloading a page. Admin and Viewer find the case in existing Results tracking without restoring a normal Response row. Only an authorized Admin may perform the existing evidence-based first cleanup action; an uncertain dispatched DELETE cannot be resent or settled by a note.


## Document Category

An ECM-provided destination name selected by an Admin for an Attachment Field or column. Folio saves the exact `type` string, not the category ID, and does not follow upstream renames or substitute a fallback. Users cannot select or change the destination.

## ECM Service Account

The dedicated Folio-only server identity used to read categories and perform authorized document integration. It is independent of every person's Folio session and of Ongoing credentials. Shared PostgreSQL coordination governs its bounded login jobs and encrypted token generations; integration failure never signs a person out of Folio. Credentials and the token-encryption key remain server-managed secrets, never answer data or browser state.

## Result Filter Field

A scalar Field containing a Response's stated province, calendar month, or Buddhist Era fiscal year for results searching and display. The value belongs to its current saved Draft or latest Submission with its latest Correction. Results display each nonempty scalar answer as saved, including values that do not match the supported filter choices. Missing Fields, empty answers and structured values show `-` independently. Filtering uses the agreed Province, Month and Fiscal year formats separately from display.

## PDMS Project Name Source

An Admin-selected source of project-name choices for XLSX Fields. Users select a name from the available choices; identical names represent one choice, and the answer is the selected name rather than a reference to a distinct PDMS project. A previously saved name remains valid when that name is later renamed or removed from the source.

## Excel Binding

The placement-only JSON attached to a shared Draft Field Rule or Manifest Field. One `ExcelBinding` TypeScript union and its validation schemas in `apps/server/src/forms/excel-binding.ts` define scalar `{id, anchor, computed}`, table `{id, anchor}`, and column `{id, offset, computed}` metadata. Both lifecycle stages use these definitions for reads and writes; common field configuration stays in the normal field columns. It is stored in the existing nullable `binding` column, not a new database model. DOCX bindings remain null.

Tracked table columns also have workbook named ranges derived from their stable binding IDs, allowing the stored offsets to follow supported native insertions and moves. Missing or ambiguous tracked positions stop saving rather than selecting a neighboring column. These names do not recover an unknown historical mapping: an older table rearranged before tracking may require owner-confirmed correction.

## Spreadsheet Contract

The XLSX field configuration reconstructed from shared Manifest Fields, frozen at publication, and the existing published Prefill Fields. It is not stored as a separate JSON contract. Scalar, table and column definitions share the normal tag/label/type/options/rule columns; binding metadata contains only stable identities, named anchors, column offsets and computed flags. Column tags use `tableKey.columnKey`, while answer JSON retains nested table arrays. Saved results reference the published fields through their Response; current cell positions come from named ranges in each saved workbook rather than copied contract snapshots. Form.documentKind selects DOCX or XLSX processing without repeating the kind on every field or answer. The contract defines scalar Fields and one repeating table in one editable worksheet. The table has a named body range and stable column keys; each nonempty input row becomes one object in the table's array. Wholly empty input rows are skipped, while zero and false count as data. Formula-only rows do not become records. System-managed hidden option data supports dropdowns without becoming an editable worksheet or response field.

Dropdown helper ranges are internal workbook storage. Identical lists can share immutable ranges; Template Draft saving removes only provably unused managed data from the saved copy. Uncertain or custom references retain their data, and live editor history is not compacted during a field edit.

## Response

A User's single attempt to fill a Form. A User can have at most one Response for a Form. A Response may hold a Draft and produce multiple immutable Submissions over time. Reopening a DOCX Response seeds its prior Submission's document and data; an XLSX new round instead starts blank from Published Template, without copying old answers or files. Resuming an already saved XLSX Draft preserves its canonical document and attachments.

The XLSX exception includes the prior round's `fiscal_year`, `docs_number`, attachment URLs and file references: none are seeded from a Submission or Correction into a new round. The normal fill page still automatically starts that round after Submit. Earlier immutable history remains readable; this is distinct from resuming a saved Draft.

## Draft

A manually saved, resumable Response state containing both the current document and its extracted field data. A Draft is not complete unless both representations were saved successfully.

## Excel Fill Download

A copy of the workbook open while filling an XLSX Form, including edits awaiting a Draft save. The fill page provides the copy as an Excel file or a PDF independently of Draft persistence.

Declared attachments must be explicitly saved before downloading pending changes. Download itself never uploads. Ordinary unsaved native edits, including the active cell, still come from the open workbook; removing managed attachment controls affects only the derived download, not its editable source, protection or unrelated artwork.

## Submission

An immutable completed result of a Response, recorded each time that Response is submitted. A Submission exists when its extracted field data and filled DOCX or XLSX were persisted successfully together. PDF exports are generated on demand from the saved document; PDF conversion failure does not remove a completed Submission. A Response accumulates its Submissions in order; each remains individually readable (receipt, export, Correction history) no matter how many times the Response has since been reopened and resubmitted.

## Correction

An Admin-authored revision to a specific Submission. It records changed Field values, a reason, and a revised document while preserving the original Submission. A Correction can only be added while its Response is currently in the submitted state for that same Submission; once the User reopens the Response to submit again, new Corrections on the earlier Submission are blocked until it becomes submitted again, though its existing history remains viewable.

For declared XLSX Attachment Fields, only final explicit Save Correction uploads selected replacements or new metadata versions. Internal project/workspace saves do not upload. Pending original Files and removals cross a workspace document change only with verified canonical scope and physical-row mapping; otherwise the current page must retain them. The Admin acts on the submitted Response through its Correction lease, not through another User's Draft.

Each Correction preserves its own document, canonical attachment receipts and file references. Removing or replacing a file in a later revision cannot delete a file still referenced by a Submission or older Correction. Read-only views and XLSX/PDF downloads derive URL-only copies from the selected revision, without upload controls or attachment tokens; editable canonical documents remain unchanged. A broken historical public URL is not replaced by the latest file.

## Editor Opening

One mounted editor instance, identified by a validated opening UUID. The application document key remains the canonical identity of a saved document, capability scope, attachment checkpoint and Operation; opening a saved Draft does not create another revision. Mutable editor configurations expose this identity as `bridge.documentKey`.

For XLSX, ONLYOFFICE receives a separate opaque `documentServerKey`, bound to the canonical document, actor, Folio session and opening. Capability or lease renewal within the same opening retains that native key; a different opening receives another native cache identity. Signed capabilities and durable Operation metadata carry the native key, and callbacks must match both canonical and native identities before consuming their claim. Read-only XLSX viewers receive independent fresh native cache identities. DOCX retains its existing native document-key behavior.

An unchanged-native response may reuse a failed capture only from the same native opening. A freshly opened editor reads the saved canonical document and must not revive unsaved ordinary input captured by another opening's failed action.

An editor capability never changes an authenticated person's account, role or leased session. If a request supplies Folio bearer or cookie credentials, each credential is independently resolved through Folio's existing session validation and must match the capability's account, current role and session-bound lease proof. A conflicting or invalid supplied credential cannot fall back to a more privileged capability; Viewer sessions remain read-only. Credential-free native plugin requests retain their existing enabled-account, signed-capability and editor-lease checks. This editor-only inspection does not enable cookie-only access to ordinary APIs: `identityFor` and `requireIdentity` remain bearer-only, preserving ADR 0002.

## Operation

A tracked asynchronous request to save a Template Draft, publish a Form, save a Draft, or submit a Response. An Operation progresses through pending, processing, completed, or failed and correlates ONLYOFFICE callbacks with the initiating action.

## Prefill

A snapshot of application-provided Field values and editability policies applied when a Response starts. Resume does not refresh Prefill; starting again after draft invalidation does.
