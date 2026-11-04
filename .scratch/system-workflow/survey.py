#!/usr/bin/env python3
"""Regenerate the declared page/API/model inventory for the system diagrams."""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent


def relative(path):
    return str(path.relative_to(ROOT))


def line_at(source, offset):
    return source.count("\n", 0, offset) + 1


def source_fingerprint():
    """Hash runtime source, including new files, without build outputs or tests."""
    candidates = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
    ).decode().split("\0")
    excluded = {"node_modules", "generated", "test", "tests", "__tests__", "fixtures", "__fixtures__", "dist", "build"}
    extensions = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".css", ".prisma", ".sql", ".toml", ".yaml", ".yml"}
    paths = []
    for name in sorted(set(candidates)):
        path = Path(name)
        if not name or not (ROOT / path).is_file() or excluded.intersection(path.parts):
            continue
        if ".test." in name or ".spec." in name or path.name == "routeTree.gen.ts":
            continue
        if path.parts[0] not in {"apps", "packages", "gateway", "onlyoffice"} and name not in {"compose.yaml", "compose.dev.yaml"}:
            continue
        if path.suffix not in extensions and not path.name.startswith("Dockerfile"):
            continue
        paths.append(name)
    digest = hashlib.sha256()
    for name in paths:
        digest.update(name.encode() + b"\0")
        digest.update(hashlib.sha256((ROOT / name).read_bytes()).digest())
    return digest.hexdigest(), len(paths)


def collect():
    pages = []
    for path in sorted((ROOT / "apps/web/src/routes").rglob("*.tsx")):
        source = path.read_text()
        matches = list(re.finditer(r'createFileRoute\(\s*["\']([^"\']+)["\']\s*\)', source))
        for match in matches:
            pages.append({"route": match[1], "file": relative(path), "line": line_at(source, match.start())})
        if path.name == "__root.tsx":
            pages.append({"route": "__root", "file": relative(path), "line": 1})

    apis = []
    api_files = sorted((ROOT / "apps/server/src/routes").glob("*.ts"))
    api_files += [ROOT / "apps/server/src/app.ts", ROOT / "apps/server/src/document-worker-server.ts"]
    for path in api_files:
        source = path.read_text()
        for match in re.finditer(r'\.(get|post|patch|delete|put|all|options|head)\(\s*["\'](/[^"\']*)["\']', source):
            apis.append({"method": match[1].upper(), "path": match[2], "file": relative(path), "line": line_at(source, match.start())})

    schema_path = ROOT / "packages/db/prisma/schema.prisma"
    source = schema_path.read_text()
    models = []
    relations = []
    for match in re.finditer(r'^model (\w+) \{(.*?)^\}', source, re.M | re.S):
        mapped = re.search(r'@@map\("([^"]+)"\)', match[2])
        models.append({"model": match[1], "table": mapped[1] if mapped else match[1], "file": relative(schema_path), "line": line_at(source, match.start())})
        for relation in re.finditer(r'^\s+(\w+)\s+(\w+)(\?)?\s+@relation\([^\n]*fields:\s*\[([^\]]+)\]', match[2], re.M):
            relations.append({"from": match[1], "field": relation[1], "to": relation[2], "optional": bool(relation[3]), "foreign_keys": [field.strip() for field in relation[4].split(",")]})

    status_enums = {}
    for match in re.finditer(r'^enum (\w+Status) \{(.*?)^\}', source, re.M | re.S):
        status_enums[match[1]] = [line.strip() for line in match[2].splitlines() if line.strip()]
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT, text=True).strip()
    fingerprint, source_files = source_fingerprint()
    return {"commit": commit, "branch": branch, "source_fingerprint": fingerprint, "source_files": source_files, "pages": pages, "apis": apis, "models": models, "relations": relations, "status_enums": status_enums, "private_worker_endpoints": [{"method": "GET", "path": "/health"}, {"method": "POST", "path": "/run"}]}


def render_inventory(inventory):
    lines = ["# Declared source inventory", "", f"Commit: `{inventory['commit']}`", "", "Regenerate: `python3 .scratch/system-workflow/survey.py`", "", "These are source declarations, not a live deployment or endpoint-availability check.", "", "## Pages and route layouts", "", "| Route | Source |", "| --- | --- |"]
    for item in inventory["pages"]:
        lines.append(f"| `{item['route']}` | `{item['file']}:{item['line']}` |")
    lines += ["", "## API endpoints", "", "| Method | Path | Source |", "| --- | --- | --- |"]
    for item in inventory["apis"]:
        lines.append(f"| {item['method']} | `{item['path']}` | `{item['file']}:{item['line']}` |")
    lines += ["", "## Private document worker", "", "Separate private HTTP listener in `apps/server/src/document-worker-server.ts:170`, not part of the main API count.", "", "| Method | Path |", "| --- | --- |", "| GET | `/health` |", "| POST | `/run` |"]
    lines += ["", "## Database models", "", "| Model | Table | Source |", "| --- | --- | --- |"]
    for item in inventory["models"]:
        lines.append(f"| {item['model']} | `{item['table']}` | `{item['file']}:{item['line']}` |")
    lines += ["", "## Status enums", "", "| Enum | Values |", "| --- | --- |"]
    for name, values in inventory["status_enums"].items():
        lines.append(f"| `{name}` | {', '.join(f'`{value}`' for value in values)} |")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check source freshness without writing files")
    args = parser.parse_args()
    inventory = collect()
    if args.check:
        recorded = json.loads((OUT / "inventory.json").read_text())
        changed = [key for key, value in inventory.items() if key not in {"commit", "branch"} and recorded.get(key) != value]
        if changed:
            raise SystemExit("System map needs a source review (" + ", ".join(changed) + "). Read docs/agents/system-workflow.md, review the affected flows, then run bun run docs:workflow:build.")
        if (OUT / "inventory.md").read_text() != render_inventory(recorded):
            raise SystemExit("Generated inventory.md is stale. Run bun run docs:workflow:build.")
        print(f"Workflow inventory matches {inventory['source_files']} runtime/deployment source files.")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n")
    (OUT / "inventory.md").write_text(render_inventory(inventory))
    print(json.dumps({"commit": inventory["commit"], "branch": inventory["branch"], "page_declarations": len(inventory["pages"]), "api_declarations": len(inventory["apis"]), "database_models": len(inventory["models"])}, indent=2))


if __name__ == "__main__":
    main()
