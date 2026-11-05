# 01 Download the current Excel response

Status: resolved

## What to build

Implement the two Excel Fill Download buttons defined in the [spec](../spec.md). Both formats use the workbook open in the editor at click time. The PDF uses Folio's existing conversion behavior for that workbook.

## Blocked by

None. The isolated browser probe on ONLYOFFICE 9.4 confirmed that completing the active cell edit before capturing the workbook includes the typed value.

## Acceptance criteria

- [x] The XLSX fill page offers **ดาวน์โหลด Excel** and **ดาวน์โหลด PDF** as separate download actions.
- [x] After saving `100`, type `200` and click each button while the cell editor is still open. Both files include `200`, and Folio's saved Draft still contains `100`.
- [x] A download can start on the first editor opening. PDF preserves the existing conversion layout and starts automatically after conversion.
- [x] A download failure is visible and retryable. The save, submit, and unsaved-exit behaviors pass their regressions for XLSX and DOCX.
- [x] The system map describes the implemented flow and the workflow checks pass.

## Comments

Verified on 5 November 2026 with Chrome, the project's ONLYOFFICE 9.4.0.1 image, and isolated Folio fixtures. The first probe returned the previous cell value until the editor confirmed the active input. The implemented path captured the typed value in XLSX and PDF. Folio returned the same saved Draft JSON and XLSX bytes before and after both downloads.

The live PDF matched the saved converter output pixel-for-pixel at the same value on a landscape workbook with a hidden helper sheet. The browser also covered the first opening, a failed PDF and retry, a deliberately expired lease, Save and Exit while waiting for PDF, and Submit. Both DOCX modes exercised their existing save-then-download controls.

The HTTP suite passed 282 cases with 37 opt-in skips. The web, plugin and spreadsheet unit suites, build, type check, lint and workflow checks passed. Standards and Spec reviewers verified the follow-up fixes in `a292d78`.
