# Domain glossary

## Admin

An authenticated person who creates, edits, publishes, and shares Forms and can inspect every Draft and Submission. Admin includes the form-designer responsibility; there is no separate Designer role. An Admin may sign in locally or through a linked Legacy Identity.

## User

An authenticated person who fills Forms and can inspect only their own Drafts and Submissions. A User may sign in locally or through a linked Legacy Identity; their Responses remain owned by the same Folio account.

## Viewer

An authenticated person who can inspect and download every saved Draft, Submission and Correction through the existing results pages. A Viewer cannot fill or change Responses, author Forms, or manage the application.

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

Unapplied field-panel edits remain local drafts and must be resolved before saving or publishing the Template Draft. An uncertain field-settings write blocks further mutations until the current document, revision, and complete bindings establish its outcome. Safe rollback additionally requires settlement of any delayed write and a matching native editor snapshot; dismissing an error notice does not settle the write.

## Published Template

The immutable document and field contract used to start new Responses. A published Form cannot be structurally edited or republished; changing its structure requires duplicating it into a new Form, including its document and field configuration.

## Field

A mapped input in a Form. For DOCX, it is a tagged content control: its Title/Alias is the user-facing label, its Tag is the stable identity in prefill and extracted data, and its Placeholder guides entry. If the Title/Alias is blank, use the Tag as the label. For XLSX, a Field maps a cell or complete merged cell to a key, label, type, and rules through a named range. Keys must be unique within their containing object and may be reused by different Forms.

## Excel Binding

The placement-only JSON attached to a shared Draft Field Rule or Manifest Field. One `ExcelBinding` TypeScript union and its validation schemas in `apps/server/src/forms/excel-binding.ts` define scalar `{id, anchor, computed}`, table `{id, anchor}`, and column `{id, offset, computed}` metadata. Both lifecycle stages use these definitions for reads and writes; common field configuration stays in the normal field columns. It is stored in the existing nullable `binding` column, not a new database model. DOCX bindings remain null.

Tracked table columns also have workbook named ranges derived from their stable binding IDs, allowing the stored offsets to follow supported native insertions and moves. Missing or ambiguous tracked positions stop saving rather than selecting a neighboring column. These names do not recover an unknown historical mapping: an older table rearranged before tracking may require owner-confirmed correction.

## Spreadsheet Contract

The XLSX field configuration reconstructed from shared Manifest Fields, frozen at publication, and the existing published Prefill Fields. It is not stored as a separate JSON contract. Scalar, table and column definitions share the normal tag/label/type/options/rule columns; binding metadata contains only stable identities, named anchors, column offsets and computed flags. Column tags use `tableKey.columnKey`, while answer JSON retains nested table arrays. Saved results reference the published fields through their Response; current cell positions come from named ranges in each saved workbook rather than copied contract snapshots. Form.documentKind selects DOCX or XLSX processing without repeating the kind on every field or answer. The contract defines scalar Fields and one repeating table in one editable worksheet. The table has a named body range and stable column keys; each nonempty input row becomes one object in the table's array. Wholly empty input rows are skipped, while zero and false count as data. Formula-only rows do not become records. System-managed hidden option data supports dropdowns without becoming an editable worksheet or response field.

Dropdown helper ranges are internal workbook storage. Identical lists can share immutable ranges; Template Draft saving removes only provably unused managed data from the saved copy. Uncertain or custom references retain their data, and live editor history is not compacted during a field edit.

## Response

A User's single attempt to fill a Form. A User can have at most one Response for a Form. A Response may hold a Draft and may produce one or more Submissions over time: submitting again after a Submission reopens the Response as a Draft seeded from that Submission's data and document, so the User can edit and submit again without starting a new Response.

## Draft

A manually saved, resumable Response state containing both the current document and its extracted field data. A Draft is not complete unless both representations were saved successfully.

## Submission

An immutable completed result of a Response, recorded each time that Response is submitted. A Submission exists when its extracted field data and filled DOCX or XLSX were persisted successfully together. PDF exports are generated on demand from the saved document; PDF conversion failure does not remove a completed Submission. A Response accumulates its Submissions in order; each remains individually readable (receipt, export, Correction history) no matter how many times the Response has since been reopened and resubmitted.

## Correction

An Admin-authored revision to a specific Submission. It records changed Field values, a reason, and a revised document while preserving the original Submission. A Correction can only be added while its Response is currently in the submitted state for that same Submission; once the User reopens the Response to submit again, new Corrections on the earlier Submission are blocked until it becomes submitted again, though its existing history remains viewable.

## Operation

A tracked asynchronous request to save a Template Draft, publish a Form, save a Draft, or submit a Response. An Operation progresses through pending, processing, completed, or failed and correlates ONLYOFFICE callbacks with the initiating action.

## Prefill

A snapshot of application-provided Field values and editability policies applied when a Response starts. Resume does not refresh Prefill; starting again after draft invalidation does.
