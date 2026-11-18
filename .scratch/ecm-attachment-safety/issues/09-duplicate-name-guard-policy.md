# ขอบเขต guard สำหรับไฟล์ชื่อซ้ำและ receipt ที่ชนข้อมูลเดิม

Labels: wayfinder:grilling Type: grilling Parent: ../map.md Assignee: pyw1tt Status: resolved Blocked by: 02

## Question

หลังอนุมัติให้ template-mode uploads ใช้ชื่อฐานซ้ำ จะเลิกบล็อกเพียงเพราะ filename ตรงกับไฟล์เก่าอย่างไร และยังหยุดก่อน/หลัง dispatch เมื่อมี ownership, protected-resource/reference, alias หรือ unknown-operation conflict จากหลักฐานจริงแบบใด?

คุยแบบ HITL ด้วย grilling และ domain-modeling เป็น decision ไม่ใช่ implementation ticket หรืออนุญาตส่ง live API เพิ่ม

## หลักฐานและขอบเขต

- [Resolution ชื่อฐานซ้ำ](02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--ใช้ชื่อฐานซ้ำและแยกไฟล์ด้วย-receipt) และ [canonical contract](../spec.md#implementation-decisions) แทน counter/reservation โดยไม่เปลี่ยน legacy UUID หรือ old receipts/files
- [Scoped create-new evidence](06-unknown-settlement-contract.md#2026-11-18--pyw1tt--ชื่อซ้ำสร้างรายการใหม่และ-bytes-เดิมยังอยู่ในการทดสอบที่อนุญาต) ยืนยันหนึ่ง actual same-name PDF upload มี new original bytes และ old originals ไม่เปลี่ยน ไม่ใช่ DELETE/all-type/concurrency guarantee
- Diagnostic ในบทสนทนาปัจจุบันผ่าน isolated HTTP จริง: Submit แรกสำเร็จ; new round ใช้เลขเดิม failed ข้อความ destination protected ก่อน provider POST เพราะ old Submission reference ต่างจาก new Draft snapshot; เปลี่ยนเฉพาะเลขใน test หรือ Save Draft ก่อน Submit ผ่าน Temporary instrumentation/DB/store ถูกนำออก ไม่ได้แก้ application หรือข้อมูลของผู้ใช้
- Source owner: [admitAttachmentDestination](../../../apps/server/src/ecm/identity.ts#L34-L143), [receiveAttachmentIdentity](../../../apps/server/src/ecm/identity.ts#L145-L199), [reference/delete readiness](../../../apps/server/src/ecm/identity.ts#L201-L305) และ [upload planning/dispatch](../../../apps/server/src/ecm/attachments.ts#L549-L690) เป็น Working Tree evidence ไม่ใช่การยืนยัน deployed revision
- [Unknown/cleanup owner](06-unknown-settlement-contract.md) และ [old-data/reference policy](03-existing-aliases-recovery.md#resolution--2026-11-18--pyw1tt--เห็นด้วยกับ-q1-ถึง-q3) ยังอยู่ ไม่ถือคำตอบเรื่องชื่อว่าอนุมัติ manual unlock หรือ cleanup retry

## ประเด็นสำหรับรอบ grilling

1. Filename ตรงอย่างเดียวควรยังบล็อก actual new template upload หรือไม่? แยกจาก actor/owner/lease/revision/trusted slot/metadata และ original unresolved Operation ที่ยังต้องตรวจ
2. หลัง original response คืน receipt ใหม่ จะ commit ให้ slot/revision ของคำขอนั้นเมื่อใด และจะป้องกัน client token/URL หรือ search-by-name adoption อย่างไร?
3. ถ้า actual new upload คืน paired receipt เดิม/partial alias ที่ชน protected identity จะคง snapshot/pending state และรายงาน external effects อย่างไร โดยไม่ pretend rollback, adopt history, DELETE หรือ resend เพื่อแก้เอง?
4. กรณี own unprotected Draft identity, legacy mode และ unknown/in-flight operations ยังใช้ขอบเขตเดิมส่วนใด และส่วนใดต้องแยกจากชื่อซ้ำโดยไม่ขยายสิทธิ์?
5. Acceptance ต้องครอบคลุม same-number Submit รอบใหม่, Correction, scalar/table, receipt conflicts, references และ no-resend/no-loss อย่างไร ไม่เปลี่ยน tests ให้ทุก request ผ่านเพื่อซ่อน alias conflict?

## Comments

2026-11-18: สร้างหลัง user naming answer “เลือกA” และ claim โดย pyw1tt เพื่อคุย guard ต่อ รายการข้างต้นเป็นคำถาม ไม่ใช่ human approval ยังไม่ implement ไม่ resolve และไม่ authorize live POST/DELETE เพิ่ม

### 2026-11-18 — pyw1tt — Q2 รอบแรก: แยกชื่อซ้ำออกจากการเขียนทับประวัติ

- หลัง user เลือก A เรื่องชื่อและปิด Resolution เจ้าของชื่อแล้ว จึงเริ่มคุย guard ticket นี้ ข้อเสนอรอ human คือไม่ reject actual new template upload เพียงเพราะ filename ตรงกับ saved file/Submission เก่า แต่คง actor/owner, lease/revision, trusted slot/metadata, original pending Operation และ protected-resource/reference requirements
- Normal path ที่เสนอ: เมื่อ original request คืน receipt ใหม่ที่ผ่าน checks ให้ผูก receipt นั้นกับ snapshot/slot ของคำขอใหม่ ขณะที่ Submission เดิมคง canonical reference เดิม ไม่เปลี่ยน history ไปใช้ไฟล์ล่าสุดจากชื่อ
- กรณี receipt ใหม่กลับเป็น paired identity เดิม/partial alias หรือผล request ไม่ชัด เป็นคำถามถัดไป ยังไม่ถือว่า human อนุญาต adopt/overwrite protected resource, ปิด conflict checks, DELETE หรือ resend เพื่อให้ผ่าน
- รอบนี้อัปเดตเฉพาะเอกสาร สเปก/parent references เปลี่ยนตาม naming Resolution แล้ว ตรวจ local links/anchors ที่เกี่ยวข้อง 74 จุดผ่าน ไม่ได้แก้หรือรัน application/provider tests ใหม่ และยังไม่มีคำตอบ Q2

### Human decision — 2026-11-18 — Q2 normal path และ receipt ของทุกรอบ

- **Approved:** ผู้ใช้ตอบ “เห็นด้วย เพิ่มเติมว่ารอบอื่นๆมันก็จะต้องเก็บtokenหรืออื่นๆไว้ด้วยเหมือนกันนะ” ต่อ Q2 ที่เสนอให้ไม่บล็อก actual new template upload เพียงเพราะชื่อซ้ำ แต่คง actor/owner, lease/revision, trusted slot/metadata, original unresolved Operation และ protected-resource/reference requirements
- **Normal path:** เมื่อ original request สำเร็จและ receipt ใหม่ผ่าน checks ให้ผูก receipt กับ canonical slot/snapshot ของคำขอนั้น Submission เก่ายังคงอ้างไฟล์เดิม ไม่เปลี่ยน history ไปใช้ผลล่าสุดจาก filename
- **ทุก upload/ทุกรอบ ไม่ใช่แค่ตัวอย่างสองรอบ:** เก็บ original attempt/receipt evidence ตาม lifecycle เดิม และเมื่อ canonical commit ให้แต่ละ scalar/table slot ใน Draft ปัจจุบัน, Submission แต่ละรอบ และ Correction แต่ละ revision เก็บ metadata ของไฟล์ที่ snapshot นั้นอ้างจริง ได้แก่ `file_token`, `file_link`, `original_name`, `size_bytes`; table attachment มี trusted `row_index` ตาม schema เดิม ไม่เพิ่ม fields จากคำว่า “อื่นๆ” โดยเดา
- **Unchanged-file reuse:** ถ้ารอบนั้นไม่ได้เปลี่ยนไฟล์/metadata ให้ snapshot คง canonical receipt เดิม ไม่บังคับ new token หรือ upload เพิ่มเพียงเพราะต้องมี metadata ในรอบนั้น Save Draft ยังอัปเดต current Draft ตามเดิม ไม่สร้าง immutable history ของทุก Draft save เป็น feature ใหม่ ไม่เปลี่ยน legacy/ordinary Published PoC contracts ย้อนหลัง
- **Source verification:** CodeGraph เปิด `attachmentSchema` / `tableAttachmentSchema` และ `completeDraftOperation` / `completeSubmitOperation` / `completeCorrectionOperation` ยืนยัน existing metadata shape และ transactional JSON persistence/reference commit ของแต่ละ snapshot เป็น Current Source evidence ไม่ใช่ผล runtime test ใหม่หรือการยืนยันว่าปรับ filename guard แล้ว
- **Still pending:** กรณี actual new upload คืน paired receipt เดิม/partial alias โดยเฉพาะเมื่อชน protected history และกรณี own unprotected Draft/unknown scope ยังต้องคุย ไม่ถือ Q2 ว่าอนุมัติ adopt shared receipt, overwrite history, DELETE/resend หรือปิด checks ทั้งหมด ตั๋วยัง claimed ไม่ resolve

### 2026-11-18 — pyw1tt — Q3 รอ human: receipt ชนไฟล์ของประวัติ

- สถานการณ์ตัวอย่าง: Submission เก่าอ้างไฟล์ A ด้วย token/link A ผู้ใช้เลือกไฟล์ B สำหรับรอบใหม่ แต่ original response ของ upload B คืน token/link A เดิมที่อ้าง protected resource
- ข้อเสนอรอคำตอบ: ไม่ commit คำตอบรอบใหม่โดยนำ identity ของ history มาอ้างเป็นไฟล์ใหม่ คง saved snapshot และ pending Files ที่ยังมีอยู่ แจ้ง conflict ให้ตรวจ original operation/resource ไม่ DELETE หรือ resend อัตโนมัติ และไม่รับรองว่า remote bytes ของ A ยังเดิมเพราะ POST อาจเกิดผลไปแล้ว
- ยังไม่สรุปกรณี own unprotected Draft identity ในคำถามนี้ และไม่มี live API/application/DB changes จากการเสนอ Q3

### Human decision — 2026-11-18 — Q3 หยุด receipt ที่ชนประวัติและแจ้งเตือนแยกเหตุผล

- **Approved:** ผู้ใช้ตอบ “ตามแนะนำและ ให้ดักให้ได้ว่ามันเอาของประวัติเก่ากลับมา และแจ้งเตือนเพื่อให้จําแนกได้” ยืนยันข้อเสนอ Q3 ให้หยุด canonical commit ของรอบใหม่เมื่อ original upload response อ้าง resource ของ protected history แทนการรับเป็นไฟล์ใหม่ และเพิ่มข้อกำหนดให้ตรวจจับ/แจ้งเตือนจำแนกสาเหตุ ไม่ใช้ generic filename-collision message แทนทุกกรณี
- **Detection:** เทียบ trusted original receipt กับ account/resource identity, paired token/link, aliases และ surviving Submission/Correction references ทุก revision ที่มีหลักฐาน ไม่ตรวจแค่ชื่อ/ขนาด/timestamp หรือสองรอบล่าสุด ชื่อเดียวกันแต่ distinct valid receipt และไม่ชน protected resource ยังเป็น normal path ของ Q2
- **Truthful classification:** ถ้า paired receipt ตรงกับ known history ให้ระบุว่า “ข้อมูลอ้างอิงไฟล์ตรงกับประวัติเดิม” ไม่อ้างว่าอ่านแล้วพิสูจน์ actual old bytes ของ provider หากชนเพียง token หรือ link ให้ existing fail-closed identity reconciliation หยุดและจำแนกว่าเป็นตัวอ้างอิงขัดแย้ง/ยังยืนยัน identity ไม่ครบ ไม่ยกระดับ partial match เป็น proof ว่าเป็นไฟล์เก่าชุดเดิม
- **Warning requirements:** ใช้ error/notice surfaces เดิมให้สอดคล้องกัน ระบุว่าไม่บันทึกรอบใหม่ เหตุผลเป็น receipt/history conflict ไม่ใช่เพียงชื่อซ้ำ พร้อม Field/Tag และ physical row แบบที่ User เข้าใจ และรายการ Submission/Correction/revision ที่ตรงเมื่อมีหลักฐานและสิทธิ์เข้าถึง ไม่เผยข้อมูลของผู้อื่นเกินสิทธิ์หรือ service credentials/raw tokens ในข้อความ
- **Protected state / no extra effects:** คง saved canonical snapshot/references เดิมและ pending Files ที่ยังอยู่ในหน้า ไม่ adopt receipt ของ history ไปเป็นคำตอบใหม่ ไม่ DELETE resource ร่วม ไม่ resend/เปลี่ยนชื่อเพื่อหนี conflict และไม่บอกว่าการ cancel/ไม่ commit ย้อน external overwrite ได้ Provider bytes อาจเปลี่ยนไปแล้วก่อนตรวจ receipt จึงต้องรายงานข้อจำกัดตามจริง
- **Durable evidence:** เก็บ original request/receipt และ conflict/identity/reference evidence ตาม existing Operation/ledger/follow-up lifecycle เพื่อให้ตรวจย้อนกลับได้ ไม่เพิ่ม answer JSON flags/fields หรือ manual unlock จาก operator note และไม่ใช้ search-by-name/latest เป็นหลักฐานระบุตัวไฟล์ของคำขอเดิม
- **Acceptance เพิ่ม:** same-name/new valid receipt ต้องไม่ถูกแจ้งเป็น history conflict; known protected paired receipt กับ one-sided/ambiguous aliases ต้องถูกแยกตามหลักฐาน ผู้ใช้เห็นเหตุผลกับ slot/row ที่เกี่ยวข้องภายใต้สิทธิ์ และทุก conflict case ไม่ commit partial snapshot, เปลี่ยน historical references, ทิ้ง pending state หรือสร้าง extra POST/DELETE ไม่ยึด exact UI wording เป็น test oracle
- **Still pending:** ขอบเขตเมื่อ receipt ตรงกับ own unprotected Draft, legacy mode และ in-flight/unknown scope ยังต้องคุย ไม่ถือ Q3 ว่าปิดทั้งตั๋วหรืออนุญาต implementation ไม่มี application/DB/provider changes หรือ runtime tests ใหม่จากการบันทึกคำตอบ

### 2026-11-18 — pyw1tt — Q4 รอ human: receipt เดิมของ Draft ที่ยังไม่ส่ง

- สถานการณ์แยกจาก Q3: current Draft ของ User เองมี A ซึ่งไม่มี Submission/Correction/คนอื่น/workspace/eligible Operation อ้าง ผู้ใช้เลือก B ที่ bytes ต่างกันและเกิด actual new template upload แต่ response คืน paired receipt เดิมของ A
- ข้อเสนอรอคำตอบคือให้หยุดและแจ้งว่า “ข้อมูลอ้างอิงซ้ำกับไฟล์ร่างเดิม” แยกจาก history conflict ไม่รับเป็น new independent file โดยเงียบ รักษา pending/canonical state และไม่ DELETE/resend อัตโนมัติ เพื่อลดการรับผลที่ยังพิสูจน์ไม่ได้ตาม create-new contract ทั้งนี้ไม่ใช่การรับรองว่า remote A ยังคงเดิม
- การ reuse receipt เดิมเมื่อไฟล์/metadata ไม่เปลี่ยนและไม่มี POST ยังคงอนุญาต ส่วน legacy mode ไม่เปลี่ยนโดยคำถามนี้ ยังไม่มี human answer Q4

### Resolution — 2026-11-18 — pyw1tt — guard และคำเตือนที่จำแนกได้

- **Q4 approved:** ผู้ใช้ตอบ “ตามแนะนำ เพิ่่มเติมว่าควรมีการแจ้งเตือนให้จำแนกได้และต้องแยกออกได้ระหว่างแจ้งเตือนของq3กับq4” ยืนยันให้ actual new template upload ที่คืน paired receipt ของ own current Draft เดิมหยุด canonical commit พร้อมคำเตือนเฉพาะเหตุผล ไม่รับเป็น new independent file โดยเงียบ กรณีนี้เป็น exception policy ที่เลือก ไม่ใช่รายงานว่าพบ provider ทำเช่นนั้นจริง
- **Normal Q2 / all rounds คงตามที่ยืนยันแล้ว:** ไม่บล็อก actual new template upload เพียงชื่อซ้ำ เมื่อ original request คืน valid new receipt ที่ผ่าน checks ให้ผูกกับ slot/snapshot ของรอบนั้น ทุก current Draft/Submission/Correction ที่มีไฟล์เก็บ metadata ตาม schema เดิมและ ledger เก็บ original attempt/receipt evidence ไม่ค้นชื่อแล้วเลือกตัวแรก/ล่าสุด

| เหตุผลที่ระบบจำแนก | ขอบเขตหลักฐาน | ตัวอย่างชื่อคำเตือนสำหรับผู้ใช้ |
| --- | --- | --- |
| Q3 — protected history receipt conflict | Returned resource/paired receipt ตรงกับ surviving Submission/Correction references ที่ตรวจได้ | ข้อมูลอ้างอิงไฟล์ตรงกับประวัติเดิม |
| Q4 — own Draft receipt reused by a new upload | Returned paired receipt ตรงกับ current Draft ของ User เอง และไม่ใช่ protected/shared history/resource ของผู้อื่น | ข้อมูลอ้างอิงไฟล์ซ้ำกับไฟล์ร่างเดิม |

- **Warning contract:** ทั้งสองกรณีบอกว่ารอบนี้ยังไม่บันทึก ระบุ Field/Tag/physical row และรายการอ้างอิงที่ผู้ใช้มีสิทธิ์เห็นตามหลักฐาน ต้องมีเหตุผลจำแนกผ่าน existing error/Operation channels ให้ทั้งหน้าหลักและ plugin feedback สอดคล้องกัน ไม่ใช้ generic “ชื่อซ้ำ/ห้ามเขียนทับ” หรือข้อความเดียวกันกลบ Q3/Q4 ไม่แสดงคำว่า Q3/Q4 เป็นศัพท์ผู้ใช้ และไม่เผย raw token/service credentials หรือประวัติของผู้อื่นเกินสิทธิ์ ตัวอย่าง wording ในตารางไม่ใช่ข้อบังคับ exact copy
- **Precedence and incomplete evidence:** หาก resource มีทั้ง Draft และ history references ให้ใช้ Q3 ไม่ลดระดับเป็น Q4 หากเป็น partial/one-sided/ambiguous alias หรือ protected conflict อื่น ให้คง fail-closed และระบุความขัดแย้ง/หลักฐานไม่ครบตามจริง ไม่เดาว่าเป็น exact history/Draft receipt หรือใช้ชื่อเพียงอย่างเดียวจำแนก
- **No new-upload false positive on reuse:** การใช้ canonical receipt เดิมเมื่อไฟล์/metadata ไม่เปลี่ยนและไม่มี POST ยังคงอนุญาต รวม history/revisions ที่ reuse ไฟล์อย่างถูกต้อง ไม่ใช้ Q3/Q4 ไปบล็อก unchanged saves หรือบังคับ new token ทุก snapshot
- **Stop and preserve:** Q3/Q4 ไม่ commit partial/new canonical snapshot ไม่เปลี่ยน historical references คง saved answer และ pending Files ที่ยังอยู่ในหน้า ไม่ DELETE resource ร่วม ไม่ resend/เปลี่ยนชื่อเพื่อให้ผ่าน ไม่สั่ง refresh/discard เพื่อหลบ error และไม่อ้างว่าการหยุด commit คืน remote bytes ที่อาจเปลี่ยนไปแล้ว
- **Unchanged boundaries:** legacy UUID/Published contracts, actor/owner, lease/revision, trusted physical slots, requiredness/limits, existing resource/reference barriers และ original unknown/in-flight operation safeguards คงเดิม ไม่มี manual unlock หรือ retry policy ใหม่ [Settlement ticket](06-unknown-settlement-contract.md) ยังแยกและไม่ถูกปิดจาก guard Resolution นี้
- **Implementation acceptance:** ใช้ existing isolated HTTP seam ตรวจ first Submit→new round→same-number Submit และหลายรอบ/Correction/scalar/table พร้อม saved JSON/XLSX receipts และ before/after original bytes ตรวจ Q3/Q4 เป็นคนละ semantic reason/slot ภายใต้สิทธิ์ ไม่ยึด exact wording ตรวจ precedence, incomplete aliases, unchanged reuse, pending preservation และไม่มี extra POST/DELETE ใน conflict paths
- **Artifacts / execution:** อัปเดต canonical naming/guard spec, parent contract และ map ให้ชี้ Resolution นี้ ปิดเฉพาะ decision ticket ไม่ใช่ implement หรือผ่าน runtime/real-provider acceptance ไม่มี application/schema/DB/live API/commit/push/deploy changes จากคำตอบนี้ ไม่มีการรับรอง DELETE/all-type/concurrency หรือสาเหตุ HTTP 500 เดิม
