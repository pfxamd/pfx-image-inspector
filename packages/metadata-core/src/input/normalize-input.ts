import { INSPECTION_ERROR_CODES } from "../errors/error-codes.js";
import { InspectionError } from "../errors/inspection-error.js";
import type { ImageInput } from "../model/public.js";

export interface NormalizedInput {
  bytes: Uint8Array;
  size: number;
  name: string | null;
  declaredMime: string | null;
}

export async function normalizeInput(input: ImageInput): Promise<NormalizedInput> {
  if (input instanceof Uint8Array) {
    assertNotEmpty(input.byteLength);
    return { bytes: input, size: input.byteLength, name: null, declaredMime: null };
  }

  if (input instanceof ArrayBuffer) {
    assertNotEmpty(input.byteLength);
    return {
      bytes: new Uint8Array(input),
      size: input.byteLength,
      name: null,
      declaredMime: null,
    };
  }

  if (typeof Blob !== "undefined" && input instanceof Blob) {
    assertNotEmpty(input.size);

    try {
      const bytes = new Uint8Array(await input.arrayBuffer());
      const possibleName = (input as Blob & { name?: unknown }).name;
      const name =
        typeof possibleName === "string" && possibleName.length > 0 ? possibleName : null;
      const declaredMime = input.type.trim().length > 0 ? input.type : null;

      return { bytes, size: input.size, name, declaredMime };
    } catch (error) {
      throw new InspectionError(
        INSPECTION_ERROR_CODES.FILE_READ_FAILED,
        "The image input could not be read.",
        error,
      );
    }
  }

  throw new InspectionError(
    INSPECTION_ERROR_CODES.INVALID_INPUT,
    "Expected a Blob, ArrayBuffer, or Uint8Array image input.",
  );
}

function assertNotEmpty(size: number): void {
  if (size === 0) {
    throw new InspectionError(INSPECTION_ERROR_CODES.INVALID_INPUT, "Image input is empty.");
  }
}
