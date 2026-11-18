# หลักฐาน DCM แยกไฟล์ชื่อเติมเลขและคง original bytes

Labels: wayfinder:task Type: task Parent: ../map.md Assignee: pyw1tt Status: resolved

## Question

Human/provider ต้องส่งหลักฐานหรืออนุมัติแผนเก็บหลักฐานแบบใด จึงรับรองได้ว่าชื่อปลายทางใหม่ที่เติม suffix สร้าง resource แยกจริง และทุก saved reference ยังดาวน์โหลด original bytes ของตนได้?

เป็น task แบบ HITL จัดหา provider evidence หรือแผนทดสอบที่อนุมัติชัดเจน ไม่ใช่การเลือกคำตอบแทน provider การอนุมัติแผนอย่างเดียวยังไม่ใช่ผลทดสอบผ่าน หากปิดขั้นวางแผนด้วย approved plan ต้องระบุ acceptance ที่ยัง HOLD และเจ้าของหลักฐานปลายทาง

ขอบเขต namespace ภายนอกอยู่ที่ [ป้องกันชื่อชนกับไฟล์นอก Folio ledger](02-external-filename-collisions.md) ส่วนข้อมูลที่ share identity ไปแล้วอยู่ที่ [ตรวจ shared identities เดิมและนโยบายกู้ไฟล์ที่ถูกเขียนทับ](03-existing-aliases-recovery.md) การพิสูจน์ resource ใหม่ไม่ใช่การกู้ bytes เก่า

## หลักฐานตั้งต้น

- [หลักฐาน routing จากผู้ใช้](../../ecm-storage-templates/planning.md#หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง) ยืนยัน wildcard แยกปี/หมวดแล้ว ไม่ถามเรื่องการมี routing ซ้ำ แต่ยังไม่ยืนยัน byte independence, suffix/case preservation หรือ external namespace safety
- [รายงานตาราง: Save และชื่อปลายทาง](../../ecm-storage-templates/table-upload-behavior-audit.md#e-save-และชื่อปลายทาง-dcm) และ [BATCH evidence](../../ecm-storage-templates/acceptance-matrix.md#batch-filename-verification) เป็น historical local/source evidence ไม่ใช่ real DCM acceptance ของชื่อใหม่
- Same destination เขียนทับพร้อม token/URL เดิมเป็นข้อเท็จจริงที่ยอมรับแล้วตาม [สถานะคำถามปัจจุบัน](../../ecm-storage-templates/planning.md#สถานะคำถามปัจจุบัน) ไม่ขอพิสูจน์ซ้ำว่าเกิดได้หรือไม่

## Evidence checklist สำหรับ human/provider

- [ ] ระบุเจ้าของคำยืนยัน วันที่ environment/provider revision ที่ทราบ และขอบเขตแม่แบบที่รับรอง; ช่องที่ไม่มีให้ระบุ unknown
- [ ] ใช้ synthetic A/B/C ที่ bytes ต่างกัน ตรวจชื่อจริง รวม suffix, literal suffix ใน template, original extension/casing และ extensionless โดยไม่แก้ frozen `template_name`
- [ ] ตรวจ original bytes ของ A และ B หลังสร้าง C และหลัง reopen/retrieve; token/link ต่างกันหรือ HTTP สำเร็จอย่างเดียวไม่พิสูจน์ independence
- [ ] แยกการคงชื่อจริงจาก routing ที่ผู้ใช้ยืนยันแล้ว: provider ตัด suffix, normalize case/Unicode/whitespace หรือ alias หลายชื่อเข้าทรัพยากรเดียวกันหรือไม่ ให้ระบุเฉพาะ guarantee ที่พิสูจน์ได้
- [ ] หากจำเป็นต้องพิสูจน์ DELETE isolation ให้อนุมัติ scope แยก ตรวจ ownership/collision ก่อน write และลบเฉพาะ resource ที่พิสูจน์ว่าสร้างในรอบนี้ ไม่มี survivor/history ใช้ ไม่ลบ alias เพราะ token ต่างกัน
- [ ] เก็บ sanitized manifest ของชื่อที่ส่ง/ที่ provider เก็บ, paired receipts และ hashes/bytes ก่อนและหลัง; ไม่ลง credentials, tokens หรือ private evidence URLs ใน repo
- [ ] แผน live test ต้องมีบัญชี/ขอบเขตชื่อและ destination, stop condition เมื่อ unknown outcome, cleanup owner และข้อห้าม auto POST/DELETE retry; charting session ไม่ได้อนุญาตให้ดำเนินการ

## เกณฑ์คำตอบ

บันทึกผล supported/partial/conflicting/insufficient แยกตาม guarantee พร้อมข้อจำกัด หาก provider ไม่รับรองให้ระบุว่าไม่รับรองและคง HOLD อย่าเปลี่ยน public-link policy เป็น private URL requirement เพื่อปิดช่องว่างนี้

## Comments

2026-11-18: เปิดคำถามและรายการหลักฐานเท่านั้น ยังไม่มี provider acceptance ใหม่ ไม่มี live trial หรือ decision resolution

### 2026-11-18 — pyw1tt — เริ่ม session; รอ human ยืนยันเส้นทางหลักฐาน

- Claim ตาม frontier แรกของ map ยังไม่ resolve และไม่มี provider acceptance ใหม่
- อ่าน [หลักฐาน routing และนโยบายชื่อภายใน batch](../../ecm-storage-templates/planning.md#หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง) และ [ขอบเขต provider ในสเปกชื่อข้าม save](../spec.md#implementation-decisions) เป็น Markdown snapshots ไม่ใช่ผล Production ส่วน routing รับเป็น user-reported evidence ตามขอบเขตเดิม ไม่ถามซ้ำ
- Current Working Tree ที่อ่านผ่าน CodeGraph: `numberDuplicateAttachmentFilenames` และ `planAttachmentUploads` ใน `apps/server/src/ecm/attachments.ts` จัดชื่อใน request; `EcmClient.originalBytes` ใน `apps/server/src/ecm/client.ts` ตรวจ size/hash สำหรับ template mode Source นี้ไม่พิสูจน์ resource independence ของ DCM และไม่ได้ตรวจ deployed revision
- Session recall retrieved เวลา 2026-11-18 03:04 UTC ใช้นำทางเท่านั้น ไม่ใช่ canonical evidence; `pdms-knowledge` discovery skipped เพราะไม่มีเครื่องมือเลือก bank นี้ใน session และ `docs/knowledge/` ไม่มีใน checkout นี้ ข้อมูล `document_id`, `chunk_id`, `source_path`, `stable_document_id`, `source_revision`/`source_revisions` ของ Hindsight canonical document จึงไม่มีให้ยืนยัน
- ข้อเสนอรออนุมัติ: ขอ existing evidence/คำรับรองจากทีม DCM ก่อน โดยระบุผู้รับรอง วันที่ environment/revision และขอบเขตชื่อที่รับรอง ตรวจ A/B/C ซึ่ง bytes ต่างกันกับชื่อฐาน/ชื่อเติมเลข รวม literal suffix, extension/casing และ extensionless แล้วอ่านทุก reference กลับเทียบ exact bytes/SHA-256 หลังสร้าง C และหลังเปิดอ่านใหม่ เก็บชื่อที่ส่ง/ชื่อจริงและ paired receipts แบบ sanitized; token/URL ต่างกันหรือ HTTP สำเร็จอย่างเดียวไม่ผ่าน
- ขอให้ human ยืนยันผู้ประสานหลักฐาน; แนะนำผู้ขับ map ประสานทีม DCM โดยทีม DCM รับรอง provider semantics ไม่ถือว่าได้แต่งตั้งหรืออนุมัติแล้ว
- หากหลักฐานไม่ครบ ให้เสนอ live-test scope แยกก่อนดำเนินการ ต้องมีบัญชี/environment, destination และ namespace ที่ได้รับอนุญาต, ownership/collision check, stop condition และ cleanup owner ห้ามอาศัยเพียง search ไม่พบ ห้าม auto POST/DELETE retry และ DELETE ต้องได้รับอนุมัติแยก
- ไม่มี application/schema/DB changes ไม่มี live DCM calls หรือการรัน tests ในงาน planning นี้ Acceptance คง **HOLD**; ไม่เปลี่ยน blockers หรือ Decisions so far จนกว่าจะได้คำตอบจาก human

### 2026-11-18 — pyw1tt — ไม่มีช่องทางขอหลักฐานจาก DCM

- **คำตอบจากผู้ใช้:** ไม่สามารถขอหลักฐานหรือประสานผู้รับรอง DCM ได้ เพราะผู้ประสานเดิมไม่อยู่แล้ว ทีม Folio ต้องตัดสินใจเอง ข้อนี้แทนข้อเสนอให้ขอ existing evidence และรอทีม DCM จากรอบก่อน ไม่ถือว่าผู้ใช้รับรอง provider semantics หรืออนุญาต live writes
- **ข้อเสนอรอ human ยืนยัน:** ใช้หลักฐานที่ทีม Folio เก็บเองแทน provider sign-off ผู้ช่วยเป็นผู้ดำเนินการตรวจภายใน scope ที่อนุมัติ และผู้ขับ map เป็นผู้ตรวจรับ ไม่ผูกความคืบหน้ากับผู้ประสาน DCM ที่ไม่มีแล้ว
- คง checklist เดิมสำหรับ A/B/C, exact bytes หลัง upload/retrieve, suffix/literal suffix, original extension/casing และ extensionless รายงานผลเฉพาะ environment, วันที่ และ scenarios ที่ตรวจจริง ไม่อ้างว่าเป็น guarantee ทั่ว DCM หรือรับประกันพฤติกรรมหลัง provider เปลี่ยน
- ก่อน live test ต้องระบุบัญชี/environment และ destination/ชื่อทดสอบที่ยืนยันสิทธิ์และแยกจากข้อมูลจริงได้ การค้นไม่พบชื่ออย่างเดียวไม่พิสูจน์ว่าเขียนได้ปลอดภัย หากยืนยัน boundary นี้ไม่ได้ให้ HOLD โดยไม่ทดลองกับไฟล์จริง
- เมื่อมีขอบเขตที่อนุมัติแล้ว จึงใช้ synthetic files ที่ bytes ต่างกัน เก็บ sanitized manifest และอ่าน A/B กลับทั้งก่อนและหลังสร้าง C รวมการอ่านใหม่อีกครั้ง ผลไม่ตรง, alias, ชื่อถูกเปลี่ยนอย่างไม่ปลอดภัย หรือ outcome ไม่แน่นอนให้หยุด ไม่ POST/DELETE ซ้ำ ไม่สลับชื่อเพื่อหลบ unknown outcome และไม่ลบข้อมูลเดิม
- การอนุมัติแผนเก็บหลักฐานไม่ใช่การอนุญาต execute หรือผล acceptance; DELETE/cleanup ต้องมีขอบเขตและอนุมัติแยก Ticket ยังเปิดและ acceptance ยัง **HOLD** ระหว่างรอยืนยันแผนนี้

### Resolution — 2026-11-18 — pyw1tt — อนุมัติแผนเก็บหลักฐานโดยทีม Folio

- **Human decision — approved:** ผู้ใช้ตอบ “อนุมัติตามแผนได้เลย” ต่อแผนที่ทีม Folio เก็บหลักฐานเองใน comment “ไม่มีช่องทางขอหลักฐานจาก DCM” และคำถามยืนยันแผนใน session นี้ จึงปิดเฉพาะขั้นตัดสินเส้นทาง/อนุมัติแผน ไม่ใช่ปิด acceptance ของ provider หรืออนุมัติ implementation/release
- **แผนที่อนุมัติ:** ใช้ Evidence checklist ของ ticket นี้และรายละเอียด comment ก่อนหน้า ตรวจ synthetic A/B/C ที่ bytes ต่างกัน ภายใต้ชื่อฐาน/ชื่อเติมเลข รวม literal suffix, original extension/casing และ extensionless อ่านทุก saved reference กลับเทียบ exact bytes/SHA-256 หลังสร้าง C และหลังเปิดอ่านใหม่ เก็บ sanitized manifest ของชื่อที่ส่ง/ชื่อจริงและ paired receipts ไม่บันทึก credentials, tokens หรือ private evidence URLs ใน repo
- **เจ้าของ:** ทีม Folio เก็บหลักฐานและตัดสินจากผลที่สังเกตได้ ไม่รอผู้ประสานหรือคำรับรอง DCM ผู้ช่วยดำเนินการตรวจเมื่อได้รับอนุมัติ execution scope; pyw1tt เป็นเจ้าของการกำหนดขอบเขตและตรวจรับหลักฐานปลายทาง
- **Execution gate:** ยังไม่มีการอนุญาต live calls จากการอนุมัติแผนนี้ ก่อนเริ่มต้องกำหนดและอนุมัติบัญชี/environment, destination/ชื่อทดสอบที่มีสิทธิ์และแยกจากข้อมูลจริง, ownership/collision boundary, stop condition และ cleanup owner หากพิสูจน์พื้นที่ปลอดภัยไม่ได้ให้ HOLD ไม่ถือว่า search ไม่พบเป็นหลักฐานความปลอดภัย การทำ DELETE ต้องอนุมัติแยกและลบได้เฉพาะ resource ที่พิสูจน์ว่าสร้างในรอบทดสอบ ไม่มี survivor/history ใช้ และไม่เป็น shared alias
- **Stop conditions:** bytes ไม่ตรง, receipt/resource alias, ชื่อถูกเปลี่ยนอย่างไม่ปลอดภัย หรือ outcome ไม่แน่นอน ให้หยุดและเก็บหลักฐาน ไม่ auto POST/DELETE retry ไม่สลับชื่อเพื่อส่งใหม่ และไม่ลบไฟล์เดิม
- **Evidence status:** approved plan **supported** โดย human approval; independent original bytes, suffix/case/name preservation และ DELETE isolation ยัง **insufficient / unverified — HOLD** ไม่มี live trial ใหม่ใน session นี้ คำรับรองจำกัดเฉพาะ environment, วันที่/revision ที่ทราบ และ scenarios ที่ตรวจจริง ไม่ขยายเป็น guarantee ทั้ง DCM หรือหลัง provider เปลี่ยน
- **ผลต่อ tickets อื่น:** dependency ของขั้นวางแผนนี้ถือว่า resolved แต่ไม่ส่งต่อ identity/namespace guarantee ที่ยังไม่มี การตัดสินข้อมูลเดิมหรือ release ที่ต้องใช้ผลจริงยังต้องระบุหลักฐานที่ขาดและคง HOLD งาน external namespace และการกู้ bytes เดิมยังเป็นของ tickets เจ้าของเดิม ไม่สร้าง execution ticket เพิ่มนอก Destination ของ map

### Amendment — 2026-11-18 — เปลี่ยนชื่อทดสอบตาม timestamp policy

- ผู้ใช้อนุมัติ intended timestamp policy แทน `-(n)` ระหว่าง [ป้องกันชื่อชนกับไฟล์นอก Folio ledger](02-external-filename-collisions.md#2026-11-18--pyw1tt--อนุมัติ-timestamp-และยอมรับ-external-collision-risk) ชื่อ ticket และ Resolution เดิมคงไว้เป็นประวัติ ส่วนแผนเก็บหลักฐาน A/B/C ครั้งถัดไปให้ใช้ชื่อ timestamp ตาม [สเปกเจ้าของกฎ](../spec.md#implementation-decisions) แทน generated counter suffix พร้อมตรวจการคง timestamp เต็ม, literal text เดิมในแม่แบบ, original extension/casing และ extensionless
- การยอมรับ residual external-collision risk ไม่ใช่การรับรอง independent bytes/name preservation หรือการอนุญาต live calls; execution scope และ DELETE approval เดิมยังใช้ ไม่ relabel BATCH/counter results เป็น timestamp evidence และไม่ปิด provider acceptance ที่ยัง HOLD

### Amendment — 2026-11-18 — ยืนยัน counter ข้าม Save แทน timestamp

- [Q1 A และ Q2 A ที่ผู้ใช้ยืนยันล่าสุด](02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--q1-a-และ-q2-a) แทน amendment timestamp ก่อนหน้า แผน A/B/C ครั้งถัดไปใช้ชื่อฐาน/ชื่อเติม `-(n)` หลายรอบตาม [สเปกเจ้าของกฎ](../spec.md#implementation-decisions) ไม่ reset ทุก Save; ตรวจ suffix/literal suffix, original extension/casing, extensionless และ exact bytes ของทุก reference ตามแผนเดิม
- ทีม Folio เก็บหลักฐานเองตาม Resolution เดิม และยอมรับ residual external-overwrite risk ตาม Q2 A ไม่อ้างว่าพื้นที่ทดสอบปลอดภัยจาก search ไม่พบเพียงอย่างเดียว ยังต้องอนุมัติ execution scope ที่แยกจากข้อมูลจริงและ DELETE แยก; ไม่มี provider acceptance ใหม่หรือ live calls จาก amendment นี้

### Amendment — 2026-11-18 — เปลี่ยนแผนหลักฐานเป็นชื่อฐานซ้ำตามคำตอบล่าสุด

- [Resolution ชื่อล่าสุด](02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--ใช้ชื่อฐานซ้ำและแยกไฟล์ด้วย-receipt) แทน counter/reservation และ timestamp แล้ว แผนชื่อเติมเลขข้างต้นเป็นประวัติ ไม่บังคับ generated-suffix routing/preservation เป็น prerequisite ของนโยบายชื่อฐานซ้ำ
- Evidence target ปัจจุบันคือ actual uploads ชื่อฐานเดียวกันได้ไฟล์ที่อ้างด้วย receipt ของแต่ละรอบ และ originals ก่อนหน้ายังมี exact bytes เดิมตามขอบเขตที่ใช้งาน รวม same-name scalar/table/revisions คง literal suffix ที่มีจริงใน frozen template ตามเดิม
- [หลักฐาน sample ล่าสุด](06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต) สนับสนุน same-name PDF/project/template กรณีนั้น แต่ยังไม่รับรองทุกชนิด/แม่แบบ/concurrency หรือ DELETE isolation ไม่อนุญาตทดลองเพิ่มหรือปิด provider acceptance อัตโนมัติจาก amendment นี้
