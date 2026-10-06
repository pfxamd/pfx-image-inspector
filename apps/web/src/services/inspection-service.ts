import type {
  ImageInput,
  ImageInspectionResult,
  InspectOptions,
} from "../contracts/inspection.js";

export interface InspectionService {
  inspect(
    input: ImageInput,
    options?: InspectOptions,
  ): Promise<ImageInspectionResult>;

  dispose(): void;
}
