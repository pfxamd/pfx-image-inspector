# Reference Validation

The reference suite contains 51 pinned real-image fixtures from upstream
open-source projects.

## Quality gates

CI currently requires:

- zero inspection failures
- overall completeness >= 99.8%
- overall agreement >= 99.9%
- per-format completeness >= 99%
- per-format agreement >= 99%

Robustness-only malformed fixtures are tracked separately and must complete
safely or return a controlled error.

## Canonical comparisons

PFx intentionally compares semantic canonical values rather than raw formatting:

- DPI is normalized to pixels per inch, with EXIF resolution preferred over
  JFIF when both exist.
- ISO is a scalar canonical value even when a malformed or unusual EXIF tag
  stores multiple values.
- Timestamp formatting differences are normalized without inventing a timezone.
- EXIF version and color-space representations are normalized before comparison.

## Known gap

One current reference field is not recovered: Canon PowerShot S40 ISO stored
only inside a vendor-specific MakerNote. Standard EXIF ISO is supported.

PFx keeps this as a visible completeness gap rather than treating MakerNotes as
standard EXIF or adding a one-camera special case.
