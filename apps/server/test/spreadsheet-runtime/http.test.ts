import { expect, test } from "bun:test";

test.skipIf(process.env.RUN_SPREADSHEET_HTTP !== "1")(
  "real engine HTTP builder recalculates canonical XLSX, mutates rows and downloads PDF",
  async () => {
    const child = Bun.spawn(
      [process.execPath, `${import.meta.dir}/http-harness.ts`],
      { stderr: "pipe", stdout: "pipe" }
    );
    const timeout = setTimeout(() => child.kill(), 110_000);
    try {
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
      expect(stdout).toContain("real HTTP builder passed");
    } finally {
      clearTimeout(timeout);
      child.kill();
    }
  },
  120_000
);
