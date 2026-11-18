# 05: Loading ระหว่าง Save และทางออกของ unknown/Correction

**What to build:** ระหว่าง Save ระบบบล็อกการแก้ไขและ navigation ภายใน app จริง เมื่อได้ผลต้องแยก confirmed outcome, unknown และ old-cleanup warning อย่างถูกต้อง Final Correction ที่มี newer pending ต้องรักษา editor และให้ explicit discard ก่อนออก โดยไม่ Save บน workspace ที่ retired แล้ว

**Blocked by:** 04 — เตือนก่อนออกและแยกสถานะไฟล์ที่ยังไม่บันทึก.

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US72–81; H09, U04 และส่วน async/pending ของ U05

**Execution gate:** ต้องให้ผู้ใช้ตรวจตั๋วและสั่งเริ่ม implementation ก่อนพัฒนา ใช้ actual browser/editor กับ isolated app/data/provider เท่านั้น ไม่มี real DCM/DELETE authorization จากตั๋วนี้

## Acceptance criteria

- [ ] Reuse navigation/discard/status contract ของตั๋ว 04 และ existing Operation/pending state แยก active Save, confirmed success/failure, timeout/unknown, postcommit cleanup warning และ completed Correction with newer pending ไม่สร้าง state/persistence subsystem ซ้ำ
- [ ] Active Save บล็อก native editor/active cell/keyboard edits, file picker, duplicate actions และ app-controlled navigation ครอบคลุม host/plugin/routes ไม่ใช่ loading overlay ที่ยังแก้ workbook ได้
- [ ] Loading มี accessible status และ focus ตาม platform patterns ผู้ใช้ keyboard ไม่กดส่วนที่ควรถูกบล็อก ไม่ใช้อุปกรณ์ชี้อย่างเดียวพิสูจน์การป้องกัน
- [ ] Confirmed success/failure จบ loading ตามหลักฐาน Failure รักษา saved canonical answer และ pending ที่ยังอยู่ ไม่ล้าง newer pending ที่ไม่อยู่ใน captured snapshot
- [ ] HTTP error/timeout อย่างเดียวไม่ถูกถือว่าคำขอเดิมจบโดยไม่มีผล Timeout/unknown เปลี่ยนเป็น persistent unresolved/no-resend notice คง checkpoint/mutation HOLD ไม่ spinner ล็อกทั้งหน้าถาวร
- [ ] Original-operation recovery และ saved canonical-copy access ตามสิทธิ์ยังใช้ได้ใน unknown state การกลับเข้าหน้าไม่ resend/clear/fence/cancel original request อัตโนมัติ และไม่มี manual unlock จาก token/link/note
- [ ] Browser refresh/close ยังเป็น best-effort prompt ไม่อ้างว่า loading ห้ามปิดแท็บหรือยกเลิก dispatched request ได้
- [ ] B ที่ canonical commit สำเร็จแต่ cleanup A ล้ม/unknown ยังคงเป็น successful saved snapshot อ่าน/export ได้ ไม่ full-page lock B แสดง persistent old-public-URL warning Ordinary Save/reload ไม่ retry DELETE หรือทำ warning หาย
- [ ] Completed final Correction ที่มี newer File/removal คง editor/browser state ไม่ navigate/remount รับเฉพาะ captured snapshot และแจ้งแยกงานที่บันทึกแล้วจากงานใหม่ที่ยังไม่บันทึก
- [ ] Retired Correction workspace ไม่ Save ซ้ำ ออกด้วย explicit discard-and-exit ตาม contract หากทำต่อให้เปิด current revision เป็น Correction ใหม่และเลือก File อีกครั้ง ไม่ transfer/reselect File หรือสัญญากู้ bytes หลัง reload
- [ ] ทดสอบ async interleavings/newer-pending แม้ loading ลดโอกาสเกิด ไม่ลบ safeguard เดิมเพราะสันนิษฐานว่าเลือกไฟล์ใหม่ระหว่างรอไม่ได้
- [ ] ใช้ actual browser/ONLYOFFICE ตรวจ pointer/keyboard/active-cell/picker/navigation/focus ระหว่าง Save และแต่ละ outcome พร้อม controlled completion/unknown/cleanup scenarios ตรวจ saved state เทียบ pending ไม่ใช้ mock echoes เป็น proof
- [ ] ใช้ existing HTTP seam พิสูจน์ original checkpoint/no-extra-POST/DELETE/canonical preservation และ cleanup warning persistence ที่เกี่ยวข้อง โดยไม่เพิ่ม timeout/retry/unlock policy ใหม่
- [ ] ปรับ affected UI/protocol consumers, behavioral regressions และ docs/system map ใน change เดียวกัน ระบุ native/browser source/version และ boundary ที่ยังไม่ตรวจตามจริง

## Scope boundaries

Blocker 04 เป็น prerequisite ของ navigation/discard behavior ที่ loading ใช้ร่วมกัน ไม่มี dependency ต่อ naming ticket 01 เพราะ loading อาศัย Operation lifecycle เดิม; integrated warning/state interaction จะตรวจอีกครั้งใน 06

ตั๋วนี้แก้เฉพาะ gaps และคง completed-with-newer-pending behavior ที่มีแล้ว ไม่เพิ่ม Save-and-exit, new Correction transfer, cancellation guarantee หรือ full-page HOLD ของ postcommit cleanup

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown และ blocking edge 04 แล้ว เผยแพร่เพื่อให้ตรวจเนื้อหาก่อน implementation ไม่มี runtime/browser/provider result ใหม่
