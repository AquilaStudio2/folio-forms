# หลักฐาน DCM แยกไฟล์ชื่อเติมเลขและคง original bytes

Labels: wayfinder:task
Type: task
Parent: ../map.md
Assignee:

## Question

Human/provider ต้องส่งหลักฐานหรืออนุมัติแผนเก็บหลักฐานแบบใด จึงรับรองได้ว่าชื่อปลายทางใหม่ที่เติม suffix สร้าง resource แยกจริง และทุก saved reference ยังดาวน์โหลด original bytes ของตนได้?

เป็น task แบบ HITL จัดหา provider evidence หรือแผนทดสอบที่อนุมัติชัดเจน ไม่ใช่การเลือกคำตอบแทน provider การอนุมัติแผนอย่างเดียวยังไม่ใช่ผลทดสอบผ่าน หากปิดขั้นวางแผนด้วย approved plan ต้องระบุ acceptance ที่ยัง HOLD และเจ้าของหลักฐานปลายทาง

ขอบเขต namespace ภายนอกอยู่ที่ [ป้องกันชื่อชนกับไฟล์นอก Folio ledger](02-external-filename-collisions.md) ส่วนข้อมูลที่ share identity ไปแล้วอยู่ที่ [ตรวจ shared identities เดิมและนโยบายกู้ไฟล์ที่ถูกเขียนทับ](03-existing-aliases-recovery.md) การพิสูจน์ resource ใหม่ไม่ใช่การกู้ bytes เก่า

## หลักฐานตั้งต้น

- [หลักฐาน routing จากผู้ใช้](../../ecm-storage-templates/planning.md#หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง) ยืนยัน wildcard แยกปี/หมวดแล้ว ไม่ถามเรื่องการมี routing ซ้ำ แต่ยังไม่ยืนยัน byte independence, suffix/case preservation หรือ external namespace safety
- [รายงานตาราง: Save และชื่อปลายทาง](../../ecm-storage-templates/table-upload-behavior-audit.md#e-save-และชื่อปลายทาง-dcm) และ [BATCH evidence](../../ecm-storage-templates/acceptance-matrix.md#batch-filename-verification) เป็น historical local/source evidence ไม่ใช่ real DCM acceptance ของชื่อใหม่
- Same destination เขียนทับพร้อม token/URL เดิมเป็นข้อเท็จจริงที่ยอมรับแล้วตาม [สถานะคำถามปัจจุบัน](../../ecm-storage-templates/planning.md#สถานะคำถามปัจจุบัน) ไม่ขอพิสูจน์ซ้ำว่าเกิดได้หรือไม่

## Evidence checklist สำหรับ human/provider

- [ ] ระบุเจ้าของคำยืนยัน วันที่ environment/provider revision ที่ทราบ และขอบเขตแม่แบบที่รับรอง; ช่องที่ไม่มีให้ระบุ unknown
- [ ] ใช้ synthetic A/B/C ที่ bytes ต่างกัน ตรวจชื่อจริง รวม suffix, literal suffix ใน template, original extension/casing และ extensionless โดยไม่แก้ frozen `template_name`
- [ ] ตรวจ original bytes ของ A และ B หลังสร้าง C และหลัง reopen/retrieve; token/link ต่างกันหรือ HTTP สำเร็จอย่างเดียวไม่พิสูจน์ independence
- [ ] แยกการคงชื่อจริงจาก routing ที่ผู้ใช้ยืนยันแล้ว: provider ตัด suffix, normalize case/Unicode/whitespace หรือ alias หลายชื่อเข้าทรัพยากรเดียวกันหรือไม่ ให้ระบุเฉพาะ guarantee ที่พิสูจน์ได้
- [ ] หากจำเป็นต้องพิสูจน์ DELETE isolation ให้อนุมัติ scope แยก ตรวจ ownership/collision ก่อน write และลบเฉพาะ resource ที่พิสูจน์ว่าสร้างในรอบนี้ ไม่มี survivor/history ใช้ ไม่ลบ alias เพราะ token ต่างกัน
- [ ] เก็บ sanitized manifest ของชื่อที่ส่ง/ที่ provider เก็บ, paired receipts และ hashes/bytes ก่อนและหลัง; ไม่ลง credentials, tokens หรือ private evidence URLs ใน repo
- [ ] แผน live test ต้องมีบัญชี/ขอบเขตชื่อและ destination, stop condition เมื่อ unknown outcome, cleanup owner และข้อห้าม auto POST/DELETE retry; charting session ไม่ได้อนุญาตให้ดำเนินการ

## เกณฑ์คำตอบ

บันทึกผล supported/partial/conflicting/insufficient แยกตาม guarantee พร้อมข้อจำกัด หาก provider ไม่รับรองให้ระบุว่าไม่รับรองและคง HOLD อย่าเปลี่ยน public-link policy เป็น private URL requirement เพื่อปิดช่องว่างนี้

## Comments

2026-11-18: เปิดคำถามและรายการหลักฐานเท่านั้น ยังไม่มี provider acceptance ใหม่ ไม่มี live trial หรือ decision resolution
