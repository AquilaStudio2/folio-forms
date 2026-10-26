# วางปุ่มพร้อมบันทึกเบื้องหลังโดยไม่เปิด Excel ใหม่

Type: task

Status: resolved

Owner: button_scope (plugin), storage_audit (server/regression), Agent หลัก (web/UI/เอกสาร), sol_reviewer (ตรวจ)

## คำสั่งผู้ใช้

สร้างปุ่มแล้วบันทึกเบื้องหลังโดยไม่รีเฟรช Excel ทดสอบสร้างหลายปุ่มต่อเนื่อง เปิดใหม่แล้วปุ่มอยู่ครบ และให้ reviewer ตรวจซ้ำ

## แนวทาง

- ใช้ optional `preserveEditorSession:true` เฉพาะ XLSX save-template หลังวางปุ่ม ไม่เปลี่ยน manual save, deletion หรือ publish
- คง documentKey และ editor lease เดิม แต่เขียน canonical artifact ใหม่ผ่าน force-save/callback/transaction เดิมครบทุกครั้ง
- ปลดล็อกการทำงานและรายงานสำเร็จหลัง server ยืนยัน `editorSessionPreserved:true` พร้อม documentKey ที่ตรง session เท่านั้น
- Host ตรวจผลกับ native editor key และ POC session ก่อนข้าม remount และอ่าน savedButtons ล่าสุดเมื่อเลือกไฟล์
- คง pending File, dirty panel/recovery, bindingRevision, callback claim/replay และ one-operation-at-a-time guards
- ปุ่มที่มีข้อมูลผิดหรือกรณีต้องลบ obsolete OLE ต้องใช้ normal save เพื่อให้ live document กลับตรง saved copy

## ตรวจรับ

- สร้างช่องเดี่ยวหลายปุ่มและปุ่มคอลัมน์ตารางต่อเนื่องโดย iframe เดิม, zoom และพื้นที่ขยายคงอยู่
- บันทึกล้มเหลวไม่รายงานสำเร็จ ไม่เปลี่ยน Tag หรือเพิ่ม binding ซ้ำเมื่อลองใหม่
- ตรวจ canonical bytes จาก storage โดยตรงและ native reopen เพื่อไม่อาศัย cache ของ ONLYOFFICE อย่างเดียว
- เปิดหน้าใหม่แล้วปุ่มและ Title/Tag ครบ และเลือกไฟล์ได้หลัง canonical save
- ชุดทดสอบที่เกี่ยวข้องผ่าน พร้อม independent reviewer

## Comments

- Reviewer สถาปัตยกรรมยืนยันแนวทางโดยต้องตรวจ same-key callback replay และ artifact จริง การเก็บ File/API/URL ยังอยู่นอกขอบเขต
- Reviewer พบ P2: การมีปุ่มเก่าอย่างน้อยหนึ่งปุ่มไม่พิสูจน์ปุ่มที่เพิ่งวาง แก้ให้ส่ง uploadPocBindingId ของ target และให้ server ตรวจ canonical proof ของ binding เป้าหมายครบทุก rowIndex ก่อน ACK; regression old artifact/forceSave(false) และ partial table ผ่าน
- UI พบการ disable ซ้อนกันทำให้ Title/Tag ไม่กลับมา editable เมื่อไม่ remount แก้โดยรักษา disabled snapshot ครั้งแรก; success/failure/retry และ pending draft guards ผ่าน
- UI จริงฟอร์ม 0138fd29fd284319ae12fdae79217ca4: B3/D3/F3 สร้างต่อเนื่องใน iframe เดิม ซูม 90% และ expanded คงอยู่ เปิดใหม่ปุ่มครบ จากนั้นใช้ bundle สุดท้ายสร้าง H3/J3 และ B7:B9 ต่อเนื่องใน iframe เดิมพร้อมแผง editable หลัง Save
- ตรวจ storage จริง: documentKey เดิม แต่ objectKey/hash ใหม่และ canonical savedButtons 8 slots ครบ จากนั้น native ONLYOFFICE 9.4 เปิด bytes โดยตรงพบครบทั้ง 8 ตำแหน่ง และเปิด browser ใหม่แล้วยังครบ พร้อม Title/Tag ของคอลัมน์
- Full plugin 214 tests / 1015 assertions, web focused 25 tests, isolated HTTP regression, native 151 assertions, spreadsheet units 89 tests และ root types ผ่าน; reviewer ตรวจอิสระและสรุป no actionable findings
