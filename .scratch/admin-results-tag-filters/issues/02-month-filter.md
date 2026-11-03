# 02: Search by Thai calendar month alongside province and existing filters

**What to build:** An Admin or Viewer selects a full Thai calendar month and searches current saved Responses by that month alone or together with Province and the existing filters, using the same complete results and pagination flow.

**Blocked by:** 01: Search current Responses by province with existing filters.

**Status:** ready-for-agent

- [ ] Extend the existing results filter panel with a labelled, keyboard-accessible, single-value Month control. Default to all values and offer all twelve full Thai month names from `มกราคม` through `ธันวาคม` in calendar order, independent of saved answers or selected filters.
- [ ] Apply the Month choice through Search using the optional `month` query parameter. Validate supplied values at the HTTP boundary using the existing invalid-request behavior, and omit the parameter when inactive.
- [ ] Reuse the current-revision selection, declared scalar-root Field eligibility, bounded matching, and pagination established by ticket 01. Require the exact `month` Tag in the Response's own Published Template for DOCX and XLSX Forms.
- [ ] Compare saved values using the full Thai calendar month name. Numeric months, numeric strings, abbreviated names, unsupported values, missing Fields, nulls, and empty values fail an active Month criterion. Nested or table values do not qualify a Response.
- [ ] Make Month usable alone, with Province, and with any existing filter. All active conditions use AND. Leaving Province or Month inactive imposes no requirement for that inactive Field.
- [ ] Keep existing From/To controls on Response update time. The saved calendar month is independent of update date, submission date, and any later Fiscal year filter.
- [ ] Preserve pending versus applied criteria, all-values behavior, complete old-plus-new request parameters, cursor reset after Search, and the applied Province/Month combination across next/previous pages and Reload. Keep the central choices visible after an empty search.
- [ ] Add HTTP behavior tests for both document kinds and all supported current Response states/revisions, full-name matches, rejected saved formats, absent or wrongly declared Tags, and positive/negative Month-plus-Province-plus-existing-filter combinations.
- [ ] Extend sparse-pagination and latest-Correction coverage to combined Province and Month matching. Add rendered-page tests for the central month choices, labelled interaction, outgoing combined parameters, clearing one criterion while retaining the other, navigation, and Reload.
- [ ] Demonstrate Month-only and combined searches with synthetic saved Responses, verify that opening a returned result shows the qualifying current values, and run the relevant tests and normal code checks while retaining ticket 01 behavior.
