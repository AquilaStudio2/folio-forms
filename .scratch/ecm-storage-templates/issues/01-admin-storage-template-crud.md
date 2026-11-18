# 01: Admin จัดการ Storage Template catalog ครบ CRUD

**What to build:** Admin เปิดหน้า **แม่แบบจัดเก็บเอกสาร** จาก navigation เลือก **หัวข้อเอกสาร** แล้วดู/กรอง เพิ่ม แก้ชื่อหรือย้ายหมวด และยืนยันลบแม่แบบที่บันทึกจริงได้ครบ โดยใช้ category ID จาก DCM และไม่แตะไฟล์ User หรือโครงสร้าง DCM

**Blocked by:** None (can start immediately).

**Status:** resolved

**Parent:** [Storage Templates spec](../spec.md)

**Story coverage:** 1–22; authorization, accessibility และ no-external-file-write เป็นข้อกำหนดร่วม

## Acceptance criteria

- [x] เพิ่ม persisted catalog ที่มี identity ภายใน, `template_name` และ numeric `document_category_id`; migration ใช้ isolated database และไม่ reset/เปลี่ยน Responses หรือไฟล์เดิม
- [x] Admin navigation เปิดหน้าจริงที่มี category select **หัวข้อเอกสาร**, persisted list/filter และ create/edit/delete controls ครบ ไม่ใช่ mock data หรือหน้า create/list อย่างเดียว
- [x] โหลด category ผ่าน backend/shared ECM auth เดิม ใช้ `type` แสดงผลและ `id` เป็นค่า/filter key; categories ที่ชื่อเหมือนกันแต่ ID ต่างกันไม่ถูกยุบรวม
- [x] Create บันทึกชื่อกับ category ID ที่ backend ตรวจจาก provider evidence ที่ใช้ได้ ปฏิเสธ arbitrary/unknown ID, blank/control/unsafe filename metadata โดยไม่ rewrite ชื่อเงียบ ๆ
- [x] `template_name` ไม่ซ้ำทั้ง catalog แม้คนละหมวด มี database uniqueness ป้องกัน concurrent create/update และคืน error ที่ Admin แก้ได้
- [x] Update เปลี่ยนชื่อและหมวดที่ผูกได้จริง หลัง reload รายการหมวดเก่าและใหม่ตรงข้อมูลที่บันทึก ไม่เหลือ selection ที่ผิดหมวด
- [x] Delete มี confirmation พร้อม Cancel/Escape และ focus behavior ที่ใช้ keyboard ได้; cancel ไม่ mutate และยืนยันสำเร็จแล้วรายการหายจาก future choices
- [x] แยก loading, empty และ provider/API error ชัดเจน คงข้อมูล/ข้อความที่กำลังแก้เมื่อบันทึกล้มเหลว ไม่แสดงผลสำเร็จจาก optimistic state เพียงอย่างเดียว
- [x] Provider outage ไม่ล้าง saved catalog; เปลี่ยน category ต้องมี valid evidence ส่วนลบ local mapping ไม่ต้องเรียก DCM file mutation
- [x] Backend ทุก catalog-management action ตรวจ enabled Admin; direct User/Viewer/unauthenticated requests ถูกปฏิเสธโดยไม่ทำ ECM login/file writes แทนผู้ไม่มีสิทธิ์
- [x] Browser/response/log evidence ไม่เปิดเผย service credentials/Bearer; ใช้ coordinator/token-renewal policy เดิม ไม่เพิ่ม cron/config/dependency
- [x] CRUD ไม่สร้าง/แก้/ลบ template/folder/category ใน DCM และไม่ upload/rename/re-upload/DELETE file ไม่เปลี่ยน Published Template หรือ canonical answers
- [x] Existing HTTP integration seam กับ isolated persistence/provider double พิสูจน์ persisted CRUD/filter, invalid IDs, global duplicates รวม race, permissions และไม่มี external file writes
- [x] Smoke หน้า Admin จริงครบ create → reload/filter → rename/move → cancel delete → confirm delete พร้อม empty/error และ keyboard paths ไม่ใช้ tests แทน actual UI proof
- [x] อัปเดต domain/workflow/system map ที่กระทบและตรวจด้วย scripts ของ repo ใน change นี้ ไม่อ้าง provider routing acceptance จากการสร้าง catalog สำเร็จ

## Notes

ขอบเขตนี้จัดการ catalog ของ Folio เท่านั้น Admin ต้องกรอก `template_name` ให้ตรงกับแม่แบบที่ DCM มีอยู่แล้ว `type` ไม่ใช่ physical folder contract และไม่ต้องรอ PM เทียบชื่อหมวดกับโฟลเดอร์ ข้อ 1–3 ของ planning ปิดแล้ว

ตั๋วถูกสร้างเพื่อรอคำสั่ง implementation; triage label ไม่ใช่สิทธิ์เรียก live API หรือเริ่ม migration ในรอบจัดเอกสาร

## Comments

### Implementation and acceptance evidence — 2026-11-17

Implemented on `feat/storage-templates-01`, worktree `/tmp/folio-storage-templates-01`, from integration `7d4859c`. Acceptance remains pending integration-owner review and generated workflow build/check; this entry does not close the ticket.

- Additive migration `20261117000000_storage_templates` deployed successfully only to isolated database `folio_storage_templates_20261117_c1db2ece`; Prisma generation succeeded. No reset, Response migration or original-file change.
- Real page `/admin/storage-templates` is linked in Admin navigation. Persisted UUID catalog identity, globally unique exact `template_name`, numeric `document_category_id`, CRUD/filter, enabled-Admin server authorization, provider-backed category validation and database duplicate protection implemented.
- Shared interface for ticket 02: `EcmClient.categoryEntries(): Promise<{id:number;type:string}[]>` returns the actual provider entries through existing auth/coordinator/renewal. Duplicate labels remain distinct; duplicate IDs reject the response. Legacy `categories(): Promise<string[]>` still returns deduplicated labels. New endpoint `GET /api/admin/storage-templates/categories` returns `{categories}`; `GET /api/admin/storage-templates?document_category_id=<integer>` returns `{templates:[{id,template_name,document_category_id}]}`. POST and PATCH `/:id` accept the complete `{template_name,document_category_id}` mapping and return `{template}`. DELETE `/:id` requires `{confirm:true}` and returns `{ok:true}`. Rename in the same category and delete do not require provider availability; create/category changes read current provider evidence.
- New-route SSO return allowlists updated on FE and BE without changing role policy. HTTP regression verifies start accepts the route and rejects added path/query metadata.
- Regression was written before production changes. Per assignment, checks ran only in final verification; no executed pre-change RED result is claimed.
- Final HTTP verification: `bun test --timeout 120000 test/http/storage-templates.test.ts test/http/ecm-auth.test.ts` passed **23 tests**, including the new **3 catalog tests**, against isolated persistence and localhost provider doubles. Covered persisted CRUD/filter, duplicate-label IDs, unknown/type-invalid IDs, unsafe names, global create race/update duplicates, name preservation, provider outage, local-only rename/delete, rejected unconfirmed delete, all unauthorized roles and disabled Admin, and zero provider file writes.
- `bun test --timeout 120000 -t 'SSO start accepts the Storage Template page' apps/server/test/http/legacy-session.test.ts` passed **1 test** after correcting the test-only secret length. `bun test apps/web/test/form-lifecycle.test.ts` passed **12 tests**. Server and web `check-types` passed. Root `bun run check` passed for all 11 changed TypeScript/TSX/package files; root `bun run fix` formatted scoped changes.
- Actual Chromium smoke used the real checked-out React page and server on isolated ports **15174/18185**, with a localhost provider double on **18186**, not a mock page. Verified Admin navigation; both identical-label category IDs; empty category; create, full reload, filter, rename/move and old/new category lists; Cancel and Escape without mutation; initial modal focus on Cancel and restoration to Delete; Tab/Enter confirmed delete; provider-error state and failed-save input/category preservation; global duplicate error with retained input. Provider write counter remained **0**. Browser-created catalog fixtures were deleted through the actual page.
- Services created for smoke: `storage-catalog01-server`, `storage-catalog01-web`, `storage-catalog01-web-node`, `storage-catalog01-web-real`; all stopped afterward. Vite needed canonical `/private/tmp` root resolution on macOS; the initial `/tmp` root served untransformed TSX. This was isolated launcher setup, not an application change.
- `CONTEXT.md` already defines Document Category identity and Storage Template catalog semantics, so it is intentionally unchanged. Updated workflow map source, page diagram/table and catalog/API/auth/failure explanations. Integration owner must regenerate workflow artifacts and run `docs:workflow:build` / `docs:workflow:check` after merging all source changes.
- No live DCM/PDMS contact, `.env` change, DCM template/folder mutation, upload, rename or file DELETE. Provider routing acceptance is separate and is not established by catalog CRUD.

### Parent integration disposition — 2026-11-17

Persisted Admin CRUD/filter/category-ID behavior, authorization and keyboard/error paths are supported by E01/E08/ROOT.

- Delivery branch `feat/ecm-storage-templates`; production source `d8162b8`, final fixture merge `baf64cb`. See the [canonical acceptance matrix](../acceptance-matrix.md) for final integrated HTTP/native/export/root/review evidence and exact source qualifications. This disposition is based on observed consumer behavior and source review, not copied worktree checkboxes or counts alone.
- Final Standards and Spec rechecks have no code findings. Workflow/source inventory/rendered guide were rebuilt and opened; owned test runtimes/databases/bucket/worktrees and private scaffolds were removed after retaining evidence. Original checkout and existing user services remain; no user schema/answer migration, push or deployment. Normal coordinated live authentication is not represented as zero DB writes.
- Provider all-type/boundary/overwrite/settlement/deployed-version and human release evidence remain HOLD. One authorized synthetic PDF remains for the user to remove; local resolution is not provider/Production approval.
