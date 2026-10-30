# 07: Edit Corrections with current choices and preserve read-only results

**What to build:** An Admin edits scalar and table project values through the Correction workflow using current choices or unchanged historical names, while Users/Viewers opening saved results see immutable content without catalog requests.

**Blocked by:** 03 — Preserve work across fresh openings, catalog failures and Retry; 06 — Keep historical selections attached to their correct table records.

**Status:** claimed

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [x] Editable Correction opening establishes its own fresh authorized catalog snapshot and uses existing submitted-state/lease/capability checks.
- [x] Apply picker-only protection and target/history validation to scalar and table correction values; retain the reason and existing Correction lifecycle.
- [x] An upstream failure permits recovery without rewriting the original Submission and blocks persisting a new Correction until this session loads successfully.
- [x] A valid Correction stores matching workbook/data and preserves the original Submission and prior Correction history.
- [x] Read-only result previews and available saved-result exports reflect persisted answers without loading the project source or acquiring write capabilities.
- [x] Reject Viewer mutation attempts, cross-Submission selection operations and stale Correction targets, including a Response reopened for editing.
- [ ] Demonstrate one scalar/table Correction and one read-only viewing flow at the HTTP and actual editor boundaries, including history and permission assertions.

## Comments

Implementation adds a distinct `save-correction-workspace` action at the existing XLSX force-save/callback boundary. Picker previews rotate only the current lease workspace artifact/key and its signed catalog scope, preserving immutable base revision/document key. They accept unfinished ordinary required inputs and create no Correction/audit history. Only explicit reasoned final Save creates one immutable Correction against the effective Submission baseline. Request creation and callback completion recheck current Admin, matching lease/workspace, submitted state, latest Submission and immutable base; scalar/table targets resolve from the saved workspace's trusted physical cells and existing row document fence. Correction row insertion/deletion policy is unchanged.

Public HTTP plus actual pinned docbuilder acceptance covers multiple scalar/table previews yielding zero Corrections, one explicit final Correction with matching JSON/XLSX, unchanged original and prior Correction bytes, failed catalog/Retry, stale/foreign/previous-Submission targets, reopening during a held callback, role revocation during capture, and readonly user/Viewer exports with zero source loads or write capabilities. The suite is registered in the standard `test:http` list (`RUN_PDMS_CORRECTION_HTTP=1` enables its real-engine cases). Plugin and route UI tests verify native save barriers and reason/opening preservation through preview reload.

Actual native-editor acceptance is pending root-only proof from the frozen isolated native07 fixture; the final checkbox and Status remain pending until that evidence. The accepted adjacent-cell popup is separate ticket09. No production enable, push, deployment or PR is included.
