# 10: ตรวจข้อมูลเดิมและจัดทำรายงาน recovery ตามหลักฐาน

**What to build:** ผู้ดูแลได้รับ read-only report ว่าข้อมูลที่ Folio รู้จักใช้ resource ร่วมกันอย่างไร และยืนยัน original integrity ได้เพียงใด หากต้องกู้ไฟล์ให้เสนอ trusted provenance และผลต่อ history เพื่อให้ pyw1tt อนุมัติรายกลุ่ม ไม่แก้หรือลบข้อมูลเดิมอัตโนมัติ

**Blocked by:** None (can start immediately).

**Status:** resolved — รับผลภายในขอบเขตที่ตรวจเท่านั้น

**Spec coverage:** ECM Attachment Safety implementation spec — US89–90; approved inventory/recovery/data-use policy และ old-data HOLD register

**Execution prerequisites:** ต้องมีคำสั่งเริ่มงานหลังตรวจตั๋ว และ authorization แยกสำหรับ environment/DB, record/access scope, sanitized report และ original-byte retrieval หากจำเป็น ไม่อนุญาต actual remediation/DELETE จากตั๋วรายงานนี้

**Human acceptance:** pyw1tt ยืนยันตรวจรับและให้ปิดตั๋ว 10 สำหรับ [การสำรวจข้อมูลเดิมและเคสสังเคราะห์ที่ใช้ DCM จริง](#scoped-existing-record-search-and-live-synthetic-correction--2026-11-19) ใน `localhost:8080` เฉพาะ `กทอ.67-00-0001` / `ก่อหนี้-4_ขยาย(45)`.

## Acceptance criteria

- [ ] ตรวจแบบ read-only เฉพาะข้อมูลที่ Folio รู้จักตาม approved scope ไม่สแกน arbitrary external DCM inventory และไม่ใช้ mandatory external inventory เป็น gate ของ naming policy
- [ ] ครอบคลุม Draft, Submission, Correction, workspace, eligible Operations และ retained records/aliases รวม tracking ที่ยังเก็บหลัง Response deletion ไม่ฟื้น deleted Responses หรือแก้ answer rows
- [ ] จัดกลุ่ม Provider File Identities/paired receipts/aliases และ surviving references ตามหลักฐาน แยก duplicate filename ออกจาก shared identity และแยก shared identity ออกจาก corruption ไม่ใช้ชื่อ/ขนาด/timestamp อย่างเดียวระบุ original
- [ ] รายงาน integrity เป็นตรง trusted original, ยังยืนยันไม่ได้ หรือแตกต่างจาก trusted original ตามหลักฐานที่มีจริง ไม่มี historical hash ให้ unknown ไม่สร้าง hash จาก current bytes แล้วอ้างย้อนหลังเป็น original เก่า
- [ ] Original retrieval/comparison ทำเฉพาะเมื่อได้รับสิทธิ์ใน scope และจำเป็นต่อ claim การไม่มี trusted original ไม่ถูกอ้างว่า bytes เสียหรือกู้ไม่ได้ถาวร และ URL เปิดได้ไม่เท่ากับยืนยัน historical content
- [ ] คงข้อมูลเดิมเมื่อยังยืนยันหรือกู้จากหลักฐานที่มีไม่ได้ ไม่ใช้ latest/search result/ไฟล์แถวอื่นแทน original ไม่ rename/reupload/delete/แก้ history JSON หรือ backfill evidence อัตโนมัติ
- [ ] หากเจ้าของให้ trusted original และพิสูจน์ provenance ได้ ให้จัดทำ remediation proposal รายกลุ่ม ระบุ affected references/immutable history/resource effects และขอ pyw1tt approval แยกก่อนแก้ ตั๋วนี้ไม่ลงมือ remediation
- [ ] คง DCM-only originals ไม่เพิ่ม RustFS/DB/private archive หรือ binary/base64 answer copy เพื่อปิดช่องว่าง recovery และไม่เก็บ original attachment นอก DCM ใน retained report
- [ ] ระหว่างตรวจคง known ownership/history/shared-reference/unknown-operation guards ไม่ลบ alias เพื่อเปิดทาง และไม่บล็อกทั้งระบบเพียงเพราะ inventory ยังไม่ครบ
- [ ] การอ่าน/export saved revisions ยังคงสิทธิ์เดิม พร้อมรายงานข้อจำกัดให้ผู้ดูแลและผู้ที่เปิด revision ที่เกี่ยวข้องตาม existing surfaces ไม่เพิ่ม dashboard/manual unlock หรืออ้าง frozen JSON ทำให้ external bytes immutable
- [ ] Real-provider retrieval หากมีจำกัดตาม authorization; กรอบชื่อทดสอบ กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45) ไม่ถือเป็นสิทธิ์ audit records/projects อื่น ต้องแยก original-data access scope ให้ชัดก่อนอ่านจริง
- [ ] ส่ง sanitized report ที่ระบุ environment/date/source/schema scope/records ที่ตรวจ/provenance/evidence status/unknowns/ข้อจำกัดและผู้ตรวจรับ ไม่ลง credentials/raw tokens/private evidence URLs ลง repo
- [ ] pyw1tt ตรวจรับรายงานและตัดสิน remediation รายกลุ่ม แยกผล inventory, integrity comparison และ recovery outcome ไม่ใช้ local simulation/sample เดิมกล่าวหา Production corruption หรือรับรอง recovery สำเร็จ
- [ ] หาก authorization/trusted original ยังขาด ให้รายงาน exact prerequisite และส่วนที่ยัง pending ไม่ลงมืออ่านข้อมูลจริงเพื่อเติมรายงานหรือปิด evidence gap โดยเดา

## Scope boundaries

ไม่มี dependency ต่อ naming/native/loading tickets เพราะ read-only inventory รายงาน current data ตาม approved scope ได้โดยไม่รอเปลี่ยน behavior แต่ไม่มี ticket blocker ไม่เท่ากับมีสิทธิ์อ่าน DB/original files แล้ว

ไม่สร้าง migration, generic audit platform, recovery engine หรือ new UI จากงานรายงานนี้ Remediation ต้องมี authorization แยกและไม่ขยาย approval ของชุดตั๋วเป็นสิทธิ์เปลี่ยนข้อมูลจริง

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown โดยแยก external authorization ออกจาก internal dependencies แล้ว เผยแพร่เพื่อให้ตรวจตั๋วก่อน execution ไม่มี inventory/DB/original-retrieval/recovery result ใหม่จากการสร้างตั๋ว

### 2026-11-18 — Local evidence report; actual inventory/recovery pending

**Disposition:** งานที่เข้าถึงได้ใน scope นี้เสร็จเฉพาะการตรวจ canonical policy, sanitized historical reports และ source/schema แบบ local read-only ไม่ใช่ผล inventory ของ records จริง ไม่ใช่ integrity comparison ใหม่ และไม่ใช่ recovery outcome ปัจจุบัน **needs-info** เพราะยังไม่มี authorization ของ environment/records/original retrieval ตามรายการด้านล่าง Acceptance ภายนอกข้างบนยังไม่ติ๊ก และ **pyw1tt human review pending**

#### Environment, revision และ discovery provenance

- Report date: 2026-11-18; environment ที่ตรวจคือ local worktree `/tmp/folio-ecm-safety-838056b-10` บน `feat/ecm-safety-10` Source baseline และ integration tip ตอนเริ่มคือ `838056b1d682fd40623d5db029ad5a1e7c89ad96` ตรวจ ancestry สำเร็จ ไม่ทราบ deployed Folio/DCM revision หรือ live schema migration state
- Scope ของ records ที่ตรวจจริง: **ไม่มีการอ่าน live records** ไม่มี DB connection/query, original-byte retrieval, DCM request, DELETE หรือ remediation ในงานนี้ จำนวน records/identities/aliases/surviving references/integrity classes ใน environment จริงจึง **not inspected** ไม่ใช่ศูนย์รายการ
- CodeGraph ถูกเรียกก่อนเปิด code ด้วย explicit worktree `projectPath`; tool รายงาน worktree ไม่ได้ index และให้ใช้ Read/Grep แทน จึงใช้ source ranges ของ worktree โดยตรง ไม่สร้าง index/infrastructure หรือถือผลจาก checkout อื่นแทน
- Hindsight session recall: **retrieved**, tool ระบุเวลา `2026-11-18 15:10 UTC` ใช้นำทางเท่านั้น ไม่ยืนยัน bank `pdms-knowledge` Dedicated bank discovery ด้วย `types:["world"]`, `budget:"low"` เป็น **skipped** เพราะ mounted recall schema ไม่มี bank/types/budget selector ไม่ใช่ failed recall หรือ successful bank retrieval ไม่มี canonical Hindsight `document_id`, `chunk_id`, `source_path`, `stable_document_id`, `source_revision`/`source_revisions` ให้บันทึก จึงใช้ owner Markdown/source พร้อม revision แยกด้านล่าง ไม่มีการเขียน memory bank
- [Canonical recovery owner: Resolution Q1–Q3](../../ecm-attachment-safety/issues/03-existing-aliases-recovery.md#resolution--2026-11-18--pyw1tt--เห็นด้วยกับ-q1-ถึง-q3) คือ approved policy; [implementation spec](../spec.md) US89–90 และ authorization/HOLD register คือขอบเขตงานนี้ Historical counter wording ของ D03 ไม่ใช่ latest naming policy; [latest naming Resolution](../../ecm-attachment-safety/issues/02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--ใช้ชื่อฐานซ้ำและแยกไฟล์ด้วย-receipt) แทน counter โดยไม่ยกเลิก Q1–Q3

Snapshot SHA-256 ที่อ่านในงานนี้ ระบุคู่กับ baseline commit ข้างบน ไม่ใช้ tool snapshot tag เป็น revision และไม่ยก snapshot hash เก่าของสเปกมารับรองไฟล์ปัจจุบัน:

| Local owner/source | SHA-256 |
| --- | --- |
| [D03 inventory/recovery resolution](../../ecm-attachment-safety/issues/03-existing-aliases-recovery.md) | `e58ee1c8666040b4ea5eb56ba7a80612441e6afda316dc1debfb1d5c8bf5a9d3` |
| [D06 historical scoped provider evidence](../../ecm-attachment-safety/issues/06-unknown-settlement-contract.md) | `50fc2a740f19b56f5cf4b54b8c45f1139daf1b25e3603e3341a37eafdc4a6ce4` |
| [Prisma schema](../../../packages/db/prisma/schema.prisma) | `2b01dd42f019c956ba7f2300de4b30746db6450de5e28fda33812e918464f01f` |
| [Identity/reference/delete guards](../../../apps/server/src/ecm/identity.ts) | `992ee3d395dc44b3c188cae361472d8bcc9a5bb393d158fcc4b8c28800dd3e3c` |
| [Attachment snapshot/retirement/original selection](../../../apps/server/src/ecm/attachments.ts) | `5ad1f6cb0f0c50ab2702fe2f3b7d237dd4f1ee91aa6200c373933a511cc11c19` |
| [Provider client/original-byte checks](../../../apps/server/src/ecm/client.ts) | `6174ccafabc3df7de7bfbc699c629113da9ffeee7e58543b694105ea9698adcb` |
| [Response deletion retention](../../../apps/server/src/responses/deletion.ts) | `5c064a5011e44fadac9323f94dd00071862dd3bb5a8c78d56313ff516d832b1b` |

#### Approved grouping/classification — policy supported; record results unverified

1. จำกัด resource scope ตาม provider service-account scope (`accountKey`) ก่อนจัดกลุ่ม Provider File Identity (`identityId`) และ original paired receipt (`fileToken` + `fileLink`) แต่ละ Upload Attempt (`version.id`, `operationId`) ต้องยังเป็นคนละ evidence record ไม่รวม attempts จนสูญ original-request provenance Source: `identityVersionIds` และ `receiveAttachmentIdentity`, `identity.ts:12–24,145–199`; schema `701–783`
2. **Duplicate filename** เป็นเพียง destination coincidence ไม่พิสูจน์ shared identity, ownership หรือ corruption ใช้ filename เป็น descriptive evidence ได้แต่ไม่ใช้เลือก original หรือ latest ผล names ซ้ำต้องแยกจากคู่ receipt ที่ตรงจริงภายใน account scope
3. **Shared identity/paired aliases** คือ references/attempts ที่มีหลักฐาน resource ร่วม การ reuse unchanged file ข้าม revisions อาจถูกต้องตาม contract ไม่ใช่ corruption โดยตัวมันเอง คู่ receipt ต่างกันก็ไม่พิสูจน์ independent physical bytes โดยลำพัง Partial/one-sided/multiple matches, identity `held`, missing identity และ unknown legacy row mapping ต้องรายงาน ambiguous/unknown แยก ไม่บังคับรวมกลุ่มจากชื่อ/size/time และไม่แก้ held state เพื่อให้รายงานครบ
4. แต่ละกลุ่มต้องแจก surviving references ตาม snapshot/Response/slot/physical row พร้อม evidence ที่ retained หลัง deletion แยกจาก live survivors ห้ามอ้าง tombstone ว่า deleted Response ยังอยู่ หรือมองไม่มี live Response ว่าไม่มี ledger/aliases เหลือ Cross-record aliases ที่อยู่นอก approved access scope ให้ระบุ coverage gap และขอ scope เพิ่ม ไม่อ่านหรือเปิดเผยเอง
5. **Integrity** แยกเป็น “ตรงกับ trusted original”, “ยังยืนยันไม่ได้” หรือ “แตกต่างจาก trusted original” เฉพาะเมื่อมี provenance และ authorized comparison รองรับจริง เก็บสถานะ grouping, integrity และ recovery แยกกัน ไม่มี historical digest/trusted original ให้ integrity unknown ไม่ backfill `original_sha256` จาก current bytes แล้วย้อนอ้างเป็น original เก่า URL GET สำเร็จหรือ same size/time ไม่รับรอง historical content

#### Coverage map สำหรับ inventory ที่ยังไม่ได้รับสิทธิ์

ตารางนี้ยืนยันว่าพบแหล่งข้อมูล/กลไกใน source ไม่ใช่ยืนยัน coverage ของ live records ไม่มี query/export script ใหม่:

| Coverage | Local source/schema ที่เปิด | สิ่งที่ต้องเก็บเมื่อมี scoped report จริง |
| --- | --- | --- |
| Draft | `Response.draftData`/`draftDocumentKey`, schema `383–411`; `EcmAttachmentReference.snapshotId` | Current saved Draft attachment objects กับ references ของ canonical document; ไม่สร้างประวัติทุก Draft save เพิ่ม |
| Submission | `Submission.data`/`documentKey`, schema `431–450`; protected snapshots ใน `attachments.ts:1079–1134` | ทุก Submission ใน approved scope ไม่ใช่ latest อย่างเดียว; paired receipt ของแต่ละ slot |
| Correction | `Correction.data`/`documentKey`/`revision`/`submissionId`, schema `453–470` | ทุก selected/older revision ที่อยู่ใน scope; ไม่แทน receipt ด้วย latest Correction |
| Workspace | `EditorLease.workspaceDocumentKey` และ `workspaceBaseDocumentKey`, schema `570–592`; `attachments.ts:1100–1108,1126–1132` | ทั้ง workspace และ base references/target evidence; ไม่ตัด base หรือ expired lease ทิ้งโดยเดา และไม่อ้าง browser pending File เป็น saved original |
| Eligible Operations | `Operation.documentKey`/`status`/`metadata`/`result`, schema `519–545`; `attachments.ts:1109–1115` | Snapshot protection ใช้ `pending`/`processing` และ exclude committing operation ใน flow นั้น; report ต้องแยก original batch/checkpoint/attempt states และ unknown cleanup ไม่ตีความ Operation completed/failed ว่า remote request settled เสมอ |
| Retained deletion records/aliases | Non-cascading batches/versions/references/cleanups, schema `701–807`; `retireResponseAttachments`, `attachments.ts:1231–1377`; tombstone schema `641–653`; `deletion.ts:389–450` | อ่าน retained identities/versions/batches/cleanups และ `deletion_tombstones.attachment_context` ตามสิทธิ์ ไม่ inner-join live Responses จนรายการหาย Retirement ลบ live references ของ Response แล้วเก็บ original reference evidence ใน tombstone รวม operation/workspace context; แจก survivors ที่ resource เดียวกันนอก Response ที่ลบโดยไม่ฟื้น answer rows |
| Slot/row provenance | Version `bindingId`/`tag`/`rowIndex`; Reference `rowIndex`, schema `735–783`; `savedOriginalVersions`, `attachments.ts:376–415` | แยก original upload row กับ current physical row ของแต่ละ snapshot (`row_index`, zero-based); null legacy position คง unknown ไม่เดาจาก compact answer index หรือ visible-row order |

Ledger states (`state`, `generation`, `sentAt`, `receivedAt`, `requestSettledAt`), cleanup `attemptedAt`/evidence และ original checkpoint เป็น evidence ที่ต้องพิจารณาคู่ references ไม่ใช่ permission ให้ settle/retry/delete จาก report Source guards ที่เปิดยังมี protected-reference/shared-alias/unknown fences (`identity.ts:201–305`, `attachments.ts:1273–1287`) งานนี้ไม่ได้เปลี่ยนหรือทดสอบ guards และไม่ใช่ acceptance ของ naming changes ที่กำลัง integrate

#### Reachable sanitized historical evidence — ไม่ใช่ inventory ใหม่

- [D03 หลักฐานตั้งต้น](../../ecm-attachment-safety/issues/03-existing-aliases-recovery.md#หลักฐานตั้งต้น) บันทึก local filename-keyed provider reproduction: A=`[11]`, B=`[22]`, replace B ด้วย C=`[33]` แล้วสองแถวอ่านเป็น `[33]`,`[33]`; full-row control เป็น `[11]`,`[33]` เป็น historical controlled-provider finding ไม่ใช่ Production corruption ไม่รันซ้ำเพื่อยืนยัน และไม่ใช้เป็นรายชื่อ affected real records
- [D06 scoped same-name sample](../../ecm-attachment-safety/issues/06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต) บันทึก POST เวลา `2026-11-18T10:11:31.192Z`: old originals สามรายการคงรายการละ 26,275 bytes/digest เดิมหลัง POST; new receipt อ่าน 667 bytes ตรง synthetic fixture เป็น **supported เฉพาะ historical sample** ไม่ใช่ Folio-wide inventory, proof of independent storage ทุกชนิด, DELETE isolation หรือ settlement ของ HTTP 500 ก่อนหน้า
- Digests ของ old originals ใน D06 เป็นหลักฐาน bytes ณ observation นั้น ไม่พิสูจน์ original ก่อน observation หรือ uploader/source request จากชื่อ/เวลา Raw receipts ถูก redact แล้ว จึงใช้ local report นี้ทำ record-level join กับ Folio ไม่ได้ ชื่อเหมือนกันหรือ bytes เท่ากันไม่พิสูจน์ shared identity รายการเหล่านั้นไม่ใช่ disposable fixtures หรือ authorization ให้ download/delete ใหม่
- Current source มี nullable `originalSha256` และ runtime original-reuse size/hash checks (`attachments.ts:418–489`, `client.ts:160–199,548–597`) เป็น **supported source mechanism** ไม่พิสูจน์ deployed migration, digest population/provenance ของ records จริง หรือผล retrieval Legacy flow ตรวจ size แต่ไม่ได้บังคับ digest แบบ template flow จึงห้ามยก source check มารับรอง historical integrity ทุก record

#### Trusted-original provenance และ recovery proposal

- ก่อน claim ว่า “ตรง/ต่างจาก trusted original” ต้องมีหลักฐานที่ผูก original กับ exact account/resource, Response/snapshot/revision, Field/Tag/physical row และ original upload request/receipt ได้ รวมที่มาของ digest/bytes, ผู้ให้หลักฐาน, เวลา/วิธีได้มา และ chain ที่ตรวจสอบได้ Historical digest ต้องเป็นหลักฐานจากเวลาที่เชื่อถือได้ ไม่ใช่คำนวณจาก current download แล้วย้อนอ้าง
- Trusted original ที่เจ้าของให้ต้องตรวจ provenance ของกลุ่มนั้นจริง ไม่ใช้ filename, size, timestamp, latest/search result หรือไฟล์จากแถวอื่นแทน หากมีแต่ digest ใช้จำแนก integrity ได้เมื่อ retrieval ได้รับอนุญาตและ evidence เพียงพอ แต่ digest ไม่ใช่ bytes สำหรับ recovery
- หาก owner-provided original/provenance ยังไม่พอ ให้คงข้อมูลและรายงาน “ยังยืนยันหรือกู้คืนจากหลักฐานที่มีไม่ได้” ไม่กล่าวหา corruption หรือสรุปกู้ไม่ได้ถาวร Runtime retrieval failure ไม่พิสูจน์ recovery outcome
- เมื่อหลักฐานครบ ให้เสนอ remediation **รายกลุ่ม** ระบุ source/provenance, affected live/retained aliases, ทุก surviving reference/immutable history ที่อาจเปลี่ยนความหมาย, resource/public-link effects, unknowns และสิ่งที่ต้องเขียนจริงให้ pyw1tt อนุมัติแยก ตั๋วนี้ไม่ execute proposal ไม่ rewrite JSON, rename/reupload/delete, hash backfill หรือเก็บ original binary/base64 ใน repo/DB/RustFS/private archive รายงาน retained เฉพาะ sanitized evidence ไม่ใช่สำเนา originals นอก DCM

#### Exact external prerequisites และ pending acceptance

1. **Environment/DB:** pyw1tt ระบุและอนุญาต target environment, Folio deployed revision และ schema/migration snapshot, named executor และ read-only access/export channel; ไม่เปิด `.env` หรือใช้ credential ที่พบในเครื่องเป็นสิทธิ์อ่านจริง Local source ไม่บอก target DB ที่ได้รับอนุญาต
2. **Records/access scope:** ระบุ Forms/Responses/Submissions/Corrections, owner/account scope และ cutoff/snapshot time ที่อนุญาต ครอบคลุม workspaces/eligible Operations/retained deletion cases และขอบเขตอ่าน cross-Response aliases/survivors ข้อมูลนอก scope ต้องไม่ถูก export ทั้งนี้ project test base `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45)` ไม่ให้สิทธิ์ audit records/projects อื่น
3. **Sanitized input/report scope:** ต้องมี approved read-only export/report ของ records ข้างต้น หรือสิทธิ์ให้ executor จัดทำอย่างจำกัด พร้อม source/extraction date, schema revision, record counts by surface, excluded/unreadable sets และ field-level provenance ใช้ opaque stable report labels สำหรับ account/resource/receipt/actor/slot โดยเก็บตัวเชื่อมที่อ่อนไหวในช่องทางที่อนุญาตเท่านั้น ไม่ลง credentials/raw tokens/private evidence URLs หรือ originals ใน repo ขณะนี้ไม่มี scoped record export ที่ใช้จัดกลุ่มจริง
4. **Original-byte retrieval/comparison:** อนุญาตแยกเฉพาะ exact resources และ claim ที่จำเป็น ระบุ authenticated retrieval channel, ผู้เข้าถึง, ช่วงเวลา/stop conditions, trusted-original/digest provider และวิธีตรวจ provenance ไม่สแกน arbitrary DCM inventory ไม่ใช้ historical test permission ซ้ำ และไม่ retain originals นอก DCM หากยังไม่มีสิทธิ์หรือ trusted original ให้ integrity unknown ต่อไป
5. **Review/remediation:** pyw1tt ตรวจรับ inventory coverage, integrity evidence และ recovery feasibility แยกกัน; group proposals/actual remediation ยังต้องอนุมัติใหม่ ไม่มี approval สำหรับ write/DELETE/live remediation/push/deploy จากรายงานนี้

Report จริงเมื่อมี input ต้องระบุ environment/date/source+deployed revision/schema, approved record scope และ examined/excluded counts, sanitized group/attempt/receipt/reference labels, slot/row/revision provenance, identity ambiguity, trusted-original provenance, integrity result, recovery outcome, unknowns/limitations, reviewer และ human decision รายกลุ่ม ช่องที่ยังไม่รู้ระบุ missing/unknown ไม่เติมจาก inference

**Data-use ระหว่าง pending:** คง existing ownership/history/shared-reference/unknown-operation guards ไม่ลบ aliases หรือปลด HOLD ด้วยโน้ต ไม่บล็อกทั้งระบบเพราะ inventory ยังไม่ครบ อ่าน/export saved revisions ตามสิทธิ์เดิม และสื่อข้อจำกัดแก่ผู้ดูแล/ผู้เปิด revision ที่เกี่ยวข้องผ่าน existing surfaces ตาม D03 ไม่เพิ่ม dashboard/manual unlock หรือถือ frozen JSON ว่า external bytes immutable

**Checks/evidence:** อ่าน spec/ticket/canonical resolution และ source ranges ตาม register; ancestry check และ snapshot hashing เท่านั้น ไม่รัน tests/build/lint/formatter, DB audit หรือ provider checks เพราะแก้เฉพาะ ticket หลักฐานจริงและ human acceptance ทุกข้อที่ต้อง environment/records/retrieval ยัง unchecked Parent ต้องเชื่อม report นี้ใน integration evidence โดยคง external HOLD ไม่ถือ documentation completion ว่าปิดตั๋ว

### 2026-11-19 — Current inventory gate

Scoped test approval for 07/08 did not authorize an old-data audit. The latest project preflight's same-name count cannot classify paired receipts, shared identities, surviving Folio references, integrity or recovery. No live application record was read for this ticket. To proceed, a named executor needs an approved read-only channel or sanitized export with the exact environment/schema, record scope and cutoff above. Any original retrieval also needs exact-resource authority and trusted original provenance. Keep integrity unknown without that evidence; remediation and DELETE still require separate authorization.

### Started — scoped read-only authorization and preliminary evidence

pyw1tt authorized starting ticket 10 and opening real originals within the existing limits. The outer boundary remains exact project `กทอ.67-00-0001`, frozen Storage Template `ก่อหนี้-4_ขยาย(45)`, and the previously approved DCM destination. This is read-only: no other projects, arbitrary DCM inventory, data edits, retries of mutations, DELETE, recovery, push or deploy. Do not request the file-open authorization again for an exact resource verified inside that boundary.

**Current report — partial, historical samples only.** Integration working tree `feat/ecm-attachment-safety-implementation`, HEAD `1071d3c7c502`; no target Folio environment, deployed revision or production schema inspected. Mounted memory recall returned navigation results; it did not expose bank/types/budget selectors or canonical document/chunk/revision IDs. Used the [approved policy](../../ecm-attachment-safety/issues/03-existing-aliases-recovery.md#resolution--2026-11-18--pyw1tt--เห็นด้วยกับ-q1-ถึง-q3), [implementation boundary](../spec.md#authorization-และ-hold-register) and these retained observations, not the recall summary, as evidence:

| Source | Supported for the recorded sample | Not established |
| --- | --- | --- |
| [07 exact-receipt PDF comparison](../acceptance/07-scoped-dcm-same-name-pdf.json) | Six same-name PDF records in the sample; the new paired receipt was distinct from the five baseline receipts. The new 628-byte synthetic original matched its fixture; the five baselines had identical size and SHA-256 before and after that POST. | The five files' upload-time originals, present integrity, or surviving Folio references. |
| [08 scoped Folio follow-up](../acceptance/08-sandbox-and-live-follow-up.json) | Three historical synthetic saves in an isolated Folio DB had matching committed slot references and reopened the same receipt; their exact live DCM GETs returned HTTP 200. | Current Folio records, full-byte integrity, or cross-revision aliases. |
| [08 separate relay failure](../acceptance/08-scoped-folio-slot.json) | No canonical reference committed in that sandbox run. Exclude it from counts of saved Folio attachments. | Current provider resource lifecycle or any historical Folio corruption. |

Validated the sample scopes, PDF digests, three historical Folio reference joins and the failed relay exclusion against the retained JSON. Those reports do not carry exact live retrieval keys or a current scoped Folio export. Filenames, sizes and timestamps do not replace those keys. No current Draft, Submission, Correction, workspace, eligible Operation or retained deletion record was inspected; current identities, aliases and integrity are **not inspected**, not zero. Made zero DCM requests or DB connections in this continuation.

**Next input:** an approved read-only Folio export/channel with the target environment/schema and exact selected Forms or Responses for this project/template, including a snapshot cutoff. For full coverage it must include saved snapshots, slot/physical-row references, workspaces, eligible Operations and retained deletion records, or mark omitted surfaces. Match project/template against each historical attachment record, not against the latest answer alone. Use opaque report labels; keep exact saved receipt resolution in the approved channel, not in chat or the repo. Open only originals linked to verified in-scope Folio references when needed; compare against independently trusted historical digests when available, otherwise keep historical integrity unknown. `needs-info` remains for current input and human report review, not for permission to start.

### One provided local Response — 2026-11-19

**Scope and source:** pyw1tt supplied one receipt in the Folio instance at `localhost:8080`. Resolved it to local sample `R1` and its original `Submission S1`; project `กทอ.67-00-0001` and template `ก่อหนี้-4_ขยาย(45)` matched the saved answer and attachment ledger. Examined the local PostgreSQL snapshot at `2026-11-19T11:46:57.502347Z` in a repeatable-read, read-only transaction. The provider was live DCM; its deployed revision is unknown.

**Inventory — supported for R1:** one Submission (revision 0), one scalar attachment, one committed upload attempt, and one active Provider File Identity. The scalar answer's exact saved token/link pair matched the ledger and identity. No saved Draft, Correction, Correction workspace, eligible Operation with a document key, retained deletion case, or retained cleanup for this attachment was found. There was only one reference in R1, so this sample did not exercise a shared identity across revisions. Other Responses and arbitrary DCM files were out of scope.

**Integrity — matched `A1`:** a single HTTPS original GET by the saved receipt returned HTTP 200 at `2026-11-19T11:48:42.609Z`. Both the 2-byte size and streamed SHA-256 exactly matched Folio's original upload evidence. The hash was captured from the upload File and persisted before provider dispatch; it was not backfilled from the download. Used the existing authenticated service session without a fresh login. One setup error occurred before any DCM request. No bytes, token, evidence URL, or raw identifier was retained in this report. No data mutation, DELETE, or recovery was performed.

**Still open:** a separate approved Response with at least two saved snapshots that reference attachments is needed to check sharing across revisions. This finding does not certify other Responses, all current DCM files, or recovery. `needs-info` remains for broader coverage and pyw1tt's review.

### Synthetic cross-revision inventory — local sandbox

Ran two existing cases in [`ecm-scalar-save-submit.test.ts`](../../../apps/server/test/http/ecm-scalar-save-submit.test.ts) against a new isolated PostgreSQL database and RustFS bucket with the existing local DCM double: `template same-name Correction retains protected history with distinct receipts` and `Correction metadata and removal preserve older selected file versions and exports`. Actual Folio endpoints created the Submission and Corrections. Both cases passed (168 assertions), including the selected older exports and original access in the removal case.

Eight independent assertions against the saved ledger passed. The two synthetic Responses had five saved snapshots and seven references. Each reference matched the canonical token/link pair and ledger identity. In the legacy test, Corrections 1 and 2 shared one Provider File Identity and one Upload Attempt for the unchanged scalar file. In the Storage Template test, Submission and Correction 1 had identical filenames and equal upload digests but two distinct paired receipts and identities. Neither filename nor equal bytes established shared identity.

Removed the isolated database and bucket (13 synthetic objects). No access to current Folio records, real DCM, or real DELETE in this run. This verifies the grouping distinction in the sandbox, not the integrity or alias coverage of actual historical revisions. The prior live R1 byte comparison remains separate. `needs-info` stays for real cross-revision evidence and owner review.

### Scoped existing-record search and live synthetic Correction — 2026-11-19

pyw1tt authorized a read-only search of other Responses in `localhost:8080` under the existing exact project and template, and creation of a synthetic case with live DCM if none qualified. At `12:06:42Z`, a read-only PostgreSQL snapshot found three Submissions with exact project `กทอ.67-00-0001`, two verified canonical attachment references under template `ก่อหนี้-4_ขยาย(45)`, and zero Submissions with an in-scope attachment in both the original and a Correction. No other project or Folio environment was inspected.

An isolated Folio instance used actual authenticated Submit, final Correction and XLSX export routes. The workbook was synthetic. The Submission uploaded one 32-byte TXT to live DCM. Correction changed only an ordinary field, kept the original paired receipt, and made no additional upload. The two saved snapshots had two references to one committed upload and one Provider File Identity. Both separately selected XLSX revision exports contained the same saved link. The scoped integration case passed once (53 assertions).

The relay stopped before DCM on the first preflight setup (historical environment copy); the current local coordinator then completed preflight. Before upload it verified the exact directory roster and both previously known same-name TXT receipts. The upload returned HTTP/business 200 and a receipt distinct from all 26 previously listed pairs. After the Correction, one exact-receipt GET returned HTTP 200 and the new 32-byte original matched the fixture's SHA-256. All 26 previous pairs remained present, and both same-name TXT originals (38 and 39 bytes) matched their respective pre-upload SHA-256. Counts: three scoped metadata searches, five original GETs, one file POST, zero new logins and zero DCM DELETEs. No response bodies, tokens, links, or bytes are stored in the report.

The new synthetic DCM artifact remains with pyw1tt: `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).txt`, 32 bytes, created `2026-11-19 19:10:22` DCM local time (UTC+7), in `2. มติและการก่อหนี้`. Removed only the temporary relay, test harness, isolated DB and isolated bucket (five synthetic objects). No existing Folio answer was changed.

**Owner disposition — accepted and closed for this scope:** pyw1tt confirmed acceptance of the scoped supplied Response check, the existing-record search with no eligible cross-revision pair, and the successful synthetic cross-revision journey against live DCM. No current or historical integrity claim is made for uninspected records or environments. No recovery was needed or executed. This closes ticket 10 for the accepted scope only; it does not authorize broader audits, remediation, DELETE, push or deploy, or close ticket 07 or 08.
