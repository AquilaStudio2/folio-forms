# 09: Open searchable project choices beside the selected cell

**What to build:** Clicking a mapped project cell opens a searchable dropdown beside that cell, using the accepted background-plugin prototype and the existing trusted picker save protocol.

**Blocked by:** 03 — Session snapshots and Retry; 05 — Scalar and table targets.

**Status:** claimed

Type: task

Approval: The user reviewed the pinned-editor adjacent-popup prototype after reiterating the in-cell image and explicitly chose “ใช้ dropdown ชิดเซลล์จากต้นแบบ (แนะนำ)”. The original native arrow is not required.

- [ ] Automatically target the selected scalar/complete merged cell or physical table row and source column; show its existing Title/Tag and preserve stable identities.
- [ ] Open the dropdown beside the selected mapped cell, using supported pinned-editor APIs; ordinary and static-dropdown cells retain their normal behavior. The project workflow must not require choosing a target from a side panel.
- [ ] Offer every session name, Thai substring search, keyboard navigation and IME-safe query entry, bounded rendering without truncated reachability, and Escape/cancel that leaves the answer unchanged. Render untrusted names as text.
- [ ] Reuse the current opening's immutable catalog, scoped capabilities and Retry; do not add provider requests for selection changes, background catalog refresh, or catalog data in worksheet validation shared by different openings.
- [ ] Preserve default sheet protection and all direct-input prohibitions. A committed choice uses the existing freeze/native-flush/operation/poll/reload boundary, retaining all ordinary unsaved inputs and other managed answers.
- [ ] Fence popup target, physical row, document revision and catalog when selection/capability/lease changes; discard stale or multiple in-flight choices. Close or disable removed targets and pending/reloaded editor instances.
- [ ] Integrate editable Corrections through ticket07's workspace-only action, preserving the typed reason and explicit final save. Admin authoring can inspect the current list; read-only/source-free editors do not activate the popup or load a catalog.
- [ ] Preserve existing table controls, authoring/removal, static dropdowns and other plugin behavior. Coordinate ticket08's binding-removal reconciliation and ticket07's action hook.
- [ ] Prove production popup scalar/table choose-save-reopen and relevant failure/Retry/cancel/protection behavior in the actual pinned editor plus existing HTTP/plugin/UI boundaries. The outside prototype's placement proof alone is not production acceptance.

## Comments

The original native validation menu was shown with2500 synthetic choices. Under normal sheet protection it displayed choices but rejected the selected write. A diagnostic formatting permission allowed a native choice while paste remained blocked, but broadens unrelated sheet permissions and needs extra native capture/session isolation; this path was not adopted. A separate background variation with initOnSelectionChanged and ShowInputHelper demonstrated the accepted adjacent popup. Querying the last Thai item left the locked source cell unchanged. Production integration and complete cancellation remain to implement; no vendor patch or protection relaxation is authorized by this ticket.
