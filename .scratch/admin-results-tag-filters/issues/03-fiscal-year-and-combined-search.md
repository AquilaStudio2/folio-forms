# 03: Search by fiscal year and deliver the complete combined results flow

**What to build:** An Admin or Viewer selects a Buddhist Era fiscal year and uses Province, Month, Fiscal year, and every existing filter together. The year choices stay current automatically, while search results continue to use the values actually saved in each current Response.

**Blocked by:** 02: Search by Thai calendar month alongside province and existing filters. This ticket delivers the complete three-filter combination, so the Province and Month flows must already be available.

**Status:** ready-for-agent

- [ ] Add a labelled, keyboard-accessible, single-value Fiscal year control to the existing filter panel. Default to all values and use the optional `fiscal_year` query parameter when applying Search.
- [ ] Reuse the published scalar-root Field eligibility and current-revision matching established by the preceding tickets. Require the exact `fiscal_year` Tag for both DOCX and XLSX Forms, ignoring nested/table values and undeclared properties.
- [ ] Treat a saved Buddhist Era integer and its numeric string equivalent as the same year, such as `2570` and `"2570"`. Missing, empty, null, or unsupported values fail only an active Fiscal year criterion. Validate supplied query values through the existing HTTP invalid-request behavior.
- [ ] Provide a central range of twelve choices: ten fiscal years before the current fiscal year, the current fiscal year, and one following fiscal year. Keep choices independent of saved data and every other active filter, including when no result matches.
- [ ] Determine the current fiscal year from the Asia/Bangkok date: local Gregorian year plus 543 from January through September and plus 544 from October through December. Advance at local midnight on October 1. For current fiscal year 2570, offer 2560 through 2571 inclusive.
- [ ] The date calculation determines available choices only. Match the independently saved `fiscal_year` answer, and preserve full Thai Month matching and the existing From/To update-date semantics. Do not derive one reporting value from another or rewrite saved values.
- [ ] Support Fiscal year alone, every two-filter combination, and Province plus Month plus Fiscal year. Combine them with all existing Form, email, status, latest-Correction, From, and To conditions using AND. Clear any one control while keeping the others effective.
- [ ] Preserve the complete applied condition set in Search requests, next/previous pages, and Reload. Reset pagination when a search is applied and retain the existing one-row-per-Response presentation, detail links, page size, ordering, and cursor contract.
- [ ] Make the three controls work together in the existing panel at supported widths with labelled keyboard access and distinct loading, empty, and error states. Preserve current Admin/Viewer permissions and existing unauthorized-access responses.
- [ ] Add HTTP tests for integer/string year equivalence, Field eligibility, both document kinds, all supported current states/revisions, inactive-filter compatibility, and positive/negative combinations of all three new filters with each existing condition.
- [ ] Use a controlled clock at the highest existing observable seam to verify twelve central year choices, the Bangkok October boundary, and the expected ranges: 2559 through 2570 on September 30, 2026, then 2560 through 2571 on October 1, 2026.
- [ ] Verify complete combined matches over sparse multi-page fixtures, including cases where newer candidates satisfy the latest-Correction condition but fail answer criteria. Retain all matches and stable cursor behavior across subsequent pages.
- [ ] Add rendered-page tests that select all three new values and existing conditions, inspect the complete outgoing query, clear one value, navigate, Reload, and handle empty/error responses. Complete a running-page check with synthetic matches and nonmatches, confirm current detail values, and run the relevant HTTP/UI suites and normal formatting, lint, and type checks.
