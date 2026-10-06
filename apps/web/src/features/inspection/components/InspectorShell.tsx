import type { ReactNode } from "react";

interface InspectorShellProps {
  top: ReactNode;
  left: ReactNode;
  center: ReactNode;
  bottom: ReactNode;
}

export function InspectorShell({
  top,
  left,
  center,
  bottom,
}: InspectorShellProps) {
  return (
    <div className="inspector-shell">
      <div
        className="inspector-shell__top"
        data-layout-region="top"
      >
        {top}
      </div>

      <div className="inspector-shell__body">
        <aside
          className="inspector-shell__left"
          data-layout-region="left"
        >
          {left}
        </aside>

        <div
          className="inspector-shell__center"
          data-layout-region="center"
        >
          {center}
        </div>
      </div>

      <div
        className="inspector-shell__bottom"
        data-layout-region="bottom"
      >
        {bottom}
      </div>
    </div>
  );
}
