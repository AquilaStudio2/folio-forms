# ตรวจและเก็บกวาดหลังทดสอบ

วันที่ 22 ตุลาคม 2026 ตามคำสั่งผู้ใช้ให้ลบไฟล์ที่ไม่ใช้แล้ว

## ลบแล้ว

ไฟล์ชั่วคราวจากการทดสอบและภาพรุ่นเก่าที่มีหลักฐานใหม่แทน รวม 17 ไฟล์:

- `runtime/designer-before-fix.jpg`
- `runtime/inspect-draft.ts`
- `runtime/create-accounts.ts`
- `runtime/saved-draft.xlsx`
- `runtime/accounts.json`
- `runtime/picker-files/poc-document-a.txt`
- `runtime/picker-files/poc-document-b.txt`
- `runtime/picker-files/poc-new-row.txt`
- `runtime/picker-files/poc-table-row.txt`
- `runtime/picker-files/poc-too-large.bin`
- `evidence/compact-buttons.jpg`
- `evidence/designer.jpg`
- `evidence/user-added-row.jpg`
- `evidence/real-file-picker.jpg`
- `evidence/real-file-new-row.jpg`
- `evidence/admin-one-click-immediate.jpg`
- `evidence/admin-one-click-table.jpg`

## เก็บไว้เพราะยังใช้งาน

- โค้ด plugin/server/web และ regression tests: มี imports, build entry, routes หรือใช้ทดสอบข้อบกพร่องที่แก้แล้วครบทุกไฟล์
- แผน แบ่งงาน คู่มือ และผลตรวจ: ใช้พัฒนาขั้นถัดไปตามคำขอเดิม
- หลักฐานล่าสุดและตัวอย่าง XLSX: ใช้ดูและทดลองตามคู่มือ (XLSX เป็นหลักฐานรอบแสดงปุ่ม)
- runtime/server.log และ runtime/web.log: โปรเซส dev ปัจจุบันยังเปิดเขียนอยู่
- examples/sheet-upload: รอบแรกเก็บไว้เพราะ demo ยังเปิดใช้งาน; ต่อมาผู้ใช้สั่งหยุดและลบทั้งชุดแล้ว ดูรายการเพิ่มเติมด้านล่าง
- dist: ผล build ที่ใช้งานและสร้างใหม่ได้ ไม่ลบระหว่างระบบยังเปิด

ไม่เปลี่ยนข้อมูลฟอร์มหรือบัญชีในฐานข้อมูล และไม่หยุดบริการที่กำลังเปิดอยู่ ปรับลิงก์คู่มือและรายงานให้ตรงกับภาพที่เหลือแล้ว

## ตรวจหลังลบ

- Plugin tests: ผ่าน 181 tests, 834 assertions
- Web tests ที่เกี่ยวกับ editor reconnect และ pending files: ผ่าน 24 tests
- Root build: ผ่านทั้ง 3 tasks (web และ prefill-mock ใช้ cache; server และ plugin build ใหม่)
- Root `bun run check` และ `git diff --check`: ผ่าน
- ลิงก์ไฟล์ใน Markdown ของงานนี้ 36 ลิงก์: พบไฟล์ครบ ไม่มีลิงก์เสีย
- sol_reviewer ตรวจอิสระแล้ว: ไม่พบข้อที่ต้องแก้ ยืนยันว่าไม่ลบ source/tests ที่จำเป็น และภาพกับ XLSX ที่เก็บไว้สมบูรณ์

รอบนี้เป็นการเก็บกวาดไฟล์ ไม่เปลี่ยนพฤติกรรมฟีเจอร์ และไม่ได้ทดสอบ browser ซ้ำ

## เพิ่มเติม: เลิกใช้ demo เก่า

ตามคำสั่งผู้ใช้ หยุดโปรเซส `demo.ts` และ Document Server ของ demo ชื่อ `folio-sheet-upload-poc` แล้วลบ `apps/onlyoffice-plugin/examples/sheet-upload` ทั้งชุด รวม 10 ไฟล์ ตัว container ที่หยุดแล้วยังคงอยู่ ไม่ได้ลบ image หรือ volume

เก็บ `evidence` ทั้ง 5 ไฟล์ไว้ ตรวจ SHA-256 ก่อนและหลังลบแล้วตรงกันทุกไฟล์ บริการ Folio ที่พอร์ต 8080 และ Document Server หลักเป็นคนละชุดกับ demo นี้
