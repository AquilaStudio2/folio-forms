# Declared source inventory

Commit: `44b63d08d738e1cced4f45d265f1195aef4fb789`

Regenerate: `python3 .scratch/system-workflow/survey.py`

These are source declarations, not a live deployment or endpoint-availability check.

## Pages and route layouts

| Route | Source |
| --- | --- |
| `__root` | `apps/web/src/routes/__root.tsx:1` |
| `/admin/ai-authoring` | `apps/web/src/routes/admin/ai-authoring.tsx:396` |
| `/admin/audit` | `apps/web/src/routes/admin/audit.tsx:330` |
| `/admin/forms/$formId/` | `apps/web/src/routes/admin/forms/$formId/index.tsx:879` |
| `/admin/forms/$formId/submissions/$submissionId` | `apps/web/src/routes/admin/forms/$formId/submissions/$submissionId.tsx:253` |
| `/admin/forms/$formId/submissions/` | `apps/web/src/routes/admin/forms/$formId/submissions/index.tsx:149` |
| `/admin/forms/$formId/submissions` | `apps/web/src/routes/admin/forms/$formId/submissions.tsx:6` |
| `/admin/forms/$formId` | `apps/web/src/routes/admin/forms/$formId.tsx:6` |
| `/admin/forms/new` | `apps/web/src/routes/admin/forms/new.tsx:367` |
| `/admin/` | `apps/web/src/routes/admin/index.tsx:5` |
| `/admin/results/$responseId/correction` | `apps/web/src/routes/admin/results/$responseId/correction.tsx:147` |
| `/admin/results/$responseId/` | `apps/web/src/routes/admin/results/$responseId/index.tsx:524` |
| `/admin/results/` | `apps/web/src/routes/admin/results/index.tsx:465` |
| `/admin/results` | `apps/web/src/routes/admin/results.tsx:5` |
| `/admin/users` | `apps/web/src/routes/admin/users.tsx:749` |
| `/admin` | `apps/web/src/routes/admin.tsx:35` |
| `/change-password` | `apps/web/src/routes/change-password.tsx:229` |
| `/dashboard` | `apps/web/src/routes/dashboard.tsx:367` |
| `/forms/$publicId/fill` | `apps/web/src/routes/forms/$publicId/fill.tsx:1337` |
| `/forms/$publicId/submissions` | `apps/web/src/routes/forms/$publicId/submissions.tsx:243` |
| `/handoff` | `apps/web/src/routes/handoff.tsx:59` |
| `/` | `apps/web/src/routes/index.tsx:26` |
| `/legacy-sso/confirm` | `apps/web/src/routes/legacy-sso.confirm.tsx:212` |
| `/login` | `apps/web/src/routes/login.tsx:320` |
| `/receipt/$submissionId` | `apps/web/src/routes/receipt/$submissionId.tsx:225` |

## API endpoints

| Method | Path | Source |
| --- | --- | --- |
| GET | `/api/admin/account-links` | `apps/server/src/routes/accounts.ts:59` |
| POST | `/api/admin/account-links/:id/approve` | `apps/server/src/routes/accounts.ts:103` |
| POST | `/api/admin/account-links/:id/reject` | `apps/server/src/routes/accounts.ts:135` |
| GET | `/api/admin/users` | `apps/server/src/routes/accounts.ts:167` |
| POST | `/api/admin/users` | `apps/server/src/routes/accounts.ts:230` |
| PATCH | `/api/admin/users/:id` | `apps/server/src/routes/accounts.ts:307` |
| DELETE | `/api/admin/users/:id` | `apps/server/src/routes/accounts.ts:485` |
| POST | `/api/admin/users/:id/password-reset` | `apps/server/src/routes/accounts.ts:587` |
| GET | `/api/admin/ai-authoring` | `apps/server/src/routes/ai-authoring.ts:21` |
| POST | `/api/admin/ai-authoring/sessions` | `apps/server/src/routes/ai-authoring.ts:26` |
| GET | `/api/admin/ai-authoring/sessions/current` | `apps/server/src/routes/ai-authoring.ts:57` |
| POST | `/api/admin/ai-authoring/sessions/:sessionId/revisions` | `apps/server/src/routes/ai-authoring.ts:69` |
| GET | `/api/admin/ai-authoring/sessions/:sessionId/docx` | `apps/server/src/routes/ai-authoring.ts:97` |
| DELETE | `/api/admin/ai-authoring/sessions/:sessionId` | `apps/server/src/routes/ai-authoring.ts:117` |
| GET | `/api/admin/audit-events` | `apps/server/src/routes/audit.ts:24` |
| POST | `/api/auth/sign-in/email` | `apps/server/src/routes/auth.ts:23` |
| GET | `/api/session` | `apps/server/src/routes/auth.ts:30` |
| POST | `/api/account/password` | `apps/server/src/routes/auth.ts:53` |
| POST | `/api/auth/sign-out` | `apps/server/src/routes/auth.ts:139` |
| ALL | `/api/auth/*` | `apps/server/src/routes/auth.ts:167` |
| POST | `/api/editor-leases/:id/renew` | `apps/server/src/routes/editor-leases.ts:14` |
| DELETE | `/api/editor-leases/:id` | `apps/server/src/routes/editor-leases.ts:23` |
| GET | `/api/admin/forms/:publicId/editor-config` | `apps/server/src/routes/form-authoring.ts:118` |
| GET | `/api/admin/forms/:publicId/schema` | `apps/server/src/routes/form-authoring.ts:227` |
| GET | `/api/admin/forms/:publicId/field-rules` | `apps/server/src/routes/form-authoring.ts:235` |
| PATCH | `/api/admin/forms/:publicId/field-rules` | `apps/server/src/routes/form-authoring.ts:262` |
| POST | `/api/admin/forms/:publicId/save` | `apps/server/src/routes/form-authoring.ts:443` |
| POST | `/api/admin/forms/:publicId/publish` | `apps/server/src/routes/form-authoring.ts:575` |
| GET | `/api/admin/forms/:publicId/submissions` | `apps/server/src/routes/form-authoring.ts:699` |
| GET | `/api/admin/forms` | `apps/server/src/routes/form-catalog.ts:69` |
| PATCH | `/api/admin/forms/:publicId` | `apps/server/src/routes/form-catalog.ts:74` |
| POST | `/api/admin/forms/:publicId/duplicate` | `apps/server/src/routes/form-catalog.ts:236` |
| DELETE | `/api/admin/forms/:publicId` | `apps/server/src/routes/form-catalog.ts:397` |
| POST | `/api/admin/forms` | `apps/server/src/routes/form-catalog.ts:613` |
| GET | `/api/admin/forms/:publicId/template/:format` | `apps/server/src/routes/form-catalog.ts:726` |
| GET | `/api/admin/forms/:publicId` | `apps/server/src/routes/form-catalog.ts:772` |
| GET | `/api/legacy-sso/status` | `apps/server/src/routes/legacy-sso.ts:25` |
| POST | `/api/legacy-sso/start` | `apps/server/src/routes/legacy-sso.ts:31` |
| GET | `/api/legacy-sso/callback` | `apps/server/src/routes/legacy-sso.ts:45` |
| GET | `/api/legacy-sso/switch` | `apps/server/src/routes/legacy-sso.ts:53` |
| POST | `/api/legacy-sso/switch/confirm` | `apps/server/src/routes/legacy-sso.ts:58` |
| POST | `/api/legacy-sso/switch/cancel` | `apps/server/src/routes/legacy-sso.ts:70` |
| POST | `/api/legacy-sso/session` | `apps/server/src/routes/legacy-sso.ts:82` |
| GET | `/onlyoffice/document/:key` | `apps/server/src/routes/onlyoffice.ts:52` |
| GET | `/onlyoffice-plugin/config.json` | `apps/server/src/routes/onlyoffice.ts:93` |
| GET | `/onlyoffice-plugin/pdms-project/config.json` | `apps/server/src/routes/onlyoffice.ts:133` |
| GET | `/onlyoffice-plugin/pdms-project/index.html` | `apps/server/src/routes/onlyoffice.ts:161` |
| GET | `/onlyoffice-plugin/pdms-project/popup.js` | `apps/server/src/routes/onlyoffice.ts:162` |
| GET | `/onlyoffice-plugin/upload-poc/config.json` | `apps/server/src/routes/onlyoffice.ts:163` |
| GET | `/onlyoffice-plugin/upload-poc/index.html` | `apps/server/src/routes/onlyoffice.ts:192` |
| GET | `/onlyoffice-plugin/upload-poc/picker.js` | `apps/server/src/routes/onlyoffice.ts:193` |
| GET | `/onlyoffice-plugin` | `apps/server/src/routes/onlyoffice.ts:194` |
| GET | `/onlyoffice-plugin/` | `apps/server/src/routes/onlyoffice.ts:195` |
| GET | `/onlyoffice-plugin/index.html` | `apps/server/src/routes/onlyoffice.ts:196` |
| GET | `/onlyoffice-plugin/plugin.js` | `apps/server/src/routes/onlyoffice.ts:197` |
| GET | `/onlyoffice-plugin/resources/light/settings.svg` | `apps/server/src/routes/onlyoffice.ts:198` |
| GET | `/onlyoffice-plugin/resources/dark/settings.svg` | `apps/server/src/routes/onlyoffice.ts:201` |
| POST | `/onlyoffice/callback` | `apps/server/src/routes/onlyoffice.ts:204` |
| GET | `/api/operations/:id` | `apps/server/src/routes/operations.ts:19` |
| POST | `/api/editor/pdms-project-catalog/retry` | `apps/server/src/routes/pdms-project-catalog.ts:101` |
| POST | `/api/integrations/prefill/handoffs` | `apps/server/src/routes/prefill.ts:29` |
| POST | `/api/integrations/prefill/status` | `apps/server/src/routes/prefill.ts:65` |
| POST | `/prefill/handoff` | `apps/server/src/routes/prefill.ts:93` |
| GET | `/prefill/handoff` | `apps/server/src/routes/prefill.ts:140` |
| GET | `/api/forms/:publicId` | `apps/server/src/routes/public-forms.ts:44` |
| GET | `/api/forms/:publicId/editor-config` | `apps/server/src/routes/public-forms.ts:81` |
| GET | `/api/forms/:publicId/my-submissions` | `apps/server/src/routes/public-forms.ts:102` |
| GET | `/api/forms/:publicId/my-submissions/export` | `apps/server/src/routes/public-forms.ts:112` |
| POST | `/api/forms/:publicId/start` | `apps/server/src/routes/public-forms.ts:130` |
| POST | `/api/forms/:publicId/draft` | `apps/server/src/routes/response-actions.ts:62` |
| POST | `/api/forms/:publicId/submit` | `apps/server/src/routes/response-actions.ts:240` |
| GET | `/api/responses/me` | `apps/server/src/routes/responses.ts:62` |
| GET | `/api/responses/:id/corrections` | `apps/server/src/routes/responses.ts:96` |
| POST | `/api/responses/:id/editor-export/:format` | `apps/server/src/routes/responses.ts:228` |
| GET | `/api/responses/:id/draft/:format` | `apps/server/src/routes/responses.ts:337` |
| DELETE | `/api/admin/responses/:id` | `apps/server/src/routes/responses.ts:405` |
| DELETE | `/api/responses/:id` | `apps/server/src/routes/responses.ts:449` |
| GET | `/api/admin/results` | `apps/server/src/routes/results.ts:271` |
| GET | `/api/admin/results/:id` | `apps/server/src/routes/results.ts:349` |
| GET | `/api/admin/results/:id/viewer-config` | `apps/server/src/routes/results.ts:499` |
| GET | `/api/admin/results/:id/correction/editor-config` | `apps/server/src/routes/results.ts:574` |
| POST | `/api/admin/results/:id/correction` | `apps/server/src/routes/results.ts:587` |
| POST | `/api/admin/results/:id/correction/workspace` | `apps/server/src/routes/results.ts:588` |
| GET | `/api/admin/forms/:publicId/spreadsheet-bindings` | `apps/server/src/routes/spreadsheet-authoring.ts:224` |
| PATCH | `/api/admin/forms/:publicId/spreadsheet-bindings` | `apps/server/src/routes/spreadsheet-authoring.ts:241` |
| POST | `/api/admin/forms/:publicId/spreadsheet-bindings/recover` | `apps/server/src/routes/spreadsheet-authoring.ts:365` |
| GET | `/api/submissions/:id/data` | `apps/server/src/routes/submissions.ts:40` |
| GET | `/api/submissions/:id/corrections` | `apps/server/src/routes/submissions.ts:96` |
| GET | `/api/submissions/:id/json` | `apps/server/src/routes/submissions.ts:205` |
| GET | `/api/submissions/:id/:format` | `apps/server/src/routes/submissions.ts:238` |
| GET | `/api/submissions/:id/pdf` | `apps/server/src/routes/submissions.ts:283` |
| GET | `/health` | `apps/server/src/app.ts:177` |
| GET | `/ready` | `apps/server/src/app.ts:178` |

## Private document worker

Separate private HTTP listener in `apps/server/src/document-worker-server.ts:170`, not part of the main API count.

| Method | Path |
| --- | --- |
| GET | `/health` |
| POST | `/run` |

## Database models

| Model | Table | Source |
| --- | --- | --- |
| User | `user` | `packages/db/prisma/schema.prisma:95` |
| LegacyAccountLinkRequest | `legacy_account_link_requests` | `packages/db/prisma/schema.prisma:123` |
| Session | `session` | `packages/db/prisma/schema.prisma:145` |
| Account | `account` | `packages/db/prisma/schema.prisma:164` |
| Verification | `verification` | `packages/db/prisma/schema.prisma:190` |
| Form | `forms` | `packages/db/prisma/schema.prisma:203` |
| TemplateDraft | `template_drafts` | `packages/db/prisma/schema.prisma:231` |
| DraftFieldRule | `draft_field_rules` | `packages/db/prisma/schema.prisma:248` |
| PublishedTemplate | `published_templates` | `packages/db/prisma/schema.prisma:274` |
| FieldManifest | `field_manifests` | `packages/db/prisma/schema.prisma:292` |
| ManifestField | `manifest_fields` | `packages/db/prisma/schema.prisma:305` |
| PrefillConfiguration | `prefill_configurations` | `packages/db/prisma/schema.prisma:332` |
| PrefillField | `prefill_fields` | `packages/db/prisma/schema.prisma:347` |
| Response | `responses` | `packages/db/prisma/schema.prisma:362` |
| PrefillSnapshot | `prefill_snapshots` | `packages/db/prisma/schema.prisma:393` |
| Submission | `submissions` | `packages/db/prisma/schema.prisma:410` |
| Correction | `corrections` | `packages/db/prisma/schema.prisma:432` |
| Handoff | `handoffs` | `packages/db/prisma/schema.prisma:455` |
| PendingClaim | `pending_claims` | `packages/db/prisma/schema.prisma:484` |
| Operation | `operations` | `packages/db/prisma/schema.prisma:498` |
| CallbackClaim | `callback_claims` | `packages/db/prisma/schema.prisma:535` |
| EditorLease | `editor_leases` | `packages/db/prisma/schema.prisma:549` |
| ObjectCleanupIntent | `object_cleanup_intents` | `packages/db/prisma/schema.prisma:574` |
| AuditEvent | `audit_events` | `packages/db/prisma/schema.prisma:588` |
| LoginFailure | `login_failures` | `packages/db/prisma/schema.prisma:606` |
| DeletionTombstone | `deletion_tombstones` | `packages/db/prisma/schema.prisma:620` |
| PdmsProjectCatalogSession | `pdms_project_catalog_sessions` | `packages/db/prisma/schema.prisma:633` |

## Status enums

| Enum | Values |
| --- | --- |
| `FormStatus` | `draft`, `published`, `archived` |
| `ResponseStatus` | `draft`, `submitting`, `submitted` |
| `OperationStatus` | `pending`, `processing`, `completed`, `failed` |
| `HandoffStatus` | `pending`, `reserved`, `consumed`, `expired`, `deleted` |
| `LegacyAccountLinkStatus` | `pending`, `approved`, `rejected`, `linked` |
