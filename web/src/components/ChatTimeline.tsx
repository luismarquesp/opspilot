import { ApprovalCard } from "./ApprovalCard.js";
import { ErrorBanner } from "./ErrorBanner.js";
import { TraceViewer } from "./TraceViewer.js";
import { formatLatencyMs, formatTokenCount } from "../lib/trace.js";
import type { ApprovalDecision, ChatTimelineItem } from "../types/war-room.js";

export interface ChatTimelineProps {
  items: readonly ChatTimelineItem[];
  onQuickPrompt: (prompt: string, requireApproval?: boolean) => void;
  onApproveDecision: (itemId: string, decision: ApprovalDecision) => void;
  onRetryError: (item: Extract<ChatTimelineItem, { kind: "error" }>) => void;
  onOpenSettings: () => void;
}

export function ChatTimeline({
  items,
  onQuickPrompt,
  onApproveDecision,
  onRetryError,
  onOpenSettings,
}: ChatTimelineProps) {
  return (
    <section
      className="chat-timeline"
      aria-label="Linha do tempo operacional do War Room"
      aria-live="polite"
    >
      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">
            🛡
          </span>
          <h2>War Room pronto para o plantão</h2>
          <p className="empty-state-subtitle">
            Envie uma pergunta operacional para <code className="mono">POST /chat</code>.
            Cada resposta traz métricas em tempo real, o botão{" "}
            <strong>Ver raciocínio</strong> com trace tipado e cartões de aprovação para
            respostas HTTP <code className="mono">202</code>.
          </p>
          <div className="empty-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() =>
                onQuickPrompt("Resuma alertas críticos e saúde do checkout-api", false)
              }
            >
              Consultar incidentes ativos
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                onQuickPrompt(
                  "Abrir incidente crítico para payment-api por pico de erros 5xx",
                  true
                )
              }
            >
              Simular ação crítica (HTTP 202)
            </button>
          </div>
        </div>
      ) : (
        items.map((item) => {
          if (item.kind === "user") {
            return (
              <article key={item.id} className="timeline-card timeline-card--user">
                <div className="card-meta-row">
                  <div className="badge-group">
                    <span className="status-badge status-badge--info">
                      <span aria-hidden="true">▶</span>
                      <span>[OPERADOR]</span>
                    </span>
                    {item.strategy && (
                      <span className="trace-node-pill mono">
                        strategy: {item.strategy}
                      </span>
                    )}
                    {item.requireApproval && (
                      <span className="status-badge status-badge--warning">
                        <span aria-hidden="true">⚠</span>
                        <span>[APROVAÇÃO 202 SOLICITADA]</span>
                      </span>
                    )}
                  </div>
                </div>
                <p className="answer-body">{item.message}</p>
              </article>
            );
          }

          if (item.kind === "assistant") {
            return (
              <article key={item.id} className="timeline-card">
                <div className="card-meta-row">
                  <div className="badge-group">
                    <span className="status-badge status-badge--success">
                      <span aria-hidden="true">✓</span>
                      <span>[RESPOSTA OK]</span>
                    </span>
                    {item.selectedRoute && (
                      <span className="status-badge status-badge--info">
                        <span aria-hidden="true">🧭</span>
                        <span>rota: {item.selectedRoute}</span>
                      </span>
                    )}
                  </div>

                  <div className="badge-group mono telemetry-value">
                    <span>req: {item.requestId}</span>
                    {item.metrics.modelUsed && (
                      <span>model: {item.metrics.modelUsed}</span>
                    )}
                    <span>lat: {formatLatencyMs(item.metrics.latencyMs)}</span>
                    <span>tok: {formatTokenCount(item.metrics.promptTokens)}</span>
                  </div>
                </div>

                {item.routeReason && (
                  <p className="header-subtitle">Roteamento: {item.routeReason}</p>
                )}

                <p className="answer-body">{item.answer}</p>

                <TraceViewer trace={item.trace} />
              </article>
            );
          }

          if (item.kind === "approval") {
            return (
              <ApprovalCard
                key={item.id}
                payload={item.payload}
                status={item.approvalStatus}
                resolutionAnswer={item.resolutionAnswer}
                resolutionTrace={item.resolutionTrace}
                resolutionMetrics={item.resolutionMetrics}
                resolutionError={item.resolutionError}
                onDecide={(decision) => onApproveDecision(item.id, decision)}
              />
            );
          }

          return (
            <ErrorBanner
              key={item.id}
              statusCode={item.statusCode}
              errorCode={item.errorCode}
              message={item.message}
              requestId={item.requestId}
              onRetry={item.retryMessage ? () => onRetryError(item) : undefined}
              onOpenSettings={onOpenSettings}
            />
          );
        })
      )}
    </section>
  );
}
