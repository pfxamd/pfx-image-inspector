import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DragEvent } from "react";
import { useInspectionSession } from "../features/inspection/use-inspection-session.js";
import { DataStream } from "../features/inspection/components/DataStream.js";
import { InspectorPanel } from "../features/inspection/components/InspectorPanel.js";
import { SourcePanel } from "../features/inspection/components/SourcePanel.js";
import type { InspectorTab } from "../features/inspection/components/InspectorPanel.js";
import pfxLogo from "../assets/pfx-logo.svg";
import {
  applyTheme,
  getInitialTheme,
  persistTheme,
  type Theme,
} from "./theme.js";
import "./app.css";
import "./typography.css";

const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif,image/avif,.jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,.avif";

export function App() {
  const { state, inspect, cancel, reset } = useInspectionSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const [copied, setCopied] = useState(false);
  const [streamCycle, setStreamCycle] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const previousStatus = useRef(state.status);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (state.file === null) {
      setPreviewUrl(null);
      setPreviewFailed(false);
      return;
    }

    const nextUrl = URL.createObjectURL(state.file);
    setPreviewUrl(nextUrl);
    setPreviewFailed(false);

    return () => URL.revokeObjectURL(nextUrl);
  }, [state.file]);

  useEffect(() => {
    if (
      previousStatus.current === "inspecting" &&
      state.status === "ready"
    ) {
      setStreamCycle((cycle) => cycle + 1);
    }

    previousStatus.current = state.status;
  }, [state.status]);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const inspectFile = useCallback(
    (file: File) => {
      setCopied(false);
      setActiveTab("overview");
      void inspect(file);
    },
    [inspect],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files.item(0);
      if (file !== null) inspectFile(file);
    },
    [inspectFile],
  );

  const onClear = useCallback(() => {
    reset();
    setCopied(false);
    setActiveTab("overview");
    if (inputRef.current !== null) inputRef.current.value = "";
  }, [reset]);

  const copyData = useCallback(async () => {
    if (state.result === null) return;
    await navigator.clipboard.writeText(
      JSON.stringify(state.result, null, 2),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [state.result]);

  const exportData = useCallback(() => {
    if (state.result === null) return;

    const blob = new Blob(
      [JSON.stringify(state.result, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const sourceName = state.file?.name.replace(/\.[^.]+$/, "") ?? "image";
    anchor.href = url;
    anchor.download = `${sourceName}.inspection.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [state.file, state.result]);

  const statusLabel = useMemo(() => {
    switch (state.status) {
      case "inspecting":
        return "READING";
      case "ready":
        return "COMPLETE";
      case "error":
        return "ERROR";
      default:
        return "READY";
    }
  }, [state.status]);

  return (
    <main
      className="pfx-app"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={(event) => {
          const file = event.currentTarget.files?.item(0);
          if (file !== null && file !== undefined) inspectFile(file);
        }}
      />

      <header className="tool-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <img src={pfxLogo} alt="" />
          </div>
          <div className="brand-copy">
            <div className="brand-title-row">
              <div className="brand-name">pfx image inspector</div>
              <span className="beta-badge">BETA 0.1</span>
            </div>
            <div className="brand-subline">LOCAL IMAGE ANALYSIS</div>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="theme-toggle"
            type="button"
            data-theme-toggle
            aria-label={
              theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
          >
            <span className="theme-toggle__icon" aria-hidden="true">
              {theme === "dark" ? "☼" : "◐"}
            </span>
            <span>{theme === "dark" ? "LIGHT" : "DARK"}</span>
          </button>

          <div
            className={`runtime-state runtime-state--${state.status}`}
            aria-live="polite"
          >
            <span className="runtime-dot" />
            {statusLabel}
          </div>

          <button className="tool-button tool-button--primary" onClick={openPicker}>
            Open Image
          </button>

          <button
            className="tool-button"
            onClick={onClear}
            disabled={state.file === null}
          >
            Clear
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Image inspection workspace">
        <div className="workspace-grid">
          <SourcePanel
            state={state}
            previewUrl={previewUrl}
            previewFailed={previewFailed}
            onPreviewError={() => setPreviewFailed(true)}
            onOpen={openPicker}
            onCancel={cancel}
            onClear={onClear}
            onCopy={() => void copyData()}
            onExport={exportData}
            copied={copied}
          />

          <InspectorPanel
            state={state}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onOpen={openPicker}
          />
        </div>

        <DataStream
          key={streamCycle}
          result={state.result}
          active={state.status === "ready" && streamCycle > 0}
        />
      </section>
    </main>
  );
}
