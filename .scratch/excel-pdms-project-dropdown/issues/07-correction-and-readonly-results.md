# 07: Edit Corrections with current choices and preserve read-only results

**What to build:** An Admin edits scalar and table project values through the Correction workflow using current choices or unchanged historical names, while Users/Viewers opening saved results see immutable content without catalog requests.

**Blocked by:** 03 — Preserve work across fresh openings, catalog failures and Retry; 06 — Keep historical selections attached to their correct table records.

**Status:** claimed

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [ ] Editable Correction opening establishes its own fresh authorized catalog snapshot and uses existing submitted-state/lease/capability checks.
- [ ] Apply picker-only protection and target/history validation to scalar and table correction values; retain the reason and existing Correction lifecycle.
- [ ] An upstream failure permits recovery without rewriting the original Submission and blocks persisting a new Correction until this session loads successfully.
- [ ] A valid Correction stores matching workbook/data and preserves the original Submission and prior Correction history.
- [ ] Read-only result previews and available saved-result exports reflect persisted answers without loading the project source or acquiring write capabilities.
- [ ] Reject Viewer mutation attempts, cross-Submission selection operations and stale Correction targets, including a Response reopened for editing.
- [ ] Demonstrate one scalar/table Correction and one read-only viewing flow at the HTTP and actual editor boundaries, including history and permission assertions.
