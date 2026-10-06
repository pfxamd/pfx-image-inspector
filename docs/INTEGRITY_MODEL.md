# Integrity and Consistency Model

PFx Image Inspector performs deterministic consistency checks on metadata that
is already present in the file. It does not decide whether an image is
authentic, fake, original, edited, or AI-generated.

## v0.1 rules

| Finding | Severity | Meaning |
| --- | --- | --- |
| `MALFORMED_METADATA_BLOCK` | warning | A supported metadata block could not be parsed cleanly. |
| `INVALID_GPS_COORDINATES` | high | Recovered latitude or longitude is outside valid geographic ranges. |
| `INVALID_ORIENTATION_VALUE` | warning | An Orientation tag exists but cannot be represented as EXIF orientation 1–8. |
| `INVALID_IMAGE_DIMENSIONS` | high | Recovered width or height is non-positive. |
| `TIMESTAMP_CONFLICT` | warning | The same timestamp field appears with conflicting values in different metadata sections. |
| `IDENTITY_METADATA_CONFLICT` | warning | Stable camera/device identity metadata conflicts across sections. |

## Conservative scope

The engine intentionally avoids speculative rules. In particular, v0.1 does
not infer camera/lens compatibility, editing history, image authenticity, or
AI generation from metadata.

A finding means that the file contains an observable inconsistency according to
a deterministic rule. It does not explain why that inconsistency exists.

## Status

- `no_issues_detected`: applicable metadata was inspected and no current rule matched.
- `issues_detected`: one or more deterministic rules matched.
- `insufficient_metadata`: current adapters could not inspect applicable metadata.
- `not_analyzed`: integrity analysis was explicitly disabled.
