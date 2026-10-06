# WebP Metadata Support

PFx Image Inspector parses the WebP RIFF container directly.

## Supported chunks

- `VP8X`: feature flags and canvas dimensions
- `VP8 `: lossy image dimensions
- `VP8L`: lossless image dimensions
- `EXIF`: embedded Exif/TIFF metadata
- `XMP `: common scalar XMP properties
- `ICCP`: ICC header and profile-description metadata
- `C2PA`: provenance presence detection remains handled by the provenance layer

## Validation

The parser checks RIFF and chunk boundaries, odd-byte padding, duplicate
metadata chunks, VP8X reserved bits, and consistency between VP8X metadata flags
and actual metadata chunks.

Per the WebP specification, only the first `ICCP`, `EXIF`, or `XMP `
chunk is used when duplicates are present.

The WebP adapter owns the container parsing. The existing Exif parser is used
only after the WebP adapter has isolated a valid EXIF chunk payload, preserving
the public PFx metadata model and parser boundary.
