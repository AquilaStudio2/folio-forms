# 02: Author and complete a scalar PDMS project-name Field

**What to build:** An Admin creates a scalar or complete merged-cell project Field with normal Title/Tag, saves and publishes the Form; a User opens it, searches current PDMS names, chooses one, saves a Draft and submits consistent workbook/data.

**Blocked by:** 01 — Prove searchable selection into protected project cells.

**Status:** ready-for-human

Review state: Unpublished draft awaiting test-boundary and breakdown approval. After approval, publish as ready-for-agent. Do not implement from this review draft.

- [ ] Add the source through shared Field metadata with existing Title/Tag defaults, editing, uniqueness and stable binding identity; keep Excel Binding placement-only.
- [ ] Provide an authenticated backend PDMS adapter using a server-held credential and validate the current upstream contract. Only authorized source-enabled editor openings trigger it.
- [ ] Offer all nonblank names from that contract, collapse identical names and retain deterministic order; do not add project IDs, subsets or new upstream filters.
- [ ] One successful session catalog serves all mapped scalar Fields. Initial choices load per opening independently of one-time Response initialization.
- [ ] Use the proven picker/protected-write route; persist trusted selection operations bound to the current source, Field, document and revision. Membership alone cannot prove selection.
- [ ] Demonstrate Draft save/reopen and submission with only the selected name under the configured Tag, keeping workbook and extracted data consistent.
- [ ] Preserve ordinary static dropdowns and existing publication rules; do not expose partial feature rollout beyond development/test usage.
- [ ] Exercise the successful Admin-to-User HTTP workflow and real-editor path, register feature HTTP cases in the standard suite command, and run relevant existing authoring/protection regressions.
