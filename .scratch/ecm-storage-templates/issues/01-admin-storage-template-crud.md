# 01: Admin จัดการ Storage Template catalog ครบ CRUD

**What to build:** Admin เปิดหน้า **แม่แบบจัดเก็บเอกสาร** จาก navigation เลือก **หัวข้อเอกสาร** แล้วดู/กรอง เพิ่ม แก้ชื่อหรือย้ายหมวด และยืนยันลบแม่แบบที่บันทึกจริงได้ครบ โดยใช้ category ID จาก DCM และไม่แตะไฟล์ User หรือโครงสร้าง DCM

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 1–22; authorization, accessibility และ no-external-file-write เป็นข้อกำหนดร่วม

## Acceptance criteria

- [ ] เพิ่ม persisted catalog ที่มี identity ภายใน, `template_name` และ numeric `document_category_id`; migration ใช้ isolated database และไม่ reset/เปลี่ยน Responses หรือไฟล์เดิม
- [ ] Admin navigation เปิดหน้าจริงที่มี category select **หัวข้อเอกสาร**, persisted list/filter และ create/edit/delete controls ครบ ไม่ใช่ mock data หรือหน้า create/list อย่างเดียว
- [ ] โหลด category ผ่าน backend/shared ECM auth เดิม ใช้ `type` แสดงผลและ `id` เป็นค่า/filter key; categories ที่ชื่อเหมือนกันแต่ ID ต่างกันไม่ถูกยุบรวม
- [ ] Create บันทึกชื่อกับ category ID ที่ backend ตรวจจาก provider evidence ที่ใช้ได้ ปฏิเสธ arbitrary/unknown ID, blank/control/unsafe filename metadata โดยไม่ rewrite ชื่อเงียบ ๆ
- [ ] `template_name` ไม่ซ้ำทั้ง catalog แม้คนละหมวด มี database uniqueness ป้องกัน concurrent create/update และคืน error ที่ Admin แก้ได้
- [ ] Update เปลี่ยนชื่อและหมวดที่ผูกได้จริง หลัง reload รายการหมวดเก่าและใหม่ตรงข้อมูลที่บันทึก ไม่เหลือ selection ที่ผิดหมวด
- [ ] Delete มี confirmation พร้อม Cancel/Escape และ focus behavior ที่ใช้ keyboard ได้; cancel ไม่ mutate และยืนยันสำเร็จแล้วรายการหายจาก future choices
- [ ] แยก loading, empty และ provider/API error ชัดเจน คงข้อมูล/ข้อความที่กำลังแก้เมื่อบันทึกล้มเหลว ไม่แสดงผลสำเร็จจาก optimistic state เพียงอย่างเดียว
- [ ] Provider outage ไม่ล้าง saved catalog; เปลี่ยน category ต้องมี valid evidence ส่วนลบ local mapping ไม่ต้องเรียก DCM file mutation
- [ ] Backend ทุก catalog-management action ตรวจ enabled Admin; direct User/Viewer/unauthenticated requests ถูกปฏิเสธโดยไม่ทำ ECM login/file writes แทนผู้ไม่มีสิทธิ์
- [ ] Browser/response/log evidence ไม่เปิดเผย service credentials/Bearer; ใช้ coordinator/token-renewal policy เดิม ไม่เพิ่ม cron/config/dependency
- [ ] CRUD ไม่สร้าง/แก้/ลบ template/folder/category ใน DCM และไม่ upload/rename/re-upload/DELETE file ไม่เปลี่ยน Published Template หรือ canonical answers
- [ ] Existing HTTP integration seam กับ isolated persistence/provider double พิสูจน์ persisted CRUD/filter, invalid IDs, global duplicates รวม race, permissions และไม่มี external file writes
- [ ] Smoke หน้า Admin จริงครบ create → reload/filter → rename/move → cancel delete → confirm delete พร้อม empty/error และ keyboard paths ไม่ใช้ tests แทน actual UI proof
- [ ] อัปเดต domain/workflow/system map ที่กระทบและตรวจด้วย scripts ของ repo ใน change นี้ ไม่อ้าง provider routing acceptance จากการสร้าง catalog สำเร็จ

## Notes

ขอบเขตนี้จัดการ catalog ของ Folio เท่านั้น Admin ต้องกรอก `template_name` ให้ตรงกับแม่แบบที่ DCM มีอยู่แล้ว `type` ไม่ใช่ physical folder contract และไม่ต้องรอ PM เทียบชื่อหมวดกับโฟลเดอร์ ข้อ 1–3 ของ planning ปิดแล้ว

ตั๋วถูกสร้างเพื่อรอคำสั่ง implementation; triage label ไม่ใช่สิทธิ์เรียก live API หรือเริ่ม migration ในรอบจัดเอกสาร

## Comments
