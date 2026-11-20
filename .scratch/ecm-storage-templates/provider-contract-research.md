# DCM Storage Templates: provider-contract research

Status: research complete; user decisions Q1–Q3 are closed. DCM-only retrieval, category-ID grouping and full Admin catalog CRUD are the confirmed plan; downloader/CRUD implementation and runtime verification remain work to do. No application or schema changes.

## Findings

1. **Supported, published inventory:** the fetched public collection contains five endpoints. It does **not publish an original-file download API**. This means absent from this collection, not proof DCM has no such API.
2. **Supported, local declaration only:** Ongoing declares one uploaded file object, including a string `file_token`, in `ECMUploadFileOutputSchema.data`. Different tokens on successive uploads fit this schema. The schema guarantees neither a new token per upload nor stable tokens, object independence, immutable versions, or alias behavior.
3. **Partial, routing:** published prose says template mode routes using conditions derived from the filename. Ongoing sends the filename and `template="1"`, without separate year/number/category fields. Neither source defines DCM's filename parser or proves the resulting category/folder. Exact `template_name` matching is user-reported DCM guidance, not a published parser specification.
4. **Conflicting:** published upload prose describes `data` as an array; Ongoing declares an object; the recorded live B receipt was an object. The existing Folio adapter requires a one-item array. The evidence identifies an adapter compatibility requirement, not permission to use search as a receipt fallback.
5. **Insufficient:** no inspected published contract establishes safe server-side original-byte retrieval for every required file type. Existing Folio `originalBytes` direct-GETs `file_link`; the prior live evidence identifies that link as an HTML viewer. Private viewer requests are not a supported download contract.

## Scope, snapshots and provenance

Read [local tracker](../../docs/agents/issue-tracker.md), [domain glossary](../../CONTEXT.md#storage-template-แม่แบบจัดเก็บเอกสาร), and [ADR 0004](../../docs/adr/0004-results-filters-use-scalar-field-tags.md). Dropping `fiscal_year` as a new-mode upload prerequisite does not change the scalar result-filter contract.

### Discovery status

- **Current automatic Hindsight recall: failed**, bank `pdms-knowledge`, `recall-timeout`, elapsed **20,040 ms**. No Knowledge was retrieved by that recall.
- The parent handoff separately supplied an earlier **retrieved** discovery. Its provenance is retained below as inherited navigation, not represented as this worker's successful recall. Local canonical Markdown was opened independently for Level 2 verification.
- Inherited BE document IDs: `pdms-ongoing-backend.integration.ongoing-services::part-005`, `pdms-ongoing-backend.integration.ongoing-services::part-009`, `pdms-ongoing-backend.integration.ongoing-services::part-016`, `pdms-ongoing-backend.integration.ongoing-services::part-029`. Parent subsequently supplied actual discovery chunk IDs: `pdms-knowledge_pdms-ongoing-backend.integration.ongoing-services::part-005_0`, `pdms-knowledge_pdms-ongoing-backend.integration.ongoing-services::part-009_3`, `pdms-knowledge_pdms-ongoing-backend.integration.ongoing-services::part-016_2`, `pdms-knowledge_pdms-ongoing-backend.integration.ongoing-services::part-029_1`. Stable document ID: `pdms-ongoing-backend.integration.ongoing-services`; source path: `pdms-ongoing-backend/docs/knowledge/integrations/ongoing-services.md`; source revision: `e51f2245fab13d55676de46ceb4781903ec41470`; inherited evidence `partial`, Human Review `pending`.
- Inherited FE document ID: `pdms-ongoing-project-management.page.financial-report.upload::part-002`. Parent subsequently supplied actual chunk ID: `pdms-knowledge_pdms-ongoing-project-management.page.financial-report.upload::part-002_1`. Stable document ID: `pdms-ongoing-project-management.page.financial-report.upload`; source path: `pdms-ongoing-project-management/docs/knowledge/pages/financial-report-upload.md`; source revision: `8cdad1830b6925bf3c5813b66f0263a7de295f35`; inherited status `phase2-partial`, Human Review `pending`.
- Additional local canonical owner `pdms-ongoing-backend.integration.financial-report-upstreams` was followed from the shared owner. Its Hindsight `document_id` and `chunk_id` are **missing**; it was read from local Markdown, not retrieved from the bank.
- Followed shared-owner `depends_on` to [answering policy](../../../pdms-knowledge/ANSWERING_POLICY.md#L23-L78) and [extraction contract](../../../pdms-knowledge/EXTRACTION_CONTRACT.md#L23-L85). Both declare empty `source_revisions`, Human Review `pending`. Financial-report permission/month/state dependencies are not evidence for external DCM routing/download, and no claims about those rules are made here.

### Published Postman snapshot

- [Official documentation](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1).
- [Public collection](https://documenter.getpostman.com/api/collections/3763886/2sAYHxnPG1), fetched **2026-11-16T16:07:58.426633+00:00**, HTTP **200**. Initial Python fetch without browser headers returned HTTP 403; browser User-Agent/Accept/Referer succeeded.
- Collection ID: `7b62e4de-664a-4225-8547-6696a958f078`.
- Raw response SHA-256: `db24a4d047b13ac45055dfdbb395d3a2e3ea0c04ae5240c641ea42f0392019d4`.
- ETag: `W/"362e-/lR1dxK7MK4rZdCyDzGDyVnWE08"`. Server Date: `Mon, 16 Nov 2026 16:07:58 GMT`. No Last-Modified header returned. Provider semantic/deployed revision **unavailable**; hash and ETag identify the fetched document, not DCM software.
- The collection was parsed in memory; only endpoint paths, non-login contract prose and response shapes were extracted. No raw collection, login body, credential, file token or private receipt URL is included in this report.
- Safety limitation: the generic documentation reader automatically rendered credential-bearing page metadata. It was not repeated here; avoid generic/raw reads of that page and filter future extraction before output. This does not establish credential validity.

### Canonical and current-source versions

Canonical shared owner [ongoing-services.md](../../../pdms-ongoing-backend/docs/knowledge/integrations/ongoing-services.md#L264-L277) records BE baseline `e51f2245fab13d55676de46ceb4781903ec41470`, Working Tree, inspected `2026-11-11T21:04:08.237156+00:00`, `phase2-partial`, tests/runtime `not_run`, Human Review `pending`, publication unauthorized. Read ECM sections [450–458](../../../pdms-ongoing-backend/docs/knowledge/integrations/ongoing-services.md#L450-L458), [1123–1176](../../../pdms-ongoing-backend/docs/knowledge/integrations/ongoing-services.md#L1123-L1176), and source references confirming both ECM source paths.

Followed [financial-report-upstreams.md:54–88](../../../pdms-ongoing-backend/docs/knowledge/integrations/financial-report-upstreams.md#L54-L88), same BE baseline, Working Tree inspection `2026-11-11T20:23:28.127630+07:00`, evidence partial/Human Review pending. [FE owner:64–74](../../../pdms-ongoing-project-management/docs/knowledge/pages/financial-report-upload.md#L64-L74) records BE baseline above and FE baseline `8cdad1830b6925bf3c5813b66f0263a7de295f35`, inspection `2026-11-11T19:30:13.720697+07:00`, Human Review pending. FE owner is used only as a canonical snapshot, not a claim that this worker inspected current FE source.

Current BE HEAD observed: `e51f2245fab13d55676de46ceb4781903ec41470`. Current Folio HEAD observed: `3ec718a5c7ec34549c0c8c5521310a38f66ee00c`. Sources were read from **Working Tree**, not asserted equal to committed/deployed contents. CodeGraph was called first with each explicit project path. It supplied Folio byte-retrieval/caller relationships and Ongoing schema/types. Ongoing upload/search closure bodies were not returned; the confirmed source ranges were opened directly. No relationship gaps were filled by guessing.

SHA-256 fingerprints of inspected files:

| File | SHA-256 |
| --- | --- |
| `pdms-ongoing-backend/docs/knowledge/integrations/ongoing-services.md` | `38a0fb09a817bc5b2cf255a0ebdd66b8f57ee7b0518911fdc00a7333d1a940c9` |
| `pdms-ongoing-backend/docs/knowledge/integrations/financial-report-upstreams.md` | `46c0de19f394052d243bffd8c4d4c594225129932383bb0a382ea22cf117646a` |
| `pdms-ongoing-project-management/docs/knowledge/pages/financial-report-upload.md` | `320f65a842ebee0fee8433a5284ca1d580e2ff23b22ebd95904b69a4243458cc` |
| `pdms-ongoing-backend/src/features/ECM/ecm.service.ts` | `21d95d641335dc46af991266ede3ee09af4635ddbfeb789759a13b3a51128c24` |
| `pdms-ongoing-backend/src/features/ECM/ecm.schema.ts` | `a016a3b1e5dda8f4b1ccb41832b1a26eba2f4bd1aaee3415fc4051d5c7469fb5` |
| `folio-forms/apps/server/src/ecm/client.ts` | `45ff028d47bdc6c78195a309ad3ed60c3ec6fabb0d8442052c5579095bd5dd53` |
| `folio-forms/apps/server/src/ecm/attachments.ts` | `88843bd4488011f1ddf25e9b31edf42c24fce9ce261f372815e23981b0259412` |

## Published contract, safely extracted

All paths below come from the fetched collection, not a DCM-host request.

| Method/path | Published meaning and limits |
| --- | --- |
| `POST /api/beeecm/public/login` | Inventory only; login item/body deliberately excluded. |
| `GET /api/beeecm/public/document/category` | Bearer required. Prose describes `{status: Integer, data: Array<{id: number, type: string}>, msg: String}`; sole stored 200 example is instead a bare array of `{id, type}`. Category ID/name data exists; no template lookup or category/template matching rules are published. |
| `POST /api/beeecm/public/search` | Bearer required. Required `text: String`, minimum 3, maximum 2048, described as filename or directory path. `DMS/ShareFiles` is the documented root directory. Response prose: `{status: Integer, data: File[], msg: String}`. No exact-match, token identity, uniqueness, sort order, pagination, settlement or original-byte download semantics are specified. |
| `POST /api/beeecm/public/file` | Bearer required. Multipart `documentFile: File` required; `template: Boolean` optional/default false. Exact prose for true: `เมื่อใช้อัพโหลดตามเงื่อนไขจากชื่อ`. `documentYear: String` length 4; `documentNumber: String` max 512; `documentCategory: String` max 512; all described as `sometimes` when template=false. Category example is a name, not a numeric ID. Response prose uses `{status: Integer, data: File[], msg: String}`. No saved upload response example exists in this collection snapshot. |
| `DELETE /api/beeecm/public/file` | Bearer required; required query `token: String`, documented length 64. Response `{status: Integer, data: Null, msg: String}`. No revision/alias/concurrency protection or byte-deletion guarantee is documented. |

Published File response fields: `file_name`, `file_size`, `file_type`, `file_title`, `file_descrip`, `file_path`, `file_token`, `file_link` are described as strings; `file_datetime_edit` as datetime. Prose does not specify size units, nullable fields or `file_link` media type/download behavior. `file_create` is present in Ongoing's local schema but not this published upload/search field table.

Direct endpoint citations: [category](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#c0127451-d895-41dc-83b0-ea74dfb69e57), [search](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#2155b17a-72a4-4c5c-affc-3ecb01aaac72), [upload](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#5a6ac7ac-1df3-49e6-a515-4dadfa024a78), [delete](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#0bb164e9-85fc-4886-9227-12c6f8c1d8e7).

**Supported absence within this snapshot:** all five endpoint methods/paths and all four non-login descriptions were inspected. No download-original endpoint, template registry, template-name grammar, duplicate-filename rule, token renewal/alias guarantee or version lookup was published there. These facts are **unavailable as provider guarantees**, not disproved globally.

## Current source versus external behavior

### Upload request and receipt

[Ongoing `ecm.service.ts:268–291`](../../../pdms-ongoing-backend/src/features/ECM/ecm.service.ts#L268-L291) appends `documentFile` with `options.fileName`, then `template` as `"1"` or `"0"`. Separate year/number/category fields are appended only in false mode. [Lines 296–325](../../../pdms-ongoing-backend/src/features/ECM/ecm.service.ts#L296-L325) POST to the configured ECM base, require HTTP 200 and return `response.data`; this service does not establish provider storage semantics.

[Ongoing `ecm.schema.ts:35–58`](../../../pdms-ongoing-backend/src/features/ECM/ecm.schema.ts#L35-L58) declares `data: ECMFileSchema`, not an array. `file_token`, `file_link`, filename/path/type/size/create/edit are strings; title/description are optional string-or-null. There is no cross-request equality/uniqueness constraint. **Supported:** a new-token receipt is representable. **Insufficient:** a guarantee of new tokens for every upload, stable tokens on overwrite, independent provider objects or safe deletion of aliases.

[Existing Folio `client.ts:566–613`](../../apps/server/src/ecm/client.ts#L566-L613) requires `data` to be an array of exactly one receipt. [Prior live record](planning.md#compatibility-ที่-implementation-ต้องจัดการ) records object-shaped B receipt. **Conflicting:** published array prose versus Ongoing object declaration and that observed receipt. Preserve actual upload receipt; do not manufacture success by querying search after a parser rejection.

### Search is not download or identity resolution

[Ongoing `ecm.service.ts:332–394`](../../../pdms-ongoing-backend/src/features/ECM/ecm.service.ts#L332-L394) searches by document-number text and returns the latest result's `file_link`; [48–61](../../../pdms-ongoing-backend/src/features/ECM/ecm.service.ts#L48-L61) chooses by descending parsed `file_datetime_edit`. [396–434](../../../pdms-ongoing-backend/src/features/ECM/ecm.service.ts#L396-L434) returns search data or an empty array. These functions return links/metadata, not original bytes, exact filename identity, routing verification or upload settlement proof.

### Original bytes

[Current Folio `originalBytes`:507–564](../../apps/server/src/ecm/client.ts#L507-L564) performs a same-origin, credential-omitting, no-redirect GET of the saved link, requires HTTP 200 and exact expected size, and bounds bytes at 10,000,000. It does not invoke a documented download API. [Caller `originalForChangedMetadata`:265–310](../../apps/server/src/ecm/attachments.ts#L265-L310) verifies a committed saved reference and account, then invokes this method when year/document number differs. Failure preserves saved data and returns `attachment_original_unavailable`.

[Prior authorized live record](planning.md) says `file_link` is an HTML viewer and native viewer used internal permission/read steps. **Supported within that recorded sample:** direct-link binary assumption fails. **Insufficient:** supported server download for all file types, including zero bytes, 10,000,000-byte files and password-protected files. Do not depend on PDF.js/private viewer routes. This report does not decide whether to add local original-byte storage; the parallel trusted-byte-source investigation owns the existing-source inventory.

### Routing and duplicate filenames

- **Supported, request construction:** filename plus template flag goes to DCM; local numeric `document_category_id` is not sent in this mode.
- **Partial, published rule:** template=true uses filename-derived conditions. No parser/normalization/extension/year/folder specification is published.
- **User-reported DCM guidance:** exact `template_name` must already match DCM; Folio catalog creation does not create a DCM template. See [the planning record's DCM guidance and destination evidence](planning.md). This establishes the reported requirement, not independently verified provider implementation.
- **Historical samples, Q2 now closed:** the earlier [recorded live A/B](planning.md) used distinct tokens/links and preserved B after DELETE A. The user's later screenshots establish same-name/same-destination overwrite with the same token/link. Accept that answered case; do not reopen Q2 or treat the earlier sample as a universal new-token rule. Same-identity overwrite must not be followed by DELETE of that shared token.
- **Additional parent-observed runtime evidence:** category GET returned id=2/type="2. มติ" while the sample folder label was "2. มติและการก่อหนี้". The user subsequently clarified that category identity only groups local template choices and type only labels them; folder-label matching/PM approval is not a Folio planning gate. See [the planning record](planning.md) for separate byte-retention evidence and the current scope.
- **Technical evidence limits:** all-type download/filename grammar and identity/deletion behavior across concurrency/environments are not established by one sample. These remain implementation/verification work, not a reason to reopen the user's storage choice or require category type text to match a physical folder. Ongoing's PDF filename guard does not narrow Folio file support; no suffix/UUID is authorized.

## Blockers: cleared versus owner evidence needed

| Blocker | What this research clears | Remaining owner/evidence |
| --- | --- | --- |
| Two-field template-mode request | **Cleared:** published mode semantics plus Ongoing current construction support `template="1"` and `documentFile` only. | No extra product decision needed for this shape. |
| Object receipt legitimacy | **Cleared for planning:** object shape is explicitly declared by Ongoing and observed for B. Existing Folio array-only parser is not sufficient for that receipt. | DCM should version the definitive per-mode success/error schema; do not retry an accepted upload to resolve shape. |
| Same-name/same-destination overwrite — Q2 | **Closed:** user test/screenshots establish overwrite with the same token/link. Do not require a new token or ask this again. | Implementation must preserve ownership/history checks and must not DELETE the shared current-file token. This is not an outstanding user decision. |
| Original-file re-upload after docs_number changes — Q1 | **Decision closed:** DCM is the sole original-file store; use trusted file_link from the original upload receipt to retrieve the file when needed. No RustFS/DB original-byte cache. | Implement and verify retrieval of exact original bytes for every in-scope type; HTML viewer success is not binary-download proof. Do not silently add another store or force file reselection. |
| Category relation and labels — Q3 | **Closed:** API id is the key relating local template_name entries; type only labels category headers/options in the two selects. | Validate local ID relationships and render provider labels. No PM folder-label acceptance or type-to-folder comparison gate; incorrect labels are for DCM to correct upstream. |
| Multiple slots with duplicate names | **Temporary limitation accepted:** the user permits duplicate names for now; do not promise independent files when they share identity. | Keep the agreed warning before implementation/release. Do not invent suffixes or reopen Q2. |

### Technical references if needed during implementation — not open product decisions

> Please provide the versioned contract for the DCM environment/mode used by Folio:
>
> 1. The supported server API to retrieve **the exact original uploaded bytes** from a trusted receipt/token, including method/path, authentication/permissions, request/response fields, content type, redirects, error/expiry behavior, and support for every file type, zero bytes and 10,000,000 bytes. If no supported API exists, please state that explicitly; the public viewer's private routes are not sufficient.
> 2. The actual success/error response schema for `POST /api/beeecm/public/file` with `template="1"`, especially object versus array `data`.
> 3. Filename parsing/template lookup rules for `<docs_number>-<template_name>.<original-extension>` and extensionless files, including hyphens in either component, matching/normalization, missing/ambiguous templates, year/folder derivation and supported file types. Confirm how the pre-existing DCM template determines category when no category ID is sent.

### Category ownership clarification — closed by the user

The earlier PM destination-confirmation request is withdrawn as a Folio planning gate. Categories come from DCM; use their IDs to group the local catalog and their type labels for display only. Do not manage category labels or physical DCM folders from this CRUD. Admin manages related template_name entries in Folio.

The research worker did not choose product policy; the user subsequently confirmed DCM-only originals, ID-based category grouping and full template catalog CRUD. Existing Published Templates/Responses retain their contracts. All file types and 0–10,000,000 bytes remain in scope, and docs_number changes must retain automatic saved-original reuse without silently adding local storage.

## Work not performed / risk

No DCM-host contact, login, upload, search API call, deletion, DB work, source edit, build, lint, test or formatter was run. Prior runtime findings are cited from planning, not repeated or independently rerun. No Knowledge Bank writes were made. Only this report was created.

Remaining technical risk: opening file_link in a browser does not prove backend retrieval of exact original bytes for all types. Downloader, CRUD and snapshot-preservation acceptance still require implementation/runtime proof; the user's Q1–Q3 decisions themselves are no longer blocked.

## User evidence update — 2026-11-17

After this research snapshot, the user supplied three response screenshots showing the same filename/destination and unchanged file token/link on overwrite. Accept that observed case; do not turn the earlier new-token sample into a universal rule or require the user to reconfirm their test. The screenshots do not show the request body, so this update does not infer its template flag or explain the difference between samples.

The [current planning owner](planning.md) records Q1–Q3 as closed: DCM-only originals, same-object overwrite without duplicate DELETE, category-ID grouping and full Admin catalog CRUD. Private original-byte storage is not part of the chosen plan. Same-URL overwrite still does not make DCM content immutable. No additional live API test or application/schema change was performed for this documentation update.

## Confirmed Admin catalog scope

The new page selects category headers using provider type labels with category IDs as values, lists the related local templates, and supports create, update (name/category relation), and confirmed deletion. The attachment popup uses the same category/template relation as two dependent selects. Catalog changes do not edit DCM templates/folders or delete user files, and do not rewrite frozen Published Template/Response configuration. Implementation must not reduce this scope to create/list only.

## Implementation discovery — public original-file GET, 2026-11-17

The user authorized one primary project scenario. A single synthetic `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf` was uploaded once, with the expected reported folder `DMS/ShareFiles/2567/กทอ.67-00-0001/2. มติและการก่อหนี้`. No fallback scenario or file DELETE was performed.

A read-only probe of `GET /api/beeecm/public/file?token=<original receipt file_token>` established a usable public original-byte path for that same file. The first GET returned401 with cached service authentication; no method conclusion was drawn. A subsequent explicit read used the existing shared coordinator to authenticate successfully and returned HTTP200, `Content-Type: application/pdf`,629 bytes, with full SHA-256 equal to the upload fixture: `4293a5cdab0808afc75f3e0e985f6f3cb5c7cfd457f9bb094d4c178375a8e21d`.

**Supported for this runtime sample:** backend original-byte retrieval through the public file endpoint, not private viewer/PDF.js routes. **Partial:** the public collection snapshot does not list this GET method; no semantic/deployed provider revision is available. **Unverified:** all-type, zero-byte,10,000,000-byte, encrypted and extensionless provider behavior. A single PDF does not prove those cases.

This supersedes earlier statements that no usable backend path had been established; it does not rewrite the historical source/public-collection snapshots above. Implementation must bind `file_link` and `file_token` to a trusted committed owned/account reference, validate origin and response bounds, preserve original bytes, and use shared service authentication. No additional upload, DELETE, alternate filename, private route, local original-byte archive or raw token publication was needed.

## Integrated reader verification — 2026-11-17

Parent tested the actual integration reader from source `bf93be6038baa9759726164a88d6272bb4e3c9db`, not another raw transport shortcut. An outbound guard permitted only coordinated login and GET for the original primary receipt. The first attempt returned `ecm_unavailable` without a retained HTTP trace; its cause is unverified. A subsequent explicitly instrumented read observed shared login HTTP200 and public file GET HTTP200. The deployment prepends `/backend` to the public API path.

The bounded reader's saved SHA-256 check passed. Separate byte comparison and full SHA-256 also matched the known629-byte PDF fixture. File uploads remain exactly one overall; this verification added no file POST, DELETE, fallback or other-project call. Temporary executable probes were removed. This supports the integrated original-reader implementation for that PDF only; the all-type/boundary/encrypted/extensionless and live overwrite/settlement release matrix remains unverified.

## Final refactored integration reader — 2026-11-17

After source-only lint extraction, Parent exercised the actual delivery reader at `6ae84f9` (production source `90b9e9b`) against the same existing primary PDF. An outbound guard admitted only login and the exact receipt's public original GET. The first GET returned401; the reader did not resend it. Parent verified the rejected auth generation became `idle` with its encrypted token cleared, then initiated one new manual read. Shared login returned200 and public GET returned200.

The reader's digest check and an independent full SHA-256 matched the original629-byte fixture. This verifies the refactored current source, not only the earlier source snapshot. The cached token's upstream rejection cause remains unknown. Exactly one synthetic file upload remains overall; no overwrite, extra file, fallback or DELETE was added. The executable probe was removed after observation. All other provider/release limits above remain unchanged.

## Supplemental user-provided API document — 2026-11-18

- **Primary source:** [user-provided AquilaAPI documentation](https://documenter.getpostman.com/view/40888244/2sBYHbrFpB#4cfdf213-260c-4db6-a1d3-28a0ac163a74), [public collection](https://documenter.getpostman.com/api/collections/40888244/2sBYHbrFpB). Retrieved HTTP 200; server Date `Wed, 18 Nov 2026 09:33:25 GMT`; ETag `W/"6cb1-VodrX/1fc/v+KpIY74RsXTYOdhA"`; raw response SHA-256 `6264d1100015250ca75a3b23083395c58f569a3d4eec4456b8c057551335daf4`. This identifies the document, not a deployed provider revision, which remains unavailable.
- The older collection above is a separate historical snapshot, not the sole current documentation. This supplement takes precedence for claims about what this newly supplied document publishes. Authentication payloads, headers, credentials, file tokens and receipt URLs were excluded from retained findings; no raw collection was saved to the repo.
- **Supported:** same five published endpoint methods/paths: login, category, search, upload and DELETE. Upload now explicitly documents `template` as multipart **String (Text)**, length 1, default `"0"`, accepting `"0"` or `"1"` rather than a multipart Boolean. `"1"` selects filename-template behavior.
- **Supported:** two saved successful upload examples have `status=200` and `data` as a **file object**, unlike the older collection's prose/absence of saved upload examples. Search has successful `data` array examples, including an empty array. The file examples include `file_create`, `file_datetime_edit`, `file_name`, `file_size`, `file_type`, `file_title`, `file_descrip`, `file_path`, `file_token` and `file_link`; do not reproduce their token/link values.
- **Bounded absence:** the non-login descriptions and saved response shapes do not publish an original-request status/finality or settlement guarantee. An upload success receipt is evidence of that returned result; a matching search result is evidence of a currently discoverable entry. Neither an empty search example nor a generic error response specifies that an earlier failed/unfinished mutation cannot still have effects. This does not establish that DCM lacks other capabilities.
- **Current runtime evidence — PARTIAL:** see [scoped live test on the settlement ticket](../ecm-attachment-safety/issues/06-unknown-settlement-contract.md#2026-11-18--pyw1tt--อนุญาต-scoped-live-api-และผลตรวจจริง). Searches can return **folders**, including token/link fields, so those fields alone are not proof of an uploaded file. The sole new synthetic upload attempt returned HTTP 500; subsequent scoped search returned an empty array. No upload success, original-byte verification, DELETE, timeout/finality or provider settlement acceptance is claimed for that attempt.

## Authorized duplicate-name original-byte evidence — 2026-11-18

The user reported that duplicate uploads now create additional DCM entries, with a screenshot from project `กทอ.67-00-0001`. A subsequently completed, explicitly authorized same-name POST returned HTTP 200 / `status=200` / `msg="OK"` and a file-object receipt. Search of the same destination changed from three to four same-name PDF entries. All three existing originals retained their pre-upload 26,275-byte size and SHA-256; the new original was 667 bytes and matched the distinct submitted fixture digest. This supports create-new, non-overwriting behavior for those originals in this PDF/project/template/runtime sample, not merely distinct UI rows.

Canonical response, request counts, digests, scope and impact are retained in [หลักฐานยุติ unknown upload และ DELETE ที่เชื่อถือได้](../ecm-attachment-safety/issues/06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต). Earlier same-destination overwrite statements and filename-keyed doubles are historical evidence/models, not a universal current DCM rule. This sample does not establish DELETE isolation, all-type/concurrent behavior, a deployed semantic revision or finality of the earlier HTTP 500 request. Naming/reservation policy needs human review before implementation; no approved policy or application code was silently changed.
