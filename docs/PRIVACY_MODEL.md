# Privacy Analysis Model

PFx Image Inspector reports explainable metadata privacy findings. It does not
produce a privacy score and does not claim that a file is safe merely because a
finding is absent.

## v0.1 rules

| Finding | Severity | Meaning |
| --- | --- | --- |
| `PRECISE_GPS_LOCATION` | high | Latitude and longitude are embedded. |
| `DEVICE_SERIAL_IDENTIFIER` | high | Camera, lens, or device serial/identifier metadata is present. |
| `CREATOR_CONTACT_INFORMATION` | high | Creator contact metadata such as email, phone, URL, or address is present. |
| `OWNER_OR_CREATOR_IDENTITY` | medium | Author, artist, owner, creator, byline, credit, or copyright identity metadata is present. |
| `PRECISE_CAPTURE_TIME` | medium | An original capture timestamp is embedded. |
| `SOFTWARE_TRACE` | low | Software or processing-tool metadata is present. |

## Design constraints

Findings contain a code, severity, metadata path, and explanation. They do not
copy the sensitive metadata value into the finding itself.

Rules are deterministic and individually testable. Adding a new rule must not
change the meaning of existing rule codes.

The engine distinguishes between:

- `no_findings`: supported metadata was inspected and no current rule matched.
- `findings_detected`: one or more current rules matched.
- `insufficient_metadata`: the available adapters could not inspect applicable metadata.
- `not_analyzed`: privacy analysis was explicitly disabled.

A missing finding is not proof that sensitive metadata never existed. Metadata
may have been removed, rewritten, omitted by a device, or lost during image
conversion or sharing.
