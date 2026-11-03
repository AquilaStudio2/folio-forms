# Province, Month, and Fiscal year filters for admin results

Status: resolved

## Problem Statement

Admins and Viewers can search saved Responses by Form, user, status, latest Correction, and update date, but cannot narrow results by the province, calendar month, or fiscal year recorded in the answers. These values belong to saved Field data across different Forms and Response states. They cannot be inferred from a Form title or a Response's update date.

## Solution

Add three labelled, single-value filters to the existing results page. Read their values from designated scalar root Fields in the current saved answer JSON. Combine every active new filter with every active existing filter using AND, and return the existing Response rows with their current ordering and pagination.

Display จังหวัด, เดือน, and ปีงบประมาณ as three additional results-table columns, including when their filters are inactive. Use the same configured Tags, supported formats, and current saved values as the filters. Show the literal `-` in each unavailable cell independently when its scalar Tag is absent, its value is missing, or its saved format is unsupported.

| Filter | Field Tag | Supported saved value | Central choices |
| --- | --- | --- | --- |
| จังหวัด | `province` | Full Thai province name, with outer whitespace trimmed before exact comparison | Complete Thai province-name list, including `กรุงเทพมหานคร` |
| เดือน | `month` | Full Thai calendar month name | All twelve full Thai month names in calendar order |
| ปีงบประมาณ | `fiscal_year` | Buddhist Era integer or its numeric string equivalent, such as `2570` and `"2570"` | Ten prior fiscal years, the current fiscal year, and one following fiscal year |

Each filter defaults to all values. Central choices remain available even when no saved Response matches a choice. The fiscal-year range advances automatically on October 1 using the Asia/Bangkok date. For current fiscal year 2570, the selectable range is 2560 through 2571, inclusive.

## User Stories

1. As an Admin, I want to find Responses by their recorded province, so that I can inspect results for the area I manage.
2. As a Viewer, I want to use the same results filters within my existing read access, so that I can inspect relevant saved results.
3. As an Admin, I want to find Responses by their recorded calendar month, so that I can inspect answers for a reporting month.
4. As an Admin, I want to find Responses by their recorded Buddhist Era fiscal year, so that I can inspect answers for a reporting year.
5. As an Admin, I want to select one value in each new filter, so that the selected criteria are clear.
6. As an Admin, I want all values selected by default, so that opening the page preserves the existing results view.
7. As an Admin, I want to clear one filter independently, so that I can broaden the search while keeping my other criteria.
8. As an Admin, I want every selected new criterion to match, so that combining province, month, and fiscal year narrows the results predictably.
9. As an Admin, I want to combine the new filters with Form Public ID, so that I can search answers from a particular Form.
10. As an Admin, I want to combine the new filters with user email, so that I can find a particular user's relevant Responses.
11. As an Admin, I want to combine the new filters with status, so that I can inspect relevant Drafts or submitted Responses.
12. As an Admin, I want to combine the new filters with the existing latest-Correction condition, so that I can narrow results without changing how that condition works.
13. As an Admin, I want the existing From date to work with the new filters, so that I can constrain update time and reporting values together.
14. As an Admin, I want the existing To date to work with the new filters, so that I can apply a complete update-date range alongside answer criteria.
15. As an Admin, I want to apply all filter edits through the existing Search action, so that I can prepare a complete search before loading it.
16. As an Admin, I want a changed search to start from the first results page, so that an earlier cursor does not hide relevant results.
17. As an Admin, I want next and previous pages to retain all applied criteria, so that every page belongs to the same search.
18. As an Admin, I want Reload to retain the applied criteria, so that I can refresh the search I am inspecting.
19. As an Admin, I want existing filters to behave as before when the new filters are inactive, so that this addition preserves my current workflow.
20. As an Admin, I want a missing Tag or missing value to fail only its active criterion, so that incomplete answers cannot appear as a false match.
21. As an Admin, I want DOCX scalar Fields with the designated Tags to participate, so that document Forms can be searched consistently.
22. As an Admin, I want XLSX scalar Fields with the designated Tags to participate, so that spreadsheet Forms can be searched consistently.
23. As an Admin, I want eligibility to follow the configured Field Tag, so that changing a visible label does not change the meaning of a results filter.
24. As an Admin, I want province names compared exactly after trimming outer whitespace, so that incidental surrounding spaces do not hide a matching province.
25. As an Admin, I want month values matched by their full Thai names, so that filtering follows the agreed month format.
26. As an Admin, I want numeric and textual representations of the same fiscal year to match, so that a Field's storage type does not split the reporting year.
27. As an Admin, I want saved Draft data searched, so that I can inspect work that has been saved without submission.
28. As an Admin, I want a Response being submitted to use its last saved Draft data, so that an in-progress operation does not change the saved values being searched.
29. As an Admin, I want submitted Responses searched using their latest Submission, so that results reflect the current submitted answer.
30. As an Admin, I want the latest Correction applied to the current Submission before filtering, so that searching agrees with opening the result.
31. As an Admin, I want a superseded historical value to stop matching the current result, so that older revisions do not misrepresent current answers.
32. As an Admin, I want a reopened Response searched by its saved Draft, so that edits made after an earlier Submission determine its current classification.
33. As an Admin, I want one row per Response, so that filtering preserves the existing results list and detail links.
34. As an Admin, I want the complete central province list available, so that I can select a supported province before matching data exists.
35. As an Admin, I want all twelve full Thai month names available in calendar order, so that I can choose a reporting month consistently.
36. As an Admin, I want ten prior fiscal years, the current year, and one following year available, so that I can inspect older reporting periods and prepare for the next year.
37. As an Admin, I want the fiscal-year choices to advance at the Bangkok October boundary, so that the available range stays current without manual updates.
38. As an Admin, I want the central choices retained after an empty search, so that I can adjust the criteria and search again.
39. As an Admin, I want matching results beyond newer nonmatching records to remain discoverable, so that pagination does not hide answers that satisfy my search.
40. As an Admin, I want latest-Correction and answer filtering applied together before pagination, so that combining them returns complete pages of matching Responses.
41. As an Admin, I want clear loading, empty, and error states, so that I can distinguish no matching answers from a failed request.
42. As an Admin, I want labelled controls and keyboard access, so that I can use the complete search without relying on a pointer.
43. As a User, I want the existing access restrictions preserved, so that adding filters does not expose results I am not allowed to read.
44. As an Admin, I want searching to preserve saved answers and their history, so that filtering does not rewrite source records or documents.
45. As an Admin, I want filters restricted to scalar root Fields, so that table rows do not accidentally qualify an entire Response through unrelated nested values.
46. As an Admin, I want an invalid or unsupported saved value to be treated as a nonmatch for its active criterion, so that one inconsistent answer does not prevent the rest of the results from loading.

47. As an Admin, I want space around the filter controls and actions, so that the filter panel is comfortable to read and use.
48. As an Admin or Viewer, I want each result's province, month, and fiscal year visible in the table for DOCX and XLSX, so that I can read its current classification without opening the result.
49. As an Admin or Viewer, I want `-` in each unavailable reporting cell, so that a missing Tag or unsupported value does not obscure the other valid values or remove an otherwise eligible result.
50. As an Admin or Viewer, I want the status badge and Open link to stay on one line, so that the wider results table remains easy to scan.

## Implementation Decisions

- Extend the existing results-page controls, typed API client, results-list HTTP handler, and Response query/revision-selection logic. Reuse the current results and detail flows.
- Extend the existing results-list API with optional, single-value `province`, `month`, and `fiscal_year` query parameters. The client omits inactive parameters. Preserve the existing `form`, `user`, `state`, `correction`, `from`, `to`, and `cursor` parameters and their meanings.
- Extend result summaries with nullable `province`, `month`, and numeric `fiscalYear` values. Preserve all existing properties and the cursor contract. Supply central choices through one authoritative application catalog, with consistent values for controls and request validation.
- Validate supplied query values at the HTTP boundary using the application's existing invalid-request behavior. Saved answer values are matched defensively, with unsupported types or formats producing a nonmatch for an active criterion.
- A Response is eligible for an active criterion only when its own Published Template declares a scalar root Field with that exact, case-sensitive canonical Tag. Use the Response's published contract, not the editable Template Draft or a display label.
- Read the designated root property in saved answer JSON. Table containers, table columns, nested arrays, nested objects, and undeclared JSON properties do not establish eligibility.
- Apply the same Field eligibility and value contract to DOCX and XLSX Forms. Existing Field authoring and publication remain the way an Admin designates these Fields.
- Compare a saved province string with the selected full Thai province name after trimming whitespace at both ends. Preserve exact comparison within the name. Prefixes, abbreviations, aliases, and province codes are outside the supported format.
- Compare Month using its full Thai name. Supported choices are `มกราคม`, `กุมภาพันธ์`, `มีนาคม`, `เมษายน`, `พฤษภาคม`, `มิถุนายน`, `กรกฎาคม`, `สิงหาคม`, `กันยายน`, `ตุลาคม`, `พฤศจิกายน`, and `ธันวาคม`. Numeric months and abbreviated month names do not match this contract.
- Compare Fiscal year by integer Buddhist Era year. A number and its numeric string equivalent match the same selection. Do not infer this saved value from Month, update time, submission time, or the current date.
- Define central province choices using the complete Thai province-name list, including `กรุงเทพมหานคร`. Central catalogs are application-owned and remain available independently of saved answer contents or other selected filters.
- Generate fiscal-year choices from the current date in Asia/Bangkok. From January through September, the current fiscal year is the local Gregorian year plus 543. From October through December, it is that year plus 544. Offer the inclusive range from current fiscal year minus ten to current fiscal year plus one, giving twelve choices.
- The Bangkok fiscal-year boundary is local midnight at the start of October 1. Advancing the choice range does not change any saved answer value.
- Draft and Submitting Responses use their current saved Draft data. Submitted Responses use the latest Submission and that Submission's latest Correction data when available. A Correction supplies its complete revised answer data, rather than only its changed-value diff.
- Use the same revision precedence as the current result detail. Older Submissions and older Corrections do not make a current result match. A reopened Response uses its saved Draft even when an earlier Submission exists.
- A missing Field, missing property, null value, empty value, or unsupported saved format cannot satisfy that active criterion. Inactive new criteria impose no Field or value requirement.
- Combine all active existing and new conditions with AND. Form Public ID, user email, status, latest Correction, and both update-date boundaries remain independently applicable.
- Preserve the existing date filters on Response update time. Preserve the current draft-state mapping, including Submitting Responses, and the existing latest-Correction-number semantics.
- Apply ordinary eligibility conditions, current-revision selection, answer matching, and any latest-Correction condition before deciding which matches fill a page. An intermediate cap of candidate IDs from latest-Correction filtering must not hide later answer matches.
- Preserve the existing 25-result page size, descending update-time and identifier ordering, and cursor contract. Determine whether another page exists from additional combined matches, and derive the cursor from a returned result.
- Use bounded ordered candidate batches and select the data needed for matching and summaries. Preserve complete search results without loading all answer JSON into application memory at once.
- Project the three reporting values once per candidate and reuse that projection for filtering and table summaries. Fetch all three designated scalar Fields and current saved answer data even when the filters are inactive. Keep the existing bounded queries without per-result database lookups.
- Display the three reporting columns after User. A missing or unsupported value becomes null in the API and `-` in its table cell; valid neighboring values still display. Keep supported saved fiscal years visible independently of the dynamic choice window. The table retains horizontal scrolling on narrow screens.
- Use compact horizontal cell padding to make room for all columns. Prevent wrapping within status badges and the Open link, as requested in the subsequent browser review.
- Keep the existing distinction between pending control edits and applied criteria. Search applies the complete set and resets pagination. Reload, next page, and previous page retain the complete applied set.
- Keep controls labelled and keyboard accessible. Preserve current loading, authentication, permission, request-error, and empty-result behavior, with the central choices still available for an empty result set.
- Provide responsive internal padding around the filter panel's labels, controls, and actions, as requested during browser review. Preserve the existing design and filter interactions.
- Preserve existing Admin and Viewer read permissions. Filtering does not grant authoring, correction, or account-management capabilities.
- Use the existing published Field records and saved answer JSON. This feature requires no new persistence model or database schema migration. Search does not mutate Forms, Responses, Submissions, Corrections, or saved documents.

## Testing Decisions

- Use the authenticated results-list HTTP API as the primary test seam. Exercise the real application request handler, published Field fixtures, Response records, Submissions, Corrections, and an isolated PostgreSQL database. Assert returned identities, ordering, cursor behavior, status, and HTTP errors rather than private helper calls or ORM query shapes.
- Prefer the existing HTTP application and authentication fixtures. Prior art is the Admin/User workflow's Draft-results scenarios, the Submission-history scenarios, the Viewer-role HTTP suite, and the spreadsheet HTTP suites. Extend these patterns instead of introducing a lower-level fake database seam.
- Cover scalar Field eligibility and values for both DOCX and XLSX. Include declared root Fields, missing declarations, wrong Tag case, matching labels with different Tags, table-only values, nested values, nulls, empty values, and unsupported types.
- Cover exact province matching after outer trimming, full Thai month names, and equivalent integer/string fiscal years. Include negative examples for province prefixes, numeric months, and abbreviated months.
- Cover Draft, Submitting, latest Submission, latest Correction, older matching revisions, and a Response reopened as a Draft. Compare list eligibility with the revision visible when opening the current detail.
- Test each existing filter with one new filter and with all three new filters. Include positive and negative combinations for Form Public ID, user email, state, latest Correction, From, and To. Verify that inactive new filters preserve existing behavior.
- Construct sparse pagination fixtures with more than one page of newer nonmatches before older matches. Exercise multiple matching pages, identical update timestamps, end-of-results behavior, and combined latest-Correction filtering. Assert that qualifying Responses are neither omitted nor duplicated across the unchanged search.
- Keep a small secondary seam at the rendered results page using the existing React Testing Library, router, and HTTP-mocking setup. Prior art is the Admin Forms page suite, which selects labelled controls, submits interactions, and inspects outgoing requests. Mock only the network response here, and leave answer-matching behavior to the HTTP application tests.
- At the rendered page, verify single selection and all-values choices, labelled keyboard interactions, complete old-plus-new search parameters, applying through Search, clearing one criterion, reset to the first page, preserved criteria on navigation and Reload, central choices after no matches, and existing permission/error displays.
- Verify reporting values and independent null fallbacks through the authenticated HTTP API for both document kinds and every current Response state. At the rendered page, assert the three accessible column headings, both document-kind rows, and literal `-` cells for fully and partially unavailable values.
- Exercise catalog presentation and fiscal-year boundaries with a controlled clock through the highest existing observable seam. Check the full province list, all twelve Thai months in order, twelve fiscal years, and Bangkok midnight at October 1. Avoid tests that merely duplicate a private range-generation loop.
- Perform a running-page check with synthetic matching and nonmatching Responses after implementation. Confirm that the three new controls fit the existing filter panel and that opening a returned result shows the values that qualified it.
- Run the relevant HTTP and UI suites and the project's normal formatting, lint, and type checks when implementing. This specification records the verification plan and does not claim that the feature tests have already run.

### Acceptance examples

Unless stated otherwise, select province `เชียงใหม่`, month `ตุลาคม`, and fiscal year `2570`, with all three Tags declared as scalar root Fields.

| Current saved values or condition | Expected behavior |
| --- | --- |
| Province `เชียงใหม่`, Month `ตุลาคม`, Fiscal year `2570` stored as a number | Match. |
| Province `เชียงใหม่`, Month `ตุลาคม`, Fiscal year `"2570"` stored as text | Match. |
| Province `เชียงราย` with the other selected values matching | No match. |
| Province `จ.เชียงใหม่` | No match. |
| Month `10`, `"10"`, or `ต.ค.` | No match. |
| A selected Field is absent, undeclared, null, or empty | No match. |
| Matching values occur only inside table rows | No match. |
| An older revision matches but the current saved revision does not | No match. |
| The latest Correction changes Province to `เชียงราย` | Match a `เชียงราย` search and fail a `เชียงใหม่` search. |
| A reopened Response's Draft differs from its previous Submission | Use saved Draft values. |
| New values match, but any active existing condition fails | No match. |
| Every active existing and new condition matches | Include the Response. |
| All three new filters are inactive | Preserve existing results, including Responses without these Tags. |
| A central choice has no matching saved answers | Keep the choice and show an empty result set. |
| Bangkok date September 30, 2026 | Current fiscal year 2569, choices 2559 through 2570. |
| Bangkok date October 1, 2026 | Current fiscal year 2570, choices 2560 through 2571. |

## Out of Scope

- Multiple selected values within one filter or OR combinations between active criteria.
- Filtering table columns, project rows, nested arrays, or arbitrary JSON paths.
- Searching superseded Submissions or Corrections as separate results.
- Changing the existing one-row-per-Response results model or the existing date-filter meaning.
- Province aliases, prefixes, province codes, abbreviated or numeric month values, and conversion from Christian Era fiscal-year inputs.
- Deriving reporting Month or Fiscal year from timestamps or from each other.
- Editing published Tags, automatically adding missing Fields, backfilling answers, or rewriting saved answer/document history.
- Populating or narrowing choices from saved answer contents, PDMS project records, or other selected filters.
- Changes to Form authoring, ONLYOFFICE interactions, correction workflows, roles, bulk exports, or production deployment.

## Further Notes

- The user confirmed the design, composition with every existing filter, the three-ticket breakdown, and implementation. All three tickets are implemented and resolved after verification and independent review.
- Use the domain terms Admin, Viewer, Form, Field, Response, Draft, Submission, Correction, and Result Filter Field consistently. ADR 0004 records the canonical scalar Tag and current-revision decisions.
- Canonical Tags are part of immutable published Form contracts. A future rename needs an explicit compatibility or migration decision.
- The fiscal-year clock determines available choices only. A saved answer keeps its own independently stated Month and Fiscal year.
- Published through the repository's Local Markdown issue tracker. The implementation report records the delivered branch, verification results, and review outcomes. The user's browser review additionally requested internal padding and reaffirmed Excel and DOCX support; both are verified.
- The subsequent user request adds the three reporting columns and per-cell `-` fallbacks. Its implementation and separate verification are recorded in the implementation report.
