# Sidecar binaries for Tauri desktop app
#
# This directory contains the backend sidecar binary for Tauri packaging.
#
# In development mode, the sidecar is not needed — the Rust code falls back
# to running `uv run uvicorn` directly. In production builds, the PyInstaller-
# packaged backend executable must be placed here with the correct target
# triple suffix.
#
# Required naming convention:
#   binaries/backend-x86_64-pc-windows-msvc.exe  (Windows x86_64)
#   binaries/backend-aarch64-pc-windows-msvc.exe  (Windows ARM64)
#
# To create the production sidecar:
#   1. Build the backend with PyInstaller (Phase 4)
#   2. Rename the exe to include the target triple suffix
#   3. Place it in this directory