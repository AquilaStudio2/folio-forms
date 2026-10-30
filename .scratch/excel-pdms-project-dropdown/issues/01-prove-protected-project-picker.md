# 01: Prove searchable selection into protected project cells

**What to build:** Demonstrate a User searching a controlled project-name catalog, choosing a result for a protected scalar/merged cell and a representative table cell, and saving/reopening the correct value while direct entry stays blocked. This is a bounded prototype and feasibility gate, not a promise of native-popup customization.

**Blocked by:** None (can start immediately).

**Status:** claimed

Type: prototype

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [ ] Use the pinned real ONLYOFFICE editor; compare a supported native route with the already authorized custom picker, and select a demonstrated supported approach.
- [ ] Drive one authorized selection through Folio's operation boundary and verify the saved workbook and extracted name agree; a controlled fake catalog and minimal test-only metadata are sufficient.
- [ ] Demonstrate Thai/IME query entry, keyboard navigation, cancellation and reachable results in a representative long list without committing query text.
- [ ] Block typing, formula-bar edits, valid-name paste, mixed-range paste and autofill into managed cells while other normal inputs remain usable.
- [ ] Demonstrate a safe protected-write path, merged-cell targeting and representative row insertion; do not expose protection credentials or temporarily unlock project cells.
- [ ] Determine whether direct live writes work; if safe save/reload is required, demonstrate unsaved-work preservation and document the interaction.
- [ ] Record supported APIs, representative latency/list size, actual executed checks and limitations. An unproven or failing path is reported as a blocker, not a passed gate.

## Comments

- 2026-10-30: Claimed on `codex/pdms-project-01`. Confirmed clean ancestry from integration `1a4bf05`. Test seams are user-approved: HTTP operation workflow, real pinned ONLYOFFICE/plugin UI, and existing plugin harness. CodeGraph reports no index in this worktree; following its instructed built-in-tool fallback.

- 2026-10-30 prototype progress: real 9.4.0.1 editor `ApiRange.SetValue` into locked merged A1:B1 returned false and left the cell empty. The supported custom panel is the demonstrated search route; no native-popup hook or browser protection credential is used. The authorized fallback freezes through existing `createOffice.freezeEditor`, requests `saveDocumentCommand`, waits for native save acknowledgement, preserves the full native artifact, overlays server-authorized names and runs Folio's real Draft operation/export workflow. Its server-private final protection adapter is prototype-only; production must integrate the operation atomically in later tickets.
- Red/green: HTTP authorization initially returned404 instead of401; now401/422/200/409 cases pass. An early native fallback lost unsaved notes, so stale snapshot acceptance was corrected rather than counted as a passed gate. Root subsequently verified before-pick C1=`unsaved scalar root`, B4=`unsaved row root`, then saved/reloaded merged2499 with both values retained. Root also observed native protection warnings for direct typing and valid-name paste, retaining2499. Root's tab was closed immediately; no test windows are left open.
- A later native save exposed an existing merged-input bug: canonical XLSX contains subordinate B1:null, and writing it after A1 clears A1:B1. A public HTTP consecutive scalar-to-table regression reproduced scalar=null, then the minimal `prepareSpreadsheetOperation` fix skips merged-interior cells. Current HTTP tests:4 pass/42 assertions, using the real pinned HTTP builder and Folio operations/storage/exports while explicitly supplying only the external forceSave transport. They prove consecutive selections, stale-save rejection, row insertion and exported locked-project/unlocked-normal-input policy. They do not substitute for remaining native UI checks.
- Plugin harness:2 new tests/7 assertions prove IME composition handling, no selection on composing Enter or cancellation, Thai substring access to the final of2,500 names, keyboard active option and complete paging. Full plugin suite240 pass/1,155 assertions; existing spreadsheet suite94 pass/276 assertions. Root formatting/lint and server TypeScript checks pass. Remaining native table-target and formula-bar/mixed-paste/autofill checks remain unclaimed until root's coordinated single-tab verification; physical IME has not been exercised. Reusable credential-free findings/run notes: `/tmp/folio-pdms-implementation/notes/prototype.md`.
