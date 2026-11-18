# 07: หลักฐาน DCM สำหรับ same-name receipts และ history/DELETE isolation

**What to build:** รวบรวมหลักฐานจริงภายใน scope ที่อนุญาตว่า uploads ชื่อฐานเดียวกันอ้างไฟล์ของแต่ละคำขอและไม่เปลี่ยน surviving originals รวม DELETE isolation เฉพาะเมื่อได้รับอนุญาตแยก ให้ pyw1tt ตรวจรับโดยไม่ใช้ simulation หรือ sample เดียวรับรองทั้ง provider

**Blocked by:** 01 — ส่งชื่อเดิมได้ พร้อม receipt และคำเตือนถูกประเภท.

**Status:** needs-info

**Spec coverage:** ECM Attachment Safety implementation spec — US84, US90; Testing Decisions C.1 และ approved resource/history evidence plan

**Execution prerequisites:** ต้องมีคำสั่งเริ่มงานหลังตรวจตั๋ว และ real-provider account/environment/synthetic destination/write scope/ownership-collision boundary/stop conditions/cleanup owner ที่อนุญาตจริง การอนุมัติตั๋วไม่ขยายเป็น DELETE หรือการทดลองกับข้อมูลใช้งานจริง

## Acceptance criteria

- [ ] เริ่มจาก isolated naming/receipt/history proof ของตั๋ว 01 ที่ผ่านแล้ว ไม่ต้องรอ browser/loading ทั้งชุดใน 06 จึงไม่มี dependency ต่อ 06 แต่ต้องบันทึก local source และแยก local result จาก provider observations
- [ ] ใช้แผนชื่อฐานซ้ำตาม latest human decision ไม่เรียกคืน generated suffix/counter/timestamp/reservation หรือ suffix-routing HOLD ที่ superseded
- [ ] Real API พิจารณาได้เฉพาะฐาน กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45) โดย root docs_number และ frozen template ตรง scope นี้ Extension ใช้ของ File ตาม contract ไม่สลับ project/template/ชื่อทดสอบเพื่อหลบ known files หรือ unknown
- [ ] ก่อน write ยืนยัน authorized boundary ของ account/environment/destination และการจัดการ known same-name files จากหลักฐานเดิม ไม่ถือ search ว่างว่าปลอดภัย และไม่ถือไฟล์ที่พบเป็น disposable synthetic fixture ของงานนี้โดยเดา
- [ ] ใช้ synthetic files ที่แยกกันตาม approved plan เก็บ original request-to-receipt correlation และตรวจ saved references/old originals ก่อนและหลัง upload/reopen/retrieve เท่าที่ scope อนุญาต ไม่ adopt search-by-name/latest เป็น receipt ของคำขอ
- [ ] หลักฐาน independence/history ใช้ original bytes/size/digest ตาม approved plan เจ้าของเรื่องนี้ ไม่ใช้ token ต่างกัน จำนวนรายการเพิ่ม หรือ HTTP 200 อย่างเดียว การตรวจนี้ไม่ใช่การเพิ่ม byte-comparison กลับเข้า type/size ticket 08
- [ ] Same-name scalar/table/revision claims และ literal text/extension/casing/extensionless claims ระบุเฉพาะที่ทดลองจริง หาก scenario ต้องเปลี่ยน docs_number/template ออกนอกฐานที่อนุญาต ให้ provider cell pending ไม่สร้าง scenario สำรองเอง
- [ ] Existing PDF sample ที่ old originals สามรายการคง 26,275 bytes/digest และ new original 667 bytes ตรง fixture ถูกอ้างเป็น historical scoped evidence เท่านั้น ไม่ทดลองซ้ำเพื่อยืนยันคำรายงานเดิม ไม่ขยายเป็น every-type/template/concurrency/deployed guarantee
- [ ] DELETE isolation ตรวจได้เมื่อมี authorization แยกเท่านั้น ลบเฉพาะ resource ที่พิสูจน์ว่าสร้างใน scope นี้และไม่มี survivor/history/workspace/eligible Operation ใช้ ไม่ลบ shared alias หรือทุกไฟล์ชื่อเดียวกันเพียงเพราะ token ต่าง
- [ ] หาก DELETE ยังไม่มีสิทธิ์หรือ resource ownership/reference proof ไม่พอ ให้คง criterion นั้น pending/HOLD และระบุ prerequisite ไม่ใช้การไม่ทำ DELETE เป็นผลว่าปลอดภัย
- [ ] หยุดเมื่อ bytes ไม่ตรง, unsafe alias/name change, unexpected error หรือ unknown เก็บ original evidence ไม่ auto POST/DELETE retry ไม่เปลี่ยนชื่อส่งใหม่ ไม่ลบไฟล์เก่า และไม่อ้าง rollback external bytes ได้
- [ ] จัด sanitized manifest ระบุ source/environment/date/provider revision เท่าที่ทราบ, original correlation, receipt/reference aliases และ before-after claims ห้าม credentials/raw tokens/private receipt URLs หรือสำเนา original attachment นอก DCM ลง repo
- [ ] แยก supported/partial/conflicting/insufficient/unverified ราย guarantee พร้อม pyw1tt human review และ remaining HOLD การส่งรายงานหรือ approval ของแผนไม่ทำให้ provider acceptance ที่ยังไม่มีผลกลายเป็น PASS

## Scope boundaries

งานนี้เป็น external evidence ไม่ใช่ implementation policy ใหม่ ไม่รอผู้ประสาน DCM เดิมที่ติดต่อไม่ได้ และไม่สมมติว่ามี provider-wide guarantee หรือสิทธิ์ดู logs แล้ว Unknown settlement ยังเป็นตั๋ว 09 และ per-button type/size เป็นตั๋ว 08

ไม่ใช้ accepted residual external-collision risk เป็นสิทธิ์ลบไฟล์ที่ไม่ทราบเจ้าของ ปลด known-reference guards หรือทำ mutation นอก scope

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown/edge 01 และยืนยันกรอบชื่อทดสอบไว้แล้ว การเผยแพร่ตั๋วนี้ยังไม่เรียก DCM หรือ authorize DELETE; ต้องตรวจ execution prerequisites ก่อนลงมือจริง

### Evidence gate assessment — 2026-11-19 — Implement07

**Disposition:** reachable read-only assessment complete; provider acceptance remains **partial / HOLD**. No new execution boundary authorizes another real-provider trial. This is not provider PASS, release approval, or pyw1tt's final acceptance. No dependency on ticket 06 was introduced.

#### Provenance and source separation

- Assigned branch `feat/ecm-safety-07` starts at integration `1affbc02aa20cf23ca240cb1c85d951980594073`; ancestry of `1affbc0` confirmed. Merging current `feat/ecm-attachment-safety-implementation` before this report returned `Already up to date.`
- **Current local source — supported by inspection, not a new runtime result:** CodeGraph inspected the configured repository root `/Users/pyw1tt/Desktop/Github/folio-forms`; the assigned worktree's omitted `templateReceiptConflict` was opened directly. `planAttachmentFile` uses `${number}-${templateName}${extension}` for template mode, with original extension/casing and unsafe-input rejection. `EcmClient.upload` validates the original POST response as an object or one-item array. `receiveAttachmentIdentity` requires exact paired aliases; `templateReceiptConflict` prioritizes protected history, distinguishes own Draft, and holds conflicting identities. `requireAttachmentDeleteReady` retains unresolved attempt/alias/cleanup fences. These observations do not establish DCM identity, deployment, or external byte immutability.
- **Inherited local execution — partial:** [ticket 01, Integration evidence — 2026-11-18](01-same-name-uploads-and-receipt-conflicts.md#integration-evidence--2026-11-18) records integration `108fb942dc434b8d7f4e3079852039f3ebdfc36a`: 151 pass/one fixture failure across 152 HTTP cases; both repaired cleanup cases subsequently passed, 74 assertions. Same-number rounds, scalar/table/foreign-Response/Correction receipts, conflict classification and surviving originals were reported passing in the first run. That record explicitly leaves a complete final rerun and native warning/pending smoke pending, and reports an intermediate cleanup serialization-conflict interleaving. This worker did not rerun any check or promote that result to provider proof.
- **Policy owners — supported:** [naming contract, Implementation Decisions](../../ecm-attachment-safety/spec.md#implementation-decisions); [latest naming Resolution](../../ecm-attachment-safety/issues/02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--ใช้ชื่อฐานซ้ำและแยกไฟล์ด้วย-receipt); [resource-plan same-base amendment](../../ecm-attachment-safety/issues/01-provider-independent-resources.md#amendment--2026-11-18--เปลี่ยนแผนหลักฐานเป็นชื่อฐานซ้ำตามคำตอบล่าสุด); [guard Resolution](../../ecm-attachment-safety/issues/09-duplicate-name-guard-policy.md#resolution--2026-11-18--pyw1tt--guard-และคำเตือนที่จำแนกได้). Same-base receipts supersede generated counter/timestamp/reservation policies, not ownership/history/unknown guards.
- **Canonical snapshot limits:** all local citations below are Markdown snapshots at the integration revision above, not published Knowledge or deployed artifacts. Older hashes in the implementation spec identify its earlier snapshots, not the current bytes; the measured current fingerprints below take precedence for this assessment's provenance. Naming spec's “Current source inspected” paragraph describes its historical source, whereas ticket 01 and the current source now describe the implemented cutover. Provider research's early array-only/overwrite statements are historical; its supplemental document and duplicate-name evidence sections must be read with them.
- **Hindsight `pdms-knowledge` — skipped:** mounted recall selectors cannot select bank/types/budget. No bank discovery or retrieval occurred in this assignment; no timeout or successful recall is claimed. `document_id`, `chunk_id`, Hindsight `source_path`, `stable_document_id`, `source_revision` and `source_revisions` are **missing**. Local relative paths and Git/SHA-256 revisions below are separate provenance, not invented Hindsight IDs. No bank writes.
- Read tracker/domain conventions, `CONTEXT.md`, ADR 0003 and ADR 0004; their project-name and scalar-filter decisions remain unchanged. No callers, tests, fixtures, config, exports, application source, shared map, CONTEXT or original nine Wayfinder tickets require modification for this evidence-only report.

#### Sanitized historical provider manifest — not a new trial

Canonical owner: [D06, authorized same-name original-byte evidence](../../ecm-attachment-safety/issues/06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต), including its preceding HTTP 500 and known-file preflight sections. Corroborating snapshot: [provider research supplement and duplicate-name evidence](../../ecm-storage-templates/provider-contract-research.md#supplemental-user-provided-api-document--2026-11-18).

| Manifest field | Recorded evidence / limit |
| --- | --- |
| Environment/date | Recorded DCM host `pdms-documentmanagement.enconfund.go.th`, deployed `/backend/api/beeecm/public` prefix; success at `2026-11-18T10:11:31.192Z`. Formal environment label and provider semantic/deployed revision **missing**. Historical Folio probe source commit **missing**; owner calls it Working Tree with shared coordinator. No current environment health claim. |
| Authorized historical destination | Root `docs_number` = `กทอ.67-00-0001`; frozen `template_name` = `ก่อหนี้-4_ขยาย(45)`; submitted filename `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf`; recorded path `DMS/ShareFiles/2567/กทอ.67-00-0001/2. มติและการก่อหนี้`. New trials may not change project/template to escape known files or unknown outcomes. |
| Original request correlation | User explicitly allowed one further same-name upload despite known files. One POST at the timestamp above used `documentFile` (667-byte synthetic PDF) and `template="1"` only. Direct response HTTP 200 / business `status=200`, `msg="OK"`, object-shaped `data`; complete 725-byte capture, no truncation. Provider-generated request/correlation ID **missing**; timestamp is a locator, not a finality guarantee. |
| Receipt/reference aliases | Report-local labels `old-1`, `old-2`, `old-3` mean the three search-order originals in D06's before/after table, not proven creators or physical-object IDs. `new-1` means the original POST's validated paired receipt. D06 records a search entry matching both token/link of that receipt. Search corroborates the receipt; it did not supply it. Raw aliases, token hashes and private URLs are not retained here. |
| `old-1` / `old-2` / `old-3` | Each before and after: 26,275 bytes; SHA-256 `12ec9f9bdc5b35397b05905de3581d5b96c669f9d64e6527f0308430ab98b7e1`. Original GET with each prior token returned HTTP 200 after POST. Their creators, ownership, current survivors and disposal eligibility remain **unverified**. |
| `new-1` | Original GET through the new receipt returned HTTP 200, 667 bytes; SHA-256 `709b2ee6c999641c46cc3de0fd0201d00e9ddf6f2bba547d4d7a545590980256`, matching that request's synthetic fixture and differing from all three prior originals. No claim of a current Folio Draft/Submission/Correction reference. |
| Successful-run accounting | Historical owner records one coordinated login, four searches, one POST, seven original GETs (old before 3 + old after 3 + new 1), zero DELETE. Counts are inherited, not calls performed now. Three-to-four search entries alone would not prove independence. |
| Earlier failed request | Separate `09:36:08Z` POST returned HTTP 500 without a trusted receipt; its 667-byte fixture digest was `a8b756dc5aedaad0c177b5ab35aa7b0426aa2d97be0f0045f8b3e95543663c54`. Empty later search and the successful new POST do **not** settle that request or prove absence of delayed effects. Ticket 09 owns original-request settlement. |
| Public document revision | User-supplied collection `40888244/2sBYHbrFpB`: recorded HTTP 200, server Date `Wed, 18 Nov 2026 09:33:25 GMT`, ETag `W/"6cb1-VodrX/1fc/v+KpIY74RsXTYOdhA"`, raw SHA-256 `6264d1100015250ca75a3b23083395c58f569a3d4eec4456b8c057551335daf4`. This identifies documentation only. Its inspected descriptions/examples publish no original-request finality/settlement guarantee; absence is bounded to that snapshot, not every DCM capability. No refetch performed. |
| Human review | pyw1tt approved the evidence plan and reported duplicate entries. Final review of this ticket's expanded provider/history/DELETE claims is **pending**, not supplied by plan approval or this report. |

**Supported for that historical sample only:** one same-name PDF POST returned its own validated receipt and distinct matching original bytes while all three inspected prior originals retained exact size/digest. **Partial overall:** no scalar/table app-save, selected Submission/Correction history, concurrency, all-type/template or deployed-version guarantee follows. No original attachments were copied into this report.

#### Criterion-by-criterion gate report

Numbers follow the 13 acceptance criteria above. Pending execution criteria remain unchecked; this report does not silently close them.

| AC | Evidence status | Assessment and exact remaining prerequisite |
| --- | --- | --- |
| 1 | supported source / partial inherited local result | Ticket 01 source and its recorded isolated HTTP proof are available independently of 06. Final local integration acceptance remains its owner’s work; this report starts from that evidence, not browser completion. |
| 2 | supported intended policy | Latest human same-base Resolution and D01 amendment govern this assessment. No generated suffix/counter/timestamp/reservation or superseded suffix-routing HOLD restored. |
| 3 | supported scope / unverified new execution | Only base `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45)` is eligible for consideration, with exact root/frozen metadata and File extension. This is a boundary, not a new write instruction. |
| 4 | insufficient — HOLD | Missing new approval binding account identity/environment, exact destination/write scope and treatment of the three known originals plus the prior synthetic receipt. Historical one-shot approval was consumed. No current ownership/reference inventory or permission to inspect it is supplied. Empty search would not close this gate. |
| 5 | partial historical sample / unverified remaining paths | Historical `new-1` preserves direct POST correlation and prior-original comparison. Missing authorized distinct A/B/C execution plus actual scalar/table slot, snapshot/round and reopen/retrieve evidence under the permitted base. Never adopt first/latest search result. |
| 6 | supported historical PDF / unverified broader independence | Exact size/digest comparison above supports that sample only. A/B/C and surviving-reference before/after proof remain pending approved execution. Identity/history comparison remains ticket 07's owner responsibility; no byte-comparison or aggregate workload added to 08. |
| 7 | unverified — HOLD | Real scalar/table/multi-round/Correction, literal-name variants, case-preserved extension and extensionless cells have no new observations here. The fixed literal template is not a general parser-preservation guarantee. Cases requiring a different root/template stay provider-pending until separately scoped; no alternate scenario invented. |
| 8 | supported historical evidence preserved | Three 26,275-byte originals and matching new 667-byte original retained exactly as D06 reports. No repeat trial confirms the user’s result. No every-type/template/concurrency/deployed claim. |
| 9 | insufficient / unverified — HOLD | No separate DELETE authorization, selected in-scope resource disposal approval or current ownership/alias/survivor/reference proof. Need a proven resource created within the authorized new scope and no Draft/Submission/Correction/workspace/eligible Operation references, with race-safe first-delete eligibility and before/after survivor-original evidence. Never delete known originals, shared aliases or all same-name entries. |
| 10 | supported conservative disposition / unverified isolation | DELETE remains pending/HOLD. Zero DELETE actions in this assignment is not evidence that deletion preserves survivors. Historical A/B DELETE anecdotes in provider research do not establish same-base isolation for this scope. |
| 11 | supported standing stop policy / unexercised here | Stop on byte mismatch, unsafe alias/name change, unexpected error or unknown. Retain original evidence; no automatic POST/DELETE retry, rename/resend, old-file deletion or remote-byte rollback claim. A new execution approval must explicitly retain these stops and assign response/cleanup responsibility. |
| 12 | supported sanitized assessment / partial manifest | Manifest records available date/environment/document revision/correlation/aliases and exact before/after limits. Missing provider software revision/request ID/current ownership proof stated explicitly. No credentials, raw tokens, private receipt URLs or original attachment copies retained. |
| 13 | partial / human review pending | Guarantee statuses are separated. pyw1tt must review the scoped evidence and remaining gates. Submission of this report or approval of the plan is not provider acceptance or release PASS. |

#### Missing execution permissions and evidence — minimum actionable boundary

1. pyw1tt must authorize a **new** run against the intended account/environment and exact destination under the fixed base, with allowed app/record inspection and write scope. Existing `.env` values may already supply working configuration; credentials/configuration were **not inspected**, and “credentials missing” is **not** this blocker. Config presence would not confer authorization.
2. Explicitly cover the **known** same-name originals and the retained synthetic file without presuming ownership/disposability. Authorize the required read/reference inspection and clarify how new synthetic writes coexist safely with those known files. Q2's accepted risk for unknown external writers remains settled; no mandatory global inventory or provider namespace guarantee is introduced.
3. Assign cleanup owner and approved treatment of newly created artifacts, retain the stop/no-retry conditions above, and specify evidence custody for trusted receipt correlation without depositing secrets/originals into Git. Do not assume old one-shot approvals permit reuse, mutation or deletion now.
4. For DELETE evidence, require **separate first-DELETE permission** for an exactly identified proven in-scope artifact after ownership/aliases/current references and eligibility are established. Record survivor before/after originals through their existing references. If outcome is unknown, stop without retry; ticket 09 handles the required original-request settlement evidence.
5. After authorized observations, pyw1tt reviews each scoped claim. Provider software revision may remain explicitly unknown; no finality contract, request-status API, log access or provider-wide guarantee is fabricated to fill missing cells.

#### Snapshot fingerprints

All paths are relative to the assigned worktree at `1affbc02aa20cf23ca240cb1c85d951980594073`. These are measured SHA-256 values, not tool snapshot tags.

| Owner / source | SHA-256 |
| --- | --- |
| Implementation `spec.md` | `ff7e3ab969086c530cbd0e67129a8a64702860b2062fd4b6edbd49d119b3a346` |
| Safety `map.md` | `1525bfcad24da66b7adcdd3a22c933f624ca5bab43036749c937500ec83612fc` |
| Safety naming `spec.md` | `a13f975310055ae0cdf216d5b6d0400b2543272f57d8878f569c7e04726f1009` |
| D01 `01-provider-independent-resources.md` | `3e63d42c446e81ed8ef338e889457f3ecbc41b026fe7cbbd6fef174fcac5014e` |
| D02 `02-external-filename-collisions.md` | `fec9db0516674520c0c4112e2c7bac70e1953760500a96a28c7989ccb5270049` |
| D06 `06-unknown-settlement-contract.md` | `50fc2a740f19b56f5cf4b54b8c45f1139daf1b25e3603e3341a37eafdc4a6ce4` |
| D09 `09-duplicate-name-guard-policy.md` | `09ea13f4ec7cd3874224dc32c61a7682824c6126990f650e3140879d427cae86` |
| `../ecm-storage-templates/provider-contract-research.md` | `408b985a266187e3fb0bb7aa1913d31c0fd5dde4f624c8ee5be8fd5fb11ac7de` |
| Implementation `issues/01-same-name-uploads-and-receipt-conflicts.md` | `a1d298fc6f94d840713ab6196318bfa2f2c69d04d07aeb7caa856524a0d8848d` |
| `apps/server/src/ecm/attachments.ts` | `8229ec48c55b48d3cfc53fde578d9d40cc1a7645f73a6a8d41746d2f1fdee685` |
| `apps/server/src/ecm/identity.ts` | `112b08d1e5e078c439e9b7180a18c6e4ca1452fd5ec969215ccf23e0086617e2` |
| `apps/server/src/ecm/client.ts` | `c846eed2af0fe72db46b160a88e7c433cb73ad4f3dc9734657915c4e11adabe5` |

**Actions not performed:** no real DCM login/search/original GET/upload/DELETE; no live DB or app/record mutation; no config read/change; no build/test/lint/formatter/browser run; no push/deploy; no new finality guarantee. Only this ticket changes. Existing external originals and retained synthetic artifacts remain untouched; provider/history/DELETE gates and human acceptance remain open.
