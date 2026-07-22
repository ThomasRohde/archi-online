#!/usr/bin/env python3
"""Validate Archi Online scripts/extensions and build deterministic .archi-ext files."""

from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import subprocess
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


MAX_PACKAGE_FILES = 200
MAX_PACKAGE_CONTENT_CHARS = 5_000_000
ID_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$")
MENU_LOCATIONS = {
    "extensions.menu",
    "model-tree.context",
    "view.context",
    "selection.context",
}
EVENT_NAMES = {
    "app.ready",
    "model.opened",
    "model.changed",
    "model.saved",
    "model.activated",
    "model.closed",
    "selection.changed",
    "view.opened",
    "view.activated",
    "view.contextMenu",
    "tree.contextMenu",
    "script.error",
}


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def require(self, condition: bool, message: str) -> None:
        if not condition:
            self.errors.append(message)

    def warn(self, condition: bool, message: str) -> None:
        if not condition:
            self.warnings.append(message)


@dataclass(frozen=True)
class PackageSource:
    label: str
    names: tuple[str, ...]
    read_bytes: Callable[[str], bytes]


def safe_package_path(name: str) -> bool:
    if not name or name.startswith("/") or "\\" in name:
        return False
    return all(part not in {"", ".", ".."} for part in name.split("/"))


def read_utf8(source: PackageSource, name: str, report: Report) -> str | None:
    try:
        return source.read_bytes(name).decode("utf-8")
    except UnicodeDecodeError:
        report.errors.append(f"{name} must be UTF-8 text")
    except KeyError:
        report.errors.append(f"Missing package file: {name}")
    return None


def parse_manifest(source: PackageSource, report: Report) -> dict[str, object] | None:
    text = read_utf8(source, "manifest.json", report)
    if text is None:
        return None
    try:
        value = json.loads(text)
    except json.JSONDecodeError as error:
        report.errors.append(f"Invalid manifest.json: {error}")
        return None
    if not isinstance(value, dict):
        report.errors.append("manifest.json must contain an object")
        return None
    return value


def require_non_empty_string(
    manifest: dict[str, object], key: str, report: Report
) -> str | None:
    value = manifest.get(key)
    if not isinstance(value, str) or not value.strip():
        report.errors.append(f"manifest.{key} must be a non-empty string")
        return None
    return value.strip()


def validate_namespaced_id(
    value: str, extension_id: str | None, label: str, report: Report
) -> None:
    report.require(
        bool(ID_PATTERN.fullmatch(value)),
        f"{label} contains unsupported characters",
    )
    if extension_id:
        report.require(
            value.startswith(extension_id + "."),
            f"{label} must be namespaced under {extension_id}",
        )


def validate_contributions(
    manifest: dict[str, object], extension_id: str | None, report: Report
) -> None:
    contributes = manifest.get("contributes")
    if contributes is None:
        return
    if not isinstance(contributes, dict):
        report.errors.append("manifest.contributes must be an object")
        return

    for kind in ("commands", "menus", "toolbar", "panels", "events"):
        value = contributes.get(kind, [])
        if not isinstance(value, list):
            report.errors.append(f"manifest.contributes.{kind} must be an array")

    declared_commands: set[str] = set()
    commands = contributes.get("commands", [])
    if isinstance(commands, list):
        for index, item in enumerate(commands):
            if not isinstance(item, dict):
                report.errors.append(f"commands[{index}] must be an object")
                continue
            command_id = item.get("id")
            if not isinstance(command_id, str) or not command_id:
                report.errors.append(f"commands[{index}].id must be a string")
                continue
            declared_commands.add(command_id)
            validate_namespaced_id(
                command_id, extension_id, f"commands[{index}].id", report
            )
            report.require(
                isinstance(item.get("title"), str)
                and bool(str(item.get("title")).strip()),
                f"commands[{index}].title must be a non-empty string",
            )

    for kind in ("menus", "toolbar"):
        entries = contributes.get(kind, [])
        if not isinstance(entries, list):
            continue
        for index, item in enumerate(entries):
            if not isinstance(item, dict):
                report.errors.append(f"{kind}[{index}] must be an object")
                continue
            item_id = item.get("id")
            if isinstance(item_id, str):
                validate_namespaced_id(
                    item_id, extension_id, f"{kind}[{index}].id", report
                )
            else:
                report.errors.append(f"{kind}[{index}].id must be a string")
            command = item.get("command")
            report.require(
                isinstance(command, str) and bool(command),
                f"{kind}[{index}].command must be a string",
            )
            if isinstance(command, str) and declared_commands:
                report.require(
                    command in declared_commands,
                    f"{kind}[{index}] references undeclared command {command}",
                )
            if kind == "menus":
                report.require(
                    item.get("location") in MENU_LOCATIONS,
                    f"menus[{index}].location is unsupported",
                )

    panels = contributes.get("panels", [])
    if isinstance(panels, list):
        for index, item in enumerate(panels):
            if not isinstance(item, dict):
                report.errors.append(f"panels[{index}] must be an object")
                continue
            panel_id = item.get("id")
            if isinstance(panel_id, str):
                validate_namespaced_id(
                    panel_id, extension_id, f"panels[{index}].id", report
                )
            else:
                report.errors.append(f"panels[{index}].id must be a string")

    events = contributes.get("events", [])
    if isinstance(events, list):
        for index, item in enumerate(events):
            name = item.get("name") if isinstance(item, dict) else None
            report.require(
                name in EVENT_NAMES,
                f"events[{index}].name is unsupported",
            )


def node_syntax_check(source: str, label: str, report: Report) -> None:
    node = shutil.which("node")
    if not node:
        report.warnings.append(
            f"Skipped JavaScript syntax check for {label}: Node.js not found"
        )
        return
    program = (
        "const fs=require('fs');"
        "new Function('\"use strict\";\\n'+fs.readFileSync(0,'utf8'));"
    )
    completed = subprocess.run(
        [node, "-e", program],
        input=source,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip().splitlines()
        summary = next(
            (
                line.strip()
                for line in detail
                if line.strip().startswith(("SyntaxError:", "TypeError:", "Error:"))
            ),
            detail[-1] if detail else "parse failed",
        )
        report.errors.append(
            f"JavaScript syntax error in {label}: "
            f"{summary}"
        )


def literal_calls(source: str, call: str) -> set[str]:
    pattern = re.compile(
        re.escape(call) + r"\s*\(\s*(['\"])([^'\"]+)\1"
    )
    return {match.group(2) for match in pattern.finditer(source)}


def validate_runtime(
    source_text: str,
    manifest: dict[str, object],
    extension_id: str | None,
    report: Report,
) -> None:
    node_syntax_check(source_text, "main file", report)
    report.warn(
        "app.extension" in source_text,
        "main file does not declare app.extension(...) metadata",
    )
    if extension_id:
        report.warn(
            extension_id in source_text,
            f"main file does not contain manifest id {extension_id}",
        )
    unsafe_html = re.search(
        r"\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(",
        source_text,
    )
    report.warn(
        unsafe_html is None,
        "main file uses an unsafe HTML insertion API; use DOM nodes and textContent for external strings",
    )

    contributes = manifest.get("contributes")
    if not isinstance(contributes, dict):
        return
    runtime_by_kind = {
        "commands": literal_calls(source_text, "app.commands.register"),
        "panels": literal_calls(source_text, "app.panels.register"),
    }
    for kind, runtime_ids in runtime_by_kind.items():
        entries = contributes.get(kind, [])
        if not isinstance(entries, list) or not runtime_ids:
            continue
        declared = {
            item["id"]
            for item in entries
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        missing = sorted(declared - runtime_ids)
        if missing:
            report.warnings.append(
                f"Could not find literal runtime registration for declared {kind}: "
                + ", ".join(missing)
            )


def stored_character_count(source: PackageSource, report: Report) -> int:
    total = 0
    for name in source.names:
        data = source.read_bytes(name)
        try:
            total += len(data.decode("utf-8"))
        except UnicodeDecodeError:
            total += len(base64.b64encode(data).decode("ascii"))
    report.require(
        total <= MAX_PACKAGE_CONTENT_CHARS,
        f"Package stores {total} characters; maximum is "
        f"{MAX_PACKAGE_CONTENT_CHARS}",
    )
    return total


def validate_package(source: PackageSource) -> Report:
    report = Report()
    report.require(
        len(source.names) <= MAX_PACKAGE_FILES,
        f"Package has {len(source.names)} files; maximum is {MAX_PACKAGE_FILES}",
    )
    for name in source.names:
        report.require(safe_package_path(name), f"Unsafe package path: {name}")
    if report.errors:
        return report
    stored_character_count(source, report)
    report.require(
        "manifest.json" in source.names,
        "Package is missing manifest.json",
    )
    if "manifest.json" not in source.names:
        return report

    manifest = parse_manifest(source, report)
    if manifest is None:
        return report
    report.require(
        manifest.get("schemaVersion") == 2,
        "manifest.schemaVersion must be 2",
    )
    extension_id = require_non_empty_string(manifest, "id", report)
    require_non_empty_string(manifest, "name", report)
    require_non_empty_string(manifest, "version", report)
    main = require_non_empty_string(manifest, "main", report)
    if extension_id:
        report.require(
            bool(ID_PATTERN.fullmatch(extension_id)),
            "manifest.id contains unsupported characters",
        )
    if main:
        report.require(
            safe_package_path(main),
            f"Unsafe manifest.main path: {main}",
        )
        report.require(
            main in source.names,
            f"Package is missing main file: {main}",
        )
    validate_contributions(manifest, extension_id, report)
    if main and main in source.names:
        source_text = read_utf8(source, main, report)
        if source_text is not None:
            validate_runtime(source_text, manifest, extension_id, report)
    return report


def directory_source(path: Path, excluded: Path | None = None) -> PackageSource:
    root = path.resolve()
    excluded_resolved = excluded.resolve() if excluded else None
    files = sorted(
        file
        for file in root.rglob("*")
        if file.is_file()
        and (excluded_resolved is None or file.resolve() != excluded_resolved)
    )
    names = tuple(file.relative_to(root).as_posix() for file in files)
    mapping = dict(zip(names, files, strict=True))
    return PackageSource(
        str(root),
        names,
        lambda name: mapping[name].read_bytes(),
    )


def archive_source(path: Path) -> PackageSource:
    with zipfile.ZipFile(path) as archive:
        infos = [info for info in archive.infolist() if not info.is_dir()]
        names = tuple(info.filename for info in infos)
        if len(names) != len(set(names)):
            raise ValueError("Archive contains duplicate paths")
        contents = {name: archive.read(name) for name in names}
    return PackageSource(str(path), names, lambda name: contents[name])


def validate_script(path: Path) -> Report:
    report = Report()
    try:
        source = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        report.errors.append("Script must be UTF-8 text")
        return report
    report.require(bool(source.strip()), "Script is empty")
    if source.strip():
        node_syntax_check(source, path.name, report)
    report.warn(
        "require(" not in source,
        "Script uses require(), which is not part of the Archi Online runtime",
    )
    return report


def check_path(path: Path) -> Report:
    if path.is_dir():
        return validate_package(directory_source(path))
    if path.suffix.lower() == ".ajs":
        return validate_script(path)
    if path.suffix.lower() in {".archi-ext", ".zip"}:
        return validate_package(archive_source(path))
    report = Report()
    report.errors.append(
        "Expected an .ajs file, extension directory, .archi-ext file, or .zip file"
    )
    return report


def print_report(report: Report) -> int:
    for warning in report.warnings:
        print(f"WARNING: {warning}")
    for error in report.errors:
        print(f"ERROR: {error}")
    if report.errors:
        print(
            f"FAILED: {len(report.errors)} error(s), "
            f"{len(report.warnings)} warning(s)"
        )
        return 1
    print(f"OK: {len(report.warnings)} warning(s)")
    return 0


def build_archive(source_path: Path, output_path: Path, force: bool) -> int:
    if not source_path.is_dir():
        print(f"ERROR: Extension source is not a directory: {source_path}")
        return 1
    if output_path.exists() and not force:
        print(f"ERROR: Output exists; pass --force to replace it: {output_path}")
        return 1

    source = directory_source(source_path, output_path)
    status = print_report(validate_package(source))
    if status:
        return status

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(
        output_path, "w", compression=zipfile.ZIP_DEFLATED
    ) as archive:
        for name in source.names:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes(name))
    print(f"BUILT: {output_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_parser = subparsers.add_parser("check", help="Validate an artifact")
    check_parser.add_argument("path", type=Path)

    build_parser = subparsers.add_parser(
        "build", help="Validate and build an .archi-ext archive"
    )
    build_parser.add_argument("source", type=Path)
    build_parser.add_argument("--output", "-o", type=Path, required=True)
    build_parser.add_argument("--force", action="store_true")

    args = parser.parse_args()
    if args.command == "check":
        if not args.path.exists():
            print(f"ERROR: Path does not exist: {args.path}")
            return 1
        try:
            return print_report(check_path(args.path))
        except (OSError, ValueError, zipfile.BadZipFile) as error:
            print(f"ERROR: {error}")
            return 1
    return build_archive(args.source, args.output, args.force)


if __name__ == "__main__":
    sys.exit(main())
