import { useId, useState } from "react";
import { describeTraceEvent, hasFallbackEvent } from "../lib/trace.js";
import type { TypedTraceEvent } from "../types/war-room.js";

export interface TraceViewerProps {
  trace: readonly TypedTraceEvent[];
  defaultOpen?: boolean;
}

function formatTraceTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(timestamp);
  }
}

export function TraceViewer({ trace, defaultOpen = false }: TraceViewerProps) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const panelId = useId();

  if (trace.length === 0) {
    return null;
  }

  const fallbackDetected = hasFallbackEvent(trace);

  return (
    <div className="trace-section">
      <div className="trace-toggle-row">
        <button
          type="button"
          className="trace-toggle-btn"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <span>{expanded ? "Ocultar raciocínio" : "Ver raciocínio"}</span>
          <span className="mono">({trace.length})</span>
        </button>

        {fallbackDetected && (
          <span className="status-badge status-badge--warning">
            <span aria-hidden="true">⚠</span>
            <span>[FALLBACK DETECTADO]</span>
          </span>
        )}
      </div>

      {expanded && (
        <div id={panelId} role="region" aria-label="Raciocínio tipado do agente">
          <ol className="trace-list">
            {trace.map((event, idx) => {
              const described = describeTraceEvent(event);
              const badgeToneClass =
                described.tone === "neutral"
                  ? "status-badge"
                  : `status-badge status-badge--${described.tone}`;

              return (
                <li
                  key={`${event.type}-${event.node}-${idx}`}
                  className="trace-step"
                >
                  <div className="trace-step-header">
                    <div className="badge-group">
                      <span className={badgeToneClass}>
                        <span aria-hidden="true">{described.icon}</span>
                        <span>[{described.label.toUpperCase()}]</span>
                      </span>
                      <span className="trace-node-pill mono">
                        node: {described.node}
                      </span>
                    </div>

                    <span className="telemetry-value header-subtitle">
                      #{idx + 1} · {formatTraceTime(described.timestamp)}
                    </span>
                  </div>

                  <div className="trace-detail-grid">
                    <p>{described.detail}</p>
                    {described.codeBlock && (
                      <pre className="trace-code-block mono">
                        <code>{described.codeBlock}</code>
                      </pre>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
