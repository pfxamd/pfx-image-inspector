import {
  INSPECTION_ERROR_CODES,
  InspectionError,
} from "@pfx/metadata-core";
import type {
  ImageInput,
  ImageInspectionResult,
  InspectOptions,
  InspectionErrorCode,
} from "@pfx/metadata-core";
import type {
  MetadataWorkerRequest,
  MetadataWorkerResponse,
  SerializedWorkerError,
  WorkerImageInput,
  WorkerInspectOptions,
} from "../workers/protocol.js";

interface PendingInspection {
  resolve(result: ImageInspectionResult): void;
  reject(error: unknown): void;
  cleanup(): void;
}

export type MetadataWorkerFactory = () => Worker;

export class MetadataWorkerClient {
  readonly #worker: Worker;
  readonly #pending = new Map<string, PendingInspection>();
  #sequence = 0;
  #disposed = false;

  constructor(
    factory: MetadataWorkerFactory = defaultWorkerFactory,
  ) {
    this.#worker = factory();
    this.#worker.addEventListener("message", this.#handleMessage);
    this.#worker.addEventListener("error", this.#handleWorkerError);
  }

  inspect(
    input: ImageInput,
    options: InspectOptions = {},
  ): Promise<ImageInspectionResult> {
    if (this.#disposed) {
      return Promise.reject(
        new Error("Metadata worker client has been disposed."),
      );
    }

    if (options.signal?.aborted) {
      return Promise.reject(abortedError());
    }

    const requestId = `inspect-${++this.#sequence}`;
    const prepared = prepareInput(input);
    const { signal, ...workerOptions } = options;

    return new Promise<ImageInspectionResult>((resolve, reject) => {
      let abortListener: (() => void) | null = null;

      const cleanup = () => {
        if (signal !== undefined && abortListener !== null) {
          signal.removeEventListener("abort", abortListener);
        }
      };

      this.#pending.set(requestId, {
        resolve,
        reject,
        cleanup,
      });

      if (signal !== undefined) {
        abortListener = () => {
          const pending = this.#pending.get(requestId);
          if (pending === undefined) return;

          this.#pending.delete(requestId);
          pending.cleanup();

          const cancel: MetadataWorkerRequest = {
            type: "cancel",
            requestId,
          };
          this.#worker.postMessage(cancel);
          reject(abortedError());
        };

        signal.addEventListener("abort", abortListener, { once: true });
      }

      const request: MetadataWorkerRequest = {
        type: "inspect",
        requestId,
        input: prepared.input,
        options: workerOptions as WorkerInspectOptions,
      };

      try {
        this.#worker.postMessage(request, prepared.transfer);
      } catch (error) {
        this.#pending.delete(requestId);
        cleanup();
        reject(error);
      }
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    this.#worker.removeEventListener("message", this.#handleMessage);
    this.#worker.removeEventListener("error", this.#handleWorkerError);
    this.#worker.terminate();

    const error = abortedError("Metadata worker was disposed.");

    for (const pending of this.#pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }

    this.#pending.clear();
  }

  #handleMessage = (event: MessageEvent<MetadataWorkerResponse>): void => {
    const message = event.data;
    const pending = this.#pending.get(message.requestId);
    if (pending === undefined) return;

    this.#pending.delete(message.requestId);
    pending.cleanup();

    if (message.type === "result") {
      pending.resolve(message.result);
      return;
    }

    pending.reject(deserializeError(message.error));
  };

  #handleWorkerError = (event: ErrorEvent): void => {
    const error = new Error(
      event.message || "Metadata worker encountered an unrecoverable error.",
    );

    for (const pending of this.#pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }

    this.#pending.clear();
  };
}

let sharedClient: MetadataWorkerClient | null = null;

export function inspectImageInWorker(
  input: ImageInput,
  options: InspectOptions = {},
): Promise<ImageInspectionResult> {
  sharedClient ??= new MetadataWorkerClient();
  return sharedClient.inspect(input, options);
}

export function disposeMetadataWorker(): void {
  sharedClient?.dispose();
  sharedClient = null;
}

function defaultWorkerFactory(): Worker {
  return new Worker(
    new URL("../workers/metadata.worker.ts", import.meta.url),
    {
      type: "module",
      name: "pfx-metadata-worker",
    },
  );
}

function prepareInput(input: ImageInput): {
  input: WorkerImageInput;
  transfer: Transferable[];
} {
  if (input instanceof Uint8Array) {
    const copy = input.slice().buffer;
    return {
      input: copy,
      transfer: [copy],
    };
  }

  if (input instanceof ArrayBuffer) {
    const copy = input.slice(0);
    return {
      input: copy,
      transfer: [copy],
    };
  }

  return {
    input,
    transfer: [],
  };
}

function deserializeError(error: SerializedWorkerError): Error {
  if (isInspectionErrorCode(error.code)) {
    return new InspectionError(error.code, error.message);
  }

  const deserialized = new Error(error.message);
  deserialized.name = error.name;
  return deserialized;
}

function isInspectionErrorCode(
  value: string | undefined,
): value is InspectionErrorCode {
  if (value === undefined) return false;

  return (Object.values(INSPECTION_ERROR_CODES) as string[]).includes(value);
}

function abortedError(
  message = "Image inspection was aborted.",
): InspectionError {
  return new InspectionError(INSPECTION_ERROR_CODES.ABORTED, message);
}
