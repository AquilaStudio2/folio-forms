# Shared numbered pagination and list footers

Status: Implemented for the UI and Admin record-list APIs. Server pagination for the remaining complete-list APIs is planned in [the API follow-up](api-plan.md).

## Scope

All eight record-list sections use `ListPagination` and the numbered design from `/admin`.

| List | Route | Page size | Data retrieval |
| --- | --- | --- | --- |
| Forms | `/admin` | 10 | Server pages with exact totals. |
| Results | `/admin/results` | 25 | Server pages with exact filtered totals. |
| Audit Trail | `/admin/audit` | 50 | Server pages with exact filtered totals. |
| Accounts | `/admin/users` | 20 | Server pages with exact filtered totals. |
| Pending account links | `/admin/users` | 10 | Server pages with exact pending-request totals. |
| Per-Form Submissions | `/admin/forms/$formId/submissions` | 10 | Client pages from the existing complete-list API. |
| My responses | `/dashboard` | 10 | Client pages from all owned Responses. |
| Native Submission history | `/forms/$publicId/fill` | 10 | Client pages from all owned Submissions for the Form. |

Native Submission history remains available for the native Form titled `แบบฟอร์มรายงานผลการปฏิบัติงาน (พลังงานจังหวัด)`. AI Authoring retrieves one current session and has no session catalog requiring pagination.

## Layout and controls

- Place details at the left edge of the list container and controls at its right edge.
- Use first, previous, numbered pages with ellipses, next, and last controls everywhere.
- Keep the control group together. Below 640px, place details above the right-aligned controls and replace page-number buttons with a current-page indicator.
- Keep the list and footer inside one rounded card. Separate the footer with a top border, including `/admin`, `/dashboard`, and per-Form Submissions.
- Retain details and disable unavailable navigation when a list is empty or has one page.
- Retain existing Admin page sizes. Newly paginated lists display 10 records per page.
- Give the Audit Trail filter form 16px padding below 640px and 20px padding at larger widths.
- Retain labels, keyboard access, current-page announcements, loading guards, and disabled states.

## Server contract

The Forms catalog, Results, Audit Trail, accounts, and pending account links accept `page`, defaulting to 1, and return their record array with `pagination: { page, pageSize, total, totalPages }`.

Validate a single positive decimal integer no greater than `2147483647`. Reject invalid or repeated page values and the former `cursor` parameter with HTTP 400. Empty lists report page 1, total 0, and totalPages 1. Requests beyond the final page return the final available page and its metadata.

Apply authorization and all active filters before counting or selecting records. Count and page reads use a repeatable-read transaction. Results retain the Province, Month, Fiscal year, and latest-Correction rules from ADR 0004. Filtered Results scan bounded ordered batches to compute exact totals without retaining every saved answer in memory.

The four former cursor consumers migrate together with their APIs. Deploy the frontend and backend contract changes together. The separate editor schema-search cursor contract remains documented in the README.

## Preserved behavior

- My responses statistics count every owned Response rather than the visible page.
- Discarding the final Draft on a page returns the displayed list to an available page.
- Native history resets to page 1 after a refreshed Submission list and keeps sequence numbers across pages.
- History exports include all matching owned Submissions regardless of the visible page.
- Admin, User, and Viewer permissions and Response ownership remain intact.

## Verification and owning sources

The [verification report](report.md) records UI, HTTP, type, build, lint, and browser checks. The [API plan](api-plan.md) covers the remaining complete-list endpoints and Correction histories.

- [Shared pagination component](../../apps/web/src/components/list-pagination.tsx).
- [Client pagination metadata and helpers](../../apps/web/src/lib/pagination.ts).
- [Server page validation and metadata](../../apps/server/src/http/pagination.ts).
- [Forms catalog](../../apps/server/src/forms/catalog.ts).
- [Filtered Results query](../../apps/server/src/responses/query.ts).
- [Result Filter ADR](../../docs/adr/0004-results-filters-use-scalar-field-tags.md).

Existing domain terms remain in `CONTEXT.md`. This change adds no domain term or database migration.
