//! High-level conversion: VTF file → PNG file, plus folder batching.

#![allow(dead_code)]

use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use crate::decode::decode_to_rgba8;
use crate::vtf::{locate_image_data_end, parse_header, VtfError};

/// Convert a single VTF file to a PNG file.
pub fn convert_file(input: &Path, output: &Path) -> Result<(), VtfError> {
    let data = fs::read(input)?;
    let header = parse_header(&data)?;
    let image_end = locate_image_data_end(&data, &header)?;

    let frame_size = header
        .frame_size_bytes()
        .ok_or_else(|| VtfError::UnsupportedFormat(header.image_format.name()))?;

    // Mipmaps are stored smallest-first; the largest mipmap occupies the last
    // `frames * frame_size` bytes of the image data section. We extract its
    // first frame.
    let frames = header.frames.max(1) as usize;
    let largest_mipmap_total = frame_size * frames;
    if image_end < largest_mipmap_total {
        return Err(VtfError::Malformed("image data section smaller than expected"));
    }
    let frame_start = image_end - largest_mipmap_total;
    let frame_data = &data[frame_start..frame_start + frame_size];

    let rgba = decode_to_rgba8(&header, frame_data)?;

    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }

    let file = fs::File::create(output)?;
    let writer = BufWriter::new(file);
    let mut encoder = png::Encoder::new(writer, header.width as u32, header.height as u32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut png_writer = encoder.write_header()?;
    png_writer.write_image_data(&rgba)?;

    Ok(())
}

/// List `.vtf` files in a folder (case-insensitive, non-recursive).
pub fn list_vtf_files(folder: &Path) -> Vec<PathBuf> {
    walkdir::WalkDir::new(folder)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .filter(|p| {
            p.extension()
                .map(|ext| ext.eq_ignore_ascii_case("vtf"))
                .unwrap_or(false)
        })
        .collect()
}

#[derive(Debug)]
pub struct BatchSummary {
    pub total: usize,
    pub succeeded: usize,
    pub failed: Vec<(PathBuf, String)>,
}

/// Convert each path in `files` to a .png in `output`.
///
/// `on_progress` is called once per file BEFORE conversion starts, with
/// (one_indexed_index, total, current_file).
pub fn convert_files<F>(files: &[PathBuf], output: &Path, mut on_progress: F) -> BatchSummary
where
    F: FnMut(usize, usize, &Path),
{
    let total = files.len();
    let mut succeeded = 0usize;
    let mut failed: Vec<(PathBuf, String)> = Vec::new();

    for (i, path) in files.iter().enumerate() {
        on_progress(i + 1, total, path);

        let stem = path.file_stem().unwrap_or_default();
        let mut output_path = output.to_path_buf();
        output_path.push(stem);
        output_path.set_extension("png");

        match convert_file(path, &output_path) {
            Ok(()) => succeeded += 1,
            Err(e) => failed.push((path.clone(), e.to_string())),
        }
    }

    BatchSummary { total, succeeded, failed }
}

/// Scan a folder and convert every `.vtf` file in it.
pub fn convert_folder<F>(input: &Path, output: &Path, on_progress: F) -> BatchSummary
where
    F: FnMut(usize, usize, &Path),
{
    let files = list_vtf_files(input);
    convert_files(&files, output, on_progress)
}
