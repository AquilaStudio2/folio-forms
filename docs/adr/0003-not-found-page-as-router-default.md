# ADR 0003: Set the not-found page once as the router default

**Status:** Accepted

## Context

Unknown URLs showed the router's default not-found output, which does not match the app and offers no way back.

## Decision

- Register the 404 page as `defaultNotFoundComponent` on the router in `apps/web/src/main.tsx`, not per route. It covers every unmatched URL.
- Its "Back to home" button links to `/`; the existing redirect there sends signed-in users to their dashboard and others to login.
- The blue and white colors apply to this page only; the global theme is unchanged.
