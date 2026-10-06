import type { InspectionErrorCode } from "../contracts/inspection.js";

export class WorkerInspectionError extends Error {
  readonly code: InspectionErrorCode | undefined;

  constructor(
    message: string,
    options: {
      name?: string;
      code?: InspectionErrorCode | undefined;
    } = {},
  ) {
    super(message);
    this.name = options.name ?? "WorkerInspectionError";
    this.code = options.code;
  }
}
