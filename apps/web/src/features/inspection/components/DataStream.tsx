import type { ImageInspectionResult } from "../../../contracts/inspection.js";
import { buildExtractionTokens } from "../formatters.js";

interface DataStreamProps {
  result: ImageInspectionResult | null;
  active: boolean;
}

export function DataStream({ result, active }: DataStreamProps) {
  if (!active || result === null) return null;

  const tokens = buildExtractionTokens(result).slice(0, 7);

  return (
    <div className="data-stream" aria-hidden="true">
      {tokens.map((token, index) => (
        <span
          className="data-stream__token"
          key={`${token}-${index}`}
          data-stream-index={index}
        >
          {token}
        </span>
      ))}
    </div>
  );
}
