# 03: Scalar Save Draft/Submit แบบ template mode พร้อม identity และ failure safety

**What to build:** User แนบไฟล์ช่องเดี่ยวใน Form โหมดใหม่ บันทึก Draft เปิดกลับมาแทน A ด้วย B แล้ว Submit ได้ด้วย request/filename ใหม่ รับ receipt จริงและใช้ URL ของ B โดยไม่ลบ shared identity ไม่ทำลายประวัติ/ไฟล์คนอื่น และรายงาน unknown overwrite ตามจริง

**Blocked by:** 02 — ตั้ง Storage Template ใน popup และตรึงสัญญาเมื่อเผยแพร่ Form ใหม่.

**Status:** implemented — isolated acceptance passed; integration review/closure pending

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 50–67, 74–85; row/Correction consumers ใช้ shared safety contract นี้ต่อ

## Acceptance criteria

- [ ] เลือกไฟล์อย่างเดียวไม่ upload/delete; upload เฉพาะ explicit Save Draft/Submit ผ่าน existing Operation/checkpoint/native snapshot path ไม่เกิดจาก catalog, template save, export หรือ internal saves
- [ ] New mode ใช้ trusted root `docs_number` และ frozen `template_name`; filename เป็น `<docs_number>-<template_name>.<original-extension>` คง casing/extension และ extensionless ไม่เติมนามสกุล ไม่เพิ่ม UUID/row/version suffix
- [ ] Multipart ของ new mode มี `template="1"` กับ original-byte `documentFile` เท่านั้น ไม่มี year/number/category/ID/type แยก Legacy Published mode ยังใช้ request/filename เดิม
- [ ] ไม่มี `fiscal_year` ก็ Save/Submit attachment ได้ใน new mode หาก Field rules อื่นผ่าน การแก้ปีอย่างเดียวไม่ upload unchanged files และไม่ลบปีหรือแก้ results-filter policy
- [ ] ตรวจ unsafe filename/metadata, actual streamed file size และ canonical JSON budget ก่อน dispatch เท่าที่ตรวจได้ ไม่ rewrite input หรือข้าม validation เพื่อให้บันทึกผ่าน
- [ ] รับทุกชนิดไฟล์รวม 0 และ 10,000,000 bytes, password-protected และ extensionless; oversized/invalid selected file ล้มแม้ Save Draft และ errors ระบุ slot
- [ ] Draft ขาด required attachment ได้ Submit ต้องมี required file; saved zero-byte object นับว่ามีไฟล์ ไม่ใช้ pending filename เป็น durable presence
- [ ] Valid object receipt ของ mode ใหม่และ legacy one-item-array receipt ถูกตรวจ success/safe URL/token เก็บคู่จาก original POST ไม่ใช้ search/latest/client receipt fallback; null/multiple/unsafe/malformed receipt ไม่ถูกทำให้สำเร็จปลอม
- [ ] Ledger ไม่มี fiscal year ได้สำหรับ new modeโดยไม่ใส่ปีปลอม หลักฐาน operation/attempt แต่ละครั้งคงอยู่และ same-token receipt ผูกกับ proven canonical provider identity ได้ ไม่ reject หลัง write หรือถอด uniqueness แบบเหมารวม
- [ ] ก่อน dispatch ตรวจ trusted ownership/account/destination และ protected Draft/Submission/Correction/workspace/eligible Operation references พร้อม fencing กับ concurrent writes/reference/deletion ไม่พึ่ง token comparison หลัง provider เขียนแล้ว
- [ ] Foreign-owner/history destination conflict หรือ identity ที่ยังพิสูจน์ความปลอดภัยไม่ได้หยุดก่อน write; duplicate-name acceptance ไม่ถูกใช้ข้าม guard นี้
- [ ] Save A → reopen → choose B → Submit สำเร็จบันทึก original receipt ของ B และ UI/read-only projection ใช้ URL ของ B; same-token/link overwrite ไม่ส่ง DELETE token นั้นซ้ำ
- [ ] Distinct proven A/B identities ทำ cleanup A หลัง complete canonical B commit และไม่มี references เท่านั้น ตรวจ aliases ไม่ใช้เพียง token inequality เป็นหลักฐานว่าลบได้
- [ ] DELETE A ล้ม/unknown หลัง B commit ยังคง B completed/usable พร้อม persistent warning ว่า A อาจยังเปิดได้ ไม่ rollback B และ ordinary save ไม่ retry DELETE หรือล้าง warning
- [ ] Same-identity overwrite ที่ external write สำเร็จแต่ Folio commit ล้ม/ไม่แน่ชัดต้องเก็บ durable intent/receipt/settlement evidence และ hold ที่เหมาะสม ไม่อ้าง A bytes ยังเดิม ไม่ DELETE shared current identity เป็น compensation
- [ ] Multi-scalar save เปิดเผยเฉพาะ complete canonical snapshot; partial/unknown outcomes, late receipt, crash, stale callback และ lost response ใช้ original Operation recovery ไม่ resend/adopt/search fallback หรือ partial Submission
- [ ] Unchanged saved files/metadata reuse references โดยไม่ upload/login ใหม่ การเปลี่ยน docs_number บน saved file ที่ไม่มี replacement ใช้ existing explicit retrieval error จนงาน 04 ครบ ไม่บังคับ reselectionหรือแสดงว่า reuse ใหม่สำเร็จแล้ว
- [ ] Existing shared auth/12-hour renewal, authorization, trusted row-independent binding, worksheet protection และ JSON shape 262,144-byte limit คงเดิม ไม่มี originals ใน RustFS/DB หรือ secrets ใน workbook
- [ ] Existing HTTP seam/provider double พิสูจน์ actual multipart bytes/fields, object/array receipts, same-token overwrite, protected destinations, duplicate/unknown admission, commit windows และ cleanup success/warning โดยใช้ deterministic barriers
- [ ] Smoke actual scalar native flow ตั้งไฟล์ → Save Draft → reopen → replace → Submit รวม no-year Form, unchanged save และ same-identity no-extra-DELETE; สังเกต actual saved canonical URL ไม่ใช้ test count แทน
- [ ] อัปเดต affected callers/fixtures/exports projection/recovery messaging และ system map ใน change นี้ เตือน duplicate-name/shared-URL limit ก่อนเริ่ม implementation และไม่อ้าง Production readiness

## Notes

การไม่มี original-reuse implementation ในตั๋วนี้ไม่อนุญาตให้ลดขอบเขต feature 04 ต้องเสร็จก่อน feature delivery และเปิดใช้เส้นทางเปลี่ยนเลขหนังสือ

DCM อาจเปลี่ยน bytes ที่ URL เดิมก่อน Folio transaction commit การ rollback DB ไม่คืน external bytes ต้องรักษา evidence/hold โดยไม่เพิ่ม automatic write retry หรือ pretend rollback หากยังขาด external settlement proof ให้ HOLD กรณีนั้นอย่างชัดเจน

## Comments

### Implementation evidence — 2026-11-17

- Branch `feat/storage-templates-03`; base checked before edits: merged02 integration `1d23d50a9bbc4b4ae37014b3c2ed358b50272b7b`.
- Implementation criteria above are supported by current source, final existing HTTP-seam suite **90 passed / 0 failed**, and actual native smoke described below. Checkboxes remain available for the parent integration acceptance owner; this ticket is not closed from a worktree-only result.
- Final command: source the private isolated `test.env`, then `bun test --timeout 120000 test/http/ecm-scalar-save-submit.test.ts` from `apps/server`. Covers legacy consumers, new object/array receipts, no-year and year-only saves, same identity, protected/foreign/concurrent destinations, unknown and received-but-uncommitted overwrite, alias HOLD propagation, exact 0/10,000,000-byte files, canonical commit/cleanup/recovery and existing table/Correction/deletion regressions.
- Final affected Results UI suite: `bun run test:ui test/ui/admin-results-page.test.tsx` from `apps/web` passed **27 tests**, including Admin/Viewer follow-up rendering for nullable-year template mode and preserved legacy category/year display.
- `bun run check-types` passed for all five configured tasks after final shared safety changes. Scoped Ultracite formatting/lint passed for the eleven changed source/test files. Repository build passed before the final shared lock-order/HOLD-notice additions; parent rebuilds final merged generated outputs.
- Actual application + ONLYOFFICE9.4 + localhost provider smoke: select A → Save Draft → browser reload/reopen → unchanged Save → select B → Submit. No `fiscal_year` Field; original bytes and exact two-field multipart observed. Saved B reused the original POST token/link, receipt page rendered its canonical URL, provider saw **2 POST / 0 DELETE / 1 resource**. No SDK mocks or direct attachment-operation test payloads substituted for the native flow. Detailed sanitized evidence: `/tmp/folio-storage-templates-03-native-evidence.md`.
- Durable schema: `EcmAttachmentIdentity` owns unique account/token and account/link; each `EcmAttachmentVersion` remains its original attempt with paired receipt, nullable year, frozen mapping, `identityId` and pre-dispatch `overwriteIdentityIds`. Shared transaction fence precedes row locks in canonical completion/deletion. Downstream04/05/06/07 contract: `/tmp/folio-storage-templates-03-contract.md`.
- System-map prose/diagram and domain behavior updated. No application originals in RustFS/DB, no retry/search fallback, no live provider call or Production migration. Only isolated DB migrations deployed; parent-owned runtime/data preserved. Own native services/gateway/browser and throwaway runtime sources removed after acceptance.
- Ticket04 remains required before feature delivery. Parent's latest public `GET /api/beeecm/public/file?token=...` probe established exact original bytes for the single authorized PDF sample, not the all-type matrix. Until04 implements trusted bounded retrieval, changed `docs_number` without a replacement retains explicit retrieval failure. Unknown external overwrite/DELETE settlement remains HOLD without a proven settlement contract; no fake rollback or manual unlock.
