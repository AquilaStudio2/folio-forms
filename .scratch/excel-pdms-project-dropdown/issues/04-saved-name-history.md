# 04: Resume and submit unchanged historical project names

**What to build:** A User reopens a saved scalar answer after PDMS renames or removes its name and can keep and submit that exact saved answer, or select a replacement from the new session list.

**Blocked by:** 02 — Author and complete a scalar PDMS project-name Field.

**Status:** ready-for-agent

Type: task

Approval: Published after the user instructed implementation of the proposed spec and ticket graph.

- [ ] Derive historical allowances from the authoritative saved Response/Field baseline and preserve its exact saved name without clearing or automatic renaming.
- [ ] A successful current catalog load still precedes submission; an unchanged trusted saved name may be absent from that list.
- [ ] An unsaved/tampered value cannot gain a historical exception through a client flag, another Response, a different Field or previously chosen-but-unsaved text.
- [ ] Replacing a historical value is a current authorized picker selection; no free text or Clear action is added.
- [ ] Persist workbook and answer together across save/resume, and preserve the latest trusted baseline through operation retries and session replacement.
- [ ] Do not mutate earlier immutable Submissions or change unrelated Prefill/resubmission behavior.
- [ ] Demonstrate upstream removal and rename across actual reopening in HTTP tests, verify saved workbook/data and exercise visible preservation in the editor.
