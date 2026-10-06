import type { InspectionErrorCode } from "./error-codes.js";

export class InspectionError extends Error {
  readonly code: InspectionErrorCode;
  readonly cause?: unknown;

  constructor(code: InspectionErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "InspectionError";
    this.code = code;
    this.cause = cause;
  }
}
