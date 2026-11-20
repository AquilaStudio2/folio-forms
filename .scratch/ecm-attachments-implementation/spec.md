# Folio Excel ECM/DCM Attachments — Implementation Specification

Status: resolved Decision baseline: resolved planning decisions และ amendments ที่อ้างอิงใน Further Notes

## Problem Statement

User ต้องแนบเอกสารประกอบคำตอบของ Form ชนิด XLSX ได้ทั้งช่องเดี่ยวและแต่ละแถวของตาราง บันทึกเป็น Draft กลับมาแก้ ส่งเป็น Submission และเปิดเอกสารของ revision ที่กำลังดูได้จริง ปุ่ม Excel PoC ปัจจุบันเลือก File แล้วเก็บเฉพาะในหน่วยความจำ browser ไม่มี persistence หรือ ECM upload และยังป้องกัน Save Draft/Submit เมื่อมีไฟล์ค้าง จึงไม่ใช่ระบบแนบไฟล์ถาวร

Admin ต้องกำหนดหมวดปลายทางให้แต่ละช่อง/คอลัมน์ โดยใช้ระบบ Field และ binding เดิม ไม่ต้องออกแบบหน้า upload/editor ใหม่ ปัจจุบันยังไม่มีสัญญา attachment object ที่เชื่อม canonical JSON, workbook และ ECM อย่างครบวงจร การเพิ่ม API upload อย่างเดียวจึงไม่เพียงพอ: อาจทำไฟล์ผิดแถว ประวัติชี้ bytes ใหม่แทนฉบับเก่า หรือบันทึกคำตอบสำเร็จเพียงบางส่วน

ECM มีข้อจำกัดสำคัญตามคำชี้แจงที่ใช้วางแผน: ชื่อซ้ำเขียนทับและอ่านฉบับเก่าไม่ได้ การลบกู้คืนไม่ได้ URL เป็น public และไม่หมดอายุ และยังไม่มีหลักฐาน idempotency หรือ API ยืนยันผลคำขอที่ไม่แน่ชัด ต้องออกแบบการบันทึกและการติดตามให้รักษาไฟล์เดิม แยกความสำเร็จของข้อมูลออกจากการลบค้าง และไม่ลองส่งคำขอเขียนซ้ำโดยเดาผล

## Solution

ต่อยอดปุ่ม PoC เดิมในชีต แผงตั้งค่า Field เดิม และกล่องเลือกไฟล์เดิม ให้เป็นช่องแนบจริงหนึ่งไฟล์ต่อช่อง รองรับไฟล์ทุกชนิดขนาด 0–10,000,000 bytes รวมขอบเขต Admin เลือก Document Category จาก ECM API ต่อช่องเดี่ยวหรือต่อคอลัมน์ และใช้ `required`/Tag/binding ตามกติกาเดิม User กรอกหรือเลือก scalar root `fiscal_year` และ `docs_number` อย่างละหนึ่งค่าต่อ Response เพื่อใช้กับไฟล์ทุกช่องและทุกแถว ไม่มีค่าปีจัดเก็บอีกชุด

การเลือกไฟล์เป็นเพียง pending selection จน User กด Save Draft/Submit หรือ Admin บันทึก Correction ที่มีสิทธิ์ Folio server ใช้บัญชี ECM เฉพาะของ Folio จัดการ auth/token ด้วย PostgreSQL coordination แล้วส่ง bytes จริงตาม API contract เมื่อได้ผลที่ตรวจครบจึงบันทึกเอกสารและ JSON ของ snapshot เดียวกันเป็นหน่วยเดียว หลัง commit จึงลบเฉพาะไฟล์ Folio ที่ไม่มี references เหลือ

ผู้ใช้เห็นไฟล์ที่เลือกแยกจากไฟล์ที่บันทึกแล้ว มีข้อความสถานะค้างในหน้ากรอกเดิม และมีแนวทางทำต่อชัดเจน เมื่อไม่ทราบผล upload ร่างเดิมยังอ่านได้ แต่บันทึก ส่ง และลบคำตอบไม่ได้จนผู้ดูแลยืนยันผลและจัดการไฟล์ค้างครบ เมื่อข้อมูลใหม่บันทึกแล้วแต่ลบเก่าค้าง ใช้ข้อมูลใหม่ต่อได้พร้อมคำเตือน Admin ขยายรายละเอียดติดตามในหน้าผลลัพธ์เดิมได้

หน้าดูและ Excel/PDF export แสดง `file_link` ของช่อง/แถวใน revision ที่เลือกแทนปุ่ม upload ไม่มี picker หรือ preview ไฟล์แนบ ไม่มี file token ใน workbook/export ประวัติ Submission/Correction คง immutable และไม่สลับไปใช้ latest file แทน

## User Stories

1. As an Admin, I want attachment controls to extend the existing Excel PoC buttons, so that I can keep my current workbook layout.
2. As an Admin, I want verified existing scalar bindings to become explicitly configured attachment slots, so that files remain attached to the intended fields.
3. As an Admin, I want verified existing table-column bindings to support attachments, so that each response row has its own file slot.
4. As an Admin, I want automatic attachment_N tags to follow existing naming rules, so that new slots have collision-free identities.
5. As an Admin, I want to rename attachment tags before publication while retaining stable bindings, so that readable tags do not break placement.
6. As an Admin, I want attachment labels and requiredness in the existing Field settings, so that I do not maintain a second configuration interface.
7. As an Admin, I want Document Category choices from the category API, so that I select supported destinations rather than inventing paths.
8. As an Admin, I want a category for each scalar attachment field, so that different fields can use different document categories.
9. As an Admin, I want one category per attachment column shared by every row, so that existing and new rows follow the same published rule.
10. As an Admin, I want Users unable to change saved attachment categories, so that response input cannot redirect uploads.
11. As an Admin, I want incomplete attachment settings saved in Template Draft, so that unfinished design work is not lost.
12. As an Admin, I want publication blocked until every attachment category is saved, so that published slots have complete destinations.
13. As an Admin, I want publication to require scalar root fiscal_year and docs_number fields, so that every response has the agreed metadata sources.
14. As an Admin, I want publication independent of user-entered year and document-number values, so that template authoring does not fabricate response data.
15. As an Admin, I want saved categories retained during API outages, so that temporary provider failure does not erase configuration.
16. As an Admin, I want publication to use complete previously saved categories without a mandatory live recheck, so that category API outages do not block otherwise valid templates.
17. As an Admin, I want new category choices to require a valid API list, so that unavailable choices are not guessed.
18. As an Admin, I want saved category strings to remain unchanged after upstream renames, so that published destinations do not silently move.
19. As an Admin, I want attachment settings frozen after publication, so that existing responses retain their published contract.
20. As an Admin, I want to duplicate a Form when changing attachment settings, so that new configuration does not rewrite historical responses.
21. As an Admin, I want incomplete PoC buttons configured or explicitly removed before new publication, so that published controls do not imply unavailable uploads.
22. As an Admin, I want ambiguous or conflicting old mappings reported without conversion, so that existing data is not silently reassigned.
23. As a User, I want one file per scalar or table-row slot, so that every attachment has a clear destination.
24. As a User, I want files of any type accepted within the agreed limits, so that I can attach the original supporting document.
25. As a User, I want a file of exactly 10,000,000 bytes accepted, so that the documented inclusive limit is honored.
26. As a User, I want oversized files rejected with their actual size and slot, so that I know what to replace.
27. As a User, I want zero-byte files accepted, so that an intentionally empty original file remains valid input.
28. As a User, I want password-protected files accepted without disclosing passwords, so that Folio does not decrypt my attachment.
29. As a User, I want original bytes and extension preserved, so that upload does not disguise or transform my file.
30. As a User, I want extensionless files to remain extensionless, so that Folio does not add a false file type.
31. As a User, I want file selection to stay local until explicit save or submit, so that browsing for a file does not publish it.
32. As a User, I want the existing picker popup to distinguish saved and newly selected files, so that I know which file is durable.
33. As a User, I want the popup to show pending file name and actual size, so that I can verify my choice.
34. As a User, I want opening a saved URL separate from choosing a replacement, so that reading does not change my response.
35. As a User, I want to cancel a pending replacement before saving, so that I can keep the saved file.
36. As a User, I want removing an attachment to remain pending until save, so that removal does not immediately delete the provider file.
37. As a User, I want invalid replacements to leave the saved file intact, so that selection errors do not destroy prior work.
38. As a User, I want warnings before leaving or changing scope with pending selections, so that I understand unsaved files may disappear.
39. As a User, I want honest reload behavior for unsaved files, so that a remembered filename is not presented as recoverable bytes.
40. As a User, I want to resume a saved Draft with its canonical files and URLs, so that saved attachments survive reopening.
41. As a User, I want a new XLSX response round to start blank from Published Template, so that old submission files are not silently copied.
42. As a User, I want my old Submissions readable after starting a new round, so that a blank Draft does not erase history.
43. As a User, I want to enter or select one fiscal_year under the configured Field rules, so that every file uses the same response year.
44. As a User, I want to enter or select one docs_number under the configured Field rules, so that every file uses the same response document number.
45. As a User, I want file selection allowed before metadata completion, so that I can prepare inputs in a convenient order.
46. As a User, I want missing or invalid upload metadata to block writes and identify the Field, so that I can fix data without losing selections.
47. As a User, I want unsafe generated filenames rejected rather than rewritten, so that my actual metadata is not silently changed.
48. As a User, I want category-derived filename errors directed to the responsible Admin, so that I am not asked to change a locked destination.
49. As a User, I want metadata changes to reupload the saved original bytes on my next save, so that I need not reselect unchanged files.
50. As a User, I want my newly selected replacement used instead of the old file after metadata changes, so that the latest explicit choice wins.
51. As a User, I want unchanged files and metadata reused without upload or unnecessary login, so that ordinary saves do not create duplicate versions.
52. As a User, I want globally distinct uploaded version names, so that matching document numbers across rows or users cannot overwrite files.
53. As a User, I want Draft saved with missing required attachments, so that I can finish incomplete work later.
54. As a User, I want Submit blocked until required attachments are durably saved, so that a pending filename does not count as completion.
55. As a User, I want saved zero-byte attachments to satisfy requiredness, so that presence is not confused with nonzero size.
56. As a User, I want invalid selected files rejected even during Draft save, so that Draft does not hide invalid pending input.
57. As a User, I want fully empty table rows excluded from attachment requirements, so that unused workbook rows need no files.
58. As a User, I want attachment-only rows retained as response rows, so that files are not dropped when other cells are empty.
59. As a User, I want attachment-only rows checked for other required columns at Submit, so that files cannot bypass row validation.
60. As a User, I want supported row changes to preserve file-to-row mapping, so that moving rows does not attach files to neighbors.
61. As a User, I want unsupported or unprovable row changes rejected, so that Folio never guesses attachment placement.
62. As a User, I want row movement alone to reuse the same file version, so that layout changes do not create unnecessary uploads.
63. As a User, I want Save Draft and Submit to commit document and answer JSON together, so that both describe the same saved revision.
64. As a User, I want multi-file operations to succeed only as a complete snapshot, so that partial upload does not appear as a complete response.
65. As a User, I want a failed batch canceled and its new unreferenced files cleaned, so that an unsuccessful save does not become a hidden partial result.
66. As a User, I want further mutations blocked while a canceled batch remains unsettled, so that a new save cannot race unresolved cleanup.
67. As a User, I want a new save to use new version identities after cancellation, so that canceled receipts are not adopted into a different operation.
68. As a User, I want my previous canonical Draft readable when upload outcome is unknown, so that I can still inspect saved work.
69. As a User, I want save, submit and response deletion blocked for unknown upload outcomes, so that uncertain writes are not duplicated or orphaned.
70. As a User, I want persistent instructions to contact an Admin for unknown outcomes, so that I am not left watching an unexplained spinner.
71. As a User, I want lost Folio responses resolved by checking the original operation, so that a completed save is not uploaded or submitted twice.
72. As a User, I want a committed new response usable despite old-file cleanup failure, so that cleanup does not falsely undo my successful save.
73. As a User, I want persistent cleanup warnings to state old URLs may still work, so that I do not assume deletion has completed.
74. As a User, I want repeated clicks and reloads to return the original operation result, so that they do not create duplicate writes.
75. As a User, I want stale tabs and callbacks unable to overwrite newer saved revisions, so that concurrent activity does not lose work.
76. As a User, I want errors to identify the field or table row without leaking upstream secrets, so that I can act safely.
77. As a User, I want keyboard-accessible and labelled attachment controls, so that I can use the existing workflow without pointer-only actions.
78. As a User, I want file links and exports to match the selected revision, so that history never opens another version by latest lookup.
79. As a User, I want read-only views and exports to show URLs rather than upload controls, so that opening results cannot modify files.
80. As a User, I want broken historical URLs reported without substituting a different file, so that revision identity remains trustworthy.
81. As a User, I want public-link risk stated accurately, so that I understand people with the URL may open it without Folio login.
82. As a User, I want only my own responses accessible through Folio, so that public provider links do not expand application permissions.
83. As a Viewer, I want saved Drafts, Submissions and Corrections readable under existing permissions, so that I can inspect authorized results.
84. As a Viewer, I want attachment modification and deletion denied, so that read access does not become write access.
85. As an Admin, I want attachment changes through valid Correction with a reason, so that corrections retain the existing audit workflow.
86. As an Admin, I want Correction requiredness and revision eligibility enforced before completion, so that attachments do not bypass submission rules.
87. As an Admin, I want internal Correction workspace or project saves to avoid upload, so that only explicit Save Correction creates external files.
88. As an Admin, I want validated workspace transitions to preserve pending selections or stop before losing them, so that internal reloads do not discard files silently.
89. As an Admin, I want previous Submission and Correction file snapshots preserved, so that new corrections do not rewrite evidence.
90. As an Admin, I want durable follow-up details expandable in the existing results page, so that I can coordinate unresolved files without a new dashboard.
91. As an Admin, I want trusted operation, version, destination and timing evidence for PM coordination, so that uncertain requests can be investigated precisely.
92. As an Admin, I want unresolved status released only after sender settlement and file cleanup are proven, so that an empty search cannot falsely resolve risk.
93. As an Admin, I want operator confirmation and evidence recorded, so that follow-up has a durable accountable outcome.
94. As an Admin, I want late upload receipts retained for canceled-batch cleanup, so that process timeouts do not hide created files.
95. As an Admin, I want cleanup records to survive process crashes and Response deletion, so that outstanding files remain traceable.
96. As an Admin, I want deletion to require canonical ownership and no surviving references, so that another response or history cannot lose its file.
97. As an Admin, I want reference creation fenced against deletion claims, so that a file cannot become newly referenced while being deleted.
98. As an Admin, I want whole-Response deletion to keep existing rights and confirmation, so that attachments do not broaden deletion authority.
99. As an Admin, I want whole-Response deletion to clean only unreferenced Folio uploads, so that unrelated provider files remain untouched.
100. As an Admin, I want separate outcomes for deleted response data and pending file cleanup, so that deletion reports remain truthful.
101. As an Admin, I want archive to retain files and history, so that archive is not mistaken for deletion.
102. As an Admin, I want old Published PoC Forms to retain ordinary input contracts, so that release does not rewrite existing responses.
103. As a User, I want old PoC upload buttons to explain their limitation and direct me to the Admin, so that they do not silently pretend to save files.
104. As an Admin, I want Form duplication to exclude user responses and files, so that new attachment-enabled Forms do not copy private answer data.
105. As a User, I want old text and URL answers to remain ordinary values, so that Folio does not invent file receipts or deletion authority.
106. As an Admin, I want Folio-only server-side ECM authentication, so that Folio does not depend on or invalidate Ongoing credentials.
107. As an Admin, I want encrypted shared token state and coordinated refresh across Folio instances, so that simultaneous requests do not compete to log in.
108. As an Admin, I want at most three total bounded login attempts for transient failures, so that auth recovery cannot loop indefinitely.
109. As a User, I want ECM auth errors separated from my Folio session, so that provider failure does not log me out or request service credentials.
110. As an Admin, I want unknown write outcomes never automatically resent after token refresh, so that auth recovery cannot duplicate uploads or deletion.
111. As an Admin, I want canonical attachment JSON validated within 262,144 UTF-8 bytes, so that metadata is complete rather than silently truncated.
112. As a User, I want workbook and exported documents to contain no file tokens or service credentials, so that sharing documents exposes only the accepted public URLs.

## Implementation Decisions

### 1. ฐานปัจจุบันและขอบเขตการเปลี่ยน

- **Current behavior:** PoC สร้าง Field ชนิด text ด้วย pattern `automaticUploadPocField`/`attachment_N` และ stable binding; host เก็บ File ใน memory และ guard การบันทึก ไม่เรียก ECM ไม่เขียน file object ถาวร ข้อมูลนี้ตรวจจาก source ปัจจุบัน ไม่ใช่เพียงข้อสรุปจากชื่อ PoC
- **Current behavior:** การบันทึก Draft/Submission ใช้ transaction เพื่อเชื่อม canonical document กับ JSON และตรวจ stale state อยู่แล้ว การดึงตารางเดิมหาแถวจากค่า input cells จึงยังไม่ครอบคลุม attachment-only rows โดยตัวมันเอง
- **Intended behavior:** ขยาย Field contract, authoring, trusted spreadsheet preparation/extraction/projection, pending selection bridge, Operation/callback/completion, Correction workspace, results/exports และ Response deletion/recovery ให้ทำงานเป็นวงจรเดียว ไม่เพียงถอด guard PoC หรือเพิ่ม upload endpoint จุดเดียว
- ใช้ Spreadsheet Contract ที่ประกอบจาก Field/manifest และ Excel Binding เดิม ไม่สร้างแหล่งสัญญาต้นแบบซ้ำอีกชุด เพิ่มการระบุช่องแนบอย่างชัดเจนในสัญญาและ validator เฉพาะบริบทนั้น ไม่เดาจาก Tag หรือค่า URL
- ขอบเขตคำตอบคือ XLSX เท่านั้น ไม่เปลี่ยน DOCX หรือ main-document viewer ไม่มี dependency ใหม่ไป Ongoing และไม่มี demo app เป็นฐาน implementation
- ไฟล์แนบจริงส่งไป external ECM API ตั้งแต่เริ่มใช้ฟีเจอร์ ไม่เพิ่ม persistent RustFS attachment storage RustFS คงใช้กับ Form/workbook/main-document artifacts เท่านั้น ห้าม stage attachment bytes/base64 ใน XLSX/OLE หรือ answer JSON เพื่อหลบสัญญานี้
- คง worksheet/object protection และ ONLYOFFICE adapter behavior เดิม การเพิ่ม picker หรือ URL projection ต้องไม่ปลดการป้องกันชีต/วัตถุเพื่อให้ปุ่มทำงาน

### 2. Authoring, categories และ published contract

- Admin ตั้ง Document Category ในแผง Field เดิม ต่อช่องเดี่ยวหรือต่อคอลัมน์แนบ คอลัมน์หนึ่งใช้ค่าร่วมทุกแถวรวมแถวใหม่ แต่ละช่อง/คอลัมน์เลือกต่างกันได้ User ไม่มีสิทธิ์เลือกหรือส่งปลายทางเอง
- **Authoring amendment ยืนยันวันที่ 16 พฤศจิกายน 2026:** เอา checkbox “ช่องแนบไฟล์จากปุ่มเดิม” ออก ใช้คำสั่ง **เพิ่มช่องแนบไฟล์** และชื่อปุ่มในชีต **แนบไฟล์** ไม่แสดงคำว่า POC ใน flow นี้ คง GUID, stable binding, marker และ protocol identifiers เดิม ไม่ migrate ฟอร์มเก่าอัตโนมัติ
- กดเพิ่มช่องแล้วเปิด popup **เลือกหมวดหมู่จัดเก็บเอกสาร** ข้างนอกแผง Field ก่อนสร้าง Field/ปุ่ม ใช้ ONLYOFFICE background plugin กับ `ShowInputHelper` รูปแบบเดียวกับตัวเลือกโครงการ PDMS ไม่ใช้ HTML dialog ภายใน sidebar โหลดรายการใหม่ผ่าน Folio backend ทุกครั้งที่เปิด เลือกหมวดจริงแล้วกด **ยืนยันและบันทึก** จึงสร้าง/ตั้งค่าช่องแนบและบันทึกต้นแบบ ยกเลิกหรือ Escape ก่อนยืนยันไม่สร้างหรือเปลี่ยน Field/ปุ่ม; loading, error และรายการว่างยังยืนยันไม่ได้ มี **ลองใหม่** และ **ยกเลิก** โดยไม่สร้างหมวดสำรอง
- ช่องแนบเดิมแสดงหมวดที่บันทึกและคำสั่ง **เปลี่ยนหมวด** ซึ่งใช้ popup เดียวกัน ไม่ใช้ dropdown/ปุ่มโหลดหมวดอีกชุด ชื่อเดิมคงอยู่เมื่อ API ล่มหรือเปลี่ยนชื่อ upstream แต่การเลือกใหม่ใช้เฉพาะรายการที่เพิ่งโหลด Title/Tag/required ยังแก้ผ่านแผงเดิมโดยไม่ล้างสถานะ attachment/category
- ช่องข้อความหรือคอลัมน์เดิมใช้ id/Tag/rules เดิม เมื่อแปลง ordinary mapping ต้องวางและบันทึกปุ่มให้ได้ canonical saved-button proof ก่อน PATCH attachment/category แล้วบันทึกต้นแบบอีกครั้ง ล็อก authoring ตลอด action รวมระหว่างสองการบันทึก หากขั้นใดไม่สำเร็จไม่รายงานผลสำเร็จและการลองใหม่ใช้ช่อง/Tag เดิม การเปลี่ยนหมวดของช่องแนบที่ตั้งไว้แล้วไม่สร้างปุ่มใหม่
- Popup มีหน้าที่แสดงผลและส่งคำเลือกเท่านั้น แผงหลักยังโหลด API ตรวจ whitelist/current target และถือสิทธิ์บันทึก Parent relay ตรวจ origin, live iframe, bridge/channel/document/request/instance และส่งเฉพาะคำสั่งที่กำหนด ไม่ส่ง capability หรือ ECM credentials/Bearer ให้ popup ใช้ auth coordinator และ category endpoint เดิมฝั่ง server ใช้ token generation ที่ยังใช้ได้ ไม่บังคับ login ใหม่ทุกครั้งที่เปิด ไม่มี schema migration หรือเปลี่ยนจังหวะ upload จาก User Save Draft/Submit และ final Admin Correction
- หมวดที่ยืนยันแล้วคงเป็น panel draft และ dirty/navigation state จนยืนยัน metadata commit สำเร็จ การบันทึกปุ่มเพื่อพิสูจน์ช่องเดิมครั้งแรกต้องไม่ทำให้หมวดที่ยังรอบันทึกถูกมองว่าไม่มีการแก้ไขค้าง
- เปิด background popup เฉพาะ XLSX Template Draft editor โดยไม่ขึ้นกับการเปิดใช้ PDMS; fill, Correction และ read-only ไม่ได้รับ scope นี้ รอ native popup แสดงผลได้ไม่เกิน 5 วินาที แต่ไม่จำกัดเวลาที่ Admin เลือกหมวด ปิด/เปลี่ยน editor แล้วต้องยกเลิกคำเลือกเก่า เก็บ pending panel draft/dirty state ตามเดิม Editor ที่เปิดค้างจาก config เก่าต้องเก็บงานแล้วเปิดใหม่ ไม่มี fallback กลับเข้า sidebar
- อ่านรายการด้วย `GET /api/beeecm/public/document/category` เป็น root array ของรายการ `id`/`type` ตาม response example ของเอกสารทางการ เก็บและส่งชื่อหมวด string จาก `type` ไม่ใช้ numeric ID แทน `documentCategory` ไม่รอ `data` envelope ของ login/upload; ตาราง Response Fields ในเอกสารระบุ `data: Array` ขัดกับตัวอย่าง และการตรวจจริงที่ได้รับอนุญาตพบ HTTP 200 โดยไม่มี field `data`
- ใช้ Tag อัตโนมัติ `attachment_N` ตาม pattern เดิม Admin แก้ก่อนเผยแพร่ได้ตามความไม่ซ้ำและ scope เดิม ช่องตารางใช้ column tag ตามโครงสร้างตาราง ไม่สร้าง tag ใหม่รายแถวหรือรายไฟล์ การ rename ต้องคง binding และปรับ key/metadata ของปุ่มให้ตรง ไม่ทิ้งชื่อเก่า
- Template Draft บันทึกแม้ category หรือ root scalar tags ยังไม่ครบได้ ก่อนเผยแพร่ต้องมี category ที่เคยเลือกจาก API ครบทุกช่อง/คอลัมน์ และมี scalar root `fiscal_year` กับ `docs_number` อย่างละหนึ่ง Field ไม่บังคับใส่ค่าของ User ในต้นแบบ
- ปุ่ม PoC ในฉบับที่จะเผยแพร่ใหม่ต้องตั้งเป็นช่องแนบจริงครบหรือ Admin นำปุ่มที่ไม่ใช้ออกเอง ไม่เหลือ controls ที่ดูพร้อมอัปโหลดแต่ยังไม่ตั้งค่า
- Saved category อยู่ต่อเมื่อ API ล่มหรือหมวดเปลี่ยนชื่อ ไม่ล้างหรือเปลี่ยนตาม upstream อัตโนมัติ ไม่บังคับเรียก API ใหม่ก่อนเผยแพร่หรือ User Save/Submit แต่การเลือก category ใหม่ต้องมีรายการที่ใช้ได้
- หากทราบว่าปลายทางใช้ไม่ได้หรือ ECM ปฏิเสธ ให้หยุดและระบุช่อง/category ไม่เลือกหมวดสำรอง ไม่แตะไฟล์เดิมหรือแก้ published contract ทางแก้คือประสาน PM เรื่องปลายทางเดิม หรือ duplicate Form เพื่อเปลี่ยน category
- หลังเผยแพร่ attachment contract/category/required/tags คง immutable ตามกติกาเดิม เปลี่ยนโดยทำสำเนา Form ไม่ย้ายไฟล์หรือแก้คำตอบเดิมย้อนหลัง PM สร้างโฟลเดอร์ใน DCM; Folio ไม่ browse arbitrary paths หรือสร้างโฟลเดอร์เอง ขั้นตอนเตรียมโฟลเดอร์ฝั่ง Admin/PM ต้องมีปีงบประมาณที่ตกลงสำหรับโครงสร้างนั้น แต่ไม่เพิ่มค่าปี storage อีกชุดใน Response

### 3. Metadata, filename และ file-version identity

- `fiscal_year` และ `docs_number` เป็น scalar root ระดับ Response อย่างละหนึ่งค่า User กรอกหรือเลือกตาม Field rules ที่ Admin กำหนด ทุกไฟล์/ทุกแถวใช้ค่าของ snapshot เดียวกัน ไม่มีเลขหรือปีรายแถว ไม่มีปี storage อีกแหล่ง ไม่ดึงเลขย้อนจากชื่อโครงการ
- รักษา ADR 0003: project-name answer ไม่ใช่ project identity และชื่อซ้ำถูกยุบ จึงอนุมานเลขหนังสือจากชื่อไม่ได้ รักษา ADR 0004 และผลค้นหาเดิม: บทบาทใหม่ของ `fiscal_year` ไม่เปลี่ยนรูปแบบตัวกรองหรือการเลือก revision
- Multipart filename คือ `<docs_number>-<unique-version-id>-<category>.<original-extension>`; category อยู่ท้ายก่อนนามสกุล ถ้าไม่มีนามสกุล ชื่อจบที่ category คง extension เดิม รวมตัวพิมพ์ตามต้นฉบับ ไม่เติม `.pdf` ไม่แปลง bytes
- Unique version identity ต้องแยกข้ามไฟล์ ช่อง แถว User Form และ operation ไม่ใช้เลขแถวหรือ binding อย่างเดียวซึ่งซ้ำได้ การอัปโหลดฉบับใหม่ต้องไม่ใช้ชื่อที่เขียนทับไฟล์ประวัติ ไม่ใช้ latest-by-document-number เป็น identity
- ตรวจความปลอดภัยของชื่อ multipart ทั้งชื่อรวมและ extension ปฏิเสธชื่อไม่ปลอดภัย ไม่แทนด้วย `_` ไม่ trim/ตัด/แก้ metadata เงียบ ๆ เลขหนังสือมี `/` หรือ `\` จึงใช้แนบไม่ได้ตามข้อสรุปที่รับทราบ หากปัญหามาจากหมวดให้แจ้ง Admin/ผู้ดูแลหมวด ไม่เปิด User เปลี่ยนปลายทาง
- เลือกไฟล์ก่อนกรอก metadata ได้ แต่ถ้ามีไฟล์ต้องอัปโหลดและปี/เลขว่างหรือไม่ถูกต้อง ต้องหยุด Save/Submit ก่อน external write ระบุ Field และรักษา selection ในหน้าปัจจุบัน ไม่ใช้ค่าจำลอง หากไม่มีไฟล์ต้องอัปโหลด ข้อนี้ไม่เพิ่มข้อบังคับ metadata สำหรับ Draft นอก Field rules เดิม
- ไฟล์และ metadata ไม่เปลี่ยนให้ reuse reference เดิม ไม่สร้าง identity/upload/login เพียงเพราะกด Save/Submit หากปีหรือเลขเปลี่ยน ให้อ่าน bytes ของ saved original แล้วอัปโหลดฉบับใหม่เมื่อกดบันทึก ไม่บังคับเลือกไฟล์ใหม่ หากมี pending replacement ใช้ไฟล์ใหม่ที่เลือกแทน
- ใช้ `original_name` เพื่อระบุนามสกุลเดิม ไม่แยกจาก URL หรือ generated filename ที่เลขหนังสืออาจมีจุด การอ่าน bytes เดิมต้องใช้ reference canonical และตรวจปลายทางฝั่ง server ป้องกัน SSRF/redirect ไม่รับ arbitrary URL จาก client หากอ่านไม่ได้ให้หยุดและรักษาฉบับเดิม

### 4. เกณฑ์ไฟล์และ requiredness

- หนึ่งไฟล์ต่อช่องเดี่ยวหรือช่องในแต่ละแถว รับทุกชนิด รวม extensionless, 0 bytes และ password-protected โดยไม่เพิ่ม MIME/extension allowlist ที่ขัด requirement
- ขนาดจริงต้องอยู่ใน `0 <= size_bytes <= 10,000,000` ต่อไฟล์ เป็น decimal MB ไม่ใช่ 10 MiB ไม่ใช่รวมทุกไฟล์หรือ multipart body ตรวจ bytes ฝั่ง server ไม่เชื่อ filename, MIME, client metadata หรือ `Content-Length` เพียงอย่างเดียว
- ไม่ขอรหัสผ่าน ถอดรหัส render preview หรือรับรองว่าไฟล์ไม่เสียหาย/ปลอดภัย ไม่เติม bytes เพื่อหลบ zero-byte behavior
- Admin ตั้ง required รายช่อง/คอลัมน์ Draft ขาด required attachment ได้ แต่ไฟล์ที่เลือกแล้วไม่ผ่านต้องทำให้ Draft save ไม่ผ่านเช่นกัน ไม่เงียบกลับไปใช้ไฟล์เดิมเพื่อข้าม validation
- Submit และ Correction ที่สำเร็จต้องมีไฟล์ตาม required contract; pending selection อย่างเดียวไม่ทำให้ผ่าน การ Submit พร้อมไฟล์ใหม่ทำได้เมื่อผล upload และ canonical commit ครบ ไม่บังคับ Save Draft ล่วงหน้าเป็นขั้นตอนใหม่
- Saved object ขนาด 0 นับเป็น present อย่างชัดเจน ไม่ใช้ `size_bytes > 0` เป็นเงื่อนไข
- แถวที่มี input data หรือ attachment อย่างน้อยหนึ่งช่องคือแถวที่ต้องรักษาและตรวจ required รวม attachment-only/zero-byte rows ตรวจ required columns อื่นในแถวนั้นด้วย แถวว่างทั้งหมดไม่มีไฟล์ไม่บังคับแนบเพียงเพราะมีปุ่ม
- ตรวจสิ่งที่ตรวจได้ก่อน external write และตรวจ schema/required/mapping อีกครั้งเมื่อประกอบ snapshot ก่อน commit ไม่สร้าง partial Submission/Correction

### 5. Canonical JSON และ trusted row mapping

- ช่องแนบไม่มีไฟล์เป็น `null`; มีไฟล์ที่บันทึกแล้วเป็น object ใต้ Field tag มี `file_link`, `file_token`, `original_name`, `size_bytes` ครบทั้งสี่ค่า ช่องเดี่ยวไม่มี `row_index`
- ช่องตารางอยู่ใน row object เดียวกับข้อมูลแถวและเพิ่ม `row_index` เป็นจำนวนเต็มเริ่ม 0 ภายในช่วงตารางจริงของ trusted document/revision นั้น ไม่ใช่หมายเลขแถว worksheet แบบหนึ่งฐาน และไม่ใช่ลำดับ JSON array หลัง compact
- `file_link`/`file_token` ต้องเป็นคู่จาก upload เดียวกันที่ server ตรวจแล้ว `original_name` เป็น basename ของไฟล์เดิมที่รับและตรวจ ไม่ใช่ path `size_bytes` เป็น integer 0–10,000,000 จาก bytes จริง ไม่เดาหน่วยจาก upstream `file_size`
- Pending File/binary/base64 ไม่อยู่ใน persisted answer JSON เฉพาะ attachment fields ที่ประกาศชัดเท่านั้นรับ object; plain text, ตัวเลข, dropdown และ Fields อื่นคง validation เดิม รวม unknown keys และข้อจำกัดตามบริบท
- Canonical JSON ทั้งชุดรวม metadata ต้องไม่เกิน **262,144 UTF-8 bytes** ปฏิเสธเมื่อเกิน ไม่ตัด URL/token/แถว ไม่เพิ่มเพดานอัตโนมัติ และไม่ย้าย metadata ออกเพื่อหลบเพดาน operational records เพิ่มได้เพื่อ recovery แต่ไม่แทนข้อมูล file object ใน answer JSON
- ผูก slot ด้วย published contract, stable binding, tag, actor/target และ trusted current document/revision ตรวจ marker/placement/ขอบเขตแถวจากข้อมูลที่ server เชื่อถือ ไม่เชื่อ binding หรือ `row_index` ของ client โดยลำพัง
- Supported row commands ต้องปรับ workbook, pending selections และ canonical metadata ด้วยกันใน operation เดียว ไม่เปลี่ยน snapshot เก่า ไม่อัปโหลดใหม่เพียงเพราะแถวเลื่อน หาก mapping ไม่พิสูจน์หรือคำสั่งไม่รองรับให้หยุด ไม่เพิ่มความสามารถลบแถวใหม่เพื่อหลบข้อจำกัด Row-command minimum ของทุกฟอร์ม XLSX รวมฟอร์มที่ไม่มี attachment ให้ยึด [Resolution ล่าสุด](../ecm-attachment-safety/issues/05-final-row-mapping.md#resolution--2026-11-18--pyw1tt--ทุกฟอร์ม-excel-ต้องเหลืออย่างน้อยหนึ่ง-row) ซึ่งห้ามลบต่อเมื่อเหลือหนึ่ง body row ไม่ล้างข้อมูลแทน และคงปุ่มครบทุก configured attachment column; เป็น intended policy ที่ยังไม่ใช่ implemented/runtime-tested behavior
- Workbook/export เป็น projection ของ `file_link` เท่านั้น ห้าม file token ใน cell, hidden metadata, สูตร หรือส่วนใดของ workbook เพื่อกู้ภายหลัง
- เมื่ออ่าน workbook กลับ ให้ประกอบ attachment metadata จาก canonical JSON และ verified receipts ของ workspace/revision เดียวกัน URL cell ไม่ใช่หลักฐาน ownership การแก้ URL หรือ client object/token ไม่ได้ adopt ไฟล์ใหม่ การเปลี่ยน/นำออกต้องผ่านคำสั่ง attachment ที่มีสิทธิ์
- `file_token` คือ file identifier สำหรับ Delete ไม่ใช่ ECM Bearer และไม่ใช่อำนาจลบโดยตัวมันเอง Credentials/Bearer ห้ามอยู่ใน answers, browser, URLs หรือ exports

### 6. ECM API contract และ validation boundary

- Login: `POST /api/beeecm/public/login` ส่ง JSON `username`/`password` จาก server config ตรวจ `data.token` และ `data.expire` ก่อนใช้งาน รองรับ ISO datetime ที่มี offset และรูปแบบ DCM `YYYY-MM-DD HH:mm:ss` ซึ่งผู้ใช้ยืนยันว่าเป็น UTC+7 แปลงแบบระบุ `+07:00` ไม่ใช้ timezone ของเครื่อง Folio ยังคงปฏิเสธวันที่ปฏิทินผิด/หมดอายุ/อายุไม่พอ และ ISO ที่ไม่มี offset ไม่สมมติ refresh-token/logout endpoint
- Upload: `POST /api/beeecm/public/file` ใช้ server-side Bearer และ `multipart/form-data` ส่ง `documentFile` เป็น original bytes พร้อม generated filename; `template` เป็นข้อความ `"0"`; `documentYear` จาก `fiscal_year`; `documentNumber` จาก `docs_number`; `documentCategory` เป็น saved category name string
- ส่งทีละไฟล์ต่อ operation หยุดเริ่มไฟล์ถัดไปเมื่อมีปัญหา ไม่ส่ง JSON ที่มีเพียงชื่อไฟล์แทน binary ไม่ใช้ `template=1` ของ Ongoing เป็น contract ของ Folio
- Upload ใช้ docs เป็นฐาน parser และตรวจ success/shape รวม `file_link`/`file_token` ที่ใช้ได้ก่อนสร้าง receipt ไม่รับ delete response `status`/`data: null`/`msg` มาเป็น upload success ไม่ขยาย parser ด้วยรูปทรงที่เดาเพื่อกลบความต่างระหว่าง docs กับ Ongoing
- Delete: `DELETE /api/beeecm/public/file?token=<file_token>` ใช้ token จาก canonical server records ของ Folio เท่านั้น ตรวจ response/error ตาม provider contract ก่อนยืนยันลบ ไม่ถือ network timeout ว่าลบสำเร็จหรือยังไม่ลบ
- ตรวจ service URL และ upstream file URL อย่างปลอดภัยก่อนเรียก/แสดงผล ห้าม executable URL schemes เช่น `javascript:` และห้ามส่ง service credentials/Bearer ตาม redirect ไปปลายทางอื่น การอ่าน original bytes ต้องมี trust policy ฝั่ง server ไม่เปิด fetch arbitrary URL
- ข้อผิดพลาดสำหรับ User ต้องปลอดภัย ระบุ Field/slot/row/category และสาเหตุที่แก้ได้ ไม่คืน raw upstream errors หรือ secrets
- ไม่มีหลักฐาน runtime upload response, idempotency, lookup reconciliation หรือ provider limit ที่ครบ จึงไม่อ้าง API ที่ยังไม่ยืนยันว่าแก้ unknown outcomes อัตโนมัติได้

### 7. บัญชี Folio และ shared auth coordination

- ใช้บัญชี ECM เฉพาะ Folio กับ `ECM_API_URL`, `ECM_USERNAME`, `ECM_PASSWORD` ฝั่ง server ไม่ใช้ credentials/token ของ Ongoing เป็น fallback ไม่เปลี่ยน login/session/role ของคนใน Folio ไม่มีหน้า ECM login หรือ public token endpoint
- Config ไม่ครบ/ไม่ถูกต้องให้เฉพาะงาน ECM ที่ต้องใช้ auth ใช้ไม่ได้พร้อม integration error ที่ชัดเจน ไม่สร้าง token/expiry/response ปลอม ไม่บังคับการดู canonical results หรือ public URLs ให้ login ECM ใหม่
- PostgreSQL ของ Folio เป็น shared source of truth สำหรับทุก instance/worker ของบัญชี แยก state ตาม endpoint/account ไม่ใช้ memory cache ต่อ process เป็นความจริงคู่ขนาน ไม่เพิ่ม Redis หรือ cross-system token broker
- Persist token แบบเข้ารหัส ควบคุม backend access และแยกกุญแจ/secret ออกจาก cache row ใช้ `ECM_TOKEN_ENCRYPTION_KEY` ฝั่ง server เป็น key 32 bytes ใน canonical Base64 และใช้ค่าเดียวกันทุก instance ที่แชร์ auth state ไม่ใช่ login token ห้ามรั่วสู่ browser, localStorage, logs, answer JSON หรือ exports การจัดหากุญแจผ่าน secret channel เป็น operational prerequisite ไม่ใส่ค่าใน spec หรือเปลี่ยน key เดิมโดยไม่มีแผนจัดการ encrypted state
- ใช้ shared claim/lease กับ generation/ownership checks ให้ concurrent waiters ร่วมงาน auth เดียวกัน ไม่ถือ DB transaction ค้างระหว่าง network ผลช้าหรือ rejection ของ token เก่าไม่เขียนทับ/ล้าง generation ใหม่
- ตรวจ token ก่อนคำขอ ECM สำหรับโหลดหมวด อัปโหลด และลบ ใช้ expiry จริงที่แปลงเป็นเวลาสากลแล้ว หาก token ใน cache เหลือไม่เกิน **12 ชั่วโมง** หรือไม่ครอบคลุม request timeout กับ clock-skew margin ให้ต่ออายุผ่าน shared coordinator ก่อนส่งคำขอ หากเหลือมากกว่าทั้งสองเกณฑ์ให้ reuse เดิม สำหรับ token อายุ 15 วัน จุดต่ออายุคือประมาณวันที่ 14 ครึ่งเมื่อมีคำขอ ไม่เพิ่ม cron, polling หรือ login เมื่อไม่มีงาน ECM ไม่คำนวณ `now + 15 วัน` ทับ `expire` และไม่เดา timezone ของรูปแบบอื่น
- เกณฑ์ 12 ชั่วโมงใช้ตัดสินใจต่อ token ใน cache เท่านั้น Token ใหม่หลัง login ยังต้องผ่าน request-budget/skew validation เดิม ไม่บังคับให้มีอายุ 12 ชั่วโมงหรือ 15 วัน หาก provider ออก token อายุสั้นกว่า 12 ชั่วโมงจริง คำขอถัดไปจะเข้าเกณฑ์ต่ออายุอีกครั้ง ไม่ขยาย expiry ปลอมหรือวน login ซ้ำในคำขอเดียว
- Login สูงสุด **3 attempts รวมครั้งแรก** เฉพาะ transient network/timeout, HTTP 408/429 หรือ 5xx ตาม policy ไม่ retry credential rejection, permission/config errors หรือ malformed response/expiry ไม่ซ้อน retry หลายชั้น
- Design budgets: ต่อ attempt ไม่เกิน 15 วินาทีและไม่เกินเวลารวมที่เหลือ; deadline รวม 30 วินาที; backoff ก่อน retry 1 และ 2 วินาทีตามลำดับ เคารพ valid `Retry-After` ภายใน deadline ถ้าไม่พอให้หยุด ไม่บังคับครบ 3 และไม่มีครั้งที่ 4 ตัวเลขนี้เป็น design ไม่ใช่ latency ที่วัดจาก ECM
- Retry budget อยู่ใน shared auth job ไม่ใช่ waiter ละ 3 attempts ทุก waiter มี bounded completion; lease รวมเวลางาน/backoff/persistence และไม่ปล่อย claim จาก waiter คนเดียวที่ยกเลิกจนเกิด competing login
- เมื่อ ECM ปฏิเสธ token invalidate เฉพาะ generation ที่ใช้จริงแล้วคืน integration error คำขอใหม่ที่ปลอดภัยใช้ policy ปัจจุบัน ไม่ resend category/upload/delete เดิมอัตโนมัติหลัง 401 และไม่ทำให้ User หลุดจาก Folio ไม่กลบ Folio 401/403 ที่แท้จริง
- ผู้ใช้แจ้งจากเอกสาร DCM ว่า token มีอายุ 15 วัน และ login DCM ใหม่ทำให้ token ก่อนหน้าใช้ไม่ได้ทันที จึงไม่ถือว่า token จะใช้ได้ครบ 15 วันเสมอ บัญชี Folio ต้องไม่มี instance/environment/worker/manual login นอก coordination ที่อาจตัด token กัน ใช้บัญชีแยกจาก Ongoing/ระบบอื่น หรือประสานผ่าน coordinator เดียวกัน Shared coordinator ป้องกัน competing login แต่ไม่ได้รอให้คำขอที่ส่งด้วย token เก่าเสร็จก่อน จึงยังอาจได้รับ 401 ระหว่างต่ออายุ; คงการตรวจ generation และไม่ resend mutation อัตโนมัติ การ login Folio ของคนไม่ต้องออก ECM token ใหม่ ไม่มี background upload queue หรือ retry daemon จากการเลือก retry auth

### 8. Save operation และ all-or-nothing commit

1. เริ่มเฉพาะ explicit User Save Draft/Submit หรือ valid Admin Save Correction พร้อมเหตุผลและสิทธิ์ ตรวจ auth/role/ownership/editor lease, published contract, current base document/revision, binding/row, metadata, file limits และ required เท่าที่ตรวจได้ก่อน external write
2. จับ snapshot ของเอกสาร JSON pending selections และ supported row commands เป็นชุดเดียว Persist Operation และ per-version intent ก่อนเริ่มส่ง รวม actor/target/base revision, slot/binding/row, generated identity/name, year/category และช่วงเวลา ใช้ transaction สั้น ไม่ถือ lock ระหว่าง ECM call
3. Reuse unchanged references ส่งไฟล์ใหม่/metadata-change versions ทีละไฟล์ บันทึก verified receipt ลง durable intent เดิมทันที ผลช้าต้องผูกกลับ intent เดิมได้แม้ operation timeout/cancel ไม่สร้าง receipt จาก filename หรือข้อความ cell
4. เมื่อผลครบ ประกอบ URL projection และ JSON จาก snapshot เดียวกัน ตรวจ contract, mapping, required และ total JSON bytes อีกครั้ง แล้ว transaction recheck operation/state/revision/สิทธิ์ที่เกี่ยวข้องก่อน commit canonical document pointer, JSON และ operation result พร้อมกัน
5. เมื่อ commit สำเร็จจึงพิจารณาลบ old Folio uploads ที่ไม่มี eligible references เหลือ ไม่ลบเก่าก่อน commit และไม่ลบไฟล์ประวัติที่ยังใช้ ไม่ rollback ไปยัง reference ที่อาจถูกลบแล้ว

- No upload on selection, Field changes, Template save/publication, export หรือ internal row-append/checkpoint/Correction workspace/project save งานที่ reuse files ทั้งหมดไม่ต้องขอ ECM token เพียงเพราะเป็น Save/Submit
- PoC flow เดิมระบุว่า Add row มี implicit Save Draft ขั้นตอนภายในนี้ไม่ใช่ explicit User Save Draft และห้ามเริ่ม ECM writes ต้อง preserve pending files ผ่าน verified document-key/mapping transitions ทั้ง row append และ workspace/project changes หากรักษาไม่ได้ให้หยุดก่อนทิ้งไฟล์ ไม่ใช้ implicit save เป็นทางลัดอัปโหลด
- ตรวจซ้ำ server-side ป้องกัน double-click/poll/reload/callback ซ้ำด้วย original Operation/checkpoint/target/base revision ไม่อาศัยปุ่ม disabled เป็นอำนาจตรวจสิทธิ์
- การล้าง pending selections หลังสำเร็จต้องตรง snapshot/selection ที่รับไป ไม่ล้างการแก้ใหม่ที่ไม่ได้อยู่ใน operation นั้น stale tabs/late callbacks ห้ามเขียนทับ revision ที่ชนะ
- Deadline ของ upload/batch/Operation ต้องออกแบบร่วมกับ callback และ durable recovery จาก runtime จริง ไม่เอา 15/30 วินาทีของ auth มาใช้เป็น upload timeout โดยอัตโนมัติ

### 9. Failure, unknown outcomes และ recovery

- Validation ล้มก่อนส่ง: ไม่เริ่ม external write รักษา canonical เดิมและ pending selections ที่ยังอยู่ในหน้า ระบุจุดแก้ ไม่รายงาน durable success
- Partial upload หรือทราบแน่ว่า Folio transaction ไม่ commit: cancel ทั้ง batch ห้าม partial commit ห้าม reuse receipts ของ canceled batch ในรอบใหม่ ลบเฉพาะ newly uploaded files ที่ยืนยัน ownership และไม่มี references ก่อนเปิดรอบใหม่ หาก cleanup ไม่ครบหรือไม่แน่ชัดให้หยุดการเปลี่ยนแปลงคำตอบจน settle ครบ User เริ่มรอบใหม่เองด้วย identities ใหม่
- Folio response หาย/ไม่ทราบ commit: ตรวจ original Operation/checkpoint และ canonical revision ก่อน ถ้า commit แล้วคืนผลเดิม ไม่ upload/Submission/Correction ซ้ำ หาก DB ตรวจไม่ได้แสดงว่ากำลังยืนยันผล ไม่รายงาน success/failure แบบเดาและไม่ cleanup ไฟล์ที่อาจ commit แล้ว
- Upload timeout, process crash หลังเริ่มส่ง หรือ response ไม่มีหลักฐาน URL/token ที่ใช้ได้: ถือ **unknown outcome** ไม่ใช่ไม่มีไฟล์ ร่างเดิมอ่านได้ แต่ Save/Submit/Response delete ถูก block จนผู้ดูแลยืนยัน sender/request settlement และจัดการไฟล์ครบ ห้าม blind resend, adopt-latest หรือถือ empty search ครั้งเดียว/การรอ timeout เป็นหลักฐาน
- Snapshot/workspace เปลี่ยนระหว่าง operation: ไม่เขียนทับ canonical ใหม่ ไม่ย้าย receipt ใส่ revision ใหม่โดยเดา ยกเลิกรอบเดิมและตามผล/cleanup ตามจริง เปิด current revision ก่อนรอบใหม่
- Commit แล้วแต่ old cleanup ล้ม/unknown deletion: canonical ใหม่ saved และ usable/exportable แสดง cleanup warning ค้าง ใช้ workflow ต่อได้ ไม่ rollback ไม่เรียกทั้งรอบว่า save failed URL เก่าอาจ public จนยืนยันลบสำเร็จ คำเตือนไม่หายเพราะ save ถัดไปสำเร็จ
- Durable states ต้องแยกก่อนเริ่มส่ง, เริ่มแล้วไม่ทราบผล, receipt ยังไม่ commit, committed และ cleanup pending การ restart/timeout ไม่เปลี่ยน started intent กลับเป็นงานปลอดภัยให้ส่งซ้ำ
- Recovery คืนผล committed เดิม; receipt ที่ยังไม่ commit ต้อง cancel/cleanup ไม่ adopt; late receipt ของ canceled operation มีไว้ cleanup ไม่ทำให้ operation กลับมา commit ห้ามใช้ failed/staged workbook ที่มี canceled URLs เป็น canonical Draft โดยอัตโนมัติ
- Initial cleanup อยู่ในรอบที่ User เริ่ม การติดตามภายหลังใช้ authorized operator action และตรวจสิทธิ์/state/references ใหม่ ไม่สร้าง automatic write retries, retry daemon หรือ queue ใหม่

### 10. References, deletion fencing และ operator settlement

- เก็บ durable intent/receipt/cleanup records ที่อยู่รอดหลัง crash และ Response rows ถูกลบ ครอบคลุม references ที่ยังใช้ได้จาก Draft, Submission, Correction, workspace และ eligible Operations
- ลบได้เฉพาะ proven Folio uploads ที่ไม่มี references ที่ยังใช้ได้ ไม่สแกน URL text แล้วถือ ownership ไม่ใช้ client token เป็นสิทธิ์ลบ ไม่ใช้ latest lookup และไม่ลบไฟล์ระบบอื่น
- Reference creation กับ no-reference check/deletion claim ต้องมี transactional fencing ร่วมกัน ห้ามเพิ่ม references ไปยัง deleting/unknown-deletion file ไม่ใช้ query-then-delete โดยไม่มี race protection
- Unknown upload ให้ Folio Admin ประสาน PM/ECM operator ด้วย trusted operation ID, unique planned filename, year, category และ send time ต้องพิสูจน์ว่า worker/request เดิมส่ง/เขียนต่อไม่ได้แล้ว และคำขอที่ถึง ECM จบแล้ว
- หากพบไฟล์ canceled batch ต้อง cleanup ครบ ไม่ adopt เป็นคำตอบ หากยืนยันไม่เกิดไฟล์ต้องมีหลักฐาน request settlement ไม่ใช่เพียงค้นไม่พบ Admin บันทึกผู้ยืนยัน ผล และหลักฐานที่ตรวจสิทธิ์ก่อนปลดค้าง การจดข้อความประสานหรือ checkbox ไม่เท่ากับพิสูจน์ผล และ arbitrary URL/token ที่กรอกไม่ให้อำนาจลบ
- หากพิสูจน์ยังไม่ได้คง blocked state ตามจริง ไม่สร้าง provider capability สมมติ ไม่มีการกำหนดว่า Admin สามารถปลดค้างด้วยการยอมรับความเสี่ยงแทนหลักฐาน
- ลบทั้ง Response ใช้สิทธิ์และ confirmation เดิม เก็บ durable cleanup context ของทุก revision/intent ก่อนลบ rows เมื่อลบข้อมูลแล้วแต่ไฟล์ยังค้างต้องรายงานสองผลแยกกัน มี reference ติดตามต่อได้ ไม่คืน deleted Response เป็น normal result row ไม่เพิ่มสิทธิ์ลบ Published Form การ archive ไม่สั่งลบไฟล์

### 11. Editing, Correction และ immutable history

- User เพิ่ม/แทนที่/นำออกได้ใน Draft ของตน ต้องกลับสู่ Draft ก่อนแก้หลังส่ง ไม่แก้ Submission โดยตรง Admin ทำได้ผ่าน valid Correction เท่านั้น มี reason/base revision/workspace/lease และ submitted-state eligibility ตามเดิม ไม่เพิ่มสิทธิ์แก้ Draft คนอื่น Viewer อ่านอย่างเดียว
- Internal project selection/workspace save ไม่ใช่ Save Correction และไม่เริ่ม upload Pending selections อาจข้าม document key ภายใน workspace เดิมได้เฉพาะ validated transition/mapping หากรักษาไม่ได้ให้หยุดก่อน reload/discard พร้อมแจ้ง ไม่ถือคนละบัญชีหรือ Response เป็น scope เดียวกัน
- Draft, Submission และแต่ละ Correction เก็บ JSON/document snapshot ของตน เปลี่ยนไฟล์/metadata สร้าง version ใหม่ ไม่แก้คู่ URL/token ของอดีต Removal ของ revision ใหม่ไม่ลบไฟล์ที่อดีตยังอ้าง
- Resume existing Draft ใช้ saved canonical files เดิม New XLSX round หลัง Submission ใช้ blank Published Template ไม่ seed answers/URLs/files เดิม ทั้งนี้ต่างจาก generic Response description ใน domain context และต้องบันทึก exception ใน workflow/domain docs ของขั้นพัฒนา ไม่เปลี่ยนพฤติกรรมให้ seed เพื่อรองรับ attachment
- สิทธิ์อ่านยังเดิม User เฉพาะของตน Admin/Viewer ตาม existing results/history ไม่ใช้ public provider URL เป็นเหตุเพิ่ม application access

### 12. Existing UI, read-only และ exports

- เพิ่ม category ใน Field settings เดิม ใช้ existing Title/Tag/required controls และ existing binding ไม่สร้าง upload/editor app หรือชุด drawings ข้าง URL ใหม่
- หน้าแก้ Draft/Correction เปิดกล่อง PoC เดิมจากปุ่มตำแหน่งเดิม เสริม saved URL, pending filename/size, choose/replace/remove/cancel แยก open URL จาก mutation และไม่ upload/delete ทันที
- ข้อความค้างในหน้ากรอกเดิมระบุ Field/slot/row, สาเหตุ, ผลจริงและ next action ไม่ใช้ toast อย่างเดียวหรือ badge ที่ต้องเปิดจึงรู้ว่าบันทึกไม่ได้ แยก pending selection, validation error, saved, unknown upload, uncertain Folio commit และ cleanup pending ไม่ใช้ spinner ไม่มีกำหนดแทนคำอธิบาย
- Admin ขยาย follow-up details ในหน้าผลลัพธ์เดิมเฉพาะเมื่อมีงานติดตาม แสดง trusted operation/scope/version/year/category/time/outcome/evidence ตามสิทธิ์ ไม่สร้าง dashboard ใหม่ หลัง Response deletion ยังคง tracking reference ผ่าน metadata เดิมโดยไม่ฟื้นข้อมูลคำตอบที่ลบ
- ใช้ labelled controls และ keyboard access ตาม UI เดิม ให้ข้อความและลำดับโฟกัสเข้าใจ saved/pending state และข้อผิดพลาดโดยไม่พึ่งสีหรือ pointer อย่างเดียว
- Read-only และ saved XLSX/PDF exports แสดง `file_link` จาก selected revision แทนปุ่ม ไม่มี picker/replace/remove; URL ไม่ได้สร้างจาก path และไม่ fallback ไป latest หากลิงก์มีปัญหา
- ไม่ฝัง preview ไฟล์แนบ ไม่เปลี่ยน main DOCX/XLSX viewer ไม่รับรองว่า browser/DCM จะ force download ข้อกำหนด URL ล่าสุดแทน download-only ในบันทึกเก่า
- Accepted risk: URL public และ nonexpiring ผู้ได้ URL อาจเปิดโดยไม่ login Folio การซ่อน URL/proxy ไม่ทำต้นทาง private และ old URL อาจใช้งานได้ระหว่าง cleanup pending หลังลบ ECM สำเร็จ URL ที่ส่งต่อจะใช้ไม่ได้และกู้ไฟล์ไม่ได้
- คง Excel Fill Download เดิมซึ่งดาวน์โหลด workbook ปัจจุบันรวม ordinary edits ที่ยังไม่ Save Draft ได้อิสระจาก persistence ไม่เปลี่ยนทุก fill-page export ให้ใช้ saved snapshot ข้อกำหนด selected-revision saved URLs ใช้กับ read-only/results/history exports ส่วน pending attachments ยังไม่มี URL จริง ต้องป้องกัน export เมื่อมี pending attachments และต้อง explicit Save/Submit ก่อนรวมไฟล์เหล่านั้น ห้าม export pending filename/blob/fake URL และห้าม export เริ่ม upload อัตโนมัติ

### 13. Cutover โดยไม่แก้ Published PoC contracts

- Template Draft ใช้ตำแหน่ง/Tag เดิมได้เมื่อ Admin explicitly configure และตรวจ stable binding/placement ได้ ไม่แปลงทั้งระบบหรือเดาจาก `attachment_N`/label หาก ambiguity/conflict ให้หยุดและรักษาข้อมูลจน Admin แก้
- Published PoC Forms คง manifest/types/required rules และ ordinary response contracts เดิม Save/Submit ข้อมูลทั่วไปตาม validation เดิม ไม่แปลง text เป็น object ไม่ใช้ Correction เปลี่ยนชนิดย้อนหลัง ถ้ากติกาเก่าทำให้บันทึกไม่ได้ให้แจ้งข้อจำกัด ไม่ bypass
- ปุ่มเก่าไม่เปิด real upload หรือแสดงว่าบันทึกไฟล์แล้ว ต้องอธิบายให้ใช้ Form ใหม่ที่ Admin duplicate/configure หรือประสาน Admin ไม่กดแล้วเงียบ ไม่คง memory-only PoC upload เป็น fallback อีกเส้นทาง
- ไม่ auto archive/delete/redirect ไม่เดา Form ทดแทน Admin แชร์ลิงก์ใหม่ตามวิธีเดิม Duplication คัดเอกสาร/การตั้งค่า ไม่คัด Responses/answers/files ของ User
- Text/filename/URL string เก่าคงความหมายตามสัญญาเดิม ไม่สร้าง fake receipts/tokens หรือ deletion authority File ที่ยังค้างใน memory ไม่ย้ายข้าม Form/scope และกู้ bytes จากชื่อไม่ได้ เตือนก่อนเปลี่ยนหน้าหรือ settings ที่ทำ selection หาย ไม่ force reload เพื่อหลบ guard
- ใน Form ใหม่ User เริ่มคำตอบและเลือกไฟล์เอง ไม่มี data/file migration ที่ได้รับอนุมัติ

## Testing Decisions

### แนวทดสอบที่ผู้ใช้ยืนยัน

ผู้ใช้ยืนยันให้ใช้หนึ่ง main automated seam ที่ existing Folio server HTTP/application integration boundary พร้อม isolated PostgreSQL/object storage, trusted workbook fixtures และ callback coordination และ controlled external ECM HTTP provider double ไม่เพิ่ม test framework หรือแตกเป็น deep unit seams หลายชั้น โดยตรวจ native browser และ exported files จริงเพิ่มเติมตาม acceptance ด้านล่าง การยืนยันนี้ไม่ใช่หลักฐานว่า feature หรือ provider ผ่านการทดสอบแล้ว

### หลักการและ prior art

- ทดสอบ externally observable behavior: HTTP/Operation outcome, canonical saved JSON, stored workbook/export bytes, real database references/claims, provider requests ที่ได้รับจริงโดย test double และสิ่งที่ผู้ใช้ทำต่อได้ ไม่ทดสอบ private helper call order หรือทำ mock-call echo ว่าเรียกชื่อฟังก์ชันครบ
- ใช้ existing HTTP/callback integration harness และ isolated persistence ของ Folio เป็นฐาน เสริม existing spreadsheet-runtime/workbook fixtures และ UI coverage เมื่อจำเป็น ไม่อ้างว่า provider double พิสูจน์ ECM จริง
- ครอบคลุม module boundaries ของ authoring/manifest, spreadsheet extraction/projection, attachment commands, auth coordination, operation lifecycle/callback/completion, Draft/Submit/Correction, results/history/export, deletion/recovery และ cleanup ผ่าน seam เดียวเป็นหลัก
- ใช้ deterministic clocks/barriers และ controlled request settlement สำหรับ deadline/concurrency/crash windows ไม่ใช้ arbitrary sleeps ให้ race ผ่าน ไม่รันต่อ services/data จริงโดยไม่ตั้งใจ
- ขั้น implementation ต้องปรับ system-map และ workflow/domain documentation ที่กระทบใน change เดียวกัน รวม XLSX blank-reopen exception, explicit-versus-implicit save และ attachment recovery ใช้ existing `build`/`check` scripts และ visual review ตามกติกาเดิม ไม่ถือการทดสอบ provider double แทนการตรวจ native editor

### Acceptance coverage ที่ต้องมีในขั้น implementation

1. **Authoring/publish:** reuse verified scalar/table slots, automatic/renamed tags, stable bindings, per-column category, required rules, incomplete Draft save, missing categories/root scalar tags, category API outage/rename, frozen publication และ unconfigured PoC controls
2. **Bytes/limits:** original byte equality และ original extension รวม uppercase/extensionless; 0, 1, 9,999,999, 10,000,000 และ 10,000,001 bytes; server-side actual-size enforcement แม้ MIME/metadata/Content-Length ปลอม; encrypted/password-protected files โดยไม่ decrypt หรือกล่าวอ้าง safety
   - เพิ่มกรณี Add row/implicit Save Draft, internal checkpoint และ export ไม่เริ่ม ECM writes แต่คง pending files ผ่าน verified mapping/document-key transitions; ordinary unsaved cell edits ยังดาวน์โหลดตาม Excel Fill Download เดิม และ pending files ไม่กลายเป็น filename/blob/fake URL ใน exports
3. **Metadata/identity:** blank/invalid year/number, `/`/`\` และ unsafe generated names, saved category name payload, category errors, no invented Ongoing format, unique identities ข้าม User/Form/slot/row และ unchanged reuse ที่ไม่เรียก auth/upload
4. **Transport contract:** exact login/category/upload/delete API, multipart actual bytes/filename, `template="0"`, year/number/category จาก snapshot, paired upload receipt, malformed/unsafe URL/token response, Delete response ไม่ถูกใช้เป็น Upload response, redirect/URL trust boundaries และ error redaction
5. **JSON:** scalar four-field object versus null, table five-field object, strict types/keys, zero byte presence, ordinary text ยังคงไม่รับ object, forged receipts/URLs/token/binding/rows, multi-byte Thai content ที่ 262,144-byte boundary และ over-limit ไม่ตัดข้อมูลหรือ commit บางส่วน
6. **Physical rows:** blank physical rows ก่อนแถวคำตอบ, attachment-only/zero-byte rows, compact JSON index ไม่ตรง `row_index`, multiple attachment columns, empty rows, required columns อื่น, supported row changes, ambiguous/stale mapping และ unchanged identity เมื่อเลื่อนแถว
7. **Happy paths:** explicit Save Draft, Submit directly with selected files, resume Draft, unchanged Save/Submit, year/number change rereads original bytes, selected replacement wins, remove/cancel และ new XLSX round blank โดย old history ยังอ่านได้
8. **All-or-nothing:** multi-file sequential upload, failure ก่อนส่ง/กลาง batch/หลัง receipt/ก่อน commit, JSON limit ที่พบหลัง upload, object/workbook failure, stale actor/lease/revision และ transaction rejection; old canonical คงเดิม ไม่มี partial Submission/Correction และ canceled receipts ไม่ถูก reuse
9. **Unknown outcomes:** provider receives bytes then disconnects/timeouts, invalid success receipt, process crash ก่อน/หลัง send/receipt/commit, late response, lost Folio response และ unavailable DB checkpoint; no blind resend/adopt, blocked mutations ตามสถานะจริง และ committed result คืนเดิมโดยไม่สร้าง duplicate
10. **Cleanup/references:** failed canceled-batch cleanup blocks further mutation; committed cleanup failure allows new snapshot/export; historical/shared/workspace/eligible-operation refs protect files; transactional race ระหว่าง new reference/deletion claim; unknown deletion ห้ามสร้าง refs; cleanup survives Response rows deletion/crash
11. **Auth:** absent/invalid config, no Ongoing fallback, encrypted token at rest, expiry/zone validation, request-time coverage/clock skew, single shared login across instances, generation fencing/late 401, bounded waiter/lease, at most three total attempts, permanent errors stop, 15/30-second budgets, 1/2-second backoff, valid Retry-After และ no write resend/session logout
12. **Correction:** valid reason/eligibility/lease/base revision, required validation, immutable older snapshots, internal workspace/project save ไม่ upload, pending-file preservation only through verified transitions และ stop-before-loss เมื่อรักษาไม่ได้
13. **Permissions/security:** User-own only, Admin/Viewer reads, Viewer writes/deletes denied, unauthorized Correction/Response delete denied, arbitrary client token/URL ไม่มี delete/fetch authority, no Bearer/credentials leak, no file token ใน workbook/PDF หรือ hidden parts
14. **Operator follow-up:** trusted details, retained canceled-batch evidence, sender/request settlement required, empty search/checkbox ไม่มีอำนาจปลดค้าง, canceled files cleanup ไม่ adopt, authorized confirmation survives reload และ deleted Response ไม่ฟื้นเป็นรายการปกติ
15. **Cutover/regression:** existing published ordinary text/URL values remain ordinary, no auto conversion/archive/redirect/migration, old PoC button explanation, explicit Draft configuration, duplicate excludes answers/files, unchanged DOCX/main viewer/results filters และ existing XLSX workflow

### Browser และ export acceptance ที่ห้ามแทนด้วย provider double

- ต้องทำ actual browser smoke ใน existing authoring, PoC popup, fill, results/history และ Correction surfaces ตรวจ keyboard/labels, saved-versus-pending display, choose/replace/remove/cancel, persistent error/unknown/cleanup text และ Admin inline follow-up details
- ต้อง smoke ใน native ONLYOFFICE editor จริงด้วย ตรวจ existing adapter, worksheet/object protection, button placement, supported row append และ download ของ ordinary unsaved edits ไม่พึ่ง HTML demo หรือ jsdom เป็นหลักฐานความพร้อมของ native behavior
- ต้องตรวจ exported XLSX/PDF จริงของ Draft/Submission/older Correction และ roles ที่มีสิทธิ์ ให้ URL ตรง selected revision ไม่มี upload controls/file tokens/credentials ไม่ใช้เพียง HTTP status หรือการมีไฟล์ใน storage เป็นหลักฐาน layout/link correctness
- ทดลอง double click, multiple tabs, callback/reload และ Correction workspace transitions ในจริงตามขอบเขตที่ปลอดภัย ตรวจว่าคำเตือนและ mutability ตรง canonical operation state
- Automated provider-double coverage ไม่ใช่หลักฐาน real ECM รองรับ zero-byte/encrypted/10 MB files, real expiry, delete semantics, safe original-byte retrieval หรือ runtime deadlines
- Live verification ต้องมีบัญชี Folio/พื้นที่ทดสอบแยก, secret delivery, provider permission/contract clarification และ explicit authorization ก่อน ห้ามใช้บัญชี Ongoing หรือข้อมูลจริงทำ overwrite/delete ในงานเขียนสเปกนี้ไม่มีการรัน verification commands, tests, browser smoke หรือ ECM/DB calls

## Out of Scope

- การ deploy/เปิดใช้ระบบจริง, push, production migration หรือใช้ ECM/DB และข้อมูลจริงโดยไม่ได้รับอนุญาตจากงานเขียนเอกสารนี้ การพัฒนา feature ตามสเปกเป็นขอบเขตของ implementation tickets ไม่ใช่สิ่งที่ถูกตัดออก
- DOCX attachment buttons, หลายไฟล์ต่อช่อง, file preview/decryption/content scanning และการรับรองว่าเนื้อหาปลอดภัยหรือไม่เสียหาย
- ระบบ upload/editor ใหม่, สาม-layout UI demo ที่ยกเลิกและลบแล้ว, dashboard ใหม่ หรือการนำ demo/JSON prototype implementation มา merge เป็น feature
- Arbitrary DCM folder picker, folder creation โดย Folio, ปี storage อีกแหล่ง, category selection ของ User และการ map project name ย้อนเป็น project identity/เลขหนังสือ
- Shared ECM account, token broker ระหว่างระบบ, การแก้ Ongoing source/config/credentials และ fallback ไปใช้บัญชี/token Ongoing ตามข้อสรุป [การใช้บัญชี ECM ร่วมโดยไม่ตัด token ของระบบอื่น](../ecm-attachments/issues/10-shared-ecm-login.md) ที่ปิด out of scope
- Automatic upload on selection, Template save/publication หรือ internal Correction workspace save; background upload queue, write retry daemon, blind resend หลัง 401/timeout และ adopt latest file แทน request settlement
- การเปลี่ยน published contract ย้อนหลัง, auto text-to-attachment conversion, fake file tokens, auto archive/redirect, ย้าย Responses หรือคัด user answers/files เมื่อ duplicate
- การเพิ่มสิทธิ์ User/Admin/Viewer, การลบ Published Form, private-link enforcement/expiring links ที่ provider ไม่ได้ให้ และการอ้างว่า proxy ทำ public URL เป็น private
- การเพิ่ม JSON limit, ตัด metadata หรือย้าย metadata ออกจาก answer JSON เพื่อให้ผ่านขนาด

## Further Notes

### Decision provenance และ source coverage

ทั้ง 13 tickets มีสถานะ resolved ใน planning tracker; 12 หัวข้อเป็นฐานงานนี้ ส่วน [การใช้บัญชี ECM ร่วมโดยไม่ตัด token ของระบบอื่น](../ecm-attachments/issues/10-shared-ecm-login.md) ปิดด้วยเหตุ out of scope ไม่ใช่ auth design ที่ต้อง implement บันทึก Discussion ที่ยังรอคำตอบในอดีตถูก supersede โดย resolution/amendment ภายหลัง ไม่ถือเป็น business questions ที่ต้องถามซ้ำ

1. [ข้อเท็จจริง ECM: login และความสามารถจัดการไฟล์](../ecm-attachments/issues/01-ecm-api-capabilities.md): public API/docs evidence, response mismatch และข้อจำกัด runtime; ใช้ใน API/auth/readiness decisions
2. [โครงสร้าง DCM และการตั้งชื่อไฟล์ที่ Ongoing ใช้จริง](../ecm-attachments/issues/02-dcm-ongoing-flow.md): reference flow ไม่ใช่ contract Folio; ไม่คัด `template=1`, project naming หรือ query-then-replace behavior มาใช้
3. [ระดับการตั้งค่าปลายทางไฟล์ของ Admin](../ecm-attachments/issues/03-admin-storage-policy.md): scalar/column category, root year, Draft/publication/frozen contract, outage/rename policy และ automatic editable tags amendment
4. [แหล่งเลขที่หนังสือยืนยันและกติกาชื่อไฟล์](../ecm-attachments/issues/04-confirmation-filename.md): root document number, unique-version filename, reject unsafe names, original-byte reupload after metadata changes และ unchanged reuse
5. [วงจรไฟล์ร่างและการบันทึกโดยไม่สูญหาย](../ecm-attachments/issues/05-safe-draft-lifecycle.md): durable intents, sequential upload, atomic commit, canceled-batch cleanup, unknown outcomes, operator settlement, deletion fencing และ recovery
6. [สิทธิ์ไฟล์และการแก้ไขหลังส่งคำตอบ](../ecm-attachments/issues/06-history-access.md): existing roles, immutable history/Correction, blank new XLSX round, public-link acceptance, Response deletion และ URL amendment
7. [ข้อกำหนดชนิดไฟล์และขนาดที่รับได้](../ecm-attachments/issues/07-pdf-acceptance.md): any type, inclusive decimal limit, zero/encrypted files, required/table rows; URL amendment supersedes download-only เดิม แม้ชื่อไฟล์ ticket ยังคง `pdf`
8. [หน้าตั้งค่าปลายทางและสถานะไฟล์ที่ผู้ใช้เข้าใจ](../ecm-attachments/issues/08-admin-user-prototype.md): existing popup, persistent page text, inline expandable Admin follow-up; latest cleanup records deleted/rejected standalone UI demo
9. [ยืนยันสัญญา ECM ที่เอกสารยังไม่ตอบ](../ecm-attachments/issues/09-provider-contract-evidence.md): category/type string, multipart `template=0`, metadata, public URLs, overwrite/delete constraints, answer URL/token amendment และ dedicated-account amendment
10. [การใช้บัญชี ECM ร่วมโดยไม่ตัด token ของระบบอื่น](../ecm-attachments/issues/10-shared-ecm-login.md): **out of scope** ตามคำสั่งบัญชี Folio แยก ไม่ใช้ proposals เก่าหรือ deferred status มาเปิด shared-account design ใหม่
11. [สัญญา JSON ของไฟล์แนบและ URL ใน Excel](../ecm-attachments/issues/11-attachment-json-contract.md): object under tag/null, trusted physical row index, URL-only projection, strict schemas, original name/size และ 262,144-byte cap; prototype เป็น decision history ไม่ใช่ implementation
12. [การเปลี่ยนฟอร์ม PoC เดิมไปใช้ช่องแนบจริง](../ecm-attachments/issues/12-poc-form-cutover.md): explicit verified Draft conversion, ordinary published contracts, explanatory old buttons, no auto migration และ duplication without user data
13. [ECM login และ token ของ Folio ด้วยบัญชีแยก](../ecm-attachments/issues/13-folio-ecm-auth.md): own credentials, encrypted PostgreSQL coordination, generation fencing, max three total auth attempts, budgets และ no write retry

[Planning map](../ecm-attachments/map.md) เป็น index ของ decisions ไม่ใช่สิทธิ์เริ่ม implementation หรือใบรับรอง provider runtime สเปกใช้ศัพท์ Admin, User, Form, Field, Template Draft, Published Template, Response, Draft, Submission, Correction และ Operation ตาม root domain context และคง ADR 0003/0004

### ความต่างที่พบและลำดับการยึดหลักฐาน

- **Domain documentation discrepancy:** generic Response definition กล่าวถึง reopened Draft ที่ seed จาก Submission แต่ XLSX flow ที่ decision 06 อ้าง source และได้รับการยืนยันคือ blank Published Template สเปกยึด XLSX exception และไม่แก้ domain document ในรอบนี้ ขั้น implementation ต้องปรับคำอธิบายโดยไม่เปลี่ยน flow
- **Superseded ไม่ใช่ contradiction ค้าง:** PDF-only/download-only เปลี่ยนเป็น any type และ actual revision URL; shared-account constraint เปลี่ยนเป็น dedicated Folio account; separate UI prototype ถูกปฏิเสธและลบแล้ว; JSON prototype มีไว้ยืนยัน shape ไม่ใช่โค้ด production
- **Historical PoC proposals:** ตัวอย่าง URL-string-only, stable row ID, MIME/hash/object-key metadata และ retry/resume language ในสเปก PoC เก่าไม่ใช่ข้อกำหนดเพิ่ม สัญญาปัจจุบันยึด file object ใต้ tag, trusted physical `row_index`, canceled-batch cleanup และไม่ reuse receipts ไม่อนุมาน provider-path hierarchy, storage fallback หรือ write idempotency จากข้อเสนอเก่า ส่วนข้อเท็จจริง implicit internal save, worksheet/object protection และ external attachment-binary storage ยังคงต้องรักษาในส่วนที่ไม่ได้ถูก supersede
- **Provider evidence gap:** Upload docs กับ Ongoing response schema ต่างกัน และไม่มี actual upload sample ที่ยืนยัน runtime ต้องตรวจ contract จริงก่อนเปิดใช้ ไม่เลือกตามความคุ้นเคยหรือรับหลายรูปร่างแบบเดา
- ไม่พบ business decision ที่ยังต้องเปิดคำถามเพิ่มใน 12 หัวข้อ in-scope จาก resolution/amendments ที่อ่าน ความพร้อม provider/runtime และ readiness gate เป็นคนละประเภทกับ approved business decisions; test seam และ ticket breakdown ได้รับการยืนยันแล้ว

### ความพร้อมที่ยังไม่ยืนยัน

- ยังไม่ได้รับหรือทดสอบ dedicated Folio account; ต้องมีสิทธิ์ category/upload/delete, secret/key provisioning, endpoint/transport trust และ coordinated callers จริงก่อนเปิดใช้งาน
- ยังไม่ยืนยัน real login expiry format/timezone, success/error semantics, token scope และ timing; design budgets ไม่ใช่ค่าที่วัดจริง
- ยังไม่ยืนยัน actual provider response shapes, zero-byte/encrypted/10 MB acceptance, safe exact original-byte retrieval, redirect behavior, overwrite/delete outcomes และ request settlement จากระบบจริง
- มีหลักฐาน local isolated runtime, PostgreSQL coordination, recovery และ actual browser XLSX/PDF ตาม Implementation resolution ด้านล่าง แต่ยังไม่ได้ยืนยัน deadlines, deployed-topology races/fencing, crash recovery และ operator procedure กับ ECM จริง ต้องผ่าน release gates ก่อนเปิดใช้งาน ไม่ถือ controlled provider หรือ prototype เป็นหลักฐานแทนระบบจริง
- ต้องมี PM/ECM operator ที่ยืนยัน sender/request settlement และ cleanup ได้จริง หากไม่มีให้คง blocked state ไม่ลด requirement เป็นการค้นไม่พบหรือกดรับทราบ
- Central PDMS Knowledge recall ล้มเหลวในรอบนี้ **ไม่ได้รับ Knowledge กลางและไม่อ้างว่า recall สำเร็จ** สเปกอ้าง current Folio source และ resolved planning documents ตามขอบเขตที่อ่าน ไม่ใช้ Dev Memory เป็นหลักฐาน business logic

### Handoff

สเปกนี้ครอบคลุม 112 user stories และ full end-to-end intended behavior ผู้ใช้ยืนยัน test seam, 8 vertical implementation slices และ dependencies ก่อนเผยแพร่แล้ว ขณะเผยแพร่ทุกตั๋วมี Status: ready-for-agent และต้องทำตาม Blocked by ไม่ถือ slice ใดหรือ provider double ว่า feature ทั้งหมดพร้อมเปิดใช้

บันทึกสถานะขณะเผยแพร่สเปก: งานรอบนั้นมีเฉพาะสเปกกับตั๋ว ไม่ได้แก้ application, migrate ข้อมูล, deploy หรือเรียก ECM/DB จริง สถานะ implementation ปัจจุบันแยกไว้ด้านล่าง ความพร้อมบัญชี/provider/operator ยังคงเป็น release gates

### Implementation tickets

1. [ตั้งค่าช่องแนบจากปุ่ม PoC เดิม](issues/01-configure-existing-poc-attachments.md)
2. [เปลี่ยนผ่านฟอร์ม PoC โดยรักษาคำตอบเดิม](issues/02-preserve-legacy-poc-forms.md)
3. [แนบไฟล์ช่องเดี่ยวแล้วบันทึกหรือส่งเป็น URL](issues/03-scalar-save-submit.md)
4. [เปลี่ยนหรือนำไฟล์ออกและแก้เลขหรือปีใน Draft](issues/04-draft-file-replacement-cleanup.md)
5. [กู้คืนผลไม่ชัดและติดตามไฟล์ค้าง](issues/05-uncertain-outcomes-follow-up.md)
6. [แนบไฟล์รายแถวโดยรักษา mapping](issues/06-table-row-attachments.md)
7. [Correction ประวัติ และส่งออกฉบับที่เลือก](issues/07-corrections-history-exports.md)
8. [ลบ Response พร้อมไฟล์ที่ไม่มีการอ้างถึง](issues/08-response-deletion-cleanup.md)

### Implementation resolution

- Implementation tickets ทั้งแปดใบ resolved และรวมอยู่บน branch `feat/ecm-attachments` ที่ `/tmp/folio-ecm-implementation-integration` ไม่มี implementation ticket ค้าง ไม่เปลี่ยน parent planning map หรือ resolved business decisions
- Final reviewed application source คือ `530410f7527bbe66d369a0359c57ec1c0898f600`; generated workflow/documentation checkpoint คือ `c63a90529b3c5b9146254ef548f16cdc41efbfa7` Parent ตรวจ exact source/index/filesystem inclusion ของ corrective delta ทั้ง 13 paths ก่อนสร้างเอกสาร และไม่ได้เปลี่ยน application bytes หลัง gates
- Final review ทั้ง standards และ spec ตรวจ corrective delta แล้วไม่เหลือ concrete code defect แก้ root cause ของ Correction ที่เคยทิ้ง newer pending File/removal หลัง accepted snapshot สำเร็จ, เปลี่ยน operator confirmation เป็น native modal และเปิดรับหลาย valid attachment slots เกิน listener cap เดิมโดยยังตรวจ per-slot/per-file/streamed byte budgets และ JSON boundaries
- Final automated evidence: root formatting/lint ของ supported changed source/test files ผ่าน 11 paths โดยไม่มี warning/error; full ECM HTTP 78 tests/2,995 assertions ผ่าน รวม actual TCP multipart 14 × 10,000,000 bytes และ actual chunked over-budget rejection; full UI 262 tests/18 suites ผ่าน; integration typecheck 5/5 และ build 3/3 ผ่าน
- Pure suites ผ่าน: plugin 297/1,409 assertions, spreadsheet units 116/301, form lifecycle 12/75 และ native CLI 15/264 จากสามไฟล์ใน invocation เดียว Cross-feature HTTP regressions รันแบบ serial ครบ 18 commands ผ่าน 225 test invocations/10,976 assertions ไม่มี failure/skip ตัวเลขนี้ไม่ใช่จำนวน unique tests ที่นำมาบวกกับ suite อื่น
- หลังรวม source แล้ว รัน actual integration TCP smoke อีกครั้งผ่าน 2 tests/105 assertions พร้อม forced typecheck 5/5 และ build 3/3 ไม่ใช้ application-handle-only proof แทน actual listener
- Native acceptance ต่อจากปุ่ม PoC เดิมใช้ isolated synthetic accounts/forms, actual ONLYOFFICE, PostgreSQL/object storage และ controlled HTTP provider ครอบคลุม accepted scalar/table/row mapping, Draft replacement/metadata/removal, recovery/fencing, Correction/history/export และ Response-deletion surfaces ตาม ticket evidence ไม่ใช่ live ECM หรือ full 112-story native-wide pass
- Final Correction race smoke: accepted A 68 bytes สำเร็จเป็น revision 4 ขณะที่ original popup รับ newer B 97 bytes; หลัง completion คง live editor/popup และ actual B File เดิมผ่าน Stay/Escape จนผู้ใช้ explicit discard-and-exit Canonical revision ใหม่มี A เท่านั้น ไม่มี B upload/version และไม่กด Save ซ้ำกับ completed workspace Precompletion host B identity/hash และ native beforeunload dismissal ไม่ได้วัดใน scenario สุดท้ายนี้
- Native operator dialog ตรวจ actual `:modal`, initial Cancel focus, Escape/Cancel คืน focus ให้ exact trigger และไม่มี API mutation ระหว่างยกเลิก หนึ่ง Tab sample อยู่ที่ BODY และไม่ได้วัด `document.hasFocus` จึงไม่อ้างว่าทุก Tab sample อยู่ใน dialog
- Final actual UI downloads อีกแปดไฟล์ครอบคลุม Admin/Viewer × latest Correction 4/older Correction 3 × XLSX/PDF ตรวจ actual bytes/full SHA, workbook hyperlink และ PDF URL annotations ตรงฉบับ ไม่มี newer B/token/PoC control รั่วไปใน export คง evidence exports เดิมและ page-layout behavior ของ URL ยาวไว้ ไม่อ้างว่าออกแบบ layout ใหม่
- Protected old history, references, unknown-operation/deleted-case records และ canonical packages เดิมไม่เปลี่ยน Original public files 12 ไฟล์ยังอ่าน anonymous ได้ตรง bytes/hash การเปลี่ยนไฟล์ disposable 56 เป็น 60 bytes และ cleanup เดิมเป็น 404 เป็นผลที่อนุญาตแยกต่างหาก Final native editor leases เป็นศูนย์ ไม่มี File/dialog/iframe หรือ held provider receipt ค้าง
- Workflow build/check ผ่านและ inventory pin source `530410f` ครบ 310 runtime/deployment files, 23 rendered diagrams และ sharing ZIP Parent เปิด generated HTML จริง ตรวจ arrows/continuation branches ของ diagrams 09/21, zoom/Fit, status table, 131 source links ที่ pin commit และ local anchors ไม่มี dangling anchor การเข้าถึง unpushed commit ผ่าน GitHub ไม่ได้ยืนยัน
- Context pointers: `/tmp/ecm-final-fixer-source-ready.txt`, `/tmp/ecm-final-integration-inclusion.json`, `/tmp/ecm-final-regression-handoff.txt`, `/tmp/ecm-final-native-handoff.txt`, `/tmp/ecm-final-native-final-proof.json`, `/tmp/ecm-final-accepted-downloads/manifest.json`, `/tmp/ecm-final-merger-handoff.txt` และ `/tmp/ecm-final-guide-visual-proof.json` Allocation ครบ 112 stories ไม่ใช่หลักฐานว่าทุก story ผ่าน native test
- **Release gates ที่ยังเปิด:** dedicated Folio credentials/permissions/key provisioning, actual provider response/expiry/transport/original-byte/zero-byte/encrypted/10 MB contracts, deployed topology และ authorized PM/ECM request-settlement/uncertain DELETE proof ไม่มี trusted proof contract สำหรับ receiptless unknown หรือ dispatched unknown DELETE จึงคง blocked ไม่เพิ่ม checkbox/free text/retry เพื่อปลดเอง
- ปิด implementation ไม่ใช่อนุมัติ production หรือ human business review เพิ่มเติม รอบนี้ไม่ push, เปิด PR, deploy, เรียก live ECM/PDMS หรือแก้ข้อมูล production

### Authoring amendment verification — 16 พฤศจิกายน 2026

- แก้ใน original repository บน `feat/ecm-attachments` ไม่สร้าง worktree หรือ demo application แยก ใช้ปุ่มและแผง ONLYOFFICE เดิม ส่วน checkbox ถูกนำออกเฉพาะ UI ไม่ลบ attachment/category contract หรือ schema DB
- ตรวจ failure ก่อนแก้จริง: กดเพิ่มแล้วสร้าง Field ที่ category ยังเป็น null ก่อนมี dialog; action แปลงช่องเดิมปลด authoring และล้าง dirty state ของหมวดที่ยังรอ commit หลัง proof save; browser Escape คืน focus ไป BODY แทนปุ่มเดิม แก้แล้วตรวจ regression และ browser ซ้ำตามพฤติกรรมที่เปลี่ยน
- ผล automated ของ amendment: plugin 305 tests/1,438 assertions ผ่าน, spreadsheet-unit 116 tests/301 assertions ผ่าน, UI 262 tests/18 suites ผ่าน, forced typecheck 5/5 และ build 3/3 ผ่าน; root formatter/lint ของ source/test delta ผ่าน ไม่ใช้ผล native acceptance ของ feature เดิมแทนการตรวจ UI ใหม่
- Browser smoke โหลด HTML และ bundle ของ plugin จริงใน Chromium iframe กว้าง 340px: native `:modal` กว้าง 308px, initial Cancel focus, เลือกหมวดแล้วจึงยืนยันได้, Escape/Cancel คืน focus ให้ exact trigger, loading/empty/error หยุดยืนยันและ Retry โหลดใหม่, แยกแสดงชื่อหมวดเดิมเมื่อ upstream list เปลี่ยน ตรวจ 6 dialog openings กับ 1 explicit Retry ได้ category GET 7 ครั้ง และไม่มี API mutation ระหว่างยกเลิก Field/หมวดเดิมคงอยู่
- ขอบเขต smoke ใช้ ONLYOFFICE command และ Folio API boundaries จำลองแบบ read-only; ไม่ใช่ real ONLYOFFICE/DCM acceptance ไม่ได้รัน ECM HTTP suites กับ DB ในรอบนี้เนื่องจาก isolated Docker/Office runtime เดิมไม่ทำงาน ไม่เรียก live ECM/PDMS, ไม่อ่าน credentials จริง, ไม่ migrate/แก้ DB จริง, ไม่ commit/push/deploy และไม่ migrate ฟอร์มเก่า

### External category popup verification — 16 พฤศจิกายน 2026

- Amendment นี้แทนตำแหน่ง inline dialog ของรอบก่อนด้วย background `ShowInputHelper` ภายนอก sidebar ใช้ repository และปุ่มเดิมบน `feat/ecm-attachments` ไม่สร้าง demo application หรือ worktree แยก ไม่เปลี่ยน attachment schema, API authorization หรือจังหวะอัปโหลด
- แผงหลักยังเป็นเจ้าของการอ่าน API และการยืนยัน category/target; popup ไม่มี HTTP client หรือ capability Parent ตรวจ scope และ pinned live frames ก่อน relay คำสั่ง ปิด editor แล้วยกเลิกคำเลือกได้แม้ React ถอด iframe ออกจาก DOM แล้ว
- พบจาก actual ONLYOFFICE ว่า Retry ที่ถูกซ่อนทำให้ focus ไป BODY และ Escape ที่ดักเฉพาะ content ไม่ปิด popup เพิ่ม regression ที่ fail ก่อนแก้ แล้วรับ Escape ที่ระดับ popup window เฉพาะเมื่อมีคำเลือกที่ยังเปิด พร้อมถอด listener ตอนทำลาย popup
- Final automated: plugin 312 tests/25 files และ UI 265 tests/19 suites ผ่าน; root formatter/lint ของ delta 20 files ผ่าน; forced workspace typecheck 5/5 และ production build 3/3 ผ่าน รวม background popup bundle ใหม่
- Provider-free runtime ตรวจ editor config 12 combinations ของ action/document kind/PDMS flag, read-only exclusion และ public manifest CORS ที่ allowed origin ได้ 200 ส่วน foreign origin ได้ 403 ไม่ต่อ database หรือ provider
- Final native browser smoke ใช้ ONLYOFFICE 9.4.0.1 จริงกับ workbook สังเคราะห์และ production plugin/relay source วัด popup 430×360 นอก sidebar 220px และไม่มี HTML dialog ใน primary iframe ตรวจ error → explicit Retry → ready, Escape หลัง focus ไป BODY, empty-list blocking, fresh reopen, เลือกหมวดแล้วเปิดใช้ Confirm และ Cancel
- Smoke สุดท้ายเปิด 3 ครั้งกับ Retry 1 ครั้ง ได้ category GET 4 ครั้ง ไม่มี form API mutation และไม่สร้าง Field; ไม่ dispatch การยืนยันบันทึกหรือ upload จริง Folio category API ใช้ read-only controlled responses ไม่ใช่ live DCM ส่วน database/object-storage endpoints ของ fixture ถูกชี้ไปปลายทางที่ใช้ไม่ได้เพื่อกันการแตะข้อมูลจริง
- ไม่รัน database-backed HTTP suites ในรอบนี้ ไม่เปลี่ยน `.env`, secrets หรือ DB ของระบบ ไม่ commit/push/deploy การจัดหา encryption key และ acceptance กับบัญชี/provider จริงยังเป็น operational prerequisite ตามข้อ 7 ไม่ใช่สิ่งที่ผล native UI นี้รับรอง Editor ที่เปิดก่อนเปลี่ยน signed config ต้องเก็บงานแล้วเปิดใหม่
- Workflow build/check ผ่านกับ runtime/deployment source 315 files, rendered diagrams 23 ภาพ และ sharing ZIP เปิด HTML จริงตรวจภาพ 08, zoom/Fit, รูปฝังครบ 23 ภาพ และ local anchors ไม่มีปลายทางขาด ตรวจ SVG ของ branch native popup/relay/cancel ที่ขนาดอ่านได้ ไม่ใช้ hash/inventory เพียงอย่างเดียวแทน visual review

### ECM response compatibility verification — 16 พฤศจิกายน 2026

- ตรวจ config แบบไม่แสดงค่า secrets: ตัวแปร ECM ทั้งสี่มีอยู่ และ encryption key เป็น canonical Base64 ที่ถอดได้ 32 bytes การ replay ใช้ inherited environment ของ process ร่วมกับ dotenv ปัจจุบัน ไม่ใช่การอ่าน heap ของ server จึงไม่ใช้ผลนี้อ้างว่า process ทุกตัว reload แล้ว
- ผู้ใช้อนุญาต login DCM จริงหนึ่งครั้งและ GET หมวดหนึ่งครั้งเท่านั้น ใช้ครบแล้วและไม่ได้ทำ upload/delete ทั้งสองคำขอได้ HTTP 200 แต่ parser ของ Folio ปฏิเสธ `data.expire` รูปแบบ `YYYY-MM-DD HH:mm:ss` และคาด `data` envelope ของหมวดที่ response จริงไม่มี จึงไม่ใช่หลักฐานว่า encryption key ยังผิด ไม่มีการบันทึก token จริงลง DB หรือแก้ข้อมูลฟอร์ม
- ใช้ public API response example เป็นหลักฐาน root array ของ `id`/`type` แยกจากตาราง docs ที่ระบุ `data: Array` ขัดกัน การตรวจจริงเก็บเฉพาะ metadata ไม่ได้เก็บ body หมวดทุก field จึงไม่อ้างว่าได้พิสูจน์ row schema ทั้งหมดกับ provider จริง ผู้ใช้ยืนยัน UTC+7 และแจ้งนโยบาย 15 วัน/login ใหม่เพิกถอนตัวเก่าโดยอ้างเอกสาร DCM; ไม่ได้รอครบ 15 วันหรือ login ซ้ำเพื่อทดสอบ revocation จริง
- เพิ่ม regression ที่ public HTTP category seam เดิมกับ shared PostgreSQL state และ local ECM จำลอง ก่อนแก้พบ 503 แทน 200 จาก expiry จากนั้นพบ failure เดิมเมื่อเปลี่ยน fixture เป็น root array หลังแก้ final HTTP auth suite ผ่าน 20 tests/90 assertions ใน UTC
- Regression ใช้เวลาควบคุม: token อายุ 15 วันยังถูก reuse เมื่อเหลือ 46 วินาที และเริ่ม login ใหม่ที่ request-budget/skew boundary 45 วินาที ใช้ expiry จาก API ไม่คำนวณอายุแทน ทดสอบเดียวกันผ่านอีกครั้งใน `Pacific/Honolulu` (1 test/6 assertions) พร้อมชุดเดิมที่ป้องกัน late 401 ของ generation เก่าล้าง state ใหม่ ผลนี้เป็น simulated policy proof ไม่ใช่การยืนยันอายุ provider จริง
- Runtime smoke ใช้ Folio API ผ่าน TCP จริงกับฐานข้อมูลที่สร้างแยกและ provider localhost: โหลดหมวดได้ HTTP 200 สองครั้งด้วย simulated login ครั้งเดียว ไม่ส่ง service token ใน response และปิด fixture servers หลังจบ ไม่มี live ECM calls เพิ่มหลัง authorization หนึ่งคู่ดังกล่าว
- Root formatter/lint ของ client และ HTTP fixtures สามไฟล์ผ่าน forced workspace typecheck 5/5 และ production build 3/3 ผ่าน อัปเดต category fixture ของ native authoring suite ให้ตรง contract แต่ไม่ได้รัน suite ที่ต้องใช้ object storage/ONLYOFFICE ในรอบ parser fix นี้ ไม่มีการอ้างผล native popup รอบก่อนแทนการตรวจ provider
- Workflow guide สร้างใหม่ครบ 23 diagrams กับ inventory 315 runtime/deployment files เปิด HTML จริงตรวจรูปฝังครบ ไม่มี local anchor ขาด กด zoom/Fit และตรวจ node expiry/root-array ของภาพ 08 ที่ขนาดอ่านได้ ไม่ใช้ build/hash เพียงอย่างเดียวแทน visual review
- ไม่แก้ `.env`, ไม่เปลี่ยน schema, ไม่ล้าง auth cache ของ DB ใช้งานจริง และไม่ commit/push/deploy ยังไม่ได้เรียก DCM จริงซ้ำหลังแก้ parser การตรวจผ่าน provider จำลองไม่ใช่ production approval บัญชีที่ใช้ร่วมกับบริการนอก coordinator ยังคงมีความเสี่ยงถูก login ทับ
- Final workflow check ผ่าน ปิดเฉพาะแท็บ/บริการ preview ที่สร้างเอง และลบฐานข้อมูล disposable ของ regression หลังทดสอบสำเร็จ เก็บ backup ก่อนแก้แยกจาก repository ไม่เหลือ script ที่สามารถเรียก probe DCM จริงซ้ำจากรอบนี้

### Request-driven early renewal verification — 16 พฤศจิกายน 2026

- ผู้ใช้เลือกตรวจและต่ออายุเมื่อมีคำขอ ECM โดยเริ่มเมื่อ token cache เหลือไม่เกิน 12 ชั่วโมง ข้อ 7 เป็น policy ปัจจุบันแทน cached-token boundary 45 วินาทีที่บันทึกในผลตรวจรอบก่อน; request-budget/skew validation ของ token ใหม่ยังคงเดิม ไม่เพิ่ม cron, env, API, schema หรือ dependency
- ใช้ public HTTP category seam เดิมพร้อมฐานข้อมูลแยกและ local provider ก่อนแก้ production code regression ที่เหลือ 12 ชั่วโมงพบ login เพียง 1 ครั้งแทน 2 ครั้งตาม policy ใหม่ หลังแก้ผ่าน ทดสอบเวลาที่เหลือ 12 ชั่วโมง 1 วินาทียัง reuse ได้, เวลา 12 ชั่วโมงพอดีให้สอง instance ร่วม login ใหม่ครั้งเดียว และคำขอถัดไป reuse token ใหม่
- ปรับ provider fixtures ให้จำลองอายุ 15 วันแทน 1 ชั่วโมง และย้าย clock advance ของ transient-budget/late-401 cases ให้เข้า renewal window ใหม่ ไม่ลด assertion เรื่องสูงสุดสาม login attempts หรือการป้องกัน generation เก่าล้าง token ใหม่ Final auth suite ผ่าน 20 tests/92 assertions ใน UTC และ renewal regression ผ่านอีกครั้งใน `Pacific/Honolulu` (1 test/8 assertions)
- Runtime smoke เรียก EcmClient จริงผ่าน HTTP localhost กับฐานข้อมูล disposable: GET หมวดสามครั้ง, upload จำลองหนึ่งครั้งพร้อมตรวจ original bytes และ DELETE จำลองหนึ่งครั้ง ใช้ login รวมสองครั้งคือครั้งแรกและที่ threshold โดย upload/category จากสอง client ร่วม refresh เดียวกัน และ DELETE reuse token ใหม่ ไม่มี live DCM requests ในรอบนี้
- Root formatter/lint ของ source และ HTTP fixtures สี่ไฟล์ผ่าน forced workspace typecheck 5/5 และ production build 3/3 ผ่าน ไม่ได้รัน native authoring และ scalar save/submit HTTP suites ที่ต้องมี Office/object-storage environment ในรอบ auth-policy นี้ แม้ปรับอายุ token ใน provider fixtures ให้สอดคล้องแล้ว
- อัปเดตคำอธิบายและ gate ใน workflow ภาพ 08 สร้าง HTML/SVG/sharing ZIP ใหม่ครบ 23 diagrams และ inventory 315 runtime/deployment files เปิด HTML จริงตรวจรูปครบ, local anchors, zoom/Fit และอ่าน gate 12 ชั่วโมงใน SVG ที่ขนาดจริง
- ไม่แก้ `.env`, ไม่เปลี่ยน schema/ข้อมูลฟอร์มจริง และไม่ commit/push/deploy ลบเฉพาะฐานข้อมูล disposable ที่สร้างเองหลังทดสอบ ปิดแท็บ/บริการ preview ของรอบนี้ เก็บ backup ก่อนแก้แยกจาก repository ไม่มี background service ต่ออายุหลงเหลือ
- ข้อจำกัดยังเดิม: login ใหม่เพิกถอน token เก่าทันที อาจกระทบคำขอที่ส่งไปแล้วหรือบริการที่ใช้บัญชีร่วม ไม่มีการ drain คำขอเดิมหรือ resend upload/delete อัตโนมัติ ผลจำลองไม่ใช่ provider/production acceptance
