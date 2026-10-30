# 06: Keep historical selections attached to their correct table records

**What to build:** A User resumes a table whose project names changed in PDMS and can insert, delete or otherwise use supported row operations without shifting historical validity or selected names onto another record.

**Blocked by:** 04 — Resume and submit unchanged historical project names; 05 — Select and save project names in repeating-table rows.

**Status:** claimed

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [x] Extend authoritative saved-name baselines to the same logical table record and Field, using the row mechanism established by the table slice.
- [x] Preserve unchanged saved row names after upstream rename/removal, while requiring new or replacement row values to be current authorized selections.
- [x] Inserting, deleting and supported moves/undo/redo either remap selection/history state atomically or reject unsupported changes visibly without partial corruption.
- [x] A copied value, duplicated row or reused physical cell cannot inherit another record's historical exception merely because its text matches.
- [x] Prevent delayed selections and replayed operations from applying to a moved, deleted or recreated row after revision changes.
- [x] Verify saved workbook rows, nested extracted answers and historical provenance remain aligned across Draft save/resume and submission.
- [ ] Demonstrate row-change scenarios using the real editor and HTTP save workflow; retain existing table formatting and unrelated row values on failed operations.

## Comments

- 2026-10-30: Built on integration `5931d9c`. The existing protected saved-artifact baseline and document-revision-fenced canonical row operations from02/04/05 already implement this slice's authority; no persistent row model or production fix was needed. Historical values come from the saved physical workbook row and stable Field, never the compact JSON array ordinal, which skips empty input rows.
- Added `apps/server/test/http/pdms-project-table-history.test.ts` to the standard explicit HTTP suite list. Opt-in `RUN_PDMS_TABLE_HISTORY_HTTP=1` exercises public start/editor-config/picker/Draft save/resume/submit/exports with an isolated migrated DB/private bucket, external fake provider/callback source and actual pinned9.4 docbuilder on owned18206. It verifies exact old names including spaces across physical empty-row gaps, upstream rename/removal and successful empty catalogs; canonical middle insertion/first deletion; blank inserted/source prototype inputs; sole-row deletion/reused cells; JSON/XLSX alignment and formatting; a later genuine table Submission with immutable original bytes/data.
- Public failure cases cover copies to another row/Field, duplicated rows, record swaps, changed native body insert/delete/move ranges, old native cell/range undo, delayed physical-row choices and stale capabilities. Failed operations retain exact artifact/data/documentKey/catalog scope and provide public error messages; current legitimate selection recovers ordinary pending values. Consumed callbacks acknowledge idempotent replay without applying old state to a new revision. These callback/save-boundary cases are automated evidence, not claims that the worker physically performed native drag/move/undo.
- Regression sensitivity was checked by temporarily removing only the table source exclusion from `spreadsheetInputRanges`: the new copy case failed because an unauthorized historical copy completed. Restored the existing guard byte-for-byte, then the complete suite passed. This is mutation verification of an existing safeguard, not a claimed new production implementation.
- Root formatting/lint, workspace types, web build and spreadsheet unit94 passed. The fixture's initially inferred UUID-only opening argument was explicitly annotated as string for types, without changing runtime behavior. Root owns the final actual visible historical-row proof; its economical private fixture and independent public export verifier are documented in `/tmp/folio-pdms-implementation/notes/06-history.md`. No worker browser/CUA/UI activity occurred.05's actual native row-change evidence remains available; the checkbox above waits for root's historical-row acceptance.
- Production source flag remains false. The newer in-cell-arrow requirement remains separate outstanding UI acceptance; these historical-row regressions do not resolve that interaction. No push, deployment or PR was performed.07's target-specific Correction baseline handoff is `/tmp/folio-pdms-implementation/notes/06-history.md`.
