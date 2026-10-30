import { expect, test } from "bun:test";

import { createHarness, flushPlugin } from "./harness.js";

const build = await Bun.build({
  entrypoints: [
    `${import.meta.dir}/../../server/test/prototypes/pdms-picker/picker.js`,
  ],
  format: "iife",
  target: "browser",
});
const entrySource = await build.outputs[0].text();
const names = Array.from(
  { length: 2500 },
  (_, index) => `โครงการทดสอบ ${String(index).padStart(4, "0")}`
);
const setup = async () => {
  const harness = createHarness({
    bodyDataset: { session: "synthetic-test-session" },
    browserGlobals: {
      location: { origin: "https://web.example.test" },
      performance,
    },
    entrySource,
    extraElementIds: [
      "target",
      "query",
      "results",
      "count",
      "more",
      "cancel",
      "read",
      "save",
      "row",
      "status",
    ],
    responses: [{ names, revision: 0 }, {}],
  });
  await flushPlugin();
  return harness;
};

test("IME composition and cancellation leave the answer untouched while Thai substring search reaches the last project", async () => {
  const harness = await setup();
  const query = harness.element("query");
  query.dispatchEvent({ type: "compositionstart" });
  query.value = "โครงการทดสอบ 2499";
  query.dispatchEvent({ type: "input" });
  query.dispatchEvent({ isComposing: true, key: "Enter", type: "keydown" });
  expect(harness.element("results").children).toHaveLength(100);
  query.dispatchEvent({ type: "compositionend" });
  expect(
    harness.element("results").children.map((item) => item.textContent)
  ).toEqual(["โครงการทดสอบ 2499"]);
  query.dispatchEvent({ key: "Escape", type: "keydown" });
  expect(query.value).toBe("");
  expect(
    harness.requests.some((request) => request.url.endsWith("/select"))
  ).toBe(false);
});

test("keyboard focus and paging keep every long-list result reachable", async () => {
  const harness = await setup();
  const query = harness.element("query");
  query.dispatchEvent({ key: "ArrowDown", type: "keydown" });
  expect(query["aria-activedescendant"]).toBe("project-1");
  for (let page = 0; page < 24; page += 1) {
    harness.element("more").dispatchEvent({ type: "click" });
  }
  expect(harness.element("results").children.at(-1).textContent).toBe(
    "โครงการทดสอบ 2499"
  );
  expect(harness.element("more").hidden).toBe(true);
});
