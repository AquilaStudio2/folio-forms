# 06: Keep historical selections attached to their correct table records

**What to build:** A User resumes a table whose project names changed in PDMS and can insert, delete or otherwise use supported row operations without shifting historical validity or selected names onto another record.

**Blocked by:** 04 — Resume and submit unchanged historical project names; 05 — Select and save project names in repeating-table rows.

**Status:** ready-for-agent

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [ ] Extend authoritative saved-name baselines to the same logical table record and Field, using the row mechanism established by the table slice.
- [ ] Preserve unchanged saved row names after upstream rename/removal, while requiring new or replacement row values to be current authorized selections.
- [ ] Inserting, deleting and supported moves/undo/redo either remap selection/history state atomically or reject unsupported changes visibly without partial corruption.
- [ ] A copied value, duplicated row or reused physical cell cannot inherit another record's historical exception merely because its text matches.
- [ ] Prevent delayed selections and replayed operations from applying to a moved, deleted or recreated row after revision changes.
- [ ] Verify saved workbook rows, nested extracted answers and historical provenance remain aligned across Draft save/resume and submission.
- [ ] Demonstrate row-change scenarios using the real editor and HTTP save workflow; retain existing table formatting and unrelated row values on failed operations.
