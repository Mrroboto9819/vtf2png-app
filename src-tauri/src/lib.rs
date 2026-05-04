mod convert;
mod decode;
mod vtf;

use std::path::PathBuf;

use base64::Engine;
use serde::Serialize;
use tauri::{Emitter, Window};

#[derive(Serialize)]
struct AppInfo {
    name: &'static str,
    version: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME"),
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[derive(Serialize)]
struct PreviewData {
    /// data:image/png;base64,... — drop straight into an <img src="...">
    data_url: String,
    /// Original (full-resolution) dimensions, not the thumbnail's.
    width: u32,
    height: u32,
    format: String,
    file_size: u64,
}

#[tauri::command]
async fn preview_vtf(path: String) -> Result<PreviewData, String> {
    let path_buf = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || generate_preview(&path_buf))
        .await
        .map_err(|e| format!("worker thread crashed: {}", e))?
}

fn generate_preview(path: &std::path::Path) -> Result<PreviewData, String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let header = vtf::parse_header(&data).map_err(|e| e.to_string())?;
    let image_end = vtf::locate_image_data_end(&data, &header).map_err(|e| e.to_string())?;

    let frame_size = header
        .frame_size_bytes()
        .ok_or_else(|| format!("unsupported format: {}", header.image_format.name()))?;
    let frames = header.frames.max(1) as usize;
    let largest_mipmap_total = frame_size * frames;
    if image_end < largest_mipmap_total {
        return Err("image data section smaller than expected".into());
    }
    let frame_start = image_end - largest_mipmap_total;
    let frame_data = &data[frame_start..frame_start + frame_size];

    let rgba = decode::decode_to_rgba8(&header, frame_data).map_err(|e| e.to_string())?;
    let (thumb_w, thumb_h, thumb_rgba) =
        downsample_box(header.width as u32, header.height as u32, &rgba, 256);

    let mut png_bytes: Vec<u8> = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_bytes, thumb_w, thumb_h);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer
            .write_image_data(&thumb_rgba)
            .map_err(|e| e.to_string())?;
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
    let data_url = format!("data:image/png;base64,{}", b64);

    Ok(PreviewData {
        data_url,
        width: header.width as u32,
        height: header.height as u32,
        format: header.image_format.name(),
        file_size: data.len() as u64,
    })
}

/// Downsample an RGBA8 image to fit within `max_dim` on its longest side using
/// a simple box filter (averages the source pixels covered by each output pixel).
/// Returns (new_width, new_height, new_rgba). If already small enough, copies as-is.
fn downsample_box(width: u32, height: u32, rgba: &[u8], max_dim: u32) -> (u32, u32, Vec<u8>) {
    if width <= max_dim && height <= max_dim {
        return (width, height, rgba.to_vec());
    }

    let scale = max_dim as f32 / width.max(height) as f32;
    let new_w = ((width as f32 * scale).round() as u32).max(1);
    let new_h = ((height as f32 * scale).round() as u32).max(1);

    let mut out: Vec<u8> = Vec::with_capacity((new_w * new_h * 4) as usize);

    for ny in 0..new_h {
        let sy_start = (ny * height / new_h) as usize;
        let sy_end = (((ny + 1) * height / new_h).min(height)) as usize;
        for nx in 0..new_w {
            let sx_start = (nx * width / new_w) as usize;
            let sx_end = (((nx + 1) * width / new_w).min(width)) as usize;

            let mut r = 0u32;
            let mut g = 0u32;
            let mut b = 0u32;
            let mut a = 0u32;
            let mut count = 0u32;

            for sy in sy_start..sy_end {
                for sx in sx_start..sx_end {
                    let idx = (sy * width as usize + sx) * 4;
                    r += rgba[idx] as u32;
                    g += rgba[idx + 1] as u32;
                    b += rgba[idx + 2] as u32;
                    a += rgba[idx + 3] as u32;
                    count += 1;
                }
            }

            if count > 0 {
                out.extend_from_slice(&[
                    (r / count) as u8,
                    (g / count) as u8,
                    (b / count) as u8,
                    (a / count) as u8,
                ]);
            } else {
                out.extend_from_slice(&[0, 0, 0, 0]);
            }
        }
    }

    (new_w, new_h, out)
}

#[derive(Serialize, Clone)]
struct ProgressEvent {
    current: usize,
    total: usize,
    file: String,
}

#[derive(Serialize)]
struct ConvertResult {
    total: usize,
    succeeded: usize,
    failed: Vec<FailedFile>,
}

#[derive(Serialize)]
struct FailedFile {
    file: String,
    error: String,
}

#[tauri::command]
async fn convert_files(
    window: Window,
    files: Vec<String>,
    output: String,
) -> Result<ConvertResult, String> {
    let paths: Vec<PathBuf> = files.into_iter().map(PathBuf::from).collect();
    let output_path = PathBuf::from(output);

    let summary = tauri::async_runtime::spawn_blocking(move || {
        convert::convert_files(&paths, &output_path, move |current, total, file| {
            let _ = window.emit(
                "convert-progress",
                ProgressEvent {
                    current,
                    total,
                    file: file.display().to_string(),
                },
            );
        })
    })
    .await
    .map_err(|e| format!("worker thread crashed: {}", e))?;

    Ok(ConvertResult {
        total: summary.total,
        succeeded: summary.succeeded,
        failed: summary
            .failed
            .into_iter()
            .map(|(path, error)| FailedFile {
                file: path.display().to_string(),
                error,
            })
            .collect(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            preview_vtf,
            convert_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
