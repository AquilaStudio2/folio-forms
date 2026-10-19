import { expect, test } from "bun:test";

test("spreadsheet operations rebuild trusted layout and distinguish draft diagnostics from submit failures", async () => {
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/operations-harness.ts`],
    { stderr: "pipe", stdout: "pipe" }
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  expect(stdout).toContain("operations boundary passed");
}, 30_000);
