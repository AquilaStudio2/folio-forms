# 01: ส่งชื่อเดิมได้ พร้อม receipt และคำเตือนถูกประเภท

**What to build:** User บันทึกหรือส่ง Response ทุกรอบด้วยเลขเอกสารและ Storage Template เดิมได้ แต่ละ scalar/table slot และ Correction ใช้ receipt ของไฟล์ที่บันทึกจริง เมื่อ actual new upload คืน receipt ที่ชนประวัติหรือ Draft เดิม ต้องหยุดพร้อมเหตุผลที่จำแนกได้โดยไม่สูญเสีย saved answer หรือ pending File

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US01–40, US88; H01–H06, H09–H10 และส่วน receipt warnings ของ U05

**Execution gate:** เผยแพร่ตั๋วเพื่อให้ผู้ใช้ตรวจเนื้อหาเท่านั้น ต้องมีคำสั่งเริ่ม implementation หลังตรวจตั๋วก่อนพัฒนา ไม่ authorize real DCM, live-data changes, DELETE, push หรือ deploy

## Acceptance criteria

- [ ] First Submit แล้วเริ่มรอบใหม่ตาม flow ปกติ ใช้เลขเอกสาร/แม่แบบ/extension เดิมส่งรอบที่สองและรอบถัดไปสำเร็จผ่าน actual app HTTP ไม่เปลี่ยนเลข ไม่บังคับ Save Draft ก่อน และไม่สกัด automatic next-round flow เพื่ออ้างว่าผ่าน
- [ ] Actual template uploads ใช้ชื่อฐานซ้ำได้ทั้ง scalar, หลาย physical rows/columns, ต่าง Responses และ final Save Correction ไม่มี generated counter/timestamp/UUID/row suffix หรือ filename reservation คง original extension/casing, extensionless, literal suffix/dots/whitespace ที่ valid และ unsafe-input rejection ตาม naming decision ล่าสุด
- [ ] Shared prepare, before-send, receipt, reference และ deletion admission แยก filename-only coincidence จาก actual resource/scope conflict ทุก affected consumer ใช้ contract เดียวกัน ไม่ patch เฉพาะ second Submit และไม่ถอด actor/owner/role/lease/revision/opening/slot/unknown/reference fences
- [ ] แต่ละ actual upload เก็บ original attempt, destination และ paired receipt ตาม ledger เดิม ทุก current Draft/Submission/Correction snapshot มี canonical metadata ของไฟล์ที่อ้างจริงตาม schema เดิม รวม trusted table row_index ไม่ adopt client receipt หรือเลือก search result แรก/ล่าสุดจากชื่อ
- [ ] Actual new template upload ที่คืน paired receipt ของ surviving Submission/Correction หยุด canonical commit ด้วย semantic history-conflict reason ส่วน paired receipt ของ own unprotected current Draft หยุดด้วย semantic Draft-conflict reason ทั้งสองมีเหตุผลจำแนกผ่าน HTTP/Operation/host/plugin ตามสิทธิ์ ไม่ใช้ Q3/Q4 เป็นศัพท์ผู้ใช้
- [ ] Resource ที่มีทั้ง Draft และ history ใช้ history precedence; one-sided/partial/multiple/held aliases และ protected conflicts อื่นคง fail-closed ตามหลักฐาน ไม่เดาประเภทจากชื่อหรือ match ข้างเดียว และไม่ผ่อน same-batch alias safeguards
- [ ] Warning ระบุ Field/Tag/physical row และ references ที่พิสูจน์ได้ภายใต้สิทธิ์ บอกว่ารอบนี้ยังไม่บันทึก ไม่เผย raw tokens/service secrets/ประวัติของผู้อื่น และไม่อ้างว่า cancel หรือ DB rollback คืน remote bytes ได้
- [ ] Conflict/failure ไม่ partial commit document/JSON/references/Operation ไม่แก้ history ไม่ล้าง pending ที่ยังอยู่ในหน้า ไม่ DELETE shared resource ไม่ resend/เปลี่ยนชื่อ/สั่ง refresh เพื่อหนี conflict Original receipt/conflict evidence ยังคงตรวจย้อนกลับได้
- [ ] Unchanged reuse ที่ไม่มี POST ไม่ถูกบล็อกด้วย actual-new-upload policy และไม่บังคับ token ใหม่ Number change อ่าน trusted original พร้อม existing size/hash/origin checks; replacement ใช้ File ใหม่; year-only template edit ไม่ upload เพิ่ม Legacy UUID/Published PoC/frozen contracts และ old filenames/receipts ไม่เปลี่ยน
- [ ] Existing multipart และ receipt adapter contract คงเดิม: template mode ส่ง original documentFile กับ template ข้อความ "1" โดยไม่เพิ่ม legacy metadata parts รับ valid object/one-item-array receipt และปฏิเสธ malformed receipt ตามเดิม ไม่สร้าง parser/retrieval layer ซ้ำ
- [ ] Safe diagnostics เก็บ upstream HTTP status/details ที่จำเป็นผ่านช่องทางเดิมก่อนถูก generic adapter error กลืน ไม่ส่ง raw provider body/credentials/tokens ไป browser ไม่เพิ่ม logging subsystem หรือ automatic POST/DELETE retry และไม่เดาสาเหตุ HTTP 500 เดิม
- [ ] Lost Folio acknowledgement, unknown upload, late canceled receipt, restart และ uncertain DELETE คง original-checkpoint/no-resend/reference fencing behavior B ที่ commit แล้วแต่ cleanup A ค้างยังใช้ได้พร้อม persistent warning ไม่กลายเป็น failed save
- [ ] ใช้ existing isolated HTTP seam กับ create-new provider model สำหรับ happy path และ explicit history/Draft/partial-alias/unknown models สำหรับ guards ตรวจ canonical JSON/XLSX/receipt และ exact bytes ของ survivors ตาม local history/mapping plan ไม่ใช้ filename-keyed overwrite เป็น universal DCM truth
- [ ] ทำ targeted browser/plugin smoke ของ warnings และ pending preservation บน changed path ของตั๋วนี้ ไม่รอให้ตั๋ว 06 เป็น verification แรก ปรับ affected consumer tests/fixtures/types และลบ obsolete suffix-only/incidental-wording assertions โดยไม่ลด legacy/security regressions
- [ ] อัปเดต affected domain/canonical behavior และ system map ใน change เดียวกัน ระบุ source revision และผลที่รันจริง โดยไม่ relabel historical BATCH/provider samples เป็น acceptance ใหม่

## Scope boundaries

Reuse existing planner, attempt/identity/reference ledger, Operation/error surfaces และ canonical transaction ไม่สร้าง allocator, answer JSON fields, schema หรือ compatibility mode ใหม่ งานนี้แก้ behavior ตาม approved naming/guard policy ไม่ใช่เปลี่ยน public-link/DCM-only/requiredness/size policy

ผล HTTP และ byte assertions ของตั๋วนี้เป็น isolated implementation proof ไม่ใช่ provider acceptance และไม่เพิ่ม byte-comparison requirement กลับเข้า provider type/size plan การแก้ navigation/loading เต็ม matrix อยู่ในตั๋ว 04–05 แต่ตั๋วนี้ต้องไม่ทำ pending safeguards เดิมถดถอย

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown ชุด 10 ตั๋วและ blocking edges ผ่าน /to-tickets แล้ว อนุมัติเฉพาะการเผยแพร่ตั๋วและหยุดให้ตรวจเนื้อหาก่อนเริ่ม implementation ไม่มีผลทดสอบหรือ provider approval ใหม่จากการสร้างตั๋ว
