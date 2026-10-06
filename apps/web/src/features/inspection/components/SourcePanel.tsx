import type { InspectionSessionState } from "../use-inspection-session.js";
import {
  formatBytes,
  formatDimensions,
  formatFormat,
} from "../formatters.js";

interface SourcePanelProps {
  state: InspectionSessionState;
  previewUrl: string | null;
  previewFailed: boolean;
  copied: boolean;
  onPreviewError(): void;
  onOpen(): void;
  onCancel(): void;
  onClear(): void;
  onCopy(): void;
  onExport(): void;
}

export function SourcePanel({
  state,
  previewUrl,
  previewFailed,
  copied,
  onPreviewError,
  onOpen,
  onCancel,
  onClear,
  onCopy,
  onExport,
}: SourcePanelProps) {
  const hasFile = state.file !== null;
  const result = state.result;

  return (
    <aside className="source-column" aria-label="Source image">
      <div className="section-kicker">
        <span>SOURCE</span>
        {hasFile ? <span>01</span> : <span>EMPTY</span>}
      </div>

      <button
        className={`source-preview source-preview--${state.status}`}
        onClick={onOpen}
        type="button"
        aria-label={hasFile ? "Replace source image" : "Open an image"}
      >
        {previewUrl !== null && !previewFailed ? (
          <img
            src={previewUrl}
            alt=""
            draggable={false}
            onError={onPreviewError}
          />
        ) : hasFile ? (
          <div className="source-preview__fallback">
            <span>{result ? formatFormat(result.file.format) : "IMAGE"}</span>
            <small>PREVIEW UNAVAILABLE</small>
          </div>
        ) : (
          <div className="source-empty">
            <span className="source-empty__cross" aria-hidden="true" />
            <strong>DROP AN IMAGE</strong>
            <small>OR CLICK TO INSPECT</small>
          </div>
        )}

        {state.status === "inspecting" ? (
          <>
            <span className="scan-line" aria-hidden="true" />
            <span className="scan-grid" aria-hidden="true" />
            <span className="scan-label">EXTRACTING IMAGE DATA</span>
          </>
        ) : null}
      </button>

      <div className="source-readout">
        <div className="source-readout__name" title={state.file?.name ?? ""}>
          {state.file?.name ?? "No source selected"}
        </div>
        <div className="source-readout__meta">
          <span>
            {result
              ? formatFormat(result.file.format)
              : state.file?.type || "—"}
          </span>
          <span>
            {result ? formatDimensions(result.image) : "— × —"}
          </span>
          <span>{state.file ? formatBytes(state.file.size) : "—"}</span>
        </div>
      </div>

      <div className="source-controls">
        <div className="section-kicker">
          <span>FILE OPERATIONS</span>
          <span>02</span>
        </div>

        <div className="operation-grid">
          <button className="operation-button" onClick={onOpen}>
            <span>Replace</span>
            <kbd>R</kbd>
          </button>

          {state.status === "inspecting" ? (
            <button className="operation-button" onClick={onCancel}>
              <span>Stop Read</span>
              <kbd>×</kbd>
            </button>
          ) : (
            <button
              className="operation-button"
              onClick={onCopy}
              disabled={result === null}
            >
              <span>{copied ? "Copied" : "Copy Data"}</span>
              <kbd>⌘</kbd>
            </button>
          )}

          <button
            className="operation-button"
            onClick={onExport}
            disabled={result === null}
          >
            <span>Export JSON</span>
            <kbd>↗</kbd>
          </button>

          <button
            className="operation-button operation-button--quiet"
            onClick={onClear}
            disabled={!hasFile}
          >
            <span>Release</span>
            <kbd>⌫</kbd>
          </button>
        </div>
      </div>

      <div className="source-foot">
        <span>PROCESSING</span>
        <strong>LOCAL</strong>
      </div>
    </aside>
  );
}
