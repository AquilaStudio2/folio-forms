# วางปุ่มพร้อมบันทึกต้นแบบก่อนเลือกไฟล์

Type: task Status: resolved

Owner: button_scope (plugin), storage_audit (server/web), Agent หลัก (ซ่อมฟอร์ม/ทดสอบ UI), sol_reviewer (ตรวจ)

## คำสั่งผู้ใช้

อนุญาตให้กดวางปุ่มแล้วบันทึกต้นแบบให้สำเร็จก่อนเลือกไฟล์ ซ่อม attachment_6/7 ที่ค้าง ทดสอบเปิดใหม่แล้วปุ่มยังอยู่ และให้ reviewer ตรวจซ้ำ พร้อมแก้ข้อความมีการตั้งค่าช่องที่ยังไม่ได้บันทึกซึ่งขึ้นทุกช่อง

## ตรวจรับ

- การเลือกเซลล์ว่างโดยไม่แก้ตั้งค่าไม่สร้าง draft ที่ขวางปุ่มวางหรือ SaveTemplate
- การแก้ Title/Tag/options จริงที่ยังไม่บันทึกยังถูกป้องกันตามเดิม
- ปุ่มวางระบุชัดว่าบันทึกต้นแบบทั้ง workbook; ตรวจ pending File ก่อนเปลี่ยนข้อมูล
- สร้างหรือใช้ binding เดิม วางปุ่ม และบันทึกต้นแบบผ่าน operation เดิมหลังปล่อย native mutation lock
- ยืนยันการบันทึกสำเร็จก่อน Admin เลือกไฟล์ โดยตรวจหลักฐานจาก artifact ที่ server บันทึก ไม่เชื่อ picker metadata อย่างเดียว
- การบันทึกล้มเหลวแสดงวิธี retry ไม่รายงานสำเร็จหรือสร้างช่องซ้ำ
- ซ่อม 6 ที่ D15 ตามรอบทดสอบเดิม และ 7 ที่ D13 ซึ่งเป็นเซลล์ที่ผู้ใช้เลือกตอนแจ้งปัญหา คง tag เดิมและตรวจไม่ซ้อนช่องอื่น
- เปิดฟอร์มใหม่ ปุ่มทั้งสองและปุ่มที่สร้างเพื่อทดสอบยังอยู่ เปิด picker ได้หลังบันทึก
- ไม่เชื่อม external API และไม่บันทึก File bytes/URL

## ผลตรวจโค้ด

- ต้นเหตุ false dirty: captureDraft เก็บค่าเริ่มต้นที่ผู้ใช้ไม่ได้แก้ เมื่อ metadata ใหม่เปลี่ยน Tag อัตโนมัติ จึงคืนค่าเก่ามาเทียบกับ baseline ใหม่และเข้าใจว่าเป็น user edit แก้ให้เก็บเฉพาะ draft ที่แก้จริง
- Plugin ใช้ SaveTemplate operation เดิมหลัง native mutation lock ถูกปล่อย และตรวจ pending File ก่อนเริ่ม mutation ลองซ้ำเซลล์เดิมใช้ binding เดิม
- Server สร้าง savedButtons จาก artifact ที่บันทึก ตรวจ GUID, metadata, marker, native anchor, ตำแหน่งวัตถุและ rowIndex ให้ตรง binding ปัจจุบัน Host ตรวจสิทธิ์และขอบเขตเดิมก่อนรับ File
- sol_reviewer ตรวจอิสระ: no actionable findings; plugin 187 tests / 871 assertions, web 24 tests, native ONLYOFFICE 9.4 ผ่าน 129 assertions
- Root typecheck, build, lint/format และ git diff --check ผ่าน

## ผลทดสอบ UI จริง

- ซ่อม attachment_6 ที่ D15 และ attachment_7 ที่ D13 โดยใช้ binding/Tag เดิมผ่าน “ผูกตำแหน่งใหม่” และ “บันทึกการแก้ไข”
- กดวางและบันทึกสำหรับ 7 และ 6 ตามลำดับ SaveTemplate สำเร็จและ editor โหลดกลับทุกครั้ง
- เลือก F20 → G20 → G22 โดยไม่แก้แผง แล้วกดครั้งเดียวสร้าง attachment_8 ที่ G22 และบันทึกสำเร็จ ไม่ติด false dirty
- Reload ทั้งหน้า: D13, D15 และ G22 ยังมีปุ่มครบ ไม่มีคำเตือนตำแหน่งหาย [ภาพเปิดใหม่](../evidence/saved-buttons-reopened.png)
- หลังเปิดใหม่ ดับเบิลคลิกช่อง 6 และ 7 แล้วเลือกไฟล์ทดสอบจริงขนาด 45 ไบต์ผ่าน file chooser ได้ทั้งคู่ [ภาพเลือกไฟล์](../evidence/saved-picker-after-reopen.png)
- Reload อีกครั้งเพื่อล้าง File ทดลองในหน่วยความจำ ให้ผู้ใช้วางปุ่มต่อได้ ไม่ค้าง pending guard จากการทดสอบ

ไม่ส่งไฟล์ไป API และไม่เขียน File/URL ลงข้อมูลถาวร รุ่นนี้ยังไม่รับประกัน atomic commit ของ metadata และ artifact ในกรณี SaveTemplate ล้มเหลวทุกแบบ แต่หยุด picker จนกว่าจะมีหลักฐานปุ่มจาก artifact ที่บันทึกจริง และมีขั้นตอน retry โดยคง identity
