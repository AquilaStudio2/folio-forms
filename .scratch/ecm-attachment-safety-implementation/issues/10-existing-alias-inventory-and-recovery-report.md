# 10: ตรวจข้อมูลเดิมและจัดทำรายงาน recovery ตามหลักฐาน

**What to build:** ผู้ดูแลได้รับ read-only report ว่าข้อมูลที่ Folio รู้จักใช้ resource ร่วมกันอย่างไร และยืนยัน original integrity ได้เพียงใด หากต้องกู้ไฟล์ให้เสนอ trusted provenance และผลต่อ history เพื่อให้ pyw1tt อนุมัติรายกลุ่ม ไม่แก้หรือลบข้อมูลเดิมอัตโนมัติ

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US89–90; approved inventory/recovery/data-use policy และ old-data HOLD register

**Execution prerequisites:** ต้องมีคำสั่งเริ่มงานหลังตรวจตั๋ว และ authorization แยกสำหรับ environment/DB, record/access scope, sanitized report และ original-byte retrieval หากจำเป็น ไม่อนุญาต actual remediation/DELETE จากตั๋วรายงานนี้

## Acceptance criteria

- [ ] ตรวจแบบ read-only เฉพาะข้อมูลที่ Folio รู้จักตาม approved scope ไม่สแกน arbitrary external DCM inventory และไม่ใช้ mandatory external inventory เป็น gate ของ naming policy
- [ ] ครอบคลุม Draft, Submission, Correction, workspace, eligible Operations และ retained records/aliases รวม tracking ที่ยังเก็บหลัง Response deletion ไม่ฟื้น deleted Responses หรือแก้ answer rows
- [ ] จัดกลุ่ม Provider File Identities/paired receipts/aliases และ surviving references ตามหลักฐาน แยก duplicate filename ออกจาก shared identity และแยก shared identity ออกจาก corruption ไม่ใช้ชื่อ/ขนาด/timestamp อย่างเดียวระบุ original
- [ ] รายงาน integrity เป็นตรง trusted original, ยังยืนยันไม่ได้ หรือแตกต่างจาก trusted original ตามหลักฐานที่มีจริง ไม่มี historical hash ให้ unknown ไม่สร้าง hash จาก current bytes แล้วอ้างย้อนหลังเป็น original เก่า
- [ ] Original retrieval/comparison ทำเฉพาะเมื่อได้รับสิทธิ์ใน scope และจำเป็นต่อ claim การไม่มี trusted original ไม่ถูกอ้างว่า bytes เสียหรือกู้ไม่ได้ถาวร และ URL เปิดได้ไม่เท่ากับยืนยัน historical content
- [ ] คงข้อมูลเดิมเมื่อยังยืนยันหรือกู้จากหลักฐานที่มีไม่ได้ ไม่ใช้ latest/search result/ไฟล์แถวอื่นแทน original ไม่ rename/reupload/delete/แก้ history JSON หรือ backfill evidence อัตโนมัติ
- [ ] หากเจ้าของให้ trusted original และพิสูจน์ provenance ได้ ให้จัดทำ remediation proposal รายกลุ่ม ระบุ affected references/immutable history/resource effects และขอ pyw1tt approval แยกก่อนแก้ ตั๋วนี้ไม่ลงมือ remediation
- [ ] คง DCM-only originals ไม่เพิ่ม RustFS/DB/private archive หรือ binary/base64 answer copy เพื่อปิดช่องว่าง recovery และไม่เก็บ original attachment นอก DCM ใน retained report
- [ ] ระหว่างตรวจคง known ownership/history/shared-reference/unknown-operation guards ไม่ลบ alias เพื่อเปิดทาง และไม่บล็อกทั้งระบบเพียงเพราะ inventory ยังไม่ครบ
- [ ] การอ่าน/export saved revisions ยังคงสิทธิ์เดิม พร้อมรายงานข้อจำกัดให้ผู้ดูแลและผู้ที่เปิด revision ที่เกี่ยวข้องตาม existing surfaces ไม่เพิ่ม dashboard/manual unlock หรืออ้าง frozen JSON ทำให้ external bytes immutable
- [ ] Real-provider retrieval หากมีจำกัดตาม authorization; กรอบชื่อทดสอบ กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45) ไม่ถือเป็นสิทธิ์ audit records/projects อื่น ต้องแยก original-data access scope ให้ชัดก่อนอ่านจริง
- [ ] ส่ง sanitized report ที่ระบุ environment/date/source/schema scope/records ที่ตรวจ/provenance/evidence status/unknowns/ข้อจำกัดและผู้ตรวจรับ ไม่ลง credentials/raw tokens/private evidence URLs ลง repo
- [ ] pyw1tt ตรวจรับรายงานและตัดสิน remediation รายกลุ่ม แยกผล inventory, integrity comparison และ recovery outcome ไม่ใช้ local simulation/sample เดิมกล่าวหา Production corruption หรือรับรอง recovery สำเร็จ
- [ ] หาก authorization/trusted original ยังขาด ให้รายงาน exact prerequisite และส่วนที่ยัง pending ไม่ลงมืออ่านข้อมูลจริงเพื่อเติมรายงานหรือปิด evidence gap โดยเดา

## Scope boundaries

ไม่มี dependency ต่อ naming/native/loading tickets เพราะ read-only inventory รายงาน current data ตาม approved scope ได้โดยไม่รอเปลี่ยน behavior แต่ไม่มี ticket blocker ไม่เท่ากับมีสิทธิ์อ่าน DB/original files แล้ว

ไม่สร้าง migration, generic audit platform, recovery engine หรือ new UI จากงานรายงานนี้ Remediation ต้องมี authorization แยกและไม่ขยาย approval ของชุดตั๋วเป็นสิทธิ์เปลี่ยนข้อมูลจริง

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown โดยแยก external authorization ออกจาก internal dependencies แล้ว เผยแพร่เพื่อให้ตรวจตั๋วก่อน execution ไม่มี inventory/DB/original-retrieval/recovery result ใหม่จากการสร้างตั๋ว
