import {
  InspectionError,
  inspectImage,
} from "@pfx/metadata-core";
import type {
  MetadataWorkerRequest,
  MetadataWorkerResponse,
  SerializedWorkerError,
} from "./protocol.js";

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<MetadataWorkerRequest>) => void,
  ): void;
  postMessage(message: MetadataWorkerResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
const active = new Map<string, AbortController>();

scope.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "cancel") {
    active.get(message.requestId)?.abort();
    return;
  }

  void handleInspection(message);
});

async function handleInspection(
  message: Extract<MetadataWorkerRequest, { type: "inspect" }>,
): Promise<void> {
  const controller = new AbortController();
  active.set(message.requestId, controller);

  try {
    const result = await inspectImage(message.input, {
      ...message.options,
      signal: controller.signal,
    });

    scope.postMessage({
      type: "result",
      requestId: message.requestId,
      result,
    });
  } catch (error) {
    scope.postMessage({
      type: "error",
      requestId: message.requestId,
      error: serializeError(error),
    });
  } finally {
    active.delete(message.requestId);
  }
}

function serializeError(error: unknown): SerializedWorkerError {
  if (error instanceof InspectionError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "Error",
    message: "Unknown worker inspection failure.",
  };
}
