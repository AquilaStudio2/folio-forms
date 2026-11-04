import { readFileSync, writeFileSync, mkdirSync, accessSync } from "node:fs";
import path from "node:path";

import { marked } from "marked";

const directory = import.meta.dirname;
const root = path.resolve(directory, "../..");
const checking = process.argv.includes("--check");
const writeOutput = (file, content) => {
  if (checking) {
    if (readFileSync(file, "utf-8") !== content) {
      throw new Error(
        `Stale workflow output ${path.relative(root, file)}. Run bun run docs:workflow:build.`
      );
    }
    return;
  }
  writeFileSync(file, content);
};
const source = readFileSync(path.join(directory, "system-map.md"), "utf-8");
const inventory = JSON.parse(
  readFileSync(path.join(directory, "inventory.json"), "utf-8")
);
const diagramDirectory = path.join(directory, "diagrams");
if (!checking) {
  mkdirSync(diagramDirectory, { recursive: true });
  mkdirSync(path.join(directory, "rendered"), { recursive: true });
}

const slugs = [
  "overview",
  "pages",
  "login-session",
  "pdms-sso",
  "form-authoring",
  "response-lifecycle",
  "save-sequence",
  "spreadsheet-pdms",
  "results-correction",
  "accounts-deletion-audit",
  "ai-authoring",
  "prefill-handoff",
  "architecture",
  "data-model",
  "startup-recovery",
  "save-and-return",
  "form-status",
  "response-status",
  "operation-status",
  "exit-and-reconnect",
  "correction-continuation",
  "all-statuses",
  "daily-scenarios",
];
const diagrams = [];
const sections = [
  ...source.matchAll(
    /^## (?<id>\d{2}) (?<title>[^\n]+)\n(?<body>[\s\S]*?)(?=^## |$(?![\s\S]))/gmu
  ),
];
for (const section of sections) {
  const block = /```mermaid\n(?<mermaid>[\s\S]*?)```/u.exec(
    section.groups.body
  );
  if (!block) {
    throw new Error(`Missing diagram ${section.groups.id}`);
  }
  const index = Number(section.groups.id);
  if (index !== diagrams.length + 1) {
    throw new Error(`Unexpected diagram number ${section.groups.id}`);
  }
  const file = `${section.groups.id}-${slugs[index - 1]}.mmd`;
  const mermaidSyntax = `${block.groups.mermaid.trim()}\n`;
  const item = {
    file: `diagrams/${file}`,
    id: section.groups.id,
    mermaidSyntax,
    title: section.groups.title,
    type: mermaidSyntax.split(/\s/u)[0],
  };
  diagrams.push(item);
  writeOutput(path.join(directory, item.file), mermaidSyntax);
}
if (diagrams.length !== slugs.length) {
  throw new Error(
    `Expected ${slugs.length} diagrams, found ${diagrams.length}`
  );
}
writeOutput(
  path.join(directory, "diagrams.json"),
  `${JSON.stringify(diagrams, null, 2)}\n`
);

const normalizeRoute = (route) =>
  route
    .replaceAll(/\$(?<parameter>\w+)/gu, ":$<parameter>")
    .replace(/\/$/u, "") || "/";
const pageSection = sections.find((section) => section.groups.id === "02");
const pageTable = new Set(
  [...pageSection.groups.body.matchAll(/`(?<route>\/[^`]*)`/gu)].map(
    (match) => match.groups.route
  )
);
const routes = new Set(
  inventory.pages
    .filter((item) => item.route !== "__root")
    .map((item) => normalizeRoute(item.route))
);
for (const route of routes) {
  if (!pageTable.has(route)) {
    throw new Error(`Uncovered page ${route}`);
  }
}
for (const [name, values] of Object.entries(inventory.status_enums)) {
  const row = source
    .split("\n")
    .find((line) => line.split("|")[1]?.trim() === `\`${name}\``);
  if (!row || !values.every((value) => row.includes(`\`${value}\``))) {
    throw new Error(`Uncovered status values for ${name}`);
  }
}
for (const match of source.matchAll(/\]\((?<target>\.\.\/\.\.\/[^)]+)\)/gu)) {
  const file = path.resolve(
    directory,
    match.groups.target.replace(/#L\d+$/u, "")
  );
  accessSync(file);
  const lineNumber = /#L(?<line>\d+)$/u.exec(match.groups.target);
  if (
    lineNumber &&
    Number(lineNumber.groups.line) >
      readFileSync(file, "utf-8").split("\n").length
  ) {
    throw new Error(`Invalid source line ${match.groups.target}`);
  }
}

const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
let figureIndex = 0;
let renderedCount = 0;
const blockMatches = [
  ...source.matchAll(/```mermaid\n(?<mermaid>[\s\S]*?)```/gu),
];
let documentSource = source;
for (const block of blockMatches) {
  const item = diagrams[figureIndex];
  figureIndex += 1;
  const svgFile = path.join(
    directory,
    "rendered",
    `system-map-${figureIndex}.svg`
  );
  let figure;
  try {
    let svg = readFileSync(svgFile, "utf-8");
    const viewBox = /viewBox="(?<box>[^"]+)"/u
      .exec(svg)
      ?.groups.box.split(/\s+/u)
      .map(Number);
    if (!viewBox || !Number.isFinite(viewBox[2]) || viewBox[2] <= 0) {
      throw new Error(`Invalid SVG ${svgFile}`);
    }
    const width = Math.ceil(viewBox[2]);
    const height = Math.ceil(viewBox[3]);
    svg = svg.replace(
      /<svg\b(?<attributes>[^>]+)>/u,
      (whole, attributes) =>
        `<svg${attributes.replaceAll(/\s(?:width|height)="[^"]*"/gu, "")} width="${width}" height="${height}">`
    );
    const data = Buffer.from(svg).toString("base64");
    const initialSize =
      width > 1100
        ? `width:${Math.round(width * 0.85)}px;max-width:none`
        : `width:${width}px;max-width:100%`;
    figure = `<figure id="diagram-${item.id}"><div class="diagram-tools" role="group" aria-label="ขนาดไดอะแกรม ${item.id}"><span>ภาพ ${item.id}</span><button type="button" data-zoom="fit">พอดีหน้า</button><button type="button" data-zoom="actual">ขนาดจริง</button><button type="button" data-zoom="out" aria-label="ย่อภาพ ${item.id}">−</button><button type="button" data-zoom="in" aria-label="ขยายภาพ ${item.id}">+</button><a href="${item.file}">Mermaid source</a></div><div class="diagram-scroll" tabindex="0" aria-label="เลื่อนดูไดอะแกรม ${item.id}"><img src="data:image/svg+xml;base64,${data}" alt="${escape(item.title)}" data-width="${width}" style="${initialSize}"></div></figure>`;
    renderedCount += 1;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    figure = `<pre><code>${escape(item.mermaidSyntax)}</code></pre>`;
  }
  documentSource = documentSource.replace(block[0], figure);
}
documentSource = documentSource.replaceAll(
  /\]\((?<target>\.\.\/\.\.\/[^)]+)\)/gu,
  (whole, target) => {
    const line = /#L(?<line>\d+)$/u.exec(target);
    const relative = target
      .slice(6)
      .replace(/#L\d+$/u, "")
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    return `](https://github.com/AquilaStudio2/folio-forms/blob/${inventory.commit}/${relative}${line ? `#L${line.groups.line}` : ""})`;
  }
);
const htmlBody = marked
  .parse(documentSource, { gfm: true })
  .replaceAll(
    /<h2>(?<id>\d{2}) /gu,
    (whole, id) => `<h2 id="section-${id}">${id} `
  );
const readingOrder = [
  ...diagrams.filter((item) => Number(item.id) >= 16),
  ...diagrams.filter((item) => Number(item.id) < 16),
];
const nav = readingOrder
  .map(
    (item) =>
      `<a href="#section-${item.id}"><span>${item.id}</span> ${escape(item.title)}</a>`
  )
  .join("\n");
const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Folio Forms · การทำงานทั้งระบบ</title>
<style>
:root{color-scheme:light;--ink:#203c36;--soft:#526760;--paper:#fff;--canvas:#f2f6f3;--line:#d6e1db;--accent:#126d5c}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--canvas);font-family:Thonburi,"Noto Sans Thai",Tahoma,sans-serif;font-size:16px;line-height:1.75}aside{position:fixed;inset:0 auto 0 0;width:260px;padding:28px 20px;overflow:auto;background:#173f35;color:#f2faf5}aside .brand{font-size:22px;letter-spacing:-.03em;margin:0 0 6px}aside small{color:#c5dcd2}nav{display:grid;gap:4px;margin-top:25px}nav a{color:inherit;text-decoration:none;padding:9px 10px;border-radius:8px;font-size:13px;line-height:1.65}nav a:hover,nav a:focus-visible{background:#2d574a}nav span{display:inline-block;min-width:24px;color:#9ed9c0}main{max-width:1500px;margin-left:260px;padding:40px 40px 80px}h1{font-size:30px;line-height:1.4;margin:0 0 20px}h2{font-size:23px;margin:56px 0 20px;padding-top:10px;border-top:1px solid var(--line)}p{max-width:105ch;margin:14px 0}a{color:var(--accent);text-underline-offset:3px}code{font-family:ui-monospace,monospace;font-size:.88em;overflow-wrap:anywhere}pre{overflow:auto;background:#e9efeb;padding:18px;border-radius:8px}figure{margin:22px 0;background:var(--paper);border:1px solid var(--line);border-radius:12px;overflow:hidden;scroll-margin-top:20px}.diagram-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;background:#edf4ef}.diagram-tools span{margin-right:auto;font-size:13px;font-weight:600}.diagram-tools button,.diagram-tools a{background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:5px 10px;font:inherit;font-size:12px;text-decoration:none;cursor:pointer}.diagram-tools button:focus-visible,.diagram-tools a:focus-visible{outline:3px solid #56a58b;outline-offset:2px}.diagram-scroll{overflow:auto;padding:20px;max-height:none}.diagram-scroll img{display:block;height:auto}table{width:100%;border-collapse:collapse;background:var(--paper);font-size:14px;margin:20px 0;display:block;overflow-x:auto}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:12px 14px}th{background:#e6eee8;white-space:nowrap}td:first-child{min-width:190px}td{min-width:240px}th:last-child,td:last-child{min-width:300px}main>p:nth-of-type(1){color:var(--soft);font-size:14px}.footer{font-size:13px;color:var(--soft)}@media(max-width:950px){aside{position:relative;width:100%;padding:20px}nav{display:flex;gap:8px;overflow:auto;margin-top:15px}nav a{flex:0 0 200px}main{margin:0;padding:25px 18px}h1{font-size:25px}h2{font-size:21px}}@media print{aside,.diagram-tools{display:none}main{margin:0;padding:0}body{background:white}.diagram-scroll{max-height:none;overflow:visible}figure{break-inside:avoid}.diagram-scroll img{width:100%!important;max-width:100%!important}h2{break-before:page}a{color:inherit}table{font-size:10px}td,th{min-width:0!important;padding:6px}}
</style></head><body><aside><p class="brand">Folio Forms</p><small>แผนผังระบบ · 4 พ.ย. 2026<br>main · ${inventory.commit.slice(0, 8)}</small><nav aria-label="ไดอะแกรมทั้งระบบ">${nav}</nav></aside><main>${htmlBody}<p class="footer">สร้างภาพจาก Mermaid source ด้วย Mermaid CLI 11.12.0 สามารถดูไดอะแกรมในไฟล์นี้ได้โดยไม่ต้องเชื่อมอินเทอร์เน็ต</p></main>
<script>
document.addEventListener('click',event=>{const button=event.target.closest('button[data-zoom]');if(!button)return;const figure=button.closest('figure');const image=figure.querySelector('img');const natural=Number(image.dataset.width);const action=button.dataset.zoom;if(action==='fit'){image.style.width='100%';image.style.maxWidth='100%';return}const current=image.getBoundingClientRect().width;const width=action==='actual'?natural:Math.max(200,Math.min(natural*3,current*(action==='in'?1.25:.8)));image.style.maxWidth='none';image.style.width=width+'px'});
</script></body></html>`;
writeOutput(path.join(directory, "system-map.html"), html);
console.log(
  JSON.stringify(
    {
      diagrams: diagrams.length,
      html_bytes: Buffer.byteLength(html),
      rendered: renderedCount,
      source_links_valid: true,
      status_enum_groups_covered: Object.keys(inventory.status_enums).length,
      unique_page_routes_covered: routes.size,
    },
    null,
    2
  )
);
