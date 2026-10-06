import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ImageInspectionResult,
  InspectOptions,
} from "../../contracts/inspection.js";
import type { InspectionService } from "../../services/inspection-service.js";
import { MetadataWorkerClient } from "../../services/metadata-worker-client.js";

export type InspectionSessionStatus =
  | "idle"
  | "inspecting"
  | "ready"
  | "error";

export interface InspectionSessionState {
  status: InspectionSessionStatus;
  file: File | null;
  result: ImageInspectionResult | null;
  error: Error | null;
}

const INITIAL_STATE: InspectionSessionState = {
  status: "idle",
  file: null,
  result: null,
  error: null,
};

export function useInspectionSession(
  createService: () => InspectionService = () => new MetadataWorkerClient(),
) {
  const serviceRef = useRef<InspectionService | null>(null);
  const serviceFactoryRef = useRef(createService);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<InspectionSessionState>(INITIAL_STATE);

  const getService = useCallback((): InspectionService => {
    serviceRef.current ??= serviceFactoryRef.current();
    return serviceRef.current;
  }, []);

  const inspect = useCallback(
    async (
      file: File,
      options: Omit<InspectOptions, "signal"> = {},
    ): Promise<void> => {
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        status: "inspecting",
        file,
        result: null,
        error: null,
      });

      try {
        const result = await getService().inspect(file, {
          ...options,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setState({
          status: "ready",
          file,
          result,
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;

        setState({
          status: "error",
          file,
          result: null,
          error: error instanceof Error ? error : new Error("Inspection failed."),
        });
      }
    },
    [getService],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    setState((current) => ({
      ...current,
      status: current.file === null ? "idle" : "idle",
      result: null,
      error: null,
    }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      serviceRef.current?.dispose();
      serviceRef.current = null;
    };
  }, []);

  return {
    state,
    inspect,
    cancel,
    reset,
  } as const;
}
