import type {
  ImageInspectionResult,
  InspectOptions,
} from "../contracts/inspection.js";

export type WorkerInspectOptions = Omit<InspectOptions, "signal">;
export type WorkerImageInput = Blob | ArrayBuffer;

export interface InspectWorkerRequest {
  type: "inspect";
  requestId: string;
  input: WorkerImageInput;
  options: WorkerInspectOptions;
}

export interface CancelWorkerRequest {
  type: "cancel";
  requestId: string;
}

export type MetadataWorkerRequest =
  | InspectWorkerRequest
  | CancelWorkerRequest;

export interface SerializedWorkerError {
  name: string;
  message: string;
  code?: string;
}

export interface InspectWorkerSuccess {
  type: "result";
  requestId: string;
  result: ImageInspectionResult;
}

export interface InspectWorkerFailure {
  type: "error";
  requestId: string;
  error: SerializedWorkerError;
}

export type MetadataWorkerResponse =
  | InspectWorkerSuccess
  | InspectWorkerFailure;
