import type { ImageFormat, InspectionWarning } from "../model/public.js";

export type MetadataBlockKey = "exif" | "xmp" | "iptc" | "icc" | "jfif";
export type AdapterState = "success" | "partial" | "failed";

export type SourceBlockKey =
  | "image"
  | "photo"
  | "gps"
  | "xmp"
  | "iptc"
  | "icc"
  | "jfif"
  | "header";

export type MetadataCapabilities = Record<MetadataBlockKey, boolean>;

export interface InspectionContext {
  bytes: Uint8Array;
  format: ImageFormat;
  signal?: AbortSignal;
}

export interface AdapterExtractionResult {
  adapterId: string;
  state: AdapterState;
  capabilities: MetadataCapabilities;
  blockStates?: Partial<Record<MetadataBlockKey, AdapterState>>;
  sources: Partial<Record<SourceBlockKey, Record<string, unknown>>>;
  raw: Record<string, unknown>;
  warnings: InspectionWarning[];
}

export interface MetadataAdapter {
  readonly id: string;
  supportsFormat(format: ImageFormat): boolean;
  extract(context: InspectionContext): Promise<AdapterExtractionResult>;
}
