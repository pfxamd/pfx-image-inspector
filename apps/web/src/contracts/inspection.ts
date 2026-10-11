import type {
  ImageInput as CoreImageInput,
  ImageInspectionResult as CoreImageInspectionResult,
  InspectOptions as CoreInspectOptions,
  MetadataStatus as CoreMetadataStatus,
} from "@pfx/metadata-core";

export type ImageInput = CoreImageInput;
export interface RasterVerification {
  readonly status: "checked" | "unsupported" | "skipped" | "unavailable";
  readonly agreement: "match" | "mismatch" | "not_comparable" | null;
  readonly format: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly hasAlpha: boolean | null;
  readonly hasIccProfile: boolean | null;
  readonly detail: string;
}

/** App-layer advisory field; the original metadata-core schema stays unchanged. */
export type ImageInspectionResult = CoreImageInspectionResult & {
  readonly raster?: RasterVerification;
};
export type InspectOptions = CoreInspectOptions;
export type MetadataStatus = CoreMetadataStatus;

export type InspectionErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_FORMAT"
  | "FILE_READ_FAILED"
  | "CORRUPTED_METADATA"
  | "PARSER_FAILED"
  | "UNSUPPORTED_METADATA_BLOCK"
  | "ABORTED";
