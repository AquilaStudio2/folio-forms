# 08: Remove project Fields safely and preserve existing Form behavior

**What to build:** An Admin removes a scalar project Field or a table-column mapping using the normal Template Draft action, keeping visible contents/layout while removing its Title/Tag extraction and source management; existing Forms retain their behavior.

**Blocked by:** 05 — Select and save project names in repeating-table rows.

**Status:** claimed

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [ ] Reuse Admin's existing removal operation and save/recovery barrier; require current authoring capability, active lease and revision.
- [ ] Remove the mapping, Title/Tag configuration, source, picker state, managed anchors and native dropdown/validation for that Field.
- [ ] Reconcile only source-managed protection and selection state; preserve cell text, borders, formatting, unrelated protection, custom names and validation.
- [ ] Removing a table-column mapping keeps its physical worksheet column; removing the table mapping cleans its project-column management without deleting worksheet rows.
- [ ] Save and reopen the Template Draft to demonstrate removal remains effective and the removed Field is absent from extracted data after publication.
- [ ] Preserve Published Template immutability: modifying published structure requires duplication and does not rewrite prior Responses or Submissions.
- [ ] No User Clear-answer button or automatic conversion into a mapped text Field is introduced.
- [ ] Exercise visible Admin removal plus HTTP persistence and failure recovery, and run relevant static-dropdown, shared-Field, helper-storage, Prefill and publication regressions.

## Comments

Implementation reuses the existing metadata transaction, native snapshot rollback/recovery, lease/revision authorization and immediate preserved-session Template Draft save. Source is now part of uncertain-write verification; a verification result with different source management cannot authorize further editing. Confirmed binding changes rebuild only the picker wrapper and clear its catalog when no source remains. A catalog Retry returning after the last source was removed is rejected. The durable opening snapshot remains bounded by its ordinary expiry, preserving an unchanged catalog if the Admin re-adds a source during the same opening.

Removal clears mapped table-column offsets without deleting worksheet columns or rows; source removal preserves custom number formats. Existing native commands retain their snapshot/rollback path. Publication now preserves validation outside current mappings, splits surviving validation references, and retains custom names and referenced helper data instead of replacing the helper worksheet. Matching immutable option lists are reused. An uncertain relative custom formula crossing a mapping is rejected before changing the saved artifact if splitting would change its origin; the normal native authoring commands already split/translate those rules.

TDD evidence: the authoring harness first exposed source-insensitive recovery and a stale preview after removal; pinned 9.4 first exposed whole-table validation clearing; public HTTP first exposed unrelated validation/helper loss at publication and a Retry finishing after last-source removal. Each failing behavior was then implemented through its existing approved seam. The HTTP suite is registered in the explicit `test:http` command and covers failed checkpoint capture/retry, source/Tag removal after reopen/publication, physical layout retention, source-free opening/Retry rejection, ordinary dropdown submission, duplication and immutable original artifacts/results. The native command harness verifies preserved text, custom names, unmapped-column validation and date formatting.

Current checks: spreadsheet unit 94 pass; plugin 250 pass; existing authoring/column/initialization/preserved-session/scalar/session HTTP 41 pass; web UI 170 pass; pinned workbook runtime 38 pass plus one unrelated HTTP-builder opt-in skip; web build, root formatting/lint and typecheck pass. The complete removal HTTP opt-in and final compatibility check are rerun after the last change. Actual Admin UI removal is pending root-only verification in a separate isolated fixture. The user accepted the cell-adjacent dropdown as a separate final interaction slice (09); that integration does not add native worksheet helper artifacts. The production source switch remains false.
