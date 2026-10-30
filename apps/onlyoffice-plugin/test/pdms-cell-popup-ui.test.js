import { expect, test } from "bun:test";

import { buildPlugin } from "../../server/src/plugin-bundle.ts";
import { createHarness, flushPlugin } from "./harness.js";

const artifact = await buildPlugin(
  `${import.meta.dir}/..`,
  "pdms-popup-entry.js"
);
const entrySource = await artifact.text();
const all = (node) => [node, ...node.children.flatMap(all)];
const byText = (harness, text) =>
  all(harness.body).find((node) => node.textContent === text);
const latest = (harness, type) =>
  harness.messages.findLast(({ message }) => message.type === type)?.message;
const reply = (harness, state) => {
  const request = latest(harness, "locate");
  harness.dispatch({
    data: {
      ...request,
      source: "folio-pdms-popup-host",
      state,
      type: "state",
    },
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
};
const setup = async () => {
  const harness = createHarness({
    documentKind: "xlsx",
    entrySource,
    pdmsPopupChannelId: "popup-channel",
  });
  await flushPlugin();
  const ready = latest(harness, "ready");
  harness.dispatch({
    data: { ...ready, source: "folio-pdms-popup-host", type: "connected" },
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
  return harness;
};

test("the adjacent list reaches its last Thai name with bounded DOM, ignores IME Enter, and cancels/reopens the same cell", async () => {
  const harness = await setup();
  const names = Array.from(
    { length: 2500 },
    (_, index) => `โครงการ ${String(index).padStart(4, "0")}`
  );
  const state = {
    catalog: { names, sessionId: "catalog", status: "ready" },
    target: { key: "project_name", label: "ชื่อโครงการ", token: "target-one" },
  };
  reply(harness, state);
  const query = all(harness.body).find((node) => node.role === "combobox");
  expect(harness.methodInvocations).toContainEqual({
    args: ["asc.test-plugin", 430, 360, true],
    method: "ShowInputHelper",
  });
  query.dispatchEvent({ type: "compositionstart" });
  query.value = "โครงการ 2499";
  query.dispatchEvent({ type: "input" });
  query.dispatchEvent({ isComposing: true, key: "Enter", type: "keydown" });
  expect(latest(harness, "choose")).toBeUndefined();
  query.dispatchEvent({ type: "compositionend" });
  expect(
    all(harness.body)
      .filter((node) => node.role === "option")
      .map((node) => node.textContent)
  ).toEqual(["โครงการ 2499"]);
  query.dispatchEvent({ key: "Escape", type: "keydown" });
  expect(query.parentNode.hidden).toBe(true);
  expect(latest(harness, "choose")).toBeUndefined();
  byText(harness, "เปิดรายการโครงการ").click();
  reply(harness, {
    ...state,
    target: { ...state.target, token: "target-two" },
  });
  query.dispatchEvent({ key: "End", type: "keydown" });
  expect(
    all(harness.body).filter((node) => node.role === "option")
  ).toHaveLength(100);
  query.dispatchEvent({ key: "Enter", type: "keydown" });
  expect(latest(harness, "choose")).toMatchObject({
    name: "โครงการ 2499",
    token: "target-two",
  });
  expect(harness.requests).toHaveLength(0);
});
