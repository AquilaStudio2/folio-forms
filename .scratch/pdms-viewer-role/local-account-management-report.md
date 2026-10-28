# Local VIEWER account management

Date: 28 October 2026

Branch: `feature/pdms-viewer-role`; feature review base: `617b424`.

## Implementation

Admin can now create a local VIEWER, filter Viewer accounts, and change between all three roles using the existing `/admin/users` page. Role confirmation shows the account and current/target roles. A cancelled role change restores keyboard focus to the enabled selector.

The backend accepts Viewer through existing account creation/update transactions. Local creation uses the existing temporary-password and mandatory replacement flow. Role changes revoke sessions, preserve Response ownership and protect the last enabled Admin. User/Viewer transitions use a neutral audit event; Admin-related transitions retain their existing meaning.

Reset, disable/enable, email updates and guarded deletion keep the existing account policies. The pending-link panel now follows backend eligibility for enabled Admin/User/Viewer accounts with matching evidence, and approval requires fresh SSO. Manual role changes preserve the PDMS baseline rules. All Viewer accounts use the same read-only results permissions regardless of login method.

No new page, endpoint, database table or migration was added by this extension. Deployment still requires the earlier Viewer enum migration and generated Prisma client.

## Automated verification

- Backend TDD: create Viewer initially returned 400; assigning Viewer initially returned 400; User/Viewer audit event initially used demotion. Each behavior was implemented after its failing test, then passed. [Backend evidence](evidence/local-backend-tdd.txt).
- Frontend TDD: create/filter/role selection/link eligibility and cancel focus were tested through the real router/auth provider. [Frontend evidence](evidence/local-frontend-tdd.txt).
- Full registered HTTP suite: 203 passed, 0 failed across 18 suites; 6,861 assertions.
- Full web suite: 12 lifecycle and 165 UI tests passed, including 38 Viewer UI cases.
- Root `bun run check-types`: 4 tasks passed.
- Root `bun run build`: 3 tasks passed.
- Root `bun run check`: passed; changed code formatted with the root `fix` script.

HTTP tests cover all six role transitions, temporary-password replacement and re-login, session/capability revocation, concurrent last-Admin protection, lifecycle operations, filters/pagination, guarded erasure, PDMS baseline transitions and reviewed linking. UI tests also cover pending/error/cancel states, credential clearing, self-demotion and safe return destinations.

## Independent review

Two independent `sol_reviewer` agents reviewed the fixed `617b424` base plus current working-tree changes, focusing on the local extension after `3d0cf4b`.

### Standards

No actionable documented-standard violations or findings from the twelve smell heuristics. The implementation retains validation, transaction/locking, audit/session boundaries and labelled, keyboard-accessible controls. The historical planned-status note was corrected in the specification before handoff.

### Spec

No actionable missing requirements, scope creep or incorrect behavior. The previously identified Viewer link-approval UI gap is resolved with disabled/stale/email-change coverage. The reviewer independently reran the 38 Viewer UI cases: all passed.

Standards: 0 findings; Spec: 0 findings. Reviewers did not claim their own native-browser or live PDMS verification.

## Native browser

Native verification used separate disposable accounts, database and object bucket with a real server, frontend and ONLYOFFICE.

- Admin created VIEWER using the existing page and filtered Viewer accounts.
- The new account's local login showed the mandatory password-change page. Password replacement through the real HTTP API revoked the old session and temporary password; browser re-login reached the existing results list with all five cross-owner Draft/Submission fixtures and restricted navigation.
- Native DOCX correction and XLSX previews rendered read-only without Correction/delete actions. Evidence: [DOCX](evidence/local-viewer-docx.png), [XLSX](evidence/local-viewer-xlsx.png).
- Admin used the actual row selector, confirmation and save to change VIEWER → User and User → VIEWER. The row reflected each result. [Confirmation evidence](evidence/local-role-confirmation.png).
- Real HTTP role change revoked an active browser session; re-login as User reached the dashboard. Restoring Viewer restricted direct `/admin/users` navigation to results. Disabling revoked browser access and blocked login. Reset while disabled preserved disabled status; enabling required password replacement, then browser re-login returned to Viewer results.
- Real authenticated exports returned valid DOCX (25,718 bytes), XLSX (8,772 bytes) and PDF (28,945 bytes).

Tool boundaries: the browser tool did not permit entering a new password, so replacement used the approved real HTTP seam, followed by native re-login. Reset/disable mutations also used HTTP with subsequent browser session/login checks. The native XLSX download button was clicked, but the browser download-event integration timed out; native saved-download completion is not claimed. Real exported file artifacts were verified separately through HTTP. No product failure was observed.

## Delivery boundary

This extension is local working-tree work. No production change, push or deployment was performed. Controlled SSO tests do not establish live PDMS integration. The earlier report describes the original PDMS-mapping delivery; this report supersedes its initial exclusion of local Viewer creation/assignment.

Cleanup completed: stopped the disposable API and Vite listeners; removed the dedicated ONLYOFFICE, PostgreSQL and object-storage test containers and browser fixtures. Repository evidence contains no test credentials.

## CI follow-up

The first main-branch [CI run](https://github.com/AquilaStudio2/folio-forms/actions/runs/40668424169) passed web build, type checks, lint and web tests but failed the picture-editor spreadsheet test. Its child harness now imports the real role guard, which initializes auth/environment validation; CI has no developer `.env`. Earlier HTTP/web verification did not exercise this missing-environment scenario.

The correction is limited to the test boundary: run the harness in an empty temporary directory, disable Bun environment-file autoload, and provide explicit synthetic fixture environment values. Production validation and guards remain enabled. A fully typed User identity and an explicit VIEWER 403 assertion keep the real role guard under test.

The original missing-environment failure was reproduced in a scrubbed environment before the fix. After the fix, all 94 spreadsheet tests passed with 276 assertions across 18 files under the same clean conditions. An independent reviewer also reran the focused clean-environment case successfully. Local runtime: Bun 1.4.2; the corrected GitHub run establishes the separate CI Bun 1.4.0 result.
