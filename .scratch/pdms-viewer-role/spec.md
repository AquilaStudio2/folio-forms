# PDMS VIEWER role

Status: ready-for-human

Review base: 617b424d4b6ec21032c433e66bf11b9eef74fd22

Branch: feature/pdms-viewer-role

## Agreed outcome

PDMS's exact `เจ้าหน้าที่ กปม.` role maps to Folio `viewer`, displayed as VIEWER. VIEWER uses the existing Admin results pages, not a new page. They can inspect the same response results Admin sees: all owners' saved Drafts, Submissions, previous submissions and Correction history, field data and DOCX/XLSX document previews. They can download available saved-result exports. They cannot create, fill, reopen, save, submit, correct or delete responses, including their own pre-existing responses; nor author/manage Forms, accounts, links, audit or AI authoring.

Keep existing `admin (กปม.)` case-insensitive exact-full-name mapping to Admin. Preserve this existing Admin grant when an identity has both names; otherwise the exact officer name grants VIEWER, and all other valid lists grant User. Preserve strict claim validation and identity/linking safeguards.

The initial implementation covered role mapping and existing results access, with manual VIEWER creation/assignment excluded. On 28 October 2026 the user approved implementation of full VIEWER support through the existing Folio account-management lifecycle. That extension supersedes the manual-assignment exclusion; its requirements and acceptance criteria are in [the local account-management plan](local-account-management-plan.md). Admin can create, filter and assign VIEWER through the existing account pages, including reviewed PDMS linking. Existing Admin account pages must correctly display and preserve existing VIEWER values when handling mapped accounts. Continue using the existing pages.

## Existing-account semantics

Retain accepted SSO baseline semantics: a mapping transition applies at next successful SSO and revokes old sessions if the effective role changes; an unchanged mapping preserves an existing manual Folio override. Preserve stale transaction/account-switch guarantees and protect the last enabled Admin from every downgrade, including VIEWER. No immediate production backfill or deployment is requested.

## Authorization and navigation

VIEWER lands on the existing `/admin/results`. Permit result list/detail and necessary data/history/document/export APIs only. Keep privileged Admin areas inaccessible through direct URLs and APIs. Block all response editing entry points, including GET editor-config calls which acquire leases or issue capabilities. A read-only preview must never acquire an editing lease, save/submit capability or mutating callback.

Keep existing Admin/User behavior, local password requirements, ownership boundaries and accessible controls. Use lower-case persisted `viewer` consistently with existing role values; present VIEWER in the UI.

## Confirmed test seams

1. Real SSO/account HTTP -> public session/account responses: mapping, precedence, baseline transition, old-session revocation and last-Admin protection. Controlled PDMS exchange does not establish live PDMS integration.
2. Authenticated result/read/download and mutation HTTP APIs: cross-owner reads, own-response write denials, role regression and read-only configuration. These do not establish browser/editor rendering.
3. Rendered existing pages through the real router/auth provider with HTTP fixtures: landing, navigation/direct URL guards, allowed downloads and absent mutation actions. Verify real DOCX/XLSX preview in a browser with isolated local data separately.

Use red -> green per vertical slice. Register new HTTP suites in `apps/server/package.json` test:http. Run appropriate existing regressions, root formatter/linter and type checks. Use sol_worker for implementation and sol_reviewer for separate Standards and Spec reviews, apply feedback, then recheck.

## Scope and review

All work is in Folio's frontend and backend, consuming the existing PDMS role contract. Do not change PDMS producers, real data or production services. Review against the fixed base above. Preserve pre-existing untracked skill files. Record implementation, test evidence and limitations in this directory.
