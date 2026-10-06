import { useMemo, useState } from "react";
import type {
  ImageInspectionResult,
  MetadataStatus,
} from "../../../contracts/inspection.js";
import type { InspectionSessionState } from "../use-inspection-session.js";
import {
  formatAperture,
  formatBytes,
  formatCoordinate,
  formatDimensions,
  formatExposure,
  formatFocalLength,
  formatFormat,
  formatIso,
  formatMetadataValue,
  formatNumber,
  formatOrientation,
  formatResolution,
  formatTimestamp,
} from "../formatters.js";

export type InspectorTab =
  | "overview"
  | "capture"
  | "location"
  | "color"
  | "privacy"
  | "integrity"
  | "metadata";

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "capture", label: "Capture" },
  { id: "location", label: "Location" },
  { id: "color", label: "Color" },
  { id: "privacy", label: "Privacy" },
  { id: "integrity", label: "Integrity" },
  { id: "metadata", label: "Metadata" },
];

interface InspectorPanelProps {
  state: InspectionSessionState;
  activeTab: InspectorTab;
  onTabChange(tab: InspectorTab): void;
  onOpen(): void;
}

export function InspectorPanel({
  state,
  activeTab,
  onTabChange,
  onOpen,
}: InspectorPanelProps) {
  return (
    <section className="inspector" aria-label="Inspection results">
      <div className="inspector-head">
        <div className="section-kicker">
          <span>INSPECTOR</span>
          <span>03</span>
        </div>

        <nav className="inspector-tabs" aria-label="Inspection sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "is-active" : undefined}
              onClick={() => onTabChange(tab.id)}
              disabled={state.result === null && state.status !== "error"}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="inspector-stage">
        {state.status === "idle" ? (
          <EmptyInspector onOpen={onOpen} />
        ) : null}

        {state.status === "inspecting" ? <ReadingInspector /> : null}

        {state.status === "error" ? (
          <ErrorInspector
            message={state.error?.message ?? "Image data could not be read."}
            onOpen={onOpen}
          />
        ) : null}

        {state.status === "ready" && state.result !== null ? (
          <ResultInspector result={state.result} tab={activeTab} />
        ) : null}
      </div>
    </section>
  );
}

function EmptyInspector({ onOpen }: { onOpen(): void }) {
  return (
    <div className="inspector-empty">
      <div className="inspector-empty__signal" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>NO IMAGE SIGNAL</p>
      <strong>DROP AN IMAGE TO INSPECT</strong>
      <button onClick={onOpen}>Choose source</button>
    </div>
  );
}

function ReadingInspector() {
  return (
    <div className="reading-stage" aria-live="polite">
      <div className="reading-axis" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="reading-copy">
        <span>READ PROCESS</span>
        <strong>EXTRACTING IMAGE DATA</strong>
        <p>Parsing structure, embedded metadata and image signals.</p>
      </div>
      <div className="reading-code" aria-hidden="true">
        <span>EXIF</span>
        <span>XMP</span>
        <span>ICC</span>
        <span>IPTC</span>
        <span>GPS</span>
        <span>C2PA</span>
      </div>
    </div>
  );
}

function ErrorInspector({
  message,
  onOpen,
}: {
  message: string;
  onOpen(): void;
}) {
  return (
    <div className="inspector-empty inspector-empty--error">
      <p>READ FAILURE</p>
      <strong>IMAGE DATA COULD NOT BE READ</strong>
      <span>{message}</span>
      <button onClick={onOpen}>Choose another source</button>
    </div>
  );
}

function ResultInspector({
  result,
  tab,
}: {
  result: ImageInspectionResult;
  tab: InspectorTab;
}) {
  switch (tab) {
    case "capture":
      return <CaptureView result={result} />;
    case "location":
      return <LocationView result={result} />;
    case "color":
      return <ColorView result={result} />;
    case "privacy":
      return <PrivacyView result={result} />;
    case "integrity":
      return <IntegrityView result={result} />;
    case "metadata":
      return <MetadataView result={result} />;
    default:
      return <OverviewView result={result} />;
  }
}

function OverviewView({ result }: { result: ImageInspectionResult }) {
  return (
    <div className="result-view result-view--overview">
      <ResultHeader
        eyebrow="INSPECTION COMPLETE"
        title={result.file.name ?? "Untitled image"}
        detail={`${formatFormat(result.file.format)} · ${formatBytes(result.file.size)} · ${formatDimensions(result.image)}`}
      />

      <div className="signal-grid">
        <DataGroup title="FILE">
          <DataRow label="Format" value={formatFormat(result.file.format)} />
          <DataRow label="Dimensions" value={formatDimensions(result.image)} />
          <DataRow
            label="Orientation"
            value={formatOrientation(result.image.orientation)}
          />
          <DataRow
            label="Resolution"
            value={formatResolution(result.image.dpi)}
          />
        </DataGroup>

        <DataGroup title="CAPTURE">
          <DataRow label="Camera" value={result.camera?.model ?? "—"} />
          <DataRow label="Lens" value={result.camera?.lens ?? "—"} />
          <DataRow label="ISO" value={formatIso(result.camera?.iso)} />
          <DataRow
            label="Aperture"
            value={formatAperture(result.camera?.aperture)}
          />
        </DataGroup>

        <DataGroup title="TIME">
          <DataRow
            label="Captured"
            value={formatTimestamp(result.timestamps.takenAt)}
          />
          <DataRow
            label="Digitized"
            value={formatTimestamp(result.timestamps.digitizedAt)}
          />
          <DataRow
            label="Modified"
            value={formatTimestamp(result.timestamps.modifiedAt)}
          />
        </DataGroup>

        <DataGroup title="COLOR">
          <DataRow label="Space" value={result.color?.colorSpace ?? "—"} />
          <DataRow label="Profile" value={result.color?.profileName ?? "—"} />
          <DataRow
            label="Bit depth"
            value={
              result.image.bitDepth === null
                ? "—"
                : `${result.image.bitDepth} bit`
            }
          />
        </DataGroup>
      </div>

      <div className="signal-strip">
        <Signal
          label="GPS"
          state={result.location === null ? "absent" : "present"}
        />
        <Signal label="EXIF" state={result.metadata.exif.status} />
        <Signal label="XMP" state={result.metadata.xmp.status} />
        <Signal label="ICC" state={result.metadata.icc.status} />
        <Signal
          label="C2PA"
          state={
            result.provenance.c2pa.status === "detected"
              ? "present"
              : "absent"
          }
        />
        <Signal
          label="PRIVACY"
          state={
            result.privacy.status === "findings_detected"
              ? "partial"
              : "present"
          }
        />
      </div>
    </div>
  );
}

function CaptureView({ result }: { result: ImageInspectionResult }) {
  return (
    <div className="result-view">
      <ResultHeader
        eyebrow="CAPTURE TRACE"
        title={result.camera?.model ?? "No camera identity"}
        detail={result.camera?.make ?? "No manufacturer data"}
      />
      <div className="detail-columns">
        <DataGroup title="OPTICS">
          <DataRow label="Lens" value={result.camera?.lens ?? "—"} />
          <DataRow
            label="Focal length"
            value={formatFocalLength(result.camera?.focalLength)}
          />
          <DataRow
            label="Aperture"
            value={formatAperture(result.camera?.aperture)}
          />
          <DataRow
            label="Exposure"
            value={formatExposure(result.camera?.exposureTime)}
          />
          <DataRow label="ISO" value={formatIso(result.camera?.iso)} />
        </DataGroup>
        <DataGroup title="TIME TRACE">
          <DataRow
            label="Captured"
            value={formatTimestamp(result.timestamps.takenAt)}
          />
          <DataRow
            label="Digitized"
            value={formatTimestamp(result.timestamps.digitizedAt)}
          />
          <DataRow
            label="Modified"
            value={formatTimestamp(result.timestamps.modifiedAt)}
          />
          <DataRow
            label="Software"
            value={
              result.software?.name
                ? [result.software.name, result.software.version]
                    .filter(Boolean)
                    .join(" ")
                : "—"
            }
          />
        </DataGroup>
      </div>
    </div>
  );
}

function LocationView({ result }: { result: ImageInspectionResult }) {
  const location = result.location;

  return (
    <div className="result-view">
      <ResultHeader
        eyebrow="LOCATION TRACE"
        title={location === null ? "No embedded coordinates" : "GPS data detected"}
        detail={
          location === null
            ? "No location block was recovered from the image."
            : "Coordinates are displayed exactly as recovered from metadata."
        }
      />

      {location === null ? (
        <QuietState code="GPS —" label="NO LOCATION METADATA FOUND" />
      ) : (
        <div className="coordinate-field">
          <div>
            <span>LATITUDE</span>
            <strong>{formatCoordinate(location.latitude)}</strong>
          </div>
          <div>
            <span>LONGITUDE</span>
            <strong>{formatCoordinate(location.longitude)}</strong>
          </div>
          <div>
            <span>ALTITUDE</span>
            <strong>
              {location.altitude === null
                ? "—"
                : `${formatNumber(location.altitude, 2)} m`}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorView({ result }: { result: ImageInspectionResult }) {
  return (
    <div className="result-view">
      <ResultHeader
        eyebrow="COLOR STRUCTURE"
        title={result.color?.profileName ?? result.color?.colorSpace ?? "Unspecified color"}
        detail="Embedded color and raster characteristics."
      />
      <div className="detail-columns">
        <DataGroup title="COLOR">
          <DataRow label="Color space" value={result.color?.colorSpace ?? "—"} />
          <DataRow label="ICC profile" value={result.color?.profileName ?? "—"} />
          <DataRow
            label="ICC state"
            value={statusLabel(result.metadata.icc.status)}
          />
        </DataGroup>
        <DataGroup title="RASTER">
          <DataRow
            label="Bit depth"
            value={
              result.image.bitDepth === null
                ? "—"
                : `${result.image.bitDepth} bit`
            }
          />
          <DataRow
            label="Resolution"
            value={formatResolution(result.image.dpi)}
          />
          <DataRow
            label="Dimensions"
            value={formatDimensions(result.image)}
          />
        </DataGroup>
      </div>
    </div>
  );
}

function PrivacyView({ result }: { result: ImageInspectionResult }) {
  const findings = result.privacy.findings;

  return (
    <div className="result-view">
      <ResultHeader
        eyebrow="PRIVACY SIGNALS"
        title={
          findings.length === 0
            ? "No privacy findings detected"
            : `${findings.length} embedded signal${findings.length === 1 ? "" : "s"} detected`
        }
        detail="Findings describe embedded metadata only. They do not prove prior metadata was never present."
      />

      {findings.length === 0 ? (
        <QuietState code="00" label="NO PRIVACY FINDINGS" />
      ) : (
        <div className="finding-list">
          {findings.map((finding) => (
            <article className="finding" key={`${finding.code}-${finding.path}`}>
              <span className={`severity severity--${finding.severity}`}>
                {finding.severity.toUpperCase()}
              </span>
              <div>
                <strong>{humanizeCode(finding.code)}</strong>
                <p>{finding.explanation}</p>
                <code>{finding.path}</code>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrityView({ result }: { result: ImageInspectionResult }) {
  const findings = result.integrity.findings;

  return (
    <div className="result-view">
      <ResultHeader
        eyebrow="STRUCTURE & PROVENANCE"
        title={
          findings.length === 0
            ? "No structural issues detected"
            : `${findings.length} structural signal${findings.length === 1 ? "" : "s"}`
        }
        detail="Consistency checks are structural signals, not authenticity verdicts."
      />

      <div className="integrity-summary">
        <DataGroup title="C2PA">
          <DataRow
            label="Manifest"
            value={humanizeCode(result.provenance.c2pa.status)}
          />
          <DataRow
            label="Embedding"
            value={result.provenance.c2pa.embedding ?? "—"}
          />
          <DataRow
            label="Verification"
            value="Not attempted"
          />
        </DataGroup>

        <DataGroup title="WARNINGS">
          <DataRow
            label="Parser warnings"
            value={String(result.warnings.length)}
          />
          <DataRow
            label="Integrity findings"
            value={String(findings.length)}
          />
        </DataGroup>
      </div>

      {findings.length > 0 ? (
        <div className="finding-list finding-list--compact">
          {findings.map((finding) => (
            <article className="finding" key={finding.code}>
              <span className={`severity severity--${finding.severity}`}>
                {finding.severity.toUpperCase()}
              </span>
              <div>
                <strong>{humanizeCode(finding.code)}</strong>
                <p>{finding.explanation}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const METADATA_BLOCKS = ["exif", "xmp", "iptc", "icc", "jfif"] as const;
type MetadataBlockName = (typeof METADATA_BLOCKS)[number];

function MetadataView({ result }: { result: ImageInspectionResult }) {
  const [block, setBlock] = useState<MetadataBlockName>("exif");
  const selected = result.metadata[block];
  const rows = useMemo(
    () => Object.entries(selected.entries),
    [selected.entries],
  );

  return (
    <div className="result-view result-view--metadata">
      <div className="metadata-head">
        <ResultHeader
          eyebrow="EMBEDDED BLOCKS"
          title="Metadata structure"
          detail="Recovered entries grouped by their source standard."
        />
        <div className="metadata-switcher">
          {METADATA_BLOCKS.map((name) => (
            <button
              key={name}
              onClick={() => setBlock(name)}
              className={block === name ? "is-active" : undefined}
            >
              {name.toUpperCase()}
              <span>{statusMark(result.metadata[name].status)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="metadata-table">
        <div className="metadata-table__header">
          <span>FIELD</span>
          <span>VALUE</span>
        </div>
        {rows.length === 0 ? (
          <QuietState
            code={block.toUpperCase()}
            label={`NO ${block.toUpperCase()} ENTRIES RECOVERED`}
          />
        ) : (
          rows.map(([key, value]) => (
            <div className="metadata-row" key={key}>
              <code>{key}</code>
              <span>{formatMetadataValue(value)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ResultHeader({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <header className="result-header">
      <span>{eyebrow}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </header>
  );
}

function DataGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="data-group">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-row">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function Signal({
  label,
  state,
}: {
  label: string;
  state: MetadataStatus;
}) {
  return (
    <div className={`signal signal--${state}`}>
      <span>{label}</span>
      <strong>{statusMark(state)}</strong>
    </div>
  );
}

function QuietState({ code, label }: { code: string; label: string }) {
  return (
    <div className="quiet-state">
      <span>{code}</span>
      <strong>{label}</strong>
    </div>
  );
}

function statusLabel(status: MetadataStatus): string {
  return status.replaceAll("_", " ").toUpperCase();
}

function statusMark(status: MetadataStatus): string {
  switch (status) {
    case "present":
      return "●";
    case "partial":
      return "◐";
    case "malformed":
      return "!";
    case "unsupported":
      return "×";
    default:
      return "○";
  }
}

function humanizeCode(value: string): string {
  return value.replaceAll("_", " ");
}
