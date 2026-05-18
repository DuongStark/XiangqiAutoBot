"""Tai Pikafish binary va NNUE vao thu muc engine/.

Chay 1 lan sau khi clone repo:
    python download_engine.py
"""
import json
import shutil
import sys
import urllib.request
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent / "engine"
RELEASE_API = "https://api.github.com/repos/official-pikafish/Pikafish/releases/latest"

CPU_BUILD = "pikafish-bmi2.exe"


def fetch(url: str, dest: Path):
    print(f"  -> {url}")
    with urllib.request.urlopen(url) as r, dest.open("wb") as f:
        shutil.copyfileobj(r, f)
    print(f"     saved {dest.name} ({dest.stat().st_size / 1024 / 1024:.1f} MB)")


def main():
    ENGINE_DIR.mkdir(exist_ok=True)
    print(f"[engine] target dir: {ENGINE_DIR}")

    print("[engine] fetching latest release info...")
    with urllib.request.urlopen(RELEASE_API) as r:
        rel = json.load(r)
    print(f"[engine] release: {rel['tag_name']}")

    asset = next((a for a in rel["assets"] if a["name"].endswith(".7z")), None)
    if not asset:
        print("ERROR: no .7z asset in release")
        sys.exit(1)

    archive = ENGINE_DIR / asset["name"]
    fetch(asset["browser_download_url"], archive)

    try:
        import py7zr
    except ImportError:
        print("[engine] installing py7zr...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "py7zr"])
        import py7zr

    print(f"[engine] extracting {archive.name}...")
    with py7zr.SevenZipFile(archive, "r") as z:
        z.extractall(ENGINE_DIR)

    src = ENGINE_DIR / "Windows" / CPU_BUILD
    if not src.exists():
        print(f"ERROR: {src} not found. Available builds:")
        for p in (ENGINE_DIR / "Windows").glob("*.exe"):
            print(f"  - {p.name}")
        sys.exit(1)

    shutil.copy(src, ENGINE_DIR / "pikafish.exe")
    print(f"[engine] copied {CPU_BUILD} -> pikafish.exe")

    for sub in ("Windows", "Linux", "MacOS", "Android", "Wiki"):
        d = ENGINE_DIR / sub
        if d.exists():
            shutil.rmtree(d)
    for f in ENGINE_DIR.iterdir():
        if f.suffix in {".7z", ".md", ".txt"} or f.name == "AUTHORS":
            f.unlink()

    print("[engine] done. Files:")
    for p in sorted(ENGINE_DIR.iterdir()):
        print(f"  {p.name}  ({p.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
