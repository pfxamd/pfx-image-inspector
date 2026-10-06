# Architecture

PFx Image Inspector keeps the metadata engine independent from the web interface.

## Core pipeline

1. Normalize binary input.
2. Detect the real image format from bytes rather than file extension.
3. Select compatible metadata adapters.
4. Extract source metadata without exposing adapter-specific types.
5. Normalize adapter output into the PFx canonical model.
6. Detect standards and provenance structures.
7. Run privacy and consistency analysis.
8. Return a stable public result.

## Adapter boundary

Runtime parsers are implementation details. The public API must never expose
`exifr` types or output contracts.

The current default adapter is `exifr`, selected because it is browser-capable,
dependency-free at runtime, MIT-licensed, and supports EXIF/TIFF, GPS, XMP, IPTC,
ICC, JFIF and modern HEIF-family inputs where applicable.

WebP uses a native PFx container adapter. It validates RIFF chunk boundaries,
reads VP8X/VP8/VP8L dimensions, extracts EXIF/XMP/ICCP chunks, parses ICC and
common XMP properties internally, and delegates only the embedded TIFF/EXIF
payload to the existing EXIF parser boundary.

## Canonical model

Adapters translate their parser-specific output into internal source blocks:

- image
- photo
- gps
- xmp
- iptc
- icc
- jfif
- header

The normalizer then maps those blocks into stable PFx fields such as
`camera.make`, `location.latitude`, `image.orientation`, and metadata
section statuses.

## Safety of conclusions

Metadata alone must never be presented as proof that an image is authentic,
fake, original, or AI-generated.

A missing metadata field means only that the current inspection did not recover
that field. It must not be interpreted as proof that the field never existed.

## Current foundation

The implementation now includes:

- input normalization
- magic-byte format detection
- adapter registry
- exifr adapter for supported image containers
- native WebP RIFF metadata adapter
- native ISO BMFF spatial-dimension detection for HEIC/HEIF/AVIF
- canonical metadata normalization with source-aware timestamp priority
- structured metadata statuses
- standards detection with embedded version evidence where available
- explainable privacy analysis
- conservative integrity and consistency analysis
- C2PA 2.4 embedded-manifest presence detection for JPEG, PNG, WebP, TIFF, HEIC, HEIF, and AVIF
- raw adapter output behind `includeRaw`
- structured errors and cancellation
- dedicated browser Web Worker runtime with explicit cancellation protocol
- cross-browser Playwright coverage on Chromium, Firefox, and WebKit
- large-file responsiveness checks
- unit and integration tests

Cryptographic C2PA verification and the product UI remain separate next layers.
