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
