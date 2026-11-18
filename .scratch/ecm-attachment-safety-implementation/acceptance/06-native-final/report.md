# Final integrated native evidence — bounded, not release acceptance

Status: needs-info. Execution: 2026-11-18–19; browser timestamps Asia/Bangkok.

This supplements, not relabels, the earlier N01–N08 report. Source implementation is present for tickets 01–05. Native acceptance remains bounded. Tickets 03/06 retain explicit unverified matrix cells; provider, settlement, old-data and human gates remain separate. No statement here certifies Production or the whole spec accepted.

## Provenance and method

- Integration: `feat/ecm-attachment-safety-implementation`; requested pre-work baseline commit `838056b1d682fd40623d5db029ad5a1e7c89ad96` preserves all previous branch work.
- Most supplementary native cases: `3652d7a2634a340d24900c509803863b1f8c48c0`. Native plugin served SHA-256 `8d321c1b5d6b0fb6155842d00f3a1ba914ad5c77e44cfc7baea0c97867de46b7`.
- Review regression: failing before on `3652d7a`; passing after on `817037ce5e9ec2223aaf4a831ba8652bd447a122`. Final application bytes are identical at `c91472d94fb8ddd8c06f7c08ad2c7709674319b5`; intervening changes fix only test fixtures/assertions. Viewer, User input and initialized hidden-column observations used these final application bytes.
- Actual managed Chrome `150.0.7871.24`, native ONLYOFFICE `9.4.0-ae9ceb648960c9359d8339c7c6044e63`, MacIntel/SDK isMacOs. Existing native service was not upgraded or unprotected.
- Owned databases, bucket, gateway, application and synthetic provider only. File choices were actual disk-backed browser FileChoosers. Native OLE controls used trusted pointer context menus and Edit object; native footer Save means local confirmation, not a provider upload.
- Passive model/DB/storage reads corroborate UI actions. No invented bridge result, SDK model mutation, automatic-next suppression, submitted-status flip or disabled-control bypass supplied acceptance.
- Narrow network faults interrupted original real requests. They did not fabricate successful responses or resend files. Complete opaque file URLs, receipt tokens, credentials and capabilities are excluded from published evidence.
- [Typed evidence](evidence.json) contains scoped metadata, receipt fingerprints and preservation assertions, not remote ownership proof. Screenshots document actual surfaces. Earlier report retains its own source revisions and literal-byte scope.
- Hindsight `pdms-knowledge`: skipped, required bank/types/budget selectors unavailable. No retrieved IDs/revisions or bank writes. Repository canonical documents and committed source are distinct evidence, not Production facts.

## N09 — Captured Draft B, genuine later candidate C, then another real Save

An actual later FileChooser result originally exposed a stale locked-cell projection: B committed, C remained local, but the next Save exported A's old protected link. The shared retained-editor activation now refreshes only authenticated canonical scalar/physical-row attachment projections before acknowledging continuation. Ordinary data, history, protection and metadata ownership checks remain intact.

On `3652d7a`, captured four-byte B committed while an already-open genuine chooser delivered zero-byte C after capture. The same native frame remained. Passive native B3 matched the authenticated saved B projection, ordinary `KEEP PROJECTION` remained, and worksheet protection stayed enabled. Confirming C and explicitly saving again succeeded. Exactly one POST occurred for each explicit file Save; no implicit resend. Evidence: `retained-draft-4-safe.json` and `retained-draft-0-safe.json` inside the typed evidence bundle.

## N10 — Confirmed commit versus continuation-configuration failure

Real isolated request interception aborted exactly one continued editor-config GET after B's successful Draft commit, while genuine later C remained local.

- Before (`3652d7a`): server B completed, but host incorrectly displayed an unresolved/unknown outcome after configuration retrieval threw outside the known-commit boundary. Same frame and C survived; no server mutation HOLD existed.
- Fix `627d78915e2092b11a5cee7648894d9b8c5b39cc`: configuration retrieval and scope validation now share the existing known-commit blocked-continuation path. This does not reinterpret an actually unknown original dispatch as success.
- After (`817037ce`, same production bytes as `c91472d`): server B completed; same frame and C remained; false unknown notice absent; confirmed-save notice present; spinner ended; native inert and Save disabled until explicit safe exit. No inappropriate original-request recovery action appeared. No second POST.
- Consumer regression leaves saved completion distinguishable from retained-editor usability. Failed/late native projection ACK likewise remains known-commit blocked, not writable or falsely unknown.

See `native-continuation-before-fix-safe.json` and `native-continuation-after-fix-safe.json` in the evidence bundle.

## N11/N12 — Actual own-Draft versus protected-history warnings

Separate scopes were established before uploading; synthetic provider deliberately returned an existing paired receipt, not merely an equal filename.

- N11: zero-byte own-Draft baseline, then a genuine zero-byte selection and explicit Save. Host/native warning distinguished **ไฟล์ร่างเดิม**; slot/Tag context was visible. Original Draft JSON, artifact key/hash and references were unchanged. Operation `ee1b1f4e-d69b-4e46-8b4b-d5772e36c3d1` failed with `attachment_draft_receipt_conflict`.
- N12: genuine four-byte selection returned a surviving own Submission receipt. Warning distinguished **ตรงกับประวัติเดิม**, permitted Submission `84059d9c-9a3f-48d2-b82d-ecb36d3228d4` and slot context. Original JSON/artifact/references were unchanged. Operation `49e5d600-1539-4433-874e-e1c5a165edb8` failed with `attachment_history_receipt_conflict`.
- Both ended busy state without deleting preserved files. Actual Stay and explicit local discard worked. UI did not expose raw receipts or use Q3/Q4 jargon. Other-owner permission-safe classification remains HTTP evidence, not an invented native journey.

Visuals: [Draft conflict](native-q4-warning.png), [history conflict](native-q3-warning.png).

## N13 — Actual after-store upload uncertainty and saved-copy access

Response `23ece233-517f-4a6d-a4a7-ab1e0023bb76`, established `UNKNATIVE06` scope. Captured replacement.BIN3, delayed its actual provider POST, and confirmed native inert/loading and blocked pointer/typing. Released that original request exactly once with controlled after-store HTTP500/no usable receipt.

Spinner ended, same native frame and confirmed pending three-byte file remained, and durable mutation HOLD blocked another Save/Submit. Saved-copy inspection outside inert opened the actual read-only native saved workbook: blank canonical attachment cells, no managed upload controls. Closing inspection preserved the original frame. Stay/discard/reentry did not settle or retry the original upload; HOLD and saved-copy access persisted. Operation `9dbdf47b-207f-419f-8fc3-d89f68d4d352` failed with `ecm_rejected`; canonical blank snapshot/references remained unchanged.

This proves durable original uncertainty and no resend, not provider settlement. An early sessionStorage search used Operation ID rather than checkpoint ID; it is **not** evidence that a checkpoint was absent. N14 separately uses the exact checkpoint.

Visual: [retained pending after uncertainty](native-unknown-pending.png).

## N14 — Lost Folio acknowledgement, failed original lookup and authentic reentry

On final application bytes, Chrome intercepted the original Draft response at Response stage after the actual server returned202. Its real body was read privately only to correlate Operation, then delivery failed. Exactly one original-checkpoint GET also failed. No replacement response was supplied.

- Server Operation `057e4205-df07-4454-8184-71cf64c8e3c6` completed and canonical four-byte file committed.
- Exact client checkpoint `533c32dc-ddd0-4023-93fd-dc68889ca9a9` remained. UI correctly showed unknown/inert because that client had not received acknowledgement.
- Stay then explicit local discard preserved the exact checkpoint. Interception was removed before exit/reentry.
- Reentry authentically reconciled the original before editing. Only verified reconciliation cleared that checkpoint; native became usable with saved canonical data, ordinary `KEEP PROJECTION` and protection intact.
- Provider stayed at25 POST/7 DELETE through exit and reconciliation. No second POST or deletion was caused by lookup/reentry.

Evidence: `native-continuation-lost-ack-safe.json`. This synthetic, auditable lost-ack case is not a real DCM settlement result.

## N15 — Saved receipt removal, minimum row, invalid candidate and independent column

Independent legacy Response `0f428025-d045-45fa-a4d8-f7c105452b14` held a saved scalar0 and genuinely uploaded saved C10 zero-byte receipt at physical `row_index:0`.

1. Actual C10 remove control plus native Save confirmed local removal of that saved receipt.
2. Selected B11; normal plugin delete internally saved2→1. Provider counts stayed22 POST/4 DELETE at this point. Native `folio_rows=Form!$B$10:$D$10`; Delete disabled with the minimum-row reason; C/D controls remained.
3. Reopened C10, chose actual10,000,001-byte file. Error named `rows.proof / แถว 1` and inclusive0–10,000,000-byte limit. Cancel retained confirmed removal; invalid selection did not become a file.
4. Independently confirmed D10 zero.BIN0. C10 removal remained distinct; no copied File or implicit upload.
5. Stay then explicit discard removed only local work. Saved scalar0/C10 zero receipt, physical position, two references, one-row canonical workbook and ordinary answer survived; no DELETE or extra POST.

Evidence: `native-saved-removal-safe.json`; [minimum row](native-saved-removal-minimum.png), [preserved removal](native-saved-removal-preserved.png).

## N16 — Final Viewer and User surfaces

Actual synthetic Viewer login opened results as read-only: native isViewMode=true, managed upload controls0, mutation buttons absent, provider counts unchanged25/7. Current Response was Draft; no historical chooser was asserted for this Viewer case. Earlier N06 independently covers authorized Admin selected-history downloads.

Actual synthetic User opened the normal main Form on final source, typed native B10=`USERFINAL`, observed five controls, used actual Stay then explicit discard. Input was not saved or dispatched. A readiness predicate timed out before later direct observation showed ready; namebox focus also settled asynchronously. No failed action was relabeled as successful input. Only the later observed native value establishes this case.

Visual: [actual Viewer read-only](native-viewer-readonly.png).

## N17 — State/navigation and structural extensions

All following worker observations used3652d7a and its recorded native artifact, not a silently relabeled final-source rerun.

### Confirmed pending, row controls and browser boundaries

- Independent C10/D10 zero-byte confirmed pending. Candidate replacement/clear Cancel restored the prior confirmed file; native X preserved replacement.BIN3. Confirmed C10 pending removal left D10 zero unchanged and the C10 control present.
- Six genuine internal row-save Operations: `6fcf73d9`2→3, `2838aa1a`3→2, `9d0ab61a`2→1, `70cf5a53`1→2, `8bc6e102`2→3, `d81cf89a`3→2. Physical row mappings were respectively `[0,1]`, `[0,1,null]`, `[0,null]`, `[0]`, `[0,1]`, `[0,1,null]`.
- Add with pre-existing C10 zero pending completed and became usable; C10 pending survived, new D12 opened blank, and physical upload ranges extended correctly. Initial suspicion of blocked continuation was disproved by actual controls/pickers, not suppressed. No attachment Save/Submit occurred; own version count stayed6.
- Minimum-row reason, both columns and independent pending states survived. Original two-row blank layout restored through actual controls/discard.
- Actual route Stay/Escape/discard preserved or discarded only local candidate/confirmed file and ordinary work. Clean Exit needed no modal.
- Real beforeunload: dismissed reload, browser Back and attempted close retained candidate/document. Accepted close/reopen lost candidate. Decisive accepted reload changed document timeOrigin and lost both confirmed scalar zero.BIN and ordinary `RELOAD-LOSS`; canonical blank remained. Prompts are best effort, not guaranteed recovery.
- Four historical workbook hashes stayed equal: Submission84059d9c `f4fada13c3404b00aa500c6b58b3fbce44bdf7deab7a280cc08245b84e68e7ee`; Correction69dd725c `e7a37a374fc488868bb055655c978121cb78c352147fd999ca6e567df6c27685`; Correction2263690a `14b1ea247f3cfecf47f8914097cbbc0268e1aa41c11c48180af51fbf263ee892`; Submission34237367 `b3faadf096001964b5ebd7c70ab100bfa2f659970ff4a462b5837c80a39db704`. Equality concerns stored history workbook bytes, not a new full receipt audit.

Visuals: [minimum row with pending](navigation-minimum-pending.png), [usable append preserving pending](navigation-pending-append.png), [actual accepted reload lost local work](navigation-accepted-reload-blank.png).

### Structural gestures, native rejection and genuine ordinary paste

- Native row/column insert/delete/hide/show/resize, merge, Add sheet and sheet Move/copy were actually disabled. Trusted OLE/selection/header drags did not move five protected anchors. These are guarded affordances/no movement, not successful reorders.
- Historical prehidden row10 had actual height0; row11 visible height22. Selecting C10/Enter did not open a picker; no distinct zero-height pointer target existed. No hidden-target export was manufactured.
- Genuine visible C11 zero.BIN confirmation survived structural attempts and Cancel.
- An early failed clipboard attempt inserted a non-OLE drawing and native “Image URL is incorrect”. Actual Add row followed the normal draft Operation and rejected `invalid_template`, “External document resources are not allowed”. Pending zero.BIN survived; canonical blank/own versions0/references0. Reopen after explicit discard restored only original five controls and hidden row.
- Parent later proved external ordinary paste separately: actual native main-realm clipboard, clipboard-read/write/sanitized-write permissions, trusted Meta + `v` with native paste command. Native B10 became `NATIVEPASTE3652`, drawings stayed5. Held current text/plain clipboard restored only after observing paste; own overrides cleared. Successful whole-row/cell cut/move was **not** established.
- Original clipboard and permission state before the worker's earliest attempts were not captured; original restoration cannot be claimed. Later synthetic/current text was preserved. No clipboard contents published.
- Expanded native modal footer was below its iframe (bottom771 versus frame692); trusted header drag exposed Cancel. This observed UX boundary has no established source-causality diagnosis. No CSS/model bypass supplied a pass.

Visuals: [pending/placement](structural-final-pending.png), [native rejection with retained pending](structural-final-rejection-pending.png), [saved blank after discard](structural-final-discarded.png).

## N18 — Actual zero-width historical native artifact; cold initialization remains distinct

Two separately prepared historical Published fixtures failed to reach native editor during normal cold initialization: literal stored C width0/hidden, and positive stored width12/hidden. Literal-width0 editor-config returned HTTP500/internal_error; owned server stack was `Spreadsheet engine failed (-3)` at engine229 → spreadsheet-document175 → userEditorConfig416. The compatible fixture showed the same generic editor-load surface; a matching API status/stack was not independently captured. Cause is not established. Neither is certified safely rejected.

A second setup then reached the native surface without pretending cold initialization passed: copied the actual blank, initialized User Draft workbook into the owned already-created historical fixture Response; changed only worksheet column declarations, retained controls/protection, and explicitly seeded its initialized state before opening. No submitted status was changed, no live SDK model was mutated, and this is **not** publication/cold-initialization acceptance.

Actual final-source native observations:

- C rendered width0; C10 rectangle width0; both C drawings extX0. D rendered width96; D10 shares C's x coordinate but has positive width. Five controls and worksheet protection remained.
- Trusted actual visible D10 Edit object and genuine zero-byte FileChooser followed by local confirmation produced pending **rows.other**, not rows.proof. Physical adjacent target did not alias to the hidden slot.
- Namebox C10 selected physical row9/col2 and opened no picker; no distinct hidden-column pointer region existed. This proves geometry/non-activation and visible adjacent coupling, **not** a hidden-target invocation or invalid-hidden-export rejection.
- Explicit local discard exited without attachment Save/Submit.

Evidence: initialized fixture provenance and failed cold-fixture record in the typed bundle; [actual hidden column with visible adjacent controls](native-hidden-adjacent-confirmed.png). Hidden-target invocation/export remains unverified, not a generic unsupported label or a claimed safe rejection.

## Final support/remaining boundary

| Area | Supported local evidence | Not certified |
| --- | --- | --- |
| Naming/admission/receipt warnings | Existing246 HTTP cases; N02/N06 normal same-number rounds/history; N11/N12 real native differentiated warnings | Real DCM overwrite/settlement/isolation; broad foreign-role native matrix |
| Minimum row/controls | Four contracts N03; pending/removal/invalid/zero and two-column extensions N15/N17 | Every contract × every pending/invalid/racing permutation as native UI |
| Physical/native mapping | Actual sparse rows/two columns, invalid drawing rejection, guarded gestures, real ordinary paste, zero-height/zero-width/adjacent-target observations | Successful forbidden structural mutation, hidden-target invocation/export, successful cut/reorder/cross-sheet mutation |
| Navigation | Actual candidate/confirmed/ordinary Stay/Escape/discard, Back/reload/close prompts and actual local loss | Guaranteed browser prompt/File recovery; full-browser Cartesian matrix |
| Loading/unknown/continuation | Actual inert/status/focus/duplicate guard, after-store HOLD/saved copy/reentry, exact lost-ack checkpoint reconciliation, stale-projection next Save, before/after continuation-config bug, eligible Correction/later chooser | Later confirmed-removal after capture and all queued-generation/Correction combinations through actual native gestures |
| Security/history | Existing authenticated HTTP boundary suites, protected projections, immutable snapshots and authorized read-only Viewer | Production deployment, old-data inventory/remediation, provider-wide type/size support |

The unexecuted native cells above remain **unverified**, not PASS. Runtime-prohibited mutations were not forced to manufacture proof. This is an explicit report under the approved support-matrix rule, not new business policy or approval to shrink acceptance. Tickets03/06 remain needs-info; human review of these limits is pending.

## Integration review — separate axes

### Standards Review

Fixed target was the non-empty merge-base diff from838056b to3652d7a, with both review axes using the same commit list. One hard P2: confirmed B commit could be falsely labeled unknown when continued editor-config retrieval/validation failed outside its catch. Fixed in627d789; actual native failing-before/passing-after N10 plus regression cover it. One non-blocking Duplication note concerned repeated hold sends; same fix reuses the existing local blocked-continuation path. No new abstraction or safety weakening. Open code findings from that review:0. This is not provider/human acceptance.

### Spec Review

Same hard P2, fixed with N10 evidence. No second code defect was asserted from the existing P2034 observation. Native partial matrix and external07–10 HOLD remain recorded; no full-spec acceptance is claimed. Open code findings from that review:0; evidence/acceptance gates remain open.

## Verification and risks

- Existing HTTP consumer seams:246 unique cases /16 files /10,957 assertions, including explicitly enabled table/history/Correction/hyperlink gates; server production semantics unchanged by later native/host fixes.
- Spreadsheet unit118 tests/324 assertions; native builder/buttons14/264. Plugin final production source343 tests/25 files.
- Final configured web runner: lifecycle12 tests/76 assertions plus282 Vitest tests/19 files on c91472d. Correct browser-DOM runner used; an earlier direct Bun UI invocation lacked DOM/sessionStorage and is not a passing check or product defect.
- Final root check-types:5 successful tasks,4 cached. Build, root scoped formatting/lint and workflow generation/visual/check results are recorded in the parent final report after those commands complete, not presumed here.
- Runtime integrity/security checks remain. Local workbook/literal-byte assertions do not reintroduce removed provider byte comparison or aggregate-capacity workload. Provider type and size remain per button, separate dimensions.
- Earlier immediate whole-Response deletion during concurrent cleanup returned P2034/40001 HTTP500. SERIALIZABLE/advisory-lock source predates baseline; causal worsening was not proved. No external DELETE from that failed request was observed. No retry/isolation weakening added; later passes do not settle that availability interleaving.
- Cold hidden-column initialization errors, native modal clipping and earliest clipboard-state uncertainty are reported above. No fix or provider acceptance is inferred from a workaround or a different fixture.
- No real DCM call/DELETE, old-data audit, push or deploy. Exact allowed real test base remains `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45)`; missing destination/account/known-file and cleanup/DELETE boundaries are not invented. Provider gates07/08, settlement09, inventory10 and pyw1tt human acceptance remain HOLD.
