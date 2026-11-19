# 06 — Integrated HTTP/browser/ONLYOFFICE acceptance

Status: needs-info  
Execution date: 2026-11-19 (browser timestamps displayed in Asia/Bangkok)  
Disposition: **partial local acceptance; not release, provider, old-data or human acceptance**.

Initial worker N01–N08 and their source hashes remain historical evidence below. The [parent final supplement, N09–N18](acceptance/06-native-final/report.md) records subsequent native work, review fixes and the current bounded disposition without relabeling those earlier runs. Ticket06 remains needs-info; passing HTTP suites or a subset of native journeys does not close the whole native matrix.

The [local continuation from1071d3c](#local-continuation-from-1071d3c--2026-11-19) adds cold hidden-row/column fixes, genuine keyboard activation of collapsed OLE targets, native snapshot evidence and a bounded deletion-conflict correction. It does not relabel N01–N18 or close the remaining native/provider/human gates.

## Authorization, environment and provenance

- Only parent-owned isolated databases, bucket and synthetic provider were used. Browser origin: `http://localhost:18098`; synthetic provider/control port 18697; native application backend 18698. Parent HTTP suites used a separate database/callback port 18699. No real DCM/PDMS call, real DELETE, push or deploy occurred in this worker's work.
- Browser: actual `Chrome/150.0.7871.24`; UA reports Chrome/150.0.0.0 on Macintosh. Native editor: ONLYOFFICE `9.4.0-129`, served by the existing isolated gateway. Viewport 1365×768, device scale factor 1.25.
- Worktree `/tmp/folio-ecm-safety-838056b-06`, branch `feat/ecm-safety-06`, initially based on `1affbc0`, with that integration ancestor confirmed before work. Before handoff it fast-forwarded to delivery integration `65633504510d7c862a06522895671414a4b220f2`.
- Main native mutation journeys below ran on `1affbc0` **plus existing formatting-only Working Tree bytes later committed as `8819763`**. They are not reported as a clean `1affbc0` run. `0db0b4d` subsequently added provider-assessment documentation only.
- Native startup produced a real false-dirty finding. Parent fixed it in `6563350`. Only the specifically listed clean-start/real-edit checks were rerun on that new native plugin. Earlier complete journeys were not silently relabeled as a full `6563350` rerun.
- Final source observation: root HEAD was `65633504510d7c862a06522895671414a4b220f2`; `git diff --name-only -- apps/onlyoffice-plugin/src apps/server/src apps/web/src` produced no paths. Final canonical read used those committed bytes. Running server/Builder semantics did not change with the startup-only plugin fix; parent supplied suite provenance separately below.
- Hindsight Bank `pdms-knowledge`: **skipped**, because mounted recall selectors do not expose the required bank/types/budget selectors. No bank writes. There are no retrieved `document_id`, `chunk_id`, `source_path`, `stable_document_id` or source revisions to report. Local Markdown and current source are separate evidence.
- Intended policy owners read: [approved implementation spec](spec.md), [naming owner](../ecm-attachment-safety/spec.md), [safety index](../ecm-attachment-safety/map.md), [native matrix](../ecm-attachment-safety/issues/04-native-table-editing-support.md), [navigation/loading](../ecm-attachment-safety/issues/07-pending-navigation-warning.md), [receipt reasons](../ecm-attachment-safety/issues/09-duplicate-name-guard-policy.md), root `CONTEXT.md`, ADR 0003/0004 and tracker/domain conventions. These are repository Markdown snapshots, not Production evidence. The implementation effort has no `map.md`; its spec links to the original safety index. Original nine Wayfinder tickets were not changed.

### Worker handoff source SHA-256 — historical 6563350

| File | SHA-256 |
| --- | --- |
| `apps/onlyoffice-plugin/src/spreadsheet-upload-poc-activation.js` | `ca8c0de2d17eb417e59912d7d6853e46cfcc6d76f063f9b66c077a75beb86cdd` |
| `apps/onlyoffice-plugin/src/spreadsheet.js` | `69631b5631d661e3f21c4a9f2760c92942ff8b0503874ea087b5bbfd276bb46d` |
| `apps/onlyoffice-plugin/src/operations.js` | `6576eb46541a5c2d29b96da7fd75f05ce5327225770d08ce3d48f63d1733a654` |
| `apps/web/src/components/onlyoffice-editor.tsx` | `0bdc2d939f8e5fa0d1ae5f8eccc903c2ba91c02a228df0758c3672a3dfe21703` |
| `apps/web/src/features/onlyoffice/upload-poc-pending.ts` | `15730a3a614e03db75581c72736ccbf1496b8f95cae9f5dbba6ffd84d0c5bcbd` |
| `apps/server/src/ecm/attachments.ts` | `8229ec48c55b48d3cfc53fde578d9d40cc1a7645f73a6a8d41746d2f1fdee685` |
| `apps/server/src/ecm/identity.ts` | `112b08d1e5e078c439e9b7180a18c6e4ca1452fd5ec969215ccf23e0086617e2` |
| `apps/server/src/responses/editor.ts` | `c0102672264cfb3baaa820af5ea142ae140398152c9c0aa18f45487011928783` |

## Worker-observed native evidence

All file choices below used actual disk-backed `input[type=file]`, or an actual previously opened Puppeteer FileChooser. OLE entry used a real pointer context menu and **Edit object**. Modal Save/Cancel/X were native controls. Ordinary input used native keyboard input and visible cell/formula evidence. No invented bridge messages, router events, manual submitted-status flips or intercepted auto-start were used.

### N01 — Visible subsequent Save and ordinary native edits

- Existing User template Draft held `original.BIN`, four bytes. Selected B10, established visible `AFTER06` in the native cell and formula bar **before** pressing host Save Draft. Canonical JSON subsequently contained `rows[0].item = AFTER06` and the original four-byte scalar receipt. Synthetic provider remained at one POST, zero DELETE.
- This resolves the handoff's earlier unsuccessful `AFTER` input attempt: that earlier attempt never established visible input. It is not evidence of a capture failure.
- Ordinary no-attachment Form retained one body row and `KEEP ROW`. Typed `EDIT06`; native Undo restored formula value `KEEP ROW`; native Redo restored `EDIT06`. Escape/explicit discard left the saved canonical `KEEP ROW` untouched.
- Screenshot: [visible AFTER06, receipt URL redacted](acceptance/06-native/after06-visible-before-save.webp).

### N02 — Three genuine normal same-number rounds

User Response `2ef31325-5dfc-4d6c-9f0d-5de0b0942219`, template public ID `cf959ee7f89b463ea74f8271734a9e46`:

| Round | Journey | Saved scalar | Saved table | POSTs added |
| --- | --- | --- | --- | --- |
| 1 | Existing saved Draft → normal browser Submit | `original.BIN`, 4 bytes | ordinary `AFTER06` | 0; reused original POST |
| 2 | Unintercepted default blank next round → select files → direct browser Submit; no intervening Draft save | `replacement.BIN`, 3 bytes | `rows.proof`, `zero.BIN`, 0 bytes, physical `row_index: 0` | 2 |
| 3 | Unintercepted default blank next round → select files → direct browser Submit; no intervening Draft save | `zero.BIN`, 0 bytes | `rows.other`, `original.BIN`, 4 bytes, physical `row_index: 1`, preceding physical row empty | 2 |

Every upload used exactly `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).BIN`. No generated suffix or number/template change. Normal auto-start opened another blank Draft after each Submit; canonical JSON of the next Draft had no inherited scalar attachment/number. The first Submit deliberately reused the already saved Draft; subsequent rounds were submitted directly.

Actual authenticated canonical reads plus stored XLSX parsing established three immutable Submissions with scalar sizes `[4,3,0]`, distinct paired-receipt fingerprints, reference counts `[1,2,2]`, and physical-row positions `0` and `1`, not compact answer indices. This is not merely a count of distinct tokens. Every surviving original read from the controlled provider matched the independently specified literal fixtures `[11,22,33,44]`, `[55,66,77]` or empty bytes.

### N03 — Minimum row and old contracts

- Template: selected B11, deleted two body rows to one through Folio. Native delete became disabled with the minimum-one-row reason. Survivor B10 remained `AFTER06`; C10/D10 retained both configured controls. Appended back; no additional provider write. Round 1 then submitted the surviving answer.
- Ordinary no-attachment contract: existing one-row `KEEP ROW` showed the same disabled delete/reason. Ordinary Undo/Redo remained usable, and discarding those edits preserved canonical data.
- Old Published PoC: three rows reduced through genuine selected-row actions to one. Delete disabled with the reason. Plugin explicitly explained that old buttons require Admin configuration of a new Form and accept no file selection. No durable attachment fallback and no provider dispatch.
- Durable legacy: two rows reduced to one; same disabled reason, scalar and both table-column controls visible. Subsequent native Save retained one body row and legacy UUID naming, independently of template naming.
- This does **not** cover every pending/removal/invalid-state last-row permutation, racing direct request, or every contract's append/Submit/reopen combination natively. Those remain native gaps even where HTTP supports them.
- Screenshot: [legacy minimum-row controls](acceptance/06-native/legacy-minimum-row.webp).

### N04 — Picker baseline, candidate navigation, loading and cleanup

Independent legacy scope established as `docs_number: LEGACY06`, `fiscal_year: 2567` before any upload:

1. Chose `original.BIN` as a dialog candidate. Exit opened the platform discard modal; Escape preserved the candidate. Native picker Cancel then restored an empty picker on reopen. No upload occurred from candidate/Cancel.
2. Chose and confirmed A, then host Save Draft uploaded four bytes under the frozen legacy UUID/category contract.
3. Chose/confirmed B (`replacement.BIN`, three bytes). Reopened: picker separately showed saved A and confirmed-pending B. Chose temporary C (`zero.BIN`), canceled, reopened: B remained. Repeated C with native title-bar X; B still remained. Neither action uploaded.
4. Held the explicit B Save at the actual controlled-provider request. Host Save/Submit/export/Exit were disabled; editor had native `inert`; a focusable `role=status`/polite live message held focus. Actual pointer/keyboard attempts did not focus/edit the iframe. Duplicate Save and app Exit clicks were rejected as disabled/inert. Only one replacement POST appeared.
5. Released the original delayed request once with controlled `delete-unknown` behavior. B committed. The initial postcommit DELETE returned controlled HTTP 500 and remained uncertain in Folio. Loading ended, B stayed usable, and the persistent warning stated that old public URLs might remain usable.
6. An unchanged ordinary Save and then actual page reload preserved that warning and added **no** POST or DELETE. B's canonical JSON retained three bytes and `LEGACY06`/2567; no `MUSTNOTWRITE06` keyboard attempt entered canonical data.

This synthetic DELETE is not real-DCM DELETE evidence. Browser close/refresh prompt behavior for unsaved Files was not exercised; only a saved-copy cleanup reload was exercised.

### N05 — Actual native guard, not a fake capture

In a separately established template Draft case `NATIVE-GUARD06`, confirmed scalar/row pending files included a zero-byte first-row file and a second-column/second-row file.

- Actual native toolbar attempts at ascending/descending sort, filter, merge, insert cells and delete cells were disabled/inert.
- Actual mapped-row context menu exposed Insert row above/Delete/Hide/Show with native disabled classes. This demonstrates those visible affordances, not all shortcut or prehidden-geometry combinations.
- Actual Cut/Paste toolbar actions produced a locally misplaced/duplicated managed drawing. Host Save failed saved-button/position/Tag validation **before any provider dispatch**. Host/plugin retained pending notices and the native editor; reopening the first-row picker still showed the zero-byte pending file.
- Native Undo did not make that altered workbook admissible: another Save again failed before dispatch. Setting the provider to `unknown` during that rejected attempt created **no unknown upload** because no request reached the provider. It must not be cited as unknown/checkpoint proof. Provider was restored to normal.
- A second real app tab did not transfer browser Files; original tab retained its pending notice. The second tab was closed. Explicit local discard then exited the rejected local workbook; this did not settle any external request because none had dispatched.
- Screenshot: [failed native drawing capture before dispatch](acceptance/06-native/pasted-drawing-rejected-before-dispatch.webp).

Whole-row/column drag/cut-paste reorder, keyboard structural shortcuts, cross-sheet move and zero-geometry file targeting remain unverified; disabled toolbar observations are not substituted for those proofs.

### N06 — Eligible genuine Correction and later queued native candidate

Admin Response `930ee1e4-a807-41a7-8dd0-b69b66559d76`, independent number `CORRECTION06` established before upload:

1. Admin filled the actual User-facing native route, selected A and explicitly saved a normal Draft.
2. Used the actual **Download Excel** action to capture the live native workbook. A passive request observer retained its genuine snapshot URL privately. Called the existing authenticated multipart Submit HTTP route using that exact native opening's actual editor config/capability and captured URL. Polled its actual Operation to `completed`.
3. This is a distinct **HTTP Submit consumer journey**, not the normal browser Submit journey. It legitimately left the Response Submitted, without running the browser auto-next consumer. No automatic start request was intercepted and no database status was changed. The earlier three normal browser rounds prove auto-next separately.
4. Opened the authorized Admin Correction route. Actual plugin had **no row controls**. Reason was required. Selected/confirmed replacement B (three bytes).
5. Reopened B's picker without a new candidate. Clicked the visible native Choose control and held its **actual Puppeteer FileChooser** before pressing host Save Correction. Held the provider request, waited for B's actual POST, then accepted `zero.BIN` through that already-open chooser. This delivered a later real file-input candidate after snapshot capture; no bridge event was fabricated. It is a browser-automation interleaving, not a claim that every OS file dialog lets a human click behind it.
6. Released the original delayed request once. Correction 1 committed **B**, not candidate C. The same existing picker remained accessible with C's zero-byte candidate; route stayed open, warned that the old Correction was saved but newer work was not, and disabled another Save on its retired workspace. A real duplicate Save click was blocked.
7. Route Cancel opened explicit discard. Escape preserved C. Explicit discard exited. Opening a new current-revision Correction showed saved B and **did not transfer C**. Selected C again normally, plus C10 `original.BIN` and D11 `replacement.BIN`, then saved Correction 2 normally.
8. Canonical Submission/Correction reference counts were `[1,1,3]`. Original Submission remained A/four bytes; Correction 1 remained B/three bytes; Correction 2 contained zero-byte scalar plus two distinct physical-row/column files. All template POSTs used `CORRECTION06-ก่อหนี้-4_ขยาย(45).BIN`. No historical file was deleted.
9. Actual Admin results Revision chooser selected **Correction 1** after Correction 2 existed. Fields showed zero table answers, matching revision 1 rather than revision 2. Its actual Excel download differed from revision 2 and matched the selected-history consumer. Old User Submission 1 also displayed `AFTER06` and its original scalar receipt after later rounds.

Screenshot: [completed Correction with retained newer candidate and retired Save](acceptance/06-native/correction-completed-with-newer-candidate.webp).

### N07 — Real startup defect and bounded fix verification

Before any user input on a new native frame, passive root message observation recorded `onDocumentReady`, then `onDocumentStateChange(data:true)` about 1.1 seconds later, then `false` about one second later. Host nevertheless stayed dirty. After normal round 3 auto-start, a visibly blank fresh workbook prompted discard on Exit despite no user edit. Reported immediately to parent; not dismissed as a locator issue.

Parent's `6563350` scopes native activation lock writes with balanced History TurnOff/try/finally TurnOn and removes unnecessary recalculation, rather than suppressing dirty events. Parent owns its code/regression evidence.

On fresh **6563350** native opening of an owned prehidden historical-artifact fixture:

- Passive trace contained only onDocumentReady; host was clean before any keyboard/pointer mutation. Exit navigated directly to dashboard with **zero** discard modal.
- On another fresh opening, host was clean; actual keyboard `DIRTY06` in visible B11 made host dirty. Exit showed one discard modal. Stay retained the page; explicit discard exited to dashboard. Actual dirty-navigation safeguards therefore remained operational.
- The fixture has hidden physical row 10 and visible row 11. Its setup is a synthetic historical Published-artifact clone, **not** publication acceptance. No attachment file-target upload in that hidden geometry was executed.
- Subsequently, an actual normal browser Submit on656 used Admin's existing `CORRECTION06` number and a required zero-byte scalar. Normal automatic next-round startup ran without interception. The untouched new workbook was clean; Exit navigated directly to dashboard with zero discard modal. This specifically verifies the same-component automatic-next lifecycle, not merely a full-page remount.

Historical failure screenshot: [blank auto-next incorrectly dirty before fix](acceptance/06-native/third-submit-blank-auto-next-dirty.webp). Do not use it as evidence of current `6563350` failure.

### N08 — Final-source invalid selection and independent baseline

On656, Admin's separate legacy Response `0f428025-d045-45fa-a4d8-f7c105452b14` established `UNKNOWN06`/2567 before its first upload, then normally saved `original.BIN` four bytes. The name is a scenario label, **not** evidence of an unknown outcome. Actual input selection of a 10,000,001-byte file was rejected by the picker with slot/size guidance, preserving saved A. Dialog Save followed by unchanged host Save added no provider write. This proves picker rejection, not a confirmed-invalid-host-pending permutation.

At handoff, that saved-A picker remains open. A Remove text locator matched no element; no removal was staged, and this locator failure is not a product finding. No child-created unknown upload checkpoint exists. Parent receives the live tab and exact private continuation state without discarding work.

## Canonical artifacts and transport audit

[Sanitized canonical evidence](acceptance/06-native/canonical-evidence.json) records seven synthetic Responses, fourteen actual saved workbook snapshots, named ranges, body-row counts, ordinary cells, redacted answer JSON, exact document/reference keys, version/row records, paired-receipt SHA-256 fingerprints, original-byte SHA-256 and provider method/name/size events. Assertions independently checked literal original fixture bytes, three User scalar round sizes, `[1,2,2]` User Submission reference counts, `[1,1,3]` Admin initial Submission/Correction reference counts and physical indices. The later656 Admin normal Submission adds one further reference; its new Draft is empty. Actual raw receipts/URLs/tokens and original attachment bytes are not committed.

Final controlled provider: **14 POST, 1 DELETE**, normal mode. Breakdown: five primary normal-round uploads; User legacy A/B (two); Admin Submitted A (one); Correction 1 B (one); Correction 2 scalar/tables (three); post-fix Admin normal Submit (one); independent Admin legacy A (one). Only DELETE was the explicitly controlled uncertain postcommit cleanup of User legacy A. No DELETE targeted an immutable historical survivor. Picker, oversize rejection, row, guard-rejection, read/export, unchanged Save/reload and local discard added no write.

Actual UI-downloaded workbooks, kept privately during the run:

| Selected artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| User oldest Submission 1 Excel export | 9,161 | `d214c4b3cea377c0ef729a103a7a59d603dd9f34060b39ec3e7e8ab2136c6d36` |
| Admin native current-Draft capture before genuine HTTP Submit | 9,229 | Not separately hashed; do not infer identity from size |
| Selected older Correction 1 Excel export | 9,146 | `ddab36eed1c933880b0abe5711723dee57e6235f2b31465ca8f2cdd940cb2ca9` |
| Selected current Correction 2 Excel export | 9,303 | `c5584cf802b811bc05fc1432550ea772a034311350a2709f8ed3edb6f834e10f` |

Stored canonical XLSX and rendered exports are deliberately different artifacts; the manifest hashes each stored workbook separately. No equality between a projected export and canonical package is assumed. Raw workbook downloads contain private synthetic receipt URLs and are not committed. Images are originals except the explicitly blacked-out receipt URL in the AFTER06 image.

Temporary runtime additions requiring parent-owned final cleanup: `native06-evidence.mjs`, `native06-canonical-evidence.json`, `seed-hidden06.mjs`, `hidden06-fixture.json`, `oversized.BIN`; UI download files are under the browser's owned temporary download directory. The first hidden-fixture setup failed its manifest JSON-null shape constraint before creating a Form; its owned workbook object remains inside the isolated bucket for whole-bucket cleanup. Corrected setup reused the repository manifest helper and succeeded. The nondestructive second tab was closed. The reopened `safety-native-06` tab remains live with the saved-A picker for parent continuation; parent services/resources were not stopped.

## Parent-supplied integrated verification — separate provenance

Worker did **not** run Bun suites, build, lint or formatter. The following are parent-reported results, not independent native-browser proof:

| Scope | Reported result / source boundary |
| --- | --- |
| Full existing scalar/table/Correction/unknown/reference HTTP suite | 160 pass, 8,325 assertions, approximately 398 seconds; same server/Builder bytes subsequently committed as `8819763` and unchanged by `6563350` |
| Surrounding actual-app HTTP suites | 72 pass, 1,327 assertions across 14 files: ECM auth20, attachment authoring18, legacy PoC1, Viewer13, submission history2, initialization5, editor export6, preserved session2, spreadsheet resubmission1, callback1, native scalar3 |
| Initially gated surrounding HTTP runs | Initial skips are **not PASS**. Subsequently enabled: PDMS table4/236 assertions; table-history3/581; Correction6/306; hyperlinks1/182. Hyperlink hooks contributed initial skip counts, not extra tests. Parent ran local-only fetch guards. |
| Plugin | Full 339 pass across 25 files; startup fix additionally had reported RED3 then GREEN7 and full339 on `6563350` |
| Native Builder/buttons; spreadsheet unit | 14 pass/264 assertions; 118 pass/324 assertions |
| Web configured package runner | Lifecycle12/76 assertions; Vitest UI274 across19 files. Initial incorrect Bun UI runner lacked DOM/sessionStorage and is not a product failure or passing run. |
| Types/build | Types5/5 (server fresh, four cached); build3/3 (web/server fresh, one cached) |
| Scoped format/check/workflow | Parent reported scoped root checks; workflow build/check, 22 images/312 sources, generated HTML visually inspected with all22 images loaded; startup fix refreshed/checks22 again |

Principal HTTP owner: `apps/server/test/http/ecm-scalar-save-submit.test.ts`. Named supporting cases include three normal template rounds; same-name foreign Responses; template Correction history; split aliases; own-Draft receipt conflict; protected-history conflicts; original retrieval/redirect/size/digest checks; physical gaps/zero-byte/row transitions; postcommit warning; negative checkpoint fencing; late receipt/restart; reference-versus-delete races. Minimum-row consumer coverage additionally uses enabled `pdms-project-table-history.test.ts`. Test names/source plus parent execution support those HTTP claims; they do not fill missing native gesture cells.

## H01–H10 / U01–U06 disposition

| ID | Evidence and limit | Status |
| --- | --- | --- |
| H01 | N02 normal browser rounds plus parent three-round HTTP; N06 distinct eligible Correction journey | supported locally, source-bounded |
| H02 | N02/N06 same-base scalar/table receipts; N03 legacy UUID; literal suffix/extensionless/foreign cases parent HTTP only | supported HTTP; partial native |
| H03 | N01/N02/N06 canonical workbook/JSON/references and literal original bytes; selected older UI exports; metadata-number change parent HTTP only | supported locally within exercised paths |
| H04 | Parent explicit alias/receipt-conflict HTTP models; native Q3/Q4 messages not exercised | partial |
| H05 | N05 rejected native capture no dispatch/pending retained; parent atomic failure/unknown/checkpoint cases; no actual native unknown created here | partial |
| H06 | N01–N06 no-extra-dispatch observations; parent internal project/workspace/reuse cases | supported within named paths |
| H07 | N03 four-contract minimum-row native affordances; parent enabled minimum-row HTTP; complete native pending/removal/invalid/race matrix absent | partial |
| H08 | N02/N06 physical gaps/two columns/zero bytes and exact originals; N05 real invalid drawing rejection; parent row/slot/reference cases | partial native combinations |
| H09 | N04 uncertain old cleanup and persistent warning/no retry; parent unknown/lost response/restart/late receipt cases | partial native unknown/recovery |
| H10 | Parent auth/Viewer/callback/capability/limits/reference races; local native roles and canonical byte assertions; earlier immediate-deletion serialization observation remains separate | supported HTTP, not a universal race proof |
| U01 | Four contracts show one-row delete disabled; template delete/append; old PoC3→1; legacy save; other state permutations absent | partial |
| U02 | Real disabled toolbar/context affordances, ordinary Undo/Redo, rejected misplaced drawing, retained zero pending and no writes; remaining gesture/hidden/saved-removal combinations below | partial |
| U03 | Real candidate/B/C Cancel/X, navigation Escape/Stay/discard, nondestructive new tab; fixed clean open vs actual edit; browser back/refresh/close candidate matrix absent | partial |
| U04 | N04 actual inert/focus/keyboard/duplicate/navigation/loading and persistent cleanup warning; actual unknown spinner-to-HOLD/reentry absent | partial |
| U05 | N05 failed capture retained pending; N06 genuine later FileChooser candidate/retired workspace/discard; native Q3/Q4 reasons and later confirmed removal generation absent | partial |
| U06 | N01/N02 actual save/three normal rounds and N06 actual eligible Correction/selected history; broad journeys prestartup fix, only bounded startup retest on656 | partial final-source matrix |

## Story traceability — no omitted US01–US90

`N` refers to worker-observed scenarios above. `HTTP` refers only to parent-reported passing existing consumer suites. `Pending native` means no browser/editor PASS is asserted.

| Stories | Evidence / precise remaining boundary |
| --- | --- |
| US01–03 | N02 three same-number normal rounds, no Draft-save workaround in rounds2/3; N07 actual656 normal Submit/default-next clean Exit |
| US04–08 | N02/N06 original-request scalar/table/Correction receipts; foreign Responses/multiple scalar slots HTTP; native foreign-Response matrix pending |
| US09–12 | Native uppercase `.BIN` retained; other casing/extensionless/literal template/unsafe names HTTP only |
| US13–16 | N02/N06 original paired-receipt fingerprints/canonical JSON/references/selected old UI download and literal bytes |
| US17–22 | N01 unchanged save; N04 picker/unchanged/no-year/legacy save; N03 old PoC; N06 read/export/workspace; number/year-only changes HTTP only |
| US23–28 | Same-name distinct receipts N02/N06; Q3/Q4/precedence/partial aliases HTTP. Native differentiated warning matrix pending |
| US29–32 | N05 slot/configuration failure surfaced; exact permission-safe history/Draft conflict details are HTTP evidence only; native Q3/Q4 pending |
| US33–35 | N05 failed workbook no dispatch/retained pending; N06 captured snapshot excludes later C. Actual native unknown preservation and no-rollback wording pending |
| US36–40 | N04 postcommit warning/no retry and N06 historical survivors; provider failure/unknown/checkpoint/recovery HTTP only; no worker-created native unknown checkpoint |
| US41–43 | N03 all four contracts native disabled minimum-one-row reason |
| US44–48 | Trusted current/direct/race/revision/last-row preservation HTTP; N03 template2→1→append; native full saved/pending/removal/invalid permutations pending |
| US49–51 | N03 displayed both controls at minimum row and append; N06 two-column use; native saved removal/control-retention combination pending |
| US52–54 | N02 physical row0/1 and attachment-only zero rows; exact references and bytes. Surviving pending/removal during add/delete combinations HTTP, not complete native matrix |
| US55 | N06 actual eligible Correction had no row controls |
| US56 | N01 actual ordinary native keyboard/Undo/Redo. Ordinary external paste combination pending native |
| US57–58 | N05 actual local drawing misplacement rejected before write, visible sort/insert/delete controls disabled. Whole-row/column drag/reorder/native shortcut combinations pending |
| US59 | N05 actual pasted managed drawing did not become canonical and could not dispatch. Plain client URL handling HTTP; actual URL-paste native combination pending |
| US60 | N05 visible hide/filter controls disabled. Prehidden row fixture prepared; actual hidden/zero-geometry file targeting not executed |
| US61 | Visible merge disabled N05. Cross-sheet move/merge keyboard sequences pending native |
| US62–63 | N05 failed transition kept pending, second tab did not transfer File. Reconnect/stale lease/ambiguity HTTP; actual reconnect matrix pending |
| US64–66 | N04 savedA/confirmedB/candidateC, Cancel and native X preserve B; N06 newer chooser candidate distinct from saved revision |
| US67–69 | N04 candidate navigation/Escape, N01 ordinary discard, N06 retired Correction Escape/discard. Full route/back/removal matrix pending native |
| US70 | N05 nondestructive new tab retained original Files; N07 fixed clean opening and actual automatic next round both exit without modal |
| US71 | Native browser beforeunload refresh/close/File-loss demonstration not executed; HTTP and source do not substitute |
| US72–74 | N04 actual inert/status/focus/keyboard/pointer/duplicate/navigation attempts and confirmed completion; N05 confirmed failure ends busy and retains work |
| US75–77 | Native actual unknown/checkpoint/reload/reentry not executed; parent HTTP only. A mapping rejection with zero dispatch is explicitly not unknown proof |
| US78–79 | N04 B committed, warning survives unchanged Save/reload, no repeated DELETE, editing/export controls remain available |
| US80–81 | N06 genuine preopened chooser result after captured POST; savedB/newC separation, no remount, retired Save blocked, Escape/discard, fresh Correction requires explicit reselection. Newer confirmed-removal variant pending native |
| US82–84 | Actual canonical manifest/HTTP provenance/native actions separated from provider evidence throughout this report |
| US85–87 | Owned by provider per-button ticket08; local0-byte native paths and HTTP limits do not satisfy real provider type/size matrix. No extra aggregate provider workload added |
| US88 | Existing HTTP actual-byte/JSON/integrity/reference checks retained and parent reports suites passing; worker literal-byte assertions supplement, not replace runtime security |
| US89 | No old-data audit/remediation authorization/result. Old synthetic fixtures are not live old-data inventory |
| US90 | Source/environment/version/actions/evidence distinctions recorded; pyw1tt human acceptance still pending |

## Remaining acceptance prerequisites / HOLD

1. Continue on the final integrated source with explicit native case scopes established before upload. Complete actual unknown upload/checkpoint/no-resend/saved-copy/reentry; do not rename a held request or clear its checkpoint.
2. Exercise native Q3 protected-history versus Q4 own-Draft messages, permitted reference details and pending/canonical preservation with deliberate original-receipt models. HTTP PASS is not native host/plugin proof.
3. Finish native saved/pending removal/confirmed-invalid selection/zero-byte and two-column add/delete/minimum-row permutations, newer confirmed-pending/removal generations, gesture combinations, actual ordinary paste, native shortcut reorder/drag/cross-sheet and prehidden/zero-geometry file targets. N08 exercised actual 10,000,001-byte picker rejection with no dispatch; hidden file targeting remains unexecuted.
4. Finish full route/back/refresh/close/best-effort prompt/File-loss behavior, without suppressing real edits or inventing browser guarantees. Default-next-round clean navigation on656 is now specifically verified in N07.
5. Preserve the independently observed immediate whole-Response deletion/P2034 serialization interleaving from the handoff. Passing later fixtures do not prove that interleaving cannot return500. Parent owns assessment; no source retry/suppression was introduced here.
6. Tickets07/08/09 remain distinct provider/evidence gates. No real DCM settlement/DELETE isolation/all-type guarantee follows from this controlled provider. Old-data ticket10 needs separate access/provenance authorization. Human acceptance and any push/deploy authorization remain absent.

No permanent application code was changed by worker06. Parent owns the startup defect fix, suite execution and shared docs/system-map maintenance. This report and ticket preserve the remaining gaps instead of declaring the integrated native matrix complete.

## Parent final integrated disposition — 2026-11-19

Delivery application bytes: `c91472d94fb8ddd8c06f7c08ad2c7709674319b5`. Source implementation01–05 is integrated. Status01/02/04/05 is ready-for-human;03/06 remains needs-info. Provider07/08, settlement09, old-data10 and human acceptance remain separate HOLD. No real DCM/DELETE/push/deploy occurred.

The [final native supplement](acceptance/06-native-final/report.md) is the owner of N09–N18 and exact source/version/method limits. It adds actual retained-Draft next Save, failing-before/passing-after continuation-config failure, own-Draft/history warnings, upload uncertainty/saved-copy/reentry, lost acknowledgement with exact checkpoint, saved-receipt removal/minimum-row/invalid/independent columns, final Viewer/User surfaces, actual beforeunload/File loss, ordinary paste and native hidden geometry/adjacent-slot coupling. Earlier “pending native” statements above are superseded only for those named observations.

### Updated H/U disposition

| ID | Added actual evidence | Current boundary |
| --- | --- | --- |
| H01–H03 | N09 real subsequent Draft Save; earlier genuine normal three rounds/eligible Correction/history remain source-bounded | supported within exercised paths; literal-name variants remain HTTP |
| H04 | N11/N12 actual semantic own-Draft/history warnings, permitted context and canonical/pending preservation | supported named native warnings; foreign-role native combinations not certified |
| H05/H09 | N13 actual after-store unknown/HOLD/saved copy; N14 actual lost Folio acknowledgement/failed original lookup/exact checkpoint/reentry with no resend; N10 confirmed commit never mislabeled unknown after fix | supported named paths; not real provider settlement or every failure interleaving |
| H06 | N15/N17 local confirmation/row saves/discard; N14 lookup/reentry adds no upload/delete | supported within named paths |
| H07/U01 | N15 saved receipt removal plus invalid candidate/zero-byte/independent columns/minimum row; N17 verified pending-preserving append/delete | partial full native contract/state Cartesian matrix |
| H08/U02 | N17 real guards/drags/no movement/invalid drawing rejection/ordinary paste; N18 actual zero-width geometry and correct adjacent physical slot | no certified successful forbidden mutation or hidden-target invocation/export rejection |
| H10 | N16 final authenticated Viewer/User native surfaces plus existing HTTP authorization/reference checks | prior P2034/40001 deletion interleaving remains availability risk, not universal race PASS |
| U03 | N17 actual route/Back/reload/close Stay/Escape/discard and observed local File/ordinary-input loss; N14 original checkpoint survives local discard | supported named Chromium behavior; beforeunload remains best effort |
| U04 | N13 active inert/keyboard/loading then unknown/HOLD/reentry; N14 true lost-ack state; N10 known-commit blocked on config failure | supported named paths, no manual unlock/cancellation guarantee |
| U05 | N11/N12 warnings; N09 same-frame later candidate/protected projection/next Save; N06 genuine Correction/later chooser | later confirmed-removal after capture and all queued-generation combinations remain native-unverified |
| U06 | Final-source N09–N18 supplement earlier source-bounded normal/Correction/history journeys | partial broad final-source matrix; not complete-spec/release acceptance |

### Story-traceability delta

- US23–40/75–79: N11–N14 add real warning, upload uncertainty, saved-copy, original-checkpoint and known-commit observations. They do not replace provider settlement evidence.
- US41–55: N15/N17 add saved/pending removal, invalid/zero-byte, independent columns and verified row transitions. Full native Cartesian permutations remain unverified.
- US56–63: N17 adds actual ordinary external paste, guarded structural gestures and prehidden zero-height observations; N18 adds actual zero-width/adjacent physical targeting. Successful cut/move/cross-sheet mutations and hidden-target invocation/export remain unverified.
- US64–74: N15/N17 add pending/removal navigation and actual Chromium Back/reload/close/prompt/File loss. No browser File persistence or universal prompt guarantee.
- US80–81: N09/N10 add final Draft continuation/projection; N06 remains the bounded actual Correction/later chooser proof. Later confirmed-removal native interleaving is not asserted.
- US82–90: evidence/revision/privacy distinctions remain; real provider per-button type/size, settlement, inventory and human acceptance are still separate gates.

### Verification and review resolution

Observed:246 unique actual-app HTTP cases/16 files/10,957 assertions; spreadsheet-unit118/324; native Builder/buttons14/264; plugin343/25 files; final configured web282/19 files plus12 lifecycle tests/76 assertions; final root types5/5, four cached. HTTP server semantics did not change with the later native/host-only fixes. Earlier runner/fixture failures are not relabeled PASS.

Standards Review: one hard P2 and one optional duplication note, fixed627d789; open code findings0. Spec Review: same hard P2 fixed, open code findings0; partial acceptance gates persist. N10 supplies actual failing-before/passing-after evidence, not merely a mock response. No claim of provider/human approval follows.

Remaining risks are explicit in the supplement: cold hidden-column initialization error (literal-width0 HTTP500/engine-3, cause unproved); unverified hidden-target/queued-removal/native combinations; native modal footer clipping; earliest clipboard/permission state not backed up; and earlier concurrent-deletion P2034 availability observation. None was hidden by disabling integrity checks, weakening guards or inventing settlement.

Root build/lint/workflow generation, visual inspection and owned-resource teardown are recorded below only after execution.

### Executed final root checks and teardown

- Root `fix` and `check` passed across all40 integrated changed JS/TS/JSON source/test files. First final lint found a needless async callback in the new blocked-continuation test; removing only that async keyword fixed it. Correct configured web suite then passed again:282 UI tests/19 files plus12 lifecycle tests/76 assertions. Application bytes did not change.
- Root `check-types` passed5/5, four cached, after that test-only change. Root `build` passed3/3, one cached.
- `docs:workflow:build` and `docs:workflow:check` passed:312 runtime/deployment files,22 rendered diagrams,25 page declarations,104 API declarations,35 models. Actual offline HTML loaded all22 images; affected08/18/20/21 zoom-in/fit controls, source-link hrefs and current known-commit explanation were exercised. Rendered Correction flow was visually inspected. Source-link filesystem validation also passed.
- Published final supplement has13 original-format PNGs audited for possible complete file-URL pixels, valid local links and scoped typed evidence. No image-codec dependency added. Initial five worker WebPs retain their earlier separate audit/source.
- Removed13 clean merged owned worktrees and13 merged task branches using non-force removal and `branch -d`; retained delivery checkout/integration branch, original feature branch and unrelated/prunable worktrees. No global prune.
- Stopped only owned Vite/application/synthetic-provider services and removed only the owned gateway container. Its supervisor exit137 was expected from deliberate container removal, not an application test failure. All five owned listeners were closed; shared PostgreSQL5433, RustFS9000 and ONLYOFFICE8081 remained reachable.
- Disposable teardown deleted1503 objects in only `folio-ecm-safety-1426b49032`, verified that bucket absent, dropped only `folio_ecm_safety_1426b49032` and `folio_ecm_safety_http_1426b49032`, and verified both absent. This is synthetic resource teardown, **not** DCM DELETE acceptance, original-request settlement, or erasure of shared native caches. Private fixture/credential/probe files are removed as the final owned-directory cleanup.
- Original nine Wayfinder issue files had zero committed changes relative to the pre-work baseline. No push/deploy or real DCM call occurred. Local source/tests do not close03/06 native acceptance,07–10 evidence gates or human review.

## Local continuation from 1071d3c — 2026-11-19

Disposition: **local implementation and additional bounded acceptance, not whole-spec, provider or human acceptance**. Branch remains `feat/ecm-attachment-safety-implementation`, based on `1071d3c7c50293f8706597e850036e4a5f50e28b`; changes are uncommitted Working Tree bytes. Status01/02/04/05 remains ready-for-human;03/06 remains needs-info;07–10 remains HOLD.

### Source scope and provenance

- Changed application owners: shared `documents/spreadsheets/upload-poc-command.js`, `normalizeSpreadsheetUploadPocAnchors` in `upload-poc.ts`, and `responses/deletion.ts`. The existing native Builder and plugin share the same projection command; normalizer callers, API shapes, exports, schema, configuration and storage contracts are otherwise unchanged.
- Affected fixtures/regressions: plugin range mock supplies the real whole-row `GetHidden` API; the existing native runtime suite covers four hidden geometry variants and malformed hidden widths; the existing scalar HTTP suite covers the actual serialization/deletion consumer. No separate attachment service, retry mode or dependency was added.
- Dashboard deletion retains its existing failed-action dialog/Response and does not retry automatically. No frontend route or component changed, so the inherited web282+12 result is not presented as a newly executed web suite.
- [Sanitized typed evidence](acceptance/06-local-continuation/evidence.json) records final source SHA-256, earlier pre-format hashes, actual physical targets, source-stage limits, literal-byte assertions and transport counts. Width-only native journeys preceded the subsequent hidden-row extension; later final geometry checks supplement rather than relabel them.
- Runtime: owned isolated PostgreSQL databases/object buckets, synthetic provider18797, app18798, gateway18198, actual managed `Chrome/150.0.7871.24`, ONLYOFFICE `9.4.0-129` / `9.4.0-ae9ceb648960c9359d8339c7c6044e63`. All Forms/Responses/files are synthetic. Historical Published fixtures are explicit artifact clones, not new publication acceptance or live-data inventory.
- Hindsight session recall retrieved navigation context only. Bank `pdms-knowledge` discovery remains **skipped**, because mounted selectors lack bank/types/budget; `document_id`, `chunk_id`, `source_path`, `stable_document_id`, `source_revision/source_revisions` are missing. No bank writes. Local policy owners remain the approved implementation specification, original resolved native/final-row decisions and CONTEXT; current Working Tree source is separate behavior evidence.

### Cold hidden geometry — causal fix, not initialized-fixture workaround

Literal hidden column width0 failed inside the serialized projection, producing engine(-3). A positive stored width12 with `hidden=1` reached normalization but failed its zero-scale check. Actual native probes distinguished default-height `GetRowHeight=null` from explicit zero and established that `GetHidden()` must target a **whole row**; calling it on the individual cell incorrectly reports false.

The shared command/normalizer now retain a collapsed preview at its exact physical anchor when width or visible row height is zero. Hidden rows with positive stored height are also collapsed. Default rows keep their existing height fallback. Negative/nonfinite widths/heights, metadata, markers, physical bounds, worksheet/cell protection, receipt ownership and reference guards remain enforced. Malformed hidden widths `-1` and `NaN` are explicitly rejected.

Actual User cold opening of a historical row10 with `hidden=1`, `ht=0` first returned editor-config HTTP500 with no native frame. After the fix, the same route initialized normally. Native row10 had height0 and row11 height19; row10 C/D drawings had extent0×0 while row11 retained distinct positive controls. A separately cloned hidden row with stored `ht=22` also cold-opened with zero visible height/extent. Both stored column widths0/12 likewise cold-opened; C remained zero width and D retained its own physical target.

Visuals: [cold hidden column](acceptance/06-local-continuation/cold-hidden-column.png), [cold hidden row](acceptance/06-local-continuation/cold-hidden-row.png). These images contain no complete receipt URL pixels.

### Genuine keyboard file actions, row transitions and revisions

- Real pointer selection of a visible OLE followed by native **Tab** reached the collapsed OLE. Passive selection metadata established its binding and physical row. **Shift+F10 → Edit object** opened its actual picker. No SDK/model mutation, disabled-control bypass or fabricated bridge message supplied the target. Enter alone did not open the object and is not claimed as a supported activation shortcut.
- Width12 template Draft: hidden C10 received `original.BIN`4, visible D10 received `zero.BIN`0. Canonical JSON/references retained separate paired receipts at physical row0; controlled originals matched literal fixtures. An actual pending Excel-export attempt was refused without provider dispatch. After explicit Save, an actual UI Excel download was9166 bytes, had zero managed controls, and projected the canonical hidden/visible URLs correctly.
- The same template's earlier D11 saved three-byte file had a genuinely confirmed removal. Folio delete of B10 internally moved the survivor from row1 to row0, preserved its saved receipt and pending removal, retained the hidden/visible controls and disabled last-row deletion. Internal transition made no provider write. Explicit later Save applied removal, cleared the canonical URL/references and issued only its first eligible synthetic DELETE. One physical body row and all configured controls remained. [Minimum-row surface](acceptance/06-local-continuation/saved-removal-minimum-row.png).
- Actual User width0 Draft: keyboard targeted hidden `rows.proof` at physical row1, explicitly saved three bytes, then used normal browser Submit. Default automatic next-round startup was not intercepted. New Draft data was null, prior Submission retained row1/three original bytes, and untouched Exit went directly to Dashboard with zero discard dialogs.
- Actual eligible Admin Correction on the width12 template had no row controls. Eligibility used a distinct authenticated **HTTP Submit consumer** with the genuine native workbook snapshot/capability captured by the actual Excel-download action, not a status flip or suppression of browser auto-next. Final native Save Correction replaced hidden C10 with three bytes, reused visible D10 zero bytes and retained original Submission `[4,0]` separately from Correction1 `[3,0]`; all surviving controlled originals matched their literal fixtures. This is not a normal-browser Submit claim for that Admin setup.
- Final hidden-row User Draft: keyboard-selected hidden `rows.other` at physical row0 saved zero bytes; independently selected visible `rows.proof` at physical row1 saved four bytes. JSON/references/originals retained those exact physical targets, not visible or compact indices. On hidden stored ht22, a genuine candidate was canceled through native footer; clean Exit required no discard modal or write.

Later-stage controlled provider totals: **8 POST,1 DELETE**. No additional write came from keyboard selection, local picker confirmation/Cancel, pending export rejection, internal row transition, unchanged Submit/reentry, or the final candidate Cancel. The JSON artifact records exact event boundaries. An earlier in-memory provider restart lost three initial synthetic baseline files; no survival claim crosses that fixture reset. Before the later app restart, five actually retrievable provider files were checkpointed and restored with their original receipts/bytes solely inside the controlled provider model. This is not Folio File persistence, DCM restart proof or settlement evidence.

### Deletion serialization — accurate refusal before dispatch

The SERIALIZABLE snapshot is acquired by the advisory-lock statement before its wait completes. A cleanup transaction can commit while deletion waits, leaving the deletion snapshot stale. Execution serialization is therefore not proof of snapshot freshness.

Only a verified abort of the **initial database deletion transaction** (`P2034`, or `P2010` with SQLSTATE40001 through existing `isSerializationConflict`) now returns409 `operation_in_progress`. Response, references and tombstones remain uncommitted, and no ECM/object DELETE has begun. Postcommit cleanup keeps its existing separate outcome. No automatic retry, nonblocking-lock option or weaker isolation was added.

Worker's isolated causal probe reported500 before and409 after, preserved Response/reference, zero provider/object deletes on abort, then one successful explicit deletion and no duplicate deletion on an already-deleted call. Parent independently ran the actual HTTP regression with a real PostgreSQL advisory waiter:409, unchanged Draft/reference state, no provider writes, and explicit later deletion200. This does **not** guarantee every deletion completes without contention; a caller may have to review and explicitly request deletion again.

### Executed checks and remaining boundary

| Check | Observed result |
| --- | --- |
| Full actual-app scalar/table/Correction/unknown/reference/deletion HTTP owner |161 pass,0 fail,8,809 assertions;437.61s; local-only outbound guard |
| Final deletion conflict case |1 pass,34 assertions;160 filtered out, not skipped/PASS |
| Native runtime/button suite |7 pass,267 assertions, including widths0/12 and heights0/22 plus malformed hidden widths |
| Full plugin suite |343 pass across25 files |
| Spreadsheet unit suite |118 pass,324 assertions |
| Root scoped format/lint |6 affected JS/TS source/test files passed |
| Root types |5 successful,4 cached |
| Root build |3 successful; final build had2 cached |

Initial native regression assertions selected anchorless legacy AlternateContent fallbacks and failed before being corrected to inspect authoritative previews. Initial lint also rejected non-null assertions, an unnamed regex group, sequential test-loop awaits and one await-member assertion; fixtures now use guarded reads and independently parameterized native cases. These failures are not relabeled as application defects or PASS. Intentional broken-stream fault injection logged `truncated` during the passing HTTP suite.

Native footer investigation remains bounded: immediate viewport768→600→520 samples showed footer within frame692/524, then footer bottom466.47 below frame444 at520. Native focused Cancel/Enter still canceled safely. No settled-window guarantee or causal Folio/native-window layout fix is claimed. Historical clipping remains a risk.

Supported additions narrow the previous hidden-target gap to the named actual keyboard/physical-target cases above. Full filter/combined hidden geometry, all role/contract/gesture permutations and later **confirmed-removal after captured Correction** remain unverified. Disabled commands were not forced, and no fake late bridge event was used to close them.03/06 stays needs-info, without shrinking the approved matrix.

Provider07/08, original-request settlement09, old-data10 and pyw1tt human review remain separate HOLD. No real DCM/PDMS call, real DELETE, live-data audit/remediation, push or deploy occurred. The nine original Wayfinder tickets remain untouched.

### Continuation artifact verification and owned teardown

- Final native regression asserts malformed geometry rejection by error type, not pinned error wording; the final native run passed 7 cases. Final scoped lint passed. The final minimal deletion promise/catch boundary passed its targeted HTTP case again (1 case, 34 assertions), types passed (5 tasks, 4 cached), and build passed (3 tasks, 2 cached). Full 161-case HTTP provenance remains the earlier run above; later edits to that path only separated the promise binding and removed an incidental await-member assertion.
- Updated CONTEXT and system-map sections 08/10. Workflow build/check passed: 312 runtime sources, 22 diagrams, 25 page declarations, 104 API declarations and 35 models. Actual offline HTML loaded all 22 images; sections 08/10 were inspected at full size, zoom/fit exercised, cold-init/zero-area and commit-versus-409 branches visually read, and source-link hrefs inspected. The original nine Wayfinder issue directory compared unchanged against `1071d3c`.
- Before teardown, eight surviving snapshot references to seven distinct controlled resources still matched independently specified literal originals. The typed evidence retains that final audit without receipt URLs/tokens or original bytes.
- Closed only the owned native/guide tabs. Stopped owned Vite/app/provider/gateway; the gateway's supervised exit 137 followed deliberate Docker stop, not an application test failure. All five owned listeners were closed; shared PostgreSQL (5433), RustFS (9000) and ONLYOFFICE (8081) remained reachable.
- Deleted only the owned native bucket (13 objects) and HTTP bucket (441 objects), verified both buckets absent, dropped only the two owned databases and verified zero remaining. Removed the private runtime/credential/provider/probe directory, its four exact probe workbook outputs, owned browser downloads and ten exact temporary screenshot paths after preserving three visually audited evidence PNGs. Shared containers/data and native caches were not erased.
- This teardown is synthetic resource disposal, not DCM DELETE isolation, original-request finality or provider/human acceptance. Native matrix/footer limits and 07–10 HOLD remain unchanged.

### Combined native matrix continuation — 2026-11-19

[Sanitized evidence](acceptance/06-native-matrix-continuation/evidence.json) records the same final six Working Tree source/test hashes, actual Chrome150.0.7871.24 and ONLYOFFICE9.4.0-129. This phase added no application changes. Its separately owned provider persisted throughout; no resource reset or restoration crosses these claims.

- Both durable contracts used one combined fixture: hidden C width0, hidden row11 stored height22, hidden row12 height0, preconfigured filter, two attachment columns, A/gap/B at physical rows0/1/2 and seven managed controls. Genuine pointer selection followed by Tab/Shift+F10/Edit object activated all seven exact bindings in **each** User Draft/Admin Correction × legacy/template scope. Admin gained no row controls. [Combined native surface](acceptance/06-native-matrix-continuation/combined-filter-hidden-template.png).
- Legacy User saved proof0 four bytes, other1 zero bytes and proof2 three bytes. Ordinary typing/Undo/Redo preserved pending Files. Actual native row/column drags and editor-tab context Cut/Copy/Paste left values/anchors unchanged; sort/filter/insert/delete/merge affordances were disabled. Copy payload contained the own ordinary value; Cut flag alone is not proof of ordinary clipboard payload or external OS transfer.
- Eligible legacy Correction1 replaced proof0 with three bytes while preserving immutable Submission originals. A real post-capture Remove pointer attempt encountered the inert wrapper and delivered no confirmed removal. In a fresh Correction, an **unconfirmed** removal candidate blocked Save before admission; a previously confirmed five-byte replacement remained pending. After genuine removal confirmation, Correction2 retained proof rows0/2, cleared other1, preserved Submission/Correction1 and retained the saved zero-byte historical original.
- Template User saved the same initial4/0/3 physical pattern. Actual normal browser Submit/default-next reused the **same Response**, reset its Draft data to null, retained seven controls and exited cleanly without extra uploads. A second genuine Draft Save produced4/0; authentic HTTP Submit from a real native Excel export established Correction eligibility without a status flip or interception of the earlier browser next-round flow.
- Template Admin activated every binding, edited an ordinary cell with Undo/Redo, and staged five bytes at proof2. A genuine native Cut removed the previously selected scalar OLE even though the name box showed a row range. Save failed before any provider write with six controls; native Undo restored seven and the pending five-byte File remained. This is **missing-control capture rejection**, not a successful whole-row Cut/Paste claim. Explicit later Save created Correction1 with4/0/5. Correction2 genuinely confirmed removal of the saved zero-byte other1 without another POST/DELETE; both Submissions and Correction1 remained unchanged.
- Fresh native reopen after each contract's removal showed the survivor at **physical row2**, not canonical array index1. Template picker matched its exact saved five-byte receipt privately; Cancel/Exit produced no false dirty dialog.
- Final audit: **11 POST,0 DELETE**, eleven distinct controlled resources,18 references and seven immutable snapshots. Every received original matched an independently specified literal fixture; every snapshot's XLSX URL matched its paired receipt/reference at the actual physical row. Reference `snapshotId` was joined to the canonical **documentKey**, not the Submission/Correction row ID. Equal template filenames returning distinct resources remain a controlled-model assumption, not DCM evidence.

#### Settled footer and clipboard boundary

Settled viewport768/600/520 samples had native frame heights692/524/444; both footer buttons stayed inside their frames. A fresh520 opening and genuine Cancel also succeeded. [Settled520 surface](acceptance/06-native-matrix-continuation/settled-native-footer-520.png). This supersedes a stable-layout-failure interpretation of the earlier immediate sample, **not** its transient clipping observation. No layout patch or all-viewport/zoom/resize guarantee is claimed.

The actual browser process used `--headless=new`. Pinned [Chromium startup](https://chromium.googlesource.com/chromium/src/+/791ba97058eb8c1e257ea50380b0d8c6bb9b8f64/chrome/browser/headless/chrome_browser_main_extra_parts_headless.cc?format=HTML) installs the [platform-independent HeadlessClipboard](https://chromium.googlesource.com/chromium/src/+/791ba97058eb8c1e257ea50380b0d8c6bb9b8f64/components/headless/clipboard/headless_clipboard.cc?format=HTML). This phase did not read/write the system clipboard. Historical clipboard restoration is not claimed; native editor-tab fallback is not external application transfer.

#### Remaining native acceptance

03/06 **remain needs-info**. These named combined/filtered targets now have native proof, but every structural gesture crossed with saved/replacement/removal/invalid states, old sessions and route/refresh/close variants is not recertified by this phase. Existing N01–N18 retain their original source provenance.

A genuinely **already-queued confirmed removal delivered after captured Correction** remains unproved. Ordinary later interaction is inert; an earlier unconfirmed candidate blocks admission. Neither observation proves the queued-event generation boundary. No fake bridge, SDK mutation or inert bypass manufactured acceptance. A template hold probe also hit the browser tool's single-tab concurrency guard; its finally block released the provider barrier and awaited the already-admitted successful operation, without retry or a claimed late-removal result.

01/02/04/05 remain ready-for-human;07–10/provider/settlement/old-data/human review remain HOLD. No approved decision was reopened, no original Wayfinder ticket changed, and no real DCM/PDMS/data/DELETE/push/deploy occurred.

#### Added evidence verification and owned teardown

- Parsed the persisted typed artifact, checked final source/screenshot hashes and relative evidence links, and audited both new PNGs visually: no complete receipt URL pixels. Final source bytes are unchanged from the preceding checked six-file continuation; native evidence above ran on those bytes, not an earlier source stage.
- Root workflow check passed again:312 runtime sources,22 rendered diagrams, valid source links/status coverage and current sharing ZIP. No further map rebuild was needed because this phase changed evidence, not implemented system flow. Earlier actual guide visual verification retains its stated scope.
- Closed the owned matrix tab and stopped only its app/provider/web/gateway. Deliberate Docker stop produced supervised gateway exit137. All four owned listeners closed; shared PostgreSQL5433, RustFS9000 and ONLYOFFICE8081 stayed reachable, with all four shared containers retained.
- Deleted18 objects from only the disposable matrix bucket, deleted that bucket and observed HEAD404. Dropped only the matrix database and observed remaining count0. Removed its private credentials/provider/fixture directory, two exact owned browser downloads and five temporary screenshot originals after preserving the audited PNGs. Shared browser/native caches and historical OS clipboard state were not erased or claimed restored. Synthetic teardown is not provider DELETE/finality acceptance.

## สิทธิ์ทดสอบ DCM จริง — 2026-11-19

ผู้ใช้อนุญาตให้ทดสอบ DCM จริงเฉพาะโครงการ `กทอ.67-00-0001` ตาม [ขอบเขตและ preflight ในสเปก](spec.md#ขอบเขตทดสอบ-dcm-จริง) แล้ว 07/08 ไม่ได้รออนุญาตเริ่มทดสอบอีก แต่ยังไม่มีผล provider รอบใหม่ จึงยังไม่ปิด HOLD หลักฐาน local ด้านบนยังเป็น local

DELETE (รวม cleanup อัตโนมัติ), audit/แก้ข้อมูลใช้งานจริง, remediation, push และ deploy ไม่ได้รับอนุญาตเพิ่ม 09 ยังรอหลักฐานของคำขอเดิม; 10 ยังรอสิทธิ์และหลักฐานข้อมูลจริงแยก รอบอัปเดตสิทธิ์นี้ไม่ได้เรียก DCM

## Scoped DCM and capped acceptance run — 2026-11-19

Execution baseline: `feat/ecm-attachment-safety-implementation`, HEAD `1071d3c7c50293f8706597e850036e4a5f50e28b`, with the preceding Working Tree fixes. [Retry policy](spec.md#เพดานการทดสอบในรอบนี้): at most three total attempts including the initial execution, counted per scenario, no fourth. Safety/permission stops happen sooner. A successful retry budget does not grant a second dispatch after an uncertain DCM mutation.

### 07/08 — Scoped provider preflight

Three read-only DCM `/search` requests passed on attempt 1, HTTP and business 200. The existing shared auth coordinator made zero new login requests. Exact project `กทอ.67-00-0001` and target folder `2. มติและการก่อหนี้` each matched once. The exact destination returned **five** same-base PDFs. No assumption was made that an existing entry is disposable or corresponds to an original request.

**Stopped before upload:** ownership/authorized original provenance of the known files and custody of new synthetic artifacts were not established. Zero file POST, original GET or DELETE. Do not change extension/template/project or repeat the read just to turn this into a write. [Sanitized transport and attempts](acceptance/07-08-scoped-dcm-preflight.json). 07 identity/history/DELETE and 08 live per-slot cells remain HOLD, not failed uploads.

### Local type/size and settlement verification

- Existing [`ecm-scalar-save-submit.test.ts`](../../apps/server/test/http/ecm-scalar-save-submit.test.ts), SHA-256 `3c604e85d54bc8648e30ba0dfef8a49da02f592e702702857083fdf4f30fcc36`: selected **29 pass / 0 fail / 1,032 assertions**, 132 filtered out. One attempt per selected case. Actual Folio HTTP consumer, local-only fetch fence, isolated PostgreSQL and RustFS, controlled provider and native Builder; no browser claim. Includes inclusive scalar file boundaries, oversize scalar/table no-dispatch, zero-byte table gaps, original reuse and focused settlement/cleanup behavior. No aggregate-capacity test run.
- Existing [`upload-poc-pending.test.tsx`](../../apps/web/test/ui/upload-poc-pending.test.tsx), SHA-256 `87fc3527e1b090b73e8f0715d579158554367e02021f42b536d598b816090db1`: one targeted case passed on attempt 1, 28 not selected. It verifies the host retains a newer removal through an older admitted result, **not** a native already-queued Correction click.
- Source boundary for native timing: [picker stages removal and reports a candidate](../../apps/onlyoffice-plugin/src/upload-poc-picker.js#L337), then [native footer confirmation sends the real message](../../apps/onlyoffice-plugin/src/upload-poc-picker.js#L388). The [host rejects Save while a candidate is reported](../../apps/web/src/components/onlyoffice-editor.tsx#L1049), and [the editor becomes inert while saving](../../apps/web/src/components/onlyoffice-editor.tsx#L1856). [The holder copies the removal map at capture](../../apps/web/src/features/onlyoffice/upload-poc-pending.ts#L675) and clears only matching captured entries. Source and host tests explain what to observe; they do not show ordering of a real already-queued native event.
- Removed only the HTTP sandbox: 66 objects from its dedicated bucket, bucket DELETE 204 then HEAD 404, database absence verified, private launcher/config removed. This is local disposal, not DCM DELETE.

### Remaining human and external inputs

- **01/02/04/05 — ready-for-human.** Review paired-receipt warnings and preservation of old files first (01), physical row/minimum-one-row next (02), candidate/confirmed/saved and navigation states next (04), then loading, unresolved checkpoints and retired Correction recovery (05). See the named native cases in [the existing supplement](acceptance/06-native-final/report.md); this run does not provide human acceptance.
- **09 — HOLD** until the custodian provides authorized original-request evidence: correlation, affected resource, terminal outcome and when delayed effects are excluded. The earlier receiptless HTTP 500 and the later paired success are different requests. No original logs read, mutation resent, or scope unlocked.
- **10 — HOLD** until an authorized read-only export or exact environment/record scope and cutoff are provided, with original provenance for any integrity claim. No live inventory/record access or remediation. A duplicate name is not evidence of corruption.

### 03/06 — Actual browser/editor follow-up

[Sanitized native attempt ledger](acceptance/03-06-capped-continuation/evidence.json), Chrome `150.0.7871.24` and ONLYOFFICE `9.4.0-129`, actual local Folio routes and a separate synthetic provider:

- Visible legacy User Draft and eligible Admin Correction: with a confirmed three-byte replacement pending, real row/column drag and native Cut/Paste attempts left observed values/anchors, saved snapshot, references and provider state unchanged. Sort was disabled, not bypassed. The same physical picker still held the pending File. Explicit Admin Save later committed only the intended correction and kept the prior Submission intact. Cut flag/clipboard notice are not proof of payload transfer.
- Actual Back/reentry discarded only the local replacement and preserved the saved Draft. Actual Refresh and stale-tab Close emitted `beforeunload` when observed; accepted navigation was not File recovery. The old Admin workspace rejected Save after a newer revision, with no mutation POST. That scenario succeeded on attempt 3; Admin pre-capture candidate refusal plus Refresh was observed on attempt 2. No scenario exceeded 3.
- **Queued confirmed-removal: not reached.** The earlier unconfirmed candidate refused Save before POST. With a genuine captured Correction POST held by the local provider, `inert` prevented the later native click. Stopped after one attempt at that boundary; no bridge injection or disabled-control bypass. The full contract × role × gesture/state matrix and exact native event-delivery ordering remain unverified. **03/06 stay `needs-info`.**
- Closed five owned listeners and removed the owned private browser/session files, database and bucket (10 objects; HEAD 404). Shared services stayed reachable. Synthetic provider: four POSTs for fixtures/explicit saves, zero DELETE; none to DCM.

## 07 — Authorized live same-name PDF trial — 2026-11-19

The owner allowed origin reads of the five existing scoped PDFs, confirmed the original project/template/destination, and took custody of the synthetic test file. The [sanitized live evidence](acceptance/07-scoped-dcm-same-name-pdf.json) supersedes the earlier before-upload stop for this sample only.

One original PDF POST to DCM returned HTTP/business 200 on the first attempt. The returned pair was distinct from all five preexisting pairs and retrieved the exact 628-byte fixture. Each old original matched its own pre-POST size and SHA-256; scoped search verified the directory changed from five to six same-name files and retained all original pairs. No DELETE or retry. Only the synthetic file was created; no live Folio data was inspected or changed.

Custody locator: DCM project `กทอ.67-00-0001`, `2. มติและการก่อหนี้`, file `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf`, DCM create time `2026-11-19 14:26:37`, 628 bytes. Do not identify the test file by filename alone.

**Still open:** 07 DELETE isolation and broader history/slot coverage; 08 actual Folio per-button upload/reopen and additional format/size cells; 09 original-request finality; 10 old-data scope; and human review. The successful POST is not evidence about the previous HTTP 500. No provider-wide or release acceptance.

## 08 — Live scalar slot run stopped after provider success — 2026-11-19

[Sanitized evidence and counted attempts](acceptance/08-scoped-folio-slot.json). Actual User Chrome/ONLYOFFICE activated the `folio_scalar` C4 control, confirmed a disk-backed PDF, and sent a native Folio Draft Save. The isolated app used a loopback relay and the existing shared DCM authentication coordinator without a new login. The relay enforced the exact project/template-derived PDF filename, the staged fixture and one dispatch. It had no DELETE route.

| Layer | Observed outcome |
| --- | --- |
| DCM preflight / upload | One scoped search, one file POST, HTTP/business 200; the original receipt pair was distinct from the six entries in the preflight listing. |
| DCM original access | Exact new receipt returned HTTP 200 `application/pdf` with a readable body; no existing original read or changed-file check was added to this type/size trial. |
| Folio Save / reopen | HTTP 202 was admission, not commit. Terminal `document_save_failed` / `attachment_upload_failed`, batch `cleanup-pending`, version `unknown`, zero canonical references. Reopen of a saved file did not occur. |
| Local diagnosis | Original app logged `Decompression error: ZlibError`. Loopback reproduction demonstrated Bun had decoded the body already while preserving `Content-Encoding: gzip`; relaying that response unchanged failed, and forwarding identical decoded bytes without the stale encoding succeeded. Actual live response encoding was not retained; mechanism reproduced, production behavior not inferred. |
| Local table follow-up | **ทำต่อไม่ได้ — ล้มเหลวหลัง 3 ครั้ง**: native context menu could not reach the required `Edit object` action (attempts 1/3), or close the stale native menu (attempt 2). No synthetic or real POST from this follow-up. |

No live retry after the first post-dispatch failure; table, zero-byte and 10,000,000-byte live cells remain unrun. 08 remains `needs-info` / HOLD; the previous local `10,000,001` rejection is not a live provider result. No Production code change. Removed only the owned sandbox and Chrome state; the external test PDF remains under pyw1tt custody: `2. มติและการก่อหนี้`, `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf`, **631 bytes, DCM create time `2026-11-19 14:39:26`**. Do not identify it by name alone. No real DELETE, push or deploy.

## 08 — Sandbox-first follow-up and scoped live matrix — 2026-11-19

[Sanitized follow-up ledger](acceptance/08-sandbox-and-live-follow-up.json). In a new standalone sandbox, genuine Chrome/ONLYOFFICE scalar and table Save/reopen completed with gzip upstream, and exact saved receipt access worked. The relay forwarded the decoded JSON without the obsolete `Content-Encoding`; the sandbox made zero DCM calls. No application code or guards changed.

| Actual Folio slot / PDF size | Observed scoped live outcome |
| --- | --- |
| Table `rows.proof` row 0 / 635 bytes | DCM HTTP/business 200, distinct receipt, Folio commit, matching canonical reference/XLSX URL and fresh native picker, exact-receipt original GET 200. |
| Scalar `scalar` / 10,000,000 bytes | Same end-to-end outcome, saved actual input size 10,000,000 bytes. |
| Table `rows.proof` row 0 / 10,000,000 bytes | Same end-to-end outcome, saved actual input size 10,000,000 bytes. |
| Scalar `scalar` / 0 bytes | **Failed at DCM HTTP 422** on attempt 1, no successful receipt; Folio did not commit, version `unknown` and batch `cleanup-pending`. Stop with no resend. |
| Table row 0 / 0 bytes | Not run after the preceding stop. |

Provider route remained exact `กทอ.67-00-0001` / `2. มติและการก่อหนี้` / `ก่อหนี้-4_ขยาย(45)`. Four scoped metadata searches, four distinct POSTs, three exact original GETs (positive access checks, not full-byte comparisons), no new login and zero DELETE. Known same-name receipts/metadata were checked before subsequent writes. The three successful responses all supplied `Content-Encoding: gzip` and the corrected relay consumed them successfully. No original failed request was retried. The unsuccessful 422 body was not retained and the response does not establish finality.

Three known new artifacts stay in DCM under pyw1tt custody. Use the DCM date/time and size together, not the shared filename `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf`: `2026-11-19 14:52:46` (635 bytes); `14:53:12` and `14:53:30` (10,000,000 bytes input each, reported as 9.54 MB). Sandbox DB/bucket/browser/launchers were removed and shared services preserved.

08 remains `needs-info` / HOLD for zero bytes, remaining format/slot/path cells and human review. Oversize stays local with no real dispatch; out-of-project number-change stays local. No new DELETE isolation, original-request settlement, production or release acceptance.

## 08 — Minimum size for new Folio uploads

pyw1tt reported direct DCM tests: 0 bytes returned HTTP 422, 1 byte failed again on retest, and 2/3/5/10/100 bytes passed. These are operator observations, not recorded Folio slot runs or a provider-wide guarantee. Under the revised [spec](spec.md#5-ขอบเขตที่ต้องคงเดิม), 0 and 1 byte move to local no-dispatch validation; neither is an outstanding live test. The prior 422 original request still has no finality evidence.

On Working Tree based on `1071d3c`, actual TCP regression failed before the fix (expected 422; received 202) and passed after it (72 assertions). The shipped attachment dialog in isolated Chromium showed “รองรับการอัปโหลดไฟล์ที่มีขนาดมากกว่า 1 bytes และไม่เกิน 10 MB” for 0, 1 and 10,000,001 bytes, kept the previous choice, and selected 2 and 10,000,000 bytes. The browser smoke used a local SDK adapter and did not exercise the full native ONLYOFFICE journey. Targeted plugin (30 cases), web UI (72 cases), scoped format/lint, server/web types and rendered workflow verification passed.

The isolated HTTP attachment suite reported 162 passing, including both historical 0/1-byte receipt cases, and one setup failure (`P2025`). A replacement cleaned up A before the alias-deletion test could seed it. The fixture now keeps a reference to A until it can retarget that reference to B. The exact failing case then passed (65 assertions). No deletion runtime change and no second full suite run.

No new live DCM requests, real data changes, DELETE, push or deploy. 08 remains `needs-info` for the remaining provider format/slot/path cells at applicable sizes and pyw1tt review. This does not advance 03/06 native acceptance or release any other HOLD.

## 08 — Two-byte native buttons: sandbox pass, live preflight blocked

2026-11-19 09:19 UTC, Working Tree on `feat/ecm-attachment-safety-implementation` at `1071d3c7c50293f8706597e850036e4a5f50e28b`. Actual Chrome `150.0.7871.24` and ONLYOFFICE `9.4.0-129`, isolated PostgreSQL/RustFS, loopback-only provider double with gzip receipts. The synthetic files were exactly 2 bytes each, not PDF-format samples.

| Slot | Sandbox attempts | Observed evidence |
| --- | --- | --- |
| Scalar `folio_scalar` / `scalar` | 1 | Native picker selected the file; Draft completed; 2-byte canonical receipt matched its committed reference and XLSX URL; fresh reopen showed the same file and size; exact saved receipt returned HTTP 200. |
| Table `folio_proof` / `rows.proof`, physical row 0 | 1 | Same checks passed, with `row_index: 0` and the scalar slot unchanged. |

**Both live cells blocked before POST (0 dispatches).** The previous 0-byte POST to `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf` returned HTTP 422 but remains `unknown` / `cleanup-pending`: no finality or trusted receipt is available for that request. `admitAttachmentDestination` fences unresolved versions for the same account and exact destination filename, across Responses. A fresh sandbox database does not settle or waive that fence. No independently verified alternative destination for the 2-byte files was established within the existing authorization. Do not change names or use a new Response to bypass the fence. To run live at this destination, obtain provider evidence resolving the original request and re-check the authorized destination/collision boundary.

Zero live DCM requests, retries, or DELETE; removed only the isolated DB, bucket (4 synthetic objects), gateway, private Chrome and temporary fixtures. No application change, push or deploy. Both live cells and human review remain pending; 08 remains `needs-info` / HOLD.

**Operator update:** pyw1tt reports that DCM checked its database and confirmed the original 0-byte HTTP 422 request did not write a file and left no pending work. DCM did not retain request logs. This records the operator-relayed provider finding, not an inspected original-request database record or a provider-confirmed validation contract for the deployed endpoint. A Request ID is not required if one of those other sources establishes the exact request's terminal outcome. No guard was cleared, no roster recheck was performed, and neither 2-byte live POST was dispatched.

**Owner closure — 0-byte case only:** pyw1tt relayed DCM's confirmation that the system in use during the test rejected the 0-byte upload before any file write or enqueue. This closes the reported `422` case only, based on provider-confirmed behavior relayed by the operator. It is not an inspected request log or a guarantee for unrelated failures. Both 2-byte native cases retain their sandbox PASS. Their live cells remain **pending**, with no dispatch yet; re-check the authorized destination and collision boundary before any live POST. No new DCM request, DELETE, runtime state change, or provider matrix acceptance.

## 08 — Scoped live minimum and representative scalar PDF

Working Tree on `feat/ecm-attachment-safety-implementation` at `1071d3c7c50293f8706597e850036e4a5f50e28b`; actual Chrome `150.0.7871.24`, ONLYOFFICE `9.4.0-129`. Provider revision unavailable. Scope remained only `กทอ.67-00-0001`, `DMS/ShareFiles/2567/กทอ.67-00-0001/2. มติและการก่อหนี้`. After the original 0-byte case was closed, the read-only preflight initially received 401, then logged in through the existing Folio coordinator. The second preflight stopped on an over-broad PDF inventory assertion; the third resolved it: 10 exact-name PDFs, all five known artifact locators verified, and two unrelated names. Before each write, all directory entries remained in the collision check; only the exact PDF filename could be uploaded. No existing original was read.

| Native slot | Input | DCM create time (Thai local, 2026-11-19) | Outcome |
| --- | --- | --- | --- |
| Scalar `folio_scalar` / `scalar` | 2 bytes | `16:34:49` | Attempt 1: upstream HTTP/business 200, distinct paired receipt, Draft committed, canonical size/reference and XLSX URL matched, fresh picker reopen matched, exact original GET 200 (`text/plain`). |
| Table `folio_proof` / `rows.proof`, physical row 0 | 2 bytes | `16:35:03` | Attempt 1: same checks, physical row 0 verified and scalar unchanged; exact original GET 200 (`text/plain`). |
| Scalar `folio_scalar` / `scalar` | 586-byte PDF | `16:35:19` | Attempt 1: same scalar checks, exact original GET 200 (`application/pdf`). New fixture and original request, not a replay of the failed relay request. |

All three artifacts share `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).pdf`; pyw1tt retains custody. Identify each by DCM create time **and** size. The 2-byte samples test the minimum size, not PDF format. The relay consumed each gzip receipt without retaining the stale encoding header. Six read-only searches, one coordinated real login, three file POSTs, three exact-new-receipt GETs, zero real DELETE. No 0-byte rerun, external full-byte comparison, runtime source change, push or deploy. The native test sandbox and its six synthetic local objects were removed.

**Local `docs_number` and type checks:** 11 actual HTTP cases / 576 assertions passed once each in a separate PostgreSQL/RustFS instance with external traffic disabled. Covered trusted saved-reference reuse on scalar and table paths, no extra upload on subsequent unchanged Submit, physical rows, extension/case preservation and representative binary, HTML, text, PNG-signature, protected ZIP, extensionless and 2-byte inputs. This is local transport/reuse evidence, not provider type acceptance. The independent HTTP sandbox and its 22 synthetic objects were removed.

**Still pending:** non-PDF/template-extension routes. The scoped inventory had no exact-base alternative extensions, and the reviewed [provider contract](../ecm-storage-templates/provider-contract-research.md#routing-and-duplicate-filenames) does not establish equivalent routing for them. No live POST for these cells. Live `docs_number` changes outside the authorized project stay unrun. Human review remains pending; three new passing cells do not close the full matrix or other tickets.

## 08 — Scoped non-PDF run stopped at HTML

Operator-relayed DCM confirmation: the tested format families are expected to be supported and `docs_number` with `template_name` determines storage. This is not a guarantee that a new upload cannot alias an existing receipt. Source: Working Tree on `feat/ecm-attachment-safety-implementation` at `1071d3c7c50293f8706597e850036e4a5f50e28b`; actual Chrome `150.0.7871.24` and ONLYOFFICE `9.4.0-129`. Provider revision unavailable. Scope: exact `กทอ.67-00-0001`, frozen template `ก่อหนี้-4_ขยาย(45)`, directory `2. มติและการก่อหนี้`, synthetic files only.

Read-only preflight: 401 on attempt 1, then HTTP 200 through the shared Folio coordinator on attempt 2. Baseline: 15 exact-directory entries, 13 exact-name PDFs, all eight known test-artifact locators matched, no preexisting normalized format trial name. The relay rechecked existing pairs and metadata before each write. Each of the eight successful attempts returned its own paired receipt, confirmed the exact scoped filename/path, committed the canonical answer/physical reference and XLSX URL, showed the same name/link/size in a fresh native picker, and returned HTTP 200 on the receipt's original GET. Only the appropriate file prefix was checked, not full byte identity.

| Format | Scalar: actual input bytes / DCM create time | Table row 0: actual input bytes / DCM create time |
| --- | --- | --- |
| `.docx` | 851 / `16:49:49` | 850 / `16:50:00` |
| `.xlsx` | 1,831 / `16:50:09` | 1,830 / `16:50:20` |
| `.png` | 70 / `16:50:40` | 70 / `16:50:54` |
| `.txt` | 39 / `16:51:08` | 38 / `16:51:23` |

Times are DCM local display on 2026-11-19 (UTC+7). The eight artifacts use the frozen base `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45)` plus the listed extension. pyw1tt retains custody. Use the name with time and size, not the name alone. DCM rounds the two XLSX sizes to `1.79 KB`.

**Safety stop, attempt 1:** Scalar `.html` 59-byte synthetic file to `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).html` got provider `HTTP 422` at `2026-11-19T09:51:37.490Z` (16:51:37 Thai time). Local Operation `4b7939c2-f12b-43be-9286-84680ae5d1ec` was admitted (`202`) but ended `document_save_failed` / `ecm_rejected`. Sandbox ledger recorded one `unknown` sent version with no paired receipt or settlement, batch `cleanup-pending`, no canonical attachment and zero references. No provider validation body was captured. The response does not establish why the file was rejected or any provider side effects for this original request. The previous 0-byte confirmation does not apply.

Eleven read-only searches including the initial 401, one coordinated login, nine file POSTs, eight exact-new-receipt GETs, zero live DELETE. No repeat HTML POST, no follow-on upload, no source change, push or deploy. Pending: provider outcome/finality for this exact HTML request; table HTML and both slots for BIN, password-protected ZIP, extensionless and `.PNG` not run. Human review remains pending.

After recording the unresolved attempt, removed only the private browser, gateway, synthetic fixtures, isolated DB and sandbox bucket (27 local objects). Local teardown does not settle the DCM request or remove any provider artifact.

## 08 — HTML unsupported; separate BIN trial stopped

The operator relayed DCM's clarification that `.html` is unsupported; the scalar HTML rejection stands and table HTML is unsupported/not run. No DCM evidence of the original HTML request's terminal side effects was provided; no `.html` POST was retried or renamed. Remaining types were approved for independent checks at their own exact names in the same scoped project.

Working Tree at `1071d3c7c50293f8706597e850036e4a5f50e28b`, actual Chrome `150.0.7871.24` and ONLYOFFICE `9.4.0-129`. Fresh read-only preflight passed on attempt 1: 23 exact-directory entries, 13 exact-name PDFs and all 16 recorded artifact locators. Before the BIN write, all existing pairs and metadata still matched. This inventory does not establish original HTML finality.

Scalar `.bin` (37 synthetic bytes) was sent exactly once to `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).bin` under `กทอ.67-00-0001`, folder `2. มติและการก่อหนี้`. DCM returned `HTTP 422` at `2026-11-19T09:58:13.449Z` (16:58:13 Thai local). Local Operation `8d5a9449-d9ba-4dae-936b-f623756b0be2` ended `document_save_failed` / `ecm_rejected`; one sent version `unknown`, no paired receipt, no settlement, batch `cleanup-pending`, no saved attachment and zero references. Provider validator/error body not available; one rejection does not establish that all BIN is unsupported or that the request had no side effects.

Stop on attempt 1. Two scoped metadata searches, one file POST, zero new logins, original GETs, or DELETEs. No follow-on write. BIN table, encrypted ZIP, extensionless and uppercase `.PNG` remain untested live. No app allowlist or runtime state was changed; no push or deploy.

Closed the native test sandbox after preserving the BIN telemetry. Removed only the owned browser, gateway, temporary fixtures, isolated DB and sandbox bucket (nine local objects). No DCM resource was removed or treated as settled by teardown.

## 08 — Combined format disposition

The operator relayed DCM's clarification that `.bin` is unsupported, in addition to `.html`. Neither original request was resent, and neither classification establishes the original request's side effects or finality. Source: Working Tree at `1071d3c7c50293f8706597e850036e4a5f50e28b`; actual Chrome `150.0.7871.24` and ONLYOFFICE `9.4.0-129`; provider revision unavailable. Exact project `กทอ.67-00-0001`, frozen template `ก่อหนี้-4_ขยาย(45)`, folder `2. มติและการก่อหนี้`, synthetic files only.

| Format / boundary | Scalar | Table row 0 |
| --- | --- | --- |
| PDF sample; 2-byte and 10 MB boundaries | Live pass | Live pass |
| `.docx`, `.xlsx`, `.png`, `.txt` | Live pass | Live pass |
| `.PNG` (uppercase) | Live pass, 70 bytes, `17:04:46` | Live pass, 70 bytes, `17:04:57` |
| `.html`, `.bin` | HTTP 422; DCM confirmed unsupported | Unsupported; not run |
| `.zip` (unencrypted) | HTTP 422; DCM later confirmed unsupported | Unsupported; not run |
| `.zip` (password-protected) | ZIP family unsupported per DCM; not run | ZIP family unsupported per DCM; not run |
| No extension | HTTP 422; DCM later confirmed unsupported | Unsupported; not run |

Both new uppercase PNG artifacts use `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).PNG`, times above in DCM local time on 2026-11-19. Each returned a distinct paired receipt from the lowercase and preexisting files, committed the correct slot and XLSX URL, reopened with the same name/link/size, and returned the expected PNG signature and HTTP 200 through the original receipt. This proves case separation for these samples, not a provider-wide guarantee. Artifacts remain under pyw1tt custody; identify by name, time and size.

The normal ZIP case was sent once: 235 bytes to `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).zip` at `2026-11-19T10:03:18.406Z` (17:03:18 Thai time); DCM returned 422. Local Operation `3358111d-d5bb-4377-848b-dc59291fa826` failed with `ecm_rejected`, batch `cleanup-pending`, sent version `unknown`, zero references, no receipt or settlement. Stopped that filename, including encrypted ZIP, without clearing the ledger. A second relay checked the 23-entry baseline and all 16 known artifact locators, then permitted only the unrelated `.PNG` and extensionless filenames in the **same** sandbox and ledger. This did not resolve or retry the ZIP request.

The extensionless scalar case was sent once: 58 bytes to `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45)` at `2026-11-19T10:05:09.829Z` (17:05:09 Thai time); DCM returned 422. Local Operation `8546c9e0-796d-45bb-809d-53e714402f4c` failed in the same unresolved pattern, with zero references and no receipt or settlement. No provider validation body for either 422; no inference that the whole family is unsupported. Stopped before the extensionless table case.

This run: six scoped metadata searches, four file POSTs, two reads by exact new receipts, zero new login, retry POST or DELETE. Live `docs_number` changes outside the authorized project still not run; local 11-case result stands. No application allowlist change, push or deploy.

Closed the private native sandbox and removed only its gateway, temporary fixtures, isolated DB and bucket (12 local objects). No DCM file was deleted and teardown does not establish request finality.

**Provider update — format classification:** pyw1tt relayed DCM's confirmation that ZIP and extensionless filenames are unsupported. For this matrix, the supported set verified through both Folio buttons is PDF, DOCX, XLSX, PNG (`.png` and `.PNG`) and TXT. DCM also confirmed HTML and BIN are unsupported. Do not dispatch unsupported cells for coverage. This closes the format-support question for the tested scope, not the original requests' side effects/finality or the rest of ticket 08. Live `docs_number` evidence outside the project and human review remain open. No claim is made for other untested extensions or provider configurations.

## Folio upload extension allowlist

The owner limited new ECM attachments to final filename extensions `.pdf`, `.docx`, `.xlsx`, `.png` and `.txt`, case-insensitive. File names and extension casing are preserved. This is a filename check, not MIME or contents verification. The 2–10,000,000-byte range, actual multipart size check, slot/row/session/ownership validation and unchanged receipt schemas remain. Previously saved files stay readable and count as attached; routing changes that would upload an old unsupported file now ask for a new file before dispatch.

On Working Tree at `1071d3c`, the actual TCP regression initially returned 202 instead of 422; after the fix it passed with 82 assertions. The scoped plugin (31) and web UI (78) tests passed. Actual Chrome/ONLYOFFICE on the loopback-only sandbox rejected a 4-byte `double-suffix.pdf.zip` and a 1-byte `.PDF`, kept the preceding `actual-selection.PNG` in physical row 0, then saved and reopened its exact receipt. Only the allowed choice reached the provider double (one dispatch, zero external calls). Scoped runtime lint, server/web type checks and workflow build/check passed. The generated workflow HTML and ECM diagram rendered the updated policy in Chrome. No DCM, real DELETE, push or deploy.

The full affected attachment HTTP file passed 165 cases / 10,428 assertions after migrating fixtures. This includes unsupported-extension admission without provider dispatch, case-preserved accepted names, and historical unsupported receipts readable and reusable unchanged but blocked from routing-triggered reupload.

### Remaining actions by ticket

- **01/02/04/05:** pyw1tt confirmed human acceptance of the recorded scope. The implementation tickets are resolved; this is not a release or deployment approval.
- **03 — resolved:** pyw1tt accepted the tested native scope, including [Undo/Redo with a pending row-0 replacement](issues/03-native-table-mapping-guards.md#native-b12-edit-and-undoredo-with-a-pending-row-0-replacement). Unchecked role/contract/gesture combinations are not certified.
- **06 — resolved:** pyw1tt accepted the two observed native guard boundaries and [the deterministic late-removal checks](issues/06-integrated-http-browser-and-editor-acceptance.md#deterministic-late-removal-verification). Genuine already-confirmed native delivery after capture and unchecked matrix coverage remain unverified. This is scoped acceptance, not full native or release acceptance.
- **07 — resolved:** pyw1tt accepted the [scoped live DELETE isolation](issues/07-provider-same-name-history-and-delete-evidence.md#scoped-live-delete-isolation--fresh-disposable-txt). Only the unreferenced synthetic 37-byte TXT was deleted. Its exact original returned 404; all 27 previous pairs remained, and the three same-name originals, including the 32-byte ticket 10 file, matched their pre-test SHA-256.
- **08 — resolved:** pyw1tt accepted [live Folio routing from 0001 to 0003](issues/08-provider-per-button-type-and-size-evidence.md#live-0001-to-0003--both-attachment-slots-verified) for scalar and table originals through final Admin Correction. Both revisions exported their own receipts and all four originals matched SHA-256. The owner subsequently reported completing cleanup of the retained test files. No live User rerouting, automatic-folder-creation or DCM DELETE was exercised in this case.
- **09:** pyw1tt confirmed that the scoped HTTP 422 requests wrote or changed no file and left no pending DCM work. Closed for those requests only. This does not turn the earlier standalone HTTP 500 into a settled request or authorize ledger mutations, replay or a manual unlock.
- **10 — resolved:** pyw1tt accepted the [scoped local inventory and live DCM test](issues/10-existing-alias-inventory-and-recovery-report.md#scoped-existing-record-search-and-live-synthetic-correction--2026-11-19). None of the three existing project Submissions had an in-scope attachment in both original and Correction. The synthetic pair shared one receipt with one DCM upload; the new original and both previous same-name TXT originals matched their respective SHA-256 baselines. No existing answer was changed; no DELETE or recovery. Closure does not verify uninspected historical records.

### Capped template-native continuation

Used private loopback Chrome/ONLYOFFICE, PostgreSQL, RustFS and a provider double on the integration working tree. Template `Form` started at physical rows 0/1/2 (A / blank / B) with a scalar button and three row buttons. Native User Save and reopen established `original.TXT` at row 0. The actual Exit dialog's Stay action preserved the live editor and its confirmed replacement, with canonical state unchanged. Confirmed removal reopened at the same row as pending with the saved file still present; undoing the removal before Submit restored the original choice. Insert-range and ascending sort were disabled; no bypass. None of these pending transitions added a provider POST.

Actual User Submit retained the original row-0 receipt and its single Submission reference. Automatic next draft prevented Correction admission (`404`, a submitted Response is required). Separate real HTTP Submit from an actual native Excel export established an eligible second Submission without patches to status or app state. Admin Correction opened with HTTP 200 and the same physical layout. The first Submission's canonical data digest, object key and reference count still matched the pre-second-Submit baseline. The HTTP setup was not a second browser Submit.

- **Stopped at three attempts:** native User typing at B12 while the replacement was pending. The protected-sheet UI blocked targeting early; the last attempt did not observe the expected edit before timeout. Undo/Redo is not proven.
- **Stopped at three attempts:** the continuation did not observe the Admin row-0 picker opening after native clicks, including at its visible button. Candidate removal and already-queued delivery were not exercised here. Earlier pre-capture rejection and post-capture inert coverage do not certify queued delivery. No fourth attempt, fabricated event or guard bypass.

The local double recorded two synthetic POSTs and zero external calls; no DCM or real DELETE. Removed the two private tabs, gateway, temporary fixtures, isolated DB and isolated bucket (8 local objects); all six owned listeners were released.

### Native Undo/Redo and Admin capture guards

Chrome `157.0.8103.79`, ONLYOFFICE asset `9.4.0-ae9ceb648960c9359d8339c7c6044e63`, isolated PostgreSQL/RustFS and synthetic provider. Snapshot inspection used read-only browser/DB commands; workbook editing, opening and confirmation used native pointer/keyboard controls.

- **03 — named User case passed:** with `replacement.TXT` confirmed pending at physical row 0, genuine keyboard editing set B12 to `edited-03`; the native toolbar restored `B-ORIGINAL` and redid `edited-03`. The pointer targeted native B12 using the measured canvas origin. Reopening row 0 showed the same replacement and saved original. A/gap/B physical layout, four attachment controls, canonical file link/reference, and provider write count did not change during the actions.
- **06 — reproduced both native guard boundaries, not queued delivery:** a separate authenticated HTTP Submit from a genuine signed XLSX export established an eligible Admin Correction without automatic next Draft. The actual row-0 removal candidate blocked Save before admission. With that candidate canceled, an actual browser Correction Save produced a captured multipart POST with `attachmentRemovals: []`. While only its HTTP dispatch was paused, the actual native click was blocked by the inert editor. Releasing the request completed Correction with the same receipt as the Submission; two canonical references, one upload version, and one completed Correction. No picker message was manufactured or reordered. The exact newer confirmed removal remains unverified.

The one baseline upload reached only the provider double. No real DCM, real DELETE, application code change, push or deploy. Two private tabs, gateway, fixtures, isolated DB and bucket (seven local objects) were removed.

### Owner-reported DCM cleanup and supplemental native confirmation

pyw1tt reported that cleanup of the prior DCM test artifacts was complete and authorized fresh bounded tests against DCM Production. No independent per-file cleanup audit was requested or inferred. In the approved `0001` directory, the current Folio account received HTTP 200 from exact directory searches but no exact directory-file entries and could not verify the project-root record. A single exact `0003` control search also returned HTTP/business 200 and zero results. Stopped before creating another Production fixture because neither target was verified on this run; empty search is not evidence that either folder is missing or that all files were deleted. Four read-only searches in total; no login, upload, original GET or DELETE. The historical `500` remains unverified: the earlier request's trusted identifier/terminal evidence is still unavailable, and no new request can settle it.

In private Chrome `157.0.8103.79` with actual ONLYOFFICE and a local provider double, the real Admin used the row-0 Remove control and confirmed with the native dialog footer. A passive browser observer recorded only the trusted message types and order: candidate dirty, `pending-file-remove` (row 0), candidate clean, Correction pending, `pending-file-save`, then Correction completed. With removal pending, native B12 edit, Undo, and Redo passed after one coordinate-calibration miss. The actual Correction POST carried exactly `folio_proof` row 0 in `attachmentRemovals`, returned 202, and completed to Results.

Read-only verification found the attachment removed only in the Correction; B12 was edited only in that revision. The Submission retained its row-0 attachment, exact SHA-256 and HTTP 200 original access in the double. No new attachment POST or cleanup intent followed the one setup upload. This proves the real, in-order confirmation case and extends the Admin pending-removal matrix. It does not reproduce confirmation reaching Folio after capture or replace live provider evidence. No message was injected or reordered and no guard changed. Removed both private browser sessions, gateway, temporary files, isolated DB and bucket (four local objects). Existing ticket dispositions remain unchanged.

### Direct DCM Production upload after an empty search

pyw1tt explicitly authorized one direct synthetic upload to the previously verified `0001` routing, with possible folder creation by DCM as an accepted side effect. A read-only Folio ledger query found no exact-name attempts, references, or pending cleanup. The service account's exact-filename DCM search returned HTTP/business 200 and no matching filename; this did not establish whether the folder existed beforehand.

One direct `POST /api/beeecm/public/file` with `documentFile` and `template=1` returned HTTP/business 200. The original validated receipt reported `DMS/ShareFiles/2567/กทอ.67-00-0001/2. มติและการก่อหนี้`. One GET by the returned token returned 200; actual size and SHA-256 matched the 68-byte synthetic input. This confirms routing and original retrieval for the direct API request, not automatic folder creation or native late-removal ordering. No fresh login, retry POST or DELETE; no new Folio attachment reference was created. No earlier unknown outcome was settled.

Cleanup by pyw1tt: `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).txt`, 68 bytes, created `2026-11-19 21:26:40` DCM local time (ICT), in the directory above. The file remains in DCM. No raw receipts, private links, tokens, or original bytes are retained in this report.

### Live ONLYOFFICE table attachment and Admin removal — 0003

The owner authorized a follow-up using real ONLYOFFICE and DCM Production. The integration Working Tree was based on `1071d3c`, with private Chrome `157.0.8103.79`, ONLYOFFICE asset `9.4.0-ae9ceb648960c9359d8339c7c6044e63`, and isolated Folio, PostgreSQL, and RustFS. The test used only synthetic data and `กทอ.67-00-0003` under frozen template `ก่อหนี้-4_ขยาย(45)`; the preceding `0001` artifact was not touched. Two scoped metadata searches and the exact-name read-only ledger check found no matching filename. Empty results do not establish that a folder was absent or newly created.

- **User Save Draft:** opened the real table button at physical row index 0, chose a 68-byte TXT, and confirmed in the native dialog. No provider POST before Folio Save Draft. Save committed one attachment version and one Draft reference for `folio_proof` row 0. DCM returned HTTP/business 200 for the only `template=1` upload. The original read by the exact committed receipt returned HTTP 200 and matched the fixture's size and SHA-256.
- **Submission setup:** the native Excel Export returned 200 and supplied the actual signed workbook capture. An authenticated HTTP Submit with a matching action-scoped capability returned 202 and completed without creating a new Draft or uploading again. This step was not a User click on the Submit button.
- **Admin Correction:** clicking Save while the native removal candidate was unconfirmed showed the guard and admitted no Correction. The native footer then delivered `pending-file-remove` for row 0 before Save. The browser returned to Results and Correction revision 1 contained no row-0 attachment. The complete prior Submission snapshot and its only attachment reference were unchanged. A second read by the same DCM receipt returned HTTP 200 and matched the original 68-byte fixture's SHA-256. No new upload, cleanup intent, or DCM DELETE followed the removal.

Two editor initialization attempts returned `500` on invalid synthetic marker ranges; the corrected fixture passed the production marker validator and opened on the third attempt. The HTTP setup Submit initially returned `403/editor_capability_scope_mismatch` for an export capability; the correct Submit capability passed. Neither failure dispatched an extra provider write. The browser tool resolved the attempted post-capture HTTP interception before a hold could be proven. No queued native command was observed arriving after capture, and no message was injected or reordered. This run proves pre-capture rejection and in-order confirmation against live DCM, not delayed native delivery.

Provider totals: two searches, one upload, two original GETs, no new login or DELETE. Local teardown closed both private browser sessions and all four workbench ports, then removed the gateway, isolated DB, bucket (seven objects), and temporary fixtures. No app code change, deploy, or push.

Cleanup by pyw1tt: `กทอ.67-00-0003-ก่อหนี้-4_ขยาย(45).txt`, 68 bytes, created `2026-11-19 21:47:37` ICT, under `DMS/ShareFiles/2567/กทอ.67-00-0003/2. มติและการก่อหนี้`. The file remains in DCM. No receipt token or private link is recorded here.

### Native confirmation ordering with a verified post-capture barrier

On the integration Working Tree based on `1071d3c`, ran three scoped Admin sequences using actual Chrome `157.0.8103.79` and ONLYOFFICE `9.4.0-ae9ceb648960c9359d8339c7c6044e63`. An isolated Folio/DB/storage setup used one synthetic row-0 attachment and a genuine signed workbook for the HTTP setup Submit. A loopback transport barrier recorded the native Correction POST's signed-capture presence and removal slots, then held only that HTTP dispatch before passing it unchanged to Folio. No editor state, input guard, or bridge message was overridden.

1. **Clean picker already open at capture:** the real POST reached the barrier with a signed capture and `attachmentRemovals: []`. Both native Remove and footer controls were in viewport, but the editor was inert and neither pointer click reached its frame. No `pending-file-remove` arrived; the picker still showed the original action. Releasing the POST committed revision 1 with the original receipt.
2. **Dirty candidate, Save then immediately confirm:** the native footer was already inert by the second click. The real bridge reported the candidate, then `pending-file-check` and a failed operation; no `pending-file-save` or Correction POST arrived at the barrier.
3. **Positive control, confirm then Save:** the actual footer delivered `pending-file-remove` for row 0 before Save. The barrier captured exactly `folio_proof` row 0 in `attachmentRemovals`. Revision 2 removed that attachment only. The Submission and revision 1 retained the same receipt, with two references to one version.

The two targeted Vitest regressions passed: `Correction completion preserves a late removal until an explicit exit decision` and `keeps scalar removal local until explicit save and preserves a newer removal across an older receipt`. They cover Folio's behavior given late delivery; the native run did **not** observe an already-confirmed removal arriving after capture and does not prove that ordering impossible. No fourth sequence, extra provider write, or application change. The one baseline upload used a loopback provider double; no DCM Production request or DELETE. Removed both private browser sessions, gateway, isolated DB, bucket (four objects), and temporary files; all four sandbox ports closed. Prior ticket dispositions and DCM cleanup custody are unchanged.

### Owner-confirmed cleanup of the two follow-up artifacts

pyw1tt confirmed deleting both synthetic 68-byte TXT files: `กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).txt` (created `2026-11-19 21:26:40` ICT) and `กทอ.67-00-0003-ก่อหนี้-4_ขยาย(45).txt` (created `2026-11-19 21:47:37` ICT). Both were in their project's `2. มติและการก่อหนี้` folder. Cleanup is closed for these two artifacts based on owner confirmation; Folio did not send DELETE or independently verify the files' absence. This does not settle the historical HTTP 500 or change the native evidence limits.

### Delivery review fixes and verification

On the delivery branch from `1071d3c`, reproduced stale Dashboard/Admin deletion dialogs and nonzero anchor previews for hidden positive-width columns and positive-height rows serialized as `hidden="true"`. The deletion routes now close stale confirmations on `409 operation_in_progress`, focus a warning, and require current data before a new explicit confirmation. Chrome verified both actual routes with a scoped HTTP conflict response; no provider DELETE or change to the test Response. The native workbook normalizer treats `hidden="1"` and `hidden="true"` identically while retaining invalid-geometry checks and physical row/column identity.

Isolated HTTP coverage seeds saved 0/1-byte table files without uploading those sizes. Deleting an empty gap preserves distinct canonical receipts, file bytes and worksheet links on the correct physical rows. Deletion of the final row is refused with the same workbook and references. Both legacy and template modes add no provider write in the tested row operations. An extensionless historical original remains readable and reusable unchanged but cannot be read and re-uploaded as part of destination change; new extensionless upload is also rejected before dispatch. The spec and ticket 01 now make that distinction explicit.

Verification: complete ECM HTTP file 170 passed; final targeted HTTP 12 passed; ONLYOFFICE runtime 9 passed; spreadsheet unit 118; plugin 344; web lifecycle 12 and Vitest 288 (one worker). Root types and build passed. Scoped format/lint passed. The offline system map, source links, and diagram zoom were verified in Chromium; workflow generation/check passed for 22 diagrams. No DCM Production request, push or deploy in this pre-commit verification. The historical HTTP 500 and genuinely queued native removal after capture remain separate investigations.

### Post-commit follow-up: original DCM 500 and native timing

**Original DCM request — insufficient settlement evidence.** The retained dispatch record is for `2026-11-18 09:36:08 UTC`, `POST /api/beeecm/public/file` with `template=1` in `กทอ.67-00-0001`. It has a fixture fingerprint and upstream HTTP 500, but no original error body, request ID, paired receipt, or Folio Operation. The public AquilaAPI collection returned 200 with its previous SHA-256 `6264d1100015250ca75a3b23083395c58f569a3d4eec4456b8c057551335daf4`; it still lists no original-request lookup. One real metadata-only DCM search for the exact PDF filename returned HTTP/business 200 and zero exact name-and-directory matches. No new login, original file GET, upload, DELETE, or replay. This does not establish original side effects or finality. To continue, the DCM custodian must correlate the old request with a terminal log or equivalent provider record using its dispatch time, account, path and fixture fingerprint; if that record is no longer available, keep the result unknown. Ticket 09 remains closed only for its authorized 422 scope.

**Native legacy follow-up — integration commit `ee3e82f4e7`.** In Chrome `157.0.8103.79` and real ONLYOFFICE `9.4.0-ae9ceb648960c9359d8339c7c6044e63`, a User confirmed a pending TXT on `rows.proof` physical index 2. Deleting the empty row above it using the real sidebar control committed the spreadsheet row change with zero provider writes. Picker reopen after remount was not demonstrated within the capped locator attempts; a new explicit Draft Save proved the original file followed `B-ORIGINAL` into physical index 1, with exactly one loopback upload and a byte-identical readback.

An actual native XLSX export supplied the signed snapshot for the HTTP setup Submit. In the eligible Admin Correction, a trusted native Remove gesture staged a row-1 candidate. A burst of genuine Chrome mouse inputs targeted the Folio Save and native footer without waiting between event dispatches. The observer saw `pending-file-remove` first, then the Save's `pending-file-check`. The candidate was still dirty until its acknowledgement, so this Save was rejected before capture or a new Correction. This differs from the earlier inert-click observation but does not show delivery after capture. After the native candidate cleared, a fresh explicit Save submitted the signed snapshot with exactly `folio_proof` row 1 in `attachmentRemovals` (HTTP 202); revision 1 removed it, the prior Submission and its receipt reference stayed unchanged, and the original remained readable. Total: one local setup upload, no additional upload or DELETE from the Correction.

No application code was changed after the delivery commit. Native results do not certify the full role/contract matrix or an already-confirmed removal delivered after snapshot capture. Closed both private browser profiles and removed the isolated gateway, PostgreSQL database, bucket (five local objects) and temporary scripts; no DCM Production mutation or new artifact to clean up.

**Owner follow-up:** pyw1tt reported that DCM did not provide log correlation for the original HTTP 500 request. Whether a log exists is not established. Without evidence tied to that request, its side effects and finality remain unknown. No retry, DELETE, ledger change, or change to the scoped closure of tickets 03/06 or 09.

### Independent Folio verification under ambiguous provider failures

Ran the actual Folio HTTP listener from delivery commit `ee3e82f4e7`, isolated PostgreSQL and RustFS, native XLSX Builder, and a loopback provider. The four controlled scenarios each started with a saved Draft and trusted receipt, then attempted a two-file replacement. The provider modes distinguished durable effects in the double from what Folio could observe:

| Loopback provider action | Folio observation | New provider resource | Bytes at the old external URL |
| --- | --- | ---: | --- |
| Reject before storing | HTTP 500 without a receipt | 0 | Original |
| Store under a distinct receipt, then return the same HTTP 500 response | HTTP 500 without a receipt | 1 | Original |
| Store under a distinct receipt, then close the real HTTP connection before response headers | `ECONNRESET`, no receipt | 1 | Original |
| Overwrite the existing external object, then close the real HTTP connection before response headers | `ECONNRESET`, no receipt | 0 | Replaced by the provider |

All four passed (353 assertions in two runs). Each began exactly one provider POST for the failing action; the second attachment was not sent. Folio retained the original canonical JSON, XLSX bytes and reference; the authenticated saved Draft viewer returned HTTP 200 and projected the old URL without attachment buttons. The failed attempt remained `unknown` without a receipt or settlement. Recovery and resubmitting the same checkpoint resolved to the same failed Operation without provider dispatch; a new checkpoint and a requested Response DELETE returned 409. No provider DELETE. A successful saved-copy read proves the Folio workbook survived, not that a mutable external URL still contains the original bytes.

The matched HTTP 500 controls show why a status alone cannot establish whether the provider stored the file. This verifies Folio's failure-handling behavior, not DCM's internal behavior, historical request finality, or release approval. Existing scoped real DCM success evidence stays separate. No Production DCM request or application changes in this experiment. Removed both disposable databases/buckets (16 local objects total) and the throwaway probe source.

**Owner disposition — closed for follow-up.** pyw1tt accepted the scoped Folio failure-handling evidence and closed further investigation of the historical standalone HTTP 500. Folio passed the four sandbox cases; the original DCM request's side effects and finality remain unknown. Do not replay that request or attempt cleanup based on an empty search. Reopen only if new evidence can be tied to the original request. Ticket 09's confirmed settlement remains limited to the scoped HTTP 422 cases.
