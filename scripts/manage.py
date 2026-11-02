#!/usr/bin/env python3
"""Install, validate and activate the independently named personal interface."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
LAYOUT = "herdr-personal"
MANIFEST = ".herdr-personal-managed.json"
GENERATED = {"gpui-kit.d.ts", "herdr.d.ts", "jsconfig.json", ".DS_Store"}


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".personal-tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def sources():
    files = list((ROOT / "layouts").glob("herdr-personal.*"))
    files += list((ROOT / "themes").glob("herdr-personal.json"))
    for mod in sorted((ROOT / "mods").glob("personal-*")):
        files += [p for p in mod.rglob("*") if p.is_file()
                  and p.name not in GENERATED and not any(x.startswith(".") for x in p.relative_to(mod).parts)]
    return {str(p.relative_to(ROOT)): p.read_bytes() for p in files}


def app_run(home, *args):
    env = {**os.environ, "HERDR_APP_HOME": str(home)}
    return subprocess.run(["herdr-app", *args], env=env, check=True)


def check(home):
    node = os.environ.get("NODE") or shutil.which("node")
    bundled = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
    if not node and bundled.is_file():
        node = str(bundled)
    if not node:
        raise RuntimeError("Node.js is required for the sidebar/pane checks; set NODE to its executable.")
    mods = sorted((ROOT / "mods").glob("personal-*"))
    if len(mods) != 7:
        raise RuntimeError("Expected all seven personal panels.")
    for mod in mods:
        app_run(home, "check", str(home / "mods" / mod.name))
    for script in ["mods/personal-spaces/check-sidebar.cjs", "mods/personal-pane/check-pane.cjs", "mods/personal-spaces/check-fetch.cjs"]:
        subprocess.run([node, script], cwd=home, check=True)


def install(home, args):
    if not (home / "AGENTS.md").exists():
        raise RuntimeError("Start Herdr first so the configuration home and shipped assets exist.")
    previous = read_json(home / MANIFEST, {})
    files = sources()
    for name, content in files.items():
        target = home / name
        if target.is_symlink():
            raise RuntimeError(f"Refusing to replace symlink: {target}")
        if target.exists() and target.read_bytes() != content:
            if previous.get("files", {}).get(name) != digest(target.read_bytes()):
                raise RuntimeError(f"Name collision or live edit; reconcile before installing: {target}")

    keys = read_json(home / "keys.json", {})
    incoming = read_json(ROOT / "keys.json", {})
    for section, bindings in incoming.items():
        current = keys.setdefault(section, {})
        for key, action in bindings.items():
            for scope in ("global", "terminal", section):
                existing = keys.get(scope, {}).get(key)
                old = previous.get("keys", {}).get(section, {}).get(key)
                if existing and existing != action and not (scope == section and old == existing):
                    raise RuntimeError(f"Shortcut conflict: {scope}: {key} -> {existing}")
            current[key] = action

    settings = read_json(home / "settings.json", {})
    for key, value in read_json(ROOT / "preferences/settings.json", {}).items():
        if args.apply_preferences or key not in settings:
            settings[key] = value
    writes = dict(files)
    if keys != read_json(home / "keys.json", {}):
        writes["keys.json"] = encoded(keys)
    if settings != read_json(home / "settings.json", {}):
        writes["settings.json"] = encoded(settings)
    changed = {name: data for name, data in writes.items()
               if not (home / name).exists() or (home / name).read_bytes() != data}
    print(f"{len(changed)} files to write; existing unrelated files and preferences preserved.")
    if args.dry_run:
        print("\n".join(sorted(changed)))
        return
    if changed:
        stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S-%f")
        backup = home.parent / (home.name + "-backups") / ("personal-" + stamp)
        def ignore(directory, names):
            return [n for n in names if stat.S_ISSOCK((Path(directory) / n).lstat().st_mode)]
        shutil.copytree(home, backup / "config", symlinks=True, ignore=ignore)
        print(f"Backup: {backup}")
        for name, data in changed.items():
            write_atomic(home / name, data)
    write_atomic(home / MANIFEST, encoded({"files": {n: digest(d) for n, d in files.items()}, "keys": incoming}))
    check(home)
    print("Installed and validated. Run activate to select the personal layout.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "check", "activate"])
    parser.add_argument("--home", type=Path, default=Path(os.environ.get("HERDR_APP_HOME", str(Path.home() / ".config/herdr-app"))))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply-preferences", action="store_true")
    args = parser.parse_args()
    home = args.home.expanduser().resolve()
    if args.action == "install":
        install(home, args)
    elif args.action == "check":
        check(home)
    else:
        if not (home / "layouts" / (LAYOUT + ".json")).exists():
            raise RuntimeError("Install the personal layout before activation.")
        app_run(home, "do", "layout.switch", json.dumps({"name": LAYOUT}))
        app_run(home, "status")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
