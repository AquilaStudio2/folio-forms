# 01: Search current Responses by province with existing filters

**What to build:** An Admin or Viewer selects a province on the existing results page and finds the current saved Responses that satisfy that province and every other selected existing filter. The returned results agree with the current result detail and remain complete across pages.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Provide a labelled, keyboard-accessible, single-value Province control with an all-values default and the complete central Thai province-name list, including `กรุงเทพมหานคร`. Keep the choices available when the result set is empty.
- [ ] Apply the Province choice through the existing Search action using the optional `province` query parameter. Omit it when inactive. Preserve pending versus applied criteria, reset the cursor on a changed search, and retain all applied criteria on Reload and next/previous page navigation.
- [ ] A Response qualifies only through an exact, case-sensitive `province` Tag declared as a scalar root Field in its own Published Template. Cover DOCX and XLSX Forms. Labels, editable Template Drafts, undeclared JSON properties, and nested or table values do not establish eligibility.
- [ ] Match full Thai province strings after trimming outer whitespace. Prefixes, aliases, codes, unsupported types, nulls, empty values, and missing Fields or values fail the active criterion. An inactive Province filter imposes no Field requirement.
- [ ] Use saved Draft data for Draft and Submitting Responses. Use the latest Submission with its latest Correction's complete answer data for Submitted Responses. Older revisions do not qualify a current result, and a reopened Response uses its saved Draft.
- [ ] Combine Province with all existing Form Public ID, user email, status, latest-Correction, From, and To conditions using AND. Preserve the existing status mapping, latest-Correction meaning, and update-date boundaries.
- [ ] Refactor the narrow results-query flow as needed before adding answer matching, retaining the existing externally observable behavior. Province matching and the latest-Correction condition must both be evaluated before deciding which matches fill a page; an intermediate candidate-ID cap cannot hide later matches.
- [ ] Preserve one row per Response, existing summary/detail links, the 25-result page size, update-time/identifier ordering, and cursor response contract. Use bounded candidate batches and determine continuation from additional combined matches.
- [ ] Use the existing saved JSON and published Field records without a schema migration or changes to saved answers, documents, or history. Establish reusable current-value matching and central-choice conventions for subsequent filters.
- [ ] Preserve Admin and Viewer read access and the existing rejection of unauthorized access. Keep loading, empty, authentication, permission, and request-error states distinguishable.
- [ ] Add authenticated HTTP tests with the real application handler and an isolated PostgreSQL database. Cover both document kinds, every current state/revision case, Field eligibility, exact/trimmed values, each existing-filter combination, and inactive-filter compatibility.
- [ ] Include sparse pagination tests with more than a page of newer nonmatches before older matches, multiple matching pages, tied update timestamps, and combined latest-Correction conditions. Assert result identities and cursor behavior without mocking ORM calls.
- [ ] Add rendered-page tests using the existing router and HTTP-mocking patterns for selecting Province, sending it alongside every existing parameter, clearing it, applying Search, retaining criteria across navigation/Reload, and keyboard-labelled controls. Demonstrate the complete flow with synthetic saved Responses and run the relevant tests and normal code checks.
