import { expect, test } from "bun:test";

test("validation callbacks release ONLYOFFICE and unchanged retries use the latest snapshot", async () => {
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/fixtures/force-save-recovery.ts`],
    { stderr: "pipe", stdout: "pipe" }
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  expect(stdout).toContain("force-save recovery passed");
});
