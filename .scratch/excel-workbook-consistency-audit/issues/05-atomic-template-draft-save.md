# 05 — Commit XLSX Template Draft พร้อมกันทั้ง bindings และ workbook

Status: resolved  
Type: task  
Priority: P1  
Blocked by: 01, 02  
Evidence: [A1–A3](../map.md#1-ต้นเหตุและหลักฐาน)

## ขอบเขต

เปลี่ยน Admin XLSX mutation ให้ใช้สัญญาจาก 01 ทุก caller: create/edit scalar, merged scalar, date/dropdown/validation, picture, table/column, PDMS source, attach/place/convert/change category/promote, delete, repair/rebind และ native tracking. ตรวจ candidate workbook และผูกกับ draft/base revision; เปลี่ยนชุด bindings, artifact pointer/hash, revision และ Operation ใน DB transaction เดียว. คง fail-closed scope/recovery และข้อจำกัด Publish เดิม. ตัดเส้นทางที่เขียน canonical metadata ล่วงหน้าออกเมื่อ migrate ครบ. ไม่แก้ DOCX หรือประวัติเดิม

## เกณฑ์รับงาน

- [x] Red-before: ordinary `A1:A2` และ scalar เปิดใหม่หลัง Apply ก่อน Save; attachment auto-save fail และ lost ACK. Green-after: อ่านได้คู่เก่าหรือคู่ใหม่ครบเท่านั้น; ไม่เกิด metadata ใหม่กับ workbook เก่า
- [x] Inject failure ก่อน/หลัง write artifact, callback, DB transaction และ ACK รวม delayed/replayed callback, stale tab/lease และสอง editor openings. ไม่มี success ก่อน commit, ไม่มี replay, ไม่มี rollback ทับ revision ใหม่; old snapshot ยังอ่านได้และ object กำพร้ามี cleanup intent
- [x] Native browser: ทั้งลำดับสร้างปุ่ม/ตาราง, บันทึกใหม่, เปิดใหม่, ลบ, แก้ geometry, Publish และ Duplicate จาก snapshot ที่บันทึกแล้ว. กรณี intentionally incomplete ยัง Save ได้ แต่ Publish ถูกปฏิเสธตาม contract; broken placement ไม่ถูกบันทึกเหมือน binding ที่ valid
- [x] ข้อความแยก “ค่ารอ Save” กับ “บันทึกแล้ว”; ปิด/รีเฟรช/reconnect ไม่อ้างว่าจะกู้ editor-only work ที่ยังไม่ persisted. อัปเดต system map ตาม workflow maintenance

## Comments

- ไม่ใช้ auto-save เพิ่มเป็นวิธีแก้หลัก; auto-save ที่มีอยู่ต้องผ่าน commit point เดียวกัน
- Actual Chromium + ONLYOFFICE 9.4 baseline: เลือก `A1:A2`, Apply ตาราง, reload ก่อน Save แล้วกดเพิ่มช่องแนบ ได้ “ไม่พบตำแหน่งตาราง กรุณาผูกตำแหน่งตารางใหม่ก่อนบันทึก”. Positive controls: ตาราง `A1:A2` ที่ Save แล้วเปิดซ้ำและสร้าง attachment ได้ครบ physical rows `[0,1]`; ปุ่ม `C1` ก่อนตั้งตาราง `A1:C3` ขณะ auto-save ยังไม่เสร็จอ่าน projected rows ได้ `[]` แต่หลังยืนยันว่า Save สำเร็จอ่านได้ `[0,1,2]`. วัดจาก XLSX ฉบับ canonical ใน sandbox; ไม่ใช่ผลหลังแก้ 05
- Native Chromium on `3eb20b3`: ordinary table and scalar Apply/reopen kept the old canonical pair; allowed Save advanced workbook hash and revision together. Table-first generated `[0,1]`, button-first `[0,1,2]`; reopen and delete saved zero attachment rows. Publish consumed the new `measurement` binding without an earlier Save; Duplicate retained it.
- Auto-save fault before admission returned 503 and kept revision 0/hash/Rules unchanged. On the recovery follow-up, a genuine 202 reply was intercepted after server admission and replaced by 503 in the browser. The same-tab reload retained **ตรวจผลรอบเดิม**; Publish stayed disabled until recovery and the result was exactly one completed Operation, revision 1.
- HTTP red/green confirmed that a captured file with the right names but missing list/date validation now gets the Rules' validations in the committed XLSX. Direct and callback failure handling preserves actionable authoring errors.
- Native long-choice dropdown and date fields remained local until Save; the committed XLSX contains both validations and the entire option. Two simultaneous native openings prepared different scalar Rules at revision 0. After one committed, the stale opening received a rejection and the first workbook hash, Rules and revision 1 were unchanged.
- HTTP PostgreSQL fixture rejects the revision update after a valid capture. Both the old Rules from GET and the SHA-256 from saved XLSX download remain unchanged; removing only the synthetic constraint allows the next explicit Save to commit the valid pair.
- Native lost Publish acknowledgement on `910f20eb4a`: a genuine HTTP 202 was replaced with 503 only in Chromium. Reload to the immutable published page (no editable plugin), press **ตรวจผลเผยแพร่รอบเดิม**, observe “ยืนยันว่าเผยแพร่รอบเดิมสำเร็จแล้ว”. PostgreSQL showed exactly one Publish Operation, one completion, and one Published Template. Reauthentication and different-Admin rejection have separate HTTP coverage.
- Existing ordinary→attachment conversion retains the approved proof-first guard. Removing its first checkpoint reproduced `attachment_mapping_unproved` natively and left revision 1 intact. Restoring the proved marker checkpoint and the final Rules+workbook commit produced native revisions `1 → 2 → 3` with one stable binding; creating a new attachment slot needs only one checkpoint.
- Inserting a full row through the native ribbon shifted an existing button out of its mapped slot. Save rejected the mismatch with the saved hash/revision unchanged. Undo in the same native opening restored the mapping; adding a scalar and saving then advanced revision 3→4 without reopening.
- Final reviewed runtime `20f4486902` reproduced a native `422 attachment_metadata_required` before admission without holding the editor or changing the saved pair. The same opening kept the unsaved `keep_local` field and saved it in revision 2 without reload. The old runtime held the checkpoint incorrectly. Unproved terminal Save results retain the original checkpoint and read-only guard; no retry is inferred from a malformed acknowledgement.
