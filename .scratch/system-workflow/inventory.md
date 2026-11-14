# Declared source inventory

Commit: `530410f7527bbe66d369a0359c57ec1c0898f600`

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
| `/admin/results/$responseId/correction` | `apps/web/src/routes/admin/results/$responseId/correction.tsx:242` |
| `/admin/results/$responseId/` | `apps/web/src/routes/admin/results/$responseId/index.tsx:546` |
| `/admin/results/` | `apps/web/src/routes/admin/results/index.tsx:810` |
| `/admin/results` | `apps/web/src/routes/admin/results.tsx:5` |
| `/admin/users` | `apps/web/src/routes/admin/users.tsx:749` |
| `/admin` | `apps/web/src/routes/admin.tsx:35` |
| `/change-password` | `apps/web/src/routes/change-password.tsx:229` |
| `/dashboard` | `apps/web/src/routes/dashboard.tsx:383` |
| `/forms/$publicId/fill` | `apps/web/src/routes/forms/$publicId/fill.tsx:1407` |
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
| POST | `/api/admin/users/:id/password-reset` | `apps/server/src/routes/accounts.ts:609` |
| GET | `/api/admin/ai-authoring` | `apps/server/src/routes/ai-authoring.ts:21` |
| POST | `/api/admin/ai-authoring/sessions` | `apps/server/src/routes/ai-authoring.ts:26` |
| GET | `/api/admin/ai-authoring/sessions/current` | `apps/server/src/routes/ai-authoring.ts:57` |
| POST | `/api/admin/ai-authoring/sessions/:sessionId/revisions` | `apps/server/src/routes/ai-authoring.ts:69` |
| GET | `/api/admin/ai-authoring/sessions/:sessionId/docx` | `apps/server/src/routes/ai-authoring.ts:97` |
| DELETE | `/api/admin/ai-authoring/sessions/:sessionId` | `apps/server/src/routes/ai-authoring.ts:117` |
| GET | `/api/admin/audit-events` | `apps/server/src/routes/audit.ts:24` |
| POST | `/api/auth/sign-in/email` | `apps/server/src/routes/auth.ts:27` |
| GET | `/api/session` | `apps/server/src/routes/auth.ts:46` |
| POST | `/api/account/password` | `apps/server/src/routes/auth.ts:69` |
| POST | `/api/auth/sign-out` | `apps/server/src/routes/auth.ts:159` |
| ALL | `/api/auth/*` | `apps/server/src/routes/auth.ts:187` |
| POST | `/api/editor-leases/:id/renew` | `apps/server/src/routes/editor-leases.ts:14` |
| DELETE | `/api/editor-leases/:id` | `apps/server/src/routes/editor-leases.ts:23` |
| GET | `/api/admin/forms/:publicId/editor-config` | `apps/server/src/routes/form-authoring.ts:118` |
| GET | `/api/admin/forms/:publicId/schema` | `apps/server/src/routes/form-authoring.ts:236` |
| GET | `/api/admin/forms/:publicId/field-rules` | `apps/server/src/routes/form-authoring.ts:244` |
| PATCH | `/api/admin/forms/:publicId/field-rules` | `apps/server/src/routes/form-authoring.ts:271` |
| POST | `/api/admin/forms/:publicId/save` | `apps/server/src/routes/form-authoring.ts:452` |
| POST | `/api/admin/forms/:publicId/publish` | `apps/server/src/routes/form-authoring.ts:584` |
| GET | `/api/admin/forms/:publicId/submissions` | `apps/server/src/routes/form-authoring.ts:708` |
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
| GET | `/onlyoffice/document/:key` | `apps/server/src/routes/onlyoffice.ts:59` |
| GET | `/onlyoffice-plugin/config.json` | `apps/server/src/routes/onlyoffice.ts:129` |
| GET | `/onlyoffice-plugin/pdms-project/config.json` | `apps/server/src/routes/onlyoffice.ts:169` |
| GET | `/onlyoffice-plugin/pdms-project/index.html` | `apps/server/src/routes/onlyoffice.ts:197` |
| GET | `/onlyoffice-plugin/pdms-project/popup.js` | `apps/server/src/routes/onlyoffice.ts:198` |
| GET | `/onlyoffice-plugin/upload-poc/config.json` | `apps/server/src/routes/onlyoffice.ts:199` |
| GET | `/onlyoffice-plugin/upload-poc/index.html` | `apps/server/src/routes/onlyoffice.ts:228` |
| GET | `/onlyoffice-plugin/upload-poc/picker.js` | `apps/server/src/routes/onlyoffice.ts:229` |
| GET | `/onlyoffice-plugin` | `apps/server/src/routes/onlyoffice.ts:230` |
| GET | `/onlyoffice-plugin/` | `apps/server/src/routes/onlyoffice.ts:231` |
| GET | `/onlyoffice-plugin/index.html` | `apps/server/src/routes/onlyoffice.ts:232` |
| GET | `/onlyoffice-plugin/plugin.js` | `apps/server/src/routes/onlyoffice.ts:233` |
| GET | `/onlyoffice-plugin/resources/light/settings.svg` | `apps/server/src/routes/onlyoffice.ts:234` |
| GET | `/onlyoffice-plugin/resources/dark/settings.svg` | `apps/server/src/routes/onlyoffice.ts:237` |
| POST | `/onlyoffice/callback` | `apps/server/src/routes/onlyoffice.ts:240` |
| GET | `/api/operations/:id` | `apps/server/src/routes/operations.ts:19` |
| POST | `/api/editor/pdms-project-catalog/retry` | `apps/server/src/routes/pdms-project-catalog.ts:101` |
| POST | `/api/integrations/prefill/handoffs` | `apps/server/src/routes/prefill.ts:29` |
| POST | `/api/integrations/prefill/status` | `apps/server/src/routes/prefill.ts:77` |
| POST | `/prefill/handoff` | `apps/server/src/routes/prefill.ts:115` |
| GET | `/prefill/handoff` | `apps/server/src/routes/prefill.ts:162` |
| GET | `/api/forms/:publicId` | `apps/server/src/routes/public-forms.ts:44` |
| GET | `/api/forms/:publicId/editor-config` | `apps/server/src/routes/public-forms.ts:81` |
| GET | `/api/forms/:publicId/my-submissions` | `apps/server/src/routes/public-forms.ts:100` |
| GET | `/api/forms/:publicId/my-submissions/export` | `apps/server/src/routes/public-forms.ts:110` |
| POST | `/api/forms/:publicId/start` | `apps/server/src/routes/public-forms.ts:128` |
| GET | `/api/responses/:id/attachment-operations/:checkpoint` | `apps/server/src/routes/response-actions.ts:108` |
| POST | `/api/responses/:id/attachment-operations/:checkpoint/recover` | `apps/server/src/routes/response-actions.ts:155` |
| POST | `/api/forms/:publicId/draft` | `apps/server/src/routes/response-actions.ts:168` |
| POST | `/api/forms/:publicId/submit` | `apps/server/src/routes/response-actions.ts:388` |
| GET | `/api/responses/deletion-status` | `apps/server/src/routes/responses.ts:71` |
| GET | `/api/responses/:id/attachment-status` | `apps/server/src/routes/responses.ts:75` |
| GET | `/api/responses/me` | `apps/server/src/routes/responses.ts:100` |
| GET | `/api/responses/:id/corrections` | `apps/server/src/routes/responses.ts:134` |
| POST | `/api/responses/:id/editor-export/:format` | `apps/server/src/routes/responses.ts:266` |
| GET | `/api/responses/:id/draft/viewer-config` | `apps/server/src/routes/responses.ts:380` |
| GET | `/api/responses/:id/draft/:format` | `apps/server/src/routes/responses.ts:419` |
| DELETE | `/api/admin/responses/:id` | `apps/server/src/routes/responses.ts:505` |
| DELETE | `/api/responses/:id` | `apps/server/src/routes/responses.ts:548` |
| GET | `/api/admin/results/attachment-follow-up` | `apps/server/src/routes/results.ts:357` |
| POST | `/api/admin/results/attachment-follow-up/:operationId/settle` | `apps/server/src/routes/results.ts:369` |
| POST | `/api/admin/results/attachment-follow-up/:operationId/cancel` | `apps/server/src/routes/results.ts:385` |
| GET | `/api/admin/results` | `apps/server/src/routes/results.ts:408` |
| GET | `/api/admin/results/:id` | `apps/server/src/routes/results.ts:486` |
| GET | `/api/admin/results/:id/viewer-config` | `apps/server/src/routes/results.ts:636` |
| GET | `/api/admin/results/:id/correction/editor-config` | `apps/server/src/routes/results.ts:711` |
| POST | `/api/admin/results/:id/correction` | `apps/server/src/routes/results.ts:724` |
| POST | `/api/admin/results/:id/correction/workspace` | `apps/server/src/routes/results.ts:727` |
| GET | `/api/admin/forms/:publicId/attachment-categories` | `apps/server/src/routes/spreadsheet-authoring.ts:234` |
| GET | `/api/admin/forms/:publicId/spreadsheet-bindings` | `apps/server/src/routes/spreadsheet-authoring.ts:244` |
| PATCH | `/api/admin/forms/:publicId/spreadsheet-bindings` | `apps/server/src/routes/spreadsheet-authoring.ts:261` |
| POST | `/api/admin/forms/:publicId/spreadsheet-bindings/recover` | `apps/server/src/routes/spreadsheet-authoring.ts:458` |
| GET | `/api/submissions/:id/data` | `apps/server/src/routes/submissions.ts:42` |
| GET | `/api/submissions/:id/corrections` | `apps/server/src/routes/submissions.ts:98` |
| GET | `/api/submissions/:id/json` | `apps/server/src/routes/submissions.ts:207` |
| GET | `/api/submissions/:id/:format` | `apps/server/src/routes/submissions.ts:240` |
| GET | `/api/submissions/:id/pdf` | `apps/server/src/routes/submissions.ts:293` |
| GET | `/health` | `apps/server/src/app.ts:200` |
| GET | `/ready` | `apps/server/src/app.ts:201` |

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
| PublishedTemplate | `published_templates` | `packages/db/prisma/schema.prisma:276` |
| FieldManifest | `field_manifests` | `packages/db/prisma/schema.prisma:294` |
| ManifestField | `manifest_fields` | `packages/db/prisma/schema.prisma:307` |
| PrefillConfiguration | `prefill_configurations` | `packages/db/prisma/schema.prisma:336` |
| PrefillField | `prefill_fields` | `packages/db/prisma/schema.prisma:351` |
| Response | `responses` | `packages/db/prisma/schema.prisma:366` |
| PrefillSnapshot | `prefill_snapshots` | `packages/db/prisma/schema.prisma:397` |
| Submission | `submissions` | `packages/db/prisma/schema.prisma:414` |
| Correction | `corrections` | `packages/db/prisma/schema.prisma:436` |
| Handoff | `handoffs` | `packages/db/prisma/schema.prisma:459` |
| PendingClaim | `pending_claims` | `packages/db/prisma/schema.prisma:488` |
| Operation | `operations` | `packages/db/prisma/schema.prisma:502` |
| CallbackClaim | `callback_claims` | `packages/db/prisma/schema.prisma:539` |
| EditorLease | `editor_leases` | `packages/db/prisma/schema.prisma:553` |
| ObjectCleanupIntent | `object_cleanup_intents` | `packages/db/prisma/schema.prisma:578` |
| AuditEvent | `audit_events` | `packages/db/prisma/schema.prisma:592` |
| LoginFailure | `login_failures` | `packages/db/prisma/schema.prisma:610` |
| DeletionTombstone | `deletion_tombstones` | `packages/db/prisma/schema.prisma:624` |
| PdmsProjectCatalogSession | `pdms_project_catalog_sessions` | `packages/db/prisma/schema.prisma:640` |
| EcmAuthState | `ecm_auth_states` | `packages/db/prisma/schema.prisma:663` |
| EcmCategoryCatalog | `ecm_category_catalogs` | `packages/db/prisma/schema.prisma:676` |
| EcmAttachmentBatch | `ecm_attachment_batches` | `packages/db/prisma/schema.prisma:685` |
| EcmAttachmentVersion | `ecm_attachment_versions` | `packages/db/prisma/schema.prisma:704` |
| EcmAttachmentReference | `ecm_attachment_references` | `packages/db/prisma/schema.prisma:732` |
| EcmAttachmentCleanup | `ecm_attachment_cleanups` | `packages/db/prisma/schema.prisma:743` |

## Status enums

| Enum | Values |
| --- | --- |
| `FormStatus` | `draft`, `published`, `archived` |
| `ResponseStatus` | `draft`, `submitting`, `submitted` |
| `OperationStatus` | `pending`, `processing`, `completed`, `failed` |
| `HandoffStatus` | `pending`, `reserved`, `consumed`, `expired`, `deleted` |
| `LegacyAccountLinkStatus` | `pending`, `approved`, `rejected`, `linked` |
