# 07: Edit Corrections with current choices and preserve read-only results

**What to build:** An Admin edits scalar and table project values through the Correction workflow using current choices or unchanged historical names, while Users/Viewers opening saved results see immutable content without catalog requests.

**Blocked by:** 03 — Preserve work across fresh openings, catalog failures and Retry; 06 — Keep historical selections attached to their correct table records.

**Status:** resolved

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [x] Editable Correction opening establishes its own fresh authorized catalog snapshot and uses existing submitted-state/lease/capability checks.
- [x] Apply picker-only protection and target/history validation to scalar and table correction values; retain the reason and existing Correction lifecycle.
- [x] An upstream failure permits recovery without rewriting the original Submission and blocks persisting a new Correction until this session loads successfully.
- [x] A valid Correction stores matching workbook/data and preserves the original Submission and prior Correction history.
- [x] Read-only result previews and available saved-result exports reflect persisted answers without loading the project source or acquiring write capabilities.
- [x] Reject Viewer mutation attempts, cross-Submission selection operations and stale Correction targets, including a Response reopened for editing.
- [x] Demonstrate one scalar/table Correction and one read-only viewing flow at the HTTP and actual editor boundaries, including history and permission assertions.

## Comments

Implementation adds a distinct `save-correction-workspace` action at the existing XLSX force-save/callback boundary. Picker previews rotate only the current lease workspace artifact/key and its signed catalog scope, preserving immutable base revision/document key. They accept unfinished ordinary required inputs and create no Correction/audit history. Only explicit reasoned final Save creates one immutable Correction against the effective Submission baseline. Request creation and callback completion recheck current Admin, matching lease/workspace, submitted state, latest Submission and immutable base; scalar/table targets resolve from the saved workspace's trusted physical cells and existing row document fence. Correction row insertion/deletion policy is unchanged.

Public HTTP plus actual pinned docbuilder acceptance covers multiple scalar/table previews yielding zero Corrections, one explicit final Correction with matching JSON/XLSX, unchanged original and prior Correction bytes, failed catalog/Retry, stale/foreign/previous-Submission targets, reopening during a held callback, role revocation during capture, and readonly user/Viewer exports with zero source loads or write capabilities. The suite is registered in the standard `test:http` list (`RUN_PDMS_CORRECTION_HTTP=1` enables its real-engine cases). Plugin and route UI tests verify native save barriers and reason/opening preservation through preview reload.

The first actual native preview failed before HTTP because the parent attachment-POC check omitted the new preview action. A production-scope window-message regression reproduced the exact failure, then passed after the narrow Correction-only check allowlist fix; pending-file blocking and Correction file-edit prohibition remain. The failed preview created zero Corrections and retained original bytes/data. Root subsequently completed the joint native acceptance in ticket09’s accepted adjacent-cell popup fixture, as recorded below. The accepted adjacent-cell popup is separate ticket09. No production enable, push, deployment or PR is included.

Root accepted the actual combined 07/09 workflow on ONLYOFFICE 9.4.0.1 (ticket09 runtime `bdc248f`). Opening the historical Correction established a fresh catalog, provider count5→6. Two adjacent-cell selections changed scalarA1 to `โครงการปัจจุบัน 0010` and sourceA at physicalrow7 to `โครงการปัจจุบัน 0020`. Both workspace reloads retained reason `UI09 ตรวจสอบชื่อโครงการ`, ordinaryD1 `UI09 corrected required note`, C5 `UI09 historical record A edited`, and the exact removed historical name at A5/B7. The independent public pre-final audit confirmed only originalrevision0, zero Corrections, unchanged original JSON/XLSX SHA, intact protection and no extra provider requests (6→6).

Root then clicked the explicit final Save once. Public final JSON and XLSX agree on those scalar/table/ordinary values and contain exactly one new Correction, revision1, with the retained reason. Original Submission bytes/data remain unchanged; source cells remain locked and ordinary input cells unlocked. Actual Viewer opening showed read-only mode with no project popup, creator or Correction write control, and provider requests remained6→6; independent Viewer exports matched the saved final values and immutable original. Root closed its sole owned proof tab, verified it gone and reset CUA. Evidence: `/tmp/folio-pdms-implementation/notes/native-09-combined-acceptance.md`, artifacts `09-correction-previews.json/.xlsx`, `09-correction-final.json/.xlsx`, `09-viewer-final.json/.xlsx`, `09-correction-two-previews.png` and `09-viewer-readonly.png`. The final-save/Viewer completion was explicitly confirmed by root and is corroborated by the final audit artifacts; the combined note's earlier in-progress paragraphs remain chronological evidence.

This resolves ticket07's Correction and read-only acceptance. The first POC failure and production-scope regression fix `1115105` remain part of the evidence. Physical IME composition and mouse fill-handle dragging were not exercised; deterministic composition/protection tests and actual native Thai-query evidence remain separate. The popup's dark-theme contrast follow-up belongs to the final review work, not a claimed ticket07 fix. No push, deployment or production source enable occurred.
