# 04: Resume and submit unchanged historical project names

**What to build:** A User reopens a saved scalar answer after PDMS renames or removes its name and can keep and submit that exact saved answer, or select a replacement from the new session list.

**Blocked by:** 02 — Author and complete a scalar PDMS project-name Field.

**Status:** claimed

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [x] Derive historical allowances from the authoritative saved Response/Field baseline and preserve its exact saved name without clearing or automatic renaming.
- [x] A successful current catalog load still precedes submission; an unchanged trusted saved name may be absent from that list.
- [x] An unsaved/tampered value cannot gain a historical exception through a client flag, another Response, a different Field or previously chosen-but-unsaved text.
- [x] Replacing a historical value is a current authorized picker selection; no free text or Clear action is added.
- [x] Persist workbook and answer together across save/resume, and preserve the latest trusted baseline through operation retries and session replacement.
- [x] Do not mutate earlier immutable Submissions or change unrelated Prefill/resubmission behavior.
- [x] Demonstrate upstream removal and rename across actual reopening in HTTP tests and verify saved workbook/data.
- [ ] Exercise visible historical-name preservation in the actual editor; root owns this combined ticket03/04 proof.

## Comments

- 2026-10-30: Fresh ticket04 implementer confirmed integration `4d91c70` ancestry in its isolated worktree and attempted CodeGraph first. The worktree is unindexed, so source reads followed its fallback instruction. No browser, CUA, deployment or shared demo records were used. User-approved seams are the public HTTP workflow, existing plugin/runtime harnesses and root-owned real editor.
- Existing ticket02 behavior already establishes history from the canonical saved artifact: `prepareSpreadsheetOperation` resolves the published Field contract against that artifact, `validateSpreadsheetEdits` compares every source-managed cell before any picker overlay, and reconstruction retains those saved managed values. The Field's current cell in this Response is the only historical allowance. Extracted JSON ordinals, another Field/Response, earlier Submissions, client data/flags, and a failed pending choice grant no allowance. No second history model or redundant helper was introduced.
- Added `pdms-project-history.test.ts` to the explicit standard HTTP suite list. Executed native-engine opt-in: `RUN_PDMS_PROJECT_HTTP=1 ONLYOFFICE_DOCUMENT_BASE_URL=http://host.docker.internal:18204 bun test --timeout 120000 apps/server/test/http/pdms-project-history.test.ts` with an isolated database/bucket and the test-owned18204 listener. Three workflows PASS (279 assertions): exact `โครงการเดิม 00123` survives actual `/start` + new editor opening after rename/removal and successful empty loading; cross-Field/same-Form cross-Response copies, client historical flags, Clear-shaped empty picks and unsaved failed choices are rejected; a failed catalog still permits ordinary Draft work, and a current picker replacement saves and submits correctly. Public JSON and downloaded XLSX are checked together.
- TDD integration evidence: a prior ready catalog submitted under a later failed opening's capability initially returned202 instead of409. Merging ticket03's signed catalog scope at `5281f4b` turns that public regression GREEN; submission with the current failed catalog remains422 until successful loading. Failed operations retain exact saved workbook bytes/data, and releasing/replacing the lease preserves the latest trusted baseline while rejecting the old capability.
- The real Prefill handoff → launch → start workflow supplies an unrelated editable text Field; later user edits survive source picks, outage saves and reopening without replaying Prefill. The established XLSX next-entry flow starts from the blank Template and does not inherit source history or earlier Prefill; submitting again leaves the earlier Submission's public JSON and XLSX bytes unchanged. Source Fields themselves retain their existing no-Prefill contract.
- Quality checks: root `bun run fix` / `bun run check` for changed code and server typecheck PASS; spreadsheet unit94 PASS. Session6, initialization5 and existing resubmission1 HTTP regressions PASS. Existing scalar concurrent-opening regression returned409 once in a grouped run; its immediate isolated rerun PASS2 tests26 assertions. The single grouped failure remains recorded rather than being hidden by the retry. This is separate from the new history suite's GREEN result.
- A standard HTTP run without `RUN_PDMS_PROJECT_HTTP=1` skips this native-engine suite and is not runtime evidence. Native workflow files require sequential focused invocations with their own document origin (ticket02 uses18202; ticket04 uses18204). Actual visible historical preservation remains pending root's already arranged ticket03/04 proof using the exact saved name above, initial upstream failure, Retry success excluding that name, unchanged save/submit and next-entry. Do not treat the automated workbook engine as this UI proof. Production exposure remains disabled until the full graph is accepted.
