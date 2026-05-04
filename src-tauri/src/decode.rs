//! Decode raw VTF pixel bytes into an RGBA8 buffer.
//!
//! Output is row-major RGBA, 4 bytes per pixel — exactly what the `png`
//! crate expects to receive.

#![allow(dead_code)]

use crate::vtf::{ImageFormat, VtfError, VtfHeader};

/// Decode the bytes of one frame at the largest mipmap into RGBA8.
pub fn decode_to_rgba8(header: &VtfHeader, frame_data: &[u8]) -> Result<Vec<u8>, VtfError> {
    match header.image_format {
        ImageFormat::Rgba8888
        | ImageFormat::Abgr8888
        | ImageFormat::Argb8888
        | ImageFormat::Bgra8888
        | ImageFormat::Rgb888
        | ImageFormat::Bgr888 => decode_uncompressed(header, frame_data),
        ImageFormat::Dxt1 | ImageFormat::Dxt3 | ImageFormat::Dxt5 => decode_dxt(header, frame_data),
        other => Err(VtfError::UnsupportedFormat(other.name())),
    }
}

fn decode_uncompressed(header: &VtfHeader, data: &[u8]) -> Result<Vec<u8>, VtfError> {
    let width = header.width as usize;
    let height = header.height as usize;
    let pixel_count = width * height;
    let bpp = header
        .image_format
        .uncompressed_bpp()
        .ok_or(VtfError::Malformed("not an uncompressed format"))?;

    if data.len() < pixel_count * bpp {
        return Err(VtfError::Malformed("frame data smaller than expected"));
    }

    let mut out = Vec::with_capacity(pixel_count * 4);

    for i in 0..pixel_count {
        let chunk = &data[i * bpp..i * bpp + bpp];
        // Map each source format's channel order into canonical R,G,B,A.
        let (r, g, b, a) = match header.image_format {
            ImageFormat::Rgba8888 => (chunk[0], chunk[1], chunk[2], chunk[3]),
            ImageFormat::Argb8888 => (chunk[1], chunk[2], chunk[3], chunk[0]),
            ImageFormat::Abgr8888 => (chunk[3], chunk[2], chunk[1], chunk[0]),
            ImageFormat::Bgra8888 => (chunk[2], chunk[1], chunk[0], chunk[3]),
            ImageFormat::Rgb888 => (chunk[0], chunk[1], chunk[2], 255),
            ImageFormat::Bgr888 => (chunk[2], chunk[1], chunk[0], 255),
            _ => unreachable!("filtered above"),
        };
        out.extend_from_slice(&[r, g, b, a]);
    }

    Ok(out)
}

fn decode_dxt(header: &VtfHeader, data: &[u8]) -> Result<Vec<u8>, VtfError> {
    let width = header.width as usize;
    let height = header.height as usize;
    let pixel_count = width * height;

    // texture2ddecoder writes one packed u32 per pixel into our buffer.
    let mut pixels = vec![0u32; pixel_count];

    let result = match header.image_format {
        ImageFormat::Dxt1 => texture2ddecoder::decode_bc1(data, width, height, &mut pixels),
        ImageFormat::Dxt3 => texture2ddecoder::decode_bc2(data, width, height, &mut pixels),
        ImageFormat::Dxt5 => texture2ddecoder::decode_bc3(data, width, height, &mut pixels),
        _ => unreachable!("filtered above"),
    };
    result.map_err(|s| VtfError::Decode(s.to_string()))?;

    // Each u32 is packed (A << 24) | (R << 16) | (G << 8) | B.
    // Unpack by bit-shift so endianness doesn't matter.
    let mut out = Vec::with_capacity(pixel_count * 4);
    for &p in &pixels {
        let r = ((p >> 16) & 0xFF) as u8;
        let g = ((p >> 8) & 0xFF) as u8;
        let b = (p & 0xFF) as u8;
        let a = ((p >> 24) & 0xFF) as u8;
        out.extend_from_slice(&[r, g, b, a]);
    }

    Ok(out)
}
