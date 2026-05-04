# VTF to PNG Converter

A native desktop app for batch-converting `.vtf` (Valve Texture Format) files to `.png`. Built with [Tauri 2](https://tauri.app/) — Rust backend, web frontend, real native window on Windows / macOS / Linux.

> **Status:** scaffold in place, VTF decoder is the next milestone.

The original CLI inspiration was [eXeC64/vtf2png](https://github.com/eXeC64/vtf2png) (GPLv2). This project does **not** vendor that code; the decoder will be a clean-room implementation written from the public VTF spec, using the MIT/Apache crates `texture2ddecoder` (DXT codec) and `png` (PNG encoder).

The previous Kivy + Docker prototype lives in [legacy/](legacy/) for reference and is no longer maintained.

---

## Prerequisites

| Platform | Required |
|---|---|
| **Windows** | [Rust](https://rustup.rs/) · [Bun](https://bun.sh/) · MSVC Build Tools (VS 2022) · WebView2 (preinstalled on Win11) |
| **macOS** | [Rust](https://rustup.rs/) · [Bun](https://bun.sh/) · Xcode Command Line Tools (`xcode-select --install`) |
| **Linux** | [Rust](https://rustup.rs/) · [Bun](https://bun.sh/) · `webkit2gtk-4.1`, `librsvg`, `libayatana-appindicator3` (see Tauri docs) |

Then install the Tauri CLI once globally:

```bash
cargo install tauri-cli --version "^2.0"
```

## Develop

```bash
bun install
cargo tauri dev
```

The first `cargo tauri dev` build is slow (Rust compiles all dependencies). Subsequent runs are fast.

## Build a release binary

```bash
cargo tauri build
```

Output lands in `src-tauri/target/release/bundle/`. Each platform produces its native installer:
- Windows → `.msi` and `.exe`
- macOS → `.dmg` and `.app`
- Linux → `.deb`, `.rpm`, AppImage

> Cross-platform bundling note: Tauri builds for the host OS only. To produce all three, build on each OS (or via CI matrix).

## Project layout

```
.
├── index.html              # Vite entry
├── package.json            # frontend deps + scripts
├── vite.config.js
├── src/                    # frontend (vanilla JS + CSS)
│   ├── main.js
│   └── style.css
├── src-tauri/              # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── icons/
│   └── src/
│       ├── main.rs
│       └── lib.rs
└── legacy/                 # old Kivy/Docker prototype (unmaintained)
```

## Icons

The bundle config currently references only `src-tauri/icons/icon.ico` (Windows). To bundle on macOS/Linux, generate the full icon set from a PNG source:

```bash
cargo tauri icon path/to/source.png
```

That populates `src-tauri/icons/` with all required formats (`icon.icns`, multiple PNGs, etc.).
