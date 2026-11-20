# Declared source inventory

Commit: `666c91e4cce1f9a616c1c79a4d5ea89718a3b37b`

Regenerate: `python3 .scratch/system-workflow/survey.py`

These are source declarations, not a live deployment or endpoint-availability check.

## Pages and route layouts

| Route | Source |
| --- | --- |
| `__root` | `apps/web/src/routes/__root.tsx:1` |
| `/admin/audit` | `apps/web/src/routes/admin/audit.tsx:330` |
| `/admin/forms/$formId/` | `apps/web/src/routes/admin/forms/$formId/index.tsx:905` |
| `/admin/forms/$formId/submissions/$submissionId` | `apps/web/src/routes/admin/forms/$formId/submissions/$submissionId.tsx:278` |
| `/admin/forms/$formId/submissions/` | `apps/web/src/routes/admin/forms/$formId/submissions/index.tsx:305` |
| `/admin/forms/$formId/submissions` | `apps/web/src/routes/admin/forms/$formId/submissions.tsx:6` |
| `/admin/forms/$formId` | `apps/web/src/routes/admin/forms/$formId.tsx:6` |
| `/admin/forms/new` | `apps/web/src/routes/admin/forms/new.tsx:367` |
| `/admin/` | `apps/web/src/routes/admin/index.tsx:5` |
| `/admin/results/$responseId/correction` | `apps/web/src/routes/admin/results/$responseId/correction.tsx:304` |
| `/admin/results/$responseId/` | `apps/web/src/routes/admin/results/$responseId/index.tsx:607` |
| `/admin/results/` | `apps/web/src/routes/admin/results/index.tsx:813` |
| `/admin/results` | `apps/web/src/routes/admin/results.tsx:5` |
| `/admin/storage-templates` | `apps/web/src/routes/admin/storage-templates.tsx:478` |
| `/admin/users` | `apps/web/src/routes/admin/users.tsx:749` |
| `/admin` | `apps/web/src/routes/admin.tsx:35` |
| `/change-password` | `apps/web/src/routes/change-password.tsx:229` |
| `/dashboard` | `apps/web/src/routes/dashboard.tsx:427` |
| `/forms/$publicId/fill` | `apps/web/src/routes/forms/$publicId/fill.tsx:1414` |
| `/forms/$publicId/submissions` | `apps/web/src/routes/forms/$publicId/submissions.tsx:243` |
| `/handoff` | `apps/web/src/routes/handoff.tsx:59` |
| `/` | `apps/web/src/routes/index.tsx:26` |
| `/legacy-sso/confirm` | `apps/web/src/routes/legacy-sso.confirm.tsx:212` |
| `/login` | `apps/web/src/routes/login.tsx:320` |
| `/receipt/$submissionId` | `apps/web/src/routes/receipt/$submissionId.tsx:225` |

## API endpoints

| Method | Path | Source |
| --- | --- | --- |
| GET | `/api/admin/account-links` | `apps/server/src/routes/accounts.ts:53` |
| POST | `/api/admin/account-links/:id/approve` | `apps/server/src/routes/accounts.ts:97` |
| POST | `/api/admin/account-links/:id/reject` | `apps/server/src/routes/accounts.ts:129` |
| GET | `/api/admin/users` | `apps/server/src/routes/accounts.ts:161` |
| POST | `/api/admin/users` | `apps/server/src/routes/accounts.ts:224` |
| PATCH | `/api/admin/users/:id` | `apps/server/src/routes/accounts.ts:301` |
| DELETE | `/api/admin/users/:id` | `apps/server/src/routes/accounts.ts:471` |
| POST | `/api/admin/users/:id/password-reset` | `apps/server/src/routes/accounts.ts:586` |
| GET | `/api/admin/audit-events` | `apps/server/src/routes/audit.ts:24` |
| POST | `/api/auth/sign-in/email` | `apps/server/src/routes/auth.ts:26` |
| GET | `/api/session` | `apps/server/src/routes/auth.ts:45` |
| POST | `/api/account/password` | `apps/server/src/routes/auth.ts:64` |
| POST | `/api/auth/sign-out` | `apps/server/src/routes/auth.ts:144` |
| ALL | `/api/auth/*` | `apps/server/src/routes/auth.ts:153` |
| POST | `/api/editor-leases/:id/renew` | `apps/server/src/routes/editor-leases.ts:14` |
| DELETE | `/api/editor-leases/:id` | `apps/server/src/routes/editor-leases.ts:23` |
| GET | `/api/admin/forms/:publicId/editor-config` | `apps/server/src/routes/form-authoring.ts:152` |
| POST | `/api/admin/forms/:publicId/xlsx-draft/recover` | `apps/server/src/routes/form-authoring.ts:303` |
| GET | `/api/admin/forms/:publicId/schema` | `apps/server/src/routes/form-authoring.ts:453` |
| GET | `/api/admin/forms/:publicId/field-rules` | `apps/server/src/routes/form-authoring.ts:461` |
| PATCH | `/api/admin/forms/:publicId/field-rules` | `apps/server/src/routes/form-authoring.ts:488` |
| POST | `/api/admin/forms/:publicId/save` | `apps/server/src/routes/form-authoring.ts:669` |
| POST | `/api/admin/forms/:publicId/publish` | `apps/server/src/routes/form-authoring.ts:812` |
| GET | `/api/admin/forms/:publicId/submissions` | `apps/server/src/routes/form-authoring.ts:949` |
| GET | `/api/admin/forms` | `apps/server/src/routes/form-catalog.ts:70` |
| PATCH | `/api/admin/forms/:publicId` | `apps/server/src/routes/form-catalog.ts:75` |
| POST | `/api/admin/forms/:publicId/duplicate` | `apps/server/src/routes/form-catalog.ts:237` |
| DELETE | `/api/admin/forms/:publicId` | `apps/server/src/routes/form-catalog.ts:429` |
| POST | `/api/admin/forms` | `apps/server/src/routes/form-catalog.ts:645` |
| GET | `/api/admin/forms/:publicId/template/:format` | `apps/server/src/routes/form-catalog.ts:758` |
| GET | `/api/admin/forms/:publicId` | `apps/server/src/routes/form-catalog.ts:804` |
| GET | `/api/legacy-sso/status` | `apps/server/src/routes/legacy-sso.ts:22` |
| POST | `/api/legacy-sso/start` | `apps/server/src/routes/legacy-sso.ts:28` |
| GET | `/api/legacy-sso/callback` | `apps/server/src/routes/legacy-sso.ts:42` |
| GET | `/api/legacy-sso/switch` | `apps/server/src/routes/legacy-sso.ts:50` |
| POST | `/api/legacy-sso/switch/confirm` | `apps/server/src/routes/legacy-sso.ts:55` |
| POST | `/api/legacy-sso/switch/cancel` | `apps/server/src/routes/legacy-sso.ts:61` |
| POST | `/api/legacy-sso/session` | `apps/server/src/routes/legacy-sso.ts:67` |
| GET | `/onlyoffice/document/:key` | `apps/server/src/routes/onlyoffice.ts:72` |
| GET | `/onlyoffice-plugin/config.json` | `apps/server/src/routes/onlyoffice.ts:182` |
| GET | `/onlyoffice-plugin/pdms-project/config.json` | `apps/server/src/routes/onlyoffice.ts:222` |
| GET | `/onlyoffice-plugin/pdms-project/index.html` | `apps/server/src/routes/onlyoffice.ts:250` |
| GET | `/onlyoffice-plugin/pdms-project/popup.js` | `apps/server/src/routes/onlyoffice.ts:251` |
| GET | `/onlyoffice-plugin/attachment-category/config.json` | `apps/server/src/routes/onlyoffice.ts:252` |
| GET | `/onlyoffice-plugin/attachment-category/index.html` | `apps/server/src/routes/onlyoffice.ts:284` |
| GET | `/onlyoffice-plugin/attachment-category/popup.js` | `apps/server/src/routes/onlyoffice.ts:288` |
| GET | `/onlyoffice-plugin/upload-poc/config.json` | `apps/server/src/routes/onlyoffice.ts:292` |
| GET | `/onlyoffice-plugin/upload-poc/index.html` | `apps/server/src/routes/onlyoffice.ts:321` |
| GET | `/onlyoffice-plugin/upload-poc/picker.js` | `apps/server/src/routes/onlyoffice.ts:322` |
| GET | `/onlyoffice-plugin` | `apps/server/src/routes/onlyoffice.ts:323` |
| GET | `/onlyoffice-plugin/` | `apps/server/src/routes/onlyoffice.ts:324` |
| GET | `/onlyoffice-plugin/index.html` | `apps/server/src/routes/onlyoffice.ts:325` |
| GET | `/onlyoffice-plugin/plugin.js` | `apps/server/src/routes/onlyoffice.ts:326` |
| GET | `/onlyoffice-plugin/resources/light/settings.svg` | `apps/server/src/routes/onlyoffice.ts:327` |
| GET | `/onlyoffice-plugin/resources/dark/settings.svg` | `apps/server/src/routes/onlyoffice.ts:330` |
| POST | `/onlyoffice/callback` | `apps/server/src/routes/onlyoffice.ts:333` |
| GET | `/api/operations/:id` | `apps/server/src/routes/operations.ts:19` |
| POST | `/api/editor/pdms-project-catalog/retry` | `apps/server/src/routes/pdms-project-catalog.ts:101` |
| POST | `/api/integrations/prefill/handoffs` | `apps/server/src/routes/prefill.ts:29` |
| POST | `/api/integrations/prefill/status` | `apps/server/src/routes/prefill.ts:77` |
| POST | `/prefill/handoff` | `apps/server/src/routes/prefill.ts:115` |
| GET | `/prefill/handoff` | `apps/server/src/routes/prefill.ts:162` |
| GET | `/api/forms/:publicId` | `apps/server/src/routes/public-forms.ts:46` |
| GET | `/api/forms/:publicId/editor-config` | `apps/server/src/routes/public-forms.ts:83` |
| GET | `/api/forms/:publicId/my-submissions` | `apps/server/src/routes/public-forms.ts:106` |
| GET | `/api/forms/:publicId/my-submissions/export` | `apps/server/src/routes/public-forms.ts:116` |
| POST | `/api/forms/:publicId/start` | `apps/server/src/routes/public-forms.ts:134` |
| GET | `/api/responses/:id/attachment-operations/:checkpoint` | `apps/server/src/routes/response-actions.ts:108` |
| POST | `/api/responses/:id/attachment-operations/:checkpoint/recover` | `apps/server/src/routes/response-actions.ts:155` |
| POST | `/api/forms/:publicId/draft` | `apps/server/src/routes/response-actions.ts:168` |
| POST | `/api/forms/:publicId/submit` | `apps/server/src/routes/response-actions.ts:388` |
| GET | `/api/responses/deletion-status` | `apps/server/src/routes/responses.ts:69` |
| GET | `/api/responses/:id/attachment-status` | `apps/server/src/routes/responses.ts:73` |
| GET | `/api/responses/me` | `apps/server/src/routes/responses.ts:99` |
| GET | `/api/responses/:id/corrections` | `apps/server/src/routes/responses.ts:133` |
| POST | `/api/responses/:id/editor-export/:format` | `apps/server/src/routes/responses.ts:265` |
| GET | `/api/responses/:id/draft/viewer-config` | `apps/server/src/routes/responses.ts:379` |
| GET | `/api/responses/:id/draft/:format` | `apps/server/src/routes/responses.ts:422` |
| DELETE | `/api/admin/responses/:id` | `apps/server/src/routes/responses.ts:508` |
| DELETE | `/api/responses/:id` | `apps/server/src/routes/responses.ts:550` |
| GET | `/api/admin/results/attachment-follow-up` | `apps/server/src/routes/results.ts:371` |
| POST | `/api/admin/results/attachment-follow-up/:operationId/settle` | `apps/server/src/routes/results.ts:383` |
| POST | `/api/admin/results/attachment-follow-up/:operationId/cancel` | `apps/server/src/routes/results.ts:399` |
| GET | `/api/admin/results` | `apps/server/src/routes/results.ts:422` |
| GET | `/api/admin/results/:id` | `apps/server/src/routes/results.ts:500` |
| GET | `/api/admin/results/:id/viewer-config` | `apps/server/src/routes/results.ts:650` |
| GET | `/api/admin/results/:id/correction/editor-config` | `apps/server/src/routes/results.ts:749` |
| POST | `/api/admin/results/:id/correction` | `apps/server/src/routes/results.ts:763` |
| POST | `/api/admin/results/:id/correction/workspace` | `apps/server/src/routes/results.ts:766` |
| GET | `/api/admin/forms/:publicId/attachment-categories` | `apps/server/src/routes/spreadsheet-authoring.ts:15` |
| GET | `/api/admin/forms/:publicId/spreadsheet-bindings` | `apps/server/src/routes/spreadsheet-authoring.ts:25` |
| PATCH | `/api/admin/forms/:publicId/spreadsheet-bindings` | `apps/server/src/routes/spreadsheet-authoring.ts:50` |
| POST | `/api/admin/forms/:publicId/spreadsheet-bindings/recover` | `apps/server/src/routes/spreadsheet-authoring.ts:57` |
| GET | `/api/admin/storage-templates/categories` | `apps/server/src/routes/storage-templates.ts:66` |
| GET | `/api/admin/storage-templates` | `apps/server/src/routes/storage-templates.ts:70` |
| POST | `/api/admin/storage-templates` | `apps/server/src/routes/storage-templates.ts:89` |
| PATCH | `/api/admin/storage-templates/:id` | `apps/server/src/routes/storage-templates.ts:101` |
| DELETE | `/api/admin/storage-templates/:id` | `apps/server/src/routes/storage-templates.ts:129` |
| GET | `/api/submissions/:id/data` | `apps/server/src/routes/submissions.ts:47` |
| GET | `/api/submissions/:id/corrections` | `apps/server/src/routes/submissions.ts:103` |
| GET | `/api/submissions/:id/json` | `apps/server/src/routes/submissions.ts:212` |
| GET | `/api/submissions/:id/:format` | `apps/server/src/routes/submissions.ts:245` |
| GET | `/api/submissions/:id/pdf` | `apps/server/src/routes/submissions.ts:298` |
| DELETE | `/api/admin/submissions/:id` | `apps/server/src/routes/submissions.ts:367` |
| GET | `/health` | `apps/server/src/app.ts:179` |
| GET | `/ready` | `apps/server/src/app.ts:180` |

## Database models

| Model | Table | Source |
| --- | --- | --- |
| StorageTemplate | `storage_templates` | `packages/db/prisma/schema.prisma:95` |
| User | `user` | `packages/db/prisma/schema.prisma:104` |
| LegacyAccountLinkRequest | `legacy_account_link_requests` | `packages/db/prisma/schema.prisma:132` |
| Session | `session` | `packages/db/prisma/schema.prisma:154` |
| Account | `account` | `packages/db/prisma/schema.prisma:173` |
| Verification | `verification` | `packages/db/prisma/schema.prisma:199` |
| Form | `forms` | `packages/db/prisma/schema.prisma:212` |
| TemplateDraft | `template_drafts` | `packages/db/prisma/schema.prisma:240` |
| DraftFieldRule | `draft_field_rules` | `packages/db/prisma/schema.prisma:257` |
| PublishedTemplate | `published_templates` | `packages/db/prisma/schema.prisma:289` |
| FieldManifest | `field_manifests` | `packages/db/prisma/schema.prisma:307` |
| ManifestField | `manifest_fields` | `packages/db/prisma/schema.prisma:320` |
| PrefillConfiguration | `prefill_configurations` | `packages/db/prisma/schema.prisma:353` |
| PrefillField | `prefill_fields` | `packages/db/prisma/schema.prisma:368` |
| Response | `responses` | `packages/db/prisma/schema.prisma:383` |
| PrefillSnapshot | `prefill_snapshots` | `packages/db/prisma/schema.prisma:414` |
| Submission | `submissions` | `packages/db/prisma/schema.prisma:431` |
| Correction | `corrections` | `packages/db/prisma/schema.prisma:453` |
| Handoff | `handoffs` | `packages/db/prisma/schema.prisma:476` |
| PendingClaim | `pending_claims` | `packages/db/prisma/schema.prisma:505` |
| Operation | `operations` | `packages/db/prisma/schema.prisma:519` |
| CallbackClaim | `callback_claims` | `packages/db/prisma/schema.prisma:556` |
| EditorLease | `editor_leases` | `packages/db/prisma/schema.prisma:570` |
| ObjectCleanupIntent | `object_cleanup_intents` | `packages/db/prisma/schema.prisma:595` |
| AuditEvent | `audit_events` | `packages/db/prisma/schema.prisma:609` |
| LoginFailure | `login_failures` | `packages/db/prisma/schema.prisma:627` |
| DeletionTombstone | `deletion_tombstones` | `packages/db/prisma/schema.prisma:641` |
| PdmsProjectCatalogSession | `pdms_project_catalog_sessions` | `packages/db/prisma/schema.prisma:657` |
| EcmAuthState | `ecm_auth_states` | `packages/db/prisma/schema.prisma:680` |
| EcmCategoryCatalog | `ecm_category_catalogs` | `packages/db/prisma/schema.prisma:693` |
| EcmAttachmentBatch | `ecm_attachment_batches` | `packages/db/prisma/schema.prisma:702` |
| EcmAttachmentIdentity | `ecm_attachment_identities` | `packages/db/prisma/schema.prisma:722` |
| EcmAttachmentVersion | `ecm_attachment_versions` | `packages/db/prisma/schema.prisma:735` |
| EcmAttachmentReference | `ecm_attachment_references` | `packages/db/prisma/schema.prisma:774` |
| EcmAttachmentCleanup | `ecm_attachment_cleanups` | `packages/db/prisma/schema.prisma:787` |

## Status enums

| Enum | Values |
| --- | --- |
| `FormStatus` | `draft`, `published`, `archived` |
| `ResponseStatus` | `draft`, `submitting`, `submitted` |
| `OperationStatus` | `pending`, `processing`, `completed`, `failed` |
| `HandoffStatus` | `pending`, `reserved`, `consumed`, `expired`, `deleted` |
| `LegacyAccountLinkStatus` | `pending`, `approved`, `rejected`, `linked` |
