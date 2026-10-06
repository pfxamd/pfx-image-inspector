import type {
  ImageInput as CoreImageInput,
  ImageInspectionResult as CoreImageInspectionResult,
  InspectOptions as CoreInspectOptions,
} from "@pfx/metadata-core";

export type ImageInput = CoreImageInput;
export type ImageInspectionResult = CoreImageInspectionResult;
export type InspectOptions = CoreInspectOptions;

export type InspectionErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_FORMAT"
  | "FILE_READ_FAILED"
  | "CORRUPTED_METADATA"
  | "PARSER_FAILED"
  | "UNSUPPORTED_METADATA_BLOCK"
  | "ABORTED";
