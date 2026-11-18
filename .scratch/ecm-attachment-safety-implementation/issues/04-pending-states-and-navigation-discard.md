# 04: เตือนก่อนออกและแยกสถานะไฟล์ที่ยังไม่บันทึก

**What to build:** User และ Admin รู้ว่าไฟล์ยังอยู่ใน dialog, ยืนยันเป็น pending แล้ว หรือบันทึกจริงแล้ว ก่อน navigation ที่จะทิ้งงานต้องเลือกอยู่ต่อหรือ explicit discard โดยไม่ทำให้ saved answer ถูกลบหรือ original Operation ถูกยกเลิกโดยปริยาย

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US64–71, US76–77; U03 และ canonical/no-extra-write ส่วนที่เกี่ยวข้องของ H06/H09

**Execution gate:** ต้องให้ผู้ใช้ตรวจตั๋วและสั่งเริ่ม implementation ก่อนพัฒนา ใช้ระบบแยก ไม่เรียก real DCM หรือแก้ข้อมูลใช้งานจริง

## Acceptance criteria

- [ ] แยก candidate ใน dialog, confirmed host pending และ canonical saved state ให้ผู้ใช้เข้าใจ Saved A กับ pending B ไม่แสดงเหมือน B บันทึกแล้ว Dialog Save ไม่ถูกเรียกว่า upload/canonical save สำเร็จ
- [ ] Picker Cancel/X ทิ้งเฉพาะ local changes ตั้งแต่เปิด dialog รักษา previous confirmed pending/canonical baseline ไม่กลายเป็น full-page discard หรือ DELETE และยังเคารพ existing confirmation-settlement handshake
- [ ] ก่อนเริ่ม Save เมื่อ candidate/File/replacement/removal หรือ ordinary unsaved edits จะสูญหายจาก app-controlled navigation/route/back ให้แสดง existing platform modal ทางปลอดภัยเป็นอยู่หน้านี้ต่อ และอีกทางเป็น explicit ทิ้งการเปลี่ยนแปลงและออก
- [ ] Cancel/Escape คงหน้าและงานเดิม Confirm ทิ้งเฉพาะ unsaved local changes ไม่เปลี่ยน saved canonical answer ไม่มี automatic Save-and-exit/POST/DELETE
- [ ] เมื่อไม่มีงานค้างไม่เตือน และการเปิดอีกแท็บโดยไม่ทำลายหน้าเดิมไม่เตือนหรือโอน File ข้ามแท็บ
- [ ] Refresh/close ขอ browser beforeunload prompt แบบ best-effort ไม่รับรองว่าจะแสดงทุกครั้งหรือกำหนดข้อความเองได้ ไม่สัญญากู้ browser File จาก filename/checkpoint หลัง reload
- [ ] Navigation/reload ไม่ clear/fence/cancel original checkpoint หรือ release mutation HOLD โดยอัตโนมัติ ไม่ใช้การออกจากหน้าเป็น proof ว่าคำขอที่ dispatch แล้วถูกยกเลิก และไม่ resend เมื่อกลับเข้าหน้า
- [ ] Reuse existing original-Operation recovery ก่อนเปิด mutation scope ใหม่เมื่อมี checkpoint คง saved canonical-copy access ตามสิทธิ์ ไม่สร้าง recovery/persistence layer ใหม่
- [ ] Existing modal คง keyboard access, Cancel/Escape semantics, focus containment/return และ labelled controls ไม่เพิ่ม dialog component หรือ navigation framework ใหม่
- [ ] ใช้ actual browser/editor ตรวจ candidate/confirmed pending/removal/ordinary edits/no-dirty/new-tab/route/back/confirm/cancel/Escape/refresh/close ตรวจ pending ก่อนและหลังแต่ละ action พร้อมระบุ browser prompt limitations จริง
- [ ] ใช้ existing HTTP/transport evidence ยืนยัน canceled/discard navigation ไม่เพิ่ม upload/DELETE และ saved canonical state/checkpoint ไม่ถูกล้าง ไม่ใช้ mocked router หรือ source-text tests เป็น browser proof
- [ ] คง completed-Correction-with-newer-pending safeguards เดิมและ active-save/unknown protections ระหว่างทำตั๋วนี้ การเติม loading/state matrix เต็มเป็นตั๋ว 05 ไม่ทำให้ behavior เดิมถดถอย
- [ ] อัปเดต affected routes/host/plugin consumers และ existing behavior tests/docs/system map เฉพาะที่เปลี่ยน ไม่เขียน pending host หรือ Correction lifecycle ใหม่ทั้งชุด

## Scope boundaries

File bytes อยู่ใน browser memory ตามเดิม ไม่มี auto-upload, sessionStorage/IndexedDB File copy, temporary server copy หรือ cross-tab transfer ตั๋วนี้ไม่มี dependency ต่อ naming/minimum-row เพราะใช้ pending/Operation interfaces ที่มีอยู่แล้ว

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown ให้เริ่มตั๋วนี้โดยไม่มี ticket blocker ได้เมื่อมีคำสั่ง implementation การเผยแพร่ยังไม่ใช่คำสั่งเริ่มพัฒนา และไม่ใช่ browser prompt acceptance
