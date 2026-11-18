# 02: ทุกตาราง XLSX เหลืออย่างน้อยหนึ่งแถวและปุ่มแนบครบ

**What to build:** User เพิ่มและลบแถวตาม flow เดิมได้ แต่ลบแถวสุดท้ายไม่ได้ ทุก XLSX repeating table ต้องเหลืออย่างน้อยหนึ่ง body row โดยไม่ล้างข้อมูลหรือไฟล์ ปุ่มแนบต้องครบทุก body-row cell ของ configured attachment columns

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US41–55; H07–H08 และ U01

**Execution gate:** ต้องให้ผู้ใช้ตรวจตั๋วและสั่งเริ่ม implementation ก่อนพัฒนา การเผยแพร่ตั๋วไม่ authorize real DCM, live-data changes, DELETE, push หรือ deploy

## Acceptance criteria

- [ ] Minimum one body row ใช้กับ ordinary XLSX tables, old Published PoC และ durable legacy/template ทั้งมีและไม่มี attachment ไม่รวมหัวตาราง และไม่เพิ่ม row controls ให้ Correction หรือพื้นที่ที่เดิมแก้ไม่ได้
- [ ] เมื่อเหลือหนึ่ง body row คำสั่ง delete-selected ถูก disabled พร้อมเหตุผลที่เข้าใจได้ Server ตรวจ trusted current document/revision ก่อนเริ่ม mutation ไม่พึ่งปุ่ม disabled, active answer count หรือ attachment-only branch
- [ ] Builder และ full-mapping consumers ไม่ clear/delete แถวสุดท้าย Direct/stale/racing requests ถูกปฏิเสธโดยไม่เปลี่ยน canonical revision/workbook ranges/input/formulas/validation/buttons/JSON/references
- [ ] Rejected last-row delete รักษา saved attachment, pending replacement/removal และ invalid-selection state เดิม ไม่มี ECM POST/DELETE และไม่ remount แล้วทำ File หาย
- [ ] ลบจากสองเหลือหนึ่งได้ตามสิทธิ์และ guards เดิม สั่งลบซ้ำไม่ได้ เพิ่มแถวกลับแล้วลบแถวที่อนุญาตต่อได้ Save Draft/Submit/reopen ใช้งานต่อได้โดยไม่สร้าง empty snapshot แทนการลบที่ถูกห้าม
- [ ] ไม่มี clear-last-row action หรือ confirmation ใหม่ ไม่ลบแถวอัตโนมัติเพื่อบังคับจำนวน และไม่กลับไปใช้ clear-one/delete-zero proposal เก่า
- [ ] ทุก configured attachment column มีปุ่มในทุก body-row cell ไม่รวมหัวตาราง แถวใหม่มีปุ่มครบแต่ไม่มีไฟล์/receipt ที่ copy จากแถวต้นแบบ
- [ ] การนำ File ออกจากคำตอบไม่ลบ control/configuration การลบปุ่มรายเซลล์โดยคง column configuration ต้องไม่ผ่าน trusted saved-button validation ไม่เปลี่ยน incomplete Template Draft rules, immutable Published configuration หรือ read-only/export URL projection
- [ ] Supported row transitions รักษา identity และ current physical position ของ survivors ไม่ใช้ compact answer index ไม่ rename/reupload unchanged files และ internal row save ไม่ dispatch ECM POST/DELETE
- [ ] Empty physical row ไม่กลายเป็น active answerเพียงเพราะมีปุ่มแนบ Attachment-only rows รวม zero-byte ยังคง active/requiredness ตาม contract เดิม ไม่มี required-file rule ใหม่จาก minimum-row policy
- [ ] ใช้ existing HTTP seam ตรวจหนึ่ง row ว่าง/ordinary/saved/zero-byte/pending/removal/invalid states, direct/stale/race และ two-to-one/repeated-delete/append cases ทั้งตารางมีและไม่มีปุ่ม ตรวจ rejected snapshots และ no-write/no-loss
- [ ] ใช้ actual browser/ONLYOFFICE ตรวจ delete control, keyboard/repeated action, buttons ทุก configured column และ Save/reopen ของ changed path Builder-only proof ไม่แทน native control evidence
- [ ] ปรับ affected UI/server/builder tests/fixtures/docs และ system map ใน change เดียวกัน คงสิทธิ์เดิมและระบุ source/runtime limits ตามจริง ไม่รัน reproduction เก่าเพื่อยืนยัน user-reported finding ซ้ำ

## Scope boundaries

ตั๋วนี้แก้ minimum-row และ column-button invariant แบบ end-to-end ไม่เพิ่ม stable row ID, per-row Tag, table engine, row commands ใน Correction หรือ native gesture support ใหม่ Full native support/guard matrix อยู่ในตั๋ว 03

ไม่มี dependency ต่อ naming change: minimum-row guard ต้องทำงานได้แม้ไม่มี Attachment Fields เลย

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown และ dependency ที่ไม่มี blocker แล้ว เผยแพร่เพื่อให้ตรวจเนื้อหาก่อน implementation ไม่เปลี่ยนหรือแทน Wayfinder minimum-row decision เดิม และยังไม่มี runtime result ใหม่
