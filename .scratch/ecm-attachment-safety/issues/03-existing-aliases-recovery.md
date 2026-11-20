# ตรวจ shared identities เดิมและนโยบายกู้ไฟล์ที่ถูกเขียนทับ

Labels: wayfinder:grilling Type: grilling Parent: ../map.md Assignee: pyw1tt Status: resolved Blocked by: 01, 02

## Question

ก่อนใช้ชื่อใหม่ จะตรวจพบ shared identities/aliases เดิมและจัดการประวัติที่อาจถูกเขียนทับอย่างไร โดยไม่กล่าวอ้างว่าชื่อใหม่คืน original bytes ที่สูญไปแล้ว?

เป็น HITL policy decision ไม่อนุญาต audit ข้อมูลจริงหรือ migration จากการเปิด ticket นี้

ต้องได้ข้อสรุปจาก [หลักฐาน DCM แยกไฟล์ชื่อเติมเลขและคง original bytes](01-provider-independent-resources.md) และ [ป้องกันชื่อชนกับไฟล์นอก Folio ledger](02-external-filename-collisions.md) ก่อนตัดสิน recovery policy ที่อาศัย identity/namespace guarantees เตรียมคำถามได้ก่อน แต่ยังไม่ resolve ข้าม blockers

ขั้น [หลักฐาน DCM แยกไฟล์ชื่อเติมเลขและคง original bytes](01-provider-independent-resources.md#resolution--2026-11-18--pyw1tt--อนุมัติแผนเก็บหลักฐานโดยทีม-folio) ปิดด้วย approved plan ให้ทีม Folio เก็บหลักฐานเอง ยังไม่มีผลรับรอง identity/byte independence ห้ามถือว่าการปิด dependency นี้พิสูจน์ resource independence หรือใช้ปลด HOLD ของข้อมูลเดิม; policy ที่ต้องอาศัย guarantee ดังกล่าวยังต้องระบุหลักฐานจริงก่อนใช้งาน

## หลักฐานตั้งต้น

- [รายงานตาราง: failure และ cleanup](../../ecm-storage-templates/table-upload-behavior-audit.md#f-batch-failure-และ-cleanup) ระบุว่าคู่ URL/token หลาย attempts อาจอ่าน bytes ปัจจุบันเดียวกัน และ DB rollback ไม่คืน external bytes
- Context ส่งต่อรายงาน local real-HTTP filename-keyed DCM simulation: save แรก A=`[11]`, B=`[22]`; save ถัดมาเปลี่ยนเฉพาะ B เป็น C=`[33]` แล้วดาวน์โหลดสองแถวเป็น `[33]`,`[33]` ส่วน full-row control คง `[11]`,`[33]` เป็น reproduction ใน local controlled provider ไม่ใช่ผล Production และไม่ได้รันซ้ำในงานนี้
- [สเปกชื่อปลายทางไฟล์ใหม่ข้ามรอบบันทึก](../spec.md) ป้องกัน new writes ไม่ใช่การรับรองว่า references เดิม independent หรือ bytes เดิมกู้คืนได้

## ประเด็นสำหรับรอบ grilling

1. ใครอนุมัติ read-only inventory ของ Draft, Submission, Correction, workspace, eligible Operation และ identity aliases ที่ Folio รู้จัก? จะรายงาน unknown external aliases โดยไม่เดาอย่างไร?
2. จะแยก duplicate receipt ที่ทราบว่า share identity, น่าสงสัยว่า overwritten และยืนยัน corruption ด้วยหลักฐานใด? Hash ที่ไม่มีในอดีตต้องเป็น unknown ไม่สร้างย้อนหลังจาก bytes ปัจจุบันแล้วอ้างว่าเป็นอดีต
3. หาก bytes เดิมยังหาได้จากแหล่งที่เจ้าของให้ จะยืนยัน provenance และขออนุมัติ recovery โดยรักษา immutable history อย่างไร? ถ้าไม่มี ให้รายงาน unrecoverable/unknown ไม่ใช้ latest หรือไฟล์จากแถวอื่นแทน
4. ระหว่างตรวจ จะ guard shared identity, cleanup และการใช้งานเดิมอย่างไร? ห้าม rename ทุกไฟล์, ลบ alias หรือแก้ history JSON อัตโนมัติ
5. ผู้ใช้/ผู้ดูแลต้องได้รับข้อความใดเมื่อ URL ยังเปิดได้แต่ integrity ของ historical bytes ไม่ยืนยัน? แยก local known bug จากข้อกล่าวหา Production เสียหาย

## เกณฑ์คำตอบ

- [x] อนุมัติแผน read-only inventory ของข้อมูลที่ Folio รู้จัก พร้อมผู้ตรวจรับและ classification ตามหลักฐาน; execution scope ต้องอนุมัติแยก
- [x] กำหนด recovery policy: ต้องมี trusted original และอนุมัติ remediation รายกลุ่มก่อนแก้; หากไม่มีให้รายงานข้อจำกัด ไม่แทนไฟล์หรือสร้างหลักฐานย้อนหลัง
- [x] กำหนด data-use ระหว่างตรวจ: คง known guards และสิทธิ์อ่าน/ส่งออกเดิม แจ้งข้อจำกัดแก่ผู้เกี่ยวข้อง ไม่บล็อกทั้งระบบเพียงเพราะยังตรวจไม่ครบ; pyw1tt ตรวจรับรายงานและตัดสิน remediation
- [x] คง public-link/external-history/DCM-only standing constraints ไม่เปิด private archive redesign และไม่ถือการปิด planning ticket เป็นผล audit/recovery ผ่าน

## Comments

2026-11-18: ไม่มีการตรวจ Production data ไม่มีการกู้ bytes หรือแก้ history ในงาน charting นี้

### 2026-11-18 — pyw1tt — เริ่ม session; รอ human ตัดสินแผนข้อมูลเดิม

- Claim ตาม frontier หลัง blockers ทั้งสองปิดขั้นตัดสินแล้ว งานนี้ยังเป็น planning-only ไม่อนุญาต read-only audit ข้อมูลจริง, original download, recovery, migration หรือ live DCM จากการเปิด ticket นี้
- **Standing decisions:** [Q1 A และ Q2 A](02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--q1-a-และ-q2-a) ให้ใช้ counter พร้อม durable reservation ข้าม Save และยอมรับ overwrite ของ external files ที่ Folio ไม่มีข้อมูล ไม่ได้ยกเว้น known ownership/history/shared-reference guards และไม่ใช่การกู้ bytes ของไฟล์เก่า ไม่เปิดสองคำถามนี้ซ้ำ
- **Canonical local evidence:** อ่าน [CONTEXT: Attachment Field](../../../CONTEXT.md#attachment-field), [สเปก admission/ข้อมูลเดิมและข้อห้ามกู้ด้วยการตั้งชื่อ](../spec.md#implementation-decisions) และ [historical failure/cleanup evidence](../../ecm-storage-templates/table-upload-behavior-audit.md#f-batch-failure-และ-cleanup) เอกสารเป็น Markdown snapshots ที่อ่านวันที่ 2026-11-18 ไม่ใช่ผล Production; audit เดิมมี revision/scope ตาม parent map ไม่ relabel เป็น runtime verification ใหม่
- **Current Source — supported เฉพาะส่วนที่อ่าน:** CodeGraph เปิด `identityVersionIds`, `receiveAttachmentIdentity`, `attachmentIdentityReferenced`, `admitAttachmentDestination` และ `requireAttachmentDeleteReady` ใน `apps/server/src/ecm/identity.ts` พบการรวม attempts ตาม identity, admission ที่ตรวจ protected references และ deletion guards Source แสดงกลไกคุ้มครองที่มีอยู่ แต่ไม่พิสูจน์ว่ามี shared/corrupt Production files จริง ไม่ได้ตรวจ committed/deployed revision, DB หรือ original bytes ใหม่
- **คำอธิบายตั้งต้น:** “หลายรายการใช้ไฟล์ร่วม” คือหลายช่องหรือหลาย revision อ้าง resource เดียว ไม่ใช่ข้อสรุปว่าไฟล์เสียเสมอไป เช่น revision ที่ไม่ได้เปลี่ยนไฟล์อาจ reuse reference ตามสัญญา ต้องแยกการใช้ร่วมออกจาก integrity ซึ่งต้องเทียบ trusted original evidence ไม่สร้าง historical hash จาก bytes ปัจจุบันแล้วอ้างว่าเป็นอดีต
- **ข้อเสนอรออนุมัติ — inventory plan:** ทีม Folio ตรวจแบบ read-only เฉพาะข้อมูลที่ Folio รู้จัก ครอบคลุม Draft, Submission, Correction, workspace, eligible Operation และ aliases รวม records ที่เก็บไว้หลัง Response deletion เพื่อไม่ตกหล่น จัดกลุ่ม resource ร่วมและรายงาน integrity เป็นตรงกับ trusted original/ยังยืนยันไม่ได้/พบต่างจาก trusted original ตามหลักฐาน ไม่สแกน arbitrary DCM inventory หรือแก้ข้อมูลจริงใน session นี้ Execution scope ต้องกำหนดและอนุมัติแยก
- **ข้อเสนอรออนุมัติ — recovery policy:** ไม่มี automatic rename/reupload/delete/แก้ history เมื่อพบ alias ถ้าหา trusted original ได้ให้เสนอ recovery scope พร้อม provenance และ human approval แยกก่อนแก้ หากไม่มีให้รายงาน “ยังยืนยันหรือกู้คืนจากหลักฐานที่มีไม่ได้” ไม่ใช้ latest หรือไฟล์แถวอื่นแทน ไม่ประกาศเสียหาย/กู้ไม่ได้ถาวรจากการไม่มี historical hash เพียงอย่างเดียว
- **ข้อเสนอรออนุมัติ — review/data use:** ให้ pyw1tt ตรวจรับรายงานและอนุมัติ remediation รายกลุ่ม คง guards เดิมต่อ known protected/shared/unsettled identities ไม่ลบ alias เพื่อเปิดทาง อ่าน/ส่งออก saved revisions เดิมตามสิทธิ์ได้แต่ไม่รับรองว่า external bytes เป็น original เมื่อยังไม่มีหลักฐาน รายงานข้อจำกัดให้ผู้ดูแลและผู้ที่เปิด revision ที่เกี่ยวข้องผ่านเส้นทางเดิม โดยไม่เพิ่ม dashboard หรือ manual unlock ใหม่ ไม่บล็อกทั้งระบบเพียงเพราะยังไม่ได้ทำ inventory
- ตาม workflow ล่าสุด คุยตั๋วให้จบก่อนแล้วค่อยทบทวน remaining HOLD จาก Resolution ไม่เปิด HOLD checklist ซ้ำ ตอนนี้ยังไม่มี human answers, provider evidence หรือผล audit ใหม่ จึงไม่ resolve และไม่เพิ่ม Decisions so far

### Resolution — 2026-11-18 — pyw1tt — เห็นด้วยกับ Q1 ถึง Q3

- **Human decision — approved:** ผู้ใช้ตอบ “q1-3 เห็นด้วยทั้งหมด” หลังได้รับคำอธิบายการเก็บไฟล์จริงใน DCM, attachment objects ใน answer JSON และ ledger แยก จึงปิดขั้นตัดสินแผนตรวจข้อมูลเดิม/recovery/data-use ตาม Q1–Q3 ไม่ใช่อนุมัติลงมือ audit หรือแก้ข้อมูลจริง
- **Q1 — approved inventory plan:** ทีม Folio ตรวจแบบ read-only เฉพาะข้อมูลที่ Folio รู้จัก ครอบคลุม Draft, Submission, Correction, workspace, eligible Operations และ records/aliases ที่ยังเก็บไว้เพื่อรักษาหลักฐาน จัดกลุ่มรายการที่ใช้ resource ร่วม แยก integrity เป็นตรงกับ trusted original/ยังยืนยันไม่ได้/พบต่างจาก trusted original ตามหลักฐาน การใช้ resource ร่วมไม่ใช่ corruption โดยตัวมันเอง และการไม่มี historical hash ไม่ใช่หลักฐานว่า bytes เสียหาย ห้ามสร้าง hash จาก bytes ปัจจุบันแล้วย้อนอ้างว่าเป็นต้นฉบับเก่า
- **Execution boundary:** ก่อนตรวจข้อมูลจริงต้องกำหนดและอนุมัติ environment/DB, ขอบเขต records, สิทธิ์เข้าถึง, รูปแบบ sanitized report และขอบเขต original-byte retrieval หากต้องใช้ แยกจากการอนุมัติแผนนี้ ไม่สแกน arbitrary external DCM inventory และไม่บันทึก credentials, tokens หรือ private evidence URLs ลง repo
- **Q2 — approved recovery policy:** ไม่ rename/reupload/delete/แก้ history อัตโนมัติ ถ้าได้ trusted original ที่เจ้าของให้และตรวจยืนยัน provenance ได้ ให้เสนอ recovery scope พร้อมผลกระทบต่อ references/history และขออนุมัติแยกก่อนแก้ ถ้าไม่มีให้คงข้อมูลและรายงาน “ยังยืนยันหรือกู้คืนจากหลักฐานที่มีไม่ได้” ไม่ใช้ latest หรือไฟล์แถวอื่นแทน ไม่ประกาศกู้ไม่ได้ถาวรจากการไม่มีหลักฐานเพียงอย่างเดียว คง DCM-only originals ไม่เพิ่มสำเนาใน RustFS/DB หรือ private archive
- **Q3 — approved review/data-use policy:** pyw1tt เป็นผู้ตรวจรับรายงานและอนุมัติ remediation รายกลุ่ม ระหว่างนั้นคง known ownership/protected-history/reference/shared-identity/unknown-operation guards เดิม ไม่ลบ alias เพื่อเปิดทาง ไม่บล็อกทั้งระบบเพียงเพราะ inventory ยังไม่ครบ อ่าน/ส่งออก saved revisions ตามสิทธิ์เดิมได้ แต่ต้องแจ้งข้อจำกัดแก่ผู้ดูแลและผู้ที่เปิด revision ที่เกี่ยวข้องเมื่อยืนยันเนื้อหาเดิมไม่ได้ ไม่กล่าวว่าการเปิด URL สำเร็จยืนยัน original bytes และไม่เพิ่ม dashboard/manual unlock ใหม่จากงานนี้
- **ผลต่อคำตัดสินก่อนหน้า:** คง [counter ข้าม Save และ external overwrite acceptance](02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--q1-a-และ-q2-a) การยอมรับไฟล์ภายนอกที่ Folio ไม่มีข้อมูลไม่ยกเว้นการคุ้มครองข้อมูลที่ Folio รู้จัก การตั้งชื่อใหม่และการคง JSON snapshots ไม่กู้ bytes ที่ DCM เคยเขียนทับ
- **Evidence status:** แผน inventory, recovery policy และผู้ตรวจรับ/data-use policy **supported โดย human approval**; ยังไม่มีผล inventory, trusted original comparison, Production corruption finding หรือ recovery result ใหม่ ไม่ตรวจ DB ไม่ fetch originals ไม่ทำ migration/application changes หรือ live DCM calls ใน session นี้ การรับรอง integrity ของข้อมูลเดิมต้องใช้ผลตรวจจริงก่อนกล่าวว่า verified
- **Tracking:** เพิ่มข้อสรุปใน map และชี้ policy นี้จากสเปกชื่อข้าม Save ไม่มี fog ใหม่หรือตั๋ว execution เพิ่ม ณ ขั้นวางแผนนี้ ตาม workflow ที่ตกลงไว้ ให้คุยตั๋วที่เหลือให้ครบก่อน แล้วทบทวน remaining HOLD จาก Resolution ล่าสุดครั้งเดียว ไม่เปิด HOLD checklist ซ้ำ และไม่ถือ approved plan เป็น provider acceptance
