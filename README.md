# PFx Image Inspector

Privacy-first open-source image metadata inspection, designed to run locally without uploading user images.

## Status

Early foundation work for `v0.1`. The metadata core is now connected to a dedicated browser Web Worker and validated across Chromium, Firefox, and WebKit before product UI work begins.

## Principles

- Local-first image inspection
- Stable public API
- Explicit metadata provenance and warnings
- No authenticity claims from metadata alone
- Modular parsers and adapters
- Testable against reference tooling such as ExifTool

## Validation

`pnpm corpus` downloads a pinned multi-source reference corpus, verifies every
binary by Git blob SHA and byte size, generates ExifTool references, and
compares PFx canonical fields without storing metadata values in the report.

The report includes aggregate and per-format completeness/agreement metrics,
plus separate robustness cases for malformed inputs.

## License

Apache-2.0

## Independent Raster Core second opinion

The browser metadata worker optionally uses the independently pinned Raster Core
0.5.0-alpha.6 after metadata parsing, for still JPEG/PNG/WebP files up to
8 MiB. It compares independently inspected dimensions and format when
orientation permits, and adds alpha-channel presence information to the
existing Color → Raster panel.

This is an **advisory cross-check**, not evidence of image authenticity.
It does not overwrite or weaken metadata-core results. Animated images,
unsupported formats, oversized files or pixel decode failures yield explicit
skipped/unavailable status. The original EXIF/XMP, privacy/integrity, ICC and
C2PA inspection continues to function independently. No images or metadata
are uploaded by this feature.
