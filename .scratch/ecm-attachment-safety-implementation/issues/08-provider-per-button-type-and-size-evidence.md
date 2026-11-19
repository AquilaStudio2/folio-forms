# 08: หลักฐาน DCM สำหรับชนิดและขนาดต่อปุ่ม

**What to build:** ตรวจรับการรับส่ง receipt และการเข้าถึงไฟล์ของแต่ละปุ่ม/slot ตามชนิดและขนาดที่ตกลง โดยแยกเส้นทาง initial upload, reopen/access และ number-change saved-reference reuse ไม่เพิ่มการเทียบ bytes หรือ aggregate-capacity workload ที่ผู้ใช้ตัดแล้ว

**Blocked by:** 01 — ส่งชื่อเดิมได้ พร้อม receipt และคำเตือนถูกประเภท.

**Status:** resolved — scoped live DCM evidence accepted

**Spec coverage:** ECM Attachment Safety implementation spec — US85–88, US90; Testing Decisions C.3–C.5

**Execution prerequisites:** ผู้ใช้อนุญาตให้ทดสอบ DCM จริงตาม [ขอบเขตในสเปก](../spec.md#ขอบเขตทดสอบ-dcm-จริง) แล้ว เฉพาะ `กทอ.67-00-0001` ยืนยัน account/environment/ปลายทาง/slot ที่ใช้ไฟล์สังเคราะห์และ stop conditions ก่อน POST ตั๋วนี้ไม่อนุญาต DELETE หรือ cleanup อัตโนมัติ

**Human acceptance:** pyw1tt ยืนยันตรวจรับและให้ปิดตั๋ว 08 สำหรับ [ผลการเปลี่ยน `docs_number` จาก 0001 ไป 0003 ด้วย Admin Correction บน DCM Production](#live-0001-to-0003--both-attachment-slots-verified) ทั้งช่องเดี่ยวและช่องตาราง รวมผลชนิดและขนาดที่บันทึกไว้ ไม่ถือว่าทดสอบการเปลี่ยนปลายทางฝั่ง User หรือการสร้างโฟลเดอร์อัตโนมัติบน DCM จริงแล้ว.

## Acceptance criteria

- [ ] ใช้ revised upload/receipt behavior และ isolated proof จาก 01 ก่อน scoped provider trials ไม่พึ่ง full-browser acceptance ของ 06 และไม่ขอเลือก file types/product limits เดิมซ้ำ
- [ ] Matrix ระบุแต่ละปุ่ม/slot ของตน ทั้ง scalar/table ที่อยู่ใน scope ไม่สรุปรวมว่าทุกปุ่มผ่านจากผลของปุ่มเดียวหรือขนาดรวมต่อ batch
- [ ] ชนิดที่อนุญาตสำหรับ Folio upload ใหม่คือ PDF, DOCX, XLSX, PNG และ TXT ไม่แยกตัวพิมพ์; แยกชนิดจาก size-boundary dimension. ประวัติ HTML/BIN/ZIP/ไม่มีนามสกุลเป็นหลักฐานก่อนใช้กฎใหม่; ตรวจปฏิเสธชนิดนอก allowlist แบบ local/no-dispatch ไม่ทดลอง live เพิ่มหรืออ้างว่าทุก format/combination ผ่าน
- [ ] แต่ละ applicable slot/path มีผล initial upload, reopen/access และเปลี่ยน docs_number ผ่าน trusted saved reference ตาม workflow เดิม ไม่บังคับเลือก File ใหม่หรือใช้ preview เพื่อกลบ retrieval failure
- [ ] ตรวจ actual File size ต่อปุ่มที่ 2 และ 10,000,000 bytes แบบ inclusive ส่วน 0, 1 และ 10,000,001 bytes ต้อง Folio reject ก่อน provider dispatch โดยตรวจ no-dispatch ในระบบแยก
- [ ] คงหนึ่งไฟล์ต่อ slot และ active/empty-row rules รวมการนับไฟล์ 0–1 byte ที่บันทึกไว้เดิมว่าแนบอยู่ แต่ไม่ส่งไฟล์ขนาดนี้ขึ้นใหม่ ไม่ขอ password/ถอดรหัส/รับรองความปลอดภัยหรือความถูกต้องของเนื้อหา
- [ ] เกณฑ์ type/size เก็บ API outcome, validated original paired receipt และ URL access result ผูกกับ slot/round/path ไม่ adopt search result จากชื่อหรือรับ malformed schema เพื่อให้ผ่าน
- [ ] ไม่บังคับ upload-versus-download exact bytes/SHA-256 comparison ใน matrix นี้ ไม่รัน 1/10/20 full-size-file workload, aggregate bytes, two-Response concurrency หรือ workload เพื่อรับรอง aggregate capacity และไม่เก็บ workload ที่ตัดแล้วเป็น planning/release gate ใหม่
- [ ] ไม่เพิ่ม batch cap/config หรืออ้าง unlimited capacity ผลรับส่ง/receipt/access ไม่ใช่ proof ว่าไฟล์อ่านคืนตรงต้นฉบับ ไม่เสียหาย หรือปลอดภัย
- [ ] Runtime original-reuse size/hash/origin/no-redirect, streamed actual-byte/trusted-slot/JSON 262,144-byte validation และ security/reference/concurrency guards เดิมยังทำงาน ถ้า check ปฏิเสธให้รายงานผลตามจริง ไม่ถอด check เพื่อให้ matrix ผ่าน
- [ ] Real API จำกัดฐาน กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45) เท่านั้น ถ้า number-change/literal-template scenario ต้องออกนอก scope ให้ตรวจ local path และคง real-provider cell pending จนมี authorization ที่เพียงพอ ไม่ใช้เลข/แม่แบบสำรอง
- [ ] ตรวจ authorized ownership/collision boundary ก่อน synthetic write ไม่ถือ search ว่างอย่างเดียวเป็น safe-write proof หยุดเมื่อ unexpected error/unknown ไม่ auto POST/DELETE retry ไม่เปลี่ยนชื่อเพื่อให้ส่งได้ และไม่ cleanup known files โดยเดา
- [ ] ส่ง sanitized matrix ราย type/button/path/size พร้อม actual source/environment/date/version เท่าที่ทราบ, outcome/access/receipt correlation, evidence status และ pyw1tt review ไม่เก็บ raw tokens/credentials/private URLs/original copies ลง repo
- [ ] Unrun/unsupported/unverified cases ระบุ pending/partial/insufficient และ applicable HOLD ตามจริง ไม่ถือ approval ของแผนหรือ PDF sample เดิมเป็น matrix PASS ข้อยกเว้นในตั๋วนี้ไม่ยกเลิก evidence plan ของ identity/history/recovery tickets อื่น

## Scope boundaries

ตั๋วนี้รับขอบเขตที่ผู้ใช้ลดแล้วตามเดิม ไม่มี byte-comparison หรือ aggregate-capacity requirement ใหม่ Runtime checks ที่มีอยู่เป็น production behavior ที่ต้องคง ไม่ใช่เกณฑ์ evidence ที่ถูกตัด

DELETE isolation อยู่ใน 07; original-request finality อยู่ใน 09 ไม่ใช้ผล type/size มารับรองสองเรื่องนั้น

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown/edge 01 และขอบเขตต่อปุ่มแล้ว เผยแพร่เพื่อให้ตรวจตั๋วก่อน execution ไม่มี live-provider matrix result ใหม่จากการสร้างตั๋ว

### Gate assessment — 2026-11-19 — source `1affbc02aa20cf23ca240cb1c85d951980594073`

**Disposition:** `insufficient / HOLD` เฉพาะ provider type/size acceptance ที่ยังขาด ไม่ใช่คำตัดสินว่า DCM ไม่รองรับ หรือบล็อกการพัฒนาในระบบแยก งานนี้แก้เฉพาะตั๋ว 08 ไม่แก้ application/runtime guards, Forms/Responses, configuration หรือเก้าตั๋ว Wayfinder เดิม ไม่รอผลตั๋ว 06 และไม่ใช้ local proof เป็น provider PASS

#### เจ้าของกฎและ provenance ที่ตรวจจริง

Canonical Markdown ต่อไปนี้เปิดอ่านจาก worktree ที่ยืนยัน ancestry ถึง `1affbc0` แล้ว เป็น snapshot ไม่ใช่ deployed artifact ตารางใช้ SHA-256 ของ Markdown เพื่อระบุ revision ของเอกสารเท่านั้น **ไม่ใช่ upload/download byte-comparison criterion**; fingerprints เก่าในสเปกเป็น snapshot คนละรอบ ไม่ยืมมาแทน revision ที่เปิดครั้งนี้

| Ref / canonical owner | ส่วนที่รองรับ claim | SHA-256 ของ snapshot ที่อ่าน |
| --- | --- | --- |
| D08 — [approved type/size decision](../../ecm-attachment-safety/issues/08-provider-type-size-capacity.md#resolution--pyw1tt--อนุมัติแผนชนิดไฟล์และขนาดต่อช่อง) | Resolution บรรทัด 47–58 แทนข้อเสนอ byte comparison/capacity ก่อนหน้า; human owner pyw1tt | `e8300c0890e5baf597bb2c88d81d89262ea4335ac7a44deddb3775dd69e4879e` |
| P07 — [product type/size/requiredness](../../ecm-attachments/issues/07-pdf-acceptance.md#resolution--2026-11-12--ยืนยันร่วมกับผู้ใช้) | Resolution และ amendment: ทุกชนิด หนึ่งไฟล์ 0–10,000,000 inclusive, encrypted, active/empty rows, URL access | `25ca6ef2dea7f21c478b28278921f6100f506e56a396690a0f87740f9c734a65` |
| D06 — [historical scoped provider record](../../ecm-attachment-safety/issues/06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต) | Sections scoped API, diagnostic retry, same-name result และ final two-layer Resolution อ่านครบตาม claim | `50fc2a740f19b56f5cf4b54b8c45f1139daf1b25e3603e3341a37eafdc4a6ce4` |
| R — [provider research](../../ecm-storage-templates/provider-contract-research.md#supplemental-user-provided-api-document--2026-11-18) | Published contract/provenance, public original GET discovery, integrated reader, supplemental document และ same-name amendment | `408b985a266187e3fb0bb7aa1913d31c0fd5dde4f624c8ee5be8fd5fb11ac7de` |
| A — [historical table audit](../../ecm-storage-templates/table-upload-behavior-audit.md#d-requiredness-แถวว่าง-และขอบเขตไฟล์) | D / Smoke A / source register: parser/extractor proof ไม่ใช่ per-button provider acceptance | `56b864be656af3fb6ed92d8a731107090ff52c8a744cb9504b73fd10e66548c3` |

- **Intended policy — supported:** D08 เป็นเจ้าของ matrix/exclusions; P07 เป็นเจ้าของ product limits/requiredness ใช้ [implementation spec US85–88/90 และ C.3–C.5](../spec.md#c-external-provider-evidence--แยกจาก-implementation) กับ [map](../../ecm-attachment-safety/map.md) เป็น index ไม่ใช่ผลทดลอง ADR 0003/0004 และ root `CONTEXT.md` ที่อ่านยังคง project-name/scalar fiscal-year semantics เดิม ไม่มี ADR change
- **Local 01 — partial, inherited execution evidence:** [01 Integration evidence](01-same-name-uploads-and-receipt-conflicts.md#integration-evidence--2026-11-18) ระบุ integration `108fb942dc434b8d7f4e3079852039f3ebdfc36a`, isolated actual-HTTP naming/receipt paths ผ่านพร้อม fixture failure และ targeted repair ที่รายงานแยก Final full-suite/native warnings ยัง pending ตาม owner ไม่เรียกว่าทั้ง 01 complete ไม่รันซ้ำในตั๋วนี้ และไม่ใช้ test counts เป็น DCM acceptance
- **Historical provider — partial only:** D06 บันทึก POST ชื่อฐานที่อนุญาต ณ `2026-11-18T10:11:31.192Z`, PDF 667 bytes, HTTP 200, adapter ยอมรับ original file-object paired receipt และ authenticated original GET HTTP 200 สำหรับ receipt นั้น Old originals สามรายการยังอ่านได้ตามหลักฐานเดิม นี่เป็น standalone provider probe **ไม่มี scalar/table button, Form/Response, round หรือ physical slot mapping** จึงไม่เติม PASS ให้ช่องใดด้านล่าง ไม่ยุติ HTTP 500 เดิมหรือรับรอง DELETE
- **Historical original-reader evidence — partial:** R บันทึก PDF 629 bytes บน integrated reader `6ae84f9` / production source `90b9e9b` วันที่ 2026-11-17; ไม่ใช่ผล source `1affbc0` และไม่พิสูจน์ reopen/number-change ต่อทุกปุ่ม อย่าใช้ข้อความ “file_link เป็น HTML” ในส่วนเก่าลบล้าง public original GET discovery/supplement ภายหลัง
- **Provider documentation — partial:** R อ้าง AquilaAPI public collection วันที่ `2026-11-18 09:33:25 GMT`, document hash `6264d1100015250ca75a3b23083395c58f569a3d4eec4456b8c057551335daf4`; template เป็น multipart Text `"1"`, success data เป็น object ได้ ไม่ใช่ guarantee ทุก type/size/access หรือ provider semantic revision งานนี้ไม่ fetch เอกสาร/API ใหม่
- **Hindsight `pdms-knowledge` — skipped, 2026-11-19:** mounted selectors ไม่รองรับ bank/types/budget จึงไม่ได้ข้อมูลจาก bank รอบนี้ ไม่ใช่ retrieved/failed recall และไม่มี bank writes `document_id`, `chunk_id`, `stable_document_id`, `source_revision/source_revisions` ของการ retrieval รอบนี้ขาดทั้งหมด `source_path` ของหลักฐาน local ระบุด้วยลิงก์ตาราง; inherited IDs ใน R ไม่ใช่ผล discovery รอบนี้

#### Execution boundary — ยังไม่ครบ จึงไม่ dispatch

| Gate | หลักฐาน/สถานะปัจจุบัน | สิ่งที่ต้องมีเพื่อเริ่ม |
| --- | --- | --- |
| Source / isolated-first | baseline `1affbc0`; local 01 evidence ตาม owner ข้างต้น | ผูก isolated proof ที่เกี่ยวข้องกับ source ที่จะทดลองจริง ไม่ต้องรอ full-browser 06 |
| Account/environment | Historical record ใช้ shared Folio service coordinator ที่ DCM host ตาม D06; account identity/permission และ environment สำหรับรอบใหม่นี้ยังไม่ยืนยัน | ระบุบัญชีด้วย sanitized alias, environment และผู้อนุญาต โดยไม่เผย secret |
| Configuration | **not inspected / unknown** งานนี้ไม่ได้ตรวจ credential presence/validity จึงไม่อ้างว่า credentials หาย | หากตรวจ presence ภายหลัง ให้แสดง boolean เท่านั้น; configuration presence ไม่ใช่ write permission |
| Destination / known files | อนุญาตพิจารณาเฉพาะฐาน `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45)`; historical destination `DMS/ShareFiles/2567/กทอ.67-00-0001/2. มติและการก่อหนี้` ไม่ใช่การยืนยันสถานะปัจจุบัน | ขอบเขต synthetic writes ต่อ extension/slot/path และ ownership/collision boundary ที่รับทราบ known same-name files; ไม่ถือ search ว่างเป็น safe-write proof |
| Prior authorization | Historical same-name one-POST approval ใช้ไปแล้ว; ticket approval/base restriction ไม่ต่อสิทธิ์ให้ matrix ใหม่ | explicit execution authorization ของรอบนี้ ไม่สลับ project/template/เติมชื่อทดสอบเพื่อหลบ collision |
| Number-change | เปลี่ยน root `docs_number` ออกจาก `กทอ.67-00-0001` จะออกนอกฐานอนุญาต | คง real cells pending จนมี authorization เพิ่มที่ระบุจริง; ไม่ invent alternate project ตรวจ local flow แยกได้ |
| Stop / cleanup | Policy หยุด unexpected error/unknown/unsafe alias; ไม่ auto POST/DELETE retry; known files ไม่ disposable | owner รับผิดชอบ artifacts/cleanup และยืนยัน stop conditions ใน execution scope; DELETE ต้องอนุญาตแยก ไม่มี DELETE ใน ticket 08 |

#### Sanitized matrix — pending แยกต่อ button/path/family

`S` หมายถึง **ทุก scalar binding ของ fixture ที่ได้รับอนุญาตแยกแต่ละปุ่ม**; `T` หมายถึง **ทุก configured attachment column × physical body row ของ fixture แยกแต่ละปุ่ม** ไม่ใช่ผลรวม/ปุ่มตัวแทน Actual fixture, Form/Response aliases, binding/Tag, physical row และ round ยังไม่ได้รับขอบเขตรอบใหม่ จึงยังไม่มี actual slot inventory; ห้ามแปลง S/T เป็น observed slots หรือ PASS เมื่ออนุญาตแล้วต้องขยายแต่ละ row ต่อ actual slot ก่อนทดลอง โดยใช้ receipt correlation alias ที่ไม่เผย token/link

ทุก `P` = **pending / insufficient: ไม่รัน provider ในรอบนี้ ไม่มี API outcome, validated paired receipt หรือ access result ของ cell นั้น** ทุก `N` = เช่นเดียวกับ P และ number-change authorization ยังเกินฐานเดิม Human review ของทุก cell = **pyw1tt pending** ไม่ใช่ approved result

| Family / dimension (ขนาดเป็น actual File bytes ไม่ใช้ rounded provider size) | Button | Initial upload | Reopen / access | docs_number change / trusted saved reference |
| --- | --- | --- | --- | --- |
| PDF / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| PDF / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |
| DOCX / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| DOCX / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |
| XLSX / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| XLSX / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |
| Image / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| Image / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |
| Text / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| Text / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |
| HTML original / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| HTML original / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |
| Benign binary/ZIP / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| Benign binary/ZIP / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |
| Password-protected / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| Password-protected / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |
| Extensionless / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| Extensionless / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |
| Case-preserved extension / representative size ยังไม่กำหนด | S ทุกปุ่ม | P | P | N |
| Case-preserved extension / representative size ยังไม่กำหนด | T ทุกปุ่ม | P | P | N |

Boundary dimension แยกจาก format families ไม่บังคับทุก family × size combination และไม่ใช้ไฟล์ว่างเป็น valid-content sample ของทุก format:

| Actual bytes | Button | Initial upload | Reopen / access | Number-change | Local reject / no-dispatch |
| --- | --- | --- | --- | --- | --- |
| 0 (inclusive) | S ทุกปุ่ม | P | P | N | ไม่ใช่ reject case; saved zero-byte ต้องนับ required หลัง upload+save |
| 0 (inclusive) | T ทุกปุ่ม | P | P | N | คง attachment-only active row; completely empty row ไม่มีไฟล์แยกต่างหาก |
| 10,000,000 (inclusive) | S ทุกปุ่ม | P | P | N | ไม่ใช่ reject case |
| 10,000,000 (inclusive) | T ทุกปุ่ม | P | P | N | ไม่ใช่ reject case |
| 10,000,001 | S ทุกปุ่ม | ห้าม live dispatch | N/A | N/A | current-source runtime proof pending; expected Folio 413 ก่อน provider dispatch |
| 10,000,001 | T ทุกปุ่ม | ห้าม live dispatch | N/A | N/A | current-source runtime proof pending; expected Folio 413 ก่อน provider dispatch |

Historical A Smoke A บันทึก local parser รับ 0/10,000,000 และปฏิเสธ 10,000,001 ด้วย 413 ที่ source `0a12d91a5b72d4470ae9ceed1c3d4845d2103ced` + Working Tree วันที่ 2026-11-17 ไม่ใช่ current per-button actual-app no-dispatch proof จึงไม่เติม PASS ให้ boundary cells ไม่มี live oversize trial ที่ต้องรอ

#### Runtime constraints / pending evidence record

- **Current source inspection, not runtime PASS:** CodeGraph ที่ project root พร้อม fingerprint เทียบไฟล์ทั้งสอง worktrees ตรงกัน ณ การอ่าน ยืนยัน shared `EcmClient.upload` รับ object/one-item-array receipt และ reject malformed receipt; `originalBytes`/`originalBody` คง origin/no-redirect/credentials-omit, streamed actual size และ template saved SHA-256; `originalForChangedMetadata` คง committed snapshot/binding/physical-row/account provenance ไม่เลือก search ตามชื่อ; `nativeResponseRequest` คง trusted slot budget, actual file bytes, one file/slot; `checkAttachmentJsonBytes` คง 262,144 UTF-8 bytes ไม่มีการแก้ guard ใดในงานนี้ ไม่อ้างว่า inspection พิสูจน์ runtime/security/concurrency ผ่านครบ
- Runtime integrity/origin/size/hash failure ต้องเก็บ actual failure ตาม slot/path ห้ามถอด check, เปลี่ยนไป picker, ใช้ preview หรือยอม malformed receipt เพื่อเติม matrix Password-protected ไม่ขอ password/ไม่ถอดรหัส/ไม่รับรองเนื้อหา HTML access ไม่ใช้ preview page เป็นหลักฐาน original-file access
- เมื่อมีสิทธิ์ทดลอง แต่ละ actual cell ต้องบันทึก source commit, environment/date, provider revision (หรือ unavailable), fixture alias/family/actual size/extension casing, Form/Response/slot/Tag/physical row/round/path alias, expected/observed API status, original request correlation, validated paired-receipt alias, canonical save outcome และ URL access result ตามสิทธิ์ พร้อม evidence status และ pyw1tt review แยกกัน ไม่ใช้ search result/HTTP 200/counts อย่างเดียว ไม่เก็บ raw token/credential/private URL/original attachment copies ลง repo
- **ปิด remaining criteria ได้เมื่อ:** มี authorized actual slot inventory และ execution boundary ครบ, correlated provider results แยกแต่ละ applicable button/family/path/size, isolated current-source 10,000,001 reject/no-dispatch proof และ pyw1tt disposition ของทุก pending/unsupported cell Number-change ที่ยังเกินฐานเดิมต้องคง pending จนอนุญาตจริง ไม่ลด product limits/requiredness ตามการขาดหลักฐาน
- **ไม่เป็น gate ของ 08:** exact upload/download bytes/SHA comparison, 1/10/20 full-size workloads, aggregate capacity/two-Response workloads, batch cap หรือ unlimited-capacity claim ไม่เพิ่มกลับมา Original identity/history/DELETE isolation เป็น 07; original-request finality เป็น 09 และไม่ถูกปลดด้วย matrix นี้
- **Not run:** builds/tests/lint/formatters, HTTP/browser/native smoke, credential inspection, live login/search/GET/POST/DELETE, data changes, push/deploy ไม่มี provider result ใหม่และยังไม่ขอหรือได้รับ pyw1tt acceptance ในงานนี้

### 2026-11-19 — อนุญาตทดสอบ DCM จริงแบบจำกัดโครงการ

ผู้ใช้อนุญาตเริ่มทดสอบใน `กทอ.67-00-0001` ตาม [ขอบเขตในสเปก](../spec.md#ขอบเขตทดสอบ-dcm-จริง) แล้ว แทนข้อที่ยังรออนุญาตเริ่มรอบใหม่ใน assessment เดิม ช่องเปลี่ยน `docs_number` ออกจากโครงการยังทดสอบได้เฉพาะ local ไม่ส่งไฟล์ 10,000,001 bytes ไป DCM และไม่ถือว่า matrix ผ่านจนได้ผลแต่ละช่อง

### 2026-11-19 — Local file boundaries verified; provider cells blocked

[Live preflight](../acceptance/07-08-scoped-dcm-preflight.json) verified the only permitted project/destination and found five same-base PDFs. No trusted ownership/custody boundary was established for new synthetic writes there. No provider upload, access by original receipt or DELETE was attempted for this matrix. A different extension or an empty search would not establish a safe test destination. Number-change outside the project stays local.

The focused local HTTP run passed **29 cases / 1,032 assertions** total across type/size and settlement. Named type/size cases covered scalar 0 and 10,000,000 bytes, extensionless/case-preserved/encrypted fixtures, template saved-reference number-change, physical table gaps and attachment-only zero-byte rows. Scalar and table 10,000,001-byte cases returned 413 without provider dispatch. Each selected case ran once against an isolated PostgreSQL/store and controlled provider; this does not fill an actual DCM per-slot cell or add aggregate-capacity work. Status remains `needs-info` / provider HOLD.

### 2026-11-19 — Exact PDF route established; Folio slot matrix still pending

The owner cleared the known-file read/custody boundary for the [standalone same-name PDF trial](../acceptance/07-scoped-dcm-same-name-pdf.json). The trial verified upload and original access in the intended directory, but exercised no Folio attachment slot. No row in the per-button matrix is marked passed. Start that matrix with a fresh isolated Folio slot using the confirmed PDF route, no prior attachment on the slot, and scoped transport that refuses any DELETE. Other extensions and file-size cells still need their own in-scope destination and receipt/access evidence; do not infer routing from the PDF. Number-change to another project and oversize rejection stay local.

### 2026-11-19 — Actual scalar button, live DCM receipt, Folio Save did not commit

[Attempt ledger](../acceptance/08-scoped-folio-slot.json): actual Chrome/ONLYOFFICE opened `folio_scalar` at C4 on a fresh synthetic Form and selected `pdf-scalar.pdf` (631 bytes). The real Folio Save admitted HTTP 202; the test relay forwarded exactly one live `template="1"` upload to the confirmed DCM route. DCM returned HTTP/business 200 and a distinct paired receipt; an original GET through that same receipt returned 200, `application/pdf`, and a readable body. The original link is not used as a Folio saved attachment.

Folio instead ended `document_save_failed` / `attachment_upload_failed`; its local version was `unknown`, batch `cleanup-pending`, with no saved attachment or canonical reference. The isolated process logged `Decompression error: ZlibError`. Local Bun reproduction proved that forwarding an already-decoded gzip response with the original encoding header can cause `ZlibError`, and that constructing a response from identical decoded bytes without the stale header fixes the relay. The original live encoding header was not captured; this is evidence of a test-relay defect mechanism, not a demonstrated production Folio defect.

**ทำต่อไม่ได้ในรอบนี้:** halted live writes after attempt 1, with no resend, receipt adoption or DELETE. A separate local table follow-up reached the three-attempt cap during native menu activation; it never reached Save. No live cell passed all criteria. Next run must verify the corrected relay against a local authenticated Folio Save/reopen before any new live slot case. Keep other formats, both live inclusive boundaries and out-of-project number changes unverified/local as applicable.

Artifact under pyw1tt custody: `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf`, `2. มติและการก่อหนี้`, DCM create time `2026-11-19 14:39:26`, 631 bytes. This is not the earlier 628-byte artifact. The owned browser, DB, bucket and private fixtures were removed; no live Folio records or application source changed.

### 2026-11-19 — Sandbox gate passed; three live slot cells passed; zero-byte scalar rejected

[Follow-up ledger](../acceptance/08-sandbox-and-live-follow-up.json) records actual Chrome/ONLYOFFICE Save and fresh reopen for scalar C4 and table C10, physical row 0, with **no DCM access during sandbox**. The loopback fixture sent gzip; the shared temporary relay retained the decoded JSON bytes and omitted the stale encoding header. Both canonical references, saved picker links and original access matched. Each Save ran once; each reopen passed on attempt 2.

With the same relay against exact project `กทอ.67-00-0001`, three new cases passed end to end on attempt 1: representative PDF 635 bytes at table row 0; PDF exactly 10,000,000 bytes at scalar C4 and table row 0. All three original POST responses advertised `gzip`; the relay forwarded the unchanged decoded payload without `Content-Encoding`. Each receipt was distinct from all known pairs then present, Folio committed the exact slot reference and XLSX URL, and fresh native reopen showed the saved name/size/link. GET via each exact new receipt returned 200 and readable PDF body. This is receipt/access evidence, not a full-byte integrity comparison.

**ทำต่อไม่ได้สำหรับ 0 bytes รอบนี้:** DCM returned HTTP 422 for the scalar empty `.pdf` after one dispatch, before any successful receipt. Folio retained zero canonical references and a scoped unresolved attachment (`unknown`, `cleanup-pending`). No provider validation body was captured; do not infer a provider-wide type rule or that no external effect occurred. Stopped immediately, no repeat POST or DELETE. Zero-byte table, other file families and out-of-project number-change remain untested live; the failed representative scalar case in the prior round was not repeated. Three affirmative cells do not close 08 or human acceptance.

pyw1tt custody: three newly confirmed test files all bear `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf` in `2. มติและการก่อหนี้`. DCM create times and actual input sizes: `14:52:46` (635 bytes, table); `14:53:12` (10,000,000 bytes, scalar); `14:53:30` (10,000,000 bytes, table), all `2026-11-19` as displayed by DCM. No confirmed artifact for the HTTP 422 request. Only sandbox resources were removed.

### Product decision — minimum new upload

ผู้ใช้รายงานจาก DCM โดยตรงว่า 0 bytes ได้ HTTP 422, 1 byte ไม่ผ่านเมื่อทดสอบซ้ำ และ 2/3/5/10/100 bytes ผ่าน จากนั้นอนุมัติให้ Folio รับเฉพาะ 2–10,000,000 bytes สำหรับการอัปโหลดใหม่ ไม่เปลี่ยนสถานะข้อมูลที่บันทึกไว้เดิม ผลตรงกับชนิดและตัวอย่างที่ผู้ใช้ลองเท่านั้น; ไม่เติม PASS ให้ Folio slot/path matrix และไม่ยุติ original request ที่ยัง unknown ข้อสังเกตเรื่อง 0 bytes ด้านบนเป็นประวัติ ไม่ใช่ live test ที่ยังต้องรันภายใต้กฎใหม่

### 2026-11-19 — Two-byte slots passed sandbox; live destination fenced

[Native continuation](../acceptance-report.md#08--two-byte-native-buttons-sandbox-pass-live-preflight-blocked): ปุ่มเดี่ยวและปุ่มตาราง physical row 0 ผ่านครั้งแรกใน sandbox ทั้ง Save, canonical receipt/XLSX URL, fresh reopen และ exact-receipt HTTP 200. **DCM จริงทั้งสองปุ่มยังไม่ได้ส่ง (0 POST)** เพราะคำขอ 0 bytes เดิมยังไม่มีหลักฐานสิ้นสุด และชื่อปลายทางเดียวกันถูกบล็อกตาม unresolved-destination guard ข้าม Response. สิทธิ์ทดสอบยังอยู่ในขอบเขตเดิม ไม่ใช่สิทธิ์ข้าม guard. ติดต่อ DCM เพื่อขอหลักฐานที่ผูกกับคำขอเดิมก่อนปลดขอบเขตนี้ ไม่มี DELETE หรือการส่งซ้ำ.

### Owner closure — 0-byte case only

ผู้ใช้แจ้งว่า DCM ยืนยันพฤติกรรมของระบบในรอบนั้น: คำขอ 0 bytes ที่ตอบ `422` ถูกปฏิเสธก่อนเขียนไฟล์และก่อนเข้าคิว จึงปิดเฉพาะกรณี 0 bytes ไม่ปิดตั๋ว 08 ผล 2 bytes ใน sandbox ผ่านทั้งสองปุ่ม ส่วน live ทั้งสองช่องยัง **pending / ไม่ได้ส่ง** ต้องตรวจปลายทางและไฟล์ชื่อซ้ำก่อน POST ตามขอบเขตเดิม ดู [รายงาน](../acceptance-report.md#08--two-byte-native-buttons-sandbox-pass-live-preflight-blocked).

### Scoped live minimum and representative scalar PDF

[รายงาน](../acceptance-report.md#08--scoped-live-minimum-and-representative-scalar-pdf): DCM จริงผ่านครั้งแรกทั้ง 2 bytes ปุ่มเดี่ยว, 2 bytes ปุ่มตารางแถว 0 และ PDF 586 bytes ปุ่มเดี่ยว แต่ละเคส Folio commit, fresh reopen และเปิดจาก paired receipt ของคำขอนั้นได้ (`HTTP 200`) ไม่ทดสอบ 0 bytes ซ้ำและไม่มี DELETE. `docs_number` changed-reference reuse และตัวอย่างชนิดไฟล์ผ่าน 11 HTTP cases ในระบบแยกเท่านั้น. เส้นทาง live ของชนิด/นามสกุลอื่นยังไม่ยืนยัน; number-change นอกโครงการไม่อยู่ในสิทธิ์; human review และช่องที่เหลือยังค้าง.

### Provider confirmation for the remaining formats

ผู้ใช้แจ้งว่า DCM ยืนยันว่า `template_name` กับ `docs_number` เพียงพอต่อการเก็บไฟล์ รองรับทุกชนิดใน matrix แยกรายการตามนามสกุล/ตัวพิมพ์ และรับชื่อซ้ำ การยืนยันนี้รองรับการเริ่มตรวจในปลายทางที่อนุญาต ไม่แทนผลจริงของแต่ละปุ่ม และไม่ใช้ลบล้างประวัติ receipt ซ้ำ ตรวจปลายทาง, receipt และการชนกับข้อมูลเดิมต่อคำขอ; หยุดเมื่อผลไม่แน่นอนหรือพบ alias.

### Scoped non-PDF run — stopped after scalar HTML rejection

[ผลรอบล่าสุด](../acceptance-report.md#08--scoped-non-pdf-run-stopped-at-html): DOCX, XLSX, PNG และ TXT ผ่าน DCM จริงทั้งปุ่มเดี่ยวกับปุ่มตารางแถว 0 ครั้งแรก รวม 8 เคสที่ Folio commit, reopen และ GET จาก receipt เดิมได้. HTML 59 bytes ปุ่มเดี่ยวได้ `HTTP 422` ครั้งแรก (`2026-11-19 16:51:37` เวลาไทย), ไม่มี canonical commit หรือ receipt และยังไม่ทราบผลสุดท้ายของคำขอนี้. หยุดโดยไม่ส่งซ้ำ ไม่ DELETE และไม่ส่ง HTML ปุ่มตาราง, BIN, ZIP ติดรหัส, extensionless หรือ `.PNG`. รอ DCM ยืนยันสาเหตุและผลสุดท้ายของคำขอ HTML เดิม; human review ยัง pending.

### HTML unsupported — independent format cases may continue

ผู้ใช้แจ้งผลยืนยันจาก DCM ว่า `.html` ไม่รองรับ จึงบันทึก HTML ปุ่มเดี่ยวเป็น rejected และปุ่มตารางเป็น unsupported / not run ไม่ส่ง `.html` ซ้ำ คำยืนยันนี้ไม่บอกว่าคำขอเดิมจบโดยไม่มีผลข้างเคียง ฝั่ง DCM ยังไม่มีรายชื่อนามสกุลที่ไม่รองรับครบและให้ตรวจชนิดที่เหลือในขอบเขตเดิมได้ โดยใช้ชื่อปลายทางจริงของแต่ละชนิด ไม่เปลี่ยนชื่อคำขอ HTML เดิม และไม่ปลด unresolved fence.

### Independent continuation — BIN failed on first scalar upload

[ผลรอบล่าสุด](../acceptance-report.md#08--html-unsupported-separate-bin-trial-stopped): `.bin` 37 bytes ที่ปุ่มเดี่ยวได้ `HTTP 422` เมื่อ `2026-11-19 16:58:13` เวลาไทย ไม่มี receipt หรือ canonical commit และยังไม่มีหลักฐานผลสุดท้าย จึงหยุด ไม่ส่งซ้ำ. ผลนี้ยังไม่ใช่คำยืนยันว่า DCM ไม่รองรับ `.bin` ทุกกรณี. BIN ปุ่มตาราง, ZIP ติดรหัส, ไฟล์ไม่มีนามสกุล และ `.PNG` ยังไม่ dispatch. ไม่มี DELETE.

### BIN unsupported — combined remaining-format report requested

ผู้ใช้แจ้งว่า DCM ไม่รองรับ `.bin` จึงไม่นำ BIN หรือ HTML กลับไปส่งซ้ำ และไม่เพิ่ม Folio allowlist จากผลนี้ คงการติดตามผลสุดท้ายของคำขอเดิมแยกจากการรองรับชนิดไฟล์ ผู้ใช้ให้ตรวจเคสชนิดไฟล์ที่เหลือในขอบเขตเดิมและรายงานผลรวมครั้งเดียว.

### Combined remaining-format results

[สรุปทุกชนิดที่อยู่ใน matrix](../acceptance-report.md#08--combined-format-disposition): `.PNG` ผ่านจริงทั้งสองปุ่มและคืน receipt คนละคู่กับ `.png`; `.html` กับ `.bin` คือ DCM ยืนยันว่าไม่รองรับ. ZIP ปกติ 235 bytes และไฟล์ไม่มีนามสกุล 58 bytes ได้ `HTTP 422` ครั้งแรกที่ปุ่มเดี่ยว ไม่มี receipt หรือ canonical commit. ยังไม่สรุปว่าไม่รองรับทั้งชนิด ไม่ส่งปุ่มตารางหรือ ZIP ติดรหัสที่มีชื่อปลายทางตรงกับคำขอที่ยังไม่ยืนยันผล. ตั๋ว 08 ยังค้างผลจาก DCM สำหรับสองกรณีนี้และ human review.

### Provider confirmation — ZIP and extensionless unsupported

ผู้ใช้แจ้งว่า DCM ยืนยันไม่รองรับ ZIP และไฟล์ไม่มีนามสกุล จึงไม่นำ ZIP ปกติ, ZIP ติดรหัส หรือไฟล์ไม่มีนามสกุลกลับไปส่งเพื่อเติม matrix. ในขอบเขตที่ตรวจ PDF, DOCX, XLSX, PNG (`.png` / `.PNG`) และ TXT ผ่านทั้งสองปุ่ม; DCM ยืนยัน HTML, BIN, ZIP และไฟล์ไม่มีนามสกุลไม่รองรับ. ผลนี้ไม่ใช้ยุติ original-request finality หรือเปลี่ยนกฎชนิดไฟล์ของ Folio. Live `docs_number` นอกโครงการยังไม่ได้ทดสอบ และ human review ยัง pending.

### Folio upload policy amendment

ผู้ใช้อนุมัติให้ Folio จำกัดการอัปโหลดใหม่ตามนามสกุลท้ายชื่อไฟล์ `.pdf`, `.docx`, `.xlsx`, `.png`, `.txt` แบบไม่แยกตัวพิมพ์และคงชื่อเดิม ไม่ตรวจ MIME หรือเนื้อหา ใช้ทั้ง User Save Draft/Submit และ final Admin Correction คงขนาดเดิมและสิทธิ์อ่านไฟล์ที่บันทึกแล้ว; การเปลี่ยนปลายทางที่ต้องอัปโหลดไฟล์เดิมนอกเงื่อนไขให้เลือกไฟล์ใหม่ ไม่เปลี่ยนข้อมูลที่เก็บไว้. การเปลี่ยนนโยบาย Folio ไม่ใช่ DCM re-acceptance.

pyw1tt authorized continuing ticket 08. Recorded format/size outcomes stand, including both buttons for the supported set. Live destination change remains untested: it needs the exact second authorized synthetic `docs_number` and destination within the approved scope (or a separately scoped exception). Do not use the local destination-change results as DCM evidence. No new DCM request was sent for this continuation.

### Live `docs_number` 0001 to 0003 — stopped before upload

pyw1tt authorized testing `กทอ.67-00-0001` to `กทอ.67-00-0003` with the existing template `ก่อหนี้-4_ขยาย(45)`. The source directory and its exact receipts were observed during ticket 07. The scoped local ledger check found no unresolved versions or cleanup for the proposed checked filenames in the two projects. This does not waive provider preflight.

At `12:18:10–12:18:35Z`, DCM returned HTTP and business 200 with zero results for each of three bounded read-only queries: exact `กทอ.67-00-0003`, exact project path `DMS/ShareFiles/2567/กทอ.67-00-0003`, and exact folder path `DMS/ShareFiles/2567/กทอ.67-00-0003/2. มติและการก่อหนี้`. Under the configured account, the expected project and template destination were not verified. This does not prove the project does not exist elsewhere or diagnose the provider's visibility. No upload, DELETE, original retrieval, new login, folder creation, or search for another project was made for this case. No fourth query.

To resume, obtain the exact existing DCM destination for `กทอ.67-00-0003` under the Folio service account, or explicit approval for a different, ready synthetic project. Keep the previously recorded 11 local cases separate from real DCM routing acceptance.

### UI evidence and one authorized API retry

pyw1tt supplied a DCM UI screenshot showing the `กทอ.67-00-0003` folder under shared files / `2567`, and authorized one retry. At `2026-11-19T12:33:22.933Z`, the existing Folio service account searched the exact project path `DMS/ShareFiles/2567/กทอ.67-00-0003`. DCM returned HTTP/business 200 with zero results and no verified `2. มติและการก่อหนี้` routing folder. The screenshot supports visibility for its UI session; it does not establish visibility, the canonical path, or the frozen template's routing for the API account. No access mismatch cause is asserted.

Stopped after that one retry. No login, upload, DELETE, or read of file originals. Need DCM to verify the exact API-visible project/folder for the Folio service account and its `template=1` routing under `ก่อหนี้-4_ขยาย(45)` before another write attempt. See the [DCM Production test policy](../spec.md#why-live-tests-use-dcm-production) for per-run authorization and cleanup.

### Live 0001 to 0003 — both attachment slots verified

The owner supplied Postman and DCM UI evidence of a successful 2-byte PDF upload to `DMS/ShareFiles/2567/กทอ.67-00-0003/2. มติและการก่อหนี้`. Postman included `documentYear=2567`; this is not evidence that Folio sends or needs that field. The existing Folio service account's first read-only search returned HTTP 401; one coordinated login restored access. Exact project and filename searches then both found the user's existing 2-byte control at that path. The earlier zero-result searches did not prove that upload or routing was unavailable. No raw screenshot receipts, tokens or links were copied into this report.

Actual Folio HTTP: from isolated PostgreSQL/RustFS, an authenticated Submission saved a scalar TXT and a table TXT at physical row index 2 under `กทอ.67-00-0001`. Admin changed only `docs_number` to `กทอ.67-00-0003` in a final Correction without selecting new Files. The existing Folio client used both saved paired receipts and fetched both exact originals by token. Against real DCM it sent `template=1` with `documentFile` only, no `documentYear`. Both uploads returned the expected exact destination and distinct pairs. Both selected XLSX exports projected their own links in the same slots. Four committed attachment versions and four canonical references backed the two immutable snapshots. The final case passed (110 assertions).

The final post-check verified SHA-256 on all four new originals and on all five known same-name source controls, including two confirmed files from the earlier setup. The 29 previous source pairs and one previous destination pair remained. Final journey plus pre/post evidence: four searches, four real file POSTs, 16 original GETs, zero live DELETEs. Two initial scenarios failed within the three-attempt cap: a throwaway relay ArrayBuffer hash error before any provider file POST, then a loopback app origin mismatch after two settled source uploads but before any destination dispatch. Confirmed the origin guard with zero transport and fixed the test environment only. The last run used new synthetic files, not a replay of an unsettled request.

Files created by Folio for cleanup by pyw1tt; all times 2026-11-19 ICT (UTC+7), same `2. มติและการก่อหนี้` folder under each project:

| Project | Exact filename | Size | DCM create time |
| --- | --- | ---: | --- |
| `กทอ.67-00-0001` | `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).txt` | 27 bytes | 20:00:22 |
| `กทอ.67-00-0001` | `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).txt` | 41 bytes | 20:00:22 |
| `กทอ.67-00-0001` | `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).txt` | 33 bytes | 20:02:18 |
| `กทอ.67-00-0001` | `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).txt` | 47 bytes | 20:02:18 |
| `กทอ.67-00-0003` | `กทอ.67-00-0003-ก่อหนี้-4_ขยาย(45).txt` | 33 bytes | 20:02:20 |
| `กทอ.67-00-0003` | `กทอ.67-00-0003-ก่อหนี้-4_ขยาย(45).txt` | 47 bytes | 20:02:21 |

Folio did not delete any test or original file in DCM. Removed only private sandboxes, harnesses and buckets. Owner authorized bounded tests for `กทอ.67-00-0000` through `กทอ.67-00-0009`; used only 0001 and 0003. DCM automatic folder creation upon successful upload was reported by the owner, not exercised. The live destination change here is final Admin Correction for both slots, not a new native browser gesture test or a live retest of the other User routing paths. pyw1tt accepted and closed the scoped result. The six-file cleanup list above remains with pyw1tt; closure does not authorize DELETE, push or deploy.
