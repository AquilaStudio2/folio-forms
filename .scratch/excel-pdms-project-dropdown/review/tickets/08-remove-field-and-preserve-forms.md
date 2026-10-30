# 08: Remove project Fields safely and preserve existing Form behavior

**What to build:** An Admin removes a scalar project Field or a table-column mapping using the normal Template Draft action, keeping visible contents/layout while removing its Title/Tag extraction and source management; existing Forms retain their behavior.

**Blocked by:** 05 — Select and save project names in repeating-table rows.

**Status:** ready-for-human

Review state: Unpublished draft awaiting test-boundary and breakdown approval. After approval, publish as ready-for-agent. Do not implement from this review draft.

- [ ] Reuse Admin's existing removal operation and save/recovery barrier; require current authoring capability, active lease and revision.
- [ ] Remove the mapping, Title/Tag configuration, source, picker state, managed anchors and native dropdown/validation for that Field.
- [ ] Reconcile only source-managed protection and selection state; preserve cell text, borders, formatting, unrelated protection, custom names and validation.
- [ ] Removing a table-column mapping keeps its physical worksheet column; removing the table mapping cleans its project-column management without deleting worksheet rows.
- [ ] Save and reopen the Template Draft to demonstrate removal remains effective and the removed Field is absent from extracted data after publication.
- [ ] Preserve Published Template immutability: modifying published structure requires duplication and does not rewrite prior Responses or Submissions.
- [ ] No User Clear-answer button or automatic conversion into a mapped text Field is introduced.
- [ ] Exercise visible Admin removal plus HTTP persistence and failure recovery, and run relevant static-dropdown, shared-Field, helper-storage, Prefill and publication regressions.
