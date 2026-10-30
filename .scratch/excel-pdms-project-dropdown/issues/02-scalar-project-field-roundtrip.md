# 02: Author and complete a scalar PDMS project-name Field

**What to build:** An Admin creates a scalar or complete merged-cell project Field with normal Title/Tag, saves and publishes the Form; a User opens it, searches current PDMS names, chooses one, saves a Draft and submits consistent workbook/data.

**Blocked by:** 01 — Prove searchable selection into protected project cells.

**Status:** claimed

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [x] Add the source through shared Field metadata with existing Title/Tag defaults, editing, uniqueness and stable binding identity; keep Excel Binding placement-only.
- [x] Provide an authenticated backend PDMS adapter using ONGOING_API_URL and X_ONGOING_SECRET, calling api/pages/projects/names-and-doc-numbers with ongoing-secret-token. Validate the current upstream contract, keep credentials server-only, and wire the exact variable names into server configuration/example docs. Only authorized source-enabled editor openings trigger it.
- [x] Offer all nonblank names from that contract, collapse identical names and retain deterministic order; do not add project IDs, subsets or new upstream filters.
- [x] One successful session catalog serves all mapped scalar Fields. Initial choices load per opening independently of one-time Response initialization.
- [x] Use the proven picker/protected-write route; persist trusted selection operations bound to the current source, Field, document and revision. Membership alone cannot prove selection.
- [x] Demonstrate Draft save/reopen and submission with only the selected name under the configured Tag, keeping workbook and extracted data consistent.
- [x] Preserve ordinary static dropdowns and existing publication rules; do not expose partial feature rollout beyond development/test usage.
- [ ] Exercise the successful Admin-to-User HTTP workflow and real-editor path, register feature HTTP cases in the standard suite command, and run relevant existing authoring/protection regressions.

## Comments

- 2026-10-30: Claimed after ticket01 integration51d9f18 by a fresh TDD implementer in the dedicated ticket02 worktree. User resumed after changing model. Exact PDMS configuration remains ONGOING_API_URL/X_ONGOING_SECRET. Canonical scalar authoring, source sessions, authorized picker saves and atomic callback completion are the scope; no deployment or worker-owned browser surfaces are permitted. Test boundaries and graph were already approved.

- 2026-10-30 — Scalar implementation in `codex/pdms-project-02` (foundation `e4fecd4`, follow-up pending) uses additive common Field `source`, unchanged placement bindings and existing Title/Tag lifecycle. Exact `ONGOING_API_URL` / `X_ONGOING_SECRET` names are validated and documented, with server-only `ongoing-secret-token` access, bounded response/timeout, exact-name deduplication and retained provider order.
- TDD evidence: public authoring initially returned HTTP400, now saves/reopens stable Title/Tag/source; editor config initially omitted the catalog, now returns one durable immutable catalog per logical opening and refreshes on a separate opening/replaced lease. Real pinned-engine HTTP workflow initially extracted a null selected answer, now publishes, opens, selects a complete merged field, preserves an unsaved ordinary input, saves/reloads, selects another scalar without erasing the first, and submits matching workbook/data. A template example initially became a new Response answer; initialization now clears managed scalar examples. A callback containing a current catalog name without picker provenance fails and leaves the saved workbook/data/document/session unchanged.
- Plugin/UI TDD: source option initially absent, now preserves identity/Title/Tag; picker search initially absent, now commits through the existing freeze→native-save acknowledgement→capability→Operation flow. Successful source saves keep editing frozen until controlled reload; failures restore the current instance and allow retry. Thai composition, keyboard navigation, cancellation and all 2,500 synthetic results are exercised in the existing plugin seam. Web opening identity initially absent, now survives capability renewal and controlled document remount while a real reopen receives a new nonce.
- Executed checks: root `bun run fix` and `bun run check` PASS; root typecheck PASS after web build; spreadsheet unit 94 PASS; plugin 244 PASS; web UI 166 PASS; existing authoring/column/initialization HTTP 27 PASS; scalar source HTTP 2 PASS (25 assertions). Explicit real-office HTTP opt-in 1 PASS (52 assertions), using an isolated database/bucket and own API listener on18202. Pinned native workbook runtime 37 PASS, 1 unrelated engine-HTTP case skipped; the dedicated source HTTP opt-in did execute. No shared demo data, browser tabs, deployment or real provider names were used.
- Acceptance remains pending the root agent's brief actual production-plugin UI proof. Harness and builder evidence are not recorded as that UI proof. Catalog Retry/reliability, expanded history/Correction behavior, table provenance and removal remain owned by later tickets. Production source exposure remains disabled by default; `PDMS_PROJECT_NAME_SOURCE_ENABLED=false` must remain until the complete graph is accepted.
