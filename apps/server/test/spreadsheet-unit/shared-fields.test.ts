import { expect, test } from "bun:test";

test("shared field rows preserve spreadsheet semantics without duplicated configuration", async () => {
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/shared-fields-harness.ts`],
    { stderr: "pipe", stdout: "pipe" }
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  expect(stdout).toContain("shared field conversion passed");
});
