# 05: Select and save project names in repeating-table rows

**What to build:** An Admin configures a repeating-table project column with Title/Tag; a User adds rows, selects a project for each row, saves, reopens and submits correct nested table answers.

**Blocked by:** 02 — Author and complete a scalar PDMS project-name Field.

**Status:** claimed

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [x] Reuse common source and column metadata, generated column Title/Tag defaults, table/column key validation and existing published contract rules.
- [x] Share the same editor catalog with scalar Fields and other project columns, and reuse the picker architecture rather than introducing a second catalog implementation. The complete outage/Retry slice is separate and does not gate this successful table roundtrip.
- [ ] Keep each managed project cell protected while other input columns and supported row insert/delete actions remain usable.
- [x] Establish stable row identity or revision-fenced transactional remapping for current picker selections; never rely on an unguarded stale row index.
- [x] Bind delayed selections to the intended current row/Field/document revision and reject stale targets after insert/delete.
- [x] Persist correct row-specific names and nested array keys through save/reopen/submit without including helper/catalog data as answers.
- [ ] Demonstrate multiple rows, merged-layout constraints where supported, empty rows and correct row insertion/deletion behavior through HTTP workflow and real editor tests.
- [x] Keep new source rollout restricted until historical table behaviors in the dependent ticket and all remaining acceptance slices are complete.

## Comments

- 2026-10-30: Implemented on `codex/pdms-project-05`, initially based on integration `4d91c70`. TDD first exposed table template examples leaking into fresh Response answers; source-managed table cells are now initialized empty. The next public real-engine HTTP test failed with400 for a row selection, then passed after adding strict physical-row targets fenced by document key. The plugin harness independently failed because no table row picker existed, then passed with shared scalar/column targets and a labelled physical-row selector.
- Table selections carry stable column binding ID and `{index,documentKey}`. Server resolves the saved artifact's column/body and row bounds at request and callback time; source membership never proves picker origin. Selection plus row mutation is rejected. Existing canonical row actions shift/delete saved values together and clear newly inserted inputs; Response artifact/JSON/document key and catalog scope advance in the same completion transaction. Historical row authority is the saved physical workbook row, never the compact extracted-array ordinal.
- Executed native-service HTTP opt-in: `RUN_PDMS_TABLE_HTTP=1` with an isolated migrated database/private bucket and builder listener18205. Four tests passed, including configured column Title/Tag/publication, numeric-looking exact strings, omitted empty rows, consecutive scalar/two-column choices, preserved ordinary unsaved inputs, insert/delete remapping, delayed target rejection, and callback valid-name tampering rejection with exact saved bytes/data/revision retained. Exported native XLSX styles keep every source scalar/table cell locked and ordinary inputs unlocked after row changes. Suite registered in explicit `test:http`; its opt-in is documented in README.
- Appropriate checks passed: spreadsheet unit94, plugin246, related HTTP35, root formatting/lint, workspace types and web build. Full web UI run produced166passes and two unrelated Viewer timeouts during parallel CPU load; isolated Viewer rerun passed38/38. Runtime HTTP polling assertion counts vary with machine load. No worker browser actions occurred. Root actual editor proof is pending, so this ticket remains claimed and the two native acceptance boxes remain unchecked.
- Source production flag remains false. Stable interface/06 handoff: `/tmp/folio-pdms-implementation/notes/05-interfaces.md`. Complete merged scalar Fields are exercised; repeating-table body merges remain rejected by the existing contract. Unsupported native structure/move/undo cannot establish a new persisted mapping.
