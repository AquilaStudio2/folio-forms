# 04: เปลี่ยน docs_number โดย reuse original bytes จาก DCM แห่งเดียว

**What to build:** User เปิด Draft ที่มีไฟล์บันทึกแล้ว เปลี่ยน `docs_number` โดยไม่เลือกไฟล์เดิมใหม่ แล้ว Save Draft/Submit ได้ ระบบโหลดต้นฉบับที่ถูกต้องจาก DCM ผ่าน trusted upload reference ตั้งชื่อใหม่ และคง safety/recovery ของไฟล์เดิม

**Blocked by:** 03 — Scalar Save Draft/Submit แบบ template mode พร้อม identity และ failure safety.

**Status:** ready-for-human

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 68–73; เป็น shared behavior สำหรับ scalar/table/Correction

## Acceptance criteria

- [x] ระบุ supported provider download flow ที่เริ่มจาก `file_link` ของ original upload receipt และพิสูจน์ backend retrieval ของ exact original bytes ไม่พึ่ง undocumented private viewer/PDF.js routes
- [x] Server ใช้เฉพาะ committed canonical reference ที่ตรวจ Response, binding/slot, account, token/link และ expected size แล้ว; forged client URL/token, foreign account/owner หรือ stale reference ไม่ทำให้ fetch arbitrary source
- [x] เมื่อ docs_number เปลี่ยนและไม่มี replacement ระบบโหลดต้นฉบับอัตโนมัติแล้วส่ง original bytes ด้วย frozen template name/new number ไม่ขอให้ User เลือกไฟล์เดิมซ้ำ
- [x] Pending replacement มี precedence และไม่ถูกแทนด้วยไฟล์เก่า; unchanged และ year-only change ใน new modeไม่ fetch/upload/login โดยไม่จำเป็น ส่วน legacy year/number semantics คงเดิม
- [x] Viewer/redirect/download flow ต้องตรวจ URL/origin ทุก hop, credentials propagation, bounded stream/timeout, expected size และ errors ไม่ส่ง service credentials ออกนอก origin ที่อนุญาต
- [x] ไม่ถือ HTTP 200, matching Content-Length, MIME หรือ viewer เปิดได้เป็น proof ต้นฉบับ ปฏิเสธ viewer/error/converted preview ที่ไม่ใช่ original ขณะยังรองรับ original HTML ที่ User แนบจริง
- [x] Provider double ใช้ known original bytes/hash พิสูจน์ binary, text/HTML, image/document, encrypted/password-protected, extensionless, zero-byte และ 10,000,000-byte retrieval/re-upload ไม่แปลงไฟล์/นามสกุล
- [x] Redirect นอก trust policy, expired/unauthorized link, HTML viewer แทนต้นฉบับ, wrong size, oversized stream, timeout และ malformed response ทำให้หยุดก่อน external upload ใหม่และรักษา saved canonical data
- [x] ไม่ persist attachment originals ใน RustFS/DB/base64/workbook ไม่เพิ่ม fallback archive, force reselection, search download fallback หรือ automatic write retry
- [x] Saved B commit แล้วจึงทำ eligible distinct-identity A cleanup ตาม reference fencing; same identity/aliases ไม่ถูก DELETE เพื่อชดเชยการเปลี่ยนเลข
- [x] Failure หลัง external write ใช้ original Operation/identity evidence และ hold ของ 03 ไม่แกล้งว่า A bytes ถูก restore หรือนำ receipt ที่ยังไม่ commit ไปใช้รอบใหม่
- [x] Existing HTTP seam พิสูจน์ User เปลี่ยนเลข → save → reload receipt/document → Submit พร้อม actual original bytes ที่ provider ได้รับ และ failure ที่ไม่มี upload ใหม่
- [x] Smoke native Draft ที่ reopen แล้วเปลี่ยน docs_number โดยไม่เปิด picker พร้อมตรวจ persisted URL และ bytes ของไฟล์ที่ได้ ไม่ใช้ direct helper test แทน User path
- [ ] Before release ต้องมี authorized DCM runtime evidence ของ supported download flow และชนิด/ขอบเขตไฟล์ที่กำหนด ใช้ synthetic files และไม่เรียก live API หากยังไม่ได้รับอนุญาตรอบนั้น
- [x] หากหา supported flow/contract ไม่ได้ ให้ทำ reachable local investigation/guards จนครบ บันทึก exact missing prerequisite และ HOLD delivery/release ของเส้นทางนี้ ไม่ปิดตั๋วว่าเสร็จ ไม่เปลี่ยน DCM-only หรือเปิดคำถามข้อ 1 ซ้ำ
- [x] อัปเดต affected original-reuse callers/fixtures และ workflow/system-map พร้อมแยก simulated proof จาก actual provider acceptance

## Notes

public collection ที่ตรวจใน research ไม่เผยแพร่ original-download API และตัวอย่าง file_link เป็น HTML viewer ข้อเท็จจริงนี้ไม่พิสูจน์ว่า DCM ไม่มี API ดังกล่าวทั้งหมด เป็น technical prerequisite ที่ต้องหา/พิสูจน์ ไม่ใช่เหตุให้เลือก storage ใหม่

## Comments

### 2026-11-17 — implementation and evidence scope

- Public template-mode retrieval uses `GET /api/beeecm/public/file?token=<paired committed receipt token>` with shared authentication. The saved link is origin-validated, not fetched as viewer HTML. Legacy direct-link retrieval deliberately retains its published transport behavior.
- New template upload attempts persist nullable ledger `original_sha256` metadata through migration `20261117030000_attachment_original_digest`. Hashes are streamed before dispatch and checked during bounded exact-size original reads. Verified original hashes are reused. No answer JSON, original-byte storage, dependency or configuration was added. Missing historical/intermediate digests are not backfilled from mutable provider URLs.
- Original reuse resolves only attempts referenced by the current canonical snapshot. Completion prefers this Operation's received attempt, then the current trusted snapshot reference, rather than timestamp ordering. Same-token/link/name/size replacement therefore preserves B's digest for the later number change.
- Actual native acceptance used isolated database `folio_storage_templates04_20261117_c1db2ece`, server18188/provider18189/web15174/gateway18081 and an externally launched private-profile Chrome on CDP19224. User selected a four-byte original through the native OLE picker, saved, reopened, changed B2 from `NATIVE04` to `NATIVE04-CHANGED` without reopening the picker, saved, downloaded actual XLSX and submitted. The export contained the changed number and saved URL; that URL returned exact `[0,255,7,1]`. Provider counts were one initial upload, two after number change, still two after Submit; one original GET for reuse, plus one separate byte-verification GET. Distinct A cleanup ran once. All owned runtime services were stopped.
- Native artifacts: `/tmp/folio-storage-templates-runtime/native04/native-evidence.json` and `number-change-export.xlsx`. Browser-managed bootstrap/profile failures required unique external CDP; they are not application acceptance failures.
- Local simulated matrix includes original HTML, binary, text, image-signature bytes, actual password-encrypted ZIP, extensionless and exact size boundaries. It is not real-provider all-type proof. Parent's sole live proof remains the authorized 629-byte PDF and matching SHA-256; provider all-type/zero/10MB/encrypted/extensionless and deployed-version guarantees remain release acceptance limits. No live API was called by this ticket.
- Verification: isolated DB name checked before migrations; `db:generate` and `db:migrate` succeeded only there. `bun run --cwd apps/server check-types` passed. Focused original/legacy HTTP command passed 38 tests, 1,659 assertions; malformed-stream-only follow-up passed. The provider's default ten-second idle timeout initially shortened the stalled-stream case, so that fixture was corrected to stay open beyond the client's ninety-second budget; its separate real-deadline result is recorded below. Formatting ran only on the three scoped TypeScript files; generated workflow artifacts and whole-integration gates remain parent-owned.
- Corrected stalled-stream proof: `bun test apps/server/test/http/ecm-scalar-save-submit.test.ts --timeout 120000 --test-name-pattern 'template original stalled stream'` passed one test in 93.07 seconds. The provider stayed open beyond the client budget, elapsed-time assertion required at least 90,000 ms, no new upload occurred and canonical Draft remained unchanged.

### 2026-11-17 — Parent integration regression gate

- Merged04 at `bf93be6038baa9759726164a88d6272bb4e3c9db`; isolated integration `db:generate` and migration deployment succeeded, adding only the nullable digest migration.
- Full existing scalar HTTP suite on integration: **117 passed, 4 failed**, 121 tests, 356.55 seconds. Failures: `Correction authenticates independent bearer and cookie credentials while preserving native capability-only requests`; `Correction metadata and removal preserve older selected file versions and exports`; `workspace and immutable Correction transitions retain canonical files and reconcile references without ECM writes`; `whole-Response deletion snapshots Submission, Correction, workspace and Operation evidence before cascade`.
- Current-source reference filtering exposed the initial Correction workspace clone: its new document key has no ledger references before the first workspace save. Resolution must use only the captured, currently verified workspace/base contract; arbitrary historical or newest-timestamp fallback remains forbidden. A dedicated follow-up fix and passing integrated verification are required before closure.

### 2026-11-17 — Initial Correction source-snapshot follow-up

- Root cause: a newly cloned Correction workspace has no attachment references under its new key. Strict current-only lookup rejected valid immutable-base receipts during both original planning and internal workspace completion.
- Shared source resolution keeps current references authoritative. Only a reference-free initial Correction clone may resolve its captured base after the persisted processing Operation, enabled Admin, Response/form, lease, workspace/object key and latest Submission/Correction key/revision all match. The existing workspace validator is shared with completion, not reimplemented. A previously completed workspace snapshot without references cannot resurrect base files; mismatches in an existing current snapshot never search history.
- Added a public HTTP regression that changes the captured lease base while the initial native request is paused, before original retrieval or provider writes. It requires failure and preserves Submission data/history. Existing four parent regressions and current-B digest regression remain unchanged. The first verification attempt exposed a test-fixture deadlock (awaiting the request before releasing its capture barrier), timed out and was stopped; the fixture now releases native capture before awaiting admission.
- No live DCM/PDMS calls, client changes, schema changes, per-slot candidate-policy changes, ticket closure or generated workflow artifacts in this follow-up. Fresh native Correction smoke is not claimed here; changed-path native acceptance remains with integrated tickets06/08 and the parent. Earlier ticket04 native Draft proof does not prove this Correction path.
- Verification detail: the corrected capture fixture first expected asynchronous admission, but the existing admission guard correctly returned HTTP409 for its changed base. The test now asserts that consumer-visible rejection directly; its focused run passed one test/39 assertions in4.30s. The surrounding scoped run already passed eight existing tests/627 total assertions, with only that incorrect202 expectation failing. These fixture corrections are not claims of application regressions.
- Final scoped verification on the follow-up branch (integration base `5f7fb07`): `set -a && source /tmp/folio-storage-templates-runtime/ticket04.env && set +a && RTK_DISABLED=1 bun test apps/server/test/http/ecm-scalar-save-submit.test.ts --timeout 120000 --test-name-pattern 'Correction|workspace|table.*history|template same receipt/name/size|whole-Response deletion snapshots'` passed **9 tests, 900 assertions, 0 failures**, 113 filtered, 51.19s. This includes all four parent RED names, current-B digest reuse and the negative captured-base case; internal workspace save retained its no-ECM-write assertions. Server `check-types` passed. Own worktree dependencies/client were prepared; `current_database()` confirmed `folio_storage_templates04_20261117_c1db2ece`; no migrations or resets ran.
- Merged current integration tip (`5f7fb07`, already up to date). Per parent coordination, unfinished05 source/schema/signature changes were not imported. Combined05 table-history/full-suite checks and generated workflow artifacts remain parent-owned after both changes merge. Test processes/listeners exited; no new persistent runtime was started, and existing DBs, provider/native services and worktrees were preserved.

### 2026-11-17 — Parent post-fix and native integration proof

- Follow-up merged at `1ec9e7a7807ea133347081aa85e788a5afb68db2`. Parent ran the same scoped Correction/workspace/current-B/deletion selection on the integration checkout: **9 passed, 0 failed, 113 filtered**, 653 `expect` calls, 25.01 seconds. The earlier four integrated failures are fixed in this exercised scope; the combined05 full file remains a later gate.
- Parent's actual integration application/ONLYOFFICE/provider-double journey used the already native-authored no-year Form. Selected16-byte A through the native OLE picker, Save Draft, browser reopen, unchanged Save and save-before-reauthentication added no file writes. Selected28-byte B, waited for the actual pending-File acknowledgement, then saved: same filename/resource, **2 uploads and0 DELETE**. Ordinary document-number cells were populated with the real ONLYOFFICE SDK; no attachment-operation payload or SDK result was mocked.
- Changed `docs_number` without opening the picker or selecting another File. The real backend performed one authenticated original GET, uploaded exact28-byte B with matching SHA-256 under the changed filename, then deleted the old unreferenced shared resource once. Final unchanged Submit displayed the normal successful-submission message without navigating to a receipt page or adding file writes: totals **3 uploads,1 DELETE,1 original GET**. All multipart uploads had exactly `documentFile` and `template`; all filenames retained the uppercase `BIN` extension without a row/version suffix. The provider's saved link was an HTML viewer, not a direct original response.
- A first synthetic Save was rejected before any upload because the browser formula-control automation had not committed its cell value; the pending File survived. The actual committed SDK value then saved successfully. Incorrect frame/close selectors and assumed receipt navigation were automation failures, not hidden application failures.
- Parent also exercised the actual integrated original reader against the sole authorized live629-byte PDF. Shared login200/public GET200, exact full bytes and SHA-256 passed; no additional live file upload or DELETE occurred. Research records the initial untraced unavailable attempt and the remaining provider-matrix limits.

### Parent integration disposition — 2026-11-17

Implementation and local original-reuse acceptance are complete, including one exact live PDF read; required before-release all-type/boundary/provider evidence is NOT complete. AC14 remains unchecked and the ticket is not resolved, as AC15 requires.

- Delivery branch `feat/ecm-storage-templates`; production source `d8162b8`, final fixture merge `baf64cb`. See the [canonical acceptance matrix](../acceptance-matrix.md) for final integrated HTTP/native/export/root/review evidence and exact source qualifications. This disposition is based on observed consumer behavior and source review, not copied worktree checkboxes or counts alone.
- Final Standards and Spec rechecks have no code findings. Workflow/source inventory/rendered guide were rebuilt and opened; owned test runtimes/databases/bucket/worktrees and private scaffolds were removed after retaining evidence. Original checkout and existing user services remain; no user schema/answer migration, push or deployment. Normal coordinated live authentication is not represented as zero DB writes.
- Provider all-type/boundary/overwrite/settlement/deployed-version and human release evidence remain HOLD. One authorized synthetic PDF remains for the user to remove; local resolution is not provider/Production approval.
