# Keep the system map current

The PM guide lives in [`.scratch/system-workflow/`](../../.scratch/system-workflow/README.md). Its authoritative content is `system-map.md`; the HTML, Mermaid files, SVGs, inventory, and sharing archive are generated outputs.

For every application, integration, or deployment change:

1. Trace the changed behavior in the current source. Review the affected pages, actors and permissions, API calls, persisted data, status transitions, and failure or recovery paths. Check save, exit, reopen, submit, correction, and deletion behavior whenever the change touches stored work.
2. Update every affected explanation, table, source reference, and Mermaid diagram in `system-map.md` in the same change. Refresh the audit date and source baseline when behavior changes. Describe the implemented behavior and identify any integration that was not verified. When behavior is unchanged, record that conclusion and its reason in the change description.
3. Run `bun run docs:workflow:build` after reviewing the content. This refreshes the source fingerprint and declarations, renders the diagrams, and rebuilds the offline HTML and sharing ZIP. Generated metadata records which source was reviewed; it does not establish that the explanation is correct.
4. Open `system-map.html` and inspect each changed diagram and its surrounding explanation. Check text, arrows, zoom controls, source links, and the affected page and status tables. Then run `bun run docs:workflow:check` and the normal checks required for the code change.
5. Commit the updated content and generated outputs together. Report the affected guide sections and the verification performed. A changed fingerprint is complete only after the content review above.

CI runs the workflow check. It detects changes to application and deployment source since the last guide review, changed page/API/model/status declarations, missing or stale diagram outputs, and HTML or ZIP files that were not rebuilt. It cannot judge the meaning of prose or arrows; that review remains part of the task.

For documentation-only edits, rebuild with `bun run docs:workflow:build` and inspect the affected content. The source commit in the inventory is the audit baseline; a later documentation-only commit does not invalidate it. Keep repository source references relative so the guide can be rebuilt from another checkout.
