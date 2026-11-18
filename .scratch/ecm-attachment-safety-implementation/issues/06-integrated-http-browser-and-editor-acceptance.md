# 06: ตรวจรับชุดรวมผ่าน HTTP และ actual browser/editor

**What to build:** ตรวจว่าพฤติกรรมทั้งชุดทำงานร่วมกันบน delivery integration source เดียว ตั้งแต่เลือกไฟล์ บันทึก เปิดต่อ ส่งรอบใหม่ แก้ Correction และดูประวัติ พร้อมเอกสารที่ตรงกับผลจริง แยก isolated acceptance ออกจาก provider evidence และ remaining HOLD

**Blocked by:** 01 — ส่งชื่อเดิมได้ พร้อม receipt และคำเตือนถูกประเภท; 03 — กัน native table edits ที่ทำไฟล์ผิดแถว; 05 — Loading ระหว่าง Save และทางออกของ unknown/Correction.

**Status:** needs-info

**Spec coverage:** ECM Attachment Safety implementation spec — US82–84, US88, US90 และ integrated regression coverage ของ US01–81; H01–H10 และ U01–U06

**Execution gate:** ต้องให้ผู้ใช้ตรวจตั๋วและสั่งเริ่ม implementation/isolated acceptance ก่อนรัน ไม่มี real DCM/live-data/DELETE/push/deploy authorization จากตั๋วนี้

## Acceptance criteria

- [x] ตรวจ actual delivery integration source ที่รวม 01–05 แล้ว บันทึก revision และ Working Tree differences/hash ที่เกี่ยวข้อง ไม่ใช้ผล child worktree หรือผลก่อน source เปลี่ยนเป็น acceptance ของชุดรวม
- [x] แต่ละ prerequisite ticket มี targeted end-to-end verification ของตนแล้ว ตั๋วนี้ตรวจ cross-feature interaction ไม่ใช้เป็นข้ออ้างส่งตั๋วก่อนหน้าที่มีแต่ scaffold หรือยังไม่รัน changed path
- [x] รัน named H01–H10 ผ่าน existing actual-app HTTP seam กับ isolated DB/store และ controlled provider ตรวจ canonical JSON/XLSX/paired receipt/reference/snapshot atomicity/physical targets/no-extra-dispatch ตาม spec ไม่สร้าง seam/mock service layer ใหม่
- [x] ยืนยัน first Submit, default next round และ same-number Submit รอบถัดไปจริง ครบ scalar/table/Correction consumers ไม่เปลี่ยนเลข/แม่แบบ บังคับ Save Draft ก่อน หรือสกัด auto-start route เพื่ออ้างว่าปัญหาผ่าน
- [ ] Actual browser/ONLYOFFICE journey U01–U06 พิสูจน์ minimum-row/buttons/native guard/navigation/loading/keyboard/focus/pending/unknown/cleanup/newer-pending และ selected historical revision โดยใช้ routes/permissions/Correction eligibility จริง
- [ ] Matrix ครอบคลุม User Draft/Admin Correction, ordinary XLSX/old PoC/durable legacy/template ตามแต่ละ contract และ saved/pending replacement/removal/invalid/zero-byte/empty gaps/หลาย attachment columns ที่เกี่ยวข้อง ไม่เพิ่ม row commands ให้ Correction
- [x] เก็บ actual browser/editor version, command/actions, source/environment/date, before-after workbook/mapping/pending และ sanitized screenshots/transport ที่จำเป็น ไม่ใช้ Builder-only, mocked router/bridge, HTTP 200 หรือจำนวน tests เป็น UI/native proof
- [x] Local receipt/history/mapping assertions คง exact-byte protection ตามแผนเดิม Runtime integrity/security checks ไม่ถูกถอด และไม่เพิ่ม byte-comparison/aggregate-capacity workload กลับเข้า provider type/size plan
- [x] Regression tests ตรวจ external behavior/boundaries/transitions/semantic errors ไม่พิน exact wording/source text/wiring/mock echoes ลบ obsolete incidental assertions แทนการ re-pin และไม่เปลี่ยน provider double เพื่อซ่อน conflict
- [x] ตรวจ affected callsites/types/tests/fixtures และ docs ของแต่ละ implementation slice ครบ ไม่มี counter fallback/compatibility shim/temporary instrumentation/throwaway scaffold ค้างที่ไม่จำเป็น
- [x] Domain/canonical behavior และ system map ตรง latest implemented policy โดยเก็บ historical evidence แยก Run root scripts ที่เกี่ยวข้องกับ code change รวม workflow build/check และเปิด generated system map ตรวจภาพ/คำอธิบายจริงตาม repo convention
- [x] รายงาน local result, unverified browser/editor boundary, provider evidence, old-data authorization และ human review แยกกัน หาก runtime เข้าไม่ถึงให้ระบุ exact missing prerequisite และ scenario ที่ยังไม่ผ่าน ไม่ลด scope หรืออ้าง test double แทน
- [x] ส่ง acceptance report ที่ผูก stories/scenarios/revision กับ observed evidence และ remaining HOLD ให้ pyw1tt ตรวจ ไม่ประกาศ release/Production PASS หรืออนุญาต push/deployจาก local checks

## Scope boundaries

Blocking edges ระบุเฉพาะ prerequisites โดยตรง: 03 รวม dependency 02 และ 05 รวม dependency 04 อยู่แล้ว ไม่เพิ่ม 02/04 เป็น duplicate edges

Provider evidence tickets 07–09 และ old-data ticket 10 ไม่บล็อกการตรวจ implementation ในระบบแยก แต่หลักฐานที่ยังขาดต้องอยู่ใน final HOLD register ไม่ปิด release gates ด้วยผลจำลอง

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown และ edges 01/03/05 แล้ว เผยแพร่เพื่อให้ตรวจตั๋วก่อน implementation ไม่ใช่ผล integrated acceptance และไม่ได้แก้ parent spec หรือ Wayfinder tickets

### 2026-11-19 — Bounded integrated native/HTTP evidence handoff

- ส่ง [acceptance report](../acceptance-report.md) พร้อม sanitized canonical JSON/XLSX hash/reference/original-byte evidence และ screenshots ใต้ `../acceptance/06-native/` ผูกครบ US01–90, H01–H10 และ U01–U06 โดยแยก observed native, parent-supplied HTTP suites, provider/old-data/human HOLD
- Actual native พิสูจน์สาม normal same-number rounds พร้อม scalar/table/zero-byte/physical gaps; minimum-row controls ครบ ordinary/old PoC/legacy/template; picker savedA/pendingB/candidateC Cancel/X; active loading/inert/keyboard/focus/duplicate/navigation; persistent uncertain old-cleanup warning และ no retry; genuinely eligible Admin Correction สอง revisions และ selected older history
- พิสูจน์ newer candidate ผ่าน actual preopened FileChooser ที่คืน File หลัง captured B POST จริง ไม่ inject bridge/router: Correction commit B แต่คง C/editor, retired Save ถูกบล็อก, Escape/explicit discard ทำงาน และ Correction ใหม่ต้องเลือก File อีกครั้ง
- พบ native false-dirty ก่อน user input และแจ้ง parent พร้อม passive ready→true→false evidence; parent แก้ที่ `6563350` จากนั้น child ตรวจ fresh clean open/Exit no modal, actual ordinary edit/Stay/discard และ actual normal browser Submit/default auto-next untouched clean Exit no modal บน source ใหม่แล้ว
- Source เดิมของ major native journeys คือ `1affbc0` + formatting Working Tree bytes ที่ภายหลัง commit `8819763`; ไม่ relabel ทั้ง matrix ว่ารันใหม่ครบที่656 Final canonical read/root source revision/hash เป็น `65633504510d7c862a06522895671414a4b220f2`; child merge integration แล้ว ไม่มี application/shared-doc edits จาก06
- Actual invalid-size picker selection10,000,001bytes ถูก reject โดยไม่ dispatch และคง savedA; native confirmed-removal locator ยังไม่ได้ stage งาน ไม่ถือ locator failure ว่า product defect Final synthetic provider14POST/1DELETE, mode normal; ไม่มี child-created unknown upload checkpoint
- คง `needs-info`/ไม่ resolve เพราะ remaining native cases ยัง reachable และ parent รับทำต่อ: actual unknown/checkpoint/reentry/saved-copy; Q3/Q4 host/plugin warning distinction; confirmed removal/invalid/pending combinations; native structural/drag/keyboard/cross-sheet/hidden-zero-geometry targets; route/back/refresh/close/File-loss matrix และ newer confirmed-removal generation หลักฐาน HTTP ไม่แทน native gaps เหล่านี้
- Private continuation: `local://ecm-safety-06-continuation.md`; live owned tab `safety-native-06` อยู่ Admin legacy Response `0f428025-d045-45fa-a4d8-f7c105452b14`, independent UNKNOWN06/year2567 savedA4bytes และ picker baseline เปิดอยู่ ไม่มี removal staged ชื่อ UNKNOWN06 ไม่ใช่ผล unknown Request ไม่ทิ้งงานหรือ cleanup runtime ของ parent
- ไม่มี real DCM/PDMS/real DELETE/push/deploy; Hindsight bank discovery skipped เนื่องจาก mounted selectors ไม่รองรับ bank/types/budget ไม่มี bank writes Child ไม่รัน test suites/build/lint/formatters; parent-reported resultsมี provenance แยกใน report ไม่กล่าว all native passed หรือ user-approved scope reduction

### Parent final integrated disposition — 2026-11-19

- [Final native supplement](../acceptance/06-native-final/report.md) adds N09–N18 without relabeling initial N01–N08 source. Includes scoped typed evidence, sanitized native screenshots and separate Standards/Spec review resolutions.
- Actual lost acknowledgement/original lookup/reentry, own-Draft/history warnings, saved-receipt removal/invalid/zero/minimum-row, navigation/File loss, ordinary paste, native zero-height/zero-width and visible adjacent-slot coupling are now observed. The former generic “not executed” entries are superseded only for these named cases.
- Source readiness01/02/04/05 is ready-for-human.03/06 remain needs-info: no certified hidden-target invocation/export, successful forbidden structural mutation or full queued-confirmed-removal/role-contract matrix. Cold hidden-column initialization returned a real error; not classified safely rejected. User acceptance remains pending, not silently waived.
- Tests:246 unique existing actual-app HTTP cases/10,957 assertions; spreadsheet118/324; Builder14/264; final plugin343; configured web282 plus12 lifecycle cases; final root types5/5,4 cached. Parent final report records root lint/build/workflow/visual and owned-resource cleanup separately after execution.
- Standards hard P2 and the same Spec P2 are fixed627d789 with actual before/after native evidence. No open code finding from those reviews; evidence gates are still open. Existing P2034 deletion interleaving, native modal clipping and earliest clipboard-state uncertainty remain explicit risks.
- Provider07/08, settlement09, old-data10, human review, real-data/DCM/DELETE and deployment boundaries remain unchanged. No9 Wayfinder ticket was edited or replaced.

### Final root verification — 2026-11-19

- Root fix/check40 owned integrated source/test files passed after removing a needless async test callback; configured web suite passed again282 UI plus12 lifecycle. Final types5/5, build3/3 and workflow build/check22 diagrams/312 sources passed. Actual offline guide loaded22 images and affected zoom/source-link/recovery surfaces were checked.
- Removed13 clean merged task worktrees/branches; owned gateway/services/listeners and disposable bucket1503 objects/two databases were removed and absence checked. Shared services and delivery/original branches remain. Synthetic teardown is not provider DELETE/finality evidence.
- Final native supplement publishes13 audited PNGs and valid scoped evidence links. Partial native cells and07–10/human HOLD remain; no blanket acceptance box is checked for those boundaries.

- Final cleanup verified private fixture/credential/provider/probe directory absent and removed six exact owned temporary screenshot originals after preserving audited evidence. No managed safety tab lease remains. Shared browser/native cache erasure and original pre-test clipboard restoration are not claimed.
