# 04: เตือนก่อนออกและแยกสถานะไฟล์ที่ยังไม่บันทึก

**What to build:** User และ Admin รู้ว่าไฟล์ยังอยู่ใน dialog, ยืนยันเป็น pending แล้ว หรือบันทึกจริงแล้ว ก่อน navigation ที่จะทิ้งงานต้องเลือกอยู่ต่อหรือ explicit discard โดยไม่ทำให้ saved answer ถูกลบหรือ original Operation ถูกยกเลิกโดยปริยาย

**Blocked by:** None (can start immediately).

**Status:** in-progress — integrated; supporting regressions and ordinary native navigation pass; complete browser state matrix remains in ticket 06

**Spec coverage:** ECM Attachment Safety implementation spec — US64–71, US76–77; U03 และ canonical/no-extra-write ส่วนที่เกี่ยวข้องของ H06/H09

**Execution gate:** ต้องให้ผู้ใช้ตรวจตั๋วและสั่งเริ่ม implementation ก่อนพัฒนา ใช้ระบบแยก ไม่เรียก real DCM หรือแก้ข้อมูลใช้งานจริง

## Acceptance criteria

- [ ] แยก candidate ใน dialog, confirmed host pending และ canonical saved state ให้ผู้ใช้เข้าใจ Saved A กับ pending B ไม่แสดงเหมือน B บันทึกแล้ว Dialog Save ไม่ถูกเรียกว่า upload/canonical save สำเร็จ
- [ ] Picker Cancel/X ทิ้งเฉพาะ local changes ตั้งแต่เปิด dialog รักษา previous confirmed pending/canonical baseline ไม่กลายเป็น full-page discard หรือ DELETE และยังเคารพ existing confirmation-settlement handshake
- [ ] ก่อนเริ่ม Save เมื่อ candidate/File/replacement/removal หรือ ordinary unsaved edits จะสูญหายจาก app-controlled navigation/route/back ให้แสดง existing platform modal ทางปลอดภัยเป็นอยู่หน้านี้ต่อ และอีกทางเป็น explicit ทิ้งการเปลี่ยนแปลงและออก
- [ ] Cancel/Escape คงหน้าและงานเดิม Confirm ทิ้งเฉพาะ unsaved local changes ไม่เปลี่ยน saved canonical answer ไม่มี automatic Save-and-exit/POST/DELETE
- [ ] เมื่อไม่มีงานค้างไม่เตือน และการเปิดอีกแท็บโดยไม่ทำลายหน้าเดิมไม่เตือนหรือโอน File ข้ามแท็บ
- [ ] Refresh/close ขอ browser beforeunload prompt แบบ best-effort ไม่รับรองว่าจะแสดงทุกครั้งหรือกำหนดข้อความเองได้ ไม่สัญญากู้ browser File จาก filename/checkpoint หลัง reload
- [ ] Navigation/reload ไม่ clear/fence/cancel original checkpoint หรือ release mutation HOLD โดยอัตโนมัติ ไม่ใช้การออกจากหน้าเป็น proof ว่าคำขอที่ dispatch แล้วถูกยกเลิก และไม่ resend เมื่อกลับเข้าหน้า
- [ ] Reuse existing original-Operation recovery ก่อนเปิด mutation scope ใหม่เมื่อมี checkpoint คง saved canonical-copy access ตามสิทธิ์ ไม่สร้าง recovery/persistence layer ใหม่
- [ ] Existing modal คง keyboard access, Cancel/Escape semantics, focus containment/return และ labelled controls ไม่เพิ่ม dialog component หรือ navigation framework ใหม่
- [ ] ใช้ actual browser/editor ตรวจ candidate/confirmed pending/removal/ordinary edits/no-dirty/new-tab/route/back/confirm/cancel/Escape/refresh/close ตรวจ pending ก่อนและหลังแต่ละ action พร้อมระบุ browser prompt limitations จริง
- [ ] ใช้ existing HTTP/transport evidence ยืนยัน canceled/discard navigation ไม่เพิ่ม upload/DELETE และ saved canonical state/checkpoint ไม่ถูกล้าง ไม่ใช้ mocked router หรือ source-text tests เป็น browser proof
- [ ] คง completed-Correction-with-newer-pending safeguards เดิมและ active-save/unknown protections ระหว่างทำตั๋วนี้ การเติม loading/state matrix เต็มเป็นตั๋ว 05 ไม่ทำให้ behavior เดิมถดถอย
- [ ] อัปเดต affected routes/host/plugin consumers และ existing behavior tests/docs/system map เฉพาะที่เปลี่ยน ไม่เขียน pending host หรือ Correction lifecycle ใหม่ทั้งชุด

## Scope boundaries

File bytes อยู่ใน browser memory ตามเดิม ไม่มี auto-upload, sessionStorage/IndexedDB File copy, temporary server copy หรือ cross-tab transfer ตั๋วนี้ไม่มี dependency ต่อ naming/minimum-row เพราะใช้ pending/Operation interfaces ที่มีอยู่แล้ว

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown ให้เริ่มตั๋วนี้โดยไม่มี ticket blocker ได้เมื่อมีคำสั่ง implementation การเผยแพร่ยังไม่ใช่คำสั่งเริ่มพัฒนา และไม่ใช่ browser prompt acceptance

### Implementation — 2026-11-18 — isolated worktree `feat/ecm-safety-04`

- Implemented code, not integrated/native acceptance. Status remains open until the parent checks the delivery integration branch.
- Picker now reports scoped candidate dirty state without sending File bytes. Candidate selection/removal differs from confirmed pending; confirmation still waits for the existing acknowledgement before closing. Cancel/X clears only the candidate warning and preserves the host baseline. Saved receipt display remains separate.
- Host combines candidate, confirmed pending, and ordinary document dirty state. Candidate messages require the existing editor-frame/origin/bridge/document/scope checks. A candidate prevents document-changing pending checks until the user confirms or cancels. No upload, persistence, or recovery layer was added.
- Host completion exposes `hasAttachmentCandidates`; `hasPendingAttachments` includes candidates. Fill does not remount a completed Draft over an open candidate; Correction workspace also preserves the candidate frame. Final Correction retains the existing retired-workspace/newer-pending guard.
- Fill's exit action no longer deletes the saved Response or offers Save-and-exit for navigation. Explicit discard leaves via the existing blocker/navigation only. Reauthentication retains its separate existing explicit-save flow. Fill reuses the native `<dialog>` pattern already used by Correction: safe initial focus, Escape/Cancel, native focus containment/return, and labelled controls. Both routes use the approved discard labels.
- Existing `useBlocker` owns internal route/back and best-effort `beforeunload`; Fill now also treats active saving as protected. Navigation does not clear, fence, cancel, or resend an attachment checkpoint. Original-Operation reconciliation and saved-copy access remain unchanged.
- Ticket02 interface request implemented here: pending last-row delete rejects before state mutation; full-mapping protocol and pending transition validation reject a table destination with zero rows. Regressions cover empty/File/removal/invalid pending state preservation. No `spreadsheet.js` or `operations.js` changes.

#### Regressions and commands for integration owner

No build, lint, formatter, test, browser, provider, or live-data execution was performed in this worker, per assignment. Tests were added/updated but are not reported passing. Existing component/protocol fixtures are supporting regression coverage, not browser/native or HTTP-provider acceptance.

```sh
bun test apps/onlyoffice-plugin/test/upload-poc-picker.test.js
bun run --cwd apps/web test:ui test/ui/upload-poc-pending.test.tsx test/ui/editor-reconnect.test.tsx test/ui/excel-fill.test.tsx test/ui/correction-preview.test.tsx
```

- Picker consumer regression: candidate warning appears; Cancel clears that warning but keeps a previous confirmed File. Existing Cancel/X, invalid-file, acknowledgement timeout/retry, saved receipt, and removal cases remain.
- Host regression: foreign-frame candidate is ignored; valid candidate raises dirty state; Cancel clears only candidate dirty state; ordinary edits and confirmed pending remain dirty; no file POST is emitted.
- Fill regression: explicit exit during an outstanding PDF conversion aborts only that download, sends no additional request, and does not request a save. Cancel/Escape preserve local work and keep exit warning available.
- Correction regression now includes a candidate arriving after capture, alongside replacement/removal: completion preserves editor and requires explicit discard from the retired workspace.
- Existing HTTP evidence owners should run H06/H09 on integration source: unchanged picker/route cancellation has no ECM POST/DELETE; saved canonical receipts remain; original checkpoint recovery uses the original Operation and does not resend. Component fetch assertions are not a substitute.

#### Required actual browser/editor scenarios — not exercised

Use the isolated actual app, PostgreSQL/object-store, controlled provider, and supported browser/ONLYOFFICE. Record browser/version, integration revision, canonical receipt/checkpoint and provider write counts before/after each action. Do not use real DCM.

1. Start from a clean saved Draft/Correction: route link and browser Back leave without a dirty prompt. Open a link in a new tab: original page and File stay unchanged, with no discard prompt or File transfer.
2. Open picker on saved A; select candidate B without confirming. Verify candidate status beside saved A. Try host route link and Back; safe button, Escape, and Cancel keep page/B. Confirm discard leaves without POST/DELETE and saved A remains on reopen.
3. Confirm B, reopen picker, select C, then Cancel and X separately: B remains confirmed pending, A remains canonical, C is discarded. Repeat with pending removal and restoration to the baseline.
4. With confirmed replacement, confirmed removal, ordinary native cell edits, and ordinary NativeForm edits separately, try route link/Back and explicit form exit. Cancel/Escape preserve all work; explicit discard preserves saved canonical JSON/document/receipts, without automatic save/upload/DELETE.
5. During confirmation acknowledgement delay, Cancel/X must not claim cancellation before settlement. During active save, retain current navigation protection; full native active-cell/keyboard locking is ticket05, not accepted here.
6. Complete a captured Correction with a newer candidate/File/removal: editor remains, old Correction is saved, newer work is not saved, repeat Save remains disabled, and only explicit discard permits exit. Open a new Correction from current revision and select a new File manually.
7. Refresh/close with candidate/confirmed/removal/ordinary work: record whether browser presents `beforeunload`. It is best-effort; custom prompt text and unconditional interception are not promised. After reload, unsaved File bytes are not recoverable from names/checkpoints.
8. Leave/reload with an existing unresolved original checkpoint: its identity/HOLD survives. Returning reconciles the original Operation before mutation and never causes an automatic resend/DELETE. Saved canonical-copy access remains available under existing permissions.
9. In the actual browser, verify safe initial focus, Tab/Shift+Tab containment, Escape cancellation, and focus return for both exit dialogs. JSDOM dialog method fixtures do not prove these boundaries.

#### Parent-owned documentation deltas

- `CONTEXT.md` / system map: distinguish picker candidate, confirmed pending, canonical saved; document memory-only candidate dirty reporting and `hasAttachmentCandidates` completion/remount fence.
- Fill exit is local discard only, not Response deletion or Save-and-exit. Reauthentication's explicit save remains separate.
- Existing router blocker owns route/back and best-effort unload. Leaving never proves original-request cancellation, clears a checkpoint, or restores browser File bytes.
- Keep final Correction/newer-pending safeguards and ticket05 native active-save acceptance separate. Record browser/HTTP evidence as unverified until exercised on the integration branch.

### Integration evidence — 2026-11-18

- Integrated at `4fd024a` plus integration-owner corrections. Plugin spreadsheet/picker 64 tests and the four affected web UI suites, 79 tests, passed. Invalid-file setup now asserts the real validation rejection before checking state preservation; incidental message wording is not a test oracle.
- Actual native editor/browser: HeadlessChrome/150.0.0.0 with ONLYOFFICE 9.4.0-129 in the isolated environment. Edited an ordinary saved XLSX cell, opened the exit dialog, verified safe initial focus on stay and only stay/local-discard choices, pressed Escape and remained on the same page. Reopened and explicitly discarded; navigation reached Dashboard. Saved XLSX/JSON and canonical document key remained unchanged, with zero observed provider POST/DELETE.
- This proves the ordinary native-edit exit path, not the whole candidate/confirmed/removal/route/back/unload/Correction matrix. Ticket 06 must exercise those actual surfaces; unit/component results are supporting evidence only. No provider or Production acceptance is claimed.

### Native acceptance correction — startup dirty

- On integrated source effective `8819763`, 06 observed automatic next-round workbooks marked dirty before any keyboard/pointer edit. Exit incorrectly required discard. Passive native events showed DocumentReady, then dirty true about 1.1 seconds later, then false; native autosave false cannot clear genuine Folio edits.
- The existing startup OLE activation wrote native public locks/clientData into document history. The parent inspected actual SDK history methods and a 46-item startup history point; no injected/replayed bridge event was used.
- Restore only those verified UI locks under a balanced native history counter, with `finally` covering success and rollback. Do not suppress ordinary dirty events or reset later-work generations. Initialization needs no workbook recalculation. Unsupported history APIs fail before mutations; ordinary workbooks without managed OLE objects need no history mutation.
- Regression before fix: 3 failures (startup history polluted, unsupported history accepted, rollback polluted history). After fix: activation 7 and full plugin 339 passed. Native source-specific clean-open/next-round/no-dirty-exit and subsequent real-user dirty/exit checks remain required in 06 before resolving this ticket.
