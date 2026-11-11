# ผลวิจัย ECM API สำหรับไฟล์แนบ Excel ของ Folio

วันที่สำรวจ: 2026-11-11  
ขอบเขต: ตอบคำถามใน “ข้อเท็จจริง ECM: login และความสามารถจัดการไฟล์” จาก public documentation และ source เท่านั้น ไม่ใช่ implementation หรือผลทดสอบระบบจริง
Branch: `research/folio-ecm-api-20261111`  
ฐาน Folio HEAD: `318d0d89a0f57f06dc0317304646e03f97ab6a35`  
Backend HEAD ขณะอ่าน: `e51f2245fab13d55676de46ceb4781903ec41470` — อ่าน working-tree source ตามตำแหน่งด้านล่าง ไม่ได้ตรวจความสะอาดของ working tree

## ข้อสรุป

1. Public collection มีห้าคำขอ: Login, Document Category, Search, UploadFile และ Delete ข้อมูลนี้ยืนยันสิ่งที่เอกสารเผยแพร่ ไม่ใช่รายการ endpoint ทั้งหมดของผู้ให้บริการ [P0]
2. เอกสารระบุว่า token อายุ 15 วัน และเปลี่ยนทุกครั้งที่ login; การ login ก่อนหมดอายุหนึ่งวันเป็นนโยบายของ Ongoing ไม่ใช่ข้อกำหนด ECM [P1, S1]
3. Search รับชื่อไฟล์หรือ directory path; มี root `DMS/ShareFiles` แต่ยังไม่พบสัญญา list-folder/create-folder หรือวิธีเลือก arbitrary folder ผ่าน upload ในเอกสารชุดนี้ [P3, P4]
4. Delete ใช้ `file_token` ไม่ใช่ชื่อไฟล์ และไม่ใช่ login bearer token [P5]
5. Upload documentation ระบุ `data` เป็น array แต่ Ongoing output schema บังคับเป็น object จุดนี้ต้องได้ตัวอย่าง response ที่ปกปิดข้อมูลแล้วจากเจ้าของ API ก่อนกำหนด parser ของ Folio [P4, S3]
6. ยังไม่มีหลักฐานรับรอง atomic replacement, พฤติกรรมชื่อซ้ำ, version retention หรือ idempotency การเรียก upload ตามด้วย delete จึงยังไม่พิสูจน์ว่าจะรักษาไฟล์ร่างเดิมและประวัติ Submission/Correction ได้ [P0–P5]
7. พบข้อความที่มีลักษณะเป็น credentials ใน metadata ของเอกสาร public ไม่บันทึกค่าหรือชื่อบัญชีในผลวิจัย ไม่ได้ทดลองว่าใช้งานได้ และไม่ยืนยันว่าเกี่ยวข้องกับ environment ของผู้ใช้ ควรให้เจ้าของเอกสารทบทวนการเผยแพร่และประเมินการเพิกถอน/หมุน credentials [P0]

## แหล่งหลักและขอบเขตความน่าเชื่อถือ

### Public contract ที่อ่านได้

- [P0: AquilaAPI public documentation](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1)
- [P0-JSON: public collection JSON](https://documenter.getpostman.com/api/collections/3763886/2sAYHxnPG1?segregateAuth=true&versionTag=latest) — อ่านเฉพาะ metadata โครงสร้าง, request descriptions, ชื่อ field และ response shape โดยไม่เผยแพร่ auth values, request values ที่อ่อนไหว หรือ collection description เต็ม
- [P1: Login](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#ddd43b30-ffec-4b3f-9213-88f349139f3b)
- [P2: Document Category](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#c0127451-d895-41dc-83b0-ea74dfb69e57)
- [P3: Search](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#2155b17a-72a4-4c5c-affc-3ecb01aaac72)
- [P4: UploadFile](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#5a6ac7ac-1df3-49e6-a515-4dadfa024a78)
- [P5: Delete](https://documenter.getpostman.com/view/3763886/2sAYHxnPG1#0bb164e9-85fc-4886-9227-12c6f8c1d8e7)

หน้า HTML ผ่าน reader ให้เพียง metadata ไม่ได้แสดงรายละเอียด endpoint การดึงด้วย Python HTTP ได้ 403 แต่ public JSON ผ่าน reader แบบ raw อ่านได้ครบ จึงไม่ถือว่าเอกสารเข้าไม่ถึง ไม่จำเป็นต้อง login หรือ render browser และไม่ได้เก็บสำเนา raw collection ลง repository

JSON มี response example หนึ่งรายการของ Document Category โดยระบุ HTTP 200; ไม่พบ response examples ของ Login, Search, UploadFile หรือ Delete ใน collection นี้ จึงไม่ถือว่าคำอธิบาย field เป็นหลักฐานของ response ที่เคยสำเร็จจริง และไม่ใช้ตัวอย่าง category เป็นหลักฐาน HTTP status ของ endpoint อื่น

### Source ของ Ongoing

ตำแหน่ง local อยู่ใต้ `/Users/pyw1tt/Desktop/Github/pdms-ongoing-backend/`; ลิงก์ระบุ revision สำหรับตามอ่าน โดยหลักฐานที่ตรวจจริงคือ working-tree source:

- [S1: `src/features/ECM/ecm.service.ts`](https://github.com/AtiwatAtAquila/pdms-ongoing-backend/blob/e51f2245fab13d55676de46ceb4781903ec41470/src/features/ECM/ecm.service.ts#L11-L448): `BeeECMFile`/`SearchResponse` L11–28, cache/`getLatestFile` L30–61, `isTokenValid` L70–97, `loginToECM` L99–149, `getValidToken` L155–173, `callECMApi` L178–219, cache administration L224–250, `uploadFile` L252–330, `getFileLink` L332–394, `searchFile` L396–434
- [S2: `src/features/ECM/ecm.route.ts`](https://github.com/AtiwatAtAquila/pdms-ongoing-backend/blob/e51f2245fab13d55676de46ceb4781903ec41470/src/features/ECM/ecm.route.ts#L11-L327): login/token routes L11–133, `uploadFileRoute` L135–228, `getFileLinkRoute` L229–265, `searchFileRoute` L267–317
- [S3: `src/features/ECM/ecm.schema.ts`](https://github.com/AtiwatAtAquila/pdms-ongoing-backend/blob/e51f2245fab13d55676de46ceb4781903ec41470/src/features/ECM/ecm.schema.ts#L7-L68): login/token L7–21, upload input L25–32, file/output L35–58
- [S4: `src/features/ECM/ecm.errors.ts`](https://github.com/AtiwatAtAquila/pdms-ongoing-backend/blob/e51f2245fab13d55676de46ceb4781903ec41470/src/features/ECM/ecm.errors.ts#L10-L22) และ [`src/shared/axios-helper/axios.err.ts`](https://github.com/AtiwatAtAquila/pdms-ongoing-backend/blob/e51f2245fab13d55676de46ceb4781903ec41470/src/shared/axios-helper/axios.err.ts#L3-L20): domain error classes และการดึงข้อความจาก upstream response
- [S5: `docs/architecture/README.md`](https://github.com/AtiwatAtAquila/pdms-ongoing-backend/blob/e51f2245fab13d55676de46ceb4781903ec41470/docs/architecture/README.md#L3-L136): L3–4 แยก current/planned, L28 แยก BE AUTH, L30–84 ระบุ flow ที่พบจาก source, L86–130 เป็น flow เป้าหมาย
- [F1: Folio `CONTEXT.md`](https://github.com/AquilaStudio2/folio-forms/blob/318d0d89a0f57f06dc0317304646e03f97ab6a35/CONTEXT.md#L87-L109) และ [F2: `docs/ARCHITECTURE.th.md`](https://github.com/AquilaStudio2/folio-forms/blob/318d0d89a0f57f06dc0317304646e03f97ab6a35/docs/ARCHITECTURE.th.md#L21-L60): Draft, Submission, Correction และหลักการรักษาประวัติ

CodeGraph ถูกใช้ก่อนสำรวจ code flow ทั้งสอง repo แต่ผลแรกตัดบางส่วนของ service/route และมี source rendering ที่ไม่ครบ จึงอ่านเฉพาะส่วนที่ขาดจากไฟล์จริง ไม่ถือว่า graph หรือชื่อ method เป็นหลักฐาน runtime

## 1. Login และวงจร token

### ข้อเท็จจริงจาก public contract

- `POST /api/beeecm/public/login`; collection ระบุ `noauth`; body เป็น JSON object มี `username`, `password` ทั้งคู่ required, string ความยาวที่เอกสารระบุ `min: 0, max: 256` [P1]
- Response wrapper: `status: Integer`, `msg: String`, `data: Object` ที่มี `username: string`, `fullname: string`, `token: string`, `expire: datetime` [P1]
- Token มีอายุ 15 วัน ต้อง login ใหม่ และ token เปลี่ยนทุกครั้งที่ login เอกสารไม่ได้ระบุว่า token เก่าถูก revoke ทันทีหรือยังใช้ร่วมกันได้ [P1]
- Endpoint อื่นทั้งสี่ระบุ required bearer token ความยาวสูงสุด 512 ไม่ใช่การส่ง Folio User session ไป ECM [P2–P5]
- ไม่พบ refresh-token, logout/revoke endpoint, timezone/รูปแบบ `expire`, clock-skew allowance หรือรหัส error เมื่อ token หมดอายุใน collection นี้ [P0-JSON]

### พฤติกรรมที่ Ongoing เขียนไว้

- `loginToECM` ส่ง JSON ผ่าน axios โดยอ่าน `ECM_API_URL`, `ECM_USERNAME`, `ECM_PASSWORD` ฝั่ง server; อ่าน `response.data.data` แล้วแปลง `expire` ด้วย `new Date(...)` โดยไม่มี runtime schema ตรวจ upstream ก่อน cache [S1 L99–149]
- Cache เป็นตัวแปรระดับ module `cachedToken`; `isTokenValid` ยอมใช้เมื่อเหลือมากกว่า 24 ชั่วโมง นโยบายนี้ไม่ใช่ expiry จริงของ ECM [S1 L30–46, L70–97]
- `getValidToken(forceRefresh)` ใช้ cache หรือ login ใหม่ และ force refresh ล้าง cache ก่อน login ไม่พบ single-flight/lock ของ login ใน service นี้ [S1 L155–173]
- `callECMApi`, upload และ search/get-link เมื่อได้ HTTP 401 จะ login ใหม่และลองซ้ำได้หนึ่งครั้ง ไม่มีหลักฐานจาก public docs ว่า 401 เป็น error contract เดียวที่ควรใช้ตัดสิน token invalid [S1 L178–219, L252–434]
- Ongoing มี wrapper routes `/login`, `/token`, `/token/info`, `/token/clear`; สอง route แรกส่ง token ออกทาง response ส่วน clear ล้าง local cache ไม่ได้ revoke token ที่ ECM [S2 L11–133; S1 L224–250] ไม่ได้ตรวจ global authorization/mounting ในงานนี้ จึงไม่สรุปว่า route เหล่านี้เข้าถึงได้โดยไม่มีสิทธิ์

**ข้ออนุมาน:** cache แบบ module-local ไม่ประสานหลาย process/replica; หลาย request ที่ cache miss อาจ login พร้อมกัน หาก login ใหม่ยกเลิก token เก่าจริง อาจเกิดการรบกวนกัน แต่พฤติกรรม revoke ยังไม่ทราบ ห้ามสรุปว่าเกิดเหตุนี้แล้ว

## 2. Upload: request, response และปลายทาง

### Public contract

`POST /api/beeecm/public/file`, bearer auth, `multipart/form-data` [P4]:

| Field | หลักฐานในเอกสาร |
| --- | --- |
| `documentFile` | File, required |
| `template` | Boolean, optional, default `false`; `true` ใช้อัปโหลดตามเงื่อนไขจากชื่อ |
| `documentYear` | String ความยาว 4; `sometimes` เมื่อ `template=false` |
| `documentNumber` | String สูงสุด 512; `sometimes` เมื่อ `template=false` |
| `documentCategory` | String สูงสุด 512; `sometimes` เมื่อ `template=false`; อ้างอิง Document Category |

เอกสารไม่ได้ใช้คำว่า required สำหรับสาม field สุดท้ายแบบเดียวกับ `documentFile`; Ongoing route บังคับให้ครบเมื่อ standard mode จึงต้องแยกความเข้มงวดของ wrapper ออกจากสัญญาที่เขียนไว้ [P4, S2 L178–206]

Response ระบุ `status: Integer`, `msg: String`, `data: Array` ของ file object: `file_name`, `file_size`, `file_type`, `file_title`, `file_descrip`, `file_path`, `file_datetime_edit`, `file_token`, `file_link` ส่วนใหญ่ระบุ String และ `file_datetime_edit` เป็น datetime ไม่มีตัวอย่างผล upload จริงใน collection นี้ [P4]

ไม่พบ field `folderId`, `folderPath`, filename override แยกจาก multipart filename, revision, checksum หรือ idempotency key ใน request ที่เผยแพร่ และไม่มีรายละเอียด algorithm ที่ parse ชื่อเมื่อ `template=true` การที่เอกสารระบุ root `DMS/ShareFiles` ไม่แปลว่าผู้เรียกกำหนด path ใดก็ได้ [P4]

### สิ่งที่ Ongoing ทำต่างหรือสมมติไว้

- Wrapper รับ `file` และ `fileName` แล้ว append เป็น `documentFile` พร้อม multipart filename; ส่ง `template` เป็นข้อความ `"1"`/`"0"` ไม่ใช่คำว่า `true`/`false` แบบ example ใน public collection [S1 L268–290; S3 L25–32; P4] เอกสารบอกชนิด Boolean แต่ไม่แจกแจง wire values ที่รับทั้งหมด
- เมื่อ standard mode จะส่ง year/number/category เฉพาะที่มีค่า service เตือนเมื่อขาดแต่ไม่ reject เอง; route เป็นจุดที่ reject [S1 L280–290; S2 L200–206]
- `uploadFile` รับเฉพาะ HTTP 200 เป็น success และคืน `response.data` โดยไม่ตรวจ body `status`; HTTP 201/202 แม้เป็น 2xx จะเข้า error ตาม source นี้ [S1 L296–325] ไม่มีหลักฐานใน public docs ว่า upload รับรอง HTTP 200 เท่านั้น
- `ECMUploadFileOutputSchema.data` บังคับ `ECMFileSchema` หนึ่ง object; array/null ถูก comment ออก ต่างจาก public contract ที่บอก array นอกจากนี้ schema บังคับ `file_create` ซึ่ง public response field list ไม่ได้ระบุ [S3 L35–58; P4]
- Schema ของ Ongoing อนุญาต `file_title`/`file_descrip` เป็น optional/null แต่เอกสารระบุ String โดยไม่ได้อธิบาย nullable ความต่างนี้ยังไม่ชี้ว่าฝ่ายใดตรง deployment ปัจจุบัน [S3; P4]
- Log ระบุ `template: options.template ?? true` แต่ actual payload ใช้ truthiness ซึ่ง omitted value กลายเป็น `"0"`; log จึงอาจไม่สะท้อนค่าที่ส่งเมื่อ service caller ไม่ส่ง template [S1 L260–278]

## 3. หมวดเอกสาร, browse/search และ folder

- `GET /api/beeecm/public/document/category` ใช้ bearer; ไม่มี request fields ในตาราง; response fields ระบุ wrapper `status/msg/data` โดย `data` เป็น array ของ `{ id: number, type: string }` [P2]
- Upload ระบุ `documentCategory` เป็น string และตัวอย่างใช้ชื่อหมวด ไม่ใช่ numeric id จึงไม่ควรส่ง category id แทนโดยไม่มีหลักฐานเพิ่ม [P2, P4]
- `POST /api/beeecm/public/search` ส่ง JSON `{ text: string }`, required, ความยาว 3–2048 ใช้ชื่อไฟล์หรือ path directory ได้; root ที่เอกสารระบุคือ `DMS/ShareFiles` [P3]
- Search response เป็น `status/msg/data` โดย `data` เป็น array ของ file metadata รูปเดียวกับเอกสาร upload ไม่พบ pagination, sort guarantee, exact/prefix/substring semantics, recursion หรือ folder-object schema [P3]
- Ongoing `searchFile(documentNumber)` เพียงส่ง `text: documentNumber`; ชื่อ parameter ไม่ได้ทำให้ ECM contract กลายเป็น search-by-confirmation-document-number แบบ exact match [S1 L396–434]
- Ongoing `getFileLink(documentNumber)` เรียก search เช่นกัน แล้วเลือกไฟล์ที่ `file_datetime_edit` ล่าสุด หากไม่พบจะ error ไม่ใช่การค้นด้วย immutable file identity [S1 L48–61, L332–394]
- ใน service/route ที่ได้รับมอบหมายไม่พบ wrapper ของ category, folder listing/creation, rename หรือ delete; public docs มี category และ delete แม้ wrapper นี้ไม่มี จึงใช้การไม่พบ wrapper พิสูจน์ว่า upstream ไม่มี endpoint ไม่ได้ [S1 L436–445; S2 L319–327; P2, P5]

**ยังไม่ทราบ:** category เท่ากับ folder หรือเป็นกฎ routing, การเรียงปีงบประมาณก่อน folder, parent-child structure, สิทธิ์แต่ละ directory, การสร้าง directory อัตโนมัติ และความสัมพันธ์ชื่อ ECM/DCM กับระบบจัดเก็บจริง ต้องให้เจ้าของ API/ผลวิจัย DCM ยืนยัน ไม่ตัดสินจากชื่อ field

## 4. Read/download, identity และชื่อไฟล์ซ้ำ

- Public Search/Upload ให้ `file_token`, `file_link`, `file_path`, `file_name`; Delete ระบุให้ใช้ File Token จึงมีหลักฐานว่า `file_token` เป็น identifier สำหรับ delete แต่ยังไม่มีสัญญาว่า immutable ตลอดอายุไฟล์หรือข้าม replacement [P3–P5]
- ไม่พบ dedicated read/download-by-id endpoint ในห้าคำขอที่เผยแพร่; `file_link` เป็นทางเข้าถึงที่มีหลักฐานใน metadata เท่านั้น ยังไม่รู้ว่าต้อง bearer/cookie, เป็น public URL หรือ signed URL, หมดอายุเมื่อไร, redirect ไปไหน หรือรองรับ download headers/range request อย่างไร [P0-JSON, P3, P4]
- Ongoing ส่ง URL ของผล search ล่าสุดกลับผู้เรียก ไม่ได้ fetch binary หรือพิสูจน์ authorization ของ URL ใน `getFileLink` [S1 L376–389]
- ไม่พบคำรับรอง uniqueness ของชื่อใน folder, case sensitivity, Unicode normalization, ชื่อไทย/อักขระห้ามใช้, maximum filename/path length, overwrite/auto-rename/reject เมื่อชื่อซ้ำ หรือ consistency หลัง upload [P3, P4]

**ข้ออนุมานสำหรับ Folio:** search ด้วยเลขหนังสือแล้วเลือกไฟล์ล่าสุดไม่เพียงพอสำหรับอ้างอิงหนึ่ง scalar slot/หนึ่ง table-row slot หรือ Revision เก่า อาจเลือกไฟล์คนละช่อง/คนละผลส่งที่ใช้เลขเดียวกัน จึงต้องรู้ identity ของไฟล์ที่อัปโหลดสำเร็จจริง และอายุการคงอยู่ของ identity นั้นก่อนออกแบบ ไม่ใช่เพิ่มการ sort เพื่อแก้ปัญหา [S1; F1]

## 5. Delete, replace, rename และ atomicity

### สิ่งที่เอกสารยืนยัน

`DELETE /api/beeecm/public/file?token=<file_token>` ใช้ bearer authentication; query `token` เป็น required String ความยาว 64 ซึ่งเอกสารเรียกว่า File Token Response fields ระบุ `status: Integer`, `msg: String`, `data: Null` [P5]

นี่เป็นคนละ token กับ login token ใน Authorization ห้ามสับสน และควรระวัง identifier ใน URL/log ไม่พบ semantics เมื่อไฟล์หายไปแล้ว, soft/hard delete, trash/restore, retention, duplicate DELETE, authorization หรือ concurrent access ในคำอธิบายนี้ [P5]

### สิ่งที่ยังยืนยันไม่ได้

- ไม่มี named replace/rename endpoint หรือเงื่อนไข update-by-file-token ใน collection นี้ ไม่ได้แปลว่าไม่มีบริการดังกล่าวนอกเอกสาร
- ไม่มีเงื่อนไข compare-and-swap, transaction, version id, checksum, idempotency หรือ atomic multi-operation ที่ผูก upload/delete/DB ของ Folio เข้าด้วยกัน
- ไม่มีหลักฐานว่า upload ชื่อเดิมสร้างไฟล์ใหม่โดยไม่แตะ byte/token/link ของไฟล์เก่า
- ไม่มีหลักฐานว่า response timeout แปลว่าไม่ได้สร้างไฟล์ หรือ delete error แปลว่าไฟล์ยังอยู่แน่นอน

### ผลต่อข้อกำหนดรักษาไฟล์เดิมและประวัติ — ข้ออนุมาน ไม่ใช่การตัดสิน flow

- Delete-before-upload มีช่วงที่ไฟล์เดิมถูกลบแล้วแต่ไฟล์ใหม่อาจไม่สำเร็จ จึงไม่เป็นหลักฐานรองรับข้อกำหนดรักษาไฟล์เมื่อ replacement ล้มเหลว
- Upload-before-delete จะปลอดภัยต่อไฟล์เดิมก็ต่อเมื่อ upload ไม่ overwrite object เดิม หากชื่อชนแล้ว overwrite การสลับลำดับอย่างเดียวไม่พอ
- แม้ upload เป็น object ใหม่ การ update reference ใน Folio และ delete ที่ ECM เป็นคนละระบบ ยังมีช่วงล้มเหลว/ผลไม่แน่นอน ต้องนิยาม completion และวิธี reconcile โดยไม่รายงานว่าสำเร็จขณะไฟล์เก่าที่ต้องลบยังค้าง
- ไฟล์ที่ Submission/Correction เก่าอ้างถึงไม่ใช่ orphan ของ Draft; ห้ามตีความการเปลี่ยน Draft ว่าอนุญาตให้ลบไฟล์ประวัติ [F1, F2]
- ต้องแยกไฟล์เก่าที่ลบได้จริงออกจากไฟล์ที่ประวัติยังใช้ ก่อนเลือกลำดับ upload/delete หรือออกแบบ retry ประเด็นนี้ไม่ได้ตัดสินว่าผู้ใช้ควรเลือก policy ใด

## 6. PDF/size validation และ error semantics

### Validation ที่มีหลักฐาน

- Public upload ระบุเพียง File ไม่ได้ระบุ PDF-only, MIME allowlist, signature/content validation, malware scanning, encrypted-PDF policy, จำนวนหน้า หรือขนาดสูงสุด [P4]
- Ongoing template mode ตรวจ filename ด้วย `/^กทอ\..+\.pdf$/i` เท่านั้น ไม่ใช่การตรวจว่า bytes เป็น PDF; standard mode ไม่มี filename PDF regex ใน route ที่อ่าน [S2 L180–206]
- Input schema ใช้ `file: S.Any`, `fileName: S.String` และ metadata strings แบบ optional/nullable ไม่มี file-size limit หรือ validation ของ bytes [S3 L25–32]
- Axios upload ตั้ง `maxBodyLength` และ `maxContentLength` เป็น `Infinity`; นี่เป็นการไม่จำกัดใน axios call นี้ ไม่ใช่หลักฐานว่า ECM, proxy หรือ wrapper server รับขนาดไม่จำกัด [S1 L296–304]

### Error ที่เอกสารบอก กับ error ที่ Ongoing ใช้

- Public docs นิยาม `status` ใน JSON ว่า return status code และ `msg` เป็นคำอธิบาย แต่ไม่มี catalog, ความสัมพันธ์ body status กับ HTTP status, error examples หรือ retry guidance ของ login/search/upload/delete [P1, P3–P5]
- Ongoing login ใช้ axios default status handling แล้วอ่าน body; upload รับทุก HTTP status ก่อนตรวจ 401/200; search/get-link รับเฉพาะ 200/401; generic `callECMApi` ยอมรับ 2xx/401 [S1]
- Service ไม่ตรวจ business status ใน JSON ก่อนคืนผล upload/search; `searchFile` คืน `response.data?.data ?? []` จึงอาจทำให้ missing data ดูเหมือนผลค้นหาว่าง ส่วน get-link เปลี่ยนไม่มีไฟล์เป็น error [S1 L317–325, L376–389, L426–430]
- Route map ECM login/API/search failures เป็น `INTERNAL_SERVER_ERROR` ส่วน validation มีเส้นทางแยก ไม่ควรตีความ wrapper status ว่าเป็น upstream error contract [S2 L219–224, L247–264, L283–313]
- `getAxiosErrorMessage` อาจคืน upstream body/message/error หรือ JSON stringify ของ response; service/route มีการ log error objects และ upload response ทั้งก้อน [S1 L310, L337–344; S2 L217; S4] จึงต้องประเมินข้อมูลรั่วก่อนนำ pattern ไปใช้

## 7. สิ่งที่ Folio ควรประเมิน ไม่ใช่คัดลอก Ongoing

รายการนี้เป็นข้อเสนอทางวิศวกรรม ไม่ใช่การอนุมัติ product decisions หรือ implementation:

1. เก็บ credentials/token ฝั่ง server และไม่สร้าง user-facing token endpoints ตาม wrapper เดิมโดยอัตโนมัติ ตรวจ authorization ตาม Folio User/Admin/Viewer และความเป็นเจ้าของไฟล์แยกจากสิทธิ์ service account
2. ตรวจ login envelope, token และ datetime ก่อน cache; ตกลง timezone และ refresh skew จากสัญญาจริง แทน hardcode “หนึ่งวัน” โดยไม่ทราบอายุ token ที่ deployment ใช้
3. พิจารณา single-flight login และวิธีรับมือหลาย replica หลังทราบว่า login ใหม่ revoke token เก่าหรือไม่ ไม่เพิ่ม distributed cache ล่วงหน้าเพียงเพราะ Ongoing มี cache
4. กำหนด timeout และ error taxonomy ที่แยก auth, validation, missing file, transient failure และ unknown outcome; อย่าแปลง upstream failure เป็น empty search หรือคัดลอก response/error ที่อาจมี secrets กลับ UI
5. จำกัด log เป็น operation/status/correlation ที่จำเป็น; redact Authorization, login bodies, file tokens, private links, response bodies และชื่อ/เลขเอกสารที่อาจอ่อนไหว ไม่เก็บ raw axios error
6. อย่าลอง upload/delete ซ้ำแบบทั่วไปจนรู้ idempotency/ผลหลัง timeout การ retry upload จาก stream ยังต้องรับรองว่าสามารถอ่าน payload ซ้ำได้ Ongoing รับทั้ง Buffer/ReadableStream แต่ไม่มี replay guarantee ใน method นี้ [S1 L36–43, L312–314]
7. ตรวจ PDF content และ size ที่ trust boundary ของ Folio ตามขอบเขตหนึ่ง PDF ต่อ slot; ขอ upstream limits ก่อนกำหนดค่าจริง อย่ายึดนามสกุลและ `Infinity` เป็น validation policy
8. เลือก parser upload จากหลักฐาน response จริงที่ปกปิดข้อมูลแล้ว ไม่ยอมรับ object/array ทุกแบบเพียงเพื่อกลบความขัดแย้งของเอกสารกับ schema
9. ใช้ exact uploaded-file reference และรักษาความสัมพันธ์กับ Revision; อย่าใช้ latest search เป็น identity ของไฟล์แนบในประวัติ ทบทวนสิทธิ์ของ download link ก่อนเปิดให้ browser
10. ประเมิน flow replacement หลังทราบ collision/version/delete semantics ต้องรักษาไฟล์เดิมเมื่อไม่สำเร็จ และรักษาไฟล์ประวัติ ไม่ยกระดับ upload สำเร็จเป็น Save Draft/Submit สำเร็จโดยไม่รอ lifecycle ของ Folio [F1, F2]

## 8. คำถามที่ยังเปิดและหลักฐานขั้นต่ำถัดไป

ขอ contract clarification หรือตัวอย่างที่เจ้าของ API ปกปิดข้อมูลแล้วก่อน หากยังตอบไม่ได้จึงเสนอ sandbox probe แยกต่างหากที่ได้รับอนุญาต งานนี้ไม่ทำ probe หรือ login จริง

| คำถาม | หลักฐานขั้นต่ำที่ยังขาด |
| --- | --- |
| Login ทำให้ token เก่าใช้ไม่ได้หรือไม่; `expire` มี timezone ใด | คำตอบผู้ให้บริการพร้อมตัวอย่าง expiry ที่ไม่มี token/account values และ error status เมื่อ token invalid |
| Upload คืน object หรือ array; มี `file_create` หรือไม่ | HTTP status/headers ที่ไม่อ่อนไหว และ sanitized success/error bodies จาก deployment ที่ Folio จะใช้ |
| `template` รับ wire value ใด; parse filename อย่างไร | ข้อกำหนด `true/false` เทียบ `1/0`, grammar ชื่อ, required metadata และตัวอย่าง synthetic names |
| Admin เลือกปีและ folder ได้อย่างไร | category/folder contract, parent-child identifiers, mapping year/number/category ไป destination และ create-folder semantics |
| Search เป็น exact/partial/recursive หรือไม่ | provider contract พร้อม synthetic result shape, pagination, scope/permission และ read-after-write consistency |
| Identity และ file link คงอยู่แค่ไหน | อายุ/immutability ของ file token, link expiry/auth, download-by-id หรือวิธีสร้าง link ใหม่โดยไม่เลือก latest |
| Upload ชื่อซ้ำ overwrite/rename/reject อย่างไร | คำรับรอง collision semantics และผลต่อ token/link/bytes ของไฟล์เดิม รวม concurrency และ Unicode/case rules |
| มี replace/rename/version API ที่ไม่เผยแพร่หรือไม่ | endpoint contract ที่รับรอง atomicity หรือระบุชัดว่าไม่มี พร้อม retention/restore และ conditional-write support |
| Delete ซ้ำ/ไฟล์ไม่มี/timeout เป็นอย่างไร | HTTP+body error contract, hard/soft delete, idempotency และวิธีตรวจ outcome โดยไม่เดาจาก error |
| จะกู้จาก upload สำเร็จแต่ response หายได้อย่างไร | idempotency key หรือ correlation/reconciliation API ที่แยกไฟล์ใหม่ของ operation นั้นได้แน่นอน |
| PDF และขนาดที่รับจริง | provider/proxy limits, MIME/content checks, encrypted PDF และขนาด/หน่วยของ `file_size` |
| สถานะ metadata ที่คล้าย credentials ใน public docs | ให้เจ้าของเอกสารประเมินและจัดการการเผยแพร่/หมุนค่า ไม่ส่งค่ากลับใน ticket หรือ findings |

การขาดข้อเท็จจริงด้าน collision, identity, retry และ deletion เป็นอุปสรรคต่อการยืนยัน flow replacement แบบรักษาประวัติ ไม่ใช่อุปสรรคต่อการปิดงานวิจัยว่า “พบอะไรและยังต้องขอหลักฐานใด” ส่วนระดับการตั้งค่าของ Admin และแหล่ง/หน่วยเจ้าของเลขหนังสือยืนยันยังเป็น product decisions ที่งานนี้ไม่ได้เลือกแทน

## ขอบเขตที่ไม่ได้ตรวจ

ไม่ได้อ่านค่า `.env` หรือ credentials ในเครื่อง ไม่ได้ login/upload/download/delete กับ ECM จริง ไม่ได้เปลี่ยน DB หรือ application code ไม่ได้ทดสอบ endpoint permissions, HTTP failures, token expiry, name collision หรือ atomicity จริง ไม่ได้รัน build/lint/tests/formatters

เอกสาร architecture ของ Ongoing แยก flow ที่พบจาก source กับแผน BFF/service-token ในอนาคตอย่างชัดเจน จึงไม่ใช้แผนดังกล่าวยืนยัน deployment ปัจจุบัน หรือสรุปว่า ECM login เป็น PDMS BE AUTH [S5] ไฟล์ผลวิจัยนี้เป็น artifact บน research branch ที่ไม่ merge; parent เป็นผู้ปรับ ticket/map และตัดสินความพร้อมของสเปก
