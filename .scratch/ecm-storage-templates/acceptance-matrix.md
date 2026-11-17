# Storage Templates acceptance matrix

Canonical acceptance traceability for [spec](spec.md) and tickets01–08. Prepared 2026-11-17; final review and ticket closure belong to integration owner. No checkbox or test count alone establishes acceptance.

## Status and evidence rules

- **supported**: named observed evidence supports the stated claim at its recorded source revision.
- **partial**: local evidence exists, but integrated native, provider, human or final gate evidence is still missing.
- **insufficient**: this acceptance run has no observed evidence.
- **HOLD release**: provider all-type/boundary, same-identity overwrite/no-extra-DELETE, uncertain upload/DELETE settlement and deployed revision remain unverified. Local implementation is not provider approval.
- Final native evidence uses only delivery integration production source `90b9e9b4235629a876343a5b8bd81d3e8ab2e2d8`, after explicit SOURCE READY. Later integration `6ae84f9` changes tests/docs only. Apps tree at gate `7ddb296313f3a3dd1c1f39a1182bf540c4eafd38`; packages tree `3d90ff605ceb8cca67db82dee43dff3b82159707`. No08 production edits.

## Evidence register

| ID | Evidence and source revision | Scope / limit |
| --- | --- | --- |
| E01 | [01 Comments](issues/01-admin-storage-template-crud.md#comments), integration01 `03c49064c5d1327f322bf85dc14880878d8e83b4` | Persisted HTTP catalog/auth/races plus actual Admin keyboard CRUD on earlier source; not final native run. |
| E02 | [02 Comments](issues/02-authoring-publish-and-duplicate.md#comments), integration02 `1d23d50a9bbc4b4ae37014b3c2ed358b50272b7b` | HTTP publication/snapshot races, real scalar/table popup, no-year publish and duplicate; earlier source. |
| E03 | [03 Comments](issues/03-scalar-template-upload-and-recovery.md#comments), integrated regression E05 | Shared scalar/receipt/ownership/unknown-operation HTTP and prior native save/reopen/replace; no live settlement proof. |
| E04 | [04 Comments](issues/04-dcm-original-reuse-on-number-change.md#comments), source resolver merge `1ec9e7a7807ea133347081aa85e788a5afb68db2` | Exact-byte bounded trusted original flow; parent integrated native B reuse and single live PDF read; not all-type live evidence. |
| E05 | [05 Comments](issues/05-table-template-attachment-lifecycle.md#comments), integration `d399a810f89cede072d621cf3a3b94202ce80b9c` | Parent139/139 combined scalar/table; physical-row native proof on child source, not substitute final integrated run. |
| E06 | [06 Comments](issues/06-correction-frozen-contract-and-history.md#comments), child source base `d399a810f89cede072d621cf3a3b94202ce80b9c`, merged `e1ecca1448415a260824c5a5f3df78af0d69d311` | Frozen legacy/new Correction and selected original/Correction/older-Correction6 XLSX+6 PDF. Automatic next-Draft POST /start blocked only after real Submit; not uninterrupted default flow. |
| E07 | [07 Comments](issues/07-response-deletion-and-shared-identity-follow-up.md#comments), integration `6c0ef6fc95a126f190e17348c9392f366f9d2bf6` | Parent20 integrated HTTP cases; earlier native shared B preservation/deletion/persistent warning. |
| E08 | Actual delivery-source Admin/native/role/export/deletion/unknown-hold acceptance, production `90b9e9b4235629a876343a5b8bd81d3e8ab2e2d8`; [observations](#final-integrated-native-evidence) | Real ONLYOFFICE SDK, external pickers and disk-backed Files; local provider double only. Disclosed post-Submit next-round-only isolation; not uninterrupted default Submit→Correction. |
| LIVE | [Spec authorized sample and original-byte probe](spec.md#authorized-dcm-runtime-sample--2026-11-17), provider semantic/deployed revision missing | Parent-only synthetic629-byte PDF, hash `4293a5cdab0808afc75f3e0e985f6f3cb5c7cfd457f9bb094d4c178375a8e21d`; one upload, exact read, no live DELETE/overwrite. |
| ROOT | Parent-reported integration `6ae84f9`, production90b: root44-source lint/format, forced types5/5 and build3/3; UI267/19, plugin312, spreadsheet116/18; all39 HTTP suites503 distinct tests exercised | Default465 passes/38 optional skips plus enabled40 passes, with2 already-covered cases de-duplicated. Initial UI timeout cause remains unproven; corrected test DTO/fixture isolation and callback environment recorded by parent. Generated workflow/rendered-guide and final two-axis closure remain parent-owned. |

## User stories (112 individual mappings)

Each numbered row identifies the exact spec story. Supporting evidence combines its owner seam/source with E08 final native surfaces and ROOT integrated checks; it does not claim every automated failure permutation was repeated manually. External acceptance and final review remain separate.

| Story | Requirement | Owner evidence | Status / outstanding gate |
| --- | --- | --- | --- |
| 1 | a Storage Template page in Admin navigation | E01 + E08 + ROOT | supported local; human release review pending |
| 2 | category choices loaded through Folio's backend | E01 + E08 + ROOT | supported local; human release review pending |
| 3 | category `type` displayed as the document heading | E01 + E08 + ROOT | supported local; human release review pending |
| 4 | category `id` used as the relationship key | E01 + E08 + ROOT | supported local; human release review pending |
| 5 | to filter Storage Templates by the selected category ID | E01 + E08 + ROOT | supported local; human release review pending |
| 6 | an explicit empty state for categories without templates | E01 + E08 + ROOT | supported local; human release review pending |
| 7 | to create a `template_name` under a selected category | E01 + E08 + ROOT | supported local; human release review pending |
| 8 | names rejected when already present anywhere in the catalog | E01 + E08 + ROOT | supported local; human release review pending |
| 9 | concurrent duplicate creates rejected consistently | E01 + E08 + ROOT | supported local; human release review pending |
| 10 | blank or unsafe template names rejected with a useful error | E01 + E08 + ROOT | supported local; human release review pending |
| 11 | names preserved without guessed normalization | E01 + E08 + ROOT | supported local; human release review pending |
| 12 | to edit a template name | E01 + E08 + ROOT | supported local; human release review pending |
| 13 | to move a template to another category | E01 + E08 + ROOT | supported local; human release review pending |
| 14 | both category lists refreshed after a move | E01 + E08 + ROOT | supported local; human release review pending |
| 15 | confirmation before catalog deletion | E01 + E08 + ROOT | supported local; human release review pending |
| 16 | Cancel or Escape to leave the catalog unchanged | E01 + E08 + ROOT | supported local; human release review pending |
| 17 | deleted entries removed from future choices | E01 + E08 + ROOT | supported local; human release review pending |
| 18 | catalog edits and deletions not to change DCM files or templates | E01 + E08 + ROOT | supported local; human release review pending |
| 19 | failed catalog mutations to retain my input and existing data | E01 + E08 + ROOT | supported local; human release review pending |
| 20 | loading, empty and error states to remain distinct | E01 + E08 + ROOT | supported local; human release review pending |
| 21 | catalog-management APIs denied to my role | E01 + E08 + ROOT | supported local; human release review pending |
| 22 | catalog-management APIs denied to my role | E01 + E08 + ROOT | supported local; human release review pending |
| 23 | the existing Excel attachment popup reused | E02 + E08 + ROOT | supported local; human release review pending |
| 24 | to choose category before Storage Template | E02 + E08 + ROOT | supported local; human release review pending |
| 25 | categories without templates unavailable for attachment selection | E02 + E08 + ROOT | supported local; human release review pending |
| 26 | changing category to clear an incompatible template selection | E02 + E08 + ROOT | supported local; human release review pending |
| 27 | moving or deleting the last template reflected when choices reload | E02 + E08 + ROOT | supported local; human release review pending |
| 28 | confirmation disabled until both choices are valid | E02 + E08 + ROOT | supported local; human release review pending |
| 29 | server validation of category/template relationships | E02 + E08 + ROOT | supported local; human release review pending |
| 30 | stale selections rejected if the catalog changes before save | E02 + E08 + ROOT | supported local; human release review pending |
| 31 | canceling the popup to preserve the current Field and button | E02 + E08 + ROOT | supported local; human release review pending |
| 32 | the saved category and template visible when reopening settings | E02 + E08 + ROOT | supported local; human release review pending |
| 33 | scalar attachment Fields to store individual template choices | E02 + E08 + ROOT | supported local; human release review pending |
| 34 | one saved category/template choice shared by a table attachment column | E02 + E08 + ROOT | supported local; human release review pending |
| 35 | automatic Tags, editable labels and requiredness preserved | E02 + E08 + ROOT | supported local; human release review pending |
| 36 | stable binding and native saved-button proof preserved | E02 + E08 + ROOT | supported local; human release review pending |
| 37 | dirty-state and navigation guards preserved during configuration writes | E02 + E08 + ROOT | supported local; human release review pending |
| 38 | incomplete attachment configuration saved in Template Draft | E02 + E08 + ROOT | supported local; human release review pending |
| 39 | publication blocked for missing, deleted or stale template mappings | E02 + E08 + ROOT | supported local; human release review pending |
| 40 | new-mode publication to require one scalar root `docs_number` Field but not `fiscal_year` | E02 + E08 + ROOT | supported local; human release review pending |
| 41 | publication not to require a User-entered document number | E02 + E08 + ROOT | supported local; human release review pending |
| 42 | saved valid mappings publishable without a mandatory live category request | E02 + E08 + ROOT | supported local; human release review pending |
| 43 | category ID, template name and storage mode frozen at publication | E02 + E08 + ROOT | supported local; human release review pending |
| 44 | published settings immutable | E02 + E08 + ROOT | supported local; human release review pending |
| 45 | duplication to produce a new Form and share link | E02 + E08 + ROOT | supported local; human release review pending |
| 46 | duplication to copy template/configuration but not Responses or files | E02 + E08 + ROOT | supported local; human release review pending |
| 47 | duplicated legacy Forms to require explicit current Storage Template selection before new-mode publication | E02 + E08 + ROOT | supported local; human release review pending |
| 48 | original Forms, saved Drafts and historical answers unchanged by catalog maintenance | E02 + E08 + ROOT | supported local; human release review pending |
| 49 | existing category-mode Published Templates to keep their upload contract | E02 + E08 + ROOT | supported local; human release review pending |
| 50 | new-mode attachments to use my root `docs_number` | E03 + E08 + ROOT | supported local; human release review pending |
| 51 | `template_name` supplied by the published attachment configuration | E03 + E08 + ROOT | supported local; human release review pending |
| 52 | attachments usable without a `fiscal_year` Field in new mode | E03 + E08 + ROOT | supported local; human release review pending |
| 53 | existing year answers and required Field rules preserved | E03 + E08 + ROOT | supported local; human release review pending |
| 54 | changing only `fiscal_year` in new mode not to upload unchanged files | E03 + E08 + ROOT | supported local; human release review pending |
| 55 | file selection to remain pending until Save Draft or Submit | E03 + E08 + ROOT | supported local; human release review pending |
| 56 | original bytes uploaded with only `template="1"` and `documentFile` | E03 + E08 + ROOT | supported local; human release review pending |
| 57 | generated filenames to use document number and configured template name | E03 + E08 + ROOT | supported local; human release review pending |
| 58 | the original extension and its casing preserved | E03 + E08 + ROOT | supported local; human release review pending |
| 59 | extensionless files to remain extensionless | E03 + E08 + ROOT | supported local; human release review pending |
| 60 | unsafe document-number or filename input rejected rather than rewritten | E03 + E08 + ROOT | supported local; human release review pending |
| 61 | all file types accepted within the existing size limits | E03 + E08 + ROOT | partial overall; local evidence supported, LIVE / human release HOLD |
| 62 | files from 0 through 10,000,000 bytes accepted inclusively | E03 + E08 + ROOT | partial overall; local evidence supported, LIVE / human release HOLD |
| 63 | password-protected files retained without password prompts or conversion | E03 + E08 + ROOT | partial overall; local evidence supported, LIVE / human release HOLD |
| 64 | invalid selected files rejected even during Draft save | E03 + E08 + ROOT | supported local; human release review pending |
| 65 | missing required attachments allowed in Draft but rejected at Submit | E03 + E08 + ROOT | supported local; human release review pending |
| 66 | a saved zero-byte attachment to count as present | E03 + E08 + ROOT | supported local; human release review pending |
| 67 | unchanged attachments reused without upload or unnecessary ECM login | E03 + E08 + ROOT | supported local; human release review pending |
| 68 | a changed document number to reuse my saved original file automatically | E04 + E08 + ROOT | supported local; human release review pending |
| 69 | a newly selected replacement to take precedence over saved-original retrieval | E04 + E08 + ROOT | supported local; human release review pending |
| 70 | original retrieval restricted to a committed reference owned by the correct Response and account | E04 + E08 + ROOT | supported local; human release review pending |
| 71 | exact original bytes retrieved from DCM rather than viewer HTML, previews or converted documents | E04 + E08 + ROOT | partial overall; local evidence supported, LIVE / human release HOLD |
| 72 | failed original retrieval to stop before external writes and retain saved data | E04 + E08 + ROOT | supported local; human release review pending |
| 73 | DCM to remain the sole original-file store | E04 + E08 + ROOT | partial overall; local evidence supported, LIVE / human release HOLD |
| 74 | the actual upload receipt saved as the canonical URL/token pair | E03 + E08 + ROOT | supported local; human release review pending |
| 75 | object-shaped valid receipts accepted without upload replay | E03 + E08 + ROOT | supported local; human release review pending |
| 76 | malformed or uncertain receipts treated as unknown outcomes | E03 + E08 + ROOT | supported local; human release review pending |
| 77 | replacing A with B at the same provider identity not to DELETE that identity | E03 + E08 + ROOT | partial overall; local evidence supported, LIVE / human release HOLD |
| 78 | separate old files deleted only after B commits and reference checks pass | E03 + E08 + ROOT | supported local; human release review pending |
| 79 | successful B retained when old-file deletion fails | E03 + E08 + ROOT | supported local; human release review pending |
| 80 | a persistent warning while A deletion is unconfirmed | E03 + E08 + ROOT | supported local; human release review pending |
| 81 | protected destinations checked before upload | E03 + E08 + ROOT | supported local; human release review pending |
| 82 | uncertain in-place overwrite reported honestly | E03 + E08 + ROOT | partial overall; local evidence supported, LIVE / human release HOLD |
| 83 | repeated clicks, reloads and lost responses resolved through the original Operation | E03 + E08 + ROOT | supported local; human release review pending |
| 84 | duplicate-name and shared-URL limitations stated before implementation and release | E03 + E08 + ROOT | partial overall; local evidence supported, LIVE / human release HOLD |
| 85 | durable attempt, receipt and provider-identity evidence | E03 + E08 + ROOT | supported local; human release review pending |
| 86 | one attachment per scalar slot or physical table-row slot | E05 + E08 + ROOT | supported local; human release review pending |
| 87 | table attachment-only rows retained, including zero-byte files | E05 + E08 + ROOT | supported local; human release review pending |
| 88 | active table rows checked against all required columns | E05 + E08 + ROOT | supported local; human release review pending |
| 89 | fully empty table rows excluded from required checks | E05 + E08 + ROOT | supported local; human release review pending |
| 90 | physical gaps and multiple attachment columns mapped correctly | E05 + E08 + ROOT | supported local; human release review pending |
| 91 | supported row changes to preserve file references without upload | E05 + E08 + ROOT | supported local; human release review pending |
| 92 | unprovable row mappings rejected without discarding pending choices | E05 + E08 + ROOT | supported local; human release review pending |
| 93 | multi-file saves to expose only a complete canonical snapshot | E05 + E08 + ROOT | supported local; human release review pending |
| 94 | collisions across rows and slots handled without invented filename suffixes | E05 + E08 + ROOT | supported local; human release review pending |
| 95 | final Save Correction to use the selected Submission's frozen storage contract | E06 + E08 + ROOT | supported local; human release review pending |
| 96 | Correction reason, eligibility and requiredness enforced before upload | E06 + E08 + ROOT | supported local; human release review pending |
| 97 | Submission and older Correction references protected before an overwrite or deletion | E06 + E08 + ROOT | supported local; human release review pending |
| 98 | internal Correction workspace and project saves to avoid ECM writes | E06 + E08 + ROOT | supported local; human release review pending |
| 99 | pending files preserved across verified workspace transitions | E06 + E08 + ROOT | supported local; human release review pending |
| 100 | saved Drafts, Submissions and Corrections readable under existing permissions | E08 + E08 + ROOT | supported local; human release review pending |
| 101 | read-only views and exports to show the saved URL instead of an upload button | E08 + E08 + ROOT | supported local; human release review pending |
| 102 | exports to follow the selected revision rather than the latest file lookup | E08 + E08 + ROOT | supported local; human release review pending |
| 103 | provider URLs exported unchanged without separate token fields or service secrets | E08 + E08 + ROOT | supported local; human release review pending |
| 104 | broken historical links reported without substitution | E08 + E08 + ROOT | supported local; human release review pending |
| 105 | pending attachments to block exports that would imply they were saved | E08 + E08 + ROOT | supported local; human release review pending |
| 106 | ordinary unsaved Excel edits still downloadable when no attachment change is pending | E08 + E08 + ROOT | supported local; human release review pending |
| 107 | Response deletion to require existing permissions and confirmation | E07 + E08 + ROOT | supported local; human release review pending |
| 108 | whole-Response cleanup to protect surviving shared identities and history | E07 + E08 + ROOT | supported local; human release review pending |
| 109 | cleanup evidence and warnings to survive Response deletion | E07 + E08 + ROOT | supported local; human release review pending |
| 110 | archive to retain files and history | E07 + E08 + ROOT | supported local; human release review pending |
| 111 | labelled, keyboard-accessible controls and specific slot/row errors | E08 + E08 + ROOT | supported local; human release review pending |
| 112 | native-editor, export and authorized provider acceptance separated from simulated test results | E08 + E08 + ROOT | partial overall; local evidence supported, LIVE / human release HOLD |

## Ticket acceptance criteria (individual mappings)

Original criteria are retained verbatim, including compound requirements; an earlier checked box is not copied as final acceptance.

### Ticket 01

| AC | Requirement | Evidence | Status / missing proof |
| --- | --- | --- | --- |
| 01.01 | เพิ่ม persisted catalog ที่มี identity ภายใน, `template_name` และ numeric `document_category_id`; migration ใช้ isolated database และไม่ reset/เปลี่ยน Responses หรือไฟล์เดิม | E01 + E08 + ROOT | supported local; final review pending |
| 01.02 | Admin navigation เปิดหน้าจริงที่มี category select **หัวข้อเอกสาร**, persisted list/filter และ create/edit/delete controls ครบ ไม่ใช่ mock data หรือหน้า create/list อย่างเดียว | E01 + E08 + ROOT | supported local; final review pending |
| 01.03 | โหลด category ผ่าน backend/shared ECM auth เดิม ใช้ `type` แสดงผลและ `id` เป็นค่า/filter key; categories ที่ชื่อเหมือนกันแต่ ID ต่างกันไม่ถูกยุบรวม | E01 + E08 + ROOT | supported local; final review pending |
| 01.04 | Create บันทึกชื่อกับ category ID ที่ backend ตรวจจาก provider evidence ที่ใช้ได้ ปฏิเสธ arbitrary/unknown ID, blank/control/unsafe filename metadata โดยไม่ rewrite ชื่อเงียบ ๆ | E01 + E08 + ROOT | supported local; final review pending |
| 01.05 | `template_name` ไม่ซ้ำทั้ง catalog แม้คนละหมวด มี database uniqueness ป้องกัน concurrent create/update และคืน error ที่ Admin แก้ได้ | E01 + E08 + ROOT | supported local; final review pending |
| 01.06 | Update เปลี่ยนชื่อและหมวดที่ผูกได้จริง หลัง reload รายการหมวดเก่าและใหม่ตรงข้อมูลที่บันทึก ไม่เหลือ selection ที่ผิดหมวด | E01 + E08 + ROOT | supported local; final review pending |
| 01.07 | Delete มี confirmation พร้อม Cancel/Escape และ focus behavior ที่ใช้ keyboard ได้; cancel ไม่ mutate และยืนยันสำเร็จแล้วรายการหายจาก future choices | E01 + E08 + ROOT | supported local; final review pending |
| 01.08 | แยก loading, empty และ provider/API error ชัดเจน คงข้อมูล/ข้อความที่กำลังแก้เมื่อบันทึกล้มเหลว ไม่แสดงผลสำเร็จจาก optimistic state เพียงอย่างเดียว | E01 + E08 + ROOT | supported local; final review pending |
| 01.09 | Provider outage ไม่ล้าง saved catalog; เปลี่ยน category ต้องมี valid evidence ส่วนลบ local mapping ไม่ต้องเรียก DCM file mutation | E01 + E08 + ROOT | supported local; final review pending |
| 01.10 | Backend ทุก catalog-management action ตรวจ enabled Admin; direct User/Viewer/unauthenticated requests ถูกปฏิเสธโดยไม่ทำ ECM login/file writes แทนผู้ไม่มีสิทธิ์ | E01 + E08 + ROOT | supported local; final review pending |
| 01.11 | Browser/response/log evidence ไม่เปิดเผย service credentials/Bearer; ใช้ coordinator/token-renewal policy เดิม ไม่เพิ่ม cron/config/dependency | E01 + E08 + ROOT | supported local; final review pending |
| 01.12 | CRUD ไม่สร้าง/แก้/ลบ template/folder/category ใน DCM และไม่ upload/rename/re-upload/DELETE file ไม่เปลี่ยน Published Template หรือ canonical answers | E01 + E08 + ROOT | supported local; final review pending |
| 01.13 | Existing HTTP integration seam กับ isolated persistence/provider double พิสูจน์ persisted CRUD/filter, invalid IDs, global duplicates รวม race, permissions และไม่มี external file writes | E01 + E08 + ROOT | supported local; final review pending |
| 01.14 | Smoke หน้า Admin จริงครบ create → reload/filter → rename/move → cancel delete → confirm delete พร้อม empty/error และ keyboard paths ไม่ใช้ tests แทน actual UI proof | E01 + E08 + ROOT | supported local; final review pending |
| 01.15 | อัปเดต domain/workflow/system map ที่กระทบและตรวจด้วย scripts ของ repo ใน change นี้ ไม่อ้าง provider routing acceptance จากการสร้าง catalog สำเร็จ | E01 + E08 + ROOT | partial; owner prose/source checks supported, parent generated workflow/rendered-guide and final review pending |

### Ticket 02

| AC | Requirement | Evidence | Status / missing proof |
| --- | --- | --- | --- |
| 02.01 | เพิ่ม storage mode และ category/template metadata ใน Draft Field Rules และ published Manifest/Spreadsheet Contract ตาม lifecycle เดิม ไม่ใส่ routing metadata ใน placement-only Excel Binding | E02 + E08 + ROOT | supported local; final review pending |
| 02.02 | Existing Published Templates/Responses ระบุ legacy mode ได้โดยไม่เปลี่ยน saved values, request policy หรือ files และไม่เดา mode จากการมี `fiscal_year` | E02 + E08 + ROOT | supported local; final review pending |
| 02.03 | Existing external popup ให้เลือก category ก่อน template และแสดงเฉพาะ mappings ของ numeric category ID ที่เลือก User ไม่ได้สิทธิ์เลือกปลายทางและไม่มี template answer Tag ใหม่ | E02 + E08 + ROOT | supported local; final review pending |
| 02.04 | หมวดที่ไม่มีแม่แบบเลือกไม่ได้ เปลี่ยนหมวดแล้วล้าง incompatible template; โหลดใหม่หลังย้าย/ลบรายการสุดท้ายไม่คง option ผิดหมวด | E02 + E08 + ROOT | supported local; final review pending |
| 02.05 | Confirm ใช้ได้เมื่อทั้งคู่ valid; loading/error/empty ยืนยันไม่ได้ Cancel/Escape ไม่สร้าง/แก้ Field หรือ button และคืน focus ตาม interaction เดิม | E02 + E08 + ROOT | supported local; final review pending |
| 02.06 | Backend ตรวจ current mapping ID/category/name กับ catalog ปฏิเสธ forged, renamed, moved หรือ deleted selection ที่ stale แม้ UI เคยโหลดถูกต้อง | E02 + E08 + ROOT | supported local; final review pending |
| 02.07 | รักษา auto-tags, label/required edits, stable binding, native saved-button proof, lease/revision checks, authoring lock และ dirty/navigation guards ตลอด multi-step save | E02 + E08 + ROOT | supported local; final review pending |
| 02.08 | Scalar เก็บ choice ต่อ Field; table เก็บ choice ต่อ attachment column และใช้ร่วมทุกแถว ไม่สร้างตัวเลือกรายแถว | E02 + E08 + ROOT | supported local; final review pending |
| 02.09 | Template Draft บันทึก config ที่ยังไม่ครบได้โดยไม่ทิ้งงาน แต่ publish แบบใหม่ต้องเลือก current valid mapping ครบทุก attachment Field/column | E02 + E08 + ROOT | supported local; final review pending |
| 02.10 | New-mode publication ต้องมี exactly one scalar root `docs_number`; ไม่บังคับ `fiscal_year` จาก attachment prerequisite และไม่ต้องมี User-entered values ในต้นแบบ คง Field validation อื่นตามเดิม | E02 + E08 + ROOT | supported local; final review pending |
| 02.11 | Publish ตรวจ local catalog และ revision อย่าง race-safe ขณะแก้/ลบ mapping; ตรึง storage mode/category ID/template name ไม่ live lookup master มาเปลี่ยน published routing ภายหลัง | E02 + E08 + ROOT | supported local; final review pending |
| 02.12 | Saved valid mapping publish ได้เมื่อ category provider ล่มโดยไม่บังคับ live recheck; stale local mapping ต้องเลือกใหม่ ไม่ clear Draft หรือ silently follow rename | E02 + E08 + ROOT | supported local; final review pending |
| 02.13 | Catalog rename/move/delete หลัง publication ไม่แก้ Published Template, Responses, URL/token หรือ files; published attachment settings ไม่แก้ในที่เดิม | E02 + E08 + ROOT | supported local; final review pending |
| 02.14 | Duplicate ได้ Form และ share link ใหม่ คัดเฉพาะ template/configuration ไม่คัด Responses/answers/files และไม่ redirect/archive/delete ลิงก์ต้นฉบับ | E02 + E08 + ROOT | supported local; final review pending |
| 02.15 | สำเนาจาก legacy Form ต้อง explicitly เลือก current Storage Template ก่อน new-mode publication ไม่สร้าง mapping จาก category name โดยเดา; valid copied new-mode choice ยังตรวจ current catalog ก่อนเผยแพร่ | E02 + E08 + ROOT | supported local; final review pending |
| 02.16 | Existing HTTP authoring/publication seam พิสูจน์ server validation, snapshot isolation, rename/move/delete races, offline publication, no-year publication และ legacy/duplicate preservation | E02 + E08 + ROOT | supported local; final review pending |
| 02.17 | Smoke actual ONLYOFFICE popup ทั้ง scalar/table, cancel/confirm, save/reopen/publish และเปิด link ของสำเนาใหม่; ไม่ถือ plugin mock หรือ HTTP status อย่างเดียวเป็น native proof | E02 + E08 + ROOT | supported local; final review pending |
| 02.18 | อัปเดต affected bridge/API callers, fixtures และ workflow/domain/system-map documentation ใน change เดียวกัน ไม่เริ่ม upload จาก authoring/catalog/publish | E02 + E08 + ROOT | partial; owner prose/source checks supported, parent generated workflow/rendered-guide and final review pending |

### Ticket 03

| AC | Requirement | Evidence | Status / missing proof |
| --- | --- | --- | --- |
| 03.01 | เลือกไฟล์อย่างเดียวไม่ upload/delete; upload เฉพาะ explicit Save Draft/Submit ผ่าน existing Operation/checkpoint/native snapshot path ไม่เกิดจาก catalog, template save, export หรือ internal saves | E03 + E08 + ROOT | supported local; final review pending |
| 03.02 | New mode ใช้ trusted root `docs_number` และ frozen `template_name`; filename เป็น `<docs_number>-<template_name>.<original-extension>` คง casing/extension และ extensionless ไม่เติมนามสกุล ไม่เพิ่ม UUID/row/version suffix | E03 + E08 + ROOT | supported local; final review pending |
| 03.03 | Multipart ของ new mode มี `template="1"` กับ original-byte `documentFile` เท่านั้น ไม่มี year/number/category/ID/type แยก Legacy Published mode ยังใช้ request/filename เดิม | E03 + E08 + ROOT | supported local; final review pending |
| 03.04 | ไม่มี `fiscal_year` ก็ Save/Submit attachment ได้ใน new mode หาก Field rules อื่นผ่าน การแก้ปีอย่างเดียวไม่ upload unchanged files และไม่ลบปีหรือแก้ results-filter policy | E03 + E08 + ROOT | supported local; final review pending |
| 03.05 | ตรวจ unsafe filename/metadata, actual streamed file size และ canonical JSON budget ก่อน dispatch เท่าที่ตรวจได้ ไม่ rewrite input หรือข้าม validation เพื่อให้บันทึกผ่าน | E03 + E08 + ROOT | supported local; final review pending |
| 03.06 | รับทุกชนิดไฟล์รวม 0 และ 10,000,000 bytes, password-protected และ extensionless; oversized/invalid selected file ล้มแม้ Save Draft และ errors ระบุ slot | E03 + E08 + ROOT | supported local; final review pending |
| 03.07 | Draft ขาด required attachment ได้ Submit ต้องมี required file; saved zero-byte object นับว่ามีไฟล์ ไม่ใช้ pending filename เป็น durable presence | E03 + E08 + ROOT | supported local; final review pending |
| 03.08 | Valid object receipt ของ mode ใหม่และ legacy one-item-array receipt ถูกตรวจ success/safe URL/token เก็บคู่จาก original POST ไม่ใช้ search/latest/client receipt fallback; null/multiple/unsafe/malformed receipt ไม่ถูกทำให้สำเร็จปลอม | E03 + E08 + ROOT | supported local; final review pending |
| 03.09 | Ledger ไม่มี fiscal year ได้สำหรับ new modeโดยไม่ใส่ปีปลอม หลักฐาน operation/attempt แต่ละครั้งคงอยู่และ same-token receipt ผูกกับ proven canonical provider identity ได้ ไม่ reject หลัง write หรือถอด uniqueness แบบเหมารวม | E03 + E08 + ROOT | supported local; final review pending |
| 03.10 | ก่อน dispatch ตรวจ trusted ownership/account/destination และ protected Draft/Submission/Correction/workspace/eligible Operation references พร้อม fencing กับ concurrent writes/reference/deletion ไม่พึ่ง token comparison หลัง provider เขียนแล้ว | E03 + E08 + ROOT | supported local; final review pending |
| 03.11 | Foreign-owner/history destination conflict หรือ identity ที่ยังพิสูจน์ความปลอดภัยไม่ได้หยุดก่อน write; duplicate-name acceptance ไม่ถูกใช้ข้าม guard นี้ | E03 + E08 + ROOT | supported local; final review pending |
| 03.12 | Save A → reopen → choose B → Submit สำเร็จบันทึก original receipt ของ B และ UI/read-only projection ใช้ URL ของ B; same-token/link overwrite ไม่ส่ง DELETE token นั้นซ้ำ | E03 + E08 + ROOT | supported local; final review pending |
| 03.13 | Distinct proven A/B identities ทำ cleanup A หลัง complete canonical B commit และไม่มี references เท่านั้น ตรวจ aliases ไม่ใช้เพียง token inequality เป็นหลักฐานว่าลบได้ | E03 + E08 + ROOT | supported local; final review pending |
| 03.14 | DELETE A ล้ม/unknown หลัง B commit ยังคง B completed/usable พร้อม persistent warning ว่า A อาจยังเปิดได้ ไม่ rollback B และ ordinary save ไม่ retry DELETE หรือล้าง warning | E03 + E08 + ROOT | supported local; final review pending |
| 03.15 | Same-identity overwrite ที่ external write สำเร็จแต่ Folio commit ล้ม/ไม่แน่ชัดต้องเก็บ durable intent/receipt/settlement evidence และ hold ที่เหมาะสม ไม่อ้าง A bytes ยังเดิม ไม่ DELETE shared current identity เป็น compensation | E03 + E08 + ROOT | supported local; final review pending |
| 03.16 | Multi-scalar save เปิดเผยเฉพาะ complete canonical snapshot; partial/unknown outcomes, late receipt, crash, stale callback และ lost response ใช้ original Operation recovery ไม่ resend/adopt/search fallback หรือ partial Submission | E03 + E08 + ROOT | supported local; final review pending |
| 03.17 | Unchanged saved files/metadata reuse references โดยไม่ upload/login ใหม่ การเปลี่ยน docs_number บน saved file ที่ไม่มี replacement ใช้ existing explicit retrieval error จนงาน 04 ครบ ไม่บังคับ reselectionหรือแสดงว่า reuse ใหม่สำเร็จแล้ว | E03 + E08 + ROOT | supported local; final review pending |
| 03.18 | Existing shared auth/12-hour renewal, authorization, trusted row-independent binding, worksheet protection และ JSON shape 262,144-byte limit คงเดิม ไม่มี originals ใน RustFS/DB หรือ secrets ใน workbook | E03 + E08 + ROOT | supported local; final review pending |
| 03.19 | Existing HTTP seam/provider double พิสูจน์ actual multipart bytes/fields, object/array receipts, same-token overwrite, protected destinations, duplicate/unknown admission, commit windows และ cleanup success/warning โดยใช้ deterministic barriers | E03 + E08 + ROOT | supported local; final review pending |
| 03.20 | Smoke actual scalar native flow ตั้งไฟล์ → Save Draft → reopen → replace → Submit รวม no-year Form, unchanged save และ same-identity no-extra-DELETE; สังเกต actual saved canonical URL ไม่ใช้ test count แทน | E03 + E08 + ROOT | supported local; final review pending |
| 03.21 | อัปเดต affected callers/fixtures/exports projection/recovery messaging และ system map ใน change นี้ เตือน duplicate-name/shared-URL limit ก่อนเริ่ม implementation และไม่อ้าง Production readiness | E03 + E08 + ROOT | partial; owner prose/source checks supported, parent generated workflow/rendered-guide and final review pending |

### Ticket 04

| AC | Requirement | Evidence | Status / missing proof |
| --- | --- | --- | --- |
| 04.01 | ระบุ supported provider download flow ที่เริ่มจาก `file_link` ของ original upload receipt และพิสูจน์ backend retrieval ของ exact original bytes ไม่พึ่ง undocumented private viewer/PDF.js routes | E04 + E08 + ROOT | supported local; final review pending |
| 04.02 | Server ใช้เฉพาะ committed canonical reference ที่ตรวจ Response, binding/slot, account, token/link และ expected size แล้ว; forged client URL/token, foreign account/owner หรือ stale reference ไม่ทำให้ fetch arbitrary source | E04 + E08 + ROOT | supported local; final review pending |
| 04.03 | เมื่อ docs_number เปลี่ยนและไม่มี replacement ระบบโหลดต้นฉบับอัตโนมัติแล้วส่ง original bytes ด้วย frozen template name/new number ไม่ขอให้ User เลือกไฟล์เดิมซ้ำ | E04 + E08 + ROOT | supported local; final review pending |
| 04.04 | Pending replacement มี precedence และไม่ถูกแทนด้วยไฟล์เก่า; unchanged และ year-only change ใน new modeไม่ fetch/upload/login โดยไม่จำเป็น ส่วน legacy year/number semantics คงเดิม | E04 + E08 + ROOT | supported local; final review pending |
| 04.05 | Viewer/redirect/download flow ต้องตรวจ URL/origin ทุก hop, credentials propagation, bounded stream/timeout, expected size และ errors ไม่ส่ง service credentials ออกนอก origin ที่อนุญาต | E04 + E08 + ROOT | supported local; final review pending |
| 04.06 | ไม่ถือ HTTP 200, matching Content-Length, MIME หรือ viewer เปิดได้เป็น proof ต้นฉบับ ปฏิเสธ viewer/error/converted preview ที่ไม่ใช่ original ขณะยังรองรับ original HTML ที่ User แนบจริง | E04 + E08 + ROOT | supported local; final review pending |
| 04.07 | Provider double ใช้ known original bytes/hash พิสูจน์ binary, text/HTML, image/document, encrypted/password-protected, extensionless, zero-byte และ 10,000,000-byte retrieval/re-upload ไม่แปลงไฟล์/นามสกุล | E04 + E08 + ROOT | supported local; final review pending |
| 04.08 | Redirect นอก trust policy, expired/unauthorized link, HTML viewer แทนต้นฉบับ, wrong size, oversized stream, timeout และ malformed response ทำให้หยุดก่อน external upload ใหม่และรักษา saved canonical data | E04 + E08 + ROOT | supported local; final review pending |
| 04.09 | ไม่ persist attachment originals ใน RustFS/DB/base64/workbook ไม่เพิ่ม fallback archive, force reselection, search download fallback หรือ automatic write retry | E04 + E08 + ROOT | supported local; final review pending |
| 04.10 | Saved B commit แล้วจึงทำ eligible distinct-identity A cleanup ตาม reference fencing; same identity/aliases ไม่ถูก DELETE เพื่อชดเชยการเปลี่ยนเลข | E04 + E08 + ROOT | supported local; final review pending |
| 04.11 | Failure หลัง external write ใช้ original Operation/identity evidence และ hold ของ 03 ไม่แกล้งว่า A bytes ถูก restore หรือนำ receipt ที่ยังไม่ commit ไปใช้รอบใหม่ | E04 + E08 + ROOT | supported local; final review pending |
| 04.12 | Existing HTTP seam พิสูจน์ User เปลี่ยนเลข → save → reload receipt/document → Submit พร้อม actual original bytes ที่ provider ได้รับ และ failure ที่ไม่มี upload ใหม่ | E04 + E08 + ROOT | supported local; final review pending |
| 04.13 | Smoke native Draft ที่ reopen แล้วเปลี่ยน docs_number โดยไม่เปิด picker พร้อมตรวจ persisted URL และ bytes ของไฟล์ที่ได้ ไม่ใช้ direct helper test แทน User path | E04 + E08 + ROOT | supported local; final review pending |
| 04.14 | Before release ต้องมี authorized DCM runtime evidence ของ supported download flow และชนิด/ขอบเขตไฟล์ที่กำหนด ใช้ synthetic files และไม่เรียก live API หากยังไม่ได้รับอนุญาตรอบนั้น | E04 + E08 + ROOT + LIVE | partial; single-PDF LIVE evidence only, all-type/boundary/overwrite/settlement/deployed revision HOLD |
| 04.15 | หากหา supported flow/contract ไม่ได้ ให้ทำ reachable local investigation/guards จนครบ บันทึก exact missing prerequisite และ HOLD delivery/release ของเส้นทางนี้ ไม่ปิดตั๋วว่าเสร็จ ไม่เปลี่ยน DCM-only หรือเปิดคำถามข้อ 1 ซ้ำ | E04 + E08 + ROOT | supported local; final review pending |
| 04.16 | อัปเดต affected original-reuse callers/fixtures และ workflow/system-map พร้อมแยก simulated proof จาก actual provider acceptance | E04 + E08 + ROOT | partial; owner prose/source checks supported, parent generated workflow/rendered-guide and final review pending |

### Ticket 05

| AC | Requirement | Evidence | Status / missing proof |
| --- | --- | --- | --- |
| 05.01 | Table column ใช้ frozen category/template/mode เดียวกันทุกแถวและหนึ่งไฟล์ต่อ physical-row slot ไม่เปิดให้ User เลือก template รายแถว | E05 + E08 + ROOT | supported local; final review pending |
| 05.02 | ใช้ trusted physical-row position และ published binding ไม่ใช้ compact JSON array index แทน `row_index`; blank gaps และ multiple attachment columns ไม่ cross-wire ไฟล์ | E05 + E08 + ROOT | supported local; final review pending |
| 05.03 | Attachment-only rows รวม saved/selected zero-byte files ถูกเก็บเป็น active rows และ Submit ตรวจ required ordinary/attachment columns อื่นทั้งหมด | E05 + E08 + ROOT | supported local; final review pending |
| 05.04 | Fully empty rows ที่ไม่มี input/file ไม่ถูกบังคับแนบเพียงเพราะมีปุ่ม; invalid selected file ยังทำให้ Draft save ไม่ผ่าน | E05 + E08 + ROOT | supported local; final review pending |
| 05.05 | Save Draft → reopen → replace/remove/cancel → Submit แสดง canonical receipt/URL ของ slot ที่ถูกต้องโดยใช้ native picker/buttons เดิม | E05 + E08 + ROOT | supported local; final review pending |
| 05.06 | Existing supported append/delete-selected รักษา references และ pending Files ด้วย verified document/row mapping โดยไม่ upload/delete จาก internal save | E05 + E08 + ROOT | supported local; final review pending |
| 05.07 | Unsupported/stale/ambiguous mapping หยุดก่อนทำข้อมูลหรือ pending selections หาย ไม่เพิ่ม stable row ID/Tag ใหม่เพื่อหลบข้อจำกัด | E05 + E08 + ROOT | supported local; final review pending |
| 05.08 | วางแผน duplicate destinations ทั้ง batch ก่อน dispatch และตรวจ owner/history/reference/admission fencing ไม่รอ token collision หลังเขียนแล้วจึงค่อยป้องกัน | E05 + E08 + ROOT | supported local; final review pending |
| 05.09 | คง filename grammar ที่ไม่มี row/version suffix ยอมรับเพียงข้อจำกัดชื่อซ้ำที่ planning อนุมัติ ไม่รับรอง independence หาก provider reuse identity | E05 + E08 + ROOT | supported local; final review pending |
| 05.10 | Same-identity receipt ไม่ถูก DELETE จาก replacement/canceled-batch cleanup และไม่สร้าง independent-version evidence ปลอม Foreign/protected destination conflicts หยุดก่อน write | E05 + E08 + ROOT | supported local; final review pending |
| 05.11 | หลายไฟล์ส่งตาม existing sequential plan และ commit document/JSON/references เป็น complete snapshot เดียว Failure กลาง batch ไม่มี partial Submission และไม่เริ่มไฟล์ถัดไปโดยเดาผล | E05 + E08 + ROOT | supported local; final review pending |
| 05.12 | Unknown upload/overwrite, receipt collision, late response และ commit failure ใช้ durable evidence/hold ของ 03 ไม่ rollback external bytes, retry write หรือ DELETE shared identity | E05 + E08 + ROOT | supported local; final review pending |
| 05.13 | Errors ระบุ column/slot และ physical row ที่ User แก้ได้โดยไม่เผย secrets คง size/JSON/requiredness/security boundaries เดิม | E05 + E08 + ROOT | supported local; final review pending |
| 05.14 | Existing HTTP seam พิสูจน์ physical gaps, multiple columns, attachment-only zero-byte rows, empty/active requiredness, row shifts, duplicate destinations และ partial/unknown batch โดย provider bytes/receipts จริงของ test double | E05 + E08 + ROOT | supported local; final review pending |
| 05.15 | Smoke actual ONLYOFFICE ตั้ง template ให้คอลัมน์ แนบอย่างน้อยสอง physical rows ที่มี gap บันทึก/เปิด/ส่งและตรวจ persisted URLs; แสดง duplicate-name limitation ตามผลจริง | E05 + E08 + ROOT | supported local; final review pending |
| 05.16 | เมื่อรวม 04 แล้ว table docs_number change ใช้ shared trusted-original flow ครบทุก saved slot ไม่สร้าง table-specific storage/cache หรือ download bypass | E05 + E08 + ROOT | supported local; final review pending |
| 05.17 | อัปเดต affected table consumers/fixtures และ workflow/system map โดยไม่เปลี่ยน legacy published table behavior หรือข้อมูลเดิม | E05 + E08 + ROOT | partial; owner prose/source checks supported, parent generated workflow/rendered-guide and final review pending |

### Ticket 06

| AC | Requirement | Evidence | Status / missing proof |
| --- | --- | --- | --- |
| 06.01 | Correction ใช้ storage mode/category/template snapshot ของ Submission ที่แก้ ไม่อ่าน master ปัจจุบันมา redirect routing; legacy Correction คง legacy contract | E06 + E08 + ROOT | supported local; final review pending |
| 06.02 | ตรวจ Admin authorization, reason, currently submitted/latest eligibility, base revision, capability/lease และ requiredness ตามเดิมก่อน external writes ไม่ใช้ flow นี้แก้ Draft ของ User โดยตรง | E06 + E08 + ROOT | supported local; final review pending |
| 06.03 | Final explicit Save Correction เท่านั้นที่ upload selected replacements หรือ original bytes เมื่อ metadata เปลี่ยน; internal project/workspace saves ไม่ upload/delete | E06 + E08 + ROOT | supported local; final review pending |
| 06.04 | Scalar และ table physical-row slots ใช้ shared trusted-original and identity paths ที่ผ่าน 04/05 ไม่สร้าง adapter/cache หรือ cleanup policy แยกเฉพาะ Correction | E06 + E08 + ROOT | supported local; final review pending |
| 06.05 | Before dispatch ป้องกัน destination ที่ Submission/older Correction/other owner/workspace/eligible Operation ยัง reference อยู่; same name/token overwrite ที่ทำลาย protected bytes ต้องหยุดก่อน write ไม่อ้าง frozen JSON ว่าปกป้องเนื้อหา URL ได้ | E06 + E08 + ROOT | supported local; final review pending |
| 06.06 | New valid revision เก็บ document/JSON/receipt/reference ของ captured snapshot ครบ ไม่แก้ URL/token หรือ evidence ของ older revisions | E06 + E08 + ROOT | supported local; final review pending |
| 06.07 | Replacing/removing current file ไม่ทำให้ older revision สูญเสียไฟล์ และไม่มี DELETE shared canonical/protected identity หรือ cleanup จาก token inequality เพียงอย่างเดียว | E06 + E08 + ROOT | supported local; final review pending |
| 06.08 | Catalog rename/move/delete ระหว่างเปิด workspace ไม่เปลี่ยน published choice และไม่ทำให้ live lookup เปลี่ยนปลายทางย้อนหลัง | E06 + E08 + ROOT | supported local; final review pending |
| 06.09 | Pending Files/removals ข้าม internal workspace document transition ได้เฉพาะ verified scope/physical-row mapping; ambiguity คง editor/pending state และหยุดก่อน remount ทำไฟล์หาย | E06 + E08 + ROOT | supported local; final review pending |
| 06.10 | Final completion ยอมรับเฉพาะ captured snapshot; newer unsaved File/removal ไม่ถูกล้างหรือแสดงว่าบันทึกแล้ว ไม่ส่งต่อเข้า operation ถัดไปอัตโนมัติ | E06 + E08 + ROOT | supported local; final review pending |
| 06.11 | In-place external overwrite/unknown commit ใช้ durable original-operation evidence และ hold ที่ถูกต้อง ไม่สัญญา external rollback หรือ resend หลัง timeout | E06 + E08 + ROOT | supported local; final review pending |
| 06.12 | Existing HTTP seam พิสูจน์ Correction reason/eligibility/requiredness, frozen routing หลัง catalog changes, original-byte number change, physical slots, protected-reference rejection ก่อน upload และ selected historical revision ที่ยังถูกต้อง | E06 + E08 + ROOT | supported local; final review pending |
| 06.13 | Smoke real ONLYOFFICE Correction ของทั้ง legacy/new Form ตรวจ workspace/internal-save no-write, final save, old Submission/Correction read และ actual selected-revision exports | E06 + E08 + ROOT | supported local; final review pending |
| 06.14 | หาก filename grammar เดิมทำให้แก้ slot โดยไม่ overwrite protected history ไม่ได้ ให้รายงาน protected conflict อย่างชัดเจน ไม่เพิ่ม suffix หรือปลด guard เอง; feature acceptance ต้องแยก allowed success path จาก safe rejection | E06 + E08 + ROOT | supported local; final review pending |
| 06.15 | อัปเดต affected Correction callers/fixtures และ workflow/domain/system map ใน change เดียวกัน ไม่เปลี่ยนสิทธิ์ Viewer/User หรือ main-document viewer | E06 + E08 + ROOT | partial; owner prose/source checks supported, parent generated workflow/rendered-guide and final review pending |

### Ticket 07

| AC | Requirement | Evidence | Status / missing proof |
| --- | --- | --- | --- |
| 07.01 | Owner discard ใช้ได้เฉพาะ Draft ของตน Admin whole-Response deletion และ Viewer read-only คงสิทธิ์/confirmation เดิม ไม่ให้ arbitrary client URL/token เป็น deletion authority | E07 + E08 + ROOT | supported local; final review pending |
| 07.02 | Response deletion เก็บ durable trusted attachment context ของ Draft/Submission/Correction/workspace/eligible Operations ก่อนลบ rows; ไม่ลด scope เหลือเฉพาะ latest receipt | E07 + E08 + ROOT | supported local; final review pending |
| 07.03 | คำนวณ surviving references/aliases ที่ canonical provider identity หลัง retire references ของ Response ที่ลบ ไม่ถือ separate version/attempt rows หรือ token inequality ว่าไฟล์แยกกันเสมอ | E07 + E08 + ROOT | supported local; final review pending |
| 07.04 | Existing admission/reference/deletion fencing ป้องกัน race ที่ reference เกิดใหม่ระหว่าง no-reference check และ dispatch DELETE; shared/protected/current B identity ไม่ถูกลบ | E07 + E08 + ROOT | supported local; final review pending |
| 07.05 | DELETE ทำได้เฉพาะ known owned received/committed identity ที่มี request settlement และไม่มี surviving references ไม่มี search/client-token ownership inference | E07 + E08 + ROOT | supported local; final review pending |
| 07.06 | Unknown upload, unconfirmed in-place overwrite หรือ previously dispatched uncertain DELETE ยังคง evidence-based hold ไม่ใช้เวลารอ/empty search/operator note ปลดหรือ resend | E07 + E08 + ROOT | supported local; final review pending |
| 07.07 | Same-token overwrite evidence จาก 03 ไม่ทำให้ deletion follow-up ส่ง DELETE สำหรับ retired A แล้วลบ B ที่ยังใช้อยู่; known shared references ยังคง protected หลัง reload/restart | E07 + E08 + ROOT | supported local; final review pending |
| 07.08 | การลบข้อมูลกับ confirmed external cleanup แสดงผลแยกกัน Old public URL อาจเปิดได้ขณะ cleanup ค้าง ต้องมี persistent warning ไม่แสดงว่าไฟล์ถูกลบจาก JSON disappearance เพียงอย่างเดียว | E07 + E08 + ROOT | supported local; final review pending |
| 07.09 | Existing Results tracking ยังอ่าน evidence ได้โดย Admin/Viewer หลัง Response deletion โดยไม่คืน answers เป็น normal Response row; เฉพาะ current enabled Admin ทำ authorized first cleanup ตาม evidence เดิมได้ | E07 + E08 + ROOT | supported local; final review pending |
| 07.10 | Ordinary saves หรือเปิดหน้าใหม่ไม่ retry upload/delete ไม่ล้าง warning และไม่ adopt late receipt เป็นคำตอบ; late receipts ใช้ follow-up ตาม scope/fence จริง | E07 + E08 + ROOT | supported local; final review pending |
| 07.11 | Archive คง files/history และไม่ dispatch file deletion Catalog CRUD และ duplicate Form ไม่สร้าง deletion cases หรือ cleanup ของ User | E07 + E08 + ROOT | supported local; final review pending |
| 07.12 | Existing HTTP seam พิสูจน์ deletion authorization, confirmed/unconfirmed outcomes, shared identity across surviving snapshots/Responses, concurrent reference claims, crash/late receipt และ durable tracking หลังลบ Response | E07 + E08 + ROOT | supported local; final review pending |
| 07.13 | Smoke actual deletion/confirmation และ Results follow-up ด้วย synthetic Responses/provider double ตรวจ saved B URL ของ reference ที่ยังเหลือและ persistent warning หลัง reload | E07 + E08 + ROOT | supported local; final review pending |
| 07.14 | อัปเดต cleanup/deletion consumers, fixtures และ workflow/system map โดย reuse existing recovery/follow-up surface ไม่เพิ่ม dashboard, automatic retry queue หรือ manual unlock ที่ไร้หลักฐาน | E07 + E08 + ROOT | partial; owner prose/source checks supported, parent generated workflow/rendered-guide and final review pending |

### Ticket 08

| AC | Requirement | Evidence | Status / missing proof |
| --- | --- | --- | --- |
| 08.01 | รวม 01–07 และตรวจ behavior บน delivery integration checkout เดียว ไม่ใช้ผล passing ของ worktree/branch แยกมาแทน final integrated result | E08 + E08 + ROOT | supported local; final review pending |
| 08.02 | Actual Admin page ทำ persisted list/filter/create/rename/move/delete confirmation ครบ category ID/type semantics ถูกต้อง และไม่มี User/Viewer write access | E08 + E08 + ROOT | supported local; final review pending |
| 08.03 | Real ONLYOFFICE external popup ใช้ dependent category/template selects ทั้ง scalar/table, empty/error/reload, Cancel/Escape/focus และ dirty guards ไม่เปลี่ยนเป็น demo/sidebar flow | E08 + E08 + ROOT | supported local; final review pending |
| 08.04 | Complete native journey: author/save/publish no-year new-mode Form → duplicate new link → User Save Draft/reopen/replace/Submit → Admin final Correction → selected-revision views/exports → authorized Response deletion/follow-up | E08 + E08 + ROOT | supported isolated native; only post-Submit next-round /start blocked, uninterrupted default flow not proved |
| 08.05 | Legacy published Form/old Draft/Submission/Correction ใช้ contract เดิม ไม่มี file/data migration; catalog changes และ duplicate ไม่เปลี่ยน original link, saved URLs/tokens หรือประวัติ | E08 + E08 + ROOT | supported local; final review pending |
| 08.06 | User/Admin/Viewer read-only results ใช้สิทธิ์เดิมและเลือก revision จริง ไม่ทำ upload หรือเปิด mutation controls จากหน้าดู | E08 + E08 + ROOT | supported local; final review pending |
| 08.07 | Read-only workbook และ downloaded XLSX/PDF จริงใช้ saved `file_link` แทน attachment buttons ของ revision ที่กำลังดู ไม่ substitute latest/search/path-derived URLs เมื่อประวัติมีปัญหา | E08 + E08 + ROOT | supported local; final review pending |
| 08.08 | ตรวจ workbook/export package จริงว่าไม่มี separate file_token fields/hidden metadata/service Bearer/credentials และไม่แก้ canonical editable workbook เพื่อทำ export | E08 + E08 + ROOT | supported local; final review pending |
| 08.09 | ส่ง provider URL ตามจริง โดยระบุ caveat ว่า token อาจอยู่ใน query และ URL เป็น public ตาม accepted policy ไม่อ้าง privacy หรือ immutable DCM bytes จาก frozen Folio config | E08 + E08 + ROOT | supported local; final review pending |
| 08.10 | Pending File/removal ขัดขวาง export ที่จะทำให้เข้าใจว่าบันทึกแล้ว; export ไม่ upload ไม่ปล่อย fake URL/blob/filename และ ordinary unsaved Fill Download ยังใช้ได้เมื่อไม่มี attachment change ค้าง | E08 + E08 + ROOT | supported local; final review pending |
| 08.11 | Native scalar/table docs_number change ไม่ต้องเปิด picker เพื่อเลือกไฟล์เดิมใหม่ ได้ exact original bytes จาก DCM-only flow; same-identity overwrite ไม่ DELETE ซ้ำ และ cleanup failure หลัง B commit แสดง warning ค้าง | E08 + E08 + ROOT | supported local; final review pending |
| 08.12 | UI controls มี labels, keyboard access, correct focus และ slot/row-specific safe errors; User เห็น unknown-outcome hold ต่างจาก successful save with cleanup warning | E08 + E08 + ROOT | supported local; final review pending |
| 08.13 | Existing HTTP integration suites และ affected native/UI checks ผ่านแบบรวม ครอบคลุม catalog races, persisted modes, global names, original bytes/limits, physical rows, protected history/shared identity และ no automatic write retries | E08 + E08 + ROOT | supported local; final review pending |
| 08.14 | Before release มี authorized DCM evidence ของ supported original-download flow ทุก in-scope file type/boundary, filename ที่มีขีด/extensionless, actual object receipt และ same-token/link no-extra-DELETE; ใช้ synthetic fixtures ตรวจ collision ก่อน write และไม่ retry unknown writes | E08 + E08 + ROOT + LIVE | partial; single-PDF LIVE evidence only, all-type/boundary/overwrite/settlement/deployed revision HOLD |
| 08.15 | หากยังไม่มีสิทธิ์ live API หรือ provider capability/settlement proof ที่ต้องใช้ ให้รายงาน exact missing prerequisite, tested/untested และ HOLD release ไม่เรียก live ด้วยสิทธิ์เก่าที่หมดขอบเขต ไม่ขอคำตอบข้อ 1–3 ซ้ำ และไม่ลด all-type/DCM-only/CRUD scope | E08 + E08 + ROOT + LIVE | supported local; final review pending |
| 08.16 | เตือน duplicate-name/shared-URL limitation ก่อนเปิดใช้ ไม่อ้างว่าไฟล์ทุกช่อง/แถว independent; ownership/history guards และ safe conflict rejection ยังคงทำงาน | E08 + E08 + ROOT | supported local; final review pending |
| 08.17 | ปิด traceability ของ stories 1–112 และ acceptance ทุกตั๋ว ระบุ observed verification กับ outstanding human/provider approval แยกกัน ไม่ mark resolved จากเอกสารหรือ test count เพียงอย่างเดียว | E08 + E08 + ROOT | supported local; final review pending |
| 08.18 | อัปเดต domain/workflow/system map พร้อม generated outputs ตาม repo convention เปิดตรวจ rendered guide จริง และใช้ root scripts ตรวจ format/lint/type/build ที่เกี่ยวข้องก่อน commit | E08 + E08 + ROOT | partial; owner prose/source checks supported, parent generated workflow/rendered-guide and final review pending |
| 08.19 | นำ throwaway probes/fixtures/services ที่สร้างเฉพาะรอบทดสอบออกหลังเก็บ sanitized evidence ไม่เก็บ credentials/tokens/private receipts ใน public repo และไม่กระทบ runtime/ข้อมูลที่ผู้ใช้มีอยู่ก่อน | E08 + E08 + ROOT | supported; cleanup-evidence.json records exact owned cleanup |

## External release gates — HOLD

1. Ticket08 makes no live calls; parent is the sole live owner and conservatively chose one primary PDF within the user's project/scenario and cleanup constraints. The remaining matrix is unexercised, not a claim that the user banned every other file type. Parent/provider must agree a safe, scoped collision-free synthetic plan before any further writes; do not overwrite user/history files, retry uncertain writes or perform user-owned cleanup.
2. Provider owner must identify the deployed semantic/build revision and support exact original-download contract for every in-scope type: binary, text/original HTML, images/documents, password-protected, extensionless, case-preserved extensions and hyphenated filenames; exact0/1/9,999,999/10,000,000 boundaries, rejection10,000,001. Local doubles do not supply this evidence.
3. Under separate explicit approval, prove same-identity replacement/no-extra-DELETE, aliases and actual receipts without overwriting user/history-owned files. Duplicate names/shared public URLs may expose changed bytes to multiple references; frozen Folio metadata does not make DCM bytes immutable.
4. Provider-owned request/DELETE settlement evidence must resolve unknown external outcomes. Time, empty search or operator note alone cannot permit replay/unlock. No automatic upload/DELETE retries.
5. Human acceptance must review the actual integrated native evidence and the default automatic next-Draft eligibility limitation separately. No inferred business-policy approval. Parent final root/full HTTP/workflow/rendered-guide/two-axis review and ticket disposition remain distinct.

## Isolated preparation and cleanup

Verified exact DB `folio_storage_templates08_20261117_c1db2ece` via `current_database()`, then deployed all36 migrations there only. After SOURCE READY, owned backend18588/provider18589/web15574/gateway18085 and Chrome19608 imported/snapshotted only integration production source. Cleanup completed: released own browser, stopped exact named backend/provider/frontend/Chrome services, removed gateway08 and own launchers/seeds/provider-fixture archive/private env/accounts/Files/shadow/cache/profile/wrapper. Retained DB08, worktree, sanitized evidence and actual exports. Parent/user services, original checkout and parent private test.env remain untouched. Local provider URLs now belong to stopped fixtures, not durable production links.

## Exact automated evidence locations

These are source locations for the earlier observed runs in E01–E07, not new executed results. Line numbers may move during the source-standards repair; test names are the stable lookup.

| Story / criteria slice | Existing seam and decisive named cases | Evidence |
| --- | --- | --- |
| 1–22; 01.01–01.15 | `apps/server/test/http/storage-templates.test.ts`: `Admin persists, filters, renames, moves and deletes local catalog without provider file writes`; `catalog rejects forged categories, unsafe names and global duplicate races`; `management denies unauthenticated, User, Viewer and disabled Admin before provider access` | E01; browser-only subclaims still require E08 |
| 23–49; 02.01–02.18 | `apps/server/test/http/ecm-attachment-authoring.test.ts`: `Storage Template authoring rejects forged, renamed, moved and deleted local mappings without losing Draft configuration`; `incomplete attachment Draft saves; publication requires a Storage Template and docs_number, not fiscal_year`; `complete saved categories publish offline without User metadata values and the published contract cannot change`; `duplicates keep independent links and frozen new choices; legacy duplicates require explicit mapping without copying answers or files` | E02; actual native controls remain separately observed |
| 50–67, 74–85; 03.01–03.21 | `apps/server/test/http/ecm-scalar-save-submit.test.ts`: `template scalar saves without year and replaces same provider identity without deleting current bytes`; `template year-only edits preserve ordinary answers without uploading unchanged attachments`; `template scalar preserves %i original bytes and extensionless filename`; `template protected destination stops a foreign owner before POST`; `template immutable history prevents in-place overwrite before POST`; `template unknown overwrite retains canonical answer but reports mutable URL and never resends or deletes`; `template distinct replacement keeps B usable with persistent old-file cleanup warning`; `template received same-identity overwrite cannot pretend rollback after canonical admission expires`; `template concurrent unknown destination cannot dispatch another owner's write` | E03/E05; provider-double proof only |
| 68–73; 04.01–04.16 | Same HTTP seam: `template docs_number change reuses authenticated original without picker, then reloads and submits`; `template number change preserves exact simulated original %s`; `template original %s fails before upload and preserves canonical Draft`; `template original stalled stream expires its real transport budget before upload`; `template replacement wins over original retrieval on number change`; `template digest rejects %s without rejecting legitimate HTML originals`; `template same receipt/name/size replacement reuses current B bytes on number change`; `template original rejects %s evidence before provider GET` | E04/E05; LIVE supports only one PDF |
| 86–94; 05.01–05.17 | Same HTTP seam, table cases and current-row regressions enumerated in [05 Comments](issues/05-table-template-attachment-lifecycle.md#comments); actual row0/2 gap, zero-byte, mapping2→1 and surviving B original bytes in `/tmp/folio-storage-templates-runtime/table05/{native-evidence,position-native-evidence}.json` | E05; final delivery-native row proof remains E08 |
| 95–99; 06.01–06.15 | Same HTTP seam: `Correction validates reason, required physical slots and eligibility before provider writes`; `Correction authenticates independent bearer and cookie credentials while preserving native capability-only requests`; frozen-catalog Correction regression and history/workspace cases in [06 Comments](issues/06-correction-frozen-contract-and-history.md#comments); `apps/web/test/ui/{correction-preview,upload-poc-pending}.test.tsx` | E06 + ROOT; test-only global-name isolation repaired and final140-case integration run passed |
| 107–110; 07.01–07.14 | Same HTTP seam, final20-case selection: `whole-Response deletion\|unknown DELETE\|late canceled receipt\|Results retains trusted cleanup\|template unknown overwrite\|unproven provider alias\|in-flight DELETE`; [07 Comments](issues/07-response-deletion-and-shared-identity-follow-up.md#comments) records exact command and native outcomes | E07; not a claim of all repository HTTP tests |

### Independent prior-artifact inspection

Ticket08 reopened the actual06 packages and PDFs independently before the source gate: all6 XLSX and6 PDF retain their expected selected document numbers and exact saved URLs, including older Correction1 after Correction2. ZIP XML has no OLE attachment controls, separate `file_token` metadata or local service Bearer; PDF text and URI annotations match the selected revision. Sanitized sizes/hashes/annotations are retained at `/tmp/folio-storage-templates-runtime/acceptance08/prior06-artifact-audit.json`. This supports the artifacts at06's recorded source; it is expressly not final delivery-source runtime acceptance.

## Final integrated native evidence

Artifacts remain under `/tmp/folio-storage-templates-runtime/acceptance08/`; `native-evidence.json` contains40 chronological observations, `source-revision.json` pins source and `cleanup-evidence.json` records teardown. These are local synthetic results, not live-provider or human approval.

- **Admin/catalog/native authoring:** actual persisted create/reload/filter/rename/move; Cancel/Escape, Cancel focus and Tab/Enter deletion; provider-error input retention. Actual scalarB3 and tableD5:E7/column_2 dependent popup, cancellation, provider error/reload, no-template empty state and disabled Confirm. Actual unapplied Field edits blocked Template Draft save; stale mapping publication rejected without losing Draft. Initial normal publication and new-link duplicate succeeded without fiscal_year. Catalog actions/publish/duplicate caused0 file writes.
- **User/physical rows/originals:** actual disk-backed scalarA4bytes, tableArow0 and B5bytes atrow2 with blank gap. Save/reopen/unchanged save; scalar replacement/cancel/save reused identity with0 DELETE. Actual delete-selected removed A and remapped B2→1 with0 file writes. Added saved0-byte row0. Changing only docs_number, without picker/reselection, performed3 original reads and uploaded exact scalarB5bytes, table0bytes and tableB5bytes. All new-mode POSTs have only documentFile/template=1 and exact case-preserved grammar, no suffix.
- **Warnings/exports:** injected local old-file DELETE rejection after new B committed produced persistent successful-save cleanup warning across reload, with no retry. Pending scalar File blocked XLSX; pending table removal blocked PDF. Real ordinary unsaved Excel download contains UNSAVED08 while canonical Submission ordinary values remain null.
- **Correction/history:** eligible Admin Correction uses frozen scalar/table names after catalog rename/move/delete. Internal workspace save caused0 file writes. Same-destination replacement rejected before any GET/POST/DELETE; pending File retained. Canceling that selection and changing number allowed reasoned Corrections1/2 with exact originals, including0-byte row and current physical row1, without deleting protected history. Legacy scalar Save/number-change/Submit/Correction retains template=0, original5 multipart fields and original4-byte hash/UUID naming. Synthetic legacy Published fixture uses existing workbook seam and separate template object key; no user data migration or attachment-operation payload was fabricated.
- **Submit limitation:** both template and legacy actual Submit committed. Only the subsequent automatic next-round POST /start was aborted, simulating leaving after Submit. Existing default Fill auto-starts the next Draft and then correctly blocks Correction eligibility. No DB status/eligibility changes, upload/original/Correction interception, SDK mocks or fabricated results. This does not prove uninterrupted default Submit→Correction or approved business intent. Initial template host-message wait timed out; persisted Submission and sanitized202/aborted-start trace prove the actual result without replay.
- **Roles/deletion/unknown:** User and Viewer authenticated catalog probes return403; earlier cookie-only401 probes are explicitly not role proof. User/Admin/Viewer selected original/Correction/older revisions; Viewer saved Draft is read-only and has no mutation controls. Owner Cancel preserves Draft; confirmed discard and Admin Cancel/whole-history deletion distinguish removed answers from unresolved files. Deleted cases persist in Admin/Viewer follow-up while normal rows disappear. A final real picker/save with a local malformed receipt produces a distinct unknown-upload mutation HOLD; reload/guarded save/owner-discard do not resend or delete. Canonical UNKNOWN08 answer remains, uncertain file receipt is not adopted.
- **Actual bytes:**6 XLSX+6 PDF cover template original, Correction1, older Correction1 after2, Viewer Correction2, legacy original and legacy Correction1; plus1 ordinary-unsaved XLSX. `export-evidence.json` and `legacy-export-evidence.json` verify exact saved scalar/table URLs, selected numbers, PDF URI annotations, no OLE controls/separate file_token/local provider service secret, and6 unchanged canonical object hashes. Provider URLs are public and may contain token query parameters; these fixtures do not prove immutable DCM bytes.
- **Counters/fixture lifecycle:**19 local uploads,14 DELETE attempts,27 original reads;16 reads were explicit local provider-double continuity probes, not app original-reuse requests. The double's15 synthetic objects were restored across one owned backend restart to enable malformed receipts; its private fixture archive was removed afterward. This is not a Folio fallback archive or production settlement claim. Own runtime failures were selector/viewport/additive-selection/readiness/remount/wait assumptions, recorded in native-evidence.json rather than mislabeled product fixes or passes.

### Remaining acceptance boundaries

Parent final rendered workflow/two-axis review and ticket disposition remain pending. LIVE establishes exactly one authorized629-byte PDF upload/read, not all types,0/10MB/encrypted/extensionless, same-identity overwrite/no-extra-DELETE, external settlement, deployed semantic revision, or immutable provider history. Parent later current-source read had GET401, invalidated auth generation, then an explicit new manual read logged in200/GET200 and matched the full hash; no retry-after-unknown write or extra file POST/DELETE occurred. Stale-token cause is unknown, not claimed fixed. Keep release HOLD for missing provider/human evidence without reducing implementation scope.
