import { TraceViewer } from "./TraceViewer.js";
import { formatLatencyMs, formatTokenCount } from "../lib/trace.js";
import type {
  ApprovalDecision,
  ApprovalStatus,
  PendingApprovalPayload,
  StrategyMetrics,
  TypedTraceEvent,
} from "../types/war-room.js";

export interface ApprovalCardProps {
  payload: PendingApprovalPayload;
  status: ApprovalStatus;
  resolutionAnswer?: string;
  resolutionTrace?: TypedTraceEvent[];
  resolutionMetrics?: StrategyMetrics;
  resolutionError?: string;
  onDecide: (decision: ApprovalDecision) => void;
}

export function ApprovalCard({
  payload,
  status,
  resolutionAnswer,
  resolutionTrace,
  resolutionMetrics,
  resolutionError,
  onDecide,
}: ApprovalCardProps) {
  const isSubmitting = status === "submitting";
  const isResolved = status === "approved" || status === "rejected";

  const cardVariantClass =
    status === "approved"
      ? "timeline-card timeline-card--approval-approved"
      : status === "rejected"
        ? "timeline-card timeline-card--approval-rejected"
        : "timeline-card timeline-card--approval";

  return (
    <article
      className={cardVariantClass}
      aria-busy={isSubmitting}
      aria-label={`Cartão de aprovação ${payload.approvalId}`}
    >
      <div className="card-meta-row">
        <div className="badge-group">
          {status === "pending" || status === "submitting" || status === "error" ? (
            <span className="status-badge status-badge--warning">
              <span aria-hidden="true">⚠</span>
              <span>[APROVAÇÃO NECESSÁRIA · HTTP 202]</span>
            </span>
          ) : status === "approved" ? (
            <span className="status-badge status-badge--success">
              <span aria-hidden="true">✓</span>
              <span>[APROVADO]</span>
            </span>
          ) : (
            <span className="status-badge status-badge--critical">
              <span aria-hidden="true">✕</span>
              <span>[NEGADO]</span>
            </span>
          )}

          <span className="trace-node-pill mono">action: {payload.action}</span>
          {payload.tool && (
            <span className="trace-node-pill mono">tool: {payload.tool}</span>
          )}
        </div>

        <div className="badge-group">
          <span className="mono">approvalId: {payload.approvalId}</span>
          <span className="mono">requestId: {payload.requestId}</span>
        </div>
      </div>

      <p>{payload.message}</p>

      {payload.reason && (
        <p className="header-subtitle">Motivo: {payload.reason}</p>
      )}

      {payload.args && Object.keys(payload.args).length > 0 && (
        <pre className="trace-code-block mono">
          <code>{JSON.stringify(payload.args, null, 2)}</code>
        </pre>
      )}

      {!isResolved && (
        <div className="approval-actions">
          <button
            type="button"
            className="btn btn--approve"
            disabled={isSubmitting}
            onClick={() => onDecide("approve")}
          >
            <span aria-hidden="true">✓</span>
            <span>{isSubmitting ? "Enviando..." : "Aprovar"}</span>
          </button>

          <button
            type="button"
            className="btn btn--reject"
            disabled={isSubmitting}
            onClick={() => onDecide("reject")}
          >
            <span aria-hidden="true">✕</span>
            <span>{isSubmitting ? "Enviando..." : "Negar"}</span>
          </button>
        </div>
      )}

      {resolutionError && (
        <div className="error-banner" role="alert">
          <span className="status-badge status-badge--critical">
            <span aria-hidden="true">✕</span>
            <span>[FALHA AO ENVIAR DECISÃO]</span>
          </span>
          <p>{resolutionError}</p>
        </div>
      )}

      {isResolved && resolutionAnswer && (
        <div className="field-group">
          <div className="card-meta-row">
            <strong>Resultado pós-decisão</strong>
            {resolutionMetrics && (
              <div className="badge-group mono telemetry-value">
                {resolutionMetrics.modelUsed && (
                  <span>model: {resolutionMetrics.modelUsed}</span>
                )}
                <span>latency: {formatLatencyMs(resolutionMetrics.latencyMs)}</span>
                <span>tokens: {formatTokenCount(resolutionMetrics.promptTokens)}</span>
              </div>
            )}
          </div>
          <p className="answer-body">{resolutionAnswer}</p>
        </div>
      )}

      {resolutionTrace && resolutionTrace.length > 0 ? (
        <TraceViewer trace={resolutionTrace} />
      ) : (
        payload.trace && payload.trace.length > 0 && (
          <TraceViewer trace={payload.trace} />
        )
      )}
    </article>
  );
}
