# VTF to PNG Converter

A native desktop app for batch-converting `.vtf` (Valve Texture Format) files to PNG.
Built with [Tauri 2](https://tauri.app/) — pure-Rust decoder, web-based UI, real native window on Windows, macOS, and Linux.

## Features

- **Native desktop app** — no browser tab, no Docker, no Python runtime. A single ~10 MB binary per platform.
- **Pure-Rust VTF decoder** for the most common image formats:
  - Uncompressed: `RGBA8888`, `ARGB8888`, `ABGR8888`, `BGRA8888`, `RGB888`, `BGR888`
  - DXT compression: `DXT1`, `DXT3`, `DXT5`
- **Batch conversion** — point at an input folder, get a folder of PNGs.
- **Live progress** — per-file status streamed from Rust to the UI as `convert-progress` events, rendered as a 2-pixel progress bar.
- **Background work** — conversion runs on a worker thread (`spawn_blocking`) so the UI stays responsive.
- **Cross-platform** — same Rust + JS source builds a native window on Windows / macOS / Linux. WebView2 on Windows, WebKit on macOS, WebKitGTK on Linux.
- **Fully offline** after install — no telemetry, no cloud, no calls home.
- **Geist / Vercel-inspired UI** — shadow-as-border cards, Geist Sans + Geist Mono, monochrome chrome.

## Acknowledgments

Honorific mention and warm thanks to **[@eXeC64](https://github.com/eXeC64)** for the original [`vtf2png`](https://github.com/eXeC64/vtf2png) command-line tool in C. That work is the reason this project exists — the original C program demonstrated the format parsing and DXT decoding flow, and pointed at the documentation that made this Rust reimplementation tractable.

A few honest notes about the relationship between the projects, since licensing matters:

- The original [`vtf2png`](https://github.com/eXeC64/vtf2png) is licensed **GPLv2**.
- This project is an **independent clean-room reimplementation** in Rust, written from the public VTF format documentation on the [Valve Developer Community wiki](https://developer.valvesoftware.com/wiki/Valve_Texture_Format) — the C source was **not** translated, copied, or vendored.
- DXT block decoding is delegated to the [`texture2ddecoder`](https://crates.io/crates/texture2ddecoder) crate (MIT/Apache-2.0). PNG encoding uses the [`png`](https://crates.io/crates/png) crate (MIT/Apache-2.0).

If you want the original CLI tool, get it from the upstream repository — it's still the canonical reference implementation.

---

## Prerequisites

| Platform | Required |
|---|---|
| **Windows** | [Rust](https://rustup.rs/) · [Bun](https://bun.sh/) · MSVC Build Tools (VS 2022, "Desktop development with C++") · WebView2 (preinstalled on Win11) |
| **macOS** | [Rust](https://rustup.rs/) · [Bun](https://bun.sh/) · Xcode Command Line Tools (`xcode-select --install`) |
| **Linux** | [Rust](https://rustup.rs/) · [Bun](https://bun.sh/) · `webkit2gtk-4.1`, `librsvg`, `libayatana-appindicator3` (see [Tauri prerequisites](https://tauri.app/start/prerequisites/#linux)) |

Then install the Tauri CLI once:

```bash
cargo install tauri-cli --version "^2.0"
```

## Develop

```bash
bun install
cargo tauri dev
```

The first `cargo tauri dev` build takes ~2–4 minutes (Rust compiles all dependencies from scratch). Subsequent runs reuse the build cache and start in seconds with hot-reload for the frontend.

## Build a release binary

```bash
cargo tauri build
```

Output lands in `src-tauri/target/release/bundle/`. Each platform produces its native installer:

- Windows → `.msi` and `.exe`
- macOS → `.dmg` and `.app`
- Linux → `.deb`, `.rpm`, AppImage

> Tauri builds for the host OS only — to produce all three artifacts, build on each OS (or use a CI matrix).

## How it works

1. **Frontend** ([src/main.js](src/main.js)) — folder pickers via `@tauri-apps/plugin-dialog`, calls `count_vtf_files` and `convert_batch` Tauri commands.
2. **`convert_batch` command** ([src-tauri/src/lib.rs](src-tauri/src/lib.rs)) — moves the work to `tauri::async_runtime::spawn_blocking` so the UI thread stays responsive; emits a `convert-progress` event before each file.
3. **`convert.rs`** ([src-tauri/src/convert.rs](src-tauri/src/convert.rs)) — `convert_file` reads → parses → decodes → writes PNG; `convert_folder` walks the directory and aggregates a `BatchSummary`.
4. **`vtf.rs`** ([src-tauri/src/vtf.rs](src-tauri/src/vtf.rs)) — header parsing (manual byte slicing, `u32::from_le_bytes`) and resource-table walking for v7.3+ image-data location.
5. **`decode.rs`** ([src-tauri/src/decode.rs](src-tauri/src/decode.rs)) — channel-order remap for the uncompressed formats, `texture2ddecoder::decode_bcN` for DXT, then unpack `(A << 24 | R << 16 | G << 8 | B)` u32 buffers into RGBA8 bytes.

## Project layout

```
.
├── index.html              # Vite entry, mounts React into #root
├── package.json            # frontend deps + scripts (React + Vite + GSAP)
├── vite.config.js
├── src/                    # frontend (React 18 + CSS)
│   ├── main.jsx            # React bootstrap
│   ├── App.jsx             # main wizard component (state, GSAP, Tauri)
│   ├── components/
│   │   ├── StepIndicator.jsx
│   │   └── FileItem.jsx
│   └── style.css
├── src-tauri/              # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── icons/
│   └── src/
│       ├── main.rs
│       ├── lib.rs          # Tauri commands
│       ├── vtf.rs          # header parser
│       ├── decode.rs       # pixel decoder
│       └── convert.rs      # file → PNG, folder batch
└── DESIGN.md               # Vercel/Geist design-system reference
```

## Icons

The bundle config currently references only `src-tauri/icons/icon.ico` (Windows). To bundle on macOS/Linux, generate the full icon set from a PNG source:

```bash
cargo tauri icon path/to/source.png
```

That populates `src-tauri/icons/` with all required formats (`icon.icns`, multiple PNGs, etc.).

## Roadmap

Likely additions, roughly in priority order:

- **More VTF image formats**: `RGB565`, `A8`, `I8`, `IA88`, `BGRX8888`, `BGRA4444`, `BGRA5551` (most are simple bit-unpacking and could be added in a single round).
- **Self-hosted Geist fonts** so the app renders identically when offline (currently fetched from Google Fonts on first load).
- **Drag-and-drop folder onto the window** as an alternative to the file picker.
- **Retain last-used folders** between launches.
- **Subfolder recursion toggle** (current scan is non-recursive).
- **Parallel batch conversion** via [`rayon`](https://crates.io/crates/rayon) for multi-core throughput on large folders.
- **Generate proper macOS/Linux icon assets** from a single source PNG.

## License

[MIT](LICENSE) — free to use, modify, and redistribute, including for commercial purposes. The only requirement is that the copyright notice in [`LICENSE`](LICENSE) stays included in copies/substantial portions.

The original [eXeC64/vtf2png](https://github.com/eXeC64/vtf2png) is GPLv2. **No GPL code is included in this repository** — the Rust decoder is a clean-room reimplementation from the public VTF format spec. eXeC64 is credited prominently in [`LICENSE`](LICENSE) and in the [Acknowledgments](#acknowledgments) section above as the project that made this one possible.
