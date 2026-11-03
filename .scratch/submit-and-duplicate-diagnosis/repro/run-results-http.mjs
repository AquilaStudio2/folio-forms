// oxlint-disable no-await-in-loop -- HTTP suites share one isolated database and run sequentially.
import path from "node:path";

import { config } from "dotenv";

const root = path.resolve(import.meta.dirname, "../../..");
config({ path: path.resolve(root, "apps/server/.env"), quiet: true });
const source = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(source.hostname)) {
  throw new Error(
    "This runner only creates test databases on local PostgreSQL"
  );
}
const { prisma } = await import("../../../packages/db/src/index.ts");
const database = `folio_results_display_test_${crypto.randomUUID().replaceAll("-", "")}`;
const target = new URL(source);
target.pathname = `/${database}`;
const environment = { ...process.env, DATABASE_URL: target.toString() };
const run = (command, cwd) =>
  Bun.spawn(command, {
    cwd,
    env: environment,
    stderr: "inherit",
    stdout: "inherit",
  }).exited;

await prisma.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
let code = 0;
try {
  code = await run(
    ["bun", "run", "db:migrate"],
    path.resolve(root, "packages/db")
  );
  if (code === 0) {
    for (const suite of process.argv.slice(2)) {
      code = await run(
        ["bun", "test", "--timeout", "120000", suite],
        path.resolve(root, "apps/server")
      );
      if (code !== 0) {
        break;
      }
    }
  }
} finally {
  await prisma.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
  await prisma.$disconnect();
}
process.exitCode = code;
