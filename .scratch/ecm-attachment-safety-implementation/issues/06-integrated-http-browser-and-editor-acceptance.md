# 06: ตรวจรับชุดรวมผ่าน HTTP และ actual browser/editor

**What to build:** ตรวจว่าพฤติกรรมทั้งชุดทำงานร่วมกันบน delivery integration source เดียว ตั้งแต่เลือกไฟล์ บันทึก เปิดต่อ ส่งรอบใหม่ แก้ Correction และดูประวัติ พร้อมเอกสารที่ตรงกับผลจริง แยก isolated acceptance ออกจาก provider evidence และ remaining HOLD

**Blocked by:** 01 — ส่งชื่อเดิมได้ พร้อม receipt และคำเตือนถูกประเภท; 03 — กัน native table edits ที่ทำไฟล์ผิดแถว; 05 — Loading ระหว่าง Save และทางออกของ unknown/Correction.

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US82–84, US88, US90 และ integrated regression coverage ของ US01–81; H01–H10 และ U01–U06

**Execution gate:** ต้องให้ผู้ใช้ตรวจตั๋วและสั่งเริ่ม implementation/isolated acceptance ก่อนรัน ไม่มี real DCM/live-data/DELETE/push/deploy authorization จากตั๋วนี้

## Acceptance criteria

- [ ] ตรวจ actual delivery integration source ที่รวม 01–05 แล้ว บันทึก revision และ Working Tree differences/hash ที่เกี่ยวข้อง ไม่ใช้ผล child worktree หรือผลก่อน source เปลี่ยนเป็น acceptance ของชุดรวม
- [ ] แต่ละ prerequisite ticket มี targeted end-to-end verification ของตนแล้ว ตั๋วนี้ตรวจ cross-feature interaction ไม่ใช้เป็นข้ออ้างส่งตั๋วก่อนหน้าที่มีแต่ scaffold หรือยังไม่รัน changed path
- [ ] รัน named H01–H10 ผ่าน existing actual-app HTTP seam กับ isolated DB/store และ controlled provider ตรวจ canonical JSON/XLSX/paired receipt/reference/snapshot atomicity/physical targets/no-extra-dispatch ตาม spec ไม่สร้าง seam/mock service layer ใหม่
- [ ] ยืนยัน first Submit, default next round และ same-number Submit รอบถัดไปจริง ครบ scalar/table/Correction consumers ไม่เปลี่ยนเลข/แม่แบบ บังคับ Save Draft ก่อน หรือสกัด auto-start route เพื่ออ้างว่าปัญหาผ่าน
- [ ] Actual browser/ONLYOFFICE journey U01–U06 พิสูจน์ minimum-row/buttons/native guard/navigation/loading/keyboard/focus/pending/unknown/cleanup/newer-pending และ selected historical revision โดยใช้ routes/permissions/Correction eligibility จริง
- [ ] Matrix ครอบคลุม User Draft/Admin Correction, ordinary XLSX/old PoC/durable legacy/template ตามแต่ละ contract และ saved/pending replacement/removal/invalid/zero-byte/empty gaps/หลาย attachment columns ที่เกี่ยวข้อง ไม่เพิ่ม row commands ให้ Correction
- [ ] เก็บ actual browser/editor version, command/actions, source/environment/date, before-after workbook/mapping/pending และ sanitized screenshots/transport ที่จำเป็น ไม่ใช้ Builder-only, mocked router/bridge, HTTP 200 หรือจำนวน tests เป็น UI/native proof
- [ ] Local receipt/history/mapping assertions คง exact-byte protection ตามแผนเดิม Runtime integrity/security checks ไม่ถูกถอด และไม่เพิ่ม byte-comparison/aggregate-capacity workload กลับเข้า provider type/size plan
- [ ] Regression tests ตรวจ external behavior/boundaries/transitions/semantic errors ไม่พิน exact wording/source text/wiring/mock echoes ลบ obsolete incidental assertions แทนการ re-pin และไม่เปลี่ยน provider double เพื่อซ่อน conflict
- [ ] ตรวจ affected callsites/types/tests/fixtures และ docs ของแต่ละ implementation slice ครบ ไม่มี counter fallback/compatibility shim/temporary instrumentation/throwaway scaffold ค้างที่ไม่จำเป็น
- [ ] Domain/canonical behavior และ system map ตรง latest implemented policy โดยเก็บ historical evidence แยก Run root scripts ที่เกี่ยวข้องกับ code change รวม workflow build/check และเปิด generated system map ตรวจภาพ/คำอธิบายจริงตาม repo convention
- [ ] รายงาน local result, unverified browser/editor boundary, provider evidence, old-data authorization และ human review แยกกัน หาก runtime เข้าไม่ถึงให้ระบุ exact missing prerequisite และ scenario ที่ยังไม่ผ่าน ไม่ลด scope หรืออ้าง test double แทน
- [ ] ส่ง acceptance report ที่ผูก stories/scenarios/revision กับ observed evidence และ remaining HOLD ให้ pyw1tt ตรวจ ไม่ประกาศ release/Production PASS หรืออนุญาต push/deployจาก local checks

## Scope boundaries

Blocking edges ระบุเฉพาะ prerequisites โดยตรง: 03 รวม dependency 02 และ 05 รวม dependency 04 อยู่แล้ว ไม่เพิ่ม 02/04 เป็น duplicate edges

Provider evidence tickets 07–09 และ old-data ticket 10 ไม่บล็อกการตรวจ implementation ในระบบแยก แต่หลักฐานที่ยังขาดต้องอยู่ใน final HOLD register ไม่ปิด release gates ด้วยผลจำลอง

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown และ edges 01/03/05 แล้ว เผยแพร่เพื่อให้ตรวจตั๋วก่อน implementation ไม่ใช่ผล integrated acceptance และไม่ได้แก้ parent spec หรือ Wayfinder tickets
