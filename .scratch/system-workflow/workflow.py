#!/usr/bin/env python3
"""Build or check the offline workflow guide and its reproducible sharing ZIP."""

import argparse
import hashlib
import io
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[1]
ARCHIVE = DIRECTORY / "folio-forms-system-map.zip"
MERMAID_VERSION = "11.12.0"


def run(*command):
    subprocess.run(command, cwd=ROOT, check=True)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rendered_manifest():
    diagrams = json.loads((DIRECTORY / "diagrams.json").read_text())
    entries = []
    for index, diagram in enumerate(diagrams, 1):
        svg = DIRECTORY / "rendered" / f"system-map-{index}.svg"
        if ET.parse(svg).getroot().tag != "{http://www.w3.org/2000/svg}svg":
            raise ValueError(f"Invalid diagram SVG: {svg.name}")
        entries.append({
            "id": diagram["id"],
            "source_sha256": sha256(DIRECTORY / diagram["file"]),
            "svg_sha256": sha256(svg),
        })
    return {"mermaid_cli": MERMAID_VERSION, "diagrams": entries}


def sharing_files():
    for path in sorted(DIRECTORY.rglob("*")):
        relative = path.relative_to(DIRECTORY)
        if not path.is_file() or path == ARCHIVE or "__pycache__" in relative.parts:
            continue
        if path.suffix in {".md", ".mmd", ".mjs", ".py", ".json", ".html", ".svg", ".png"}:
            yield "folio-forms-system-map/" + relative.as_posix(), path


def archive_bytes():
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, path in sharing_files():
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compresslevel=9)
    return output.getvalue()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def check():
    run(sys.executable, str(DIRECTORY / "survey.py"), "--check")
    manifest = json.loads((DIRECTORY / "rendered" / "manifest.json").read_text())
    if rendered_manifest() != manifest:
        raise ValueError("Diagram source or SVGs changed. Run bun run docs:workflow:build.")
    run("bun", str(DIRECTORY / "build.mjs"), "--check")
    verification = json.loads((DIRECTORY / "verification.json").read_text())
    if verification["html_sha256"] != sha256(DIRECTORY / "system-map.html"):
        raise ValueError("Workflow verification report is stale.")
    expected_files = dict(sharing_files())
    with zipfile.ZipFile(ARCHIVE) as archive:
        if sorted(archive.namelist()) != sorted(expected_files):
            raise ValueError("Sharing ZIP file list is stale. Run bun run docs:workflow:build.")
        for name, path in expected_files.items():
            if archive.read(name) != path.read_bytes():
                raise ValueError(f"Sharing ZIP has stale {name}. Run bun run docs:workflow:build.")
    print(f"Workflow guide, {len(manifest['diagrams'])} rendered diagrams, and sharing ZIP are current.")


def build():
    run(sys.executable, str(DIRECTORY / "survey.py"))
    run("bun", str(DIRECTORY / "build.mjs"))
    run("bunx", "--bun", f"@mermaid-js/mermaid-cli@{MERMAID_VERSION}",
        "-i", str(DIRECTORY / "system-map.md"),
        "-o", str(DIRECTORY / "rendered" / "system-map.md"),
        "-e", "svg", "-c", str(DIRECTORY / "mermaid-config.json"), "-w", "1800")
    run("bun", str(DIRECTORY / "build.mjs"))
    manifest = rendered_manifest()
    write_json(DIRECTORY / "rendered" / "manifest.json", manifest)
    inventory = json.loads((DIRECTORY / "inventory.json").read_text())
    write_json(DIRECTORY / "verification.json", {
        "source_commit": inventory["commit"],
        "source_fingerprint": inventory["source_fingerprint"],
        "diagram_count": len(manifest["diagrams"]),
        "web_route_declarations": len(inventory["pages"]),
        "api_route_declarations": len(inventory["apis"]),
        "prisma_models": len(inventory["models"]),
        "status_groups": len(inventory["status_enums"]),
        "status_values": sum(map(len, inventory["status_enums"].values())),
        "svg_xml_parse": "passed",
        "html_sha256": sha256(DIRECTORY / "system-map.html"),
        "scope": "Source inventory, diagram rendering, and generated artifacts. Inspect changed diagrams in a browser separately; no live login, PDMS, OmniRoute, or data mutation was tested by this command.",
    })
    ARCHIVE.write_bytes(archive_bytes())
    check()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("build", "check", "package"))
    args = parser.parse_args()
    try:
        if args.action == "build":
            build()
        elif args.action == "check":
            check()
        else:
            ARCHIVE.write_bytes(archive_bytes())
            print(f"Packaged {ARCHIVE.relative_to(ROOT)}")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"Workflow guide check failed: {error}") from error


if __name__ == "__main__":
    main()
