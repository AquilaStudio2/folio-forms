// oxlint-disable unicorn/no-await-expression-member -- HTTP assertions remain adjacent to each request.
import { expect, test } from "bun:test";

import { startPickerPrototype } from "./server";

test.skipIf(process.env.RUN_PDMS_PICKER_PROTOTYPE !== "1")(
  "only an authorized current-catalog selection receives a controlled cell write",
  async () => {
    const prototype = await startPickerPrototype({ port: 0 });
    try {
      const request = (body: unknown, authorized = true) =>
        fetch(`${prototype.origin}/prototype/select`, {
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
            ...(authorized ? { "X-Prototype-Session": prototype.session } : {}),
          },
          method: "POST",
        });
      expect(
        (
          await request(
            { name: "โครงการทดสอบ 2499", revision: 0, target: "project" },
            false
          )
        ).status
      ).toBe(401);
      expect(
        (await request({ name: "arbitrary", revision: 0, target: "project" }))
          .status
      ).toBe(422);
      const selected = await request({
        name: "โครงการทดสอบ 2499",
        revision: 0,
        target: "project",
      });
      expect(selected.status).toBe(200);
      expect(await selected.json()).toMatchObject({
        address: "A1:B1",
        name: "โครงการทดสอบ 2499",
        revision: 1,
      });
      expect(
        (
          await request({
            name: "โครงการทดสอบ 0001",
            revision: 0,
            target: "project",
          })
        ).status
      ).toBe(409);
    } finally {
      await prototype.stop();
    }
  },
  120_000
);
