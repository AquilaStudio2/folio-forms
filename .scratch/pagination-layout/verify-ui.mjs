// oxlint-disable no-await-in-loop -- Browser navigation and assertions share one page and must run sequentially.
// oxlint-disable unicorn/prefer-number-coercion -- Computed CSS lengths include px and require parseFloat.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const output = path.join(import.meta.dirname, "evidence");
await fs.mkdir(output, { recursive: true });
const origin = process.env.PAGINATION_WEB_ORIGIN ?? "http://localhost:5173";
const formId = "0123456789abcdef0123456789abcdef";
const date = "2026-11-03T00:00:00.000Z";
const response = (index) => ({
  createdAt: date,
  documentKind: "xlsx",
  formPublicId: formId,
  formTitle: `QA response ${index + 1}`,
  id: `response-${index + 1}`,
  state: "draft",
  status: index % 2 === 0 ? "draft" : "submitted",
  updatedAt: date,
  userEmail: `owner${index + 1}@example.test`,
});
const responses = Array.from({ length: 11 }, (_, index) => response(index));
const forms = Array.from({ length: 60 }, (_, index) => response(index));
const history = Array.from({ length: 11 }, (_, index) => ({
  createdAt: date,
  id: `history-${index + 1}`,
}));
const user = (index) => ({
  createdAt: date,
  email: `qa${index + 1}@example.test`,
  enabled: true,
  id: `user-${index + 1}`,
  mustChangePassword: false,
  name: `QA user ${index + 1}`,
  role: "user",
  updatedAt: date,
});
const pageOf = (items, pageSize, params) => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Number(params.get("page") ?? 1), totalPages);
  return {
    pagination: { page, pageSize, total, totalPages },
    rows: items.slice((page - 1) * pageSize, page * pageSize),
  };
};
const resultRows = Array.from({ length: 65 }, (_, index) => response(index));
const users = Array.from({ length: 41 }, (_, index) => user(index));
const events = Array.from({ length: 101 }, (_, index) => ({
  action: "view_response",
  actorId: "qa-owner",
  createdAt: date,
  id: `event-${index + 1}`,
  outcome: "success",
  safeMetadata: {},
  targetId: `qa-response-${index + 1}`,
  targetType: "response",
}));
const links = Array.from({ length: 23 }, (_, index) => ({
  createdAt: date,
  email: user(index).email,
  id: `link-${index + 1}`,
  providerId: "pdms",
  reviewedGeneration: "1",
  subject: `subject-${index + 1}`,
  user: user(index),
}));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const report = [];
try {
  for (const width of [1365, 640, 320]) {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { height: 900, width },
    });
    await context.addInitScript(() =>
      localStorage.setItem("onlyoffice.sessionToken", "pagination-qa-session")
    );
    const page = await context.newPage();
    let role = "admin";
    const apiCalls = [];
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      apiCalls.push(url.pathname + url.search);
      const endpoint = url.pathname;
      let body = { enabled: false };
      if (endpoint === "/api/session") {
        body = {
          session: { expiresAt: "2099-11-03T00:00:00.000Z" },
          user: { ...user(0), id: "qa-owner", role },
        };
      } else if (endpoint === "/api/admin/forms") {
        const current = Number(url.searchParams.get("page") ?? 1);
        body = {
          forms: forms.slice((current - 1) * 10, current * 10).map((row) => ({
            ...row,
            activeDraftCount: 0,
            description: "Pagination QA",
            publicId: row.id,
            status: "draft",
            submissionCount: 0,
            title: row.formTitle,
            version: 0,
          })),
          pagination: { page: current, pageSize: 10, total: 60, totalPages: 6 },
        };
      } else if (endpoint === "/api/admin/results") {
        const slice = pageOf(resultRows, 25, url.searchParams);
        body = { pagination: slice.pagination, results: slice.rows };
      } else if (endpoint === "/api/admin/audit-events") {
        const slice = pageOf(events, 50, url.searchParams);
        body = { events: slice.rows, pagination: slice.pagination };
      } else if (endpoint === "/api/admin/users") {
        const slice = pageOf(users, 20, url.searchParams);
        body = { pagination: slice.pagination, users: slice.rows };
      } else if (endpoint === "/api/admin/account-links") {
        const slice = pageOf(links, 10, url.searchParams);
        body = { pagination: slice.pagination, requests: slice.rows };
      } else if (endpoint === "/api/responses/me") {
        body = { responses };
      } else if (endpoint === `/api/admin/forms/${formId}/submissions`) {
        body = { submissions: responses };
      } else if (endpoint === `/api/forms/${formId}`) {
        body = {
          form: {
            documentKind: "docx",
            fillMethod: "native",
            publicId: formId,
            title: "แบบฟอร์มรายงานผลการปฏิบัติงาน (พลังงานจังหวัด)",
          },
        };
      } else if (endpoint === `/api/forms/${formId}/start`) {
        body = {
          editorConfigUrl: "/api/pagination-native-config",
          fillMethod: "native",
          response: { id: "qa-response" },
        };
      } else if (endpoint === "/api/pagination-native-config") {
        body = {
          capabilities: {},
          data: {},
          documentKey: "qa-document",
          fields: [],
          fillMethod: "native",
          lockedFields: {},
          pictures: {},
          responseId: "qa-response",
        };
      } else if (endpoint === `/api/forms/${formId}/my-submissions`) {
        body = { submissions: history };
      } else if (endpoint === `/api/forms/${formId}/my-submissions/export`) {
        body = history;
      } else if (endpoint === "/api/admin/ai-authoring/sessions/current") {
        body = { session: null };
      }
      await route.fulfill({
        body: JSON.stringify(body),
        contentType: "application/json",
        headers: {
          "access-control-allow-credentials": "true",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
          "access-control-allow-origin": new URL(origin).origin,
        },
        status: 200,
      });
    });
    const screens = [
      ["forms", "/admin", "admin"],
      ["results", "/admin/results", "admin"],
      ["audit", "/admin/audit", "admin"],
      ["users", "/admin/users", "admin"],
      ["submissions", `/admin/forms/${formId}/submissions`, "admin"],
      ["dashboard", "/dashboard", "user"],
      ["history", `/forms/${formId}/fill?responseId=qa-response`, "user"],
    ];
    for (const [name, route, screenRole] of screens) {
      role = screenRole;
      await page.goto(origin + route);
      const footers = page.locator('[data-slot="list-pagination"]');
      try {
        await footers.first().waitFor({ timeout: 10_000 });
      } catch (error) {
        await page.screenshot({
          fullPage: true,
          path: path.join(output, `${name}-${width}-failure.png`),
        });
        console.error({
          apiCalls,
          body: await page.locator("body").textContent(),
          currentUrl: page.url(),
          pageErrors,
        });
        throw error;
      }
      await page.evaluate(() => document.fonts.ready);
      const count = await footers.count();
      assert.equal(count, name === "users" ? 2 : 1, `${name}: footer count`);
      if (name === "audit") {
        const filters = page
          .locator("form")
          .filter({ has: page.getByLabel("Actor ID", { exact: true }) });
        const padding = await filters.evaluate((element) => ({
          left: Number.parseFloat(getComputedStyle(element).paddingLeft),
          top: Number.parseFloat(getComputedStyle(element).paddingTop),
        }));
        assert.equal(
          padding.left,
          width < 640 ? 16 : 20,
          "Audit filter horizontal padding"
        );
        assert.equal(
          padding.top,
          width < 640 ? 16 : 20,
          "Audit filter vertical padding"
        );
        await filters.locator("..").screenshot({
          path: path.join(output, `audit-filters-${width}.png`),
        });
      }
      for (let index = 0; index < count; index += 1) {
        const footer = footers.nth(index);
        await footer.scrollIntoViewIfNeeded();
        const bounds = await footer.evaluate((element) => {
          const summary = element.querySelector("p").getBoundingClientRect();
          const nav = element.querySelector("nav").getBoundingClientRect();
          const outer = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            nav: nav.toJSON(),
            outer: outer.toJSON(),
            paddingLeft: Number.parseFloat(style.paddingLeft),
            paddingRight: Number.parseFloat(style.paddingRight),
            summary: summary.toJSON(),
            viewport: innerWidth,
          };
        });
        assert.ok(
          Math.abs(
            bounds.summary.left - bounds.outer.left - bounds.paddingLeft
          ) < 2,
          `${name}: summary left edge`
        );
        assert.ok(
          Math.abs(
            bounds.nav.right - bounds.outer.right + bounds.paddingRight
          ) < 2,
          `${name}: controls right edge`
        );
        assert.ok(
          bounds.nav.left >= 0 && bounds.nav.right <= width + 1,
          `${name}: controls fit viewport`
        );
        if (width >= 640) {
          assert.ok(
            Math.abs(
              (bounds.summary.top + bounds.summary.bottom) / 2 -
                (bounds.nav.top + bounds.nav.bottom) / 2
            ) < 2,
            `${name}: desktop row`
          );
        } else {
          assert.ok(
            bounds.nav.top >= bounds.summary.bottom,
            `${name}: stacked mobile rows`
          );
        }
        const frame = await footer.evaluate((element) => {
          const parent = getComputedStyle(element.parentElement);
          const footerStyle = getComputedStyle(element);
          return {
            background: parent.backgroundColor,
            border: Number.parseFloat(parent.borderLeftWidth),
            divider: Number.parseFloat(footerStyle.borderTopWidth),
            radius: Number.parseFloat(parent.borderBottomLeftRadius),
          };
        });
        assert.ok(
          frame.border >= 1 &&
            frame.radius > 0 &&
            frame.background !== "rgba(0, 0, 0, 0)",
          `${name}: footer shares the list frame`
        );
        assert.ok(frame.divider >= 1, `${name}: footer divider`);
        const nav = footer.getByRole("navigation");
        const navLabel = await nav.getAttribute("aria-label");
        const summary = await footer.locator("p").textContent();
        const totalPages = Number(
          summary.match(/หน้า \d+ จาก (?<pages>\d+)/u)?.groups?.pages
        );
        assert.ok(totalPages > 1, `${name}: multi-page fixture`);
        for (const buttonLabel of [
          "หน้าแรก",
          "หน้าก่อนหน้า",
          "หน้าถัดไป",
          "หน้าสุดท้าย",
        ]) {
          assert.equal(
            await nav
              .getByRole("button", { exact: true, name: buttonLabel })
              .count(),
            1,
            `${name}: shared ${buttonLabel}`
          );
        }
        const firstButton = await nav
          .getByRole("button", { exact: true, name: "หน้าแรก" })
          .boundingBox();
        const lastButton = await nav
          .getByRole("button", { exact: true, name: "หน้าสุดท้าย" })
          .boundingBox();
        assert.ok(
          firstButton &&
            lastButton &&
            Math.abs(firstButton.y - lastButton.y) < 2,
          `${name}: controls stay together`
        );
        const waitForPage = (target) =>
          page.waitForFunction(
            ({ label, targetPage }) => {
              const navElement = [...document.querySelectorAll("nav")].find(
                (element) => element.getAttribute("aria-label") === label
              );
              return navElement
                ?.closest('[data-slot="list-pagination"]')
                ?.querySelector("p")
                ?.textContent.includes(`หน้า ${targetPage} จาก`);
            },
            { label: navLabel, targetPage: target }
          );
        await nav
          .getByRole("button", {
            exact: true,
            name: width >= 640 ? "ไปหน้า 2" : "หน้าถัดไป",
          })
          .click();
        await waitForPage(2);
        if (totalPages > 2) {
          await nav
            .getByRole("button", { exact: true, name: "หน้าสุดท้าย" })
            .click();
          await waitForPage(totalPages);
        } else {
          assert.equal(
            await nav
              .getByRole("button", { exact: true, name: "หน้าสุดท้าย" })
              .isDisabled(),
            true
          );
        }
        assert.equal(
          await nav
            .getByRole("button", { exact: true, name: "หน้าถัดไป" })
            .isDisabled(),
          true
        );
        await nav.getByRole("button", { exact: true, name: "หน้าแรก" }).click();
        await waitForPage(1);
        assert.equal(
          await nav
            .getByRole("button", { exact: true, name: "หน้าก่อนหน้า" })
            .isDisabled(),
          true
        );
        await footer.screenshot({
          path: path.join(output, `${name}-${width}-${index}.png`),
        });
        if (name === "forms" || name === "dashboard") {
          await footer.locator("..").screenshot({
            path: path.join(output, `${name}-container-${width}.png`),
          });
        }
        report.push({
          aligned: true,
          directNavigation: true,
          footer: index + 1,
          framed: true,
          name,
          numbered: true,
          totalPages,
          width,
        });
      }
      if (name === "dashboard") {
        const nav = page.getByRole("navigation", { name: "แบ่งหน้าแดชบอร์ด" });
        await nav.getByRole("button", { exact: true, name: "หน้าถัดไป" }).click();
        await page.getByText("QA response 11", { exact: true }).waitFor();
        assert.equal(
          await page.getByText("QA response 1", { exact: true }).count(),
          0
        );
        assert.equal(
          await page
            .getByText("คำตอบทั้งหมด", { exact: true })
            .evaluate((element) => element.previousElementSibling.textContent),
          "11"
        );
      }
      if (name === "history") {
        const nav = page.getByRole("navigation", {
          name: "แบ่งหน้าประวัติการส่งแบบฟอร์ม",
        });
        assert.equal(
          await page.getByRole("link", { name: "ดูใบรับคำตอบ" }).count(),
          10
        );
        await nav.getByRole("button", { exact: true, name: "หน้าถัดไป" }).click();
        assert.equal(
          await page.getByRole("link", { name: "ดูใบรับคำตอบ" }).count(),
          1
        );
        const downloadEvent = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "ดาวน์โหลดข้อมูลที่ส่งทั้งหมด" })
          .click();
        const download = await downloadEvent;
        const exportPath = path.join(output, `history-export-${width}.json`);
        await download.saveAs(exportPath);
        const exportedRows = JSON.parse(await fs.readFile(exportPath, "utf-8"));
        assert.equal(exportedRows.length, 11);
        await fs.writeFile(
          exportPath,
          `${JSON.stringify(exportedRows, null, 2)}\n`
        );
        assert.ok(
          apiCalls.includes(`/api/forms/${formId}/my-submissions/export`)
        );
      }
      console.log(`PASS ${name} at ${width}px`);
    }
    role = "admin";
    await page.goto(`${origin}/admin/ai-authoring`);
    await page
      .getByRole("heading", { name: /AI Authoring/u })
      .first()
      .waitFor();
    assert.equal(
      await page.locator('[data-slot="list-pagination"]').count(),
      0
    );
    assert.deepEqual(pageErrors, [], "No browser runtime errors");
    console.log(`PASS AI Authoring single-session screen at ${width}px`);
    await context.close();
  }
  await fs.writeFile(
    path.join(output, "browser-checks.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(
    `Verified ${report.length} pagination footers and full-history exports.`
  );
} finally {
  await browser.close();
}
