import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Generated content is checked by docs:workflow:check against its sources.
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".scratch/system-workflow/inventory.json",
    ".scratch/system-workflow/inventory.md",
    ".scratch/system-workflow/system-map.html",
  ],
});
