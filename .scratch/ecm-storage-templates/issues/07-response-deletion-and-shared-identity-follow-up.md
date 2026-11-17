# 07: Response deletion ปลอดภัยต่อ shared file identity และติดตาม cleanup ต่อได้

**What to build:** User/Admin ลบ Response ตามสิทธิ์และ confirmation เดิมได้ โดยแยกผลลบข้อมูลกับผลลบไฟล์ ป้องกัน shared provider identity ที่ยังถูกอ้างอิง และเก็บ persistent warnings/evidence ใน existing Results follow-up แม้ Response ถูกลบแล้ว

**Blocked by:** 03 — Scalar Save Draft/Submit แบบ template mode พร้อม identity และ failure safety.

**Status:** ready-for-agent

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 107–110; reference protection/warnings ครอบคลุม legacy/new resources และทุกชนิด snapshot

## Acceptance criteria

- [ ] Owner discard ใช้ได้เฉพาะ Draft ของตน Admin whole-Response deletion และ Viewer read-only คงสิทธิ์/confirmation เดิม ไม่ให้ arbitrary client URL/token เป็น deletion authority
- [ ] Response deletion เก็บ durable trusted attachment context ของ Draft/Submission/Correction/workspace/eligible Operations ก่อนลบ rows; ไม่ลด scope เหลือเฉพาะ latest receipt
- [ ] คำนวณ surviving references/aliases ที่ canonical provider identity หลัง retire references ของ Response ที่ลบ ไม่ถือ separate version/attempt rows หรือ token inequality ว่าไฟล์แยกกันเสมอ
- [ ] Existing admission/reference/deletion fencing ป้องกัน race ที่ reference เกิดใหม่ระหว่าง no-reference check และ dispatch DELETE; shared/protected/current B identity ไม่ถูกลบ
- [ ] DELETE ทำได้เฉพาะ known owned received/committed identity ที่มี request settlement และไม่มี surviving references ไม่มี search/client-token ownership inference
- [ ] Unknown upload, unconfirmed in-place overwrite หรือ previously dispatched uncertain DELETE ยังคง evidence-based hold ไม่ใช้เวลารอ/empty search/operator note ปลดหรือ resend
- [ ] Same-token overwrite evidence จาก 03 ไม่ทำให้ deletion follow-up ส่ง DELETE สำหรับ retired A แล้วลบ B ที่ยังใช้อยู่; known shared references ยังคง protected หลัง reload/restart
- [ ] การลบข้อมูลกับ confirmed external cleanup แสดงผลแยกกัน Old public URL อาจเปิดได้ขณะ cleanup ค้าง ต้องมี persistent warning ไม่แสดงว่าไฟล์ถูกลบจาก JSON disappearance เพียงอย่างเดียว
- [ ] Existing Results tracking ยังอ่าน evidence ได้โดย Admin/Viewer หลัง Response deletion โดยไม่คืน answers เป็น normal Response row; เฉพาะ current enabled Admin ทำ authorized first cleanup ตาม evidence เดิมได้
- [ ] Ordinary saves หรือเปิดหน้าใหม่ไม่ retry upload/delete ไม่ล้าง warning และไม่ adopt late receipt เป็นคำตอบ; late receipts ใช้ follow-up ตาม scope/fence จริง
- [ ] Archive คง files/history และไม่ dispatch file deletion Catalog CRUD และ duplicate Form ไม่สร้าง deletion cases หรือ cleanup ของ User
- [ ] Existing HTTP seam พิสูจน์ deletion authorization, confirmed/unconfirmed outcomes, shared identity across surviving snapshots/Responses, concurrent reference claims, crash/late receipt และ durable tracking หลังลบ Response
- [ ] Smoke actual deletion/confirmation และ Results follow-up ด้วย synthetic Responses/provider double ตรวจ saved B URL ของ reference ที่ยังเหลือและ persistent warning หลัง reload
- [ ] อัปเดต cleanup/deletion consumers, fixtures และ workflow/system map โดย reuse existing recovery/follow-up surface ไม่เพิ่ม dashboard, automatic retry queue หรือ manual unlock ที่ไร้หลักฐาน

## Notes

ไม่ต้องรอ 04/05 เพื่อทำ identity-aware whole-Response cleanup เพราะใช้ shared identity/attempt contract ของ 03 และ generic references ตั๋ว 08 ต้องตรวจ table/Correction combinations อีกครั้งบน integration checkout

ไม่มีการอนุญาตให้ลบไฟล์ live ของ User หรือขยายสิทธิ์ destructive actions จากการสร้างตั๋วนี้

## Comments

### 2026-11-17 — Ticket07 implementation evidence; integration acceptance pending

- Reused ticket03's production deletion, canonical-identity reference fencing and durable follow-up. No additional production change was needed. Existing workflow/system-map behavior remains accurate; generated artifacts remain integration-owner work.
- Added an HTTP regression for template-mode A/B attempts sharing one provider identity, a surviving reference on B owned by another Response, Viewer denial, and exactly one DELETE after the last Response retires. The surviving URL returns B's exact bytes before final deletion and HTTP404 afterward.
- Extended failed/unknown whole-Response deletion regressions to template-mode alias attempts. Dispatched cleanup remains unknown, references retire with deleted answer rows, Results evidence survives, repeated deletion does not resend, and unresolved cleanup continues to prevent account removal.
- Final targeted command from `apps/server`, after sourcing `/tmp/folio-storage-templates-runtime/ticket07.env`: `bun test --timeout 120000 test/http/ecm-scalar-save-submit.test.ts --test-name-pattern 'whole-Response deletion|unknown DELETE|late canceled receipt|Results retains trusted cleanup|template unknown overwrite|unproven provider alias|in-flight DELETE'`. Result: **20 passed, 0 failed, 71 filtered**, 1,464 assertions. This includes existing authorization, archive, full history/workspace/Operation context, initial-DELETE races, late receipts, fresh-app tracking and evidence-based first-cleanup cases.
- Isolated DB name was checked through `current_database()` before `db:generate`/`db:migrate`; only `folio_storage_templates07_20261117_c1db2ece` was migrated. Callback18483. No reset, shared-data migration or live provider request.
- Actual Chrome/app/provider-double smoke used server18388, provider18389, web15374 and gateway18083. Owner Cancel preserved the Draft. Confirmed owner discard removed the shared Response while B stayed readable as exact byte `[66]` and provider DELETE count stayed0. Admin Cancel preserved the surviving Response; confirmed Admin deletion then removed the final reference and produced one verified shared-resource DELETE, after which B returned404.
- A separate provider-rejected DELETE removed answer rows while preserving the owner's cleanup warning across dashboard reload. Admin and Viewer Results both retained the deleted case, distinguished committed cleanup warning from unknown-upload mutation hold, and displayed `ปี: - / แม่แบบ: ก่อหนี้-4_ขยาย(45)` rather than inventing a year. Viewer had no follow-up mutation controls. Results reload and unknown owner-discard rejection did not send another upload or DELETE.
- Browser fixture setup required correction: initial synthetic Published Template and Response accidentally shared an object key, which correctly prevented object cleanup; an attempted immutable-template update was rejected. Fresh fixtures used separate object keys and unique provider filenames. Initial HTTP fixture also needed explicit same-token/link double configuration; corrected final run is the passing result above. These were fixture errors, not suppressed application failures.
- Evidence screenshots: `/var/folders/hx/gkp7qp017jz17c69mzbqc8t40000gn/T/omp-sshots-15d13032b5518e9f.webp` (owner unknown hold plus persistent warning), `/var/folders/hx/gkp7qp017jz17c69mzbqc8t40000gn/T/omp-sshots-15d1312ae6118ea0.png` (Viewer Results evidence).
- Runtime launchers, credentials and fixtures stayed outside the repository. No new dashboard, retry queue, manual unlock, schema or provider-token authority. Full integrated suites, regenerated workflow artifacts and ticket closure remain with the integration owner. This evidence does not prove live DCM settlement or Production behavior.
- Stopped owned server/provider, both web service instances, exact CDP Chrome service and browser handles; stopped and removed only `folio-storage-templates-gateway07`. Isolated DB and synthetic evidence remain for parent inspection. Merged the current integration branch before delivery; its only incoming change was additional shared spec evidence.

### 2026-11-17 — Parent integration verification

- Merged into `feat/ecm-storage-templates` at `6c0ef6fc95a126f190e17348c9392f366f9d2bf6` without conflicts. Parent ran the same deletion/follow-up HTTP selection on the integration checkout using its isolated DB/callback: **20 passed, 0 failed, 71 filtered**, 809 `expect` calls, 43.11 seconds.
- This is integrated HTTP proof, not a replacement for the native worktree evidence above or final combined native/export acceptance. Final review and ticket closure remain pending.
