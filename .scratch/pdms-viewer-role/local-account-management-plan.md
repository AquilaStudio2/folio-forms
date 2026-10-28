# VIEWER through Folio account management

Status: ready-for-human

Date: 28 October 2026

Branch: `feature/pdms-viewer-role`

Feature review base: `617b424d4b6ec21032c433e66bf11b9eef74fd22`

Planning snapshot: `3d0cf4b`. User approved implementation on 28 October 2026. The sections below preserve the implementation requirements; completion evidence is recorded in [the local implementation report](local-account-management-report.md).

## Outcome and scope

Admin can create and manage a local VIEWER from the existing `/admin/users` page, using the same account lifecycle as Admin/User. This extends the initial PDMS-only creation scope. A locally created VIEWER and a PDMS-mapped VIEWER have the same effective permissions: inspect all saved results and download available exports through the existing results pages. Account administration remains Admin-only. VIEWER may maintain their own password and sign out through existing authentication flows.

Use the existing account model, credential system, endpoints and pages. No separate Viewer page, account table, public registration flow or new PDMS role is needed. The earlier `viewer` enum migration remains a deployment prerequisite; this extension should not require another schema migration. Do not bulk-change existing accounts.

## Verified gaps

| Area | Current behavior | Planned work |
| --- | --- | --- |
| Backend creation | `POST /api/admin/users` accepts only admin/user | Accept viewer with the same validation, credential, transaction and audit lifecycle |
| Backend role update | `PATCH /api/admin/users/:id` accepts only admin/user | Accept viewer; preserve role-change session invalidation and last-enabled-Admin guard |
| Create and filter UI | Existing selects offer only Admin/User | Add VIEWER to both existing controls |
| Role actions | Binary promote/demote, with non-promote requests mapped to user | Explicit target role and confirmation, supporting all three roles |
| Pending account-link UI | `legacy-account-links.tsx` treats non-user roles as Admin and disables approval | Correct Viewer labeling/eligibility to match backend review policy; allow Admin to review an eligible Viewer link |
| Existing infrastructure | Role types, badges, list API filter, identity and results guards understand viewer | Verify lifecycle integration; preserve existing behavior rather than add parallel implementations |

Primary backend file: `apps/server/src/routes/accounts.ts`. Primary frontend files: `apps/web/src/features/admin-users/account-panels.tsx`, `user-list.tsx`, `model.ts`, `legacy-account-links.tsx`, and `apps/web/src/routes/admin/users.tsx`. Recheck shared API types and authentication routes where tests identify integration gaps.

## Required behavior

### Create and sign in

Admin chooses VIEWER while entering name/email in the existing creation form. Keep email normalization, duplicate rejection, required fields, temporary-password generation and existing credential display/copy/clear behavior. Successful local creation yields an enabled viewer requiring password replacement on local first login. Reject invalid role strings and creation attempts by User/VIEWER.

Local login first reaches the existing forced password-change flow. Successful replacement revokes the temporary session and requires login again; the next login routes to `/admin/results` or an allowed results destination. A stale return destination such as `/admin/users`, an editor or `/dashboard` must not bypass the Viewer route guard. Refresh and subsequent login retain viewer identity. No default password or seeded production account is part of this work.

### Change role

Support Admin → User, Admin → VIEWER, User → Admin, User → VIEWER, VIEWER → Admin and VIEWER → User. Show current and target role explicitly in the existing row/confirmation interaction. Cancel sends no request; successful update refreshes the row/filter results; failure retains the current role and displays the existing actionable error. Do not infer a target from a binary promote/demote label.

Keep the current account transaction/locking and audit path. A role change revokes existing sessions; stale sessions and editing capabilities must not continue writing. Existing responses remain owned by the same account and are not deleted or reassigned. A new Viewer cannot edit even their own older responses. Preserve existing cleanup of active authoring work after revocation.

Allow self-demotion only when another enabled Admin remains. Leave the management page after successful self-change and require authentication again; local login then resolves the correct role landing. Deny removal of the last enabled Admin through role change, disabling or deletion, including concurrent attempts. A same-role PATCH currently revokes sessions: preserve that endpoint behavior and do not change the SSO baseline. Disable the UI action when the selected role is already current. Restoring a Viewer to User must not revive capabilities issued to the old, revoked session.

### Manage the account

List and filter VIEWER alongside existing roles, including email/status filters and pagination. Preserve labels after reload and after unrelated account edits.

For local Viewer credentials, Admin can reset the password through the existing temporary-password flow. Check old sessions/password cease working, forced replacement works, and identity remains viewer. Resetting a disabled Viewer must not enable the account; enabling later retains the password-change requirement. Preserve the existing restriction on resetting one's own password through Admin controls; own password changes use the existing password page. Clear temporary credentials on subsequent actions, filtering, pagination and page exit; preserve pending credential-request navigation guards.

Enable/disable, email change and deletion use the existing policies and confirmation flows. Disabled accounts cannot sign in locally or through SSO. Re-enabling preserves viewer and does not restore old sessions. Email change revokes sessions and preserves existing account-link review invalidation. Deletion obeys the existing response/data-erasure preconditions: a converted Viewer may still own responses; only Admin can resolve those conditions. Do not silently delete those responses to make account deletion succeed.

SSO-only accounts have no local credential. Do not silently create a password credential during reset or change the existing login-method policy. Cover the existing failure behavior and avoid implying password reset succeeded. If improving that generic error becomes necessary, record it as a separate, explicit scope decision.

Audit creation, role changes and lifecycle mutations through existing events. User and Viewer exchange writing rights for cross-owner reading, so neither transition is simply a promotion/demotion. Plan to retain existing Admin-related promotion/demotion events and use the existing `update_user` event with `change: "role_changed"` for User ↔ Viewer. If role metadata is added, update the strict manual-audit metadata whitelist in `erasure-audit.ts`; never record temporary passwords or credentials.

Deleting a linked account is not a permanent PDMS identity ban: existing cascades remove its mapping and a later permitted SSO can provision again. Preserve this behavior; disabling remains the existing way to block that account's access.

### Preserve PDMS interaction

Follow accepted ADR 0002: manual edits change effective `User.role` only, not `Account.lastMappedRole`. For example, after a viewer mapping is established, a manual switch to User stays User on the next SSO if the mapped PDMS role is unchanged. If that mapping later changes, the new mapping replaces the effective role and invalidates older sessions as before.

A null baseline still applies incoming mapping on first successful SSO, even if Admin previously selected VIEWER locally. Existing reviewed account linking applies to locally created Viewers: matching email alone cannot bind an identity. Completed links remain keyed by provider/subject. Preserve disabled-account rejection, last-Admin protection, stale SSO transaction/account-switch behavior and serialized manual/SSO updates.

In the existing pending-link panel, display the Viewer role correctly and allow Admin to approve an enabled Viewer whose current evidence is eligible under backend policy. Approval still requires a fresh SSO before binding/access. Add rendered UI coverage for eligible Viewer approval and for disabled, stale or email-changed evidence; do not rely only on HTTP link tests. Preserve the existing revision-based rejection/review workflow and align eligibility with the accepted backend rules.

Preserve the distinction between login methods: local temporary-password replacement is required; SSO may bypass that local-only requirement under the existing ADR without clearing it. Effective role is the same for both login methods.

## Implementation and TDD sequence

Use the already-approved public test seams. Work one failing behavior → minimal implementation → passing behavior at a time. Reuse existing suites and fixtures; do not add a new test harness.

1. **Create local VIEWER:** account HTTP creation/validation and local login/password-change; then creation UI through the real router. Connect the two in the isolated browser.
2. **Change roles:** HTTP transitions and authorization, session/capability revocation and last-Admin cases; then explicit target selection, confirmation, cancel/error handling and self-demotion UI.
3. **Complete lifecycle:** list/filter/pagination, reset, disable/enable, email update, guarded deletion and audit behavior. Add regressions where existing coverage does not exercise viewer. Preserve established generic account behavior.
4. **SSO consistency:** manual override with unchanged/changed/null baseline, linking review through both the existing pending-link UI and HTTP, disabled accounts and concurrent/stale operations. Use controlled exchange fixtures.
5. **Verify access and review:** locally created Viewer sees other owners' results/downloads and is denied mutation/admin access through both direct API and direct URL. Re-run Admin/User regressions and independent reviews, then resolve findings and rerun affected checks.

Assign backend lifecycle/API work to `sol_worker` and frontend existing-user-page work to another `sol_worker`; ownership must avoid overlapping files. Main agent coordinates API behavior and integration. After implementation, separate `sol_reviewer` agents review Standards and Spec against the agreed base, including this extension. Refactoring belongs to review, not the TDD loop.

## Evidence and acceptance

| Boundary | Required evidence | Limit |
| --- | --- | --- |
| Real account/session HTTP | Creation, local password flow, all six role transitions, invalid/unauthorized requests, lifecycle and audit, session/capability revocation, last Admin | Does not prove browser navigation |
| Real SSO HTTP with controlled exchange | Baseline cases, reviewed link, disabled account, stale/concurrent role changes | Does not prove live PDMS |
| Existing UI through real router/auth provider | Create/filter/change-role interaction, explicit confirmation, pending/error/cancel states, Viewer link-review eligibility, self-demotion, forced password change, return destinations and forbidden direct URLs | Fixtures do not prove the live server path |
| Isolated local browser + real server | Admin creates Viewer, copies temporary password, Viewer signs in/changes password, views another owner's DOCX/XLSX results and downloads; Admin changes role/disables/resets and old session loses access | Local verification only; no production effects |

Extend `apps/server/test/http/admin-user-workflow.test.ts` and its scenario helpers, `viewer-role.test.ts`, relevant `legacy-roles`/`legacy-review` suites, and existing web lifecycle/UI tests. Extend two-role fixture types where necessary. Replace the old assertion in `apps/web/test/ui/viewer-access.test.tsx` that VIEWER is absent from account-management options: it reflects the superseded scope. If a new HTTP suite is necessary, register it in `apps/server/package.json` so the root workflow actually executes it. Verify negative writes leave saved results unchanged.

Run the relevant HTTP and web suites, then required root formatting/lint, type checks and build. Record failing/passing TDD evidence, actual commands/results, browser observations and limitations in the feature report. Reuse the existing DOCX/XLSX read-only implementation; report any observed integration regression before broadening scope.

Completion requires the entire local creation-to-use flow to pass, account lifecycle parity to be covered, Admin/User regressions to pass, and reviewer findings to be addressed. Update CONTEXT/README and the feature report to distinguish local creation from PDMS provisioning. Commit/push/deploy are separate delivery actions; this document does not claim implementation or deployment.
