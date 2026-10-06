# Architecture

PFx Image Inspector keeps the metadata engine independent from the web interface.

## Core pipeline

1. Normalize binary input.
2. Detect the real image format from bytes rather than file extension.
3. Run registered metadata adapters.
4. Normalize adapter output into the PFx canonical model.
5. Detect standards and provenance structures.
6. Run privacy and consistency analysis.
7. Return a stable public result.

## Boundaries

The public API must not expose third-party parser-specific types. Runtime parsers are adapters and may be replaced without changing the public contract.

Metadata alone must never be presented as proof that an image is authentic, fake, original, or AI-generated.

## Current foundation

The initial implementation contains input normalization, format detection, the public data contract, structured errors, cancellation support, and tests. Metadata adapters are intentionally the next layer.
