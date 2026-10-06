export type ImageInput = Blob | ArrayBuffer | Uint8Array;

export type ImageFormat = "jpeg" | "png" | "webp" | "tiff" | "heic" | "heif" | "avif";

export type MetadataStatus = "present" | "absent" | "partial" | "malformed" | "unsupported";

export interface InspectOptions {
  includeRaw?: boolean;
  analyzePrivacy?: boolean;
  analyzeIntegrity?: boolean;
  detectProvenance?: boolean;
  signal?: AbortSignal;
}

export interface FileInfo {
  name: string | null;
  format: ImageFormat;
  mime: string;
  declaredMime: string | null;
  size: number;
}

export interface ImageInfo {
  width: number | null;
  height: number | null;
  orientation: number | null;
  dpi: { x: number | null; y: number | null } | null;
  bitDepth: number | null;
}

export interface CameraInfo {
  make: string | null;
  model: string | null;
  lens: string | null;
  iso: number | null;
  aperture: number | null;
  focalLength: number | null;
  exposureTime: number | null;
}

export interface LocationInfo {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
}

export interface ColorInfo {
  colorSpace: string | null;
  profileName: string | null;
}

export interface TimestampInfo {
  takenAt: string | null;
  digitizedAt: string | null;
  modifiedAt: string | null;
}

export interface SoftwareInfo {
  name: string | null;
  version: string | null;
}

export interface MetadataBlock {
  status: MetadataStatus;
  entries: Record<string, unknown>;
}

export interface MetadataCollection {
  exif: MetadataBlock;
  xmp: MetadataBlock;
  iptc: MetadataBlock;
  icc: MetadataBlock;
  jfif: MetadataBlock;
}

export interface PrivacyFinding {
  code: string;
  severity: "info" | "low" | "medium" | "high";
  path: string;
  explanation: string;
}

export interface PrivacyAnalysis {
  status: "not_analyzed" | "no_findings" | "findings_detected" | "insufficient_metadata";
  findings: PrivacyFinding[];
}

export interface IntegrityFinding {
  code: string;
  severity: "info" | "warning" | "high";
  paths: string[];
  explanation: string;
}

export interface IntegrityAnalysis {
  status: "not_analyzed" | "no_issues_detected" | "issues_detected" | "insufficient_metadata";
  findings: IntegrityFinding[];
}

export interface StandardDescriptor {
  status: MetadataStatus;
  version: string | null;
  evidence: string[];
}

export interface StandardsInfo {
  exif: StandardDescriptor;
  xmp: StandardDescriptor;
  iptc: StandardDescriptor;
  icc: StandardDescriptor;
  jfif: StandardDescriptor;
}

export type C2paEmbedding =
  | "jpeg_app11"
  | "png_caBX"
  | "webp_C2PA"
  | "tiff_tag_0xcd41"
  | "bmff_uuid";

export interface ProvenanceInfo {
  c2pa: {
    status: "not_checked" | "not_detected" | "detected" | "malformed" | "unsupported";
    verification: "not_attempted";
    embedding: C2paEmbedding | null;
    evidenceOffset: number | null;
  };
}

export interface InspectionWarning {
  code: string;
  message: string;
  path?: string;
}

export type RawMetadata = Record<string, unknown>;

export interface ImageInspectionResult {
  schemaVersion: string;
  engineVersion: string;
  file: FileInfo;
  image: ImageInfo;
  camera: CameraInfo | null;
  location: LocationInfo | null;
  color: ColorInfo | null;
  timestamps: TimestampInfo;
  software: SoftwareInfo | null;
  metadata: MetadataCollection;
  privacy: PrivacyAnalysis;
  integrity: IntegrityAnalysis;
  standards: StandardsInfo;
  provenance: ProvenanceInfo;
  warnings: InspectionWarning[];
  raw?: RawMetadata;
}
