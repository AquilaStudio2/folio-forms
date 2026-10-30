# 03: Preserve work across fresh openings, catalog failures and Retry

**What to build:** A User opening or resuming a source-enabled Form gets a fresh list per editor session, can recover from PDMS failures without losing work, and cannot submit until the current session successfully loads its catalog.

**Blocked by:** 02 — Author and complete a scalar PDMS project-name Field.

**Status:** ready-for-human

Review state: Unpublished draft awaiting test-boundary and breakdown approval. After approval, publish as ready-for-agent. Do not implement from this review draft.

- [ ] Share one successful immutable snapshot across mapped Fields in the active session; no automatic background refresh occurs.
- [ ] Reopening or an independently authorized new tab/session loads again; reconnecting the same active session retains its snapshot; a replacement session after expiry fetches afresh.
- [ ] Loading failure, timeout or malformed response preserves all answers and permits Draft saving while the picker shows an error and Retry.
- [ ] Retry after failure can load a complete snapshot without racing another response, replacing the workbook unexpectedly or using another session's stale cache.
- [ ] Disable new project choices while no successful list exists and block submission until that session loads successfully; ordinary inputs remain usable.
- [ ] Distinguish successful empty results from failure: required empty Fields remain incomplete, while optional empty Fields follow normal rules.
- [ ] Reject expired/cross-document capabilities and stale requests without writing another target, and clean up session state on replacement.
- [ ] Prove request counts, data preservation and submission gating at HTTP boundaries, plus visible failure/Retry behavior in the plugin/editor; no source-free or read-only opening fetches.
