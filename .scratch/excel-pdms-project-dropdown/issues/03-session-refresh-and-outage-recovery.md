# 03: Preserve work across fresh openings, catalog failures and Retry

**What to build:** A User opening or resuming a source-enabled Form gets a fresh list per editor session, can recover from PDMS failures without losing work, and cannot submit until the current session successfully loads its catalog.

**Blocked by:** 02 — Author and complete a scalar PDMS project-name Field.

**Status:** resolved

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [x] Share one successful immutable snapshot across mapped Fields in the active session; no automatic background refresh occurs.
- [x] Reopening or an independently authorized new tab/session loads again; reconnecting the same active session retains its snapshot; a replacement session after expiry fetches afresh.
- [x] Loading failure, timeout or malformed response preserves all answers and permits Draft saving while the picker shows an error and Retry.
- [x] Retry after failure can load a complete snapshot without racing another response, replacing the workbook unexpectedly or using another session's stale cache.
- [x] Disable new project choices while no successful list exists and block submission until that session loads successfully; ordinary inputs remain usable.
- [x] Distinguish successful empty results from failure: required empty Fields remain incomplete, while optional empty Fields follow normal rules.
- [x] Reject expired/cross-document capabilities and stale requests without writing another target, and clean up session state on replacement.
- [x] Prove request counts, data preservation and submission gating at HTTP boundaries, plus visible failure/Retry behavior in the plugin/editor; no source-free or read-only opening fetches.

## Comments

2026-10-30 — Implemented in the isolated `codex/pdms-project-03` worktree based on integration `4d91c70`, with the already approved HTTP/plugin/native TDD seams. Initial Retry HTTP404 and same-lease cross-opening submit202 were reproduced before implementation; both are now correctly scoped. Implementation commits include `ae4a400`, `5281f4b`, `66f9338`, and `bb67239`. Merged the table slice without reverting its picker/selection changes, then merged accepted history integration `cc55444` via `a5898b5`.

Each action capability now signs its returned catalog-session ID. An opening B with a failed list cannot reuse opening A's ready list even when they share a lease. The Retry route verifies the actor, allowed action, active lease, canonical target/document and session before and after the bounded provider request. Concurrent loads share one durable claim; ready snapshots never refresh. Atomic insert-or-ignore avoids a concurrent first-open unique race. Replacement invalidates earlier lease catalogs/loading claims, loads afresh, and delivers catalog metadata through the existing capability-response bridge. The live picker adopts that replacement without a native remount; an in-flight choice from the old session is rejected before posting. Cross-document renewal refuses capability delivery and retains the live editor.

Automated evidence: session HTTP10 cases cover shared/concurrent request counts, fresh openings, timeout/late responses, malformed data, ready-empty, failed-opening submit bypass, unsigned/expired/cross-document capabilities, expired/released lease replacement, source-free edits and read-only Viewer access. Explicit real-office outage HTTP4 cases cover saving ordinary inputs during failure, unchanged workbook bytes through Retry, immutable saved answers, required versus optional empty catalogs, fresh post-submit entry, and failed native capture recovery. New suites are in the explicit standard server HTTP list; native outage execution requires `RUN_PDMS_PROJECT_HTTP=1` and document base port18203. Existing scalar2, initialization/resubmission/preserved-session8, legacy force-save recovery1 and spreadsheet units94 pass. Production plugin248 tests pass. Web build/types pass; full web UI170 pass with `--maxWorkers=1` after an earlier concurrent run hit two unrelated Viewer lookup timing failures. Root formatting/lint scripts pass.

Root alone verified actual pinned ONLYOFFICE9.4 UI: visible failed load + disabled search + Retry; ordinary D1/D3 edits; Submit blocked; Draft save during outage; actual Retry recovered2500 synthetic names in the same editor without losing an unsaved note; the exact historical project remained; Submit succeeded and the existing automatic new-entry flow opened ready with blank A1 and a fresh catalog. Independent public immutable JSON and downloaded XLSX match the exact project name, both notes and stable Tags. Evidence: `/tmp/folio-pdms-implementation/notes/native-03-04-acceptance.md`, `artifacts/03-outage-submitted.xlsx`, and `artifacts/03-new-entry-success.png` under the same implementation directory. No worker browser action occurred.

The first native fixture had a callback-origin mistake that rejected capture. Retrying that failed capture then exposed a stale canonical fallback that dropped native notes. This is retained as failure evidence, not relabelled a successful recovery. A separate public RED→GREEN regression now rejects a later no-change fallback after a failed source capture and keeps the editor available until a fresh native capture succeeds. This guard and replacement-catalog propagation were verified automatically after root's normal outage proof; they were not separately rerun in the actual editor. Native provider counts were not instrumented; exact counts are proven at HTTP boundaries. Physical IME/drag checks were not newly performed. Owned native03 listeners were stopped after root finished; isolated fixture/access/artifacts remain private/reproducible. Production enablement remains false; no push, deployment or PR occurred.
