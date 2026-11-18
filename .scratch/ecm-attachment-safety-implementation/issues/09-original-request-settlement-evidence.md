# 09: หลักฐานยุติ original unknown upload/DELETE

**What to build:** รวบรวมหลักฐานที่ผูกกับคำขอเดิมว่า unknown upload หรือ uncertain dispatched DELETE เกิดผลกับ resource ใดและยุติแล้วตาม contract ใด หากยังพิสูจน์ finality ไม่ได้ ให้รายงาน HOLD เฉพาะ scope ที่ได้รับผล ไม่สร้างทางปลดค้างจากการเดาหรือ simulation

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US38–40, US75–79, US84, US90; Testing Decisions C.2 และ remaining settlement HOLD

**Execution prerequisites:** ต้องมีคำสั่งเริ่มงานหลังตรวจตั๋ว พร้อมสิทธิ์เข้าถึง original evidence/records และ provider calls เท่าที่อนุญาตจริง การไม่มี ticket blocker ไม่เท่ากับมีสิทธิ์เรียก API, inspect live data, DELETE หรือปลด HOLD

## Acceptance criteria

- [ ] ใช้ latest two-layer plan: isolated actual-app HTTP proof ของ Folio แยกจาก real DCM evidence ไม่ใช้ test double เป็น provider acceptance การรวบรวม existing external contract/evidence ไม่ต้องรอ naming/UI implementation จึงไม่มี internal blocker
- [ ] อ้างหรือรวบรวม isolated proof ของ provider-stored/upload-response-lost, lost Folio acknowledgement after commit, late receipt after sender fence/cancel, dispatched DELETE outcome lost และ B-commit/A-cleanup-unknown โดยระบุ revision/observations และสิ่งที่ยังไม่รัน ไม่รัน app execution นอก authorization
- [ ] External evidence ต้องตรวจ provenance และผูก original Operation/request/resource ได้ ตอบทั้งเกิดผลอะไรและจบแล้วไม่มี delayed effect ตาม contract/finality window ใด แยก accepted/rejected/not-dispatched/finished ตามหลักฐานที่มีจริง
- [ ] ไม่สมมติว่ามี request-status API/provider logs หรือสิทธิ์เข้าถึงแล้ว หากหาได้เพียง published documentation ที่ไม่มี finality guarantee ให้รายงาน bounded absence ไม่อ้างว่า provider ไม่มีความสามารถอื่น
- [ ] แยก receiptless unknown upload, original late receipt, known received uncommitted file และ uncertain dispatched DELETE ไม่ใช้ผลของคำขอหนึ่งยุติอีกคำขอที่ correlation ไม่ตรง
- [ ] Empty search, found same-name item, elapsed time/restart, sender fence, operator note/checkbox, arbitrary token/link, accepted residual risk หรือ POST ใหม่สำเร็จ ไม่ถูกใช้เป็น settlement proof ไม่มี resend POST/DELETE หรือเปลี่ยนชื่อเพื่อทดสอบผลเดิม
- [ ] คง trusted original-receipt, sender-fence และ authorized first-DELETE chain ตาม standing policy Late canceled receipt เป็น canceled work สำหรับ cleanup ไม่ adopt เป็นคำตอบใหม่ และ fence ไม่พิสูจน์ dispatched mutation จบแล้ว
- [ ] หากยังไม่มี original-request finality proof คง mutation HOLD/guards เฉพาะ original unresolved operation/affected Response ไม่บล็อกทั้งระบบ ไม่อ้างว่ามี Production operation ค้างจริงหากไม่ได้ตรวจข้อมูลนั้น
- [ ] Saved canonical copy อ่านได้ตามสิทธิ์โดยไม่รับรองว่า external bytes immutable B ที่ commit แล้วแต่ cleanup A ล้ม/unknown ยังคงใช้งาน/export ได้พร้อม persistent warning ไม่ย้อน success เป็น failure หรือ full-page lock และ ordinary save/reload ไม่ retry DELETE
- [ ] Real DCM scope หากมีต้องจำกัดฐาน กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45) พร้อม account/environment/write scope/stop condition/cleanup owner ที่อนุญาตจริง DELETE ต้องมีสิทธิ์แยก ไม่ขยาย scoped approvals เก่าที่ใช้ไปแล้วหรือ delete fixtures เดิมอัตโนมัติ
- [ ] รายงาน original correlation, paired receipt เมื่อมี, aliases/ownership/surviving references, contract/version/environment/date และ integrity evidence เท่าที่จำเป็นต่อ claim โดย sanitized ไม่ลง credentials/raw tokens/private URLs/original copies ลง repo
- [ ] ให้ pyw1tt ตรวจผล supported/partial/conflicting/insufficient แยกตามเหตุการณ์ ระบุ exact missing external prerequisites หากยัง HOLD การมีรายงานหรือปิดขั้นอนุมัติแผนไม่ทำให้ settlement acceptance ผ่าน

## Scope boundaries

ไม่มี manual unlock UI/API, arbitrary token adoption, new timeout-based finality, retry policy หรือ settlement service ใหม่ ห้ามแก้ DB/Operation state เพื่อให้ถือว่าจบโดยไม่มี trusted proof

ตั๋วนี้จัดหาและประเมินหลักฐาน ไม่แทน UI handling ของ 05 หรือ HTTP implementation verification ของ 01/06 และไม่บังคับทดลอง unknown/destructive failure กับ real DCM เพื่อสร้างหลักฐานเอง

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown โดยไม่มี internal blocker และแยกสิทธิ์/หลักฐานภายนอกแล้ว เผยแพร่เพื่อให้ตรวจตั๋วก่อน execution ไม่มี settlement contract/provider result ใหม่และยังไม่ปลด HOLD ใด
