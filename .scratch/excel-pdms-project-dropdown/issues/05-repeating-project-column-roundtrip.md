# 05: Select and save project names in repeating-table rows

**What to build:** An Admin configures a repeating-table project column with Title/Tag; a User adds rows, selects a project for each row, saves, reopens and submits correct nested table answers.

**Blocked by:** 02 — Author and complete a scalar PDMS project-name Field.

**Status:** claimed

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [ ] Reuse common source and column metadata, generated column Title/Tag defaults, table/column key validation and existing published contract rules.
- [ ] Share the same editor catalog with scalar Fields and other project columns, and reuse the picker architecture rather than introducing a second catalog implementation. The complete outage/Retry slice is separate and does not gate this successful table roundtrip.
- [ ] Keep each managed project cell protected while other input columns and supported row insert/delete actions remain usable.
- [ ] Establish stable row identity or revision-fenced transactional remapping for current picker selections; never rely on an unguarded stale row index.
- [ ] Bind delayed selections to the intended current row/Field/document revision and reject stale targets after insert/delete.
- [ ] Persist correct row-specific names and nested array keys through save/reopen/submit without including helper/catalog data as answers.
- [ ] Demonstrate multiple rows, merged-layout constraints where supported, empty rows and correct row insertion/deletion behavior through HTTP workflow and real editor tests.
- [ ] Keep new source rollout restricted until historical table behaviors in the dependent ticket and all remaining acceptance slices are complete.
