# 03: Scalar Save Draft/Submit แบบ template mode พร้อม identity และ failure safety

**What to build:** User แนบไฟล์ช่องเดี่ยวใน Form โหมดใหม่ บันทึก Draft เปิดกลับมาแทน A ด้วย B แล้ว Submit ได้ด้วย request/filename ใหม่ รับ receipt จริงและใช้ URL ของ B โดยไม่ลบ shared identity ไม่ทำลายประวัติ/ไฟล์คนอื่น และรายงาน unknown overwrite ตามจริง

**Blocked by:** 02 — ตั้ง Storage Template ใน popup และตรึงสัญญาเมื่อเผยแพร่ Form ใหม่.

**Status:** ready-for-agent

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
