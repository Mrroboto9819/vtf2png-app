//! VTF (Valve Texture Format) header parser.
//!
//! Implemented from the public VTF spec on the Valve Developer Community
//! wiki, not derived from any GPL source. Parses just enough of the file
//! to locate the largest mipmap; the actual pixel decoding lives elsewhere.

#![allow(dead_code)]

use thiserror::Error;

#[derive(Debug, Error)]
pub enum VtfError {
    #[error("not a VTF file (bad signature)")]
    BadSignature,
    #[error("unsupported VTF version: {0}.{1}")]
    UnsupportedVersion(u32, u32),
    #[error("unsupported image format: {0}")]
    UnsupportedFormat(String),
    #[error("malformed VTF file: {0}")]
    Malformed(&'static str),
    #[error("decode error: {0}")]
    Decode(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("png error: {0}")]
    Png(#[from] png::EncodingError),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Rgba8888,
    Abgr8888,
    Rgb888,
    Bgr888,
    Argb8888,
    Bgra8888,
    Dxt1,
    Dxt3,
    Dxt5,
    Other(i32),
}

impl ImageFormat {
    pub fn from_raw(code: i32) -> Self {
        match code {
            0 => Self::Rgba8888,
            1 => Self::Abgr8888,
            2 => Self::Rgb888,
            3 => Self::Bgr888,
            11 => Self::Argb8888,
            12 => Self::Bgra8888,
            13 => Self::Dxt1,
            14 => Self::Dxt3,
            15 => Self::Dxt5,
            other => Self::Other(other),
        }
    }

    pub fn name(&self) -> String {
        match self {
            Self::Rgba8888 => "RGBA8888".into(),
            Self::Abgr8888 => "ABGR8888".into(),
            Self::Rgb888 => "RGB888".into(),
            Self::Bgr888 => "BGR888".into(),
            Self::Argb8888 => "ARGB8888".into(),
            Self::Bgra8888 => "BGRA8888".into(),
            Self::Dxt1 => "DXT1".into(),
            Self::Dxt3 => "DXT3".into(),
            Self::Dxt5 => "DXT5".into(),
            Self::Other(raw) => format!("Unknown({})", raw),
        }
    }

    /// Bytes-per-pixel for the uncompressed formats we support.
    pub fn uncompressed_bpp(&self) -> Option<usize> {
        match self {
            Self::Rgba8888 | Self::Abgr8888 | Self::Argb8888 | Self::Bgra8888 => Some(4),
            Self::Rgb888 | Self::Bgr888 => Some(3),
            _ => None,
        }
    }

    /// Bytes per 4x4 block for DXT formats.
    pub fn dxt_block_bytes(&self) -> Option<usize> {
        match self {
            Self::Dxt1 => Some(8),
            Self::Dxt3 | Self::Dxt5 => Some(16),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct VtfHeader {
    pub version: (u32, u32),
    pub header_size: u32,
    pub width: u16,
    pub height: u16,
    pub frames: u16,
    pub mipmap_count: u8,
    pub image_format: ImageFormat,
    pub depth: u16,
    pub num_resources: u32,
}

impl VtfHeader {
    /// Byte size of one frame at the largest mipmap level.
    /// Used to slice the right window of bytes out of the image data section.
    pub fn frame_size_bytes(&self) -> Option<usize> {
        let w = self.width as usize;
        let h = self.height as usize;

        if let Some(bpp) = self.image_format.uncompressed_bpp() {
            return Some(w * h * bpp);
        }

        if let Some(block_bytes) = self.image_format.dxt_block_bytes() {
            // DXT compresses in 4x4 pixel blocks; round up.
            let blocks_x = (w + 3) / 4;
            let blocks_y = (h + 3) / 4;
            return Some(blocks_x * blocks_y * block_bytes);
        }

        None
    }
}

// --- internal byte reading helpers ---

fn read_u16(data: &[u8], offset: usize) -> Result<u16, VtfError> {
    let bytes = data
        .get(offset..offset + 2)
        .ok_or(VtfError::Malformed("header truncated"))?;
    Ok(u16::from_le_bytes(bytes.try_into().unwrap()))
}

fn read_u32(data: &[u8], offset: usize) -> Result<u32, VtfError> {
    let bytes = data
        .get(offset..offset + 4)
        .ok_or(VtfError::Malformed("header truncated"))?;
    Ok(u32::from_le_bytes(bytes.try_into().unwrap()))
}

fn read_i32(data: &[u8], offset: usize) -> Result<i32, VtfError> {
    let bytes = data
        .get(offset..offset + 4)
        .ok_or(VtfError::Malformed("header truncated"))?;
    Ok(i32::from_le_bytes(bytes.try_into().unwrap()))
}

/// Parse the VTF header out of a complete file's bytes.
pub fn parse_header(data: &[u8]) -> Result<VtfHeader, VtfError> {
    if data.len() < 64 {
        return Err(VtfError::Malformed("file too small to be a VTF"));
    }
    if &data[0..4] != b"VTF\0" {
        return Err(VtfError::BadSignature);
    }

    let version = (read_u32(data, 4)?, read_u32(data, 8)?);
    if version.0 != 7 || version.1 > 5 {
        return Err(VtfError::UnsupportedVersion(version.0, version.1));
    }

    let header_size = read_u32(data, 12)?;
    let width = read_u16(data, 16)?;
    let height = read_u16(data, 18)?;
    let frames = read_u16(data, 24)?;
    let image_format_raw = read_i32(data, 52)?;
    let mipmap_count = data[56];

    // depth was added in v7.2; default to 1 for older files.
    let depth = if version.1 >= 2 { read_u16(data, 63)? } else { 1 };

    // num_resources was added in v7.3; default to 0 for older files.
    let num_resources = if version.1 >= 3 { read_u32(data, 68)? } else { 0 };

    Ok(VtfHeader {
        version,
        header_size,
        width,
        height,
        frames,
        mipmap_count,
        image_format: ImageFormat::from_raw(image_format_raw),
        depth,
        num_resources,
    })
}

/// Returns the byte offset where the high-resolution image data ends.
///
/// Image data is laid out smallest-mipmap-first, so the largest mipmap
/// (the one we want) is the last block of bytes ending at this offset.
pub fn locate_image_data_end(data: &[u8], header: &VtfHeader) -> Result<usize, VtfError> {
    // VTF v7.2 and below: image data runs to the end of the file.
    if header.version.1 < 3 {
        return Ok(data.len());
    }

    // v7.3+: walk the resource table for tag starting with 0x30 (high-res image).
    let table_start = header.header_size as usize;
    let mut found_image = false;

    for i in 0..(header.num_resources as usize) {
        let entry = table_start + i * 8;
        if entry + 8 > data.len() {
            return Err(VtfError::Malformed("resource table truncated"));
        }
        let tag0 = data[entry];
        let flags = data[entry + 3];
        let offset = u32::from_le_bytes(data[entry + 4..entry + 8].try_into().unwrap()) as usize;

        // Flag 0x02 means the resource's data is embedded in the offset field
        // (e.g. CRC checksum), so there is no actual data chunk to skip past.
        if flags & 0x02 != 0 {
            continue;
        }

        if !found_image {
            if tag0 == 0x30 {
                found_image = true;
            }
        } else {
            // The next data resource after the image data marks where it ends.
            return Ok(offset);
        }
    }

    if found_image {
        // Image data was the last resource in the table → runs to end of file.
        Ok(data.len())
    } else {
        Err(VtfError::Malformed("no high-res image data resource"))
    }
}
