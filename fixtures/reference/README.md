# Reference Corpus

The binary corpus is intentionally not committed.

Run:

```text
pnpm corpus
```

This performs four steps:

1. Download selected upstream fixtures pinned to an exact commit.
2. Verify each fixture against its expected Git blob SHA and byte size.
3. Generate an ExifTool reference for a controlled set of canonical fields.
4. Inspect the same files with PFx and write comparison reports.

Generated files are written under `fixtures/reference/generated/` and corpus
binaries under `fixtures/reference/files/`. Both directories are ignored by
Git.

The comparison report never writes metadata values. It records only field
status and aggregate completeness/agreement metrics.

The first corpus deliberately stays small:

- JPEG with IPTC
- TIFF
- AVIF
- HEIC
- malformed JPEG robustness case

Synthetic WebP integration fixtures remain in the unit test suite because the
upstream reference source does not contain a suitable WebP fixture.
