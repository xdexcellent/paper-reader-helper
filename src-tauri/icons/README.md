# Tauri Application Icons

This directory contains application icons for the Tauri desktop app.

## Generating Icons

To generate all required icon sizes from a source image (at least 1024×1024px, square):

```bash
# From the project root directory
npx tauri icon <path-to-source-image>
```

Or manually place the following files:
- `32x32.png` — 32×32 Taskbar icon
- `128x128.png` — 128×128 App icon
- `128x128@2x.png` — 256×256 High-DPI app icon
- `icon.icns` — macOS icon bundle
- `icon.ico` — Windows icon (multi-size)

Until icons are generated, Tauri will use its default window icon.

## Required Icon Sizes

| File | Size | Usage |
|------|------|-------|
| `32x32.png` | 32×32 | Taskbar / small icon |
| `128x128.png` | 128×128 | Standard app icon |
| `128x128@2x.png` | 256×256 | High-DPI icon |
| `icon.icns` | Multi | macOS icon bundle |
| `icon.ico` | Multi | Windows icon |