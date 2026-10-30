# Use live PDMS choices with saved project-name answers

**Status:** Accepted and implemented; production exposure remains disabled.

XLSX Fields configured with the PDMS Project Name Source use refreshed project names as choices, while their answers remain name strings rather than references to distinct PDMS projects. Identical names collapse into one choice; an unchanged previously saved name remains valid after upstream renaming or removal, preserving the user's saved answer instead of silently rewriting it.

This deliberately trades unique-project identity and automatic rename propagation for the requested name-list behavior and stable historical answers. A future feature that needs to distinguish same-name projects must introduce an explicit identity contract; it cannot reconstruct those distinctions from these saved names. New choices require the current catalog, while historical-value exceptions must be established from trusted saved state.
