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

WebP format detection already exists, but the current `exifr` adapter is not
registered for WebP. A separate parser can be added without changing
`inspectImage()`.

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
- exifr adapter
- canonical metadata normalization
- structured metadata statuses
- raw adapter output behind `includeRaw`
- structured errors and cancellation
- unit and integration tests

Privacy rules, integrity rules, C2PA detection, and the web UI remain separate
next layers.
