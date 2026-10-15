import { expect, test } from "bun:test";

test("fill, resumed draft and correction use immutable initial picture frames even after resize or deletion", async () => {
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/picture-editor-harness.ts`],
    { stderr: "pipe", stdout: "pipe" }
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  expect(stdout).toContain("picture editor configuration passed");
}, 30_000);
