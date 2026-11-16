# Folio DCM Storage Templates — Specification

Status: ready-for-agent
Decision baseline: ข้อสรุปล่าสุดใน planning.md ณ 2026-11-17
Delivery scope: ผู้ใช้อนุมัติ implementation บน integration branch และ isolated test database เมื่อ 2026-11-17; ไม่อนุมัติ deploy หรือ migration ข้อมูลใช้งานจริง
Human review: implementation authorized; final behavior/provider acceptance pending

## Problem Statement

Admin ต้องจัดการชื่อแม่แบบจัดเก็บเอกสารที่สัมพันธ์กับ Document Category ของ DCM และเลือกแม่แบบให้ปุ่มแนบไฟล์ Excel เดิมได้ครบวงจร ปัจจุบัน Folio เก็บหมวดเป็นชื่อและอัปโหลดด้วยปี เลขหนังสือ หมวด และชื่อแยกฉบับ จึงยังไม่รองรับ catalog ของ `template_name`, category ID และ template-mode upload ตามแผนใหม่

User ต้องบันทึก Draft กลับมาเปลี่ยนไฟล์ ส่ง Submission และแก้ `docs_number` โดยไม่เลือกไฟล์เดิมซ้ำ ไฟล์ต้นฉบับต้องอยู่ที่ DCM แห่งเดียว การเปลี่ยน configuration ส่วนกลางต้องไม่ย้ายไฟล์ เปลี่ยนคำตอบ หรือแก้สัญญา Form ที่เผยแพร่แล้ว

DCM อาจเขียนทับชื่อ/ปลายทางเดิมโดยใช้ token และ URL เดิม Folio จึงต้องไม่ลบ token นั้นหลังแทนไฟล์ ไม่อ้างว่า database rollback คืน bytes ภายนอกได้ และไม่ปล่อยให้การเปลี่ยนไฟล์ไปกระทบเจ้าของอื่นหรือประวัติที่ยังมี reference

## Solution

เพิ่มหน้า Admin **แม่แบบจัดเก็บเอกสาร** ให้เลือก **หัวข้อเอกสาร** จาก category API แล้ว list/filter เพิ่ม แก้ชื่อหรือหมวด และยืนยันลบ `template_name` ได้ครบ ใช้ numeric category `id` ผูกข้อมูลและใช้ `type` แสดงผลเท่านั้น CRUD จัดการ catalog ของ Folio ไม่สร้างหรือแก้ template/folder ใน DCM

ขยาย external popup ของปุ่มแนบไฟล์ Excel เดิมเป็นตัวเลือกสองชั้น: Document Category แล้ว Storage Template ที่สัมพันธ์กัน Admin ยืนยันทั้งสองค่าก่อนบันทึก ตรึงค่าลง Published Template เมื่อเผยแพร่ User ไม่กรอกหรือเปลี่ยนแม่แบบเอง

Form ที่เผยแพร่ใหม่ใช้ชื่อ `<docs_number>-<template_name>.<original-extension>` และส่ง multipart เพียง `template="1"` กับ `documentFile` ซึ่งเป็น original bytes ไม่บังคับ `fiscal_year` เป็น upload prerequisite ของโหมดใหม่ แต่คง Field rules และตัวกรองปีเดิม Form ที่เผยแพร่แล้วและ Responses เดิมใช้ contract เดิมต่อ เปลี่ยนค่าชุดใหม่ผ่านการทำสำเนาเป็น Form และลิงก์ใหม่เท่านั้น

คง Save Draft/Submit และ final Save Correction เป็นจังหวะ upload เดิม ใช้ trusted `file_link` จาก original upload receipt โหลดต้นฉบับจาก DCM เมื่อต้องเปลี่ยนเลขหนังสือ ใช้ receipt ของคำขอจริง ป้องกัน shared-identity DELETE และติดตาม failure/unknown outcomes ตามผลที่พิสูจน์ได้

## User Stories

1. As an Admin, I want a Storage Template page in Admin navigation, so that I can manage document-storage choices without editing a Form.
2. As an Admin, I want category choices loaded through Folio's backend, so that service credentials never reach my browser.
3. As an Admin, I want category `type` displayed as the document heading, so that I recognize the provider's category labels.
4. As an Admin, I want category `id` used as the relationship key, so that similar or changed labels do not merge categories.
5. As an Admin, I want to filter Storage Templates by the selected category ID, so that I see only related entries.
6. As an Admin, I want an explicit empty state for categories without templates, so that I know when to add an entry.
7. As an Admin, I want to create a `template_name` under a selected category, so that the attachment chooser can offer that mapping.
8. As an Admin, I want names rejected when already present anywhere in the catalog, so that two categories cannot introduce ambiguous identical names.
9. As an Admin, I want concurrent duplicate creates rejected consistently, so that racing requests cannot bypass uniqueness.
10. As an Admin, I want blank or unsafe template names rejected with a useful error, so that invalid routing metadata is not saved.
11. As an Admin, I want names preserved without guessed normalization, so that Folio does not silently change DCM matching input.
12. As an Admin, I want to edit a template name, so that I can correct future configuration choices.
13. As an Admin, I want to move a template to another category, so that its local grouping can be corrected.
14. As an Admin, I want both category lists refreshed after a move, so that the old category does not retain a stale option.
15. As an Admin, I want confirmation before catalog deletion, so that accidental clicks do not remove a choice.
16. As an Admin, I want Cancel or Escape to leave the catalog unchanged, so that opening a deletion prompt is not destructive.
17. As an Admin, I want deleted entries removed from future choices, so that new configuration cannot select missing mappings.
18. As an Admin, I want catalog edits and deletions not to change DCM files or templates, so that local administration cannot destroy external data.
19. As an Admin, I want failed catalog mutations to retain my input and existing data, so that provider or network errors do not appear as success.
20. As an Admin, I want loading, empty and error states to remain distinct, so that an outage is not mistaken for an empty catalog.
21. As a User, I want catalog-management APIs denied to my role, so that document-routing administration remains an Admin responsibility.
22. As a Viewer, I want catalog-management APIs denied to my role, so that read-only results access does not grant configuration authority.
23. As an Admin, I want the existing Excel attachment popup reused, so that I do not adopt a separate authoring workflow.
24. As an Admin, I want to choose category before Storage Template, so that only related templates are offered.
25. As an Admin, I want categories without templates unavailable for attachment selection, so that every confirmed destination is complete.
26. As an Admin, I want changing category to clear an incompatible template selection, so that the popup cannot save a cross-category pair.
27. As an Admin, I want moving or deleting the last template reflected when choices reload, so that a newly empty category cannot remain selectable.
28. As an Admin, I want confirmation disabled until both choices are valid, so that partial settings are not presented as complete.
29. As an Admin, I want server validation of category/template relationships, so that a forged request cannot bypass the chooser.
30. As an Admin, I want stale selections rejected if the catalog changes before save, so that an obsolete pair cannot be committed as current.
31. As an Admin, I want canceling the popup to preserve the current Field and button, so that browsing choices does not mutate the workbook.
32. As an Admin, I want the saved category and template visible when reopening settings, so that I can inspect the current destination.
33. As an Admin, I want scalar attachment Fields to store individual template choices, so that different Fields can use different routing names.
34. As an Admin, I want one saved category/template choice shared by a table attachment column, so that all its rows use the same rule.
35. As an Admin, I want automatic Tags, editable labels and requiredness preserved, so that storage choices do not replace Field configuration.
36. As an Admin, I want stable binding and native saved-button proof preserved, so that changing routing does not misplace attachment controls.
37. As an Admin, I want dirty-state and navigation guards preserved during configuration writes, so that uncommitted choices are not lost.
38. As an Admin, I want incomplete attachment configuration saved in Template Draft, so that unfinished authoring work remains resumable.
39. As an Admin, I want publication blocked for missing, deleted or stale template mappings, so that a new Published Template has a valid local destination snapshot.
40. As an Admin, I want new-mode publication to require one scalar root `docs_number` Field but not `fiscal_year`, so that the template matches the new upload inputs.
41. As an Admin, I want publication not to require a User-entered document number, so that authoring does not invent response answers.
42. As an Admin, I want saved valid mappings publishable without a mandatory live category request, so that provider outages do not erase or invalidate saved configuration.
43. As an Admin, I want category ID, template name and storage mode frozen at publication, so that later catalog edits do not redirect existing Responses.
44. As an Admin, I want published settings immutable, so that changing routing requires a duplicate rather than a hidden republish.
45. As an Admin, I want duplication to produce a new Form and share link, so that the original link keeps its existing contract.
46. As an Admin, I want duplication to copy template/configuration but not Responses or files, so that User data is not copied into a new Form.
47. As an Admin, I want duplicated legacy Forms to require explicit current Storage Template selection before new-mode publication, so that a category name is not guessed into a mapping.
48. As a User, I want original Forms, saved Drafts and historical answers unchanged by catalog maintenance, so that my saved work stays in its original Form.
49. As a User, I want existing category-mode Published Templates to keep their upload contract, so that the new feature does not silently migrate my Response.
50. As a User, I want new-mode attachments to use my root `docs_number`, so that all files in one saved snapshot use the same document number.
51. As a User, I want `template_name` supplied by the published attachment configuration, so that I am not asked to fill another routing Tag.
52. As a User, I want attachments usable without a `fiscal_year` Field in new mode, so that year is not an invented upload prerequisite.
53. As a User, I want existing year answers and required Field rules preserved, so that the new mode does not delete data or bypass validation.
54. As a User, I want changing only `fiscal_year` in new mode not to upload unchanged files, so that ordinary answer changes do not create external writes.
55. As a User, I want file selection to remain pending until Save Draft or Submit, so that choosing a file does not immediately upload or delete anything.
56. As a User, I want original bytes uploaded with only `template="1"` and `documentFile`, so that the provider receives the agreed template-mode request.
57. As a User, I want generated filenames to use document number and configured template name, so that DCM can apply its existing template routing.
58. As a User, I want the original extension and its casing preserved, so that Folio does not rename my file type.
59. As a User, I want extensionless files to remain extensionless, so that Folio does not invent a suffix.
60. As a User, I want unsafe document-number or filename input rejected rather than rewritten, so that the saved destination is not silently changed.
61. As a User, I want all file types accepted within the existing size limits, so that a PDF example does not restrict my attachments.
62. As a User, I want files from 0 through 10,000,000 bytes accepted inclusively, so that the documented boundary remains exact.
63. As a User, I want password-protected files retained without password prompts or conversion, so that the original document remains unchanged.
64. As a User, I want invalid selected files rejected even during Draft save, so that saving a Draft does not hide bad pending input.
65. As a User, I want missing required attachments allowed in Draft but rejected at Submit, so that I can finish work later without weakening final validation.
66. As a User, I want a saved zero-byte attachment to count as present, so that presence is not confused with positive size.
67. As a User, I want unchanged attachments reused without upload or unnecessary ECM login, so that ordinary saves do not repeat external writes.
68. As a User, I want a changed document number to reuse my saved original file automatically, so that I do not have to select it again.
69. As a User, I want a newly selected replacement to take precedence over saved-original retrieval, so that my latest explicit file choice is used.
70. As a User, I want original retrieval restricted to a committed reference owned by the correct Response and account, so that arbitrary URLs cannot become file sources.
71. As a User, I want exact original bytes retrieved from DCM rather than viewer HTML, previews or converted documents, so that metadata changes do not corrupt my attachment.
72. As a User, I want failed original retrieval to stop before external writes and retain saved data, so that missing provider capability does not create a false success.
73. As a User, I want DCM to remain the sole original-file store, so that Folio does not silently create a second attachment archive.
74. As a User, I want the actual upload receipt saved as the canonical URL/token pair, so that the answer describes the file DCM actually returned.
75. As a User, I want object-shaped valid receipts accepted without upload replay, so that provider response compatibility does not create duplicate writes.
76. As a User, I want malformed or uncertain receipts treated as unknown outcomes, so that Folio never guesses success from search results.
77. As a User, I want replacing A with B at the same provider identity not to DELETE that identity, so that cleanup cannot remove B.
78. As a User, I want separate old files deleted only after B commits and reference checks pass, so that replacement does not delete the old file early.
79. As a User, I want successful B retained when old-file deletion fails, so that cleanup failure does not undo my successful Submission.
80. As a User, I want a persistent warning while A deletion is unconfirmed, so that I know its old public URL may still work.
81. As a User, I want protected destinations checked before upload, so that my replacement cannot overwrite another owner's file or immutable history.
82. As a User, I want uncertain in-place overwrite reported honestly, so that a Folio transaction failure is not described as restoration of A's bytes.
83. As a User, I want repeated clicks, reloads and lost responses resolved through the original Operation, so that recovery cannot resend an uncertain write.
84. As an Admin, I want duplicate-name and shared-URL limitations stated before implementation and release, so that temporary acceptance is not mistaken for independent file versions.
85. As an Admin, I want durable attempt, receipt and provider-identity evidence, so that repeated tokens remain traceable without weakening ownership constraints.
86. As a User, I want one attachment per scalar slot or physical table-row slot, so that file ownership remains clear.
87. As a User, I want table attachment-only rows retained, including zero-byte files, so that files are not dropped when other cells are empty.
88. As a User, I want active table rows checked against all required columns, so that attachments do not bypass ordinary row validation.
89. As a User, I want fully empty table rows excluded from required checks, so that unused rows do not need attachments.
90. As a User, I want physical gaps and multiple attachment columns mapped correctly, so that files never move to neighboring answers.
91. As a User, I want supported row changes to preserve file references without upload, so that layout changes do not duplicate files.
92. As a User, I want unprovable row mappings rejected without discarding pending choices, so that Folio does not guess file placement.
93. As a User, I want multi-file saves to expose only a complete canonical snapshot, so that partial upload does not look like a completed Submission.
94. As a User, I want collisions across rows and slots handled without invented filename suffixes, so that Folio honors the agreed grammar and reports shared-identity limits.
95. As an Admin, I want final Save Correction to use the selected Submission's frozen storage contract, so that catalog changes cannot redirect a Correction.
96. As an Admin, I want Correction reason, eligibility and requiredness enforced before upload, so that attachments do not bypass existing audit rules.
97. As an Admin, I want Submission and older Correction references protected before an overwrite or deletion, so that editing a newer revision cannot alter earlier evidence.
98. As an Admin, I want internal Correction workspace and project saves to avoid ECM writes, so that only final explicit Save Correction changes attachments.
99. As an Admin, I want pending files preserved across verified workspace transitions, so that a remount does not silently discard selected attachments.
100. As a Viewer, I want saved Drafts, Submissions and Corrections readable under existing permissions, so that storage templates do not change my access.
101. As a User, I want read-only views and exports to show the saved URL instead of an upload button, so that reading a result cannot mutate attachments.
102. As a User, I want exports to follow the selected revision rather than the latest file lookup, so that historical results remain auditable.
103. As a User, I want provider URLs exported unchanged without separate token fields or service secrets, so that shared workbooks expose only the accepted public links.
104. As a User, I want broken historical links reported without substitution, so that Folio does not conceal a missing original by opening another file.
105. As a User, I want pending attachments to block exports that would imply they were saved, so that download never publishes a file or invents a URL.
106. As a User, I want ordinary unsaved Excel edits still downloadable when no attachment change is pending, so that the existing Fill Download remains usable.
107. As a User, I want Response deletion to require existing permissions and confirmation, so that storage templates do not broaden destructive access.
108. As an Admin, I want whole-Response cleanup to protect surviving shared identities and history, so that deleting one Response cannot remove another file reference.
109. As an Admin, I want cleanup evidence and warnings to survive Response deletion, so that unresolved external files remain traceable.
110. As a User, I want archive to retain files and history, so that archiving does not become deletion.
111. As a User, I want labelled, keyboard-accessible controls and specific slot/row errors, so that I can complete the workflow without pointer-only actions.
112. As an Admin, I want native-editor, export and authorized provider acceptance separated from simulated test results, so that release readiness is based on observed behavior.

## Implementation Decisions

### 1. ขอบเขตและลำดับหลักฐาน

- Latest planning decisions เป็นเจ้าของ intended policy ของ feature นี้ ข้อ 1–3 ปิดแล้ว: DCM-only originals, same-identity overwrite โดยไม่ DELETE ซ้ำ และ category-ID grouping ไม่เปิดถามซ้ำ
- เปลี่ยนเฉพาะ XLSX attachment storage flow ต่อจากปุ่ม/native popup เดิม ไม่สร้าง upload app, demo หรือกระบวนการตอบ Form ใหม่
- Contract เดิมและใหม่ต้องแยกด้วย persisted storage mode ไม่เดา mode จากการมี `fiscal_year`, ชื่อ Tag หรือ catalog ปัจจุบัน Form ที่เผยแพร่เดิมคง mode และข้อมูลเดิม
- ไม่ใช้กติกา PDF-only หรือ automatic write retry ของบริการอื่นเป็นข้อกำหนด Folio

### 2. Storage Template catalog และ Admin CRUD

- Catalog มี identity ภายใน, `template_name` และ numeric `document_category_id` ชื่อไม่ซ้ำทั้ง catalog แม้คนละหมวด บังคับ uniqueness ในฐานข้อมูลด้วย ไม่พึ่งการตรวจ client ก่อนส่ง
- Category API คืน `id`/`type`; backend เก็บ ID และส่งข้อมูลแสดงผลที่จำเป็น ไม่ทิ้ง ID เป็น string-name catalog สำหรับโหมดใหม่ `type` เป็น label เท่านั้น ไม่ใช้เป็น routing key, filename component หรือหลักฐาน physical folder
- หน้า Admin มี category select, persisted list/filter, create, update ชื่อ/หมวด และ confirmed delete ครบ หลัง mutation โหลดสถานะจริง ไม่รายงานสำเร็จจาก optimistic state เพียงอย่างเดียว
- ตรวจ enabled Admin ฝั่ง server สำหรับ catalog และ category-management access ตามสิทธิ์เดิม User/Viewer ไม่ได้สิทธิ์จากการเรียก endpoint โดยตรง
- ตรวจ category ID จากรายการ DCM ที่ backend เชื่อถือเมื่อตั้งหรือเปลี่ยนความสัมพันธ์ ไม่รับ ID เดาเอง เก็บรายการ/การเลือกเดิมระหว่าง provider outage; ไม่แก้ชื่อหมวด upstream แทน DCM
- ชื่อว่าง/control characters/อักขระที่ทำให้ generated filename ไม่ปลอดภัยถูกปฏิเสธ ใช้ชื่อที่บันทึกตามจริง ไม่ sanitize, trim หรือเติม suffix เพื่อเดา DCM matching และไม่เพิ่ม case-folding policy โดยไม่มีเหตุจาก contract
- การแก้ชื่ออย่างเดียวหรือลบ mapping ที่ Folio มีอยู่ไม่ต้องกลายเป็น DCM mutation การลบต้องยืนยันและ Cancel/Escape ไม่เปลี่ยนข้อมูล การเพิ่มหรือเปลี่ยนหมวดต้องมี category evidence ที่ใช้ได้
- Catalog CRUD ไม่ POST/DELETE file, ไม่สร้าง/แก้/ลบ DCM template/folder และไม่เปลี่ยน Published Templates, Responses หรือ file receipts
- Admin ต้องกรอกชื่อให้ตรงกับแม่แบบที่ DCM ตั้งไว้ Folio catalog ไม่ใช่หลักฐานว่า DCM มีแม่แบบนั้นหรือจะสร้างโฟลเดอร์ได้ทุกกรณี

### 3. Authoring และ popup สองชั้น

- ขยาย existing external attachment popup, relay และ scoped bridge เป็น category/template selections ไม่เพิ่ม chooser อีกชุดใน sidebar
- Category ที่ไม่มี mapping ให้เลือกไม่ได้ เปลี่ยน category แล้วล้าง template ที่ไม่สัมพันธ์กัน การลบ/ย้ายรายการสุดท้ายต้องสะท้อนเมื่อโหลดรายการใหม่
- ยืนยันได้เมื่อเลือกครบและ target ยังตรงกันเท่านั้น ยกเลิกก่อนยืนยันไม่สร้าง Field/ปุ่ม ไม่แก้ค่าที่บันทึก และคืน focus ตาม interaction เดิม
- Server ตรวจ identity ของ mapping, category ID และค่าชื่อที่ Admin กำลังยืนยันกับ catalog ปัจจุบัน Reject stale/forged/moved/deleted choices ไม่เชื่อ UI disable หรือ snapshot จาก client
- รักษา auto-tag, Tag rename, labels, requiredness, stable binding, native saved-button proof, revision/lease checks และ authoring lock/dirty-state ตลอดขั้นตอนเดิม
- หนึ่ง scalar Field มีหนึ่ง choice; หนึ่ง table attachment column ใช้ choice เดียวกันทุกแถว ไม่เพิ่ม template answer Tag และไม่ให้ User เลือกปลายทาง
- Loading/error/empty แยกกันชัดเจน มี explicit reload สำหรับ reads ตาม pattern เดิม ไม่มี placeholder category/template ที่ยืนยันได้ และไม่ส่ง ECM Bearer/capability ให้ display-only popup

### 4. Draft, publication และ duplication

- Template Draft บันทึก incomplete config ได้ แต่ publication แบบใหม่ต้องมี current local mapping ครบทุก attachment Field/column และ exactly one scalar root `docs_number` ตาม Field contract ไม่ต้องมี User-entered value ในต้นแบบ
- `fiscal_year` ไม่เป็น publication/upload prerequisite ที่ระบบ attachment เพิ่มให้โหมดใหม่ หาก Form มี Field นี้และตั้ง required ยังใช้กฎ Field ปกติ และไม่เปลี่ยน results filters
- Publish ตรวจ local catalog ในขอบเขต transaction/revision ที่ป้องกันการแก้/ลบแข่งกัน ตรึง storage mode, category ID, `template_name` และ metadata แสดงผลที่จำเป็น ไม่ต้อง live category lookup หากหลักฐานที่บันทึกยังครบ
- Draft ที่ mapping ถูกลบ ย้าย หรือเปลี่ยนชื่อจน choice เดิมไม่ตรง ต้องให้ Admin เลือก/ยืนยันใหม่ก่อน publish ไม่ silently follow master หรือทิ้ง Draft
- Published contract ใช้ frozen values โดยไม่ lookup catalog มาเปลี่ยน upload routing ใน Save/Submit/Correction การแก้/ลบ master หลัง publish ไม่ทำให้ contract เก่าเสียหรือย้ายปลายทาง
- ค่าชุดใหม่ออกผ่าน duplicate Form เป็น Form/link ใหม่ ไม่มี republish ที่ลิงก์เดิม ไม่ redirect, archive หรือ delete ต้นฉบับอัตโนมัติ
- Duplicate คัดเฉพาะเอกสารและ configuration ไม่คัด Responses, answers, pending Files หรือ User attachments คง valid choices ให้ตรวจ/แก้ได้; สำเนาจาก legacy category mode ต้องเลือก mapping ใหม่อย่างชัดเจนก่อนเผยแพร่ใหม่ ไม่เดาจาก category name

### 5. Persistence และ caller impact

- เพิ่ม catalog และ metadata ที่จำเป็นใน Draft Field Rules, Manifest Fields/Spreadsheet Contract และ operational upload evidence ตาม lifecycle เดิม ไม่ใส่ routing metadata ใน placement-only Excel Binding
- รองรับ legacy category mode กับ storage-template mode โดยไม่เปลี่ยน Published metadata หรือ canonical JSON เดิมย้อนหลัง การปรับ schema ต้องไม่ reset DB, fabricate fiscal year หรือ migrate ไฟล์ DCM
- Operational evidence ของโหมดใหม่ไม่มี fiscal year ได้ เก็บ storage mode/category ID/template snapshot ที่ใช้ส่งจริง; legacy evidence คง year/category ตามเดิม
- Same-token receipt ต้อง represent ได้โดยไม่ reject หลัง provider เขียนแล้ว แยกหลักฐานการส่งแต่ละครั้งจาก identity ของ provider file ที่อาจถูก reuse ผูกกับ canonical owned identity ที่ตรวจแล้ว ไม่ปลด unique constraint แบบเหมารวมเพื่อกลบ collision และไม่เขียนทับหลักฐาน operation เก่า
- อัปเดตทุก consumer ของ contract: authoring read/write, native bridge, save/publish completion, duplicate, response planning, original reuse, commit/recovery, Correction, reference/deletion tracking และ read/export projection
- Canonical answer shape คงเดิม: `null` หรือ `file_link`, `file_token`, `original_name`, `size_bytes`; table slot มี trusted `row_index` เพิ่ม ไม่เพิ่ม answer JSON columns ไม่เก็บ bytes/base64 ใน DB หรือ workbook
- คง JSON budget 262,144 UTF-8 bytes ไม่ตัด metadata หรือเพิ่มเพดานเพื่อให้ batch ผ่าน

### 6. Template-mode upload

- ก่อน external write ใช้ trusted snapshot ของ root `docs_number` และ frozen `template_name` ตรวจชื่อรวมและ original extension ด้วย validation เดิม ไม่อ่านเลขจาก PDMS project-name answer
- Filename เป็น `<docs_number>-<template_name>.<original-extension>` คง extension/casing เดิม ถ้าไม่มี extension จบที่ `template_name` ไม่เพิ่ม UUID, row ID, binding ID หรือ unique suffix
- POST ไป upload endpoint เดิม ส่ง original bytes ผ่าน `documentFile` และ `template` เป็นข้อความ `"1"` เท่านั้น ไม่ส่ง `documentYear`, `documentNumber`, `documentCategory`, category ID หรือ type เพิ่มใน multipart โหมดใหม่
- Legacy Published Templates ส่ง request/filename ตาม contract เดิม ไม่แปลงโหมดตาม schema default หรือ catalog ที่เพิ่งมี
- อัปโหลดเฉพาะ explicit Save Draft/Submit และ final Save Correction การเลือกไฟล์, Admin CRUD, Template save/publish, row/project/workspace save, read-only และ export ไม่เริ่ม external file writes
- ไฟล์และ metadata ไม่เปลี่ยน reuse reference เดิมโดยไม่ upload หรือขอ login โดยไม่จำเป็น ในโหมดใหม่เปลี่ยนเฉพาะ `fiscal_year` ไม่เป็นเหตุ upload
- คง original bytes, ทุกชนิดไฟล์, 0–10,000,000 bytes inclusive, password-protected support โดยไม่ decrypt/preview และหนึ่งไฟล์ต่อ slot ตรวจขนาดจริงฝั่ง server
- Draft ขาด required attachment ได้ แต่ invalid selected file ยังทำให้ save ไม่ผ่าน Submit/Correction ใช้ requiredness เดิมและนับ saved zero-byte file ว่ามีไฟล์

### 7. DCM-only original-byte reuse

- เมื่อ `docs_number` เปลี่ยนและไม่มี replacement ให้ server โหลด original bytes จาก trusted `file_link` ของ original upload receipt ที่ match committed reference, slot, Response และ ECM account แล้วเท่านั้น ไม่รับ client URL/token เป็นอำนาจ fetch
- ถ้ามี replacement ใช้ bytes ใหม่ ไม่โหลดไฟล์เก่าแทน หาก unchanged ไม่ดาวน์โหลดต้นฉบับโดยไม่จำเป็น
- `file_link` เป็นจุดเริ่มต้น อาจเป็น viewer/redirect/download flow; downloader ต้องใช้ supported provider flow ที่พิสูจน์ว่าได้ exact original bytes ไม่ผูกกับ private PDF.js/viewer routes ที่ยังไม่มี contract
- ตรวจ origin/redirect ทุก hop, credentials propagation, streamed-size bounds, exact expected size, timeout และ error behavior ตาม trust boundary เดิม ไม่ส่ง service credentials ไป origin นอกที่อนุญาต
- MIME หรือ HTTP 200 อย่างเดียวไม่ยืนยันต้นฉบับ ต้องไม่อัปโหลด HTML viewer/error page หรือ converted preview แทนไฟล์ และยังต้องรองรับ original HTML เมื่อเป็นชนิดไฟล์ที่ User แนบจริง ไม่ใช้ blanket HTML ban ลด all-type requirement
- Verify ด้วย known fixture bytes/hash รวมไฟล์ binary, text/HTML, extensionless, encrypted และ 0/10,000,000 bytes ไม่ถือการเปิด viewer ใน browser เป็น server-download proof
- อ่านต้นฉบับไม่ได้ให้ fail ก่อน write ใหม่ รักษาข้อมูลที่บันทึกและ pending selection ที่ยังอยู่ในหน้า แจ้ง slot/row และการทำต่อ ไม่บังคับ reselection และไม่เพิ่ม RustFS/DB original cache หรือ fallback สำเร็จปลอม
- ขณะนี้ supported all-type server-download contract ยังมีหลักฐานไม่เพียงพอ ต้องหาและพิสูจน์ใน implementation หากยังหาไม่ได้ให้รายงาน prerequisite ที่ขาดและ HOLD การเปิดใช้เส้นทางนี้ ไม่เปลี่ยนคำตัดสินเรื่อง DCM-only และไม่ส่งงานว่า feature ครบแล้ว

### 8. Receipts และ service authentication

- ใช้ shared ECM client/auth coordinator เดิม ตรวจ expiry ที่ provider ให้และ request-driven renewal เมื่อเหลือไม่เกิน 12 ชั่วโมง ไม่เพิ่ม cron, config หรือ login ต่อ browser/user
- แยก service identity จาก Folio session ไม่ส่ง credentials/service Bearer ลง browser, popup, workbook, canonical answers หรือ logs ที่ใช้เป็นหลักฐานสาธารณะ
- Upload adapter รองรับ actual object receipt ที่ตรวจหลักฐานแล้ว และ legacy one-item-array receipt ที่ยังเป็น contract ของโหมดเดิม ตรวจ success, safe URL และ valid token ก่อน commit ไม่ยอมรับ null, หลายไฟล์ หรือ DELETE response เป็น upload success
- Receipt ของ B ต้องมาจาก POST B จริง เก็บ URL/token เป็นคู่ตาม response แม้เหมือน A ไม่ใช้ search/latest lookup เป็น receipt fallback และไม่สร้าง receipt จาก client
- Provider รับไฟล์แล้วแต่ receipt malformed/network outcome ไม่แน่นอนเป็น unknown outcome ไม่ retry upload หลัง parser/auth error เพื่อเดาผล

### 9. Replacement, identity และ protected destinations

- การเลือก B ยังไม่ upload/delete A ก่อน dispatch ตรวจ ownership, destination และ protected references ของคนอื่น/history/workspace/eligible Operations ไม่รอเทียบ token หลัง overwrite เพื่อค่อยป้องกัน
- ทำ admission/fencing ร่วมกับ reference creation/deletion และ concurrent writes ตาม existing locking pattern หากพิสูจน์ว่าเขียนได้อย่างปลอดภัยไม่ได้ ให้หยุดก่อน external write พร้อมเหตุผล ไม่เดา object independence จากชื่อ/token ต่างกัน
- Same-name/same-destination อาจ overwrite ด้วย token/URL เดิมตามหลักฐานผู้ใช้ รองรับกรณีนี้โดยไม่ถามซ้ำ B สำเร็จและ canonical save สำเร็จแล้วไม่ DELETE shared identity อีก
- หาก B เป็น distinct proven identity ให้ cleanup A หลัง canonical B commit และไม่มี surviving references เท่านั้น ไม่ลบ A ล่วงหน้าและไม่ใช้ token ต่างกันเพียงอย่างเดียวรับรองว่า DELETE ปลอดภัย
- ถ้าลบ A ล้มเหลว/ไม่ทราบผล ให้ B ส่งสำเร็จพร้อม persistent warning ว่า A อาจยังเปิดได้ ไม่ rollback B และไม่ retry DELETE อัตโนมัติ ordinary save ถัดไปไม่ล้าง warning
- ไฟล์ร่าง A ที่ไม่มี reference อื่นไม่ต้องเก็บตลอดไป หลัง distinct-identity cleanup ที่ยืนยันแล้ว A ต้องไม่เปิดเป็น original A ได้ หรือกรณี same-identity overwrite URL เดิมเป็น B โดยไม่มี DELETE เพิ่ม ไม่อ้างว่าตรวจลบสำเนา filesystem/backup ทั้งหมด
- คง unique ownership/resource constraints ผ่าน explicit identity reconciliation ไม่ adopt ไฟล์ต่างเจ้าของหรือแก้หลักฐานเก่าเพียงเพราะ filename ตรงกัน
- หลายช่อง/แถวชื่อซ้ำเป็นข้อจำกัดชั่วคราวที่ผู้ใช้ยอมรับ ไม่เพิ่ม suffix เองและไม่รับรอง independence ข้อยกเว้นนี้ไม่อนุญาต overwrite ข้อมูลคนอื่นหรือ immutable history ถ้าพบ conflict กับ protected reference ต้องหยุดก่อนส่ง

### 10. Failure, unknown overwrite และ recovery

- ตรวจ metadata/size/requiredness/mapping ที่ตรวจได้ก่อน dispatch ใช้ existing Operation/checkpoint, callback, lease และ revision scopes ป้องกัน duplicate/stale saves
- Canonical document, answers และ references commit เป็น complete snapshot เดียว ไม่สร้าง partial Submission/Correction หาก batch ไม่ครบ
- ก่อน external write ล้มเหลว ข้อมูลและ bytes เดิมไม่เปลี่ยนจากคำขอนี้ แต่เมื่อ DCM in-place overwrite เริ่มแล้วไม่สัญญาว่า A bytes ยังอยู่ แม้ Folio commit ล้มเหลว
- Persist overwrite intent/destination/owned identity และ receipt/request-settlement evidence ก่อน/หลัง send ตามจุดที่ทำได้ ห้ามอ้าง database rollback เป็น external rollback หรือ DELETE shared B เพื่อทำ compensating cleanup
- Unknown upload/overwrite หรือ canceled-batch ที่ยัง settle ไม่ครบคง mutation hold ตาม pattern เดิม พร้อมคำอธิบายผลต่อ URL เดิม ไม่บอกเพียงว่า old Draft bytes ปลอดภัยทุกกรณี
- Recovery ตรวจ original Operation/checkpoint และ canonical revision ไม่ resend, adopt latest, ใช้ empty search, elapsed time หรือ operator note เป็นหลักฐาน settlement หาก canonical commit แล้วคืนผลเดิม
- Late receipt ของ canceled work คงเป็นหลักฐานติดตาม ไม่กลับมา commit เป็นคำตอบใหม่ Cleanup เฉพาะ identity ที่พิสูจน์ว่า unreferenced และไม่เป็น alias ของ saved/protected file
- ในกรณีที่ยังไม่มี external settlement/restore proof ให้คง hold และแสดงข้อจำกัดอย่างตรงไปตรงมา ไม่เพิ่ม automatic retry, retry daemon หรือ manual unlock ที่ไม่มีหลักฐาน

### 11. Tables และ Correction

- ใช้ trusted physical-row mapping และ existing column binding ไม่ใช้ compact answer-array index แทน row identity คงไฟล์ที่ active attachment-only/zero-byte rows และตรวจ required columns อื่นด้วย
- Fully empty row ไม่บังคับแนบ Supported row append/delete-selected ต้อง preserve references/pending Files โดยไม่ upload/delete หาก mapping ไม่พิสูจน์ให้หยุดก่อนเปลี่ยน scope
- Table batch ตรวจ duplicate destination/shared identity และ protected references ทั้งชุดก่อน dispatch ไม่เติม row suffix หากส่งหลายไฟล์แล้ว provider reuse identity ต้องรายงานจริง ไม่สร้างหลักฐานว่าแต่ละแถวเป็น independent version
- Admin ทำ attachment changes เฉพาะ valid final Save Correction พร้อม reason/base revision/lease/eligibility เดิม ไม่ใช้สิทธิ์ Admin ไปแก้ Draft ของ User โดยตรง
- Correction ใช้ frozen storage mode ของ Submission นั้น ทั้ง legacy/new mode ไม่เปลี่ยนตาม catalog และไม่เขียนทับ destination ที่ Submission/older Correction ยังปกป้องอยู่
- Internal workspace/project saves ไม่ upload Pending files/removals ข้าม remount ได้เฉพาะ verified scope/row mapping ไม่ย้ายไฟล์ค้างจาก completed snapshot ไป operation ใหม่โดยเดา

### 12. Read-only, exports และ deletion

- หลังบันทึก/ส่งสำเร็จ UI ใช้ canonical B receipt; read-only และ saved XLSX/PDF exports ใช้ `file_link` ของ selected revision แทน upload controls ไม่ใช้ latest lookup หรือคำนวณ URL จาก path
- ไม่ export token เป็นคอลัมน์/hidden metadata แยก ไม่ export service credentials ส่ง provider URL ตามจริงซึ่งอาจมี file token ใน query ตาม accepted public-link policy ไม่รับรองว่า URL private หรือซ่อน token ได้
- Snapshot ของ Folio ไม่ทำให้ URL ที่ DCM overwrite กลายเป็น immutable bytes จึงต้องป้องกัน protected destinations ก่อน write Broken historical URL ไม่ถูกแทนด้วยไฟล์ใหม่
- Pending attachments ต้อง explicit Save/Submit ก่อน export ที่อ้างว่าบันทึกแล้ว Export ไม่ upload และไม่ปล่อย filename/blob/fake URL แทน saved file Ordinary unsaved Excel edits ยังคง Fill Download เดิมเมื่อไม่มี attachment change ค้าง
- Whole-Response deletion ใช้ existing rights/confirmation และ reference-fenced cleanup คุ้มครองทุก surviving alias/identity ไม่ลบไฟล์เพราะมี token อยู่ใน JSON เพียงอย่างเดียว
- Tracking evidence/warnings อยู่ต่อหลัง Response deletion ไม่คืน deleted answers เป็น Response ปกติ Archive ไม่ลบ files/history

### 13. Data safety และ cutover

- Legacy Published Templates, Responses, old Drafts, URLs/tokens และ historical metadata คงเดิม ไม่มี destination/data migration, rename, re-upload หรือ DELETE จาก catalog edits/deployment
- Schema migration เพื่อรองรับ feature แยกจากการ migrate User data/ไฟล์ ต้องทดสอบกับ isolated database และ existing records ห้าม reset หรือชี้ Production โดยไม่ตั้งใจ
- คง validation, authorization, SSRF protection, accessible labelled controls, keyboard focus/escape behavior, worksheet protection และ error handling ที่ป้องกันข้อมูลสูญหาย
- อัปเดต domain/workflow/system map และ affected callers/tests/fixtures ใน change ที่ implement จริง ไม่อ้างว่าสเปคนี้ทำให้ระบบใหม่มีอยู่แล้ว

## Testing Decisions

### Main seam และ prior art

- ใช้หนึ่ง main automated seam: existing Folio server HTTP/application integration boundary กับ isolated PostgreSQL/object storage, trusted workbook fixtures, Operation/callback coordination และ controlled DCM HTTP provider double ไม่เพิ่ม deep unit seams หรือ test framework ใหม่
- Seam นี้สอดคล้องกับแนวทางที่ยืนยันไว้ใน attachment implementation spec เดิม รอบนี้ reuse ตามคำสั่งไม่สัมภาษณ์ซ้ำ การส่งสเปคให้ตรวจไม่ใช่การอ้างว่าผู้ใช้อนุมัติรายละเอียดใหม่หรือ implementation แล้ว
- Prior art: existing attachment-authoring HTTP suite มี Admin capability, provider category fixture, binding/native proof, incomplete publication และ offline publication; scalar Save/Submit HTTP suite มี persisted receipts/references, real workbook bytes, controlled upload/delete barriers, tables, Correction, history/export และ recovery; ECM-auth HTTP suite มี shared login/expiry/generation/redirect checks
- Existing plugin popup และ web relay suites ใช้เฉพาะ consumer-visible interaction/scoping ที่ HTTP seam ไม่เห็น ไม่เพิ่ม tests ของ forwarding, private helper call order, copied defaults หรือ source text
- ทดสอบผลภายนอก: API/Operation outcome, reloaded persisted lists, saved canonical JSON, workbook/export bytes, actual bytes/requests ที่ provider double ได้รับ, surviving references และสิ่งที่ User/Admin ทำต่อได้ ไม่ใช้ mock echo หรือ HTTP 200 อย่างเดียวเป็น proof

### Required behavior coverage

1. **Admin CRUD:** list/filter by numeric ID, same label/different ID, empty/error/loading, create/edit/move/delete confirmation, duplicate names across categories รวม race, malformed/unknown ID, disabled/non-Admin access และไม่มี secrets ใน response
2. **Catalog lifecycle:** rename/move/delete ขณะ popup เปิดหรือ publish กำลัง commit, final-entry deletion ทำหมวดเลือกไม่ได้, stale Draft ต้องเลือกใหม่, Published snapshots และ legacy values ไม่เปลี่ยน, ไม่มี file write จาก CRUD
3. **Authoring/publication:** two dependent selects, cancel/Escape/focus, scoped relay, explicit confirmation, stable Tags/bindings/native proof, dirty state, incomplete Draft save, exactly-one root `docs_number`, no attachment-imposed `fiscal_year`, offline publication จาก saved valid mapping และ duplicate เป็น link ใหม่โดยไม่มี Responses
4. **Mode contract:** persisted mode ไม่เดาจากปี; new mode multipart มีสอง fieldเท่านั้นและ filename/extension ถูกต้อง; legacy mode คง request เดิม; object และ one-item-array receipts ตาม modes, malformed/unsafe/null/multi receipts ถือ unknown โดยไม่มี resend/search fallback
5. **Bytes/validation:** byte equality, any file type รวม original HTML/binary/password-protected/extensionless, case-preserved extension, sizes 0, 1, 9,999,999, 10,000,000 และ 10,000,001, forged size/MIME/Content-Length, unsafe metadata และ JSON 262,144-byte boundary
6. **Original reuse:** `docs_number` เปลี่ยนไม่มี File ใหม่, replacement wins, year-only/unchanged ไม่ upload; trusted committed/account/slot checks; binary versus viewer/preview/error, redirects/auth/expiry/timeouts/wrong size/oversize และไม่มี bytes ถูก persist นอก DCM
7. **Replacement/identity:** same-token/link overwrite, distinct receipt, aliases, multiple slots/rows, foreign owner/history destination conflictsก่อน send, concurrent save/reference/delete barriers, B commit ก่อน eligible A cleanup และ no shared-identity DELETE
8. **Failure/recovery:** ก่อน send/หลัง external overwrite/receipt/ก่อนและหลัง canonical commit, multi-file partial failure, DB/object-storage rejection, lost Folio response, late receipt/restart/unknown outcome, persistent warning versus mutation hold และ no automatic write retries
9. **Tables:** physical gaps, multiple columns, attachment-only zero-byte row, all required columns, fully empty rows, supported append/delete-selected, stale/ambiguous row mapping และไม่มี row/layout save ทำ external writes
10. **Correction/deletion/history:** legacy/new frozen contracts, reason/eligibility, protected Submission/older Correction ก่อน write, workspace pending Files, whole-Response deletion กับ surviving aliases และ durable tracking, archive ไม่ลบ
11. **Read/export:** selected revision URL ที่บันทึกจริง, no latest substitution, no upload controls/separate tokens/secrets, provider token-in-URL caveat, pending-file export guard และ ordinary unsaved Fill Download ไม่เปลี่ยน

### Native และ provider acceptance

- หลัง implementation ต้องเปิด actual Admin page และ real ONLYOFFICE เพื่อ CRUD catalog ครบ, ตั้ง scalar/table choices ใน external popup, save/publish, duplicate/share new link, Save Draft/reopen/replace/Submit, Correction และ selected-revision view/export
- ตรวจ downloaded XLSX/PDF จริงว่ามี URL ตาม saved revision ไม่มี attachment controls หรือ separate file token/service secret และ canonical editable workbook ไม่ถูกแทนด้วย export projection
- Provider double พิสูจน์ local behavior เท่านั้น ก่อนเปิดใช้ต้องมี authorized DCM runtime evidence ของ filename grammar ที่มีขีด/นามสกุลและไม่มีนามสกุล, exact original retrieval ทุกชนิดที่อยู่ในขอบเขต, same-identity replacement/no-extra-DELETE และผล failure ที่รองรับได้จริง
- ใช้ไฟล์สังเคราะห์ ตรวจ collision ก่อนเขียน ไม่ใช้ User files เป็น fixture ไม่เรียก live API เพิ่มในรอบจัดสเปคนี้ สิทธิ์ทดสอบรอบเก่าไม่ใช่สิทธิ์ทดสอบถาวร
- ไม่ทำ PM type-to-folder-label comparison เป็น acceptance gate และไม่ถาม storage choice/token overwrite ข้อ 1–3 ซ้ำ
- ถ้า missing download/settlement proof ยังทำให้ behavior สำคัญพิสูจน์ไม่ได้ ให้ระบุ exact prerequisite และ HOLD release ไม่ใช้ unit tests หรือ viewer เปิดได้แทน acceptance

## Out of Scope

- Implementation, DB/schema/migration execution, live DCM/PDMS API calls, credential provisioning, commit/push/deploy ในรอบสเปคและตั๋วนี้
- เปลี่ยนคำตัดสินข้อ 1–3, เก็บ attachment originals ใน RustFS/DB หรือบังคับ User เลือกไฟล์เดิมใหม่แทน automatic reuse
- DCM template/folder/category CRUD, arbitrary folder browsing, การ hardcode type ให้ตรง physical folder หรือ PM folder-label approval gate
- User-editable `template_name`, template answer Tag, per-row destination choices, ปี storage อีกค่า หรือการอนุมานเลขหนังสือจาก project name
- เพิ่ม UUID/version/row suffix, filename rewriting, PDF-only restrictions, preview/decryption/password collection
- แก้ Published Template ที่ลิงก์เดิม, in-place republish/config versioning, ย้าย Responses/ไฟล์เก่า, auto redirect/archive/delete Form เดิม
- Automatic upload/delete retry, search-as-receipt/adopt-latest, unsupported private viewer scraping, fake rollback หรือ manual settlement โดยไม่มีหลักฐาน
- DOCX attachment rollout, main-document viewer changes, public-link privacy redesign หรือ dashboard/operator workflow ใหม่ที่ไม่จำเป็นต่อ existing recovery pattern

## Further Notes

### Canonical decisions และ revisions

- [Planning owner](planning.md), snapshot ที่อ่าน 2026-11-17: หัวข้อ “ขอบเขตล่าสุดที่ยืนยัน — DCM-only, ID grouping และ Admin CRUD ครบ” และ “คำชี้แจงและหลักฐานผู้ใช้ วันที่ 2026-11-17” เป็นข้อสรุปที่ใช้เหนือคำถาม/ผลทดลองเก่า เอกสารไม่มี semantic revision; ใช้วันที่อ่านและหัวข้อเป็น snapshot reference
- [Provider-contract research](provider-contract-research.md), snapshot ที่อ่าน 2026-11-17: supported request shape, conflicting array/object prose, closed Q1–Q3 และ insufficient all-type server-download evidence ยังแยกจากกัน ไม่มีการเรียก DCM ซ้ำเพื่อยืนยันข้อสังเกตของผู้ใช้
- [Existing attachment implementation spec](../ecm-attachments-implementation/spec.md), Status `resolved` พร้อม amendments ถึง 2026-11-16: reuse validation, HTTP seam, immutable contracts, shared auth, native popup และ unknown-outcome protection สเปคใหม่นี้แทนเฉพาะ new-publication routing/metadata/filename policy ที่ระบุ ไม่แก้ legacy Published behavior
- [Domain glossary](../../CONTEXT.md): Storage Template, Document Category, Published Template, Spreadsheet Contract, Excel Binding, Draft, Submission และ Correction; ใช้ศัพท์นี้ตลอดสเปค
- [ADR 0003](../../docs/adr/0003-pdms-project-name-choices.md), Accepted: project-name answer ไม่ใช่ project identity; [ADR 0004](../../docs/adr/0004-results-filters-use-scalar-field-tags.md), Accepted: `fiscal_year` filter contract ไม่เปลี่ยนจากการเลิกเป็น upload prerequisite

### Evidence separation

- **Memory discovery:** session recall ได้ผล retrieved 8 entries ใช้นำทางเท่านั้น ผลไม่คืน bank identity, `document_id`, `chunk_id`, `source_path`, `stable_document_id` หรือ `source_revision` จึงไม่อ้างว่าเป็นการค้น `pdms-knowledge` ที่ยืนยัน provenance แล้ว Dedicated bank search พร้อม `types`/`budget`/tag matching ไม่ได้เปิดให้เรียกผ่าน schema ของเครื่องมือรอบนี้; สถานะ dedicated discovery: skipped ข้อมูลที่ขาดไม่เติมจากการเดา
- **Canonical Knowledge Document:** เปิด [Ongoing services owner](../../../pdms-ongoing-backend/docs/knowledge/integrations/ongoing-services.md) และ [upstreams owner](../../../pdms-ongoing-backend/docs/knowledge/integrations/financial-report-upstreams.md) ที่ research อ้างโดยตรง Stable IDs `pdms-ongoing-backend.integration.ongoing-services` และ `pdms-ongoing-backend.integration.financial-report-upstreams`; source revision `e51f2245fab13d55676de46ceb4781903ec41470`, Working Tree snapshots 2026-11-11; status `phase2-partial`, Human Review `pending` ใช้เป็น local adapter/schema evidence ไม่ใช่ deployed DCM guarantee รายการ inherited discovery document/chunk IDs คงอยู่ใน research ไม่อ้างเป็น recall ใหม่ของรอบนี้
- **Current Source Code:** ตรวจ Folio Working Tree ผ่าน CodeGraph และเติม exact source/schema/test ranges ที่เครื่องมือไม่ครอบคลุม พบ category adapter คืนชื่อ, upload parser รับหนึ่งรายการใน array, `originalBytes` เป็น direct GET ที่ bound size, Draft/Manifest เก็บ category name, version ledger บังคับ fiscal year และ file-token uniqueness ข้อเท็จจริงนี้เป็นฐาน change impact ไม่ใช่หลักฐานว่า feature ใหม่ implement แล้ว ไม่ตรวจ/อ้าง deployed revision
- **User-reported/runtime evidence:** ยอมรับภาพ/คำยืนยัน same-token/URL overwrite วันที่ 2026-11-17 ผล synthetic live รอบก่อนที่ได้ different tokens เป็นคนละ sample ไม่ใช้เปิดคำถามเดิมอีก Published Postman snapshot ใน research มี SHA-256 `db24a4d047b13ac45055dfdbb395d3a2e3ea0c04ae5240c641ea42f0392019d4` และ provider semantic/deployed revision ไม่ทราบ
- **Insufficient:** public collection ไม่มี supported original-download endpoint ที่เปิดพบ ไม่ได้พิสูจน์ว่า DCM ไม่มี API นี้ทั้งหมด Filename grammar ข้ามชนิดไฟล์/ขีด/extensionless และ all-type backend retrieval ยังต้องพิสูจน์ ไม่อ้าง Production readiness

### ข้อจำกัดและคำเตือนก่อนลงมือ/เปิดใช้

ผู้ใช้ยอมรับชั่วคราวให้หลายช่อง/หลายแถวส่งชื่อซ้ำ แต่ provider อาจ reuse identity และ URL เดิมจนทุก reference เห็นเนื้อหาใหม่ ต้องเตือนอีกครั้งก่อน implementation และ release ไม่เพิ่ม suffix เอง ข้อยกเว้นนี้ไม่ครอบคลุมข้อมูลคนอื่นหรือ immutable history จึงต้องตรวจ protected destination ก่อน dispatch

DCM-only เป็นคำตัดสินที่ปิดแล้ว ไม่ใช่ตัวเลือก pending ส่วน supported original-byte retrieval และ external in-place failure reconciliation เป็น technical implementation/release prerequisites ที่ยังต้องพิสูจน์ Folio configuration snapshot ไม่สามารถทำ mutable provider URL ให้เป็น immutable bytes ได้

### Delivery และ ticket map

สร้างสเปคและตั๋วตามคำสั่งโดยไม่สัมภาษณ์หรือขอเลือกข้อ 1–3 ซ้ำ `ready-for-agent` หมายถึง triage label ของเอกสาร ไม่ใช่อนุมัติเริ่มพัฒนาหรือผ่าน human/provider acceptance เมื่อส่งเอกสารครบให้รอคำสั่งถัดไป

| Ticket | End-to-end deliverable | Blocked by | User stories หลัก |
| --- | --- | --- | --- |
| 01 | Admin Storage Template CRUD ครบและ category-ID filtering | None | 1–22 |
| 02 | เลือก category/template, save/publish snapshot และ duplicate เป็น link ใหม่ | 01 | 23–49 |
| 03 | Scalar Save Draft/Submit template mode พร้อม safe identity/recovery | 02 | 50–67, 74–85 |
| 04 | เปลี่ยน docs_number ด้วย original bytes จาก DCM โดยไม่เลือกไฟล์ซ้ำ | 03 | 68–73 |
| 05 | Table attachment lifecycle/physical rows และ duplicate-destination safety | 03 | 86–94 |
| 06 | Final Correction ด้วย frozen contract และ protected history | 04, 05 | 95–99 |
| 07 | Response deletion/shared-identity cleanup และ durable follow-up | 03 | 107–110 |
| 08 | Integrated native journey, selected-revision exports และ release evidence | 06, 07 | 100–106, 111–112 |

Cross-cutting validation/authorization/accessibility/legacy compatibility ต้องผ่านในทุกตั๋วที่แตะพฤติกรรมนั้น ไม่รอตั๋ว 08 จึงค่อยป้องกันข้อมูลสูญหาย

### Document verification — 2026-11-17

- ตรวจโครงสร้างเอกสารผ่านครบเจ็ดหัวข้อตาม to-spec และ user stories 1–112 มี actor/feature/benefit ครบ
- ตั๋ว 8 ใบมี `ready-for-agent`, parent reference, acceptance criteria และ Comments ครบ รวม 135 acceptance criteria; stories 112/112 ถูกจัดสรรเป็น primary coverage อย่างละหนึ่งตั๋ว
- ตรวจ blocking edges ตรงกับตารางในสเปค อ้างถึงตั๋วที่มีอยู่ก่อน ไม่มี dependency cycle และ local links 16 จุด resolve ได้
- เป็น structural validation ของเอกสารเท่านั้น ไม่ใช่ application tests, native smoke หรือ provider acceptance รอบนี้ไม่ได้เปลี่ยน application/DB/environment ไม่เรียก live API ไม่ commit/push/deploy และยังรอคำสั่งถัดไป

### Implementation authorization — 2026-11-17

- ผู้ใช้สั่งเริ่ม implementation ตาม implement-spec; ข้อความ planning-only ก่อนหน้านี้เป็นประวัติของรอบสร้างสเปค ไม่ใช่ blocker ปัจจุบัน
- Integration branch `feat/ecm-storage-templates` มี isolated checkout และ snapshot baseline `fc11a9d46914a5a62063f710f464515e67a819bf`; checkout ต้นฉบับและงานที่ยังไม่ commit คงเดิม
- อนุญาต live DCM เฉพาะ filename stem `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45)` ซึ่งคาดปลายทาง `2. มติและการก่อหนี้`; หากใช้ไม่ได้จึงพิจารณา `กทอ.67-00-0001-ขอเบิก1-นำส่ง` ซึ่งคาดปลายทาง `3. บันทึกตรวจเบิก` เลือกเพียงหนึ่ง scenario ถ้าใช้ได้ ไม่ขยายเป็นการทดสอบชื่ออื่น
- ใช้ synthetic file, ตรวจ collision ก่อนเขียน, ไม่เขียนทับไฟล์ที่มีอยู่ก่อน และไม่ retry/switch หลัง write outcome ไม่แน่นอน ผู้ใช้แจ้งว่าจะตามลบ จึงไม่ DELETE live artifacts เองหรือสร้างไฟล์เพิ่มโดยไม่จำเป็น
- Parent เป็นเจ้าของ live test เพียงรายเดียว Subagents ใช้ provider double เพื่อไม่ให้หลาย agent login/upload พร้อมกัน ผล accepted ชื่อซ้ำ/shared URL ยังไม่ใช่การรับรอง independence ของไฟล์แต่ละช่องหรือสิทธิ์ทำลายประวัติ

### Authorized DCM runtime sample — 2026-11-17

- ทดสอบ primary scenario เพียงหนึ่งครั้งด้วย `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf` หลัง search ไม่พบเป้าหมายเดิม ส่ง multipart สอง fieldตาม contract และ original PDF สังเคราะห์ 629 bytes
- POST ตอบ HTTP 200/status 200 โดย `data` เป็น object; provider รายงานปลายทาง `DMS/ShareFiles/2567/กทอ.67-00-0001/2. มติและการก่อหนี้` ตรง scenario ที่ผู้ใช้ระบุ ไม่ทดลองชื่อสำรอง
- Original fixture SHA-256: `4293a5cdab0808afc75f3e0e985f6f3cb5c7cfd457f9bb094d4c178375a8e21d` เปิด public file_link ผ่าน native viewer แล้วเห็นข้อความสังเคราะห์และ PDF หนึ่งหน้า แต่ Download control ไม่ให้ captured download ภายในเวลารอของเครื่องมือ จึงยังไม่อ้าง exact original-byte backend retrieval
- ไม่ทดสอบ overwrite, ชนิดไฟล์อื่น, zero/10 MB หรือ extensionless เพิ่ม และไม่ DELETE live file ผู้ใช้ต้องตามลบ synthetic PDF หนึ่งไฟล์ที่ปลายทางข้างต้น ไม่มี token/URL/credentials จริงในเอกสารนี้
- ผลนี้ supported เฉพาะ request/object receipt/ปลายทาง/การแสดง PDF ของตัวอย่าง ไม่ใช่ all-type download หรือ same-identity recovery proof; external provider semantic/deployed revision ยังไม่ทราบ
