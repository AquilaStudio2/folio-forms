# Add server pagination to the remaining list APIs

Status: Planned follow-up for three complete-list APIs and two Correction history APIs. Admin numbered pagination is implemented.

## Current delivery

`ListPagination` supplies the same numbered controls used by `/admin` for every approved list. There is no previous/next-only component mode.

The Forms catalog, Results, Audit Trail, accounts, and account-link requests use `page` queries and return `pagination: { page, pageSize, total, totalPages }`. The four former cursor APIs were migrated together with their frontend consumers. Their page sizes remain 25, 50, 20, and 10 respectively. The Forms catalog remains 10.

My responses, native Submission history, and the directly accessible admin Submissions list display 10 records per page from their existing complete-list responses. Their API contracts remain unchanged in this delivery. This limits rendered rows, but does not limit network payloads or database reads. The steps below remove that remaining cost.

## API inventory

| API | Current behavior | Planned work |
| --- | --- | --- |
| `GET /api/admin/forms` | Numbered pagination, 10 records per page, exact totals. | Retain. |
| `GET /api/admin/results` | Numbered pagination, 25 records per page, exact filtered totals. | Implemented. Retain all existing filters. |
| `GET /api/admin/audit-events` | Numbered pagination, 50 records per page, exact filtered totals. | Implemented. |
| `GET /api/admin/users` | Numbered pagination, 20 records per page, exact filtered totals. | Implemented. |
| `GET /api/admin/account-links` | Numbered pagination, 10 records per page, exact pending-request totals. | Implemented. |
| `GET /api/responses/me` | Returns every Response belonging to the authenticated User. The UI derives its statistic cards from this complete array. | Add numbered pagination and separate aggregate statistics. |
| `GET /api/forms/:publicId/my-submissions` | Returns every owned Submission id and creation date for the Form. | Add numbered pagination and exact totals. |
| `GET /api/admin/forms/:publicId/submissions` | Returns every Submission for the Form. | Add numbered pagination and exact totals. |
| `GET /api/responses/:id/corrections` | Returns the original Submission and its complete Correction history. Used by the results detail view. | Paginate the Correction history in a subsequent detail-view change. Preserve access to every saved revision. |
| `GET /api/submissions/:id/corrections` | Returns the original Submission and its complete Correction history. Used by the older Submission detail view. | Apply the same history contract as the Response endpoint. |
| `GET /api/forms/:publicId/my-submissions/export` | Exports all matching owned Submissions. | Keep the complete export independent from the visible page. |

AI Authoring retrieves one current session. It has no session catalog requiring a pagination footer. Its conversation is a separate interaction from these record lists.

## Shared numbered contract

Each server-paginated frontend route owns its requested page and receives the actual, clamped page metadata from its API. Client-paginated routes derive metadata from the complete returned array. Both pass metadata and `onPageChange` to `ListPagination`; the component owns all control rendering and layout.

```tsx
<ListPagination
  label="แบ่งหน้าผลลัพธ์"
  pagination={pagination}
  onPageChange={setPage}
  disabled={loading}
/>
```

`apps/server/src/http/pagination.ts` owns page validation and metadata calculations. List handlers validate after authorization and count with the same filters used to select rows. Count and data queries run in a repeatable-read transaction. Requests using the former `cursor` parameter are rejected rather than silently returning an unrelated page.

Loading every cursor page in the browser was rejected because reaching the last page would require downloading all preceding pages. Server totals and direct page queries support the requested numbered controls without that cost.

Results with Province, Month, Fiscal year, or latest-Correction conditions still use the existing saved-answer matching rules. Exact totals scan ordered, bounded batches and retain at most the requested page and the final page. Unfiltered Results use a database count and a bounded page query. For large filtered datasets, measure this scan before considering indexed answer projections or equivalent SQL predicates.

## 1. Add numbered page queries to the three record-list APIs

- Accept one `page` query parameter, defaulting to 1. Use a fixed page size of 10.
- Reject duplicate parameters, non-integers, zero, negative values, and values beyond the supported integer range, following the Forms catalog validation.
- Preserve the existing `responses` or `submissions` array key and add `pagination: { page, pageSize, total, totalPages }`.
- Apply the current ownership and role checks to both the total query and the page query. Never return another User's counts.
- Order Responses by `updatedAt DESC, id DESC` and Submissions by `createdAt DESC, id DESC` so equal timestamps have a stable order.
- Fetch only the requested page with `skip` and `take`. Count and read the page in a consistent transaction, following the Forms catalog.
- Clamp pages beyond the last page. An empty list reports page 1, total 0, and totalPages 1.
- Review query plans and existing indexes for the ownership, Form, timestamp, and id predicates before adding indexes.

## 2. Preserve My responses statistics

Return `stats: { drafts, submitted, total }` from aggregate queries over all Responses owned by the authenticated User. Use the same Response states currently counted by the cards, including the displayed `in_progress` state if the API still emits it.

The page array is not a source of aggregate counts. After a successful Draft discard, reload the page metadata and statistics together. If the final row on a page disappears, use the clamped page returned by the server.

## 3. Migrate the three frontend consumers together

- Define typed list responses in `apps/web/src/lib/api.ts` using the shared pagination metadata shape.
- Send `page` from My responses, native Submission history, and the admin Submissions route.
- Pass server metadata to `ListPagination` and remove client slicing from those routes in the same change.
- Keep controls disabled during requests. Ignore responses from cancelled or superseded requests.
- Reset native history to page 1 after a new Submission. Keep history row numbering based on total records and page offset.
- Preserve My responses confirmation dialogs and their focus behavior while changing pages or discarding a Draft.
- Leave the history export URL independent of `page`; downloading from page 2 still exports all records.

## 4. Bound the two Correction history APIs

The history views currently need a revision list and the data of the selected revision. Separate those needs before limiting the arrays.

- Add a shared history query contract with 10 Correction summaries per page and exact metadata.
- Retain the original Submission entry independently of the paged Correction summaries.
- Fetch the selected revision through its existing revision-specific data and artifact paths. Older revisions remain selectable even when they are on another history page.
- Update both detail views together, using `ListPagination` for history navigation.
- Preserve revision access checks, artifact availability reporting, immutable history, and view auditing.

## Verification

Run HTTP tests against an isolated database for empty, one-page, and multiple-page datasets. Cover first, middle, last, and out-of-range pages, equal timestamps, invalid query values, unauthorized access, and another User's records.

For My responses, create more than 10 records and confirm that every page reports the same global statistics. Delete the only record on the last page and confirm that metadata returns the preceding page.

For Submission history, confirm that exporting from page 2 includes the complete dataset. For Corrections, open and download a revision outside the first history page and confirm that the original and all later revisions remain available.

Run UI navigation tests for request races, filter or Form changes, mobile layout, disabled controls, and the existing Viewer access rules. Deploy the frontend and backend contract changes together.

## Owning sources

- `apps/server/src/routes/responses.ts`
- `apps/server/src/routes/public-forms.ts`
- `apps/server/src/routes/form-authoring.ts`
- `apps/server/src/routes/submissions.ts`
- `apps/server/src/forms/catalog.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/components/list-pagination.tsx`
- `apps/web/src/routes/dashboard.tsx`
- `apps/web/src/routes/forms/$publicId/fill.tsx`
- `apps/web/src/routes/admin/forms/$formId/submissions/index.tsx`
