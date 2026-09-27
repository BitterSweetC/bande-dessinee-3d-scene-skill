#!/usr/bin/env python3
"""Scaffold a complete French Bande Dessinée (Cairn-style) 3D scene project from the golden template."""
import argparse
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target_dir", help="Destination project directory to scaffold")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files in target_dir")
    args = parser.parse_args()

    skill_root = Path(__file__).resolve().parents[1]
    template_dir = skill_root / "assets" / "snowline-template"
    target = Path(args.target_dir).resolve()
    target.mkdir(parents=True, exist_ok=True)

    for src_path in template_dir.rglob("*"):
        rel = src_path.relative_to(template_dir)
        dst_path = target / rel
        if src_path.is_dir():
            dst_path.mkdir(parents=True, exist_ok=True)
        else:
            if dst_path.exists() and not args.force:
                print(f"[skip] {rel} (already exists)")
                continue
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dst_path)
            print(f"[copy] {rel}")

    print(f"\nScaffolded Bande Dessinée 3D project at: {target}")


if __name__ == "__main__":
    main()
