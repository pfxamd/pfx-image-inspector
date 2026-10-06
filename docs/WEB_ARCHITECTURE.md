# Web Architecture

The web application is a presentation and interaction layer. It does not own
metadata parsing, normalization, privacy analysis, integrity analysis,
standards interpretation, or provenance detection.

## Runtime boundary

```text
React UI
  |
  v
InspectionService
  |
  v
MetadataWorkerClient
  |
  v
Web Worker
  |
  v
@pfx/metadata-core
```

The main browser thread does not execute `metadata-core`.

Only the dedicated worker may import the core at runtime. The web layer may
use type-only contracts so that the UI remains strongly typed without bundling
the inspection engine into the main-thread application code.

## Source layout

```text
apps/web/src/
├── app/
│   └── App.tsx
├── contracts/
│   └── inspection.ts
├── features/
│   └── inspection/
│       └── use-inspection-session.ts
├── services/
│   ├── inspection-service.ts
│   ├── metadata-worker-client.ts
│   └── worker-inspection-error.ts
└── workers/
    ├── protocol.ts
    └── metadata.worker.ts
```

## Responsibilities

`app/`
owns composition only. Visual design will be implemented here and through
future presentation components.

`features/inspection/`
owns UI workflow state such as idle, inspecting, ready, error, cancel, and
reset. It must not parse metadata.

`services/`
owns the main-thread abstraction used by React. The UI talks to the
`InspectionService` interface rather than to the core.

`workers/`
owns cross-thread messaging. The metadata worker is the only web runtime module
allowed to execute `@pfx/metadata-core`.

`contracts/`
contains compile-time types shared by the web layer. Imports from the core in
this directory are type-only.

## Enforcement

`pnpm check:web-boundaries` scans the web source tree and fails CI if:

- a UI/service module imports `@pfx/metadata-core` directly
- `inspectImage()` is called anywhere outside the dedicated worker

This prevents future interface work from gradually moving business logic back
onto the main thread.

## Visual design

No visual system is defined by this architecture. Layout, spacing, typography,
components, and interaction design remain independent decisions for the UI
phase.
