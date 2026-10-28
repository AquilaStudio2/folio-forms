import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("fill, resumed draft and correction use immutable initial picture frames even after resize or deletion", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "folio-picture-editor-"));
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        `${import.meta.dir}/picture-editor-harness.ts`,
      ],
      {
        cwd: directory,
        // Loading the real identity guard initializes auth/env; fixtures never use live services.
        env: {
          BETTER_AUTH_SECRET: "picture-test-auth-secret-0000000000000000",
          BETTER_AUTH_URL: "http://localhost:3000",
          DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/fixture",
          EDITOR_CAPABILITY_SECRET: "picture-test-editor-secret-00000000000000",
          NODE_ENV: "test",
          ONLYOFFICE_JWT_SECRET: "picture-test-office-secret-00000000000000",
          PATH: process.env.PATH,
          PREFILL_HANDOFF_SECRET: "picture-test-prefill-secret-0000000000000",
          RUSTFS_ACCESS_KEY_ID: "picture-test-access",
          RUSTFS_BUCKET: "picture-test-bucket",
          RUSTFS_ENDPOINT: "http://127.0.0.1:1",
          RUSTFS_SECRET_ACCESS_KEY: "picture-test-storage-secret",
        },
        stderr: "pipe",
        stdout: "pipe",
      }
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(stdout).toContain("picture editor configuration passed");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}, 30_000);
