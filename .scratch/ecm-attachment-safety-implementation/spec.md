# ECM Attachment Safety — สเปก implementation ส่วนที่ยังขาด

Status: needs-info Created: 2026-11-18 Decision baseline: latest resolved decisions ของ ECM Attachment Safety ทั้ง 9 ตั๋ว Original planning source baseline: Working Tree ที่ตรวจวันที่ 2026-11-18; HEAD `ba64bbb969a85589b96dd453783b7dcdbfeccc86` Execution gate: ผู้ใช้อนุมัติให้เริ่ม implementation ในบทสนทนานี้แล้ว โดยให้ commit งานเดิมก่อน ขอบเขต real DCM/ข้อมูลจริง/DELETE/push/deploy ยังต้องใช้สิทธิ์และหลักฐานเฉพาะ ไม่ได้อนุมัติจากตั๋วหรือผลจำลอง

## Problem Statement

User ยังส่ง XLSX Response รอบถัดไปด้วยเลขเอกสารและ Storage Template เดิมไม่ได้อย่างสอดคล้องกับ decision ล่าสุด เพราะ source ยังใช้ filename-first admission และเติมเลขชื่อซ้ำภายใน batch แม้ DCM sample ที่ตรวจจริงสามารถสร้างไฟล์ใหม่จากชื่อฐานเดียวกันได้ การเปลี่ยนเลขเอกสารหรือบังคับ Save Draft ก่อน Submit เป็นทางเลี่ยง ไม่ใช่การแก้ปัญหา

การกรอกตารางยังต้องปิดช่องว่างระหว่าง native editor, ปุ่มแนบ, physical-row mapping และ server guard โดยเฉพาะการลบเมื่อเหลือหนึ่ง body row ของทุก XLSX Form การระบุ native operation ว่าไม่รองรับยังไม่พิสูจน์ว่าป้องกันไฟล์ย้ายผิดแถวได้จริง

User และ Admin ต้องแยกออกว่า File ยังอยู่ใน dialog, ยืนยันเป็น pending แล้ว หรือบันทึก canonical snapshot แล้ว ต้องไม่สูญเสีย pending File/removal จาก navigation, remount หรือ completion ของ snapshot เก่า และต้องเห็น active Save, unknown outcome กับ postcommit cleanup warning เป็นคนละสถานะ

ผลจำลองหรือ HTTP 200 ไม่รับรอง provider identity, original-request settlement หรือความปลอดภัยของประวัติทั้งหมด สเปกนี้จึงแยกงาน implementation/isolated acceptance ออกจาก scoped provider evidence, การตรวจข้อมูลจริง และ HOLD ที่ยังขาดหลักฐาน โดยไม่เปิดคำตัดสินเดิมซ้ำ

## Solution

รวมงานที่ยังขาดเป็น implementation ชุดเดียวสามกลุ่ม:

- **Naming/admission/receipt/warnings:** แก้เส้นทาง Save Draft, Submit ทุกรอบ และ final Save Correction ที่ใช้ร่วมกัน ให้ actual new template uploads ใช้ชื่อฐานซ้ำและผูก original receipt กับ slot/snapshot ของตน แยกคำเตือน receipt ชนประวัติจาก receipt ซ้ำกับ Draft ของตน ไม่ลด ownership/history/unknown safeguards
- **Tables/browser/editor:** จัด UI, builder และ server ให้ตรงกันเรื่อง minimum one body row, ปุ่มครบทุก configured attachment column, native support/guard matrix และ pending/loading/navigation policy ที่อนุมัติแล้ว
- **Acceptance:** ใช้ existing HTTP integration กับ actual app + isolated DB/store + controlled provider เป็น seam หลัก ใช้ actual supported browser/ONLYOFFICE พิสูจน์ boundary ของ native commands, loading, navigation, focus และ keyboard แยก real DCM evidence เป็นอีกชั้นหนึ่ง

คงส่วนที่มีอยู่และทำงานตาม contract แล้ว ไม่สร้างระบบแนบไฟล์ใหม่ ไม่ทำ catalog CRUD, publication, original retrieval, persistence หรือ recovery ใหม่ทั้งชุด ให้เปลี่ยนเฉพาะ shared behavior ที่ยังขัด decision และเพิ่ม consumer-path evidence ที่ยังขาด

Stories ที่กล่าวถึง behavior เดิมเป็น regression constraints ไม่ใช่งานสร้าง feature ซ้ำ ส่วนที่มี implementation แล้วให้ reuse และตรวจ affected path เท่านั้น ตาราง current-source delta ด้านท้ายระบุงานที่ยังต้องแก้หรือพิสูจน์เพิ่ม

## User Stories

### ชื่อไฟล์ การส่งรอบถัดไป และ receipt

1. As a User, I want ส่งรอบใหม่ด้วย `docs_number` และแม่แบบเดิมได้, so that ไม่ต้องเปลี่ยนข้อมูลจริงเพื่อหลบ filename guard
2. As a User, I want Submit รอบใหม่ได้โดยไม่ต้อง Save Draft เป็นทางเลี่ยงก่อน, so that การส่งตรงใช้ contract เดียวกับการบันทึกร่าง
3. As a User, I want กฎเดียวกันใช้กับรอบที่สองและทุกรอบต่อมา, so that การแก้ไม่จำกัดเฉพาะตัวอย่างสองรอบ
4. As a User, I want actual template upload ใช้ชื่อฐานจากเลขเอกสารและแม่แบบเดิม, so that ชื่อที่ส่งตรงกับ routing contract ที่ตกลง
5. As a User, I want หลาย scalar slots ที่ใช้ชื่อฐานเดียวกันเก็บ receipt ของตน, so that ไฟล์ไม่สลับช่อง
6. As a User, I want หลาย physical rows และ attachment columns ใช้ชื่อฐานซ้ำได้, so that ไม่ต้องเพิ่มตัวระบุแถวลง filename
7. As a User, I want Response ต่างกันที่ใช้ชื่อฐานเดียวกันผ่านได้เมื่อไม่มี resource/scope conflict จริง, so that filename ไม่ถูกถือเป็น ownership proof
8. As an Admin, I want final Save Correction ใช้กฎชื่อและ receipt เดียวกับ template uploads อื่น, so that การแก้ประวัติไม่ติด filename-only guard
9. As a User, I want original extension และ casing คงเดิม, so that Folio ไม่เปลี่ยนชนิดไฟล์โดยตั้งชื่อใหม่
10. As a User, I want ไฟล์ไม่มี extension ยังคงไม่มี extension, so that ระบบไม่เดานามสกุลแทนฉัน
11. As an Admin, I want literal ตัวเลข จุด whitespace และ `-(1)` ใน frozen template name คงเดิมเมื่อผ่าน validation, so that ระบบไม่ตัดข้อความจริงเป็น generated suffix
12. As a User, I want unsafe filename input ถูกปฏิเสธแทนการ rewrite, so that routing input ไม่เปลี่ยนโดยไม่รู้ตัว
13. As a User, I want แต่ละ actual upload เก็บ original receipt ของคำขอนั้น, so that ไม่ใช้ผลค้นชื่อแรกหรือล่าสุดแทนไฟล์ที่ส่ง
14. As a User, I want current Draft เก็บ metadata ของ snapshot ปัจจุบันครบ, so that เปิดร่างต่อแล้วอ่านไฟล์ที่บันทึกจริง
15. As a Viewer, I want Submission แต่ละรอบเก็บ receipt ของรอบนั้น, so that อ่านประวัติเก่าได้โดยไม่เปลี่ยนไปใช้ไฟล์ล่าสุด
16. As a Viewer, I want Correction แต่ละ revision คง receipt ของตน, so that revision ที่เลือกตรงกับเอกสารและไฟล์ที่เปิด
17. As a User, I want ไฟล์และ metadata ที่ไม่เปลี่ยน reuse canonical reference เดิม, so that ordinary Save/reopen ไม่สร้าง upload เพิ่ม
18. As a User, I want เปลี่ยนเลขเอกสารแล้ว reuse trusted saved original ได้ตาม contract เดิม, so that ไม่ต้องเลือกไฟล์ใหม่เพื่อกลบ retrieval failure
19. As a User, I want replacement ใช้ File ใหม่แทน original ของไฟล์เก่า, so that ข้อมูลที่บันทึกตรงกับการเลือกของฉัน
20. As a User, I want เปลี่ยนเฉพาะ `fiscal_year` ใน template mode ไม่ upload ใหม่, so that งานนี้ไม่เปลี่ยน storage policy ของ Published Template
21. As an Admin, I want legacy UUID contracts และ old Published PoC คงเดิม, so that การแก้ template mode ไม่ migrate ฟอร์มเก่าโดยปริยาย
22. As a User, I want dialog Save/Cancel, read/export และ internal saves ไม่ dispatch upload เพิ่ม, so that มีเพียง explicit response save ที่เขียนไฟล์ตาม contract

### การจำแนก conflict และคุ้มครอง snapshot

23. As a User, I want same-name upload ที่ได้ distinct valid receipt ผ่าน checks ถูกบันทึกได้, so that ไม่ถูกแจ้งเป็น history conflict เพียงชื่อซ้ำ
24. As a User, I want actual new upload ที่คืน paired receipt ของ protected history ถูกหยุด, so that ไม่รับไฟล์ของประวัติมาอ้างเป็นไฟล์ใหม่เงียบ ๆ
25. As a User, I want actual new upload ที่คืน paired receipt ของ own current Draft ถูกหยุดด้วยเหตุผลอีกประเภท, so that แยกจาก conflict ของประวัติได้
26. As a User, I want resource ที่มีทั้ง Draft และ history references ใช้เหตุผล history conflict, so that ระบบไม่ลดระดับความคุ้มครอง
27. As a User, I want partial/one-sided/ambiguous aliases ถูกหยุดตามหลักฐานจริง, so that ระบบไม่เดาว่าเป็น exact history หรือ Draft receipt
28. As a User, I want unchanged-file reuse ที่ไม่มี POST ไม่เข้า new-upload conflict policy, so that บันทึก snapshot ปกติได้โดยไม่บังคับ token ใหม่
29. As a User, I want คำเตือนระบุ Field/Tag และ physical row ที่เกี่ยวข้อง, so that รู้ว่าช่องใดทำให้รอบนี้ยังไม่บันทึก
30. As a User, I want เห็นรายการอ้างอิง Submission/Correction ที่ตรงเฉพาะเมื่อมีหลักฐานและสิทธิ์, so that ตรวจปัญหาได้โดยไม่เปิดเผยประวัติคนอื่น
31. As a User, I want หน้าหลักกับ plugin แสดง semantic reason สอดคล้องกัน, so that ไม่เห็น generic filename error กลบสาเหตุที่แท้จริง
32. As an Admin, I want original attempt/receipt/conflict evidence คงอยู่ตาม Operation lifecycle, so that ตรวจย้อนกลับได้โดยไม่ใส่ flags ใน answer JSON
33. As a User, I want conflict ไม่ commit canonical snapshot บางส่วน, so that document, JSON, references และผล Operation ไม่ขัดกัน
34. As a User, I want failure รักษา saved answer และ pending ที่ยังอยู่ในหน้า, so that ไม่ต้องทิ้ง File เพื่อแก้ error
35. As a User, I want ข้อความไม่อ้างว่า cancel หรือ DB rollback คืน remote bytes ได้, so that ไม่เข้าใจผิดเกี่ยวกับผลที่ provider อาจทำไปแล้ว
36. As an Admin, I want resource ที่ history/คนอื่น/workspace/eligible Operation ยังอ้างไม่ถูก DELETE, so that cleanup ไม่ทำลาย survivor
37. As a User, I want upstream failure มี safe diagnostic status/details ตามช่องทางเดิม, so that ตรวจเหตุได้โดยไม่เผย credentials หรือ raw tokens
38. As a User, I want timeout หรือ receipt ผิด schema ไม่ทำให้ระบบส่ง POST/DELETE ซ้ำเอง, so that ไม่สร้างผลข้างเคียงเพิ่มเพื่อเดาผลคำขอเก่า
39. As a User, I want original checkpoint recovery ตรวจคำขอเดิมก่อน, so that ผลตอบกลับ Folio ที่หายไม่กลายเป็น upload ใหม่
40. As a Viewer, I want saved canonical copy ยังอ่านได้ภายใต้สิทธิ์เมื่อมี unknown outcome, so that การค้างของ mutation ไม่ถูกตีความเป็นการลบคำตอบเดิม

### ตาราง ปุ่มแนบ และ minimum row

41. As a User, I want ทุก XLSX repeating table เหลืออย่างน้อยหนึ่ง body row, so that โครงสร้างตารางไม่หายจากคำสั่งลบแถว
42. As a User, I want ตารางที่ไม่มี attachment ใช้ minimum-row rule เดียวกัน, so that guard ไม่ขึ้นกับการมีปุ่มแนบ
43. As a User, I want คำสั่งลบถูก disabled เมื่อเหลือหนึ่ง row พร้อมเหตุผล, so that รู้ว่าเหตุใดลบต่อไม่ได้
44. As a User, I want คำขอ direct/stale/racing ถูก server guard ตรวจจาก trusted current document, so that bypass UI ไม่ล้างแถวสุดท้าย
45. As a User, I want rejected last-row delete คง input, formulas, validation, ranges และ canonical revision, so that คำสั่งที่ถูกห้ามไม่กลายเป็น clear-row operation
46. As a User, I want rejected last-row delete คง saved File และ pending/removal/invalid-selection state, so that ไม่สูญเสียงานแนบไฟล์
47. As a User, I want ลบจากสองเหลือหนึ่งแล้วเพิ่มแถวกลับได้ตาม flow เดิม, so that minimum-row guard ไม่ทำให้ตารางใช้ต่อไม่ได้
48. As a User, I want ไม่มี clear-last-row action หรือ confirmation ใหม่, so that คำสั่งลบใช้ decision ล่าสุดแทนข้อเสนอเก่า
49. As a User, I want ทุก body-row cell ของ configured attachment column มีปุ่ม, so that ไม่มี slot ที่กำหนดไว้แต่ใช้งานไม่ได้
50. As an Admin, I want การนำ File ออกจากคำตอบไม่ลบ control/configuration ของคอลัมน์, so that โครงสร้างช่องแนบคงอยู่
51. As a User, I want แถวที่เพิ่มมีปุ่มครบทุก configured attachment column โดยไม่ copy File เดิม, so that ไม่เกิด receipt ที่ติดมาจากแถวต้นแบบ
52. As a User, I want add/delete ที่รองรับรักษา receipt และ pending ของ surviving physical rows, so that ไฟล์ไม่ย้ายไปตาม compact answer index
53. As a User, I want empty gaps และ attachment-only zero-byte rows รักษาความหมายเดิม, so that requiredness ไม่ตกหล่นหรือผูก File ผิดแถว
54. As a User, I want internal row/project/workspace save ไม่ทำ ECM POST/DELETE, so that row movement ไม่กลายเป็น file replacement
55. As an Admin, I want Correction ใช้สิทธิ์และ row controls เดิม, so that งานนี้ไม่เพิ่มคำสั่งแก้โครงสร้างที่ไม่ได้อนุมัติ
56. As a User, I want ordinary cell edits/paste/Undo/Redo ใช้ได้เมื่อ mapping ถูกต้อง, so that ตารางยังกรอกข้อมูลได้ตาม Field rules
57. As a User, I want sort/drag/cut-paste/native insert-delete ที่ทำ mapping ไม่ยืนยันถูกกันก่อน save/write, so that warning อย่างเดียวไม่ปล่อยไฟล์สลับแถว
58. As a User, I want same-row-count reorder ถูกตรวจหรือป้องกันจริง, so that จำนวนแถวเท่าเดิมไม่ถูกใช้เป็น proof ที่ผิด
59. As a User, I want paste URL/drawing/button ไม่สร้าง canonical attachment, so that client content ไม่เป็น ownership evidence
60. As a User, I want filter/hidden geometry ใช้ file actions เฉพาะเมื่อยืนยัน physical target ได้, so that visible-row index ไม่เลือกไฟล์ผิดช่อง
61. As a User, I want merge ข้ามแถวหรือย้าย mapped table ข้าม sheet ไม่ผ่าน mapping guard, so that ไม่รับการย้ายไฟล์ที่ไม่รองรับ
62. As a User, I want ambiguous transition หยุดก่อน remount ที่ทำ File หาย, so that pending state ไม่ถูกทิ้งแล้วค่อยแจ้ง error
63. As a User, I want reconnect/หลายแท็บคง lease/revision/scope safeguards, so that File ในแท็บหนึ่งไม่ถูกย้ายหรือใช้แทนอีกแท็บ

### Pending state, navigation และ loading

64. As a User, I want แยก candidate ใน dialog, confirmed pending และ saved attachment ได้, so that ไม่เข้าใจว่าเลือกไฟล์เท่ากับ upload สำเร็จ
65. As a User, I want saved A กับ pending B มีสถานะแยกกัน, so that รู้ว่าไฟล์ใดยังไม่บันทึกจริง
66. As a User, I want picker Cancel/X คืน local baseline เดิม, so that ไม่ล้าง previous confirmed pending หรือ canonical attachment
67. As a User, I want unsaved candidate/File/removal/ordinary edits เตือนก่อน navigation/route change/back ที่ทิ้งงาน, so that ไม่สูญเสียงานโดยไม่ตั้งใจ
68. As a User, I want Cancel/Escape ใน discard modal คงหน้าและงานเดิม, so that ทางปลอดภัยไม่ทำให้เกิด mutation
69. As a User, I want explicit discard-and-exit ทิ้งเฉพาะ unsaved local changes, so that saved answer ไม่ถูกลบและไม่มี automatic Save-and-exit
70. As a User, I want ไม่มี discard prompt เมื่อไม่มีงานค้างหรือเปิดแท็บใหม่โดยไม่ทำลายหน้าเดิม, so that ระบบไม่เตือนผิดเหตุ
71. As a User, I want refresh/close ใช้ browser prompt แบบ best-effort, so that ทราบข้อจำกัดและไม่ถูกสัญญาว่า File กู้คืนได้
72. As a User, I want active Save บล็อก editor, keyboard edits, file picker, duplicate action และ app navigation, so that captured snapshot ไม่ถูกแก้ระหว่างรอโดย loading ที่เป็นเพียงภาพ
73. As a User, I want loading มี accessible status และ focus ที่ใช้งานได้, so that ผู้ใช้ keyboard ไม่หลุดไปกดส่วนที่ถูกบล็อก
74. As a User, I want confirmed success/failure จบ loading ตามหลักฐาน, so that spinner ไม่ล็อกหน้าถาวรหลังได้ผลแล้ว
75. As a User, I want timeout/unknown เปลี่ยนเป็น persistent unresolved status พร้อมห้ามส่งซ้ำ, so that ไม่ถูกชวน retry หรือใช้ spinner แทน HOLD
76. As a User, I want ออกจากหน้าไม่ clear/fence/cancel original checkpoint อัตโนมัติ, so that navigation ไม่ถูกอ้างเป็น proof ว่ายกเลิก request แล้ว
77. As a User, I want กลับเข้าหน้าตรวจ original Operation ก่อน mutation ใหม่, so that reload ไม่ทำให้ unknown upload ถูกส่งซ้ำ
78. As a User, I want B ที่ commit แล้วใช้งานต่อได้แม้ old A cleanup ล้ม/unknown, so that cleanup warning ไม่ทำให้ successful save กลายเป็น failure
79. As a User, I want persistent warning แจ้งว่า old public URL อาจยังเปิดได้, so that ordinary Save/reload ไม่ถูกอ้างว่าลบไฟล์เก่าสำเร็จ
80. As an Admin, I want completed Correction ที่มี newer pending คง editor และแจ้งสองสถานะแยกกัน, so that snapshot เก่าไม่รับงานที่เลือกใหม่โดยปริยาย
81. As an Admin, I want retired Correction workspace ไม่ Save ซ้ำและออกได้ด้วย explicit discard, so that เริ่ม Correction ใหม่จาก current revisionอย่างชัดเจนโดยเลือก File ใหม่

### การตรวจรับและหลักฐานภายนอก

82. As a User, I want acceptance ตรวจ saved JSON, XLSX, selected revisions และผล dispatch ผ่าน actual HTTP app, so that helper tests ไม่กลบ consumer-path defect
83. As a User, I want native commands/loading/navigation ถูกตรวจใน actual browser/editor, so that simulated messages ไม่ถูกอ้างเป็นผล UI ผ่าน
84. As an Admin, I want implementation acceptance แยกจาก real DCM evidence, so that isolated provider double ไม่ถูกใช้ปลด provider HOLD
85. As an Admin, I want type/size matrix ตรวจต่อปุ่มในเส้นทาง initial upload, reopen/access และ number-change reuse, so that ผลไม่ถูกสรุปจากขนาดรวมหรือ PDF ตัวเดียว
86. As an Admin, I want ขนาดต่อ File ที่ 0 และ 10,000,000 bytes ได้ตาม contract และ 10,000,001 ถูก Folio reject ก่อน dispatch, so that ไม่ทดลอง oversize กับ DCM จริงโดยไม่จำเป็น
87. As an Admin, I want แผน type/size ไม่เพิ่ม upload/download byte comparison หรือ aggregate-capacity workload ที่ตัดแล้ว, so that acceptance ไม่ขยายขอบเขตโดยพลการ
88. As an Admin, I want runtime size/hash/security/reference checks เดิมไม่ถูกถอดตามข้อยกเว้นแผน evidence, so that ลดงานตรวจรับไม่กลายเป็นลดความปลอดภัย
89. As an Admin, I want old-data inventory/recovery มีสิทธิ์และ trusted provenance แยก, so that duplicate names/shared identity ไม่ถูกเหมาว่า corruption หรือแก้ history อัตโนมัติ
90. As an Admin, I want รายงาน environment/revision/date, evidence status, สิ่งที่ยังไม่ตรวจ และผู้ตรวจรับชัดเจน, so that อนุมัติแผนไม่ถูกใช้แทนผลรับรอง release

## Implementation Decisions

### 1. ขอบเขตและลำดับ dependencies

1. สเปกนี้เป็น execution backlog เดียวจาก latest human decisions [D01]–[D09] และ canonical naming contract [N] ไม่แทนเอกสารเจ้าของกฎ ไม่แก้หรือใช้แทน 9 Wayfinder tickets เดิม ขั้นนี้ยังไม่ implement
2. ลำดับงานหลังอนุมัติตั๋ว: **shared naming/admission/receipt และ semantic failures** ก่อน consumer/UI integration; **minimum-row/button/native mapping guards** ตรวจร่วมกับ pending transitions; **navigation/loading** ต่อกับ Operation/pending state เดิม; ปิดด้วย **integrated HTTP และ actual browser/editor acceptance** บน delivery integration source เดียวกัน งาน UI ที่ไม่พึ่ง API ใหม่ทำคู่ขนานได้ แต่ไม่อ้าง acceptance จาก child worktree แทน integration
3. แยก provider evidence, old-data inventory และ remediation เป็น gated work ต่างหาก ไม่ทำให้การพัฒนาในระบบแยกต้องรอ request-finality contract ที่ยังไม่มี และไม่ถือ local completion ว่าปลด external HOLD
4. ไม่สร้าง database schema/answer JSON columns/allocator ใหม่เป็น requirement ใช้ attempt/identity/reference/batch/cleanup ledger, Operation result และ canonical transaction ที่มีอยู่ ขยาย semantic error contract เฉพาะที่จำเป็นต่อการจำแนกเหตุผลและ migrate ทุก affected consumer; ไม่มี compatibility shim หรือ optional counter สำหรับ new template uploads

### 2. Shared naming และ receipt admission

5. เปลี่ยน upload planner ของ storage mode `template` ให้ใช้ `<docs_number>-<template_name>.<original-extension>` ซ้ำได้ ทั้งใน batch และข้าม Save/Submit/final Save Correction ไม่มี extension ให้จบที่ template name ไม่เติม generated counter/timestamp/UUID/row/binding suffix หรือ durable filename reservation คง literal text และ validation เดิมตาม [N]
6. แก้ shared destination, receipt, reference และ delete admission ให้แยก filename-only coincidence ออกจาก actual resource/scope conflict ไม่แก้เฉพาะ second-Submit UI หรือชื่อ test case คง actor/owner, current role, trusted slot, lease/revision/opening, original unresolved Operation, resource/reference และ deletion fences
7. Same-name valid new receipt ไม่เป็น conflict เพียงเพราะประวัติหรือ Response อื่นใช้ filename นั้น ไม่ lookup/adopt จาก search หรือเลือก latest by name/time/size คงข้อจำกัดต่อ known protected/shared resources และ unknown/in-flight work ตามหลักฐานจริง
8. แต่ละ actual upload เก็บ original request/paired receipt และ destination evidence ใน ledger เมื่อ snapshot commit แต่ละ scalar/table slot เก็บ `file_token`, `file_link`, `original_name`, `size_bytes` และ table `row_index` ตาม schema เดิม Current Draft อัปเดต current snapshot; ไม่สร้าง immutable history ของทุก Draft save เป็น feature เพิ่ม
9. Apply Q3/Q4 เฉพาะ **actual new template upload**: paired receipt ชน surviving protected Submission/Correction ให้ history conflict; paired receipt ซ้ำ own current Draft ที่ไม่ใช่ protected/shared resource ให้ Draft conflict หากทั้งสองมีอยู่ให้ history precedence ไม่ใช้เลข Q3/Q4 เป็นศัพท์สำหรับผู้ใช้
10. Partial/one-sided/multiple/held aliases คง fail-closed ตามข้อเท็จจริง ไม่เดาว่าเป็น exact history/Draft identity จากชื่อหรือจาก match ข้างเดียว Same-batch aliases และ protected resources อื่นยังอยู่ใต้ existing identity/reference safeguards ไม่ยกเว้นเพราะเลิกเติมเลขชื่อ
11. บันทึก original receipt/conflict evidence แม้ canonical commit ต้องหยุด ใช้ semantic reason คนละประเภทผ่าน existing HTTP/Operation/error surfaces ให้ host/plugin สอดคล้องกัน ระบุ slot/Field/Tag/physical row และ reference ที่พิสูจน์ได้ภายใต้สิทธิ์ ห้ามเปิดเผย raw token, service secret หรือข้อมูลของผู้อื่น
12. Q3/Q4 ไม่ commit partial snapshot ไม่แก้ history ไม่ DELETE shared resource ไม่ resend/เปลี่ยนชื่อ/สั่ง reload เพื่อหนี conflict และไม่อ้าง rollback external bytes คง saved answer กับ pending ที่ยังมีอยู่ตาม lifecycle เดิม
13. Unchanged-file reuse ที่ไม่มี POST ยังคงใช้ receipt เดิม รวม immutable revisions ที่ reuse อย่างถูกต้อง เปลี่ยน root `docs_number` ใช้ trusted original พร้อม existing size/hash checks; replacement ใช้ File ใหม่ เปลี่ยนเฉพาะ `fiscal_year` ใน template mode ไม่ upload ใหม่ Legacy UUID/year/category policy และ old files/receipts ไม่เปลี่ยน
14. Template multipart contract คง `documentFile` เป็น original bytes พร้อม generated destination filename และ `template` เป็นข้อความ `"1"` ไม่เพิ่ม year/number/category parts ใน mode นี้ คงการรับ valid object-shaped หรือ one-item-array receipt และการปฏิเสธ malformed receipts ตาม adapter เดิม
15. คง original upstream HTTP status และ safe diagnostic details ที่จำเป็นผ่าน diagnostic/error channels เดิมก่อนกลืนเป็น generic adapter failure แยก internal diagnostic status จาก public Folio error ไม่เปิด raw body/credentials/tokens ให้ browser ไม่เพิ่ม logging subsystem, automatic file POST/DELETE retry หรือสรุปสาเหตุ HTTP 500 เดิมโดยไม่มีหลักฐาน
16. Document pointer, extracted JSON, references และ Operation completion ต้อง commit เป็น snapshot เดียวตาม transaction เดิม Cleanup ทำได้เมื่อไม่มี surviving Draft/Submission/Correction/workspace/eligible-Operation references เท่านั้น ไม่ DELETE ตาม filename หรือ attempt เก่าอย่างเดียว

### 3. ตาราง ปุ่มแนบ และ native support boundary

17. Minimum one body row ใช้กับ **ทุก XLSX Form ที่มี repeating-table row actions เดิม** ทั้ง ordinary table, old Published PoC และ durable legacy/template ไม่รวมหัวตาราง ไม่จำกัด guard ภายใน attachment-only branch และไม่เพิ่ม row controls ให้ Correction หรือ surface ที่เดิมแก้ไม่ได้
18. เมื่อเหลือหนึ่ง body row ให้ disabled delete-selected พร้อมเหตุผลว่าอย่างน้อยต้องมีหนึ่งแถว Server ตรวจ trusted current document/revision ก่อนเริ่ม mutation; builder และ full-mapping consumers ต้องไม่ clear/delete row นี้ แม้ direct/stale/racing request ไม่เปลี่ยน input, ranges, formulas/validation, buttons, JSON/references, canonical revision หรือ pending/removal/invalid selection ไม่มี clear-last-row/confirmation ใหม่
19. เมื่อมากกว่าหนึ่ง body row ใช้ add/delete flow และ verified transition เดิม การลบจากสองเหลือหนึ่ง การสั่งซ้ำ และเพิ่มกลับต้องสอดคล้องกัน ไม่ใช้จำนวน active answer objects เป็น physical row count
20. Configured attachment column ต้องมีปุ่มในทุก body-row cell ไม่รวมหัวตาราง แถวใหม่มีปุ่มครบและไม่ copy attachment การนำ File ออกจากคำตอบไม่ลบ control การลบ control รายเซลล์โดยคง column configuration ต้องไม่ผ่าน trusted saved-button validation ไม่เปลี่ยน incomplete Template Draft rules, immutable Published configuration หรือ read-only/results/export URL projection
21. คง physical-row/published-column identity และ trusted row transition เดิม ไม่เพิ่ม stable row ID/per-row Tag ไม่ใช้ compact/visible-row index ย้าย receipt Unchanged row movement ไม่ rename/reupload และ internal row/project/workspace saves ไม่ dispatch ECM POST/DELETE
22. ใช้ native support matrix ของ [D04]: ordinary input/paste และ Undo/Redo ได้เมื่อ mapping ถูก; Folio add/delete รองรับใน User Draft ตามสิทธิ์เดิม; sort/drag/cut-paste ทั้งแถวหรือคอลัมน์/native insert-delete ไม่เป็นวิธีย้ายไฟล์ที่รองรับ; paste URL/drawing/button ไม่สร้าง receipt; merge ข้ามแถวและย้าย mapped table ข้าม sheet ไม่รองรับระหว่างกรอก
23. Filter/hidden rows/columns ใช้ file actions ได้เฉพาะเมื่อพิสูจน์ physical target จาก trusted document ได้ โดยเฉพาะ hidden/zero-geometry ต้องมี actual native proof ก่อนรับรอง คง lease/revision/reconnect guards และไม่โอน browser File ข้ามแท็บ
24. ป้องกันคำสั่งก่อน scope change/remount เมื่อ intercept ได้ และต้องหยุด save ที่ mapping ไม่ยืนยันก่อน external writes/canonical commit คง saved snapshot และ pending Files/removals/invalid state ไม่ rebind ไปช่องข้างเคียง Undo ไม่ย้อน committed snapshot/DCM effects หรือฟื้น stale receipt การมี warning หรือ row count เท่าเดิมอย่างเดียวไม่ถือเป็น guard
25. หาก boundary ใดป้องกันหรือตรวจไม่ได้ ต้องรายงาน unverified และไม่รับรองว่า safely rejected; ไม่ลด acceptance เงียบ ๆ หรือเปลี่ยน support matrix ที่ human อนุมัติเอง คงข้อจำกัดของงานนี้เฉพาะ fill/Correction ไม่ห้าม Admin จัด layout ใน Template Draft โดยปริยาย

### 4. Pending state, loading และ navigation

26. Reuse pending host, picker baseline และ captured-snapshot semantics เดิม แยกสามสถานะที่ผู้ใช้เข้าใจได้: “เลือกในกล่อง — ยังไม่บันทึก”, “ยืนยันไฟล์แล้ว — รอบันทึกแบบฟอร์ม”, “บันทึกแล้ว” สถานะสุดท้ายต้องมี explicit canonical commit Saved A กับ pending B ต้องไม่แสดงเหมือน B บันทึกแล้ว
27. ก่อนเริ่ม Save เมื่อ candidate, confirmed File/replacement/removal หรือ ordinary unsaved edits จะสูญหายจาก internal navigation/route change/back ให้ใช้ existing platform modal ทางปลอดภัย “อยู่หน้านี้ต่อ” และ explicit “ทิ้งการเปลี่ยนแปลงและออก” Cancel/Escape ไม่ทิ้งงาน; Confirm ทิ้งเฉพาะ unsaved changes ไม่ลบ saved state และไม่ automatic Save/POST/DELETE
28. ไม่มีงานค้างไม่เตือน การเปิดแท็บใหม่โดยไม่ทำลายหน้าเดิมไม่เตือนหรือส่งต่อ File Picker Cancel/X ยังคงทิ้งเฉพาะ local changes ตั้งแต่เปิด dialog ไม่เปลี่ยนเป็น full-page discard การยืนยันที่ dispatch ไปแล้วต้อง settle ตาม existing handshake ก่อนอ้างว่ายกเลิกได้
29. Active Save แสดง loading และบล็อก mutation, file selection, duplicate actions และ app-controlled navigation ครอบคลุม native editor/active cell/keyboard และ host/plugin ไม่ใช่ overlay ที่ยังแก้ workbook ได้ ใช้ accessible status/focus/modal patterns เดิม
30. Confirmed success/failure จบ loading ตามหลักฐาน Failure รักษา saved answer และ pending ที่ยังอยู่ Timeout/unknown ไม่ใช่ proof ว่าจบโดยไม่เกิดผล ให้เปลี่ยนเป็น persistent unresolved notice คง checkpoint/mutation HOLD และ recovery ของ original Operation ไม่ spinner ถาวร ไม่เพิ่ม manual unlock/resend/DELETE
31. Saved canonical copy ยังอ่านได้ตามสิทธิ์เมื่อ recovery เปิด editable document ไม่ได้ การออก/reload ไม่ clear/fence/cancel original request โดยอัตโนมัติ และไม่อนุญาต mutation ใหม่เพียงเพราะเปิดหน้าใหม่ Browser refresh/close ใช้ beforeunload แบบ best-effort ไม่รับประกันข้อความ/การห้ามออกหรือการกู้ File หลัง reload
32. B commit แล้วแต่ cleanup A ล้ม/unknown เป็น persistent old-public-URL warning ไม่ย้อน success เป็น failure ไม่ full-page lock B และไม่ retry/ล้าง warning จาก ordinary Save/reload แยกจาก canceled/uncommitted batch HOLD
33. Final Correction รับเฉพาะ captured snapshot หากมี newer File/removal ให้คง editor/browser state และแจ้งว่า Correction เดิมบันทึกแล้วแต่งานใหม่ยังไม่บันทึก Workspace retired แล้วห้าม Save ซ้ำ ใช้ explicit discard-and-exit; ทำต่อโดยเปิด current revision เป็น Correction ใหม่แล้วเลือก File อีกครั้ง ไม่ transfer/reselect อัตโนมัติ Loading ไม่ลบ safeguard นี้

### 5. ขอบเขตที่ต้องคงเดิม

34. คงหนึ่ง File ต่อ slot, ทุกชนิดไฟล์, 0–10,000,000 bytes inclusive, zero-byte requiredness หลัง upload+save, requiredness ของ active table rows และ completely empty-row exclusion ไม่เพิ่ม allowlist/aggregate cap/config
35. คง streamed actual-byte/slot-budget validation, canonical JSON 262,144 UTF-8 bytes, trusted receipt/origin/no-redirect/original-reuse size+SHA-256 checks, role/session/lease/revision/callback authorization และ reference/delete concurrency fences การลด provider evidence ไม่อนุญาตถอด checks เหล่านี้
36. คง DCM-only originals ไม่มี binary/base64/new answer columns, RustFS attachment copy, temporary archive, IndexedDB/sessionStorage File bytes หรือ auto-upload Public-link limitations และการแก้/ลบไฟล์นอก Folio ยังเป็น accepted constraints Frozen JSON ไม่ทำให้ external bytes immutable
37. คง Storage Template catalog/category-ID grouping, Published metadata freeze, duplication policy, PDMS Project Name Source และ scalar `fiscal_year` result-filter semantics ตาม ADR ที่รับไว้ ไม่ทำ CRUD/publication/filter redesign จากสเปกนี้
38. หลังมี permanent code change ต้องปรับ affected consumers/contracts/tests/fixtures/docs และ system map ใน change เดียวกัน เปลี่ยน glossary ที่ยังอธิบาย policy เก่าให้ตรง latest decisions โดยไม่ rewrite ประวัติหลักฐานหรือเปลี่ยน ADR เงียบ ๆ

## Testing Decisions

### Seam ที่ตกลงแล้ว

ไม่ขอเลือก seam ซ้ำ: [M] และ [D04]/[D06]/[D07]/[D09] ยืนยัน existing HTTP seam แล้ว ใช้ **actual application HTTP + isolated DB/store + controlled provider** เป็น seam หลัก ไม่สร้าง attachment service mock layer ใหม่ ใช้ actual supported browser/ONLYOFFICE เฉพาะ behavior ที่ HTTP พิสูจน์ไม่ได้ และ real DCM เป็น external evidence อีกชั้น ไม่ใช่ seam ทดแทน local acceptance

Good test ตรวจผลที่ consumer เห็น: persisted document/JSON/receipt/reference correctness, atomicity, physical targets, permitted/blocked transitions, semantic reason, preserved pending และไม่มี extra dispatch ไม่ตรวจ internal function calls, copied wiring, source text, incidental defaults หรือ exact wording ใช้ existing suites ก่อนเพิ่ม permanent test ใหม่; เพิ่มเฉพาะ consumer regression/edge ที่มีเหตุผล และลบ obsolete suffix-only/wording assertions ไม่ re-pin implementation detail

### A. Isolated HTTP acceptance

| ID | กลุ่ม stories | Scenario / observable acceptance |
| --- | --- | --- |
| H01 | 1–8, 13–16, 82 | First Submit แล้ว default new round ใช้เลข/แม่แบบ/extension เดิม Submit รอบสองและรอบถัดไปจริง ตรวจ canonical JSON, saved XLSX, receipts ของแต่ละรอบและ selected history ไม่เปลี่ยนเลขหรือบังคับ Save Draft ก่อนเพื่อให้ผ่าน |
| H02 | 4–12, 17, 21 | Same-base scalar + หลาย rows/columns + ต่าง Responses ใช้ชื่อฐานเดิมโดยไม่ generated suffix Literal suffix, dots/whitespace ที่ valid, extension/casing, extensionless และ legacy policy คงถูกต้อง |
| H03 | 13–20, 33–36 | Save/reopen/partial replacement/metadata-number change/final Correction ตรวจ original receipts และ before/after exact bytes ของ surviving references ใน controlled provider รวม selected Submission/older Correction downloads ไม่ใช่ token ต่างหรือ HTTP 200 อย่างเดียว |
| H04 | 23–32 | Provider model แบบ create-new รองรับ same-name happy path; explicit paired-history, own-Draft, both-reference precedence และ partial/ambiguous alias models ต้องแยก semantic reason/slot/row และ permission-safe reference details ไม่ใช้ filename-keyed overwrite เป็น universal DCM truth |
| H05 | 28, 33–40 | Conflict/failure/unknown ไม่ partial commit, เปลี่ยน history, ล้าง pending, DELETE resource ร่วม หรือเพิ่ม resend เพื่อให้ผ่าน ตรวจ original attempt/receipt คงอยู่และ actual new-upload conflicts ไม่บล็อก unchanged reuse |
| H06 | 17–22, 34–39, 54 | Unchanged Save, picker Cancel, read/export, internal row/project/workspace transitions ไม่เพิ่ม ECM POST/DELETE ไม่ทำ login/upload เพียงเพื่อ reuse unchanged references |
| H07 | 41–48 | Minimum-row บน ordinary XLSX/old PoC/durable legacy/template: หนึ่ง row ว่าง/ordinary/saved/zero-byte/pending/removal/invalid state, direct/stale/race requests, สองเหลือหนึ่งแล้วสั่งซ้ำและ append กลับ ตรวจ rejected snapshot/revision ไม่เปลี่ยน ไม่ clear row และไม่มี provider writes |
| H08 | 49–63 | Trusted add/delete transitions หลาย attachment columns, empty gaps, attachment-only/zero-byte rows และ saved/pending/removal/invalid states ตรวจ JSON/XLSX/button count/current row references กับ originals ของ survivors ไม่ผูกตาม compact index |
| H09 | 38–40, 75–79 | Provider เก็บแล้ว response หาย, Folio acknowledgement หายหลัง commit, late canceled receipt, restart และ uncertain DELETE ใช้ original checkpoint/evidence คง no-resend/no-DELETE-retry/fences; B commit แล้วแต่ cleanup A ค้างยังอ่าน/export ได้และ warning ไม่หาย |
| H10 | 21, 34, 36, 88 | คง permission/Viewer restrictions, independent bearer/cookie/capability authorization, lease/revision/opening/callback proof, requiredness, actual per-file/JSON limits, trusted original size/hash/no-redirect checks และ reference-versus-delete races |

**Prior art:** [T1] มี real HTTP app, fixture DB/store, controlled provider, receipt barriers, original bytes, save/reopen/Submit/Correction, physical-row transitions และ restart/unknown/cleanup cases แล้ว [T2] ครอบคลุม selected immutable history ใช้ seams นี้ต่อ ไม่สร้าง tests ที่ assert ว่าชื่อทุกไฟล์ต้อง unique หรือยอม own-Draft new receipt reuse ใน template modeตาม policy เก่า ให้ปรับ consumer contracts/fixtures ที่ขัด Q3/Q4 โดยคง legacy regressions

Exact-byte assertions ใน H03/H08 เป็น **local receipt/history/mapping proof ตามแผนเจ้าของเดิม** ไม่ใช่เพิ่ม requirement เทียบ upload/download bytes กลับเข้า provider type/size matrix ด้านล่าง Runtime size/hash checks คงทำงานตามเดิม

### B. Actual supported browser/editor acceptance

ใช้ actual Folio routes, native ONLYOFFICE และ disk-backed synthetic File กับ isolated data/provider เก็บ browser/editor version, source revision/hash, actions, before/after workbook/mapping, pending state และ sanitized screenshots/transport ไม่ใช้ Builder-only/VM/mocked bridge เป็นหลักฐาน native gesture ผ่าน

| ID | กลุ่ม stories | สิ่งที่ต้องเห็นจริง |
| --- | --- | --- |
| U01 | 41–51 | Delete disabled+reason เมื่อเหลือหนึ่ง body row ทั้งมี/ไม่มีปุ่มแนบ; ลบสองเหลือหนึ่ง, กดซ้ำ, append กลับ, Save Draft/Submit/reopen และปุ่มครบทุก configured column โดยไม่ล้าง last row |
| U02 | 52–63 | Support/guard matrix: ordinary edit/paste/Undo/Redo, Folio row actions, sort/drag/cut-paste/native insert-delete, same-row-count reorder, pasted URL/button, filter/hidden/zero-geometry, merge/cross-sheet และ commands ต่อเนื่อง ตรวจ mapping guard ก่อน remount/write และคง pending ของ survivors |
| U03 | 64–71 | Candidate/confirmed pending/saved A+pending B แยกได้; picker Save/Cancel/X, navigation/route/back, discard Confirm/Cancel/Escape, no-dirty/no-destructive-new-tab, refresh/close พร้อมระบุ best-effort prompt และสูญ local File หลัง reload ตามจริง |
| U04 | 72–79 | Active Save ขวาง active-cell/keyboard/editor/picker/duplicate clicks/app navigation จริง Accessible status/focus ใช้งานได้; confirmed outcome จบ loading; unknown เป็น persistent HOLD ไม่ spinner ถาวร และ saved-copy access/old-cleanup warning ยังถูกต้อง |
| U05 | 24–35, 80–81 | Q3/Q4 reasons ตรง host/plugin โดยไม่เผย token; failed save คง pending; async completion/newer-pending Correction คง editor ไม่ remount ไม่ Save บน retired workspace และ explicit discard ทำงาน |
| U06 | 1–3, 8, 14–16, 83 | Journey บน actual integration source ตั้งแต่ Save/reopen/Submit/new round/same-number Submit และ eligible Admin Correction/selected history ใช้ authorization/eligibility จริง ไม่สกัด auto-start route หรือเปลี่ยนข้อมูลเพื่ออ้างว่าปัญหาผ่านแล้ว |

**Prior art:** existing pending-host UI tests, plugin operation/picker/spreadsheet tests และ native evidence [A] ใช้ช่วยแยก regressions แต่ historical result ไม่เป็น acceptance รอบนี้ Native cases ต้องแยก User Draft/Admin Correction, legacy/template contracts, saved/pending replacement/removal/invalid/zero-byte, gaps และหลาย attachment columnsตาม [D04] ไม่ต้องเพิ่ม native row controls ให้ Correction

หาก browser/editor runtime ที่ต้องใช้เข้าไม่ถึง ให้จบ reachable implementation/HTTP work และรายงาน exact runtime prerequisite/รายการ U ที่ยัง unverified ห้ามลด scope หรือประกาศ UI acceptance จาก test double

### C. External provider evidence — แยกจาก implementation

1. **Identity/history/DELETE isolation:** ใช้ approved plan ของ [D01] ฉบับ amendment ชื่อฐานซ้ำ ตรวจว่าการ upload ชื่อเดิมได้ receipt ของแต่ละคำขอและ surviving originals ยังตรงหลักฐานเดิมตาม claim ที่ต้องรับรอง เก็บ sanitized manifest ไม่เพิ่ม generated-suffix-routing gate ที่ถูกแทนแล้ว ผล PDF sample เดิมเป็น scoped evidence เท่านั้น DELETE isolation ต้องมี authorization แยกและไม่มี survivor ใช้ resource นั้น
2. **Unknown settlement:** [D06] ต้องมี proof ผูกกับ original request/resource ว่าเกิดผลอะไรและจบแล้วตาม contract ใด ไม่มี delayed effect ไม่สมมติ request-status API/log access ที่ยังไม่มี Empty search, elapsed time, restart, sender fence, manual token/URL/note หรือ POST ใหม่สำเร็จไม่ยุติ unknown ของคำขอเดิม ไม่มี manual unlock feature
3. **Type/size ต่อปุ่ม:** ใช้ representative PDF, DOCX, XLSX, image, text, HTML, benign binary/ZIP, password-protected และ extensionless/case-preserved extensions ตาม [D08] ตรวจ **แต่ละปุ่ม/slot ของตน** ทั้ง scalar/table ที่อยู่ใน scope แยก initial upload, reopen/access และ `docs_number` change ผ่าน saved reference ตรวจขนาดจริงของแต่ละ File ที่ 0 และ 10,000,000 bytes; 10,000,001 ต้อง Folio reject ก่อน dispatch ไม่ส่ง oversize ไป live DCM จากแผนนี้
4. **เกณฑ์ของ type/size เท่านั้น:** เก็บ API outcome, validated original paired receipt และ URL access result ผูก round/slot รายงาน encrypted/password-protected โดยไม่ขอรหัส/ถอดรหัส/รับรองเนื้อหา **ไม่บังคับ upload/download exact-byte หรือ SHA-256 comparison** ไม่รัน 1/10/20 full-size files, aggregate-capacity/two-Response concurrency workload และไม่ใช้ workload ที่ไม่รันเป็น planning/release gate เพิ่ม ไม่รับรอง byte identity/content safety/unlimited capacity จาก matrix นี้
5. **Runtime checks ไม่ถูกยกเว้น:** ถ้า ordinary original-reuse flow ปฏิเสธ size/hash/origin/integrity ให้รายงาน outcome ตามจริง ไม่ถอด check/เปลี่ยนไป picker เพื่อให้ matrix ผ่าน ข้อยกเว้น type/size evidence ไม่ยกเลิก identity/history/recovery evidence ของเจ้าของกฎอื่น
6. **Evidence record:** ระบุ scenario/slot/round, source/environment/date/provider revision เท่าที่ทราบ, original correlation และ sanitized receipt/reference identity, ผล observed กับ expected, supported/partial/conflicting/insufficient/unverified และ pyw1tt human review แยกกัน ไม่เก็บ service credentials/raw tokens/private receipt URLs หรือ originals นอก DCM ลง repo

## Out of Scope

- Application/schema/migration/DB changes, runtime tests, actual browser trial, real DCM calls, live-data audit/remediation, DELETE, commit/push/deploy ในขั้นเขียนสเปกนี้
- การเริ่ม implementation จากข้อความตัวอย่าง “หลังอนุมัติตั๋วแล้ว”; ต้องมีตั๋วและ approval จริงก่อน ไม่ถือ conditional instruction เป็นการอนุมัติที่เกิดแล้ว
- การแก้ ย้าย relabel resolve ใหม่ หรือใช้ implementation tickets แทน 9 Wayfinder tickets เดิม
- Counter/timestamp/reservation/unique-filename service, filename fallback, routing normalization หรือ mandatory external inventory/search/หาเจ้าของเพื่อกรอกช่องว่าง Folio ledger
- การเปิดคำถามเดิม DCM-only, public/private links, wildcard routing, category-ID grouping, catalog CRUD, legacy UUID/frozen Published contracts และ requiredness/limits
- Native gesture support เพิ่มจาก approved matrix, stable row IDs/per-row Tags, หลาย repeating tables/หลาย editable worksheets หรือ row controls ใหม่ใน Correction
- Auto-upload/save-and-exit/retry, manual settlement unlock, refresh/discard เพื่อหลบ conflict, temporary File persistence/archive หรือสำเนา attachment originals ใน RustFS/DB
- Automatic old-data rename/reupload/delete/history rewrite/hash backfill หรือใช้ latest/ไฟล์แถวอื่นแทน trusted original
- Upload/download byte-comparison และ aggregate-capacity workload ที่ตัดจาก provider type/size plan ไม่เพิ่ม allowlist, batch cap/config หรือการรับรอง capacity โดยไม่มีผลตรวจ
- การเปลี่ยน main-document viewer/download policy, selected-revision semantics, PDMS project-name identity/result filters หรือการลด security/runtime integrity checks เพื่อให้ acceptance ผ่าน
- การอ้าง Production corruption, deployed behavior, provider-wide guarantee หรือ release PASS จาก source/local test/sample PDF/HTTP 200/จำนวน tests

## Further Notes

### Current source: ทำแล้วอะไร และยังขาดอะไร

ตรวจ Working Tree ปัจจุบันผ่าน CodeGraph และเปิด omitted coverage โดยตรง Baseline HEAD เป็น commit ข้างต้น ไม่ใช่ deployed revision; source observations ต่อไปนี้ไม่ใช่ผล runtime ใหม่

| ส่วน | Current behavior / evidence | Delta ของสเปกนี้ |
| --- | --- | --- |
| Naming | [`planAttachmentFile` / `numberDuplicateAttachmentFilenames` / `planAttachmentUploads`](../../apps/server/src/ecm/attachments.ts#L303-L655) มี template base/legacy UUID อยู่แล้ว แต่ยังเติม `-(n)` ใน batch | เอา generated numbering ออกจาก actual template uploads และ migrate affected consumer expectations ไม่สร้าง allocator |
| Pre-dispatch | [`admitAttachmentDestination`](../../apps/server/src/ecm/identity.ts#L34-L143) query account+filename และ reject history/foreign refs; ถูกเรียกตอน prepare และ before-send | แก้ shared filename-first admission ตาม resource/scope evidence ไม่ workaround เฉพาะ Submit |
| Receipt/commit | [`receiveAttachmentIdentity`](../../apps/server/src/ecm/identity.ts#L145-L199), [`uploadAttachments` / `commitAttachmentBatch`](../../apps/server/src/ecm/attachments.ts#L658-L1227) และ [snapshot completion](../../apps/server/src/operations/response-completion.ts#L28-L207) มี attempt receipts, row references และ transactional persistence แล้ว | เติม Q3/Q4 classification/precedence/durable error evidence ใน actual-new-upload path โดยใช้ persistence เดิม ไม่สร้าง answer shape ใหม่ |
| Public failure | [attachment Operation runner](../../apps/server/src/responses/attachment-operation.ts#L414-L443) ส่ง failure เป็น `document_save_failed` พร้อม message; [`EcmClient.request`](../../apps/server/src/ecm/client.ts#L500-L541) ย่อ non-OK เป็น generic rejected และ cancel body | ส่ง semantic conflict distinctions และ safe upstream diagnostic evidence ถึง consumer ที่เกี่ยวข้อง ไม่เปิด raw provider body |
| Receipt API/original reuse | [`EcmClient.upload` / `originalBytes`](../../apps/server/src/ecm/client.ts#L548-L650) รับ object/one-item-array แล้ว และมี original size/hash/origin checks; [canonical schema](../../apps/server/src/responses/attachment-data.ts#L23-L38) มี 4 fields และ table `row_index` แล้ว | คงของเดิม ไม่เพิ่ม receipt parser/original retrieval ใหม่ และไม่ถอด integrity checks |
| Minimum row | [Builder last-row branch](../../apps/server/src/documents/spreadsheets/builder-script.ts#L165-L185) ยัง clear input/hyperlinks เมื่อ `count === 1`; [server row checks](../../apps/server/src/operations/spreadsheet-document.ts#L343-L445) ตรวจ resulting row count ภายใน `hasSpreadsheetAttachments` และหลัง builder ทำงานแล้ว | เพิ่ม trusted pre-mutation minimum-row guard สำหรับทุก XLSX; align builder/plugin/server ให้ reject โดยไม่ clear และคง snapshot เดิม |
| Buttons/native mapping | มี [saved-button validation](../../apps/server/src/documents/spreadsheets/upload-poc.ts#L169-L253) และ [host transition/pending remap](../../apps/web/src/features/onlyoffice/upload-poc-pending.ts#L235-L342) แล้ว แต่ source นี้ไม่พิสูจน์ guard ครบทุก same-row-count reorder/native gesture | Reuse validation/remapping; ปิดเฉพาะ command/control/mapping gaps และพิสูจน์ native matrix จริง ไม่สร้าง row identity ใหม่ |
| Correction/pending | [Correction route](../../apps/web/src/routes/admin/results/$responseId/correction.tsx#L34-L139) มี dirty-navigation/beforeunload และ completed-with-newer-pending notice/ห้าม Save workspace เดิมแล้ว; [host editor](../../apps/web/src/components/onlyoffice-editor.tsx#L817-L935) มี pending/cleanup notices | คง behavior นี้และเติมเฉพาะ gaps ของ approved trigger/discard/loading matrix; ไม่เขียน Correction lifecycle ใหม่ Source excerpt ไม่พิสูจน์ full active-cell/keyboard/picker/app-navigation lock |
| Existing regressions | [T1] ยังมี suffix assertions, filename-only foreign/history rejection และ actual template replacement ที่ reuse own-Draft receipt แล้วสำเร็จ | เปลี่ยน consumer tests ตาม latest policy; คง legacy/unknown/reference safety evidence ไม่ย้าย old results มาเป็นผลกฎใหม่ |

### ความขัดกันที่ต้องจัดการเมื่อ implement

- [N]/[D09] เป็น intended policy ล่าสุด ส่วน broad same-destination own-Draft overwrite wording ใน [G] และ tests/source ที่ยอม actual new template upload คืน Draft receipt เดิมยังเป็น prior behavior เมื่อ implement ต้องปรับคำอธิบายให้แยก template Q4 ออกจาก legacy/unchanged reuse ไม่ลบหลักฐานเก่าหรือถือ source เก่าเป็น human policy ล่าสุด
- [A] ส่วน BATCH และ story 94 บันทึก suffix policy เก่าไว้เป็น historical evidence ไม่ใช่ prerequisite ของชื่อฐานซ้ำ ต้องเพิ่ม traceability ของ acceptance ใหม่โดยไม่ relabel BATCH ว่าผ่านกฎนี้
- Historical F01 รายงาน builder/server final-row contradiction แล้ว ไม่ต้อง reproduce เพื่อยืนยันคำรายงานเดิม การพิสูจน์หลังแก้ต้องแสดง latest minimum-one-row behavior โดยไม่กลับไป clear-one/delete-zero
- ไม่มี ADR conflict ที่ต้องเปลี่ยนใน scope นี้: [ADR3] คง name-string PDMS answers; [ADR4] คง scalar fiscal-year filtering การเปลี่ยน naming ไม่เปลี่ยนสอง contract นี้

### Dependencies สำหรับแตกตั๋ว implementation

นี่เป็นลำดับงาน ไม่ใช่ตั๋วที่อนุมัติแล้ว:

1. **Shared filename/resource admission + receipt conflicts:** ตัด numbering, แก้ prepare/before-send/reference/delete consumers ตาม policy และเก็บ semantic failures/diagnostics พร้อม HTTP regressions H01–H06/H09/H10
2. **All-XLSX minimum row + column buttons + native mapping guards:** align shared row mutation/builder/server/plugin และ pending transitions พร้อม H07/H08/U01/U02 ไม่รอ provider settlement contract
3. **Pending/loading/navigation integration:** host/plugin/routes/modal/editor busy และ async Correction behavior ต่อกับ shared semantic states จากข้อ 1 พร้อม U03–U05 โดย reuse ส่วนที่มีอยู่
4. **Integrated acceptance/docs:** รัน named HTTP paths และ browser/editor journey บน actual delivery integration source; อัปเดต domain/canonical behavior/system map และ affected contracts/tests/fixtures พร้อม U06 โดยไม่ใช้ worktree-only PASS แทน integration
5. **External evidence / human acceptance:** ทำแยกตามสิทธิ์ของแต่ละ scope ด้านล่าง ไม่ใช้ local completion ปิด HOLD และไม่สร้าง fake unlock เพื่อปิดตั๋ว

สเปกเผยแพร่ด้วย `ready-for-agent` ตาม tracker convention แต่ label ไม่ข้าม execution gate ขั้นถัดไปสร้างตั๋วใหม่เริ่ม `01` ใน implementation effort แยก dependencies และ acceptance criteria แล้ว **หยุดให้ผู้ใช้ตรวจตั๋วก่อนพัฒนา** ไม่ย้ายหรือใช้แทน 9 Wayfinder tickets

### Authorization และ HOLD register

| งาน | สิ่งที่ทำได้หลังอนุมัติตั๋ว | สิ่งที่ยังต้องสิทธิ์/หลักฐานแยก | สถานะ ณ สเปกนี้ |
| --- | --- | --- | --- |
| Implementation + isolated acceptance | เปลี่ยน shared source/docs/tests และรัน HTTP/browser/editor ในระบบแยกตาม scope | ต้องมี approval ของตั๋วก่อน ไม่แตะ Forms/Responses/ไฟล์ใช้งานจริง | ยังไม่ implement/ไม่รันทดสอบรอบนี้ |
| Same-name provider/history | ทีม Folio เก็บหลักฐานเองตาม [D01]; pyw1tt ตรวจรับ | Account/environment, synthetic destination/write scope, collision/ownership boundary, stop conditions และ cleanup owner ต้องชัด; DELETE แยก | มี PDF sample เดิมที่ supported เฉพาะกรณีนั้น; ส่วน guarantee ที่เหลือ HOLD |
| Unknown upload / uncertain dispatched DELETE | พิสูจน์ Folio handling ในระบบแยกตาม [D06] | หลักฐาน original-request correlation/finality/settlement ที่ยืนยันได้จริง | Provider contract/evidence ยังไม่พอ; คง HOLD เฉพาะ unresolved scope ไม่กล่าวว่ามี Production operation ค้างจริง |
| Postcommit old-file cleanup | B ที่ commit แล้วอ่าน/export ได้ พร้อม persistent warning | Proof การลบ A; ห้าม ordinary save/reload retry uncertain DELETE | ไม่ตีความเป็น full-page mutation HOLD ของ saved B |
| Per-button type/size | ใช้ matrix/limits ที่ปิด decision แล้ว ไม่ต้องเลือกใหม่ | ผลจริงแต่ละ type/path/button/size และ scoped provider execution | Pending/insufficient; ไม่ใช้ omitted byte comparison/aggregate workload เป็น gate เพิ่ม |
| Old-data read-only inventory | แผนของ [D03] พร้อมผู้ตรวจรับแล้ว | Environment/DB, record/access scope, sanitized report และ original retrieval permission แยก | ยังไม่มี audit/result; ไม่บล็อกทั้งระบบหรือประกาศ corruption จาก alias |
| Recovery/remediation | เสนอแผนเมื่อมี trusted original/provenance | pyw1tt อนุมัติรายกลุ่มพร้อมผลต่อ immutable history/references | ไม่มี automatic remediation หรือรับรอง recovery |
| Release/deploy | ไม่มีจาก spec/ticket approval เพียงอย่างเดียว | Integrated acceptance + applicable provider evidence + human disposition และ push/deploy authorization | ไม่รับรอง release/Production |

**ขอบเขต DCM ที่ผู้ใช้ระบุล่าสุด:** หากพิจารณา real API หลังอนุมัติตั๋ว ต้องใช้ฐาน `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45)` เท่านั้น ตรง root `docs_number` = `กทอ.67-00-0001` และ frozen `template_name` = `ก่อหนี้-4_ขยาย(45)` โดย extension เป็นของ File ตาม contract ห้ามสลับ project/template หรือเติมชื่อทดสอบเพื่อหนี collision/unknown ข้อความนี้ไม่ใช่คำสั่งเรียก API ในขั้นสเปก ไม่ขยายเป็น DELETE, arbitrary real-data access, remediation, push หรือ deploy

Known same-name files จากหลักฐานเดิมไม่ถูกถือว่าหายไปหรือเป็น disposable fixtures ต้องตรวจ write/ownership boundary ภายใน scope ที่อนุมัติก่อนและไม่ถือ search ว่างอย่างเดียวเป็น safe-write proof หยุดเมื่อ unexpected error/unknown/unsafe alias หรือผลไม่ตรง claim เก็บหลักฐาน ไม่ auto POST/DELETE retry ไม่เปลี่ยนชื่อเพื่อส่งใหม่ หาก execution prerequisites ยังไม่พอให้รายงาน exact blocker ไม่ invent provider API หรือไปใช้เลขโครงการอื่น

กรณี acceptance ที่ต้องเปลี่ยน `docs_number`, frozen template หรือต้นทางจนออกนอกฐานที่ผู้ใช้ระบุ ให้ตรวจในระบบแยกได้หลังอนุมัติตั๋ว แต่ช่อง real-provider evidence ของกรณีนั้นยัง pending จนมี execution scope ที่อนุญาตจริง ไม่เปลี่ยนเลขโครงการ/ชื่อปลายทางเพื่อเติม matrix ให้ครบเอง

### Evidence และ provenance

- **Intended Business Policy — supported:** latest human resolutions ของ [D01]–[D09], [N] และ [P] เป็นเจ้าของ decisions ไม่ได้อนุมาน policy จากการมี if ใน source
- **Current Source — supported เฉพาะส่วนที่เปิด:** Working Tree inspection วันที่ 2026-11-18 ที่ HEAD baseline ข้างต้น ไม่ยืนยัน committed/deployed artifact ของทุก changed line และไม่ใช่ runtime PASS
- **Provider — partial overall:** [D06] บันทึก same-name PDF POST หนึ่งครั้งที่สำเร็จเมื่อ `2026-11-18T10:11:31.192Z`; old originals สามรายการคง 26,275 bytes/digest เดิม และ new original 667 bytes ตรง fixture เป็น historical scoped observation ไม่ทดสอบซ้ำในงานนี้ ไม่พิสูจน์ settlement ของ HTTP 500 ก่อนหน้า, DELETE isolation, every type/template/concurrency หรือ deployed semantic revision
- **Canonical Markdown Snapshot:** local owner docs ด้านล่างเป็นหลักฐานที่เปิดอ่าน ไม่ใช่ Production Knowledge publication Snapshot revisions ตรวจด้วย HEAD + Working Tree SHA-256 ในตาราง ไม่สร้าง Stable Document ID เอง
- **Hindsight:** session recall `retrieved` เวลา 2026-11-18 14:37 UTC ใช้นำทางเท่านั้น ไม่ยืนยันว่าเป็น Bank `pdms-knowledge` การ discovery bank นี้ด้วย `types:["world"]`, `budget:"low"` เป็น `skipped`: เครื่องมือ recall ที่มีไม่มี bank/types/budget selector; ไม่ใช่ failed recall หรือ successful bank retrieval ไม่มี `docs/knowledge/` ใน checkout ที่ค้น เอกสาร Hindsight จึงขาด `document_id`, `chunk_id`, `source_path`, `stable_document_id`, `source_revision`/`source_revisions` ใช้ local Markdown และ current source แยกต่างหาก ไม่มีการเขียน bank ใด

#### Canonical snapshot revisions

SHA-256 ต่อไปนี้ระบุ Working Tree snapshot ที่ใช้ ไม่ใช้ snapshot tags ของเครื่องมือเป็น source revision:

| Ref | Canonical owner / ส่วนที่ใช้ | SHA-256 |
| --- | --- | --- |
| M | Safety map / index และ scope | `479f522af52482500e2c9b8c252414e9ed4d4f5ec30dececf26446f8ab5d8693` |
| N | Naming spec / Implementation Decisions และ Testing Decisions | `53176678377f26b3861bc00458dd320b920622d0e3ce7d71a13b64efe9400444` |
| D01 | Resource independence / latest same-base amendment | `917e8d4e2ecd0f5abca790bf107a74390899104ac583e4573d987fa1cb3ad71c` |
| D02 | Filename / latest Resolution ใช้ชื่อฐานซ้ำ | `ed4d58cce3946e4b69738ac096f398cf3c6678bc713d7f0d02c4574564ca17fb` |
| D03 | Existing aliases/recovery / Resolution Q1–Q3 | `176a665e1ca74c77b238190c6b443f85fde4a65a5b4f95b6dad468a0ff0efe24` |
| D04 | Native support / Resolution และ final-row amendment | `3080d276e02beb053bfabac507442fd0ae9e89f1d2bee7b972bda5cf62f8487f` |
| D05 | Final row / latest minimum-one-row Resolution | `3a742c2c9d1f6e8a5c55501370374ea47ccb6d642cbf8ae27295019aa7b68cb4` |
| D06 | Settlement / scoped live sample และ two-layer Resolution | `99457b1018cadd350eb57b7b4b8b9b38fd863c4008003fffefcaa00394b7cc44` |
| D07 | Navigation / final loading-policy Resolution | `5e792eca67065041cf053aea19c69ef87f9ffb3b82ae8768a32566b72f741945` |
| D08 | Type/size / latest per-slot Resolution ที่ลด scope | `1dcbde551d043aaff67b925572680f74d40c2de44c234fdf21f8170907c6bfa0` |
| D09 | Guards / final Q3-Q4 classification Resolution | `91b9edf68a22e74465efdc90c22239c5f8fe5a73b4d1c8b372466519d95ba3d5` |
| P | Planning / ทบทวน HOLD และ latest naming summary | `2c99cc52cab17b4a68bd999ce98644f0e69b76613e484125a4664985f68a8b0c` |
| G | CONTEXT / domain vocabulary และ existing invariants | `c80a46b1484a79bc6dda6d91f06b82e4617380cb51aa04304110f83967ba9e03` |
| R | Provider research / supplemental document และ scoped duplicate-name evidence | `b4617ed3fd2eecb8fee1a421e56aaec758977c137d857bb1ade2634ee5476a98` |
| ADR3 | Accepted project-name choices | `a4140b34e65ea402520c892b228d714a9201f809d7f04677a32f39f1b28a4a01` |
| ADR4 | Accepted scalar result filters | `67952e0d91f38d119cee786e47a263e2068c5b0e68ba92af8db08bb66b46658e` |

#### Source และ test register

- [T1: Existing HTTP attachment consumer seam](../../apps/server/test/http/ecm-scalar-save-submit.test.ts): actual server/provider fixture; template scalar/Correction, original retrieval, table rows, suffix-policy cases, checkpoint/unknown/restart/reference/deletion behavior ต้องปรับเฉพาะ contracts ที่ superseded ไม่ยกผลเก่ามาเป็น acceptance ใหม่
- [T2: Submission history](../../apps/server/test/http/submission-history.test.ts): existing immutable history/selected revision consumer regressions
- [A: Historical acceptance matrix](../ecm-storage-templates/acceptance-matrix.md): prior integration/native/BATCH results พร้อม scope/revision ของตน ไม่ใช่ผลใหม่บน baseline นี้
- [Table audit](../ecm-storage-templates/table-upload-behavior-audit.md): 64-case snapshot บน `0a12d91a5b72d4470ae9ceed1c3d4845d2103ced` พร้อม Working Tree/amendments ไม่ใช่ current native/Production verification
- [Authoring HTTP seam](../../apps/server/test/http/ecm-attachment-authoring.test.ts), [legacy PoC HTTP seam](../../apps/server/test/http/ecm-legacy-poc.test.ts), [spreadsheet authoring](../../apps/server/test/http/spreadsheet-authoring.test.ts) และ [column persistence](../../apps/server/test/http/spreadsheet-column-persistence.test.ts): prior art สำหรับ trusted workbook/config/button/old-contract behavior
- [Native runtime fixture](../../apps/server/test/spreadsheet-runtime/runtime-fixture.ts) และ [builder runtime tests](../../apps/server/test/spreadsheet-runtime/builder.test.ts): ใช้ช่วยตรวจ row/builder regressions แต่ไม่แทน actual browser controls/gestures
- [Pending host UI tests](../../apps/web/test/ui/upload-poc-pending.test.tsx), [Fill UI tests](../../apps/web/test/ui/excel-fill.test.tsx), [Correction UI tests](../../apps/web/test/ui/correction-preview.test.tsx) และ [reconnect tests](../../apps/web/test/ui/editor-reconnect.test.tsx): reuse component/protocol coverage ไม่ใช้ mock router/editor เป็น proof ของ beforeunload/native loading
- [Plugin spreadsheet controls](../../apps/onlyoffice-plugin/src/spreadsheet.js), [plugin operations](../../apps/onlyoffice-plugin/src/operations.js), [Fill route](../../apps/web/src/routes/forms/$publicId/fill.tsx), Correction route และ OnlyOfficeEditor เป็น affected UI callers; provider fixtures อยู่ใน existing HTTP suite ต้องแยก create-new กับ deliberate alias/unknown models ไม่เปลี่ยน fake เพื่อซ่อน conflict ไม่มี dependency/config flag/schema/export layer ใหม่เป็น requirement; ปรับเฉพาะ shared types/exports ที่ได้รับผลจริง
- [Workflow maintenance](../../docs/agents/system-workflow.md): เมื่อมี code/integration change ต้องอัปเดต system-map content, build, actual visual inspection และ check พร้อม normal code checks; งานสเปกนี้ไม่เปลี่ยน implemented system flow จึงไม่ refresh generated guide ให้ดูเหมือนผ่าน behavior ใหม่

[M]: ../ecm-attachment-safety/map.md
[N]: ../ecm-attachment-safety/spec.md
[D01]: ../ecm-attachment-safety/issues/01-provider-independent-resources.md#amendment--2026-11-18--เปลี่ยนแผนหลักฐานเป็นชื่อฐานซ้ำตามคำตอบล่าสุด
[D02]: ../ecm-attachment-safety/issues/02-external-filename-collisions.md#resolution--2026-11-18--pyw1tt--ใช้ชื่อฐานซ้ำและแยกไฟล์ด้วย-receipt
[D03]: ../ecm-attachment-safety/issues/03-existing-aliases-recovery.md#resolution--2026-11-18--pyw1tt--เห็นด้วยกับ-q1-ถึง-q3
[D04]: ../ecm-attachment-safety/issues/04-native-table-editing-support.md#resolution--2026-11-18--pyw1tt--อนุมัติ-support-matrix-และ-guard-policy
[D05]: ../ecm-attachment-safety/issues/05-final-row-mapping.md#resolution--2026-11-18--pyw1tt--ทุกฟอร์ม-excel-ต้องเหลืออย่างน้อยหนึ่ง-row
[D06]: ../ecm-attachment-safety/issues/06-unknown-settlement-contract.md#resolution--pyw1tt--อนุมัติแผนหลักฐานสองชั้น
[D07]: ../ecm-attachment-safety/issues/07-pending-navigation-warning.md#resolution--pyw1tt--อนุมัติ-navigation-และ-loading-policy
[D08]: ../ecm-attachment-safety/issues/08-provider-type-size-capacity.md#resolution--pyw1tt--อนุมัติแผนชนิดไฟล์และขนาดต่อช่อง
[D09]: ../ecm-attachment-safety/issues/09-duplicate-name-guard-policy.md#resolution--2026-11-18--pyw1tt--guard-และคำเตือนที่จำแนกได้
[P]: ../ecm-storage-templates/planning.md#ทบทวน-hold-หลังปิด-safety-map
[G]: ../../CONTEXT.md
[R]: ../ecm-storage-templates/provider-contract-research.md#supplemental-user-provided-api-document--2026-11-18
[ADR3]: ../../docs/adr/0003-pdms-project-name-choices.md
[ADR4]: ../../docs/adr/0004-results-filters-use-scalar-field-tags.md
[T1]: ../../apps/server/test/http/ecm-scalar-save-submit.test.ts
[T2]: ../../apps/server/test/http/submission-history.test.ts
[A]: ../ecm-storage-templates/acceptance-matrix.md

### Implementation disposition — 2026-11-19

- งานเดิมทั้ง branch ถูกเก็บก่อนพัฒนาที่ `838056b1d682fd40623d5db029ad5a1e7c89ad96`; implementation อยู่บน `feat/ecm-attachment-safety-implementation` โดยไม่แก้หรือใช้แทน 9 Wayfinder tickets เดิม
- Source01–05รวมแล้ว Application baselineล่าสุด `c91472d`;01/02/04/05เป็น ready-for-human ส่วน03/06ยัง needs-info ตาม native support matrix ที่พิสูจน์ได้ ไม่ประกาศสเปก accepted หรือเปลี่ยน policy เพื่อปิดช่องที่ยังไม่ตรวจ
- [Acceptance report](acceptance-report.md) และ [native supplement N09–N18](acceptance/06-native-final/report.md) แยก revision, actual HTTP/native/browser, before/after bug proof, source-only/unit evidence, partial/unverified และ remaining risks ไว้ชัดเจน ผลเก่าไม่ถูก relabel เป็นผล source ใหม่
- Provider07/08, original-request settlement09, old-data10 และ human acceptanceยัง HOLD ตาม prerequisites ของตน แม้ local suitesผ่าน ไม่เพิ่ม byte-comparison/aggregate-capacity workload และไม่ถือ teardown ระบบจำลองเป็น provider DELETE/finality evidence
