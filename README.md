# PFx Image Inspector

Privacy-first open-source image metadata inspection, designed to run locally without uploading user images.

## Status

Early foundation work for `v0.1`. The repository currently focuses on the metadata core, its public contract, format detection, and tests before any UI is introduced.

## Principles

- Local-first image inspection
- Stable public API
- Explicit metadata provenance and warnings
- No authenticity claims from metadata alone
- Modular parsers and adapters
- Testable against reference tooling such as ExifTool

## Validation

`pnpm corpus` downloads a pinned reference corpus, generates ExifTool
references, and compares PFx canonical fields without storing metadata values
in the report.

## License

Apache-2.0
