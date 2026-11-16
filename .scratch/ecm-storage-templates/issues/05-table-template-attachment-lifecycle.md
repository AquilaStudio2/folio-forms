# 05: Table attachments แบบ Storage Template รักษา physical rows และ shared-identity safety

**What to build:** User แนบไฟล์รายแถวในคอลัมน์ที่ Admin ตั้ง Storage Template บันทึก/เปิด Draft และ Submit ได้โดยไฟล์ไม่สลับแถว รองรับ attachment-only/zero-byte rows และหลายคอลัมน์ พร้อมตรวจชื่อซ้ำหรือ shared identities โดยไม่เติม suffix เอง

**Blocked by:** 03 — Scalar Save Draft/Submit แบบ template mode พร้อม identity และ failure safety.

**Status:** ready-for-agent

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 86–94; original reuse จาก 04 รวมเข้าที่ shared caller เมื่อพร้อม ไม่ใช่ blocker ของ row-specific behavior ในตั๋วนี้

## Acceptance criteria

- [ ] Table column ใช้ frozen category/template/mode เดียวกันทุกแถวและหนึ่งไฟล์ต่อ physical-row slot ไม่เปิดให้ User เลือก template รายแถว
- [ ] ใช้ trusted physical-row position และ published binding ไม่ใช้ compact JSON array index แทน `row_index`; blank gaps และ multiple attachment columns ไม่ cross-wire ไฟล์
- [ ] Attachment-only rows รวม saved/selected zero-byte files ถูกเก็บเป็น active rows และ Submit ตรวจ required ordinary/attachment columns อื่นทั้งหมด
- [ ] Fully empty rows ที่ไม่มี input/file ไม่ถูกบังคับแนบเพียงเพราะมีปุ่ม; invalid selected file ยังทำให้ Draft save ไม่ผ่าน
- [ ] Save Draft → reopen → replace/remove/cancel → Submit แสดง canonical receipt/URL ของ slot ที่ถูกต้องโดยใช้ native picker/buttons เดิม
- [ ] Existing supported append/delete-selected รักษา references และ pending Files ด้วย verified document/row mapping โดยไม่ upload/delete จาก internal save
- [ ] Unsupported/stale/ambiguous mapping หยุดก่อนทำข้อมูลหรือ pending selections หาย ไม่เพิ่ม stable row ID/Tag ใหม่เพื่อหลบข้อจำกัด
- [ ] วางแผน duplicate destinations ทั้ง batch ก่อน dispatch และตรวจ owner/history/reference/admission fencing ไม่รอ token collision หลังเขียนแล้วจึงค่อยป้องกัน
- [ ] คง filename grammar ที่ไม่มี row/version suffix ยอมรับเพียงข้อจำกัดชื่อซ้ำที่ planning อนุมัติ ไม่รับรอง independence หาก provider reuse identity
- [ ] Same-identity receipt ไม่ถูก DELETE จาก replacement/canceled-batch cleanup และไม่สร้าง independent-version evidence ปลอม Foreign/protected destination conflicts หยุดก่อน write
- [ ] หลายไฟล์ส่งตาม existing sequential plan และ commit document/JSON/references เป็น complete snapshot เดียว Failure กลาง batch ไม่มี partial Submission และไม่เริ่มไฟล์ถัดไปโดยเดาผล
- [ ] Unknown upload/overwrite, receipt collision, late response และ commit failure ใช้ durable evidence/hold ของ 03 ไม่ rollback external bytes, retry write หรือ DELETE shared identity
- [ ] Errors ระบุ column/slot และ physical row ที่ User แก้ได้โดยไม่เผย secrets คง size/JSON/requiredness/security boundaries เดิม
- [ ] Existing HTTP seam พิสูจน์ physical gaps, multiple columns, attachment-only zero-byte rows, empty/active requiredness, row shifts, duplicate destinations และ partial/unknown batch โดย provider bytes/receipts จริงของ test double
- [ ] Smoke actual ONLYOFFICE ตั้ง template ให้คอลัมน์ แนบอย่างน้อยสอง physical rows ที่มี gap บันทึก/เปิด/ส่งและตรวจ persisted URLs; แสดง duplicate-name limitation ตามผลจริง
- [ ] เมื่อรวม 04 แล้ว table docs_number change ใช้ shared trusted-original flow ครบทุก saved slot ไม่สร้าง table-specific storage/cache หรือ download bypass
- [ ] อัปเดต affected table consumers/fixtures และ workflow/system map โดยไม่เปลี่ยน legacy published table behavior หรือข้อมูลเดิม

## Notes

ตั๋ว 05 ไม่รอ 04 เพราะ row mapping/requiredness/selected-file batch ใช้ 03 โดยตรง ส่วน journey ที่เปลี่ยน docs_number โดยไม่มี replacement เป็นงาน 04 และต้องผ่านแบบรวมก่อน 06/08 เสร็จ

ต้องเตือนก่อน implementation/release ว่าหลายแถวที่ส่งชื่อเดียวกันอาจอ้าง provider identity เดียวกัน ข้อยกเว้นนี้ไม่อนุญาตทำลายข้อมูลคนอื่นหรือ immutable history

## Comments
