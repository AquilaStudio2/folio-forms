# Spec and ticket publication review

Status: ready-for-human

The agreed product requirements remain unchanged. This review package reformats them with the to-spec template and prepares separate vertical-slice ticket drafts. These are review artifacts, not published ready-for-agent issues.

- [Spec](spec.md)
- Proposed tests: existing HTTP workflow as the primary boundary; actual ONLYOFFICE/plugin interaction as the necessary complementary boundary for search/protection. Existing plugin harnesses support deterministic UI and revision behavior.
- Approval needed under the explicitly invoked skills: to-spec asks to check the testing boundaries; to-tickets requires approval of granularity, blockers and merges/splits before publication. No further product interview is proposed.
- After approval: publish the reviewed spec at the feature's canonical spec location, each ticket separately in the configured local issues directory, set ready-for-agent, and link the execution frontier from the feature map. Preserve this package as review history.

## Proposed breakdown

| Ticket | Delivers | Blocked by |
| --- | --- | --- |
| [01: Prove searchable selection into protected project cells](tickets/01-prove-protected-project-picker.md) | Demonstrate a User searching a controlled project-name catalog, choosing a result for a protected scalar/merged cell and a representative table cell, and saving/reopening the correct value while direct entry stays blocked. | None (can start immediately). |
| [02: Author and complete a scalar PDMS project-name Field](tickets/02-scalar-project-field-roundtrip.md) | An Admin creates a scalar or complete merged-cell project Field with normal Title/Tag, saves and publishes the Form; a User opens it, searches current PDMS names, chooses one, saves a Draft and submits consistent workbook/data. | 01 — Prove searchable selection into protected project cells. |
| [03: Preserve work across fresh openings, catalog failures and Retry](tickets/03-session-refresh-and-outage-recovery.md) | A User opening or resuming a source-enabled Form gets a fresh list per editor session, can recover from PDMS failures without losing work, and cannot submit until the current session successfully loads its catalog. | 02 — Author and complete a scalar PDMS project-name Field. |
| [04: Resume and submit unchanged historical project names](tickets/04-saved-name-history.md) | A User reopens a saved scalar answer after PDMS renames or removes its name and can keep and submit that exact saved answer, or select a replacement from the new session list. | 02 — Author and complete a scalar PDMS project-name Field. |
| [05: Select and save project names in repeating-table rows](tickets/05-repeating-project-column-roundtrip.md) | An Admin configures a repeating-table project column with Title/Tag; a User adds rows, selects a project for each row, saves, reopens and submits correct nested table answers. | 02 — Author and complete a scalar PDMS project-name Field. |
| [06: Keep historical selections attached to their correct table records](tickets/06-table-history-and-row-changes.md) | A User resumes a table whose project names changed in PDMS and can insert, delete or otherwise use supported row operations without shifting historical validity or selected names onto another record. | 04 — Resume and submit unchanged historical project names; 05 — Select and save project names in repeating-table rows. |
| [07: Edit Corrections with current choices and preserve read-only results](tickets/07-correction-and-readonly-results.md) | An Admin edits scalar and table project values through the Correction workflow using current choices or unchanged historical names, while Users/Viewers opening saved results see immutable content without catalog requests. | 03 — Preserve work across fresh openings, catalog failures and Retry; 06 — Keep historical selections attached to their correct table records. |
| [08: Remove project Fields safely and preserve existing Form behavior](tickets/08-remove-field-and-preserve-forms.md) | An Admin removes a scalar project Field or a table-column mapping using the normal Template Draft action, keeping visible contents/layout while removing its Title/Tag extraction and source management; existing Forms retain their behavior. | 05 — Select and save project names in repeating-table rows. |

## Edges and initial frontier

Only 01 can start initially. Then 02 provides the first production-shaped scalar roundtrip. Tickets 03, 04 and 05 can proceed independently after 02. Ticket 06 needs scalar historical policy from 04 and row/selection behavior from 05. Ticket 07 needs outage/session handling from 03 and the completed table/history behavior from 06. Ticket 08 needs the table source from 05 to demonstrate removal for both scalar and table targets; it does not depend on Corrections or historical provenance.

There is no separate horizontal schema/API/UI ticket and no speculative prefactor. Every behavior ticket includes its own integration tests. The first ticket is a verifiable prototype gate; the source remains unexposed until all acceptance slices are complete. Technical feasibility is not asserted merely because a ticket draft exists.
