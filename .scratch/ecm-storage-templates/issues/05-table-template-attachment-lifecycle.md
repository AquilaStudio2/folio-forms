# 05: Table attachments แบบ Storage Template รักษา physical rows และ shared-identity safety

**What to build:** User แนบไฟล์รายแถวในคอลัมน์ที่ Admin ตั้ง Storage Template บันทึก/เปิด Draft และ Submit ได้โดยไฟล์ไม่สลับแถว รองรับ attachment-only/zero-byte rows และหลายคอลัมน์ พร้อมตรวจชื่อซ้ำหรือ shared identities โดยไม่เติม suffix เอง

**Blocked by:** 03 — Scalar Save Draft/Submit แบบ template mode พร้อม identity และ failure safety.

**Status:** in-review — implementation and isolated table/native acceptance complete; parent integration review pending

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 86–94; original reuse จาก 04 รวมเข้าที่ shared caller เมื่อพร้อม ไม่ใช่ blocker ของ row-specific behavior ในตั๋วนี้

## Acceptance criteria

- [x] Table column ใช้ frozen category/template/mode เดียวกันทุกแถวและหนึ่งไฟล์ต่อ physical-row slot ไม่เปิดให้ User เลือก template รายแถว
- [x] ใช้ trusted physical-row position และ published binding ไม่ใช้ compact JSON array index แทน `row_index`; blank gaps และ multiple attachment columns ไม่ cross-wire ไฟล์
- [x] Attachment-only rows รวม saved/selected zero-byte files ถูกเก็บเป็น active rows และ Submit ตรวจ required ordinary/attachment columns อื่นทั้งหมด
- [x] Fully empty rows ที่ไม่มี input/file ไม่ถูกบังคับแนบเพียงเพราะมีปุ่ม; invalid selected file ยังทำให้ Draft save ไม่ผ่าน
- [x] Save Draft → reopen → replace/remove/cancel → Submit แสดง canonical receipt/URL ของ slot ที่ถูกต้องโดยใช้ native picker/buttons เดิม
- [x] Existing supported append/delete-selected รักษา references และ pending Files ด้วย verified document/row mapping โดยไม่ upload/delete จาก internal save
- [x] Unsupported/stale/ambiguous mapping หยุดก่อนทำข้อมูลหรือ pending selections หาย ไม่เพิ่ม stable row ID/Tag ใหม่เพื่อหลบข้อจำกัด
- [x] วางแผน duplicate destinations ทั้ง batch ก่อน dispatch และตรวจ owner/history/reference/admission fencing ไม่รอ token collision หลังเขียนแล้วจึงค่อยป้องกัน
- [x] คง filename grammar ที่ไม่มี row/version suffix ยอมรับเพียงข้อจำกัดชื่อซ้ำที่ planning อนุมัติ ไม่รับรอง independence หาก provider reuse identity
- [x] Same-identity receipt ไม่ถูก DELETE จาก replacement/canceled-batch cleanup และไม่สร้าง independent-version evidence ปลอม Foreign/protected destination conflicts หยุดก่อน write
- [x] หลายไฟล์ส่งตาม existing sequential plan และ commit document/JSON/references เป็น complete snapshot เดียว Failure กลาง batch ไม่มี partial Submission และไม่เริ่มไฟล์ถัดไปโดยเดาผล
- [x] Unknown upload/overwrite, receipt collision, late response และ commit failure ใช้ durable evidence/hold ของ 03 ไม่ rollback external bytes, retry write หรือ DELETE shared identity
- [x] Errors ระบุ column/slot และ physical row ที่ User แก้ได้โดยไม่เผย secrets คง size/JSON/requiredness/security boundaries เดิม
- [x] Existing HTTP seam พิสูจน์ physical gaps, multiple columns, attachment-only zero-byte rows, empty/active requiredness, row shifts, duplicate destinations และ partial/unknown batch โดย provider bytes/receipts จริงของ test double
- [x] Smoke actual ONLYOFFICE ตั้ง template ให้คอลัมน์ แนบอย่างน้อยสอง physical rows ที่มี gap บันทึก/เปิด/ส่งและตรวจ persisted URLs; แสดง duplicate-name limitation ตามผลจริง
- [x] เมื่อรวม 04 แล้ว table docs_number change ใช้ shared trusted-original flow ครบทุก saved slot ไม่สร้าง table-specific storage/cache หรือ download bypass
- [x] อัปเดต affected table consumers/fixtures และ workflow/system map โดยไม่เปลี่ยน legacy published table behavior หรือข้อมูลเดิม

## Notes

ตั๋ว 05 ไม่รอ 04 เพราะ row mapping/requiredness/selected-file batch ใช้ 03 โดยตรง ส่วน journey ที่เปลี่ยน docs_number โดยไม่มี replacement เป็นงาน 04 และต้องผ่านแบบรวมก่อน 06/08 เสร็จ

ต้องเตือนก่อน implementation/release ว่าหลายแถวที่ส่งชื่อเดียวกันอาจอ้าง provider identity เดียวกัน ข้อยกเว้นนี้ไม่อนุญาตทำลายข้อมูลคนอื่นหรือ immutable history

## Comments

### Implementation and evidence — 2026-11-17

- Reused03 destination/identity/reference/delete fencing and existing table/native workflows. No client, upload grammar, per-row Tag/ID/suffix, attachment-byte storage, or07 deletion-helper changes.
- Fixed a demonstrated defect: identical token/link/name/size in two physical rows selected one attempt twice, leaving the other `received` and blocking unchanged saves. A coarse current-alias preservation experiment was superseded: it could falsely reject original reuse after deleting overwritten A while valid B survives.
- Added nullable `EcmAttachmentReference.rowIndex` as the **current physical position within one canonical snapshot**, not a stable row identity. Migration `20261117031000_attachment_reference_rows` adds nullable metadata/check only; no guessed backfill or answer JSON changes. Original attempt `rowIndex` remains immutable. New references select own-operation exact rows; saved references follow current positions and verified workbook transitions. Unknown old mappings remain conservative.
- Draft/workspace completion passes verified `attachmentTransition` to the shared commit. Submit/final Correction preserve positions without passing the working-document transition to a differently named final snapshot. Reference creation remains under03 ownership/resource fencing. Shared originals use only current referenced row attempts; unknown ambiguous/missing digests fail before writes without guessing newest evidence.
- Isolated DB name checked before generation/migrations: `folio_storage_templates05_20261117_c1db2ece`; HTTP callback18383. No shared/Production migration, reset, or live ECM/PDMS call.
- Final isolated verification: server `check-types` PASS; `bun test --cwd apps/server --timeout 120000 test/http/ecm-scalar-save-submit.test.ts --test-name-pattern '^(template )?table '` PASS27/27 (116.84s). This is the table-specific run, not a claim that the full scalar/integration suite passed.
- Merged parent source-resolver integration `1ec9e7a7807ea133347081aa85e788a5afb68db2`. The sole conflict retained05 current-row reference metadata together with the trusted captured workspace/base `attachmentSourceSnapshot`; Draft/workspace-only transition arguments remain intact. Final combined scalar/table verification is recorded separately from the earlier table-only run.
- Final combined source verification after that merge: server `check-types` PASS; unfiltered `bun test --cwd apps/server --timeout 120000 test/http/ecm-scalar-save-submit.test.ts` PASS139/139 (417.54s). This exercises the shared03 cancellation/late-receipt/commit-failure protocol as well as05 tables and the fixed04 captured-source paths; it is not a claim that every repository HTTP suite or live provider matrix was exercised.
- Behavioral HTTP coverage: legacy/new-mode physical gaps, multiple columns, selected/saved zero-byte rows, ordinary/attachment requiredness, empty rows, append/delete-selected, stale/forged slots, removals, sequential partial/unknown batches, same-identity replacement/removal, foreign/history pre-dispatch conflicts, identical shared receipts through unchanged save/replacement/partial/last removal, all-slot original reuse after shifts, and surviving B reuse after A deletion. Provider-double receipts and original bytes—not mocked SDK return values—supply assertions.
- Actual native lifecycle used own server18288/provider18289/web15274/gateway18082 and own Chrome CDP18505/profile. Form `9d690894c4e34225825a9050e893afbe`, Submission `e5d414fc-c0cb-44c9-ad41-5524d4d1f3db`: selected rows0/2 with a gap and zero-byte file; pending Files survived append without upload; Save/reload preserved receipts; Submit reported required `B10`/`B12` without writes; replacement selection/cancel/save, same-identity overwrite with no DELETE, pending removal across delete-gap mapping2→1, removal with surviving shared row0, and Submit all passed. Final Submission JSON retained the zero-byte row and canonical receipt.
- Actual Admin column chooser on duplicated synthetic Form `ae9747f914b64a188487d291de45e6b1` changed the proof column to `อื่น-ตาราง` and reported saved configuration/template; provider upload count unchanged. Its initial stale catalog-ID fixture was corrected only in the synthetic Draft before the successful native configuration proof.
- Final position-aware native proof on Form `bdf64e16e5344ef8bbbaf2e8afed3502`: A at0 and B at2 shared pair/name/size but original bytes differed (`[1]`/`[2]`). Actual delete-selected removed A and remapped B to1 with zero upload/DELETE. Changing only `docs_number` to `NATIVE05-SURVIVOR` performed one authenticated original read and uploaded exact `[2]`; saved row stayed1. One distinct old resource cleanup followed the new receipt commit; there was no DELETE during the shared-identity phase.
- Evidence JSON: `/tmp/folio-storage-templates-runtime/table05/native-evidence.json` and `position-native-evidence.json`; consolidated evidence `/tmp/folio-storage-templates-05-evidence.md`. Runtime is stopped before delivery; fixtures remain only in the isolated DB for parent cleanup.

### Failed attempts and limits

- Initial table run27/28 included one generic non-HttpError after all receipts (Operation `678f5aec-7fa3-4f56-96a6-04c2bf1fa244`). Isolated case1/1 and subsequent diagnostic table run28/28 passed; root cause was not established. Do not label it transient or claim it fixed.
- The identical-receipt regression was observed red on unchanged save before the reference fix. Temporary diagnostic logging was removed. Successful-batch follow-up polling was an invalid observer and was replaced by public lifecycle/bytes assertions plus explicit reference invariants. Final cleanup assertions wait for the actual provider-double deletion settlement.
- During the position extension, type errors and a final-Submission transition-key mismatch were observed and corrected before the passing26-case run. Earlier broad `table` pattern also selected `immutable` tests and exposed inherited04 workspace/base-source failures; those belong to the separately assigned04 source resolver, not a table-test narrowing used to claim the full scalar suite passed.
- Managed Chrome sessions repeatedly disappeared; actual native proof completed through separately owned external Chrome/CDP. Initial smoke fixture mistakenly shared main-template/initial-Draft object keys; only synthetic template bytes were restored, and the final position fixture uses distinct keys. Picker automation initially selected before initialization/relay settlement; final proof waits for the actual pending state before saving.
- Provider double proves Folio behavior, not live DCM compatibility, deployed behavior, external rollback, immutable provider bytes, or independent resources for duplicate filenames. Historical unknown reference positions/digests are not fabricated. Parent still owns integrated verification, generated workflow artifacts, review, and release.

