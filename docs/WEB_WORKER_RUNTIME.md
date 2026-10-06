# Web Worker Runtime

PFx Image Inspector runs metadata inspection outside the browser main thread.

## Runtime boundary

```text
React UI
  ↓
MetadataWorkerClient
  ↓
Dedicated Web Worker
  ↓
@pfx/metadata-core
```

The UI never imports parser-specific APIs.

## Input handling

- `File` and `Blob` inputs are structured-cloned to the worker.
- `ArrayBuffer` and `Uint8Array` inputs are copied into an owned buffer and
  transferred, so the caller's original buffer is never detached.
- `AbortSignal` is not cloned. Cancellation uses an explicit worker protocol
  and an `AbortController` inside the worker.

## Error handling

Known core failures are reconstructed as `InspectionError` instances on the
main thread. Unexpected worker failures remain ordinary `Error` objects.

## Browser validation

Playwright runs the worker path on Chromium, Firefox, and WebKit.

The suite verifies:

- real worker-based inspection
- in-flight cancellation
- a 32 MiB input
- main-thread responsiveness during large-file inspection
- a generous wall-clock guard against severe regressions

The performance guard is not marketed as a universal benchmark. CI hardware
varies, so the primary requirement is that parsing remains off the main thread
and completes within a regression budget.
