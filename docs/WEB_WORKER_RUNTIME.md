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
@pfx/metadata-core\n  ↓ (optional)\n@pfxamd/raster-core/browser/header\n```

The UI never imports parser-specific APIs. A bounded independent structural\nheader check runs in the same worker after metadata parsing; it does not\ndecode bitmap pixels. This avoids allocating a second RGBA raster and limits\na separate encoded copy to at most 8 MiB (Blob input). Header agreement is\nnot full pixel-stream validation.

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
