# 06: Final Correction ใช้ frozen Storage Template และปกป้องประวัติ

**What to build:** Admin แก้ attachments ของ Submission ผ่าน final Save Correction เดิม ใช้ storage contract ที่ตรึงไว้ รองรับ scalar/table และเปลี่ยน docs_number ด้วย original bytes จาก DCM โดยไม่ย้ายปลายทางตาม catalog หรือเขียนทับไฟล์ที่ประวัติยังปกป้องอยู่

**Blocked by:** 04 — เปลี่ยน docs_number โดย reuse original bytes จาก DCM แห่งเดียว; 05 — Table attachments แบบ Storage Template รักษา physical rows และ shared-identity safety.

**Status:** ready-for-agent

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 95–99; legacy/new history protection และ safe identity เป็นข้อกำหนดร่วม

## Acceptance criteria

- [ ] Correction ใช้ storage mode/category/template snapshot ของ Submission ที่แก้ ไม่อ่าน master ปัจจุบันมา redirect routing; legacy Correction คง legacy contract
- [ ] ตรวจ Admin authorization, reason, currently submitted/latest eligibility, base revision, capability/lease และ requiredness ตามเดิมก่อน external writes ไม่ใช้ flow นี้แก้ Draft ของ User โดยตรง
- [ ] Final explicit Save Correction เท่านั้นที่ upload selected replacements หรือ original bytes เมื่อ metadata เปลี่ยน; internal project/workspace saves ไม่ upload/delete
- [ ] Scalar และ table physical-row slots ใช้ shared trusted-original and identity paths ที่ผ่าน 04/05 ไม่สร้าง adapter/cache หรือ cleanup policy แยกเฉพาะ Correction
- [ ] Before dispatch ป้องกัน destination ที่ Submission/older Correction/other owner/workspace/eligible Operation ยัง reference อยู่; same name/token overwrite ที่ทำลาย protected bytes ต้องหยุดก่อน write ไม่อ้าง frozen JSON ว่าปกป้องเนื้อหา URL ได้
- [ ] New valid revision เก็บ document/JSON/receipt/reference ของ captured snapshot ครบ ไม่แก้ URL/token หรือ evidence ของ older revisions
- [ ] Replacing/removing current file ไม่ทำให้ older revision สูญเสียไฟล์ และไม่มี DELETE shared canonical/protected identity หรือ cleanup จาก token inequality เพียงอย่างเดียว
- [ ] Catalog rename/move/delete ระหว่างเปิด workspace ไม่เปลี่ยน published choice และไม่ทำให้ live lookup เปลี่ยนปลายทางย้อนหลัง
- [ ] Pending Files/removals ข้าม internal workspace document transition ได้เฉพาะ verified scope/physical-row mapping; ambiguity คง editor/pending state และหยุดก่อน remount ทำไฟล์หาย
- [ ] Final completion ยอมรับเฉพาะ captured snapshot; newer unsaved File/removal ไม่ถูกล้างหรือแสดงว่าบันทึกแล้ว ไม่ส่งต่อเข้า operation ถัดไปอัตโนมัติ
- [ ] In-place external overwrite/unknown commit ใช้ durable original-operation evidence และ hold ที่ถูกต้อง ไม่สัญญา external rollback หรือ resend หลัง timeout
- [ ] Existing HTTP seam พิสูจน์ Correction reason/eligibility/requiredness, frozen routing หลัง catalog changes, original-byte number change, physical slots, protected-reference rejection ก่อน upload และ selected historical revision ที่ยังถูกต้อง
- [ ] Smoke real ONLYOFFICE Correction ของทั้ง legacy/new Form ตรวจ workspace/internal-save no-write, final save, old Submission/Correction read และ actual selected-revision exports
- [ ] หาก filename grammar เดิมทำให้แก้ slot โดยไม่ overwrite protected history ไม่ได้ ให้รายงาน protected conflict อย่างชัดเจน ไม่เพิ่ม suffix หรือปลด guard เอง; feature acceptance ต้องแยก allowed success path จาก safe rejection
- [ ] อัปเดต affected Correction callers/fixtures และ workflow/domain/system map ใน change เดียวกัน ไม่เปลี่ยนสิทธิ์ Viewer/User หรือ main-document viewer

## Notes

Snapshot ที่ immutable ใน Folio ไม่ทำให้ mutable DCM URL เก็บ bytes เก่าได้ การป้องกันต้องเกิดก่อน external write ไม่ใช่แก้ references หลัง upload สำเร็จ หาก external proof ที่จำเป็นยังขาดต้อง HOLD ไม่ปิดตั๋วด้วยการสมมติ provider isolation

## Comments
