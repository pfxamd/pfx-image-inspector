# Reference Corpus

The binary corpus is intentionally not committed.

Run:

```text
pnpm corpus
```

This performs four steps:

1. Download selected upstream fixtures pinned to exact commits.
2. Verify every fixture against its expected Git blob SHA and byte size.
3. Generate an ExifTool reference for a controlled set of canonical fields.
4. Inspect the same files with PFx and write aggregate and per-format reports.

Generated files are written under `fixtures/reference/generated/` and corpus
binaries under `fixtures/reference/files/`. Both directories are ignored by
Git.

The report never stores metadata values. It records only comparison status,
warnings, structured-error names, completeness, and agreement.

## Coverage

The corpus contains 51 pinned samples across:

- JPEG
- TIFF
- PNG
- WebP
- HEIC
- AVIF

It includes ordinary camera images, IPTC/XMP/ICC-heavy images, no-metadata
images, all eight EXIF orientation values, and malformed/edge-case files.

Robustness samples are successful when PFx either completes inspection safely
or returns a controlled error. They do not contribute to metadata
completeness/agreement scores.

## Known coverage gap

The current corpus contains one field that PFx intentionally does not recover
yet: ISO from a Canon PowerShot S40 MakerNote in `jpeg-img1771`.

The file has no standard EXIF ISO tag. ExifTool derives ISO from Canon-specific
MakerNotes. PFx does not claim generic MakerNote interpretation until a
vendor-aware parser is implemented and validated.

This known gap remains in the completeness score instead of being excluded from
the benchmark.
