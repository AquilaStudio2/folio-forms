# 06 — Integrated HTTP/browser/ONLYOFFICE acceptance

Status: needs-info  
Execution date: 2026-11-19 (browser timestamps displayed in Asia/Bangkok)  
Disposition: **partial local acceptance; not release, provider, old-data or human acceptance**.

Initial worker N01–N08 and their source hashes remain historical evidence below. The [parent final supplement, N09–N18](acceptance/06-native-final/report.md) records subsequent native work, review fixes and the current bounded disposition without relabeling those earlier runs. Ticket06 remains needs-info; passing HTTP suites or a subset of native journeys does not close the whole native matrix.

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
