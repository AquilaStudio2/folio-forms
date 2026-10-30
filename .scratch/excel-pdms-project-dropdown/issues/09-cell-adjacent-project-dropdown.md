# 09: Open searchable project choices beside the selected cell

**What to build:** Clicking a mapped project cell opens a searchable dropdown beside that cell, using the accepted background-plugin prototype and the existing trusted picker save protocol.

**Blocked by:** 03 — Session snapshots and Retry; 05 — Scalar and table targets.

**Status:** claimed

Type: task

Approval: The user reviewed the pinned-editor adjacent-popup prototype after reiterating the in-cell image and explicitly chose “ใช้ dropdown ชิดเซลล์จากต้นแบบ (แนะนำ)”. The original native arrow is not required.

- [ ] Automatically target the selected scalar/complete merged cell or physical table row and source column; show its existing Title/Tag and preserve stable identities.
- [ ] Open the dropdown beside the selected mapped cell, using supported pinned-editor APIs; ordinary and static-dropdown cells retain their normal behavior. The project workflow must not require choosing a target from a side panel.
- [ ] Replace the old project target-selector/search/results region with one Admin Template Draft button that creates a source dropdown at a valid selected cell/complete merge/existing table column, generating normal Title/Tag through the existing upsert/save barrier. Preserve existing valid identities/metadata and avoid duplicate creation. Keep normal metadata editing and Published Template structural guards; runtime Users/Corrections do not create mappings.
- [ ] Creating the first source in an initially source-free authoring editor activates the catalog and adjacent popup after successful saving, preserving unsaved Template content and the logical opening. Further source creation/reloads share that same successful catalog without extra requests.
- [ ] After choosing, saving or reopening, the source remains a dropdown under the same Title/Tag. Reopen the already-selected cell directly and replace its answer; cancelling must also leave an immediate way to reopen that same cell without selecting another cell first.
- [ ] Offer every session name, Thai substring search, keyboard navigation and IME-safe query entry, bounded rendering without truncated reachability, and Escape/cancel that leaves the answer unchanged. Render untrusted names as text.
- [ ] Reuse the current opening's immutable catalog, scoped capabilities and Retry; do not add provider requests for selection changes, background catalog refresh, or catalog data in worksheet validation shared by different openings.
- [ ] Preserve default sheet protection and all direct-input prohibitions. A committed choice uses the existing freeze/native-flush/operation/poll/reload boundary, retaining all ordinary unsaved inputs and other managed answers.
- [ ] Fence popup target, physical row, document revision and catalog when selection/capability/lease changes; discard stale or multiple in-flight choices. Close or disable removed targets and pending/reloaded editor instances.
- [ ] Integrate editable Corrections through ticket07's workspace-only action, preserving the typed reason and explicit final save. Admin authoring can inspect the current list; read-only/source-free editors do not activate the popup or load a catalog.
- [ ] Preserve existing table controls, authoring/removal, static dropdowns and other plugin behavior. Coordinate ticket08's binding-removal reconciliation and ticket07's action hook.
- [ ] Prove production popup scalar/table choose-save-reopen and relevant failure/Retry/cancel/protection behavior in the actual pinned editor plus existing HTTP/plugin/UI boundaries. The outside prototype's placement proof alone is not production acceptance.

## Comments

The original native validation menu was shown with2500 synthetic choices. Under normal sheet protection it displayed choices but rejected the selected write. A diagnostic formatting permission allowed a native choice while paste remained blocked, but broadens unrelated sheet permissions and needs extra native capture/session isolation; this path was not adopted. A separate background variation with initOnSelectionChanged and ShowInputHelper demonstrated the accepted adjacent popup. Querying the last Thai item left the locked source cell unchanged. Production integration and complete cancellation remain to implement; no vendor patch or protection relaxation is authorized by this ticket.

The user subsequently reiterated that an answer must remain editable through the dropdown after selection, and that the dropdown must remain present. Preserve the source definition and a persistent reopen affordance; do not reduce this to a one-time popup or require clicking an unrelated cell to activate it again.

The user's next screenshot singled out the old side-panel project selector/search/list for removal and requested a single create-dropdown button. The implementation response places that button in Admin Template Draft authoring, while runtime choices remain in the accepted cell popup. A one-click creation must persist the actual source mapping and use generated common Title/Tag, rather than merely opening another settings dialog.
