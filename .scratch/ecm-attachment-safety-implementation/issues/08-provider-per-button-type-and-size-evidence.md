# 08: หลักฐาน DCM สำหรับชนิดและขนาดต่อปุ่ม

**What to build:** ตรวจรับการรับส่ง receipt และการเข้าถึงไฟล์ของแต่ละปุ่ม/slot ตามชนิดและขนาดที่ตกลง โดยแยกเส้นทาง initial upload, reopen/access และ number-change saved-reference reuse ไม่เพิ่มการเทียบ bytes หรือ aggregate-capacity workload ที่ผู้ใช้ตัดแล้ว

**Blocked by:** 01 — ส่งชื่อเดิมได้ พร้อม receipt และคำเตือนถูกประเภท.

**Status:** needs-info — reachable gate assessment complete; per-button provider matrix and pyw1tt acceptance remain pending

**Spec coverage:** ECM Attachment Safety implementation spec — US85–88, US90; Testing Decisions C.3–C.5

**Execution prerequisites:** ต้องมีคำสั่งเริ่มงานหลังตรวจตั๋ว และ real-provider execution scope ของ account/environment/approved base/synthetic writes/stop conditions/cleanup owner ที่ชัดเจน DELETE ต้องได้รับอนุญาตแยก ไม่เกิดจากตั๋วนี้

## Acceptance criteria

- [ ] ใช้ revised upload/receipt behavior และ isolated proof จาก 01 ก่อน scoped provider trials ไม่พึ่ง full-browser acceptance ของ 06 และไม่ขอเลือก file types/product limits เดิมซ้ำ
- [ ] Matrix ระบุแต่ละปุ่ม/slot ของตน ทั้ง scalar/table ที่อยู่ใน scope ไม่สรุปรวมว่าทุกปุ่มผ่านจากผลของปุ่มเดียวหรือขนาดรวมต่อ batch
- [ ] Representative families คง PDF, DOCX, XLSX, image, text, HTML original, benign binary/ZIP, password-protected และ extensionless/case-preserved extensions แยกจาก size-boundary dimension ไม่เปลี่ยนเป็น allowlist หรืออ้างว่าทุก format/combination ผ่าน
- [ ] แต่ละ applicable slot/path มีผล initial upload, reopen/access และเปลี่ยน docs_number ผ่าน trusted saved reference ตาม workflow เดิม ไม่บังคับเลือก File ใหม่หรือใช้ preview เพื่อกลบ retrieval failure
- [ ] ตรวจ actual File size ต่อปุ่มที่ 0 และ 10,000,000 bytes แบบ inclusive ส่วน 10,000,001 ต้อง Folio reject ก่อน provider dispatch โดยตรวจ no-dispatch ในระบบแยก ไม่ส่ง oversize ไป live DCM จากแผนนี้
- [ ] คงหนึ่งไฟล์ต่อ slot, zero-byte acceptance/requiredness และ active/empty-row rules ไม่ขอ password/ถอดรหัส/รับรองความปลอดภัยหรือความถูกต้องของเนื้อหา
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
