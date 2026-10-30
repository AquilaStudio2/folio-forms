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
