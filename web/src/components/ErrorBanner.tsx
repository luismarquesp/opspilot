import { useState } from "react";

export interface ErrorBannerProps {
  statusCode: number;
  errorCode: string;
  message: string;
  requestId?: string;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

export function ErrorBanner({
  statusCode,
  errorCode,
  message,
  requestId,
  onRetry,
  onOpenSettings,
}: ErrorBannerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyRequestId = async () => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in non-HTTPS contexts
    }
  };

  return (
    <div className="error-banner" role="alert">
      <div className="card-meta-row">
        <div className="badge-group">
          <span className="status-badge status-badge--critical">
            <span aria-hidden="true">✕</span>
            <span>
              [ERRO {statusCode > 0 ? `HTTP ${statusCode}` : "CONEXÃO"} · {errorCode}]
            </span>
          </span>
        </div>

        {requestId && (
          <div className="badge-group">
            <span className="mono">X-Request-Id: {requestId}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Copiar requestId ${requestId}`}
              onClick={handleCopyRequestId}
            >
              <span aria-hidden="true">⧉</span>
              <span>{copied ? "Copiado" : "Copiar ID"}</span>
            </button>
          </div>
        )}
      </div>

      <p>{message}</p>

      <div className="error-actions">
        {onRetry && (
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Tentar novamente
          </button>
        )}
        {onOpenSettings && (
          <button type="button" className="btn" onClick={onOpenSettings}>
            ⚙ Verificar URL da API
          </button>
        )}
      </div>
    </div>
  );
}
