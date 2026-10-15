import { expect, test } from "bun:test";

test("engine serves scoped jobs, checks download origins, polls and cleans up on every outcome", async () => {
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/engine-harness.ts`],
    { stderr: "pipe", stdout: "pipe" }
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  expect(stdout).toContain("engine boundary passed");
}, 30_000);
