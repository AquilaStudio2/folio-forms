# หลักฐานยุติ unknown upload และ DELETE ที่เชื่อถือได้

Labels: wayfinder:task Type: task Parent: ../map.md Assignee: pyw1tt Status: resolved

## Question

Human/provider จะส่ง contract และหลักฐานใดที่ผูกกับ original request จนพิสูจน์ได้ว่า unknown upload/DELETE ยุติจริง โดยแยก mutation HOLD ออกจาก postcommit cleanup warning ที่ยังใช้งาน snapshot ใหม่ได้?

Task แบบ HITL ต้องมี provider contract หรือ evidence ที่อนุมัติ ไม่ใช่ให้ผู้ดูแลรับรองด้วย checkbox/note ว่าคงเสร็จแล้ว

## หลักฐานตั้งต้นและขอบเขต

- [วงจรไฟล์ร่างและการบันทึกโดยไม่สูญหาย](../../ecm-attachments/issues/05-safe-draft-lifecycle.md) เป็น resolved owner ของ upload-before-complete-commit-before-eligible-cleanup และความต่างระหว่าง unknown batch กับ cleanup หลัง commit
- [CONTEXT: Attachment Field](../../../CONTEXT.md#attachment-field) ระบุ original receipt, sender fence และหลักฐานที่ยังขาดสำหรับ receiptless upload/uncertain dispatched DELETE; elapsed time, restart, search ว่าง, operator note ไม่ใช่ settlement
- [รายงานตาราง: Batch, failure และ cleanup](../../ecm-storage-templates/table-upload-behavior-audit.md#f-batch-failure-และ-cleanup) เป็น local/source snapshot ไม่ใช่หลักฐานว่า provider มี settlement API

## Checklist ส่งให้ human/provider

- [ ] ระบุ correlation ของ original request, provider processing window/finality และหลักฐานที่พิสูจน์ accepted/rejected/not-dispatched/finished โดยไม่ใช้การส่ง POST/DELETE ซ้ำเพื่อทดสอบผล
- [ ] แยกผลเมื่อ upload ไม่มี receipt, late receipt หลัง sender fence/cancel, known received uncommitted file และ DELETE dispatch แล้วไม่ทราบผล; ระบุสิ่งที่ provider ไม่รับรองตามจริง
- [ ] ระบุวิธียืนยัน resource/aliases และ ownership ก่อน first authorized DELETE พร้อม surviving references; sender fence ห้าม future dispatch แต่ไม่พิสูจน์ request เก่าจบแล้ว
- [ ] ระบุว่าใครตรวจ ใครมีอำนาจรับรอง และ evidence ใดเก็บอย่างคงทนให้ audit ได้หลัง restart; ไม่เพิ่ม manual unlock จาก note/token/URL ที่ operator ป้อนเอง
- [ ] Unknown canceled upload/uncertain mutation ยังคง HOLD ตาม scope จนมี proof จริง ส่วน complete committed snapshot ที่ cleanup เก่าล้ม/unknown ยังอ่าน ใช้ export และทำงานต่อได้พร้อม persistent warning ว่า old public URL อาจยังเปิดได้
- [ ] Ordinary saves/reload ต้องไม่ retry cleanup หรือทำ warning หายเอง; unknown DELETE ไม่ resend เพื่อหวังให้ได้ผลชัดเจน
- [ ] หากจำเป็นต้องทดลอง ต้องมี approved synthetic scope, no-retry/stop rule และ cleanup owner แยก Charting นี้ไม่อนุมัติ real API

## เกณฑ์คำตอบ

บันทึก provider contract/version และ human acceptance หรือ approved evidence plan พร้อม remaining HOLD แยกกัน การปิดขั้นจัดหาแผนไม่เท่ากับรับรอง settlement ผ่าน หากไม่มี contract ที่ปลอดภัยให้บันทึก insufficient/HOLD ไม่ออกแบบ unlock ปลอมเพื่อปิด ticket

## Comments

2026-11-18: ยังไม่มี settlement contract ใหม่ ไม่มี trial หรือการปลด HOLD ในงานนี้

### 2026-11-18 — pyw1tt — เริ่ม session; ตรวจหลักฐานและเสนอแผน settlement

- Claim ตาม frontier เป็น task/HITL: จัดหา contract/evidence หรือ approved evidence plan ไม่ใช่เพิ่มกลไกปลดค้างจาก checkbox/note และไม่อนุญาต live provider calls หรือ DB inspection จากการเปิดตั๋วนี้ ยังไม่ resolve
- **Canonical local owner:** อ่าน [วงจรไฟล์ร่าง Resolution](../../ecm-attachments/issues/05-safe-draft-lifecycle.md#resolution--ยืนยันร่วมกับผู้ใช้), [CONTEXT: Attachment Field](../../../CONTEXT.md#attachment-field) และ [provider-contract research](../../ecm-storage-templates/provider-contract-research.md#published-contract-safely-extracted) owner เดิมอนุญาตผู้ดูแลยืนยันได้เฉพาะเมื่อมีหลักฐานคำขอเดิมจบ/cleanup ครบ ไม่ใช่ operator note หรือ search ไม่พบ Source/docs เป็น Working Tree snapshots ไม่ใช่ deployed proof และไม่ยืนยันว่ามี unknown Production operations จริง
- **Current Source — supported เฉพาะส่วนที่อ่าน:** CodeGraph เปิด `fenceAttachmentBatch`, `settleCanceledAttachmentBatch`, `settleAttachmentFollowUp`, `fenceAttachmentFollowUp` และ `attachmentCleanupWarning`; อ่าน omitted checks ของ `deleteAttachmentCleanup` เพิ่ม พบ owned receipt/current account/generation/`requestSettledAt`, sender-fenced canceled batch และ pending cleanup ที่ยังไม่มี `attemptedAt` เป็นเงื่อนไข first DELETE ส่วน `settleAttachmentFollowUp` ไม่รับ arbitrary token/URL/note ไม่อ้างว่า API สำหรับ receiptless unknown หรือ uncertain DELETE มีอยู่แล้ว
- **Published provider document — retrieved:** ตรวจ public collection [AquilaAPI](https://documenter.getpostman.com/api/collections/3763886/2sAYHxnPG1) ได้ HTTP 200 ตรวจ inventory แบบไม่เผย login body/header credentials/tokens เวลา `2026-11-18T09:14:10.067Z` Raw response SHA-256 `db24a4d047b13ac45055dfdbb395d3a2e3ea0c04ae5240c641ea42f0392019d4`, ETag `W/"362e-/lR1dxK7MK4rZdCyDzGDyVnWE08"` ตรงกับ [snapshot เดิม](../../ecm-storage-templates/provider-contract-research.md#published-postman-snapshot) จึงไม่มี contract update จากเอกสารฉบับนี้ Provider semantic/deployed revision ยัง unavailable เก็บเฉพาะ sanitized findings ไม่เก็บ raw collection หรือ credential-bearing metadata ลง repo
- **Supported absence within this document, not global absence:** collection เดียวกันมี login/category/search/upload/delete รวม 5 endpoints ตาม canonical research ไม่มี published request-status/correlation/finality/settlement guarantee ที่ใช้ยุติ receiptless unknown หรือ uncertain DELETE ได้ Search ว่าง/GET ไม่พบ/เวลาผ่าน/HTTP success ที่ไม่ผูก original request ไม่เป็น proof ห้ามอนุมานว่า DCM ไม่มี capability อื่นนอกเอกสาร
- **Discovery boundary:** Dedicated `pdms-knowledge` bank/types/budget search ยัง skipped เพราะไม่มี bank-selectable tool ใน session ไม่มี Hindsight canonical `document_id`, `chunk_id`, `source_path`, `stable_document_id`, `source_revision`/`source_revisions` ใหม่ให้ยืนยัน หลักฐานข้างต้นเป็น local canonical Markdown, current source และ public document แยกจาก memory summary
- **แยกเหตุการณ์:** Folio response หายหลัง canonical commit ให้ตรวจ original Operation/checkpoint ไม่ upload ซ้ำ; ECM upload ไม่มี original receipt เป็น unknown mutation ไม่ถือว่าไม่มีไฟล์; original late receipt หลัง cancel เป็น evidence ของรอบเดิมสำหรับ cleanup ไม่ adopt เป็นคำตอบใหม่; complete committed snapshot ที่ old-file cleanup ล้ม/unknown ยังใช้/อ่าน/export ได้พร้อม persistent warning ไม่รวมเป็น canceled-batch mutation HOLD เดียวกัน
- **ข้อเสนอรอ human อนุมัติ — evidence plan:** ให้ทีม Folio เก็บหลักฐานเองและ pyw1tt ตรวจรับ ไม่รอผู้ประสาน DCM เดิมที่ไม่มีช่องทางติดต่อ ใช้ existing HTTP seam กับ isolated DB/store และ controlled provider พิสูจน์ original Operation recovery, original late receipt หลัง fence, first authorized DELETE และ no-resend/no-adopt/no-loss หลัง timeout/restart ตาม states ข้างต้น ก่อนประเมิน provider boundary ที่ test double ยืนยันไม่ได้
- **Provider evidence checklist ในแผน:** หลักฐานต้องผูกกับ original upload/DELETE ได้จริงผ่าน correlation/receipt/log ที่ตรวจสอบ provenance ได้ ระบุ environment/date/version ที่ทราบ, processing finality และว่าไม่มี delayed effect ของคำขอเดิมเหลือ พร้อม resource/aliases/current ownership/surviving references ไม่ถือว่าชื่อไฟล์/เวลาใกล้กันเพียงอย่างเดียวระบุ original request ได้ ไม่เพิ่ม request-status API สมมติ หากไม่มีช่องทางหรือ contract ที่พิสูจน์ได้ให้รายงาน insufficient/unverified ไม่แปลง human risk acceptance เป็น settlement proof
- **Execution gate:** แผนนี้ยังไม่ authorize tests against real DCM หรือ inspection ข้อมูลจริง ก่อนดำเนินการต้องอนุมัติบัญชี/environment, synthetic namespace/destination แยกจากข้อมูลจริง, write/delete scopes, stop condition เมื่อ unknown และ cleanup owner แยก ห้าม automatic POST/DELETE retry หรือเปลี่ยนชื่อส่งใหม่เพื่อหลบผลค้าง การอนุมัติแผนไม่ใช่ผล provider acceptance
- **เมื่อยังไม่มี proof:** คง guards เดิมของ original unresolved operation/affected Response; saved canonical copy ยังอ่านได้ตามสิทธิ์โดยไม่รับรอง external bytes ที่อาจถูกทับ ไม่บล็อกทั้งระบบเพราะคำขอหนึ่งค้าง ส่วน postcommit cleanup warning คงแยกและ ordinary Save/reload ไม่ retry DELETE หรือล้าง warning เอง นี่เป็น standing safety constraint ไม่ใช่คำถามเปิดให้สร้าง manual unlock ใหม่
- รอบนี้ทำเฉพาะ source/docs inspection และ read-only fetch ของ public documentation ไม่มี application/schema/DB changes ไม่มี ECM login/upload/search/original-byte GET/DELETE หรือ runtime tests ใหม่ ตาม workflow จะคุยตั๋วที่เหลือให้ครบก่อนทบทวน remaining HOLD จาก Resolution ล่าสุด

### 2026-11-18 — pyw1tt — อนุญาต scoped live API และผลตรวจจริง

- **Human authorization:** ผู้ใช้ชี้แจงว่า successful upload response หรือ `/api/beeecm/public/search` ใช้ตรวจว่า DCM เก็บไฟล์ได้ พร้อมภาพตัวอย่าง และอนุญาต “เทสผ่านapiจริงได้เลย แต่ว่าต้องใช้เลขโครงการที่เคยให้ไว้เท่านั้น” จึงเปิดเฉพาะ scoped provider verification เพิ่มจาก planning-only เดิม ไม่ตีความเป็นอนุมัติ implementation, migration, overwrite ข้อมูลเดิม, DELETE หรือ full settlement plan และยังไม่ resolve ตั๋ว
- **Scope verified:** Recall retrieved เป็น navigation พบชื่อทดสอบเก่า แต่ใช้ [authorization ล่าสุดใน owner spec](../../ecm-storage-templates/spec.md#implementation-authorization--2026-11-17) ยืนยัน primary project `กทอ.67-00-0001`, filename `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf`, reported destination เดิม `DMS/ShareFiles/2567/กทอ.67-00-0001/2. มติและการก่อหนี้` ไม่ใช้เลขจากภาพตัวอย่าง ไม่ใช้ fallback project/scenario และไม่เปิดค้นทั้ง root directory
- **New canonical document:** ผู้ใช้ส่ง [AquilaAPI อีก collection](https://documenter.getpostman.com/view/40888244/2sBYHbrFpB#4cfdf213-260c-4db6-a1d3-28a0ac163a74) อ่าน public collection ได้จริงและบันทึก revision/hash กับ sanitized contract ใน [provider research supplement](../../ecm-storage-templates/provider-contract-research.md#supplemental-user-provided-api-document--2026-11-18) รองรับ multipart `template` ข้อความ `"0"`/`"1"`, successful object upload receipt และ search array รวมตัวอย่างว่าง ไม่ใช้ snapshot เก่าที่ไม่มี saved upload examples ไปปฏิเสธหลักฐานชุดใหม่นี้
- **Execution boundary:** ใช้ `ECM_API_URL`/บัญชีที่ตั้งไว้และ shared `EcmClient` auth coordinator เดิมจาก Working Tree ไม่ใช้ credentials ใน public docs ไม่เปลี่ยน `.env`, app/source/schema/migrations หรือ Forms/Responses Shared operational auth cache มีการ invalidation/renewal ตาม coordinator หลัง upstream 401 ซึ่งไม่ใช่การเปลี่ยนคำตอบของ User Provider deployed revision ยัง unavailable

| เวลา UTC / ขั้นตอน | ผลที่สังเกตได้ |
| --- | --- |
| `09:31:55` initial scoped search | HTTP 401 ไม่มี receipt ของไฟล์; ไม่สรุปสาเหตุว่า token หมดอายุหรือถูกบริการอื่นเปลี่ยน |
| `09:32:15` coordinated auth และ search filename | login HTTP 200 หนึ่งครั้ง จากนั้น search HTTP 200 / business `status=200` / `data=[]` |
| `09:32:54`–`09:33:59` search project | HTTP 200 พบหนึ่งรายการที่ `file_name` เท่ากับ project แต่ `file_type="folder"` และ parent `file_path="DMS/ShareFiles/2567"` ไม่ใช่ไฟล์ทดลอง ไม่ใช้ `file_token`/`file_link` ของ folder เป็นหลักฐาน upload |
| `09:34:16` search returned project directory | HTTP 200 พบ 9 folders ใต้ project นี้ ยังไม่มี folder `2. มติและการก่อหนี้` ในผลครั้งนี้ ไม่ใช่ผลค้น recursive ทุกไฟล์ |
| `09:36:08` preflight และ single upload | search filename และ target directory ว่าง; project-directory listing ไม่พบ target folder จึงไม่มี known collision จากผลที่ตรวจ ส่ง synthetic PDF หนึ่งครั้งด้วยสอง multipart fields `documentFile`, `template="1"`; POST `/file` ตอบ **HTTP 500** |
| `09:37:06` read-only diagnosis หลัง HTTP 500 | search target directory เดิม HTTP 200 / business `status=200` / `data=[]` ไม่ส่ง upload ใหม่หรือเปลี่ยนชื่อ |

- **Synthetic fixture:** PDF หนึ่งหน้าที่สร้างใน memory, 667 bytes, SHA-256 `a8b756dc5aedaad0c177b5ab35aa7b0426aa2d97be0f0045f8b3e95543663c54` มีข้อความทดสอบและ unique marker ไม่มีข้อมูล User ผ่าน self-check ตำแหน่ง PDF objects/xref ก่อนส่ง ไม่ใช่ fixture 629 bytes ของประวัติเดิม และไม่อ้างว่า DCM อ่าน/เก็บ PDF นี้สำเร็จ
- **Exact observed requests:** search 9 ครั้ง รวม HTTP 200 แปดครั้งและ HTTP 401 หนึ่งครั้ง; coordinated login HTTP 200 หนึ่งครั้ง; file upload **หนึ่งครั้ง / HTTP 500**; original-byte GET **ศูนย์** เพราะไม่มี trusted receipt จากรอบนี้; DELETE **ศูนย์** ไม่มี automatic upload retry, fallback, rename-and-resend หรือ concurrent probe writers
- **Result — PARTIAL:** ตรวจ API จริงได้และแยก folder/file รวม search ด้วย directory path ได้ แต่ upload รอบนี้ไม่สำเร็จในความหมายของการได้รับ success receipt ไม่มี `file_token`/`file_link` ที่ยืนยันของรอบนี้ และไม่มี original-byte comparison ไม่สรุปว่ามีไฟล์เก็บแล้วหรือไม่มีผลข้างเคียงแน่นอนจาก HTTP 500 + search ว่าง ไม่มีการจำลอง timeout/late processing/DELETE และไม่มีหลักฐานว่า request นี้ยังทำงานอยู่
- **Stop and follow-up:** หยุด mutation หลัง HTTP 500 คงหลักฐานคำขอเดิม ไม่ upload ซ้ำเพื่อให้ผ่าน ไม่สร้างชื่อใหม่ ไม่ DELETE หรือสร้าง folder เอง หากตรวจต่อให้ใช้ read-only ภายใน project เดิม และแยก root cause/finality evidence ออกจากการค้นพบไฟล์ปัจจุบัน ไม่มี application Operation/HOLD หรือ canonical answer ใหม่จาก standalone probe นี้ จึงไม่สร้างหรือปลด Folio HOLD ปลอม
- **คำอธิบายที่ต้องส่งให้ human:** เมื่อได้รับ successful upload response หรือ search พบไฟล์ที่พิสูจน์ตรงรอบเดิมได้ หลักฐานนั้นใช้ได้จริง ไม่ได้ปฏิเสธ API นี้ โจทย์ที่ยังค้างคือเมื่อไม่มี success receipt และ search ยังไม่พบ จะตัดสินว่าส่งซ้ำได้อย่างไรโดยไม่เสี่ยง delayed effect ตัวอย่างสดครั้งนี้คือ HTTP 500 แล้ว search ว่าง ไม่ใช่หลักฐานจำลองว่า timeout ต้องเกิดหรือไฟล์หายแน่นอน
- ไม่เก็บ raw collection, credentials, token/link ของข้อมูลจริง หรือ executable probe ลง repo รักษาข้อมูลเดิมและไม่ cleanup โดยเดา การรับรองแผนทั้งหมดและ remaining settlement HOLD ยังต้อง human ตัดสินหลังเข้าใจผลนี้ ไม่ถือการอนุญาต live API ว่าอนุมัติคำถามอื่นแทน

### 2026-11-18 — pyw1tt — อนุญาต diagnostic retry แต่หยุดก่อนส่งเมื่อพบไฟล์เดิม

- **Human authorization เพิ่ม:** ผู้ใช้สั่ง “งั้นคุณลองuploadอีกรอบ ครั้งนี้ให้ตรวจละเอียดหน่อย” หลังรับทราบว่า attempt แรกตอบ HTTP 500 และไม่ได้เก็บ body จึงเตรียมส่งเพิ่มได้หนึ่งครั้งตามคำสั่งโดยเก็บ response status/headers/body แบบ bounded และ redact secrets ก่อน output ไม่ใช่ automatic retry จาก error หรืออนุมัติ overwrite/delete ข้อมูลที่พบใหม่
- **Diagnostic harness:** ใช้ shared coordinator และ endpoint/body เดิม เตรียม PDF สังเคราะห์ 667 bytes ใหม่ไว้ใน memory พร้อม SHA-256 `709b2ee6c999641c46cc3de0fd0201d00e9ddf6f2bba547d4d7a545590980256` จึงไม่ใช่ byte-for-byte replay ของ fixture แรก มี self-check PDF objects/xref แต่ไม่มี external `pdfinfo` ในเครื่อง Outbound guard อนุญาต file POST ได้ไม่เกินหนึ่งครั้งเมื่อ preflight ปลอด known collision เท่านั้น Capture ใช้ response clone ก่อน adapter ทิ้ง non-success body, limit 262,144 bytes, บันทึก completeness/truncation, selected headers, request multipart boundary และ timing โดยไม่เปลี่ยน application source
- **Observed preflight:** `2026-11-18T10:02:23.552Z` search ครั้งแรกได้ HTTP 401 และยังไม่ส่ง file POST; explicit preflight หลัง coordinator login HTTP 200 เวลา `10:02:39.455Z` พบ **3 รายการ** ทั้งจาก filename และ destination-directory searches และ project listing พบ target folder แล้ว จึงหยุดด้วย `existing_destination_or_filename_no_upload` ไม่ถือการเปิด process ครั้งใหม่ก่อน dispatch ว่าเป็น file upload retry สองครั้ง
- **Read-only follow-up:** เวลา `10:03:44.048Z` search destination เดิม HTTP 200 พบ PDF 3 รายการ ทั้งหมดชื่อ `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf` อยู่ใต้ `DMS/ShareFiles/2567/กทอ.67-00-0001/2. มติและการก่อหนี้` และ original GET ผ่านบัญชีเดิม HTTP 200 ครบสามรายการ ไม่ใช้ folder token/link เป็น file receipt

| รายการตามลำดับ search | Provider `file_create` / `file_datetime_edit` ตามค่าที่คืน | Original bytes | Original SHA-256 |
| --- | --- | --- | --- |
| รายการแรก | `2026-11-18 17:01:09` / `2026-11-18 17:01:09` | 26,275 | `12ec9f9bdc5b35397b05905de3581d5b96c669f9d64e6527f0308430ab98b7e1` |
| รายการที่สอง | `2026-11-18 17:02:36` / `2026-11-18 17:02:36` | 26,275 | `12ec9f9bdc5b35397b05905de3581d5b96c669f9d64e6527f0308430ab98b7e1` |
| รายการที่สาม | `2026-11-18 17:02:38` / `2026-11-18 17:02:38` | 26,275 | `12ec9f9bdc5b35397b05905de3581d5b96c669f9d64e6527f0308430ab98b7e1` |

- **Supported:** original bytes ของทั้งสามรายการเหมือนกันและไม่ตรง fixture 667 bytes ของ attempt HTTP 500 แรก ไม่ตรง historical fixture 629 bytes หรือ fixture ที่เพิ่งเตรียมรอบนี้ ไม่อ้างว่าใครเป็น uploader หรือเป็นผลของคำขอใดจากชื่อ/เวลาเพียงอย่างเดียว และไม่อ้างว่า token ต่างกันแปลว่าเป็น independent physical resources
- **Exact new requests:** search 5 ครั้ง รวม HTTP 401 หนึ่งครั้งและ HTTP 200 สี่ครั้ง; coordinated login HTTP 200 หนึ่งครั้ง; original GET HTTP 200 สามครั้ง; **file POST ศูนย์, DELETE ศูนย์** ไม่อัปโหลดทับสามไฟล์ ไม่สร้าง folder ไม่แก้ Forms/Responses/schema/source/`.env` Operational auth cache ต่ออายุตาม coordinator เท่านั้น
- **Result / next human tradeoff:** ยังไม่มี upload response body ใหม่ เพราะหยุดก่อนส่งอย่างถูกต้องเมื่อพบ known collision หากต้องทดสอบต่อ ให้ human เลือกชื่อทดลองแยกภายใต้ project เดิมและรับทราบว่าต้องตรวจ template routing/collision ใหม่ หรือหยุดไว้ก่อน ไม่เปลี่ยนชื่อแล้วส่งเองเพื่อหลบสถานะ attempt HTTP 500 เก่า และไม่ถือ successful new request ในอนาคตว่า settle คำขอเก่าแล้ว ยังไม่ปิดตั๋วหรือปลด settlement HOLD

### 2026-11-18 — pyw1tt — ผู้ใช้แจ้งการลบไฟล์ก่อนทดสอบและถามต้นทาง HTTP 500

- **Human observation:** ผู้ใช้แจ้งว่า “ก่อนที่จะให้คุณเทสผมได้มีการลบไฟล์ในdcmทิ้งไปด้วย” รับเป็นข้อมูลจากผู้ใช้ ไม่เรียก mutation เพื่อทดสอบคำยืนยันนี้ และไม่อนุมานว่าลบ folder/template หรือทุกไฟล์ชื่อเดียวกันทั้งหมด
- **Response origin — supported:** HTTP 500 ของ attempt เวลา `09:36:08Z` มาจาก outbound `fetch` ไปที่ `POST https://pdms-documentmanagement.enconfund.go.th/backend/api/beeecm/public/file` โดยตรง และบันทึก status ก่อน `EcmClient` จัดการ error Standalone probe ไม่ได้เรียก Folio Save/Submit HTTP endpoint; `ecm_unavailable` เป็น local adapter error ภายหลัง ไม่ใช่หลักฐานว่า Folio endpoint สร้าง HTTP 500 เอง
- **Root cause — insufficient:** การตอบ 500 จาก DCM host ไม่พิสูจน์ว่า provider application ผิดแทน malformed request, proxy หรือสถานะปลายทาง ไม่มี original error body/log ของ attempt แรกให้ระบุสาเหตุ และไม่อ้างว่าการลบไฟล์ทำให้เกิด 500 โดยตรง
- **Temporal evidence:** ผล search ว่างเวลา `09:37:06Z` กับ PDF 3 รายการที่อ่านกลับได้เวลา `10:03:44Z` เป็นคนละ snapshot ไม่ขัดกับคำยืนยันว่ามีการลบก่อนทดสอบ และไม่พิสูจน์ผู้สร้างไฟล์ที่พบภายหลัง ตราบใดที่ปัจจุบันพบ known files ชื่อเป้าหมายเดิม ยังไม่ upload ทับโดยอนุมานว่าผู้ใช้ลบหมดแล้ว

### 2026-11-18 — pyw1tt — ชื่อซ้ำสร้างรายการใหม่และ bytes เดิมยังอยู่ในการทดสอบที่อนุญาต

- **Human observations / authorization:** ผู้ใช้เลือก “อนุญาตทดสอบชื่อเดิมต่อหนึ่งครั้ง” หลังรับทราบ known files และความเสี่ยง จากนั้นแจ้งว่าพบ DCM เพิ่มรายการใหม่เมื่อ upload ชื่อซ้ำ พร้อมภาพ UI ที่แสดง PDF ชื่อเดียวกันสามรายการใน project เดิม รับข้อสังเกตนี้เป็นพฤติกรรมที่ผู้ใช้พบ ไม่ใช้ memory เก่าว่า duplicate ต้อง overwrite ทุกกรณีมาลบล้างข้อมูลใหม่ ผู้ใช้ยังไม่ได้สั่งยกเลิก counter หรือเปลี่ยน naming/history/cleanup contract
- **Dispatch accounting:** หลัง authorization preflight เวลา `10:08:44Z` ได้ HTTP 401 และยังไม่ส่ง file POST ต่อมารันผ่าน coordinator เดิมสำเร็จเวลา `2026-11-18T10:11:29.584Z` ใช้ fixture ที่เตรียมไว้ 667 bytes/hash `709b2ee6c999641c46cc3de0fd0201d00e9ddf6f2bba547d4d7a545590980256` ส่ง file POST เพิ่ม **หนึ่งครั้งเท่านั้น** เวลา `10:11:31.192Z` ไม่เพิ่ม POST เพื่อยืนยันรูปภาพ ไม่เปลี่ยนชื่อ ไม่ใช้ project/template สำรอง และไม่ DELETE
- **Exact request:** `POST https://pdms-documentmanagement.enconfund.go.th/backend/api/beeecm/public/file`, actual `Content-Type: multipart/form-data` พร้อม boundary ที่ Request สร้าง, Authorization ผ่าน shared coordinator; body สอง fields `documentFile` ชื่อ `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf` MIME `application/pdf`, และ `template` ข้อความ `"1"` ไม่ส่ง year/number/category เพิ่ม ไม่เก็บ Authorization หรือ boundary เป็นคำรับรอง semantics ของ provider
- **Captured response:** HTTP **200 OK**, `Content-Type: application/json`, `Date: Wed, 18 Nov 2026 10:11:31 GMT`, `Server: cloudflare`; header arrival 302 ms, capture complete 305 ms, original body 725 bytes อ่านครบไม่ truncate และ adapter ยอมรับ receipt Capture อ่าน response clone ก่อน adapter handling จึงไม่สูญเสีย error body ถ้ามีในคำขอใหม่นี้

```json
{
  "status": 200,
  "msg": "OK",
  "data": {
    "file_name": "กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf",
    "file_size": "667 bytes",
    "file_type": "pdf",
    "file_title": null,
    "file_descrip": null,
    "file_create": "2026-11-18 17:11:31",
    "file_datetime_edit": "2026-11-18 17:11:31",
    "file_token": "[REDACTED]",
    "file_path": "DMS/ShareFiles/2567/กทอ.67-00-0001/2. มติและการก่อหนี้",
    "file_link": "[REDACTED]"
  }
}
```

| สิ่งที่ตรวจ | ก่อน POST | หลัง POST |
| --- | --- | --- |
| Search destination เดิม | PDF ชื่อเดียวกัน 3 รายการ | PDF ชื่อเดียวกัน 4 รายการ; หนึ่งรายการตรงทั้ง token/link ของ original success receipt ใหม่ |
| Original bytes ของแต่ละรายการเดิมทั้งสาม | รายการละ 26,275 bytes, SHA-256 `12ec9f9bdc5b35397b05905de3581d5b96c669f9d64e6527f0308430ab98b7e1` | GET ด้วย token เดิม HTTP 200 ทั้งสาม; size/hash คงเดิมทุกไฟล์ |
| Original ของไฟล์ใหม่ | ยังไม่มี receipt ของคำขอใหม่นี้ | GET ด้วย receipt ใหม่ HTTP 200, 667 bytes, SHA-256 `709b2ee6c999641c46cc3de0fd0201d00e9ddf6f2bba547d4d7a545590980256` ตรง fixture ที่ส่ง |

- **Evidence status — supported for this sample:** ไม่ใช่เพียงเพิ่ม UI rows หรือ token ต่างกัน แต่มี original bytes ใหม่ที่ต่างจากสามไฟล์เดิม และทุก old original ยังอ่านกลับด้วย digest เดิมหลัง POST เป็นหลักฐานว่าชื่อซ้ำสร้างไฟล์ใหม่โดยไม่ทับ originals ที่ตรวจใน project/template/PDF/environment ครั้งนี้ ไม่ขยายเป็น deployed-version guarantee ทุก file type/template/concurrency หรือ proof ว่า DELETE หนึ่งไฟล์ไม่กระทบอีกไฟล์
- **Exact successful-run requests:** coordinated login HTTP 200 หนึ่งครั้ง; search HTTP 200 สี่ครั้ง; file POST HTTP 200 หนึ่งครั้ง; original GET HTTP 200 เจ็ดครั้ง (เดิมก่อน 3 + เดิมหลัง 3 + receipt ใหม่ 1); DELETE ศูนย์ File POST ที่ผู้ช่วยส่งในรอบสนทนานี้รวมสองครั้งคือ HTTP 500 แรกและ HTTP 200 ครั้งนี้ ไม่รวมการอัปโหลดของผู้ใช้และประวัติก่อน session
- **ผลต่อสาเหตุ HTTP 500 แรก:** ครั้งใหม่สำเร็จโดยไม่ได้แก้ application หรือ multipart contract แต่ไม่ได้มี error body/log ของครั้งแรก และ fixture ใหม่ไม่ใช่ bytes เดียวกับครั้งแรก จึงยังไม่ยืนยันว่าสาเหตุคือการลบไฟล์/folder, auth, provider error หรือ content ไม่มีการตั้งชื่อคำขอใหม่ครั้งนี้ให้เป็น settlement proof ของคำขอ HTTP 500 เดิม
- **ผลต่อ naming / external risk:** ต้องทบทวนความจำเป็นของ durable cross-save `-(n)` ใน [canonical naming spec](../spec.md) เพราะ premise ว่าชื่อซ้ำต้องทับไม่รองรับกรณีนี้ และไม่ใช้ local filename-keyed provider double เป็นคำรับรอง DCM จริง ข้ออนุมัติ Q1 A/Q2 A เดิมยังเป็น intended policy จน human เปลี่ยน ไม่ถอน counter, เลิก reservation หรือเปลี่ยน frozen Published contracts เอง รวมถึงไม่อ้างว่า accepted external-overwrite risk เป็นหลักฐานว่า overwrite เกิดจริง
- **Current Source impact:** CodeGraph อ่าน `numberDuplicateAttachmentFilenames` และ `planAttachmentUploads` ที่ยังจัดเลขภายใน batch; `admitAttachmentDestination` ใช้ account + filename ก่อน dispatch และคุ้มครอง history/owner; `requireAttachmentReferenceReady` / `requireAttachmentDeleteReady` มี filename/in-flight checks และ `receiveAttachmentIdentity` แยก paired receipt `[INFERENCE]` หาก create-new semantics ครอบคลุม scope ที่จะใช้จริง filename-first collision guards บางส่วนอาจบล็อกไฟล์อิสระที่ปลอดภัย จึงต้อง review ก่อนปรับ model ไม่ใช่ลบ owner/reference/unknown guards ทั้งหมด ไม่ได้ run หรือแก้ app/callers/tests/fixtures จาก finding นี้
- **สิ่งที่ยังคงเดิม:** เก็บ original bytes ที่ DCM และ metadata/token/link ตามแต่ละ receipt ใน answer JSON/ledger; ไม่เลือกไฟล์จากชื่อเพียงอย่างเดียว; ไม่ upload unchanged files; atomic canonical snapshot/history; cleanup ต้องผูก resource และ references ไม่ลบทุกไฟล์ชื่อเดียวกัน; unknown no-auto-retry ยังสำคัญเพราะ resend อาจเพิ่มไฟล์ซ้ำ/orphan แทน overwrite Search พบหลายชื่อเหมือนกันไม่ระบุ original request โดยตัวมันเอง กฎปุ่มครบ column, physical-row mapping และ minimum one body row ไม่เปลี่ยน
- **No silent policy change:** บันทึกหลักฐานและ impact เท่านั้น ไม่ resolve ตั๋วนี้หรือตั๋ว naming ซ้ำ ไม่เปิด implementation หรือประกาศทุก HOLD ผ่าน แนะนำทบทวน naming/reservation ก่อนพัฒนาส่วนนั้น ส่วน inventory/recovery ให้แยก duplicate names, shared identity และ integrity ไม่เหมาว่าชื่อซ้ำคือ corruption
- **Artifact left:** มี success receipt ของ PDF สังเคราะห์ใหม่ 667 bytes เวลา `17:11:31` ตาม provider metadata ณ destination ข้างต้น ผู้ช่วยไม่ลบเอง ไม่บันทึก private token/link หรือ binary originals ลง repo/DB/RustFS ไม่มี `.env`, schema, Forms/Responses หรือ app source changes; shared operational auth cache ต่ออายุตาม coordinator เท่านั้น

### Resolution — pyw1tt — อนุมัติแผนหลักฐานสองชั้น

- **Human approval:** ผู้ใช้ตอบ “เห็นด้วย” ต่อแผนสองชั้น ให้ทีม Folio เก็บหลักฐานและ pyw1tt ตรวจรับ ปิดขั้นจัดหา/อนุมัติแผนตามเกณฑ์คำตอบของตั๋ว ไม่ใช่รับรอง settlement contract ของ provider หรืออนุมัติ execution
- **ชั้นแรก — Folio ในระบบแยก:** ใช้ existing HTTP integration seam กับ actual app, isolated DB/store และ controlled provider พิสูจน์การจัดการสถานะตามตาราง ไม่แตะไฟล์หรือข้อมูลใช้งานจริง และไม่ใช้ผลจำลองรับรองพฤติกรรม DCM

| เหตุการณ์ในแผน | เกณฑ์ที่ต้องพิสูจน์เมื่อได้รับอนุมัติให้รัน |
| --- | --- |
| Provider เก็บไฟล์แล้ว แต่ผลตอบกลับ upload หาย | ไม่ POST ซ้ำเอง ไม่รายงานว่าสำเร็จโดยไม่มีหลักฐาน และคง saved canonical answer; แยกจากกรณี Folio response หายหลัง canonical commit ซึ่งต้องตรวจ original Operation/checkpoint ก่อน |
| Cancel/fence แล้ว original upload receipt มาถึงภายหลัง | เก็บหลักฐานผูกกับคำขอเดิม ไม่ adopt เป็นคำตอบใหม่เงียบ ๆ; cleanup ต้องผ่าน original receipt, ownership/reference และ first-authorized-DELETE safeguards |
| ส่ง DELETE แล้วไม่ได้รับผล | ไม่ resend DELETE หรือบอกว่าลบสำเร็จโดยเดา เก็บสถานะ/หลักฐานเดิมไว้ตรวจหลัง restart และไม่ใช้ sender fence แทน proof ว่าคำขอเก่าจบแล้ว |
| B canonical commit สำเร็จ แต่ cleanup ของ A ล้มเหลว/unknown | B ยังอ่านและ export ได้ตามสิทธิ์ พร้อม persistent warning ว่า A อาจยังเปิดได้ Ordinary save/reload ไม่ล้าง warning หรือ retry DELETE เอง ไม่ย้อนให้ B ที่ commit แล้วกลายเป็น failed save |

- **ชั้นสอง — หลักฐาน DCM จริง:** ตรวจว่ามี original response/receipt/log หรือ contract ที่ตรวจสอบ provenance และผูกกับ original request/resource ได้หรือไม่ ต้องตอบทั้ง “เกิดผลอะไรกับไฟล์ใด” และ “คำขอนั้นจบแล้ว ไม่มี delayed effect ค้างอยู่ตาม contract ใด” ไม่สมมติว่ามี request-status API หรือเข้าถึง provider logs ได้แล้ว
- **ขอบเขตการตรวจรับ:** ระบุ environment/date/version ที่ทราบ, original Operation/request correlation, paired receipt เมื่อมี, resource/aliases/ownership/surviving references และ original bytes ที่จำเป็นต่อ claim พร้อมผล supported/partial/insufficient แยกตามเหตุการณ์ เก็บหลักฐานอย่างคงทนสำหรับ audit หลัง restart โดยไม่เผย credentials/raw tokens หรือเก็บสำเนา original attachments นอก DCM
- **หลักฐานที่ไม่เพียงพอ:** search ว่าง, พบชื่อเดียวกันโดยผูกคำขอไม่ได้, เวลาผ่าน/restart, sender fence, operator note/checkbox หรือความยอมรับความเสี่ยง ไม่ใช่ settlement proof ผลสำเร็จของ POST ครั้งใหม่ไม่ยุติ unknown ของคำขอเก่า และไม่ใช้การส่ง POST/DELETE ซ้ำเป็นวิธีพิสูจน์ผล
- **Remaining HOLD:** ถ้ายังไม่มีหลักฐานยุติ original mutation ให้คง existing hold/guards เฉพาะ original unresolved operation/affected Response ไม่บล็อกทั้งระบบ Saved snapshot ยังอ่านได้ตามสิทธิ์โดยไม่รับรองความคงเดิมของ external bytes ส่วน postcommit cleanup warning แยกจาก mutation HOLD ตามตาราง ไม่เพิ่ม manual unlock จาก token/URL/note
- **Execution gate แยก:** การเห็นด้วยครั้งนี้อนุมัติเฉพาะแผน ยังไม่ authorize การรัน tests/ทดลองใหม่หรือแก้ application/schema/ข้อมูล ก่อน real DCM trial ต้องตกลง account/environment, เลขโครงการและ synthetic destination ที่อนุมัติ, write/first DELETE scope, stop condition เมื่อ unknown และ cleanup owner แยก ไม่ขยาย scoped live approvals ที่ใช้ไปแล้ว และไม่ DELETE ไฟล์สังเคราะห์เดิมโดยอัตโนมัติ
- **Evidence at resolution:** รอบนี้บันทึกคำตัดสินและอัปเดต map เท่านั้น ไม่มี runtime/provider results ใหม่ ผล PDF scope เดิมไม่รับรอง full settlement, DELETE isolation, all-type/concurrency หรือ release; ไม่ถอนข้อจำกัดจากตั๋วที่ยังเปิด
