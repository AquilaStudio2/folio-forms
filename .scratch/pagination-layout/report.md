# Pagination implementation and verification

Status: Complete for the approved UI scope on 2026-11-03.

## Delivered behavior

`ListPagination` renders the `/admin` numbered design everywhere, including first, previous, page numbers, next, and last. Details align to the container's left edge and controls align to its right edge. Below 640 pixels, details appear above the right-aligned controls. Empty and single-page lists retain their footer with unavailable navigation disabled. `/admin`, `/dashboard`, and per-Form Submissions now keep the list and footer inside one rounded card with a divider. Audit Trail filters have 16px padding on narrow screens and 20px padding from 640px upward.

Eight list sections use the component:

- Admin Forms.
- Admin Results.
- Audit Trail.
- Account management.
- Account-link requests.
- Admin per-Form Submissions.
- My responses.
- Native Submission history.

Newly paginated lists display 10 records per page. Results, Audit Trail, accounts, and account-link requests now use true server page queries with exact totals. Existing Forms, Results, Audit Trail, and accounts page sizes remain unchanged. Account-link requests use 10 records per page.

My responses statistics continue to count all loaded Responses. Discarding the last Draft on a page returns the displayed list to the preceding page. Native history resets to page 1 after a refreshed Submission list, keeps sequence numbers across pages, and exports every Submission regardless of the visible page.

AI Authoring was checked at each viewport. It retrieves one current session and has no record list requiring pagination.

## API follow-up

The three previously unpaginated record-list APIs still return their complete datasets. Their frontend consumers now paginate the rendered rows. The [API plan](api-plan.md) covers server limits, exact metadata, global statistics, stable ordering, access checks, and complete exports for these APIs. It also covers the two Correction history APIs used by detail views.

## Verification results

| Check | Result |
| --- | --- |
| Root `bun run build` | Passed for web, server, and prefill mock. The final card and filter-padding layout also passed a fresh web build. |
| Root `bun run check-types` | Passed. |
| Root `bun run fix` and full `bun run check` | Passed. |
| `bun run --cwd apps/web test` | 12 lifecycle tests and 206 UI tests passed, including direct numbered navigation on Results, Audit Trail, accounts, and account-link requests. |
| `bun run --cwd apps/server test:spreadsheet` | 117 unit tests passed across 19 files. |
| Twelve HTTP suites against separate isolated PostgreSQL databases | 219 tests passed, covering exact counts, filtered Results, ties, page validation, clamping, permissions, Viewer roles, account-link provisioning, native history, and the full Admin/User workflow. |
| Production web build in Chrome with synthetic API fixtures | 24 footer checks at widths 1365, 640, and 320, including page 2, last, and first navigation, shared list frames, and footer dividers. |
| Native history export from page 2 | All 11 fixture records exported at each viewport. |
| Audit Trail filter padding | Measured 20px at 1365 and 640, and 16px at 320. |
| Browser runtime errors | None. |

Browser checks include the six-page Forms case from the reference screenshot. They measure alignment, keep the controls on one row, verify mobile stacking, navigate every list using the shared numbered controls, and exercise history exports. The [browser results](evidence/browser-checks.json), [API results](evidence/api-checks.json), and screenshots remain in `evidence/`.

## Repeat the browser check

Build the web app and start its preview server:

```sh
bun run --cwd apps/web build
bun run --cwd apps/web preview --host 127.0.0.1 --port 5174
```

In another terminal, install Playwright into a temporary directory and run the saved check. The script uses the installed Google Chrome application on macOS and intercepts API requests with synthetic data.

```sh
pagination_qa_dir="$(mktemp -d)"
npm install --prefix "$pagination_qa_dir" --no-audit --no-fund --ignore-scripts playwright
PLAYWRIGHT_MODULE="$pagination_qa_dir/node_modules/playwright/index.mjs" \
PAGINATION_WEB_ORIGIN=http://127.0.0.1:5174 \
node .scratch/pagination-layout/verify-ui.mjs
```
