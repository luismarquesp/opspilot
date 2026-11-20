import { formatCostUsd, formatLatencyMs } from "../lib/trace.js";
import type { StatsSummaryView } from "../types/war-room.js";

export interface StatsStripProps {
  stats: StatsSummaryView | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function StatsStrip({ stats, loading, error, onRefresh }: StatsStripProps) {
  return (
    <section
      className="stats-strip"
      aria-label="Métricas operacionais das últimas 24 horas"
      aria-live="polite"
    >
      <div className="stats-strip-header">
        <div className="badge-group">
          <h2>Telemetria (24h)</h2>
          <span className="status-badge status-badge--info">
            <span aria-hidden="true">●</span>
            <span>GET /stats?since=24h</span>
          </span>
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={onRefresh}
          disabled={loading}
        >
          <span aria-hidden="true">↻</span>
          <span>{loading ? "Atualizando..." : "Atualizar métricas"}</span>
        </button>
      </div>

      {error ? (
        <div className="error-banner" role="alert">
          <div className="badge-group">
            <span className="status-badge status-badge--critical">
              <span aria-hidden="true">✕</span>
              <span>[STATS INDISPONÍVEL]</span>
            </span>
            <span>{error}</span>
          </div>
          <div className="error-actions">
            <button type="button" className="btn" onClick={onRefresh}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : !stats || stats.total === 0 ? (
        <div className="empty-state empty-state--compact">
          <span className="empty-state-icon" aria-hidden="true">
            📊
          </span>
          <h3>Nenhuma requisição registrada nas últimas 24h</h3>
          <p className="empty-state-subtitle">
            Envie sua primeira consulta no War Room abaixo para iniciar a coleta de
            latência (<code className="mono">p50</code>/<code className="mono">p95</code>) e custos.
          </p>
        </div>
      ) : (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Requisições</span>
            <span className="stat-value telemetry-value">{stats.total}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Erros</span>
            <span
              className={`stat-value telemetry-value ${
                stats.errors > 0 ? "stat-value--critical" : "stat-value--ok"
              }`}
            >
              {stats.errors}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Latência p50</span>
            <span className="stat-value telemetry-value">
              {formatLatencyMs(stats.p50)}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Latência p95</span>
            <span className="stat-value telemetry-value">
              {formatLatencyMs(stats.p95)}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Custo Estimado</span>
            <span className="stat-value telemetry-value">
              {formatCostUsd(stats.cost)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
