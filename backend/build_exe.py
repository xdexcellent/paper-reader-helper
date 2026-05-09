#!/usr/bin/env python3
"""Build helper for paper-reader-backend PyInstaller bundle.

This script:
1. Builds the frontend (if frontend/dist/index.html doesn't exist)
2. Runs PyInstaller with the spec file
3. Copies frontend/dist/ into the output directory for production serving

Usage:
    python backend/build_exe.py [--skip-frontend] [--noconfirm]

Options:
    --skip-frontend   Skip frontend build step (use existing dist/)
    --noconfirm       Pass --noconfirm to PyInstaller (overwrite existing build)
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
SPEC_FILE = BACKEND_DIR / "paper-reader-backend.spec"


def check_frontend_dist() -> bool:
    """Check if frontend/dist/index.html exists."""
    return (FRONTEND_DIR / "dist" / "index.html").is_file()


def build_frontend() -> None:
    """Build the frontend using npm."""
    print("=== Building frontend ===")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    result = subprocess.run(
        [npm_cmd, "run", "build"],
        cwd=str(FRONTEND_DIR),
        check=True,
    )
    if result.returncode != 0:
        print(f"ERROR: Frontend build failed with exit code {result.returncode}")
        sys.exit(1)
    print("Frontend build complete.")


def run_pyinstaller(noconfirm: bool = False) -> None:
    """Run PyInstaller with the spec file."""
    print("=== Running PyInstaller ===")
    cmd = [sys.executable, "-m", "PyInstaller", str(SPEC_FILE)]
    if noconfirm:
        cmd.append("--noconfirm")
    # Run from backend directory so relative paths in spec resolve correctly
    result = subprocess.run(cmd, cwd=str(BACKEND_DIR))
    if result.returncode != 0:
        print(f"ERROR: PyInstaller failed with exit code {result.returncode}")
        sys.exit(1)
    print("PyInstaller build complete.")


def copy_frontend_dist() -> None:
    """Copy frontend/dist/ into the PyInstaller output directory.

    The output directory will be backend/dist/paper-reader-backend/ (onedir mode).
    In desktop mode, the backend will serve these static files via SPA fallback.
    """
    dist_dir = BACKEND_DIR / "dist" / "paper-reader-backend"
    if not dist_dir.is_dir():
        print(f"WARNING: PyInstaller output directory not found: {dist_dir}")
        print("Skipping frontend dist copy.")
        return

    target_dir = dist_dir / "frontend" / "dist"
    source_dir = FRONTEND_DIR / "dist"

    if not source_dir.is_dir():
        print(f"WARNING: Frontend dist not found at {source_dir}")
        print("Skipping frontend dist copy.")
        return

    print(f"=== Copying frontend dist to {target_dir} ===")
    if target_dir.exists():
        shutil.rmtree(target_dir)
    shutil.copytree(source_dir, target_dir)
    print("Frontend dist copied.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build paper-reader-backend for desktop packaging"
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip frontend build step (use existing dist/)",
    )
    parser.add_argument(
        "--noconfirm",
        action="store_true",
        help="Pass --noconfirm to PyInstaller (overwrite existing build)",
    )
    args = parser.parse_args()

    # Step 1: Build frontend (if needed)
    if not args.skip_frontend:
        if check_frontend_dist():
            print("Frontend dist already exists. Use --skip-frontend to skip rebuild.")
        else:
            build_frontend()
    elif not check_frontend_dist():
        print("ERROR: --skip-frontend specified but frontend/dist/index.html not found.")
        print("Run 'npm run build' in the frontend directory first.")
        sys.exit(1)

    # Step 2: Run PyInstaller
    run_pyinstaller(noconfirm=args.noconfirm)

    # Step 3: Copy frontend dist into output
    copy_frontend_dist()

    print("\n=== Build complete! ===")
    print(f"Output directory: {BACKEND_DIR / 'dist' / 'paper-reader-backend'}")
    print("\nTo test the built exe:")
    print(f"  cd {BACKEND_DIR / 'dist' / 'paper-reader-backend'}")
    print("  set DESKTOP_MODE=true")
    print("  set STATIC_DIR=frontend/dist")
    print("  .\\paper-reader-backend.exe")
    print("\nOr run with uvicorn:")
    print("  uvicorn app.main:app --host 0.0.0.0 --port 8000")


if __name__ == "__main__":
    main()