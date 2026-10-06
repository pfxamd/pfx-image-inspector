# Standards and Provenance Detection

PFx Image Inspector separates metadata-standard detection from provenance
verification.

## Metadata standards

Each standard descriptor contains:

- `status`
- `version` when the file exposes an embedded version field
- `evidence`, containing canonical metadata paths used for the detection

Current version extraction covers:

- EXIF via `ExifVersion`
- IPTC-IIM via `ApplicationRecordVersion`
- ICC via `ProfileVersion`
- JFIF via `JFIFVersion`

XMP presence is reported, but a version is intentionally left null because
ordinary XMP packets do not reliably carry a single XMP specification version.

## C2PA presence detection

The v0.1 detector follows the embedding locations defined by C2PA 2.4:

- JPEG: APP11 JUMBF containing the C2PA Manifest Store UUID
- PNG: `caBX` chunk
- WebP: RIFF `C2PA` chunk
- TIFF: tag `0xCD41`
- HEIC / HEIF / AVIF: BMFF `uuid` ContentProvenanceBox

Presence detection is not cryptographic verification.

A result of `detected` means the expected embedded C2PA container was located.
It does not mean the manifest signature, trust chain, assertions, or content
bindings have been validated.

A result of `not_detected` means no embedded manifest was found at the
supported in-file location. It does not rule out an external C2PA manifest.
