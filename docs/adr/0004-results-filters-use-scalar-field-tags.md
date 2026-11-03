# Filter current Responses through designated scalar Field Tags

**Status:** Accepted and implemented.

Province, Month, and Fiscal year filters identify scalar root Fields by the canonical Tags `province`, `month`, and `fiscal_year`, then compare their values in the current saved Response data. Drafts use their saved data. Submitted Responses use the latest Submission with its latest Correction, so searching agrees with opening the current result.

Table columns and older revisions do not participate. This keeps each search result tied to the existing Response row and the values visible when it opens. Filter choices come from central lists, allowing selection of a supported value even when no saved Response currently contains it.

Reporting columns display the saved scalar values independently of filter matching. Nonempty strings, numbers and booleans remain visible even when they do not match a supported Province, Month or Fiscal year filter. Missing Fields, empty answers and structured values display `-`. Province matching still trims surrounding whitespace and compares full Thai names, Month matching still requires full Thai names, and Fiscal year matching still treats numeric and text Buddhist Era years as equivalent.

Combine these criteria with all existing Form, email, state, latest-Correction, and update-date criteria using AND before pagination. The update-date controls retain their existing meaning while Month and Fiscal year compare saved Field values.

The canonical Tags become part of the published Form contract. Renaming one later requires an explicit compatibility or migration decision because published Fields are immutable.
