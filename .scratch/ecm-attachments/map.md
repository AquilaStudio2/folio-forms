# วางแผนไฟล์แนบ Excel ไปยัง ECM/DCM

Labels: wayfinder:map
Status: resolved
Created: 2026-11-11
Updated: 2026-11-13

## Destination

สเปกพร้อมส่งต่อพัฒนาการแนบไฟล์ Excel ไปยัง ECM/DCM ตั้งแต่ Admin ตั้งค่าปลายทางและชื่อไฟล์ จน User บันทึกร่าง ส่งคำตอบ และกลับมาแก้ โดยไม่มีการตัดสินใจสำคัญค้างก่อนเริ่มพัฒนา
แผนนี้เป็นงานวางแผน ไม่อนุญาตให้พัฒนาหรือเปลี่ยนข้อมูลจริงโดยอัตโนมัติ

## Notes

### ขอบเขตปัจจุบันตามคำชี้แจงล่าสุดของผู้ใช้

- ต่อจากปุ่ม PoC เดิมใน Excel โดยยึดปุ่มในชีต ตำแหน่ง tag/binding และการตั้งค่า Field เดิมเป็นฐาน ทั้งช่องเดี่ยวและแถวตาราง หนึ่งไฟล์ต่อช่อง รองรับทุกชนิด ไม่สร้างหน้า upload/editor อีกชุดหรือใช้เดโมแยกมาแทนการเชื่อมต่อจริง
- เลือกไฟล์อย่างเดียวยังไม่อัปโหลด เริ่มส่งไป API ภายนอกเมื่อ User บันทึก Draft หรือส่งคำตอบเป็น Submission เท่านั้น ไม่ใช่จังหวะ Admin เผยแพร่ Published Template
- ลำดับแทนที่ไฟล์ ความสำเร็จของการบันทึก และการติดตามผล/ลบค้าง ให้ยึด [วงจรไฟล์ร่างและการบันทึกโดยไม่สูญหาย](issues/05-safe-draft-lifecycle.md)
- การตั้งค่าปลายทางและผู้ควบคุมปีงบประมาณให้ยึด [ระดับการตั้งค่าปลายทางไฟล์ของ Admin](issues/03-admin-storage-policy.md)
- อ่าน [แหล่งเลขที่หนังสือยืนยันและกติกาชื่อไฟล์](issues/04-confirmation-filename.md) ก่อนออกแบบการแทนที่ไฟล์หรือแก้ metadata ที่มีไฟล์อ้างถึง
- สัญญาค่าไฟล์แนบให้ยึด [ข้อมูลจากผล upload ที่ต้องเก็บใน JSON](issues/09-provider-contract-evidence.md) และการแสดง URL ใน [ข้อสรุปสิทธิ์ไฟล์และประวัติ](issues/06-history-access.md) ไม่ยึดข้อเสนอแสดงชื่อไฟล์อย่างเดียวก่อนคำสั่งเพิ่มเติม
- รวมผลต่อการกลับมาแก้และส่งใหม่ และ Correction ของ Admin โดยต้องรักษาไฟล์ของ Submission เก่า การรวมกรณีเหล่านี้ในแผนไม่ได้หมายความว่าทุกกรณีต้องอนุญาตให้เปลี่ยนไฟล์
- ECM และ DCM เป็นชื่อที่ใช้ในคำขอ ความสัมพันธ์ของ API กับโครงสร้างจัดเก็บต้องอ้างหลักฐาน ไม่สมมติว่าเป็น path อิสระหรือบริการเดียวกัน

### หลักฐานตั้งต้นและข้อจำกัด

- [แผน PoC ปุ่มแนบ Excel](../excel-attachment-button/map.md) และ [ทดลองเลือกไฟล์จริงจากปุ่มในชีต](../excel-attachment-button/issues/04-local-file-picker.md) เป็นงานก่อนหน้า ไม่เปิดงานเก่าซ้ำ
- PoC เก็บ File ในหน่วยความจำ browser ไม่เก็บไฟล์แนบถาวร ไม่เรียก upload API; หลักฐาน: apps/web/src/features/onlyoffice/upload-poc-pending.ts
- ใช้ ECM_API_URL, ECM_USERNAME, ECM_PASSWORD ฝั่ง server เท่านั้น ห้ามบันทึกค่าจริง token หรือข้อมูลบัญชีลง ticket, research หรือ browser
- อ่านแนวคิดจาก pdms-ongoing-backend และ pdms-ongoing-project-management แล้วประเมินข้อจำกัดใหม่ ห้ามคัดลอก flow โดยถือว่าถูกต้องหรือเหมาะกับ Folio อยู่แล้ว
- เอกสาร API ตั้งต้น: https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#0bb164e9-85fc-4886-9227-12c6f8c1d8e7
- งานวางแผนอาศัย source/docs และคำชี้แจงของผู้ใช้ ไม่ได้ทดลอง login/upload/delete กับ ECM จริง และไม่แก้ข้อมูลหรือ credentials
- อ่าน skills grilling และ domain-modeling ทุก session; research สำหรับงานวิจัย ส่วนหัวข้อ UI ปัจจุบันคุยแผนต่อจาก PoC เดิมตามคำสั่งผู้ใช้ ไม่สร้าง prototype code เพิ่มโดยไม่ได้รับคำสั่ง
- ใช้ศัพท์ Admin, User, Form, Draft, Submission, Correction ตาม CONTEXT.md โดยเฉพาะการส่งคำตอบไม่ใช่การเผยแพร่ต้นแบบ
- ผู้ใช้เลือกบัญชี ECM แยกของ Folio ให้ Folio จัดการ login/token ฝั่ง server เอง ไม่ใช้ร่วมและไม่แก้ Ongoing ตาม [ECM login และ token ของ Folio ด้วยบัญชีแยก](issues/13-folio-ecm-auth.md); username/password จริงจะมีภายหลัง ข้อนี้แทนสมมติฐานบัญชีร่วมในบันทึกเก่า
- การตัดสินใจใน map ครบแล้วตาม resolution ของ child tickets เป็นสเปกแผนสำหรับส่งต่อขั้นพัฒนา ไม่ใช่การอนุญาตให้เริ่มพัฒนา/deploy/เรียก ECM จริงอัตโนมัติ และไม่ใช่ผลรับรอง integration/runtime

### วิธีทำงานใน Local Markdown tracker

- Map นี้เป็น index; รายละเอียดคำตอบอยู่ใน resolution comment ของ ticket เพียงแห่งเดียว
- Child tickets อยู่ใน issues/ และมี Parent กลับมาที่ map นี้ ใช้ Labels เฉพาะ wayfinder:* และ Type ตาม docs/agents/issue-tracker.md
- ตาม convention ของ tracker: ไม่มี Status คือเปิด, Status: claimed คือกำลังทำ, Status: resolved คือปิด; Assignee ว่างคือยังไม่ claim ต้องใส่ Assignee ก่อนเริ่มทำ
- Tracker ไม่มี native dependency UI จึงใช้ Blocked by: หมายเลข ticket ใน effort นี้; ไม่มีค่าคือไม่มีตัวบล็อก
- Frontier คือ child ticket ที่ยังไม่ resolved, Assignee ว่าง และทุกตัวใน Blocked by resolved แล้ว เรียงตามชื่อไฟล์หมายเลขต้น
- สื่อสารกับผู้ใช้ด้วยชื่อ ticket ที่มีลิงก์ ไม่ใช้หมายเลขลอย ๆ
- Charting ไม่ปิด HITL ticket; session ถัดไปทำทีละหนึ่ง ticket ยกเว้น research ซึ่งทำขนานได้
- Research แต่ละเรื่องมี branch research/<name> แยก เก็บ findings หนึ่งไฟล์ push โดยไม่เปิด PR และไม่ merge; ticket เป็น context pointer

## Decisions so far

- [ข้อเท็จจริง ECM: login และความสามารถจัดการไฟล์](issues/01-ecm-api-capabilities.md): ระบุสัญญาที่เผยแพร่และช่องว่างที่ยังขวางการรับรองการแทนที่ไฟล์อย่างปลอดภัย
- [โครงสร้าง DCM และการตั้งชื่อไฟล์ที่ Ongoing ใช้จริง](issues/02-dcm-ongoing-flow.md): flow ปัจจุบันจัดส่งตามชื่อไฟล์ของ Project ไม่ใช่หน้าจัดการโฟลเดอร์สำหรับ Folio
- [ยืนยันสัญญา ECM ที่เอกสารยังไม่ตอบ](issues/09-provider-contract-evidence.md): ระบุ category/metadata จาก tags และเพิ่ม URL/file token จากผล upload ใน JSON คำตอบ โดยยังไม่ตรวจ runtime
- [ระดับการตั้งค่าปลายทางไฟล์ของ Admin](issues/03-admin-storage-policy.md): ล็อก category รายช่อง/คอลัมน์ ใช้ปีเดียวต่อคำตอบจาก User และใช้ค่าหมวดที่บันทึกไว้โดยไม่ตรวจสดก่อนเผยแพร่หรืออัปโหลด
- [แหล่งเลขที่หนังสือยืนยันและกติกาชื่อไฟล์](issues/04-confirmation-filename.md): เลขเดียวต่อคำตอบ แยกชื่อแต่ละฉบับโดยให้ category อยู่ท้าย และใช้ไฟล์เดิมสร้างฉบับใหม่เมื่อเปลี่ยนเลขหรือปี
- [ข้อกำหนดชนิดไฟล์และขนาดที่รับได้](issues/07-pdf-acceptance.md): รับทุกชนิดรวมไฟล์ว่างและเข้ารหัส ไม่เกิน 10 MB และตรวจช่องบังคับตอนส่งตามแถวที่มีข้อมูลหรือไฟล์; วิธีเปิดไฟล์เปลี่ยนตามข้อกำหนด URL ล่าสุด
- [สิทธิ์ไฟล์และการแก้ไขหลังส่งคำตอบ](issues/06-history-access.md): ยอมรับ URL สาธารณะ ใช้สิทธิ์เดิม แก้ผ่าน Draft/Correction และลบเฉพาะไฟล์ที่ไม่มีการอ้างถึงเมื่อลบทั้งคำตอบ
- [สัญญา JSON ของไฟล์แนบและ URL ใน Excel](issues/11-attachment-json-contract.md): เก็บ file object ใต้ tag และตำแหน่งแถวในฉบับนั้น โดยชีต/export แสดงเฉพาะ URL และคง metadata ของประวัติ
- [การเปลี่ยนฟอร์ม PoC เดิมไปใช้ช่องแนบจริง](issues/12-poc-form-cutover.md): Admin ตั้งค่าจากช่องเดิมก่อนเผยแพร่ ส่วนฟอร์มเก่าคงรับข้อมูลทั่วไปโดยไม่เปลี่ยนสัญญาหรืออัปโหลดผ่าน PoC
- [ECM login และ token ของ Folio ด้วยบัญชีแยก](issues/13-folio-ecm-auth.md): Folio ดูแลบัญชีเฉพาะ ใช้ PostgreSQL ประสาน token และลอง login สูงสุด 3 ครั้งรวมครั้งแรก ไม่พึ่ง Ongoing หรือส่งคำขอไฟล์ซ้ำเอง
- [วงจรไฟล์ร่างและการบันทึกโดยไม่สูญหาย](issues/05-safe-draft-lifecycle.md): อัปโหลดก่อนบันทึกคู่เอกสาร/JSONแล้วลบเก่า ยกเลิกรอบที่ล้มเหลว ให้ผู้ดูแลเคลียร์ผลอัปโหลดที่ไม่แน่ชัด และทำงานต่อได้เมื่อบันทึกแล้วแต่ลบค้าง
- [หน้าตั้งค่าปลายทางและสถานะไฟล์ที่ผู้ใช้เข้าใจ](issues/08-admin-user-prototype.md): ต่อปุ่มและกล่อง PoC เดิม เพิ่ม category ในแผงเดิม ใช้ข้อความสถานะค้าง และขยายรายละเอียดติดตามในหน้าผลลัพธ์เดิม ไม่ใช้เดโมแยกเป็นฐาน

## Not yet specified

<!-- ยังไม่มีประเด็นในขอบเขตที่ตั้งคำถามไม่ได้; fog เดิมแยกเป็น child ticket แล้ว -->

## Out of scope

- การพัฒนาระบบจริง การ deploy การย้ายข้อมูล และการทดสอบเขียนข้อมูลใน ECM จริงในรอบวางแผนนี้
- ปุ่มแนบใน DOCX และหลายไฟล์ต่อช่อง; ข้อจำกัด PDF-only เดิมถูกผู้ใช้แก้เป็นรองรับไฟล์ทุกชนิดแล้ว
- การปรับระบบ Ongoing หรือเปลี่ยน API ของผู้ให้บริการโดยยังไม่มีข้อตกลง ใช้สอง repo นั้นเป็นแหล่งอ้างอิง
- การออกแบบหน้า upload/editor ใหม่มาแทนปุ่ม PoC เดิม หรือใช้โค้ดเดโมแยกเป็นฐานของฟีเจอร์จริง
- การอัปโหลดทันทีที่เลือกไฟล์ หรือการเก็บไฟล์ต้นแบบของ Admin ผ่าน flow นี้
- [การใช้บัญชี ECM ร่วมโดยไม่ตัด token ของระบบอื่น](issues/10-shared-ecm-login.md): ปิดเพราะผู้ใช้เลือกบัญชี ECM เฉพาะ Folio ไม่ต้องประสาน token ร่วม/สร้าง token broker หรือเปลี่ยน Ongoing
