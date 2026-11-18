# 03: กัน native table edits ที่ทำไฟล์ผิดแถว

**What to build:** User และ Admin ใช้ตารางตาม support matrix ที่อนุมัติแล้วได้ ไฟล์และ pending state ยังคงผูกกับ physical row/published column ที่ถูกต้อง Native action ที่ยืนยัน mapping ไม่ได้ต้องไม่ทำให้บันทึกไฟล์ผิดแถวหรือทิ้ง File ระหว่าง remount

**Blocked by:** 02 — ทุกตาราง XLSX เหลืออย่างน้อยหนึ่งแถวและปุ่มแนบครบ.

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US52–63; H08 และ U02

**Execution gate:** ต้องให้ผู้ใช้ตรวจตั๋วและสั่งเริ่ม implementation ก่อนพัฒนา การตรวจ native runtime ใช้ระบบแยก ไม่ authorize real DCM หรือข้อมูลใช้งานจริง

## Acceptance criteria

- [ ] ใช้ minimum-row/column-button/verified-row-transition contract จากตั๋ว 02 รักษา trusted physical positions และ published column binding ไม่เพิ่ม stable row ID/per-row Tag หรือใช้ compact/visible-row index เป็น identity
- [ ] Ordinary typing/paste ตาม Field rules และ Undo/Redo ที่ mapping ยังถูกต้องใช้ได้ โดยไม่ถือเป็นการย้ายไฟล์หรือสร้าง receipt Undo ไม่ย้อน pending attachment/committed snapshot/DCM effects และไม่ฟื้น stale receipt
- [ ] Folio append/delete-selected ใน User Draft รักษา saved/pending/removal/invalid state ของ survivors ผ่าน verified transitions แถวใหม่ไม่ copy File ไม่เพิ่ม row controls ให้ Correction
- [ ] Sort, drag/move, cut-paste ทั้งแถว/คอลัมน์ และ native insert-delete ไม่ถูกยอมรับเป็นวิธีย้ายไฟล์ที่รองรับ ต้องป้องกันคำสั่งหรือหยุด save ที่ mapping ไม่ยืนยันก่อน external writes/canonical commit รวม same-row-count reorder
- [ ] Copy/paste URL/drawing/button ไม่สร้างหรือย้าย canonical attachment และไม่ adopt client token/link เป็น ownership evidence
- [ ] Filter/hidden rows/columns ใช้ file actions ได้เฉพาะเมื่อพิสูจน์ physical target จาก trusted document ได้ Hidden/zero-geometry combinations ต้องมี native proof ก่อนรับรอง ไม่เดา target จากแถวที่มองเห็น
- [ ] Merge ข้ามแถวหรือย้าย mapped table ข้าม sheet ระหว่างกรอกไม่ผ่าน mapping guard ไม่ใช้ warning อย่างเดียวแทนการป้องกันไฟล์ผิดช่อง
- [ ] หยุด command ก่อน scope change/remount เมื่อ intercept ได้ และหยุด unproven save ก่อน write/commit เสมอ คง saved snapshot กับ pending Files/removals/invalid selections ใน scope เดิม ไม่ reload/discard/rebind ไปแถวข้างเคียงเพื่อให้ผ่าน
- [ ] การเลื่อนแถวที่รองรับไม่ rename/reupload และ internal row/project/workspace save ไม่ ECM POST/DELETE คง ownership/history/unknown-operation/reference fencing เดิม
- [ ] Reconnect/หลายแท็บคง lease/revision/opening/scope guards ไม่ส่งต่อ browser Files ข้ามแท็บ Stale transition ไม่ทิ้ง pending หรือ commit snapshot ผิด
- [ ] ใช้ existing HTTP seam ตรวจ A/B rows ที่ข้อมูลและ bytes ต่างกัน หลาย attachment columns, empty gaps, saved/pending replacement/removal/invalid/zero-byte states ตรวจ saved JSON/XLSX/current references และ exact bytes ของ survivors ตาม local mapping plan
- [ ] เปิด actual supported browser/ONLYOFFICE ตรวจ native commands และ combinations ข้างต้น แยก User Draft/Admin Correction และ durable legacy/template โดยบันทึก version/command/before-after workbook/mapping/pending/no-extra-write evidence ไม่ใช้ row-count check, VM, Builder หรือ warning อย่างเดียวประกาศ safely rejected
- [ ] หาก boundary ใดป้องกันหรือตรวจไม่ได้ ให้รายงาน exact unverified boundary และ acceptance ที่ยังไม่ผ่าน ไม่ลด matrix เงียบ ๆ หรืออ้างว่าตั๋วสมบูรณ์เพียงเพราะ unsupported label ปรากฏ
- [ ] อัปเดต affected consumer tests/fixtures/docs/system map พร้อม changed behavior ไม่ขยายข้อจำกัด fill/Correction ไปห้าม Admin จัด layout ใน Template Draft โดยปริยาย

## Scope boundaries

Blocker 02 จำเป็นเพราะตั๋วนี้ตรวจ native commands ต่อกับ final trusted row/button transition contract ที่ต้องไม่ clear แถวสุดท้าย ไม่พึ่งการเปลี่ยนชื่อไฟล์ในตั๋ว 01 จึงไม่เพิ่ม dependency นั้น

ขอบเขตยังเป็น repeating table เดิมใน editable worksheet เดิม ไม่เพิ่มหลาย repeating tables/หลาย editable worksheets หรือ native gestures นอก approved support matrix ผล local bytes/native proof ไม่ใช่ provider acceptance และไม่เพิ่ม provider type/size byte-comparison workload

## Comments

2026-11-18: ผู้ใช้อนุมัติให้ตั๋วนี้ขึ้นกับ 02 แล้ว เผยแพร่เพื่อให้ตรวจเนื้อหาก่อน implementation ไม่มี native/browser/provider trial ใหม่จากการสร้างตั๋ว
