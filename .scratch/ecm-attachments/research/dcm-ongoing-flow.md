# ผลวิจัย: Ongoing ใช้ ECM อย่างไร และข้อจำกัดก่อนออกแบบ Folio

วันที่สำรวจ: 2026-11-11 · งานวิจัยเท่านั้น ไม่ใช่ implementation/spec ที่อนุมัติแล้ว

## สรุปคำตอบ

**Ongoing ไม่ได้ให้ผู้แนบไฟล์เลือกต้นไม้ ECM/DCM ใน flow ที่ตามพบ** ผู้ใช้เปิดโครงการเดิม เลือกชนิดเอกสารและงวด/ไตรมาสตามหน้าจอ แอปใช้เลขที่หนังสือยืนยันของโครงการตั้งชื่อ PDF แล้วส่ง `template=1` ให้ ECM จัดการต่อเอง ปีงบประมาณถูกตรวจว่ามีในบางหน้า แต่ไม่ได้ส่ง `documentYear`, `documentNumber`, `documentCategory` ในการอัปโหลดแบบนี้ [S3][S4][S5][S6]

Backend รองรับอีกโหมด `template=0` พร้อมสามฟิลด์ดังกล่าว แต่ไม่พบ caller UI ในขอบเขตที่สำรวจส่งโหมดนี้ ไม่พบหน้าตั้งค่า Admin สำหรับเลือก folder/category จาก ECM และไม่พบหลักฐานพอจะรับรองต้นไม้ DCM ทั้งชุดหรือกติกาที่ provider ใช้แยกชื่อไฟล์ [S4][S5][S6][S10]

Ongoing เก็บลิงก์เป็นหลัก ไม่ได้เก็บ `file_token`/`file_path` ในแถวไฟล์ทั้งสามแบบที่ตรวจ การเพิ่มแถวประวัติใน DB จึง **ไม่ใช่หลักฐานว่าเนื้อหาไฟล์เก่าที่ ECM immutable** โดยเฉพาะการส่งซ้ำด้วยชื่อเดิม [S7][S8][S9][S11]

## วิธีอ่านและความมั่นใจ

- **ข้อเท็จจริงจาก source** = เห็นคำสั่ง/โครงสร้างจริงในโค้ด ณ เวลาสำรวจ ไม่ยืนยันว่า deploy หรือทำงานสำเร็จจริง
- **ข้อเท็จจริงจากเอกสาร** = เจตนาหรือคำอธิบายของ repo ไม่ใช้แทน implementation
- **[INFERENCE]** = ผลที่อาจเกิดจากโค้ด ต้องไม่ตีความเป็นเหตุการณ์ production ที่พิสูจน์แล้ว
- **ข้อเสนอ Folio / คำถามค้าง** = สิ่งที่ต้องตัดสินใจต่อ ไม่ใช่ convention ที่ถูกบังคับโดย Ongoing
- FE = `pdms-ongoing-project-management`; BE = `pdms-ongoing-backend`. รายการอ้างอิงท้ายไฟล์ระบุ repo/path, symbol และบรรทัด
- HEAD ขณะสำรวจ: FE `a52369f36edb2d4fbd7108240f950cc56411b071`; BE `e51f2245fab13d55676de46ceb4781903ec41470`. อ่าน working tree จึงไม่รับรองว่าทุกบรรทัดเท่ากับ commit นี้
- ใช้ CodeGraph ก่อนตาม flow แล้วเติมส่วนที่ index ไม่แสดงด้วย source read/search ไม่อ่านค่า environment, credentials, token หรือข้อมูลผู้ใช้จริง ไม่เรียก ECM/DB ไม่ทดสอบ runtime

## 1. ขอบเขตปัจจุบัน ต่างจากสถาปัตยกรรมเป้าหมาย

**เอกสาร:** FE ON ปัจจุบันเรียก BE ON เป็นหลัก และบาง flow ยังเรียก K2/Email โดยตรง แผนเพิ่ม middleware/BFF และตรวจ token/สิทธิ์ที่ backend เป็นหัวข้อเป้าหมาย ไม่ใช่หลักฐานว่าทำแล้ว ส่วน ADR 0001 มีสถานะ `proposed` และพูดถึงประวัติสถานะเบิกจ่าย ไม่รับรองประวัติ binary ของไฟล์ ECM [S1]

**Source:** เส้นทางแนบหลักคือ browser `uploadFilesToECM` ใช้ Axios instance ของ Ongoing ส่ง multipart ไป BE; BE ใช้ credential ของบริการ ECM และ Bearer ของ ECM เอง ไม่ส่งต่อ credential ของผู้ใช้ไปเป็นเจ้าของไฟล์ใน payload ที่ตรวจ [S4][S5][S12]

คำว่า `template=true` ใน API นี้เป็นโหมดอัปโหลดตามชื่อไฟล์ ไม่ใช่ Folio Form Template และไม่ควรใช้เป็นหลักฐานว่า ECM รู้จัก Revision หรือ Submission ของ Folio [S4][S5]

## 2. ใครเป็นเจ้าของเลขที่หนังสือยืนยัน และแถวสัมพันธ์อย่างไร

### ข้อเท็จจริงจาก source

1. `Project.id` เป็น MongoDB ObjectId; `Project.confirmation_document_number` เป็น `String? @unique`; `fiscal_year` อยู่ระดับ Project แยกจากเลขยืนยัน และมี `requested_confirmation_document_number` เป็นอีกฟิลด์หนึ่ง จึงห้ามรวมเลขทุกชนิดว่าเป็นเลขเดียวกัน [S7]
2. หลักฐานช่องทางนำเข้าเลข: `ImportService` อ่านคอลัมน์ Excel ชื่อ `เลขที่หนังสือยืนยัน` ลง `rowData.confirmation_document_number`, ใส่ `projectData` แล้ว `tx.project.create`. ปีงบประมาณถูกใส่จาก `project.fiscal_year` เช่นกัน ไม่มีการออกเลขใหม่ใน upload handler ที่ตามพบ [S2][S3]
3. หน้า `project-information.$projectDetailId` ใช้ route project ID เรียก `getProjectInformationById`; จากนั้น dialog รับ `projectInfo.fiscal_year` และ `projectInfo.confirmation_document_number` ไม่ใช่ช่องให้ผู้แนบพิมพ์เลขใหม่ [S3]
4. Project มี arrays `project_information_uploads`, `e_form_document_uploads`, `financial_report_uploads`. แต่ละ record มี ID ของไฟล์/แถวเอง ชนิดเอกสารและงวดหรือเดือน ไม่ได้มีเลขยืนยันแยกทุกแถว [S7]
5. แถว `ProjectInformationUpload` อาจเป็นไฟล์หรือ K2 link ตาม `isFile`; หมายเลขลำดับแถว UI ไม่ใช่ project ID, document number หรือ file ID [S7][S11]

**ข้อจำกัด:** ยืนยันได้ว่า Ongoing เป็นผู้เก็บเลขระดับ Project และ importer รับค่าจาก Excel ไม่ยืนยันหน่วยงานผู้มีอำนาจออกเลขดั้งเดิม ไม่ยืนยันว่าการนำเข้า Excel เป็นช่องทางเขียนเลขเพียงช่องทางเดียว และไม่ได้ตรวจระบบต้นทางนอกสอง repo นี้

**ผลต่อ Folio:** ความสัมพันธ์ “หนึ่ง Project ต่อเลขยืนยันหนึ่งค่า และมีเอกสารหลายแถวใต้ Project” เป็นโมเดลของ Ongoing เท่านั้น ไม่ได้พิสูจน์ว่า Form, Response, Submission หรือแต่ละ table row ของ Folio ต้องใช้เลขร่วมกัน [S7]

## 3. รายการเลือกมาจากไหน

| ข้อมูล | แหล่งที่พบ | ความหมายที่ห้ามสรุปเกินหลักฐาน |
| --- | --- | --- |
| ปีงบประมาณในหน้ารวม Ongoing | FE ขอ `filter-options`; BE query `distinct fiscal_year` จาก Project | API-fed จาก DB ของ Ongoing ไม่ใช่ ECM fiscal-year catalog [S13] |
| ปีและเลขที่ใช้แนบ | Project ที่เปิดอยู่ | ไม่ใช่การเลือกปลายทาง ECM ใหม่ใน dialog [S3] |
| ชนิดเอกสาร / suffix | `listTextOfficer`, `listTextAll`, `reportTypes`, `uploadOptions` เป็นรายการใน source | ไม่ใช่รายการ category ที่ provider ส่งมา [S6][S14] |
| ตัวเลือกชนิดเอกสารที่แสดงจริงใน ManageProject | เอารายการ static มาตัดกับ `uploads` ที่ `isFile===false` และข้อยกเว้น `alwaysUploadable` | มีข้อมูล workflow จาก backend ร่วมกำหนด แต่ไม่ใช่ provider folder discovery [S15] |
| งวด | สร้าง `1..projectInfo.total_installment` ใน dialog | งวดเบิกจ่ายภายใน Project ไม่ใช่เลขแถวทั่วไป [S3] |
| เดือนรายงาน | `monthly_report_data.target_month_display` จาก backend | เป็นเดือนรายงานที่ต้องส่ง ไม่ใช่เดือนที่เลือกไฟล์; แยกจากงวดเบิกจ่ายตาม glossary [S1][S9] |
| หมวด/โฟลเดอร์ ECM | generic upload contract รับ `documentCategory` เป็น string | route ไม่มี enum, folder ID หรือ tree/list API ใน `ecmRoutes` ที่ตรวจ [S5][S10] |

## 4. Flow ที่เกิดจาก UI และจังหวะอัปโหลด

### 4.1 เอกสารดำเนินโครงการ: เจ้าหน้าที่และหน่วยงานรับทุน

1. เปิดตารางโครงการ แล้วกด “นำส่งเอกสาร” เพื่อเปิด `DialogUploadFile2`.
2. เลือกชนิดเอกสาร งวดถ้าชนิดนั้นต้องใช้ และ PDF; `onChange` เก็บ `File` ใน state เท่านั้น ปุ่มถังขยะ ณ จุดนี้แค่ `setFile(null)` ไม่ลบ ECM.
3. กด “นำเข้าเอกสาร” จึงตรวจข้อมูลและสถานะล่าสุดต่อชนิด/งวด แล้วเรียก `props.onUpload`. ถ้ารายการล่าสุด `SENT` หรือ `APPROVED` UI ปฏิเสธ; `RETURN_EDIT` ใช้เป็นสัญญาณส่งแก้ไข.
4. `ManageProject` ตรวจปี เลขยืนยัน และขนาด 50 MiB; ตั้งชื่อใหม่; อัปโหลด ECM; ตรวจ `res.data.status===200`.
5. อ่าน `file_link` และ `file_name`; POST metadata อีกคำขอไป `/api/pages/project-information/:projectId/uploads`. `isOfficer` ต่างกันตามตาราง และ status ใหม่เป็น `SENT`. Backend append record เข้า Project.
6. หลังจากนั้นบางชนิดมี email/status/K2-link work เพิ่ม ไม่ได้อยู่ใน transaction เดียวกับ upload. [S3][S6][S8]

**ไม่ใช่ Save Draft ของ Folio:** ใน Ongoing ปุ่มยืนยัน dialog เริ่มอัปโหลด ส่วน Folio ได้กำหนดว่าต้องเริ่มบน User Save Draft/Submit เท่านั้น ห้ามคัดลอก event binding ตรง ๆ [S3][S6]

### 4.2 e-Form และเอกสารการเงิน

- `DialogUploadFileEFormOfficer` เก็บไฟล์ก่อน `handleSubmit`; รายงานไตรมาสเติม ` ไตรมาสที่ N`; กลุ่มปิดบัญชีมีหลายชนิดย่อยและวนส่งแยกไฟล์. ใช้เลข Project; มี fallback เป็น `projectId` หากเลขยืนยันขาด ซึ่งอาจไม่ผ่านชื่อ `กทอ.` ที่ backend บังคับ [S14][S5]
- `DialogUploadIFle` สำหรับเอกสารการเงินเติม ` งวดที่ N` เฉพาะชนิดที่กำหนด เช่นหนังสือขออนุมัติจ่ายเงิน/แจ้งโอนเงิน จากนั้นเรียก `uploadEFormDocumentFile` เพื่อ append metadata; ธุรกรรมใน BE ครอบคลุม DB กับ status ของ Project เท่านั้น ไม่ครอบคลุม ECM [S14][S8]
- `DialogUploadFinancialReport` มี 3 ช่อง static: รายงาน 4.1, 4.2, แผนผล. `onChange` เก็บ state; `handleSubmit` วน upload ECM แล้วบันทึก metadata ทีละช่อง. Backend กำหนดเดือนรายงาน ตรวจ required type และเพิ่ม version ของคู่ `(month_sequence, report_type)` [S9]
- มี handler “กลั่นกรอง-4” ที่ upload จาก file input `onChange` โดยตรง แต่ container `<td>` มี class `hidden` ใน source ปัจจุบัน จึงไม่ใช้เป็นหลักฐานว่าผู้ใช้ปกติเห็น flow นี้ ต้องแยก “โค้ดมี” จาก “UI เปิดใช้” [S16]

## 5. ชื่อไฟล์และ payload ที่ออกจริง

### Convention ชื่อไฟล์ในแอป

- Project On-Going: `${confirmation_document_number}-${suffixWithoutHyphens}${optionalInstallment}.pdf`.
- ตัวอย่าง mapping จาก source: `ยืนยันรับสนับสนุน` เป็น `ยืนยัน`; `ก่อหนี้-1 แจ้งสิทธิ(60)` เป็น `ก่อหนี้1`; `ขอเบิก1-นำส่ง` เป็น `ขอเบิก1` พร้อม ` งวดที่ N` เมื่อมีงวด.
- e-Form รายไตรมาสเติม ` ไตรมาสที่ N`.
- รายงานการเงินใช้ `${docNumber}-${suffix} ประจำเดือน ${target_month_display}.pdf`; suffix เป็น `รายงาน4-1`, `รายงาน4-2`, `แผนผลการใช้จ่ายเงิน`. หน้านี้ไม่ได้ลบ hyphen แบบ ManageProject.
- ชื่อเหล่านี้ไม่ได้ใส่ upload ID, version หรือ random suffix จึงไม่สร้าง identity ที่ไม่ชนกันเอง [S6][S9][S14]

### Browser ไป BE

`uploadFilesToECM(file,{template:true})` ส่ง multipart:

```text
documentFile = File ที่เปลี่ยนชื่อแล้ว
template = "1"
```

ไม่ส่ง `documentYear`, `documentNumber`, `documentCategory` เมื่อเป็น template mode แม้ dialog จะรับปี/เลขมาจาก Project [S4]

### BE ไป ECM

Hono `POST /api/ecm/file/upload` จำกัด request body 50 MiB, อ่าน `documentFile`, แปลง template, ตรวจชื่อ `^กทอ\..+\.pdf$` ใน template mode แล้วแปลง bytes เป็น Buffer. `ECMService.uploadFile` ส่ง `POST /api/beeecm/public/file` โดยแนบ `documentFile` พร้อม filename และ `template` เหมือนเดิม ใช้ service Bearer ของ ECM. หาก provider ตอบ 401 จะ login ใหม่และลองอีกครั้งหนึ่ง [S5][S12]

**อีกโหมดที่ backend รองรับ:** `template="0"` ต้องมี `documentYear`, `documentNumber`, `documentCategory`; ตรวจเพียง presence ของฟิลด์ใน route ที่ตามพบ ไม่พบการตรวจรายการปลายทางกับ provider ในเส้นทางนี้ ตัวอย่าง `7. เอกสารปิดโครงการ` ใน route description เป็นตัวอย่าง contract ไม่ใช่ผล query catalog [S5]

**[INFERENCE]:** template mode น่าจะมอบการจัดหมวดจากชื่อให้ provider แต่ source สอง repo นี้ไม่ได้มี parser/กติกาของ provider จึงยังรับรองไม่ได้ว่าปีถูกอ่านจากส่วนไหนของเลข หรือชื่อใดลงโฟลเดอร์ใด

## 6. ECM/DCM และ hierarchy: หลักฐานถึงไหน

**พบจริง:** ชื่อ feature/class ใช้ `ECM`/`ECMService`; upstream endpoint ใช้ `/api/beeecm/public/...`. หน้าเปิดไฟล์มี branch ตรวจ URL ที่มีข้อความ `pdms-documentmanagement` เพื่อเปิดแท็บใหม่ แทน iframe [S5][S17]

**หลักฐานชื่อโฟลเดอร์ที่แอปคาดหวัง:** `ApproveProject` ขอ `/api/ecm/search?documentNumber=...`; backend ส่ง `POST /api/beeecm/public/search` ด้วย `{text: documentNumber}`. FE กรอง PDF และเอาส่วนท้าย `file_path` หลัง `/`, ตัด prefix เลขลำดับแบบ `N. ` แล้วรับเฉพาะ `หนังสือยืนยัน` หรือ `มติและการก่อหนี้` [S10]

นี่พิสูจน์ว่าหน้าอ่านมี assumption เกี่ยวกับสองชื่อดังกล่าว ไม่พิสูจน์โครงสร้างทั้งต้นไม้ ไม่พิสูจน์ว่า `DCM` เป็นชื่อผลิตภัณฑ์/ระบบเดียวกันหรืออีกระบบหนึ่ง และไม่พิสูจน์ว่า path hierarchy เป็น `ปี/เลข/หมวด` เสมอ. ไม่มี endpoint list years/projects/categories/folders ใน `ecmRoutes` ที่ตรวจ [S10]

## 7. สิ่งที่เก็บไว้ การเปิดย้อนหลัง เปลี่ยน และลบ

### Response และ persistence

- ECM response schema มี `file_token`, `file_link`, `file_path`, `file_name`, type/size/timestamps/title/description.
- `ProjectInformationUpload` และ `EFormDocumentFiles` ใน Prisma เก็บ `link`; `FinancialReportFile` เก็บ `uploaded_file_link` และ `version`.
- ไม่พบฟิลด์ `file_token`/`file_path`/`file_name` ในสาม record types นี้ แม้ FE บาง handler จะนำ `file_name` ไปใส่ object ชื่อ `fileName` และส่งต่อ/ใช้งานประกอบ. Create schema ของ Project Information ไม่มี `fileName`; จึงห้ามสรุปว่า DB เก็บ provider filename จากการเห็น FE payload เท่านั้น [S4][S7][S8]

### เปิด/ดาวน์โหลด

- ตาราง Project Information map แถวที่เก็บไว้ทุกแถว และส่ง `item.link` กับ `fileID` ไปหน้า viewer; viewer รับ URL จาก query string ถ้าเป็น documentmanagement เปิดแท็บใหม่ มิฉะนั้นใช้ iframe. ไม่ได้ resolve bytes ด้วย provider token ของแถวก่อนเปิด [S11][S17]
- ตารางหนังสือ/มติใช้ `<a href={file_link}>` โดยตรงจาก search response [S10]
- อีก API `GET /api/ecm/file/:documentNumber` ค้นหาด้วยเลขแล้วเลือกผลที่ `file_datetime_edit` ใหม่ที่สุดทั้งชุด ไม่ได้เลือกตามชนิดเอกสาร/Revision. ห้ามใช้แทน “ดาวน์โหลดไฟล์ของ Submission ที่กำลังดู” [S10]

### เปลี่ยน/ประวัติ

- Project Information ส่งแก้ไขเป็น upload ใหม่และ append record; แถวเดิมไม่ถูกลบโดย `createUpload`. UI ใช้ latest status ต่อชนิด/งวดเป็น guard; BE create ที่ตรวจไม่ได้ทำ guard แบบเดียวกัน [S3][S8]
- e-Form create append record ภายใน DB transaction [S8]
- รายงานการเงิน create append version ใหม่; แต่มี `updateFile` ที่ merge update ของ record เดิม และ update schema ยอมรับ `uploaded_file_link`. จึงไม่ใช่ทุก writer จะเป็น immutable history [S9]
- **[INFERENCE] ความเสี่ยง:** ชื่อเดิมถูกส่งซ้ำได้ แต่ Ongoing ไม่เก็บ provider immutable version identity. แม้ DB ยังมีแถวเก่า ลิงก์เก่าอาจเปลี่ยนเนื้อหาตามนโยบาย provider. จาก source นี้ยังตอบไม่ได้ว่า provider overwrite, deduplicate หรือสร้างคนละไฟล์ [S6][S7][S9]

### ลบ/อัปโหลดล้มเหลว

- ปุ่มลบไฟล์ใน dialog ที่ตรวจเป็นการเอาไฟล์ pending ออกจาก state ก่อนส่ง; `ecmRoutes` ไม่มี delete/replace endpoint. `callECMApi` รับ method `DELETE` ได้ใน helper ทั่วไป แต่ไม่ใช่หลักฐานว่ามี flow ลบไฟล์ที่เปิดใช้ [S3][S10][S12]
- ไม่พบ compensation/remote cleanup ระหว่าง ECM สำเร็จกับ POST metadata ล้มเหลวใน handlers ที่ตาม. ไม่พบการลบไฟล์เดิมก่อน upload ใน flow เหล่านี้เช่นกัน [S6][S9][S14]
- **[INFERENCE] ความเสี่ยง:** ECM สำเร็จ แต่ DB/ขั้นตอนถัดไปล้มเหลว อาจเกิดไฟล์ไร้ metadata หรือผู้ใช้ retry ส่งซ้ำ; upload หลายช่องแบบ sequential อาจสำเร็จบางส่วน. Source นี้ไม่รับรอง “failed replacement ยังรักษา bytes เดิม” เมื่อ provider ได้รับชื่อเดิมแล้ว [S6][S9]

## 8. สิทธิ์และ trust boundary ที่พบ

1. FE Axios ใส่ Bearer ของผู้ใช้; มี UI gate แสดงตารางเจ้าหน้าที่เมื่อ permission ขึ้นต้น `ALL:PROJECT_MANAGEMENT_STAFF.ON_GOING`. แต่ `UserRole="admin"` ใน `TabTitle` บางแห่งหมายถึงตารางสำหรับหน่วยงานรับทุน ไม่ควรเทียบชื่อ prop นี้กับ Folio Admin role [S11][S12]
2. `TabTitle` ซ่อน upload ตาม roleName ของเจ้าหน้าที่บางกลุ่ม และ disable เมื่อ Project ยกเลิก; dialog มี state/status guard ดังกล่าว. หน้า e-Form PM ซ่อนปุ่มตาม `isAccountOfficer` [S15][S18]
3. หน้า viewer มีปุ่มอนุมัติ/ส่งคืนแก้ไขให้ Admin กวค./SUPER_ADMIN และตีกลับให้ กกง./SUPER_ADMIN ตามชนิดและสถานะ เป็น client UI policy [S17]
4. **ข้อเท็จจริงจากเส้นทาง server ที่ตรวจ:** Hono upload handler ไม่อ่าน user identity/project ownership; `orpcBase` เป็น context เปล่า; ECM route handlers ไม่มี middleware auth/role; OpenAPI handler ที่อ่านมี plugins CORS/headers/docs. ไม่เห็นการผูกเลขยืนยัน/ปี/category กับ Project ที่ผู้ใช้มีสิทธิ์ก่อนใช้ ECM service credential [S5][S19]
5. **[INFERENCE] ความเสี่ยงความปลอดภัย:** การซ่อน UI และการส่ง Bearer ไม่เท่ากับ backend authorization. หากไม่มี gateway ภายนอก อาจเข้าถึง upload/search และ route จัดการ token ของบริการได้โดยไม่มีนโยบายสิทธิ์ที่คาดหวัง. ไม่ได้ยิง endpoint ตรวจยืนยัน และไม่ทราบ access policy ของ deployment หรือ `file_link` ที่ provider สร้าง [S19]

สำหรับ Folio ควรใช้สิทธิ์ของ backend ที่ผูกกับ Form/Response/slot ของผู้ใช้จริง และให้ Admin เป็นเจ้าของนโยบายปลายทาง; ไม่คัดลอก client-side role checks หรือเผย service token ให้ browser

## 9. จุดบกพร่อง/แนวคิดที่ควรนำไปใช้ ไม่ควรคัดลอกโค้ด

### ข้อเท็จจริงและความเสี่ยง

- **ข้อมูลปลายทางเชื่อชื่อไฟล์/ค่าจาก client:** request upload ไม่มี project ID และ server ไม่ตรวจความสัมพันธ์กับ Project ก่อนส่ง provider. Folio ต้องแยก identity ของ slot ออกจาก filename [S4][S5]
- **ชนิดไฟล์ตรวจไม่พอ:** backend template mode ตรวจชื่อ `.pdf` ไม่เห็นตรวจ signature/content PDF ใน handler; monthly UI ยอม `.doc,.docx` แต่สร้างชื่อ `.pdf` ด้วย bytes/MIME เดิม ไม่ได้แปลงเอกสาร [S5][S9]
- **ขนาดขอบเขตไม่เท่ากัน:** FE ตรวจ file 50 MiB แต่ BE จำกัด multipart body ทั้ง request 50 MiB; [INFERENCE] ไฟล์ใกล้เพดานอาจถูกปฏิเสธเพราะ overhead [S5][S6]
- **ไม่มี transaction ข้าม ECM กับ metadata:** ห้ามใช้รูปแบบ upload-then-POST จาก browser เป็นหลักฐานการรับรอง atomic replacement [S6][S8][S9]
- **ชื่อไฟล์ซ้ำ/ความหมายหลากหลาย:** บางหน้า strip hyphen บางหน้าไม่ strip; มี fallback เลข Project ID; บางหน้าเลือกหลายไฟล์แต่ได้ชื่อเดียวกันต่อชนิด/ไตรมาส. [INFERENCE] มีความเสี่ยงชนกัน และไม่มีหลักฐาน provider จะรับประกันประวัติให้ [S6][S9][S14]
- **source มี token-management routes และ response logging:** ไม่ควรย้ายรูปแบบนั้นเข้า Folio โดยตรง; findings นี้ไม่บันทึกค่า token/ข้อมูลจริง [S5][S12][S19]

### แนวคิดใช้ซ้ำได้

- ให้ระบบธุรกิจแยก `document type`, ปี, เลขอ้างอิง และ scope งวด/เดือนออกจากชื่อไฟล์ แม้ตอนส่ง provider จะประกอบเป็นชื่ออีกที [S3][S7]
- แยกข้อมูลจาก provider ออกจาก metadata ที่แอปเป็นเจ้าของ และแยก “เลือกไฟล์” จาก “ยืนยันส่ง” [S3][S4]
- เก็บความสัมพันธ์หลายเอกสารภายใต้หน่วยงานธุรกิจหนึ่งหน่วยได้ แต่ไม่ต้องเอา Project schema มาครอบ Response ของ Folio [S7]
- ใช้ version/record ใหม่เมื่อมีประวัติ แต่ต้องเก็บ identity ที่ชี้ bytes เดิมได้จริง ไม่ใช่พึ่งชื่อหรือลิงก์ latest [S9][S10]

## 10. คำถามที่ Folio ยังต้องตอบก่อน spec พร้อม implementation

นี่คือข้อเสนอเพื่อปิดช่องว่าง ไม่ใช่คำตอบที่ Ongoing บังคับ:

1. **Admin ตั้งค่าระดับใด?** ทั้งระบบ, Form, Revision, ช่อง scalar/column หรือมีค่า override ระดับ row? ใครแก้ได้ และแก้แล้วมีผลกับ Draft เดิมหรือเฉพาะงานใหม่?
2. **เลขที่หนังสือยืนยันมาจากไหน?** Admin กำหนด, ฟิลด์คำตอบ, การเลือก Project จาก backend หรือค่าอื่น? ค่าอยู่ระดับ Form/Response/แต่ละ table row หรือเอกสารย่อย? ใครตรวจความถูกต้องและใครแก้ได้?
3. **ปีงบประมาณมาจากไหน?** ค่าตั้งเอง, ข้อมูล Project, คำตอบ หรือ catalog ของ provider? ไม่ควร derive จากเลขโดยไม่มี contract.
4. **ปลายทางเป็น ID หรือข้อความ?** จะมี provider-fed catalog ที่ตรวจสิทธิ์ได้จริงหรือไม่? ถ้าเป็น static allowlist ใครรับผิดชอบรายการและการเปลี่ยนชื่อ? คำว่า ECM/DCM ตรงกับระบบไหน?
5. **จะใช้โหมดใด?** `template=1` ต้องทราบกฎ parser/naming จากเจ้าของ provider; `template=0` ต้องยืนยันความหมาย/สิทธิ์ของปี เลข หมวด. Ongoing UI ไม่ได้พิสูจน์การทำงานของโหมดหลัง.
6. **identity ของไฟล์คืออะไร?** ต้องแยก slot `(Response, binding, stable row identity)` จากชื่อที่แสดง และจาก provider token/path/version. ลบ/แทรก/เรียง table row ใหม่ต้องไม่ทำไฟล์ข้ามแถว.
7. **การแทนไฟล์รักษาประวัติอย่างไร?** ยืนยันว่า provider คืน immutable identity/bytes รุ่นเดิม หรือ Folio ต้องเก็บ bytes สำรอง. ห้ามพึ่ง latest-by-document-number สำหรับ Submission/Correction เก่า.
8. **failed replacement เก็บไฟล์เก่าได้อย่างไร?** เลือก protocol ที่ไม่ทำลายของเดิมก่อน commit สำเร็จ; ตัดสินใจว่า upload สำเร็จแต่ Save/Submit ล้มเหลวจะกู้/cleanup อย่างไร โดยไม่ลบไฟล์ที่ Revision เก่าอ้างอยู่.
9. **ชื่อไฟล์หนึ่ง PDF ต่อ slot:** suffix มาจาก label หรือ stable ID? ป้องกันชื่อซ้ำระหว่าง row/Revision/Correction อย่างไรโดยยังตรงกติกาของ provider? เปลี่ยน label ต้องไม่ทำ identity หาย.
10. **สิทธิ์เปิดย้อนหลัง:** User/Admin/Viewer ใครเปิดไฟล์ของ Draft/Submission/Correction ได้? ใช้ backend download proxy หรือ provider link ที่มีอายุ/สิทธิ์อย่างไร? ไม่ให้ service credential หลุดถึง browser.
11. **Save Draft/Submit เป็นจุดเริ่ม upload:** ทั้ง scalar/table ใช้กติกาเดียวกันตามขอบเขตที่อนุมัติแล้ว; ปิด/เปลี่ยนไฟล์ก่อนกดต้องไม่สร้าง remote file. เมื่อหลาย slot สำเร็จบางส่วน UI และสถานะ Draft ต้องรายงานอย่างไร?

**คำตอบที่ยังต้องได้จากเจ้าของ provider:** hierarchy/canonical category identifier, parser template mode, same-name overwrite/version behavior, อายุและ ACL ของ file link, immutable download identity และ delete semantics. Source Ongoing ไม่พอปิดประเด็นเหล่านี้

## แหล่งอ้างอิงปฐมภูมิ

ทุก path ด้านล่างอ้าง working tree ที่อ่าน ไม่ใช่ production log. ราก FE: `/Users/pyw1tt/Desktop/Github/pdms-ongoing-project-management`; ราก BE: `/Users/pyw1tt/Desktop/Github/pdms-ongoing-backend`.

- **[S1]** FE `docs/agents/domain.md`:5–29; `GLOSSARY.md`:7–17; `docs/architecture/README.md`:76–88,118–137; `docs/adr/0001-installment-status-audit.md`:1–10. BE `docs/architecture/README.md`:76–88,118–137.
- **[S2]** BE `src/features/import-files/import.service.ts`, `ImportService`:406–408,529–546,693–697 — อ่านเลขจาก Excel, ใส่ข้อมูล Project และ create.
- **[S3]** FE `app/routes/project-information.$projectDetailId.tsx`, `loader`:70–96; `app/services/project-information.service.ts`, `getProjectInformationById`:42–53; `app/components/project-detail/DialogUploadFile2.tsx`, `DialogUploadFile2`:49–60,112–146,194–219,236–267,288–336.
- **[S4]** FE `app/services/uploadFile-ecm.service.ts`, `uploadFilesToECM`:5–43; `app/types/TUploadFile-ecm.type.ts`:1–27.
- **[S5]** BE `src/index.ts`:214–280; `src/features/ECM/ecm.route.ts`, `uploadFileRoute`:135–227; `src/features/ECM/ecm.schema.ts`:25–58; `src/features/ECM/ecm.service.ts`, `uploadFile`:252–330.
- **[S6]** FE `app/components/project-detail/ManageProject.tsx`, `TablePaperOnGoing`/`getFileSuffix`:315–455,542–628,805–812; `TablePaperOnGoingAll`:1048–1070,1147–1177,1231–1289.
- **[S7]** BE `prisma/schema.prisma`:315–328 (`FinancialReportFile`),374–383 (`EFormDocumentFiles`),417–433 (`ProjectInformationUpload`),562–584,618,650–665 (`Project`).
- **[S8]** FE `app/services/project-information.service.ts`, `uploadProjectInformationFile`:74–98. BE `src/features/pages/project-information-id/project-information.service.ts`, `createUpload`:148–173, `updateFile`:175–220; `project-information.schema.ts`:8–25; `src/features/pages/e-form-id/e-form-id.service.ts`, `createUploadFiles`:304–353; `e-form-id.schema.ts`:46–58; `e-form-id-route.ts`, `createUploadFileRoute`:142–186.
- **[S9]** FE `app/components/financial-report-view/DialogUploadFinancialReportFiles.tsx`, `DialogUploadFinancialReport`:40–93,113–155,159–209,269–276,358–372. BE `src/features/pages/financial-report-id/financial-report.service.ts`, `createUploadFile`:156–255, `updateFile`:259–321; `financial-report.schema.ts`:94–113.
- **[S10]** FE `app/components/project-detail/ApproveProject.tsx`, `TableRelatedResolutions`:67–89, `fetchECMData`:187–219; `app/services/project-information.service.ts`, `getEcmSearchData`:325–351. BE `src/features/ECM/ecm.service.ts`, `getLatestFile`:48–60, `getFileLink`:332–394, `searchFile`:396–434; `ecm.route.ts`:229–327.
- **[S11]** FE `app/components/project-detail/ManageProject.tsx`, `ManageProject`:177–235, `TablePaperOnGoing`:838–917, `TablePaperOnGoingAll`:1140–1146.
- **[S12]** FE `app/services/api.ts`:6–10; `app/lib/API.ts`, `authRequestInterceptor`:34–48, Axios wiring:245–280. BE `src/features/ECM/ecm.service.ts`, `isTokenValid`:70–97, `loginToECM`:99–149, `getValidToken`:155–173, `callECMApi`:178–219.
- **[S13]** FE `app/components/project-Information/index.tsx`, `fetchFilterOptions`/`yearJob`:256–291; `app/services/project-information.service.ts`:56–72. BE `src/features/pages/project-information/project-information.service.ts`, filter options:474–518.
- **[S14]** FE `app/components/e-form/DialogUploadFileEFormOfficer.tsx`:97–123,175–207,234–274,329–368; `app/components/financial-report-view/DialogUploadIFle.tsx`:158–175,251–295,350–360; `app/components/e-form/TableEFormIdOfficer.tsx`:243–290; `app/components/e-form/TableEFromId.tsx`:217–238.
- **[S15]** FE `app/components/project-detail/ManageProject.tsx`, `TabTitle`:2148–2198,2218–2263.
- **[S16]** FE `app/components/project-proposal/TableProjectProposal.tsx`, `handleUploadScreeningFourFile`:133–207; UI ที่ซ่อน:585–614.
- **[S17]** FE `app/routes/project-information.view.tsx`, `clientLoader`:37–88, `roleBtn`:347–435, `ProjectView`:451–470.
- **[S18]** FE `app/components/e-form/TableEFormIdOfficer.tsx`:292–357 — conditional render ตาม `isAccountOfficer`.
- **[S19]** BE `src/index.ts`:44–46,80–113,214–280,455–459; `src/shared/orpc/base.ts`:1–6; `src/shared/orpc/handlers.ts`, `createOpenApiHandler`:8–16; `src/features/ECM/ecm.route.ts`:11–134,178–227,292–327; `ecm.schema.ts`:7–12.

## สิ่งที่ไม่ได้ทำและความเสี่ยงที่ต้องทราบ

ไม่ได้แก้ application, map หรือตั๋ว ไม่รัน tests/build/lint ไม่ login/upload/delete ECM ไม่อ่านข้อมูล DB หรือ secrets และไม่ตรวจ endpoint จริง. ยังต้องยืนยัน provider contract โดยเฉพาะการ overwrite ชื่อเดิม ประวัติ bytes และสิทธิ์ link ก่อนสรุปว่า Folio รักษาไฟล์เดิม/Submission/Correction ได้ครบ.
