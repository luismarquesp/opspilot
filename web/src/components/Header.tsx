export interface HeaderProps {
  apiUrl: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export function Header({
  apiUrl,
  theme,
  onToggleTheme,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="war-room-header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-logo" aria-hidden="true">
            OP
          </div>
          <div>
            <h1>OpsPilot War Room</h1>
            <p className="header-subtitle">
              Copiloto autônomo de plantão · Base <code className="mono">/opspilot/</code>
            </p>
          </div>
        </div>

        <div className="header-controls">
          <span className="api-pill mono" title={`API ativa: ${apiUrl}`}>
            <span aria-hidden="true">●</span>
            <span>API: {apiUrl}</span>
          </span>

          <button
            type="button"
            className="icon-btn"
            aria-label={
              theme === "dark"
                ? "Alternar para tema claro"
                : "Alternar para tema escuro"
            }
            onClick={onToggleTheme}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
            <span>{theme === "dark" ? "Claro" : "Escuro"}</span>
          </button>

          <button
            type="button"
            className="icon-btn"
            aria-label="Configurações da API"
            onClick={onOpenSettings}
          >
            <span aria-hidden="true">⚙</span>
            <span>API URL</span>
          </button>
        </div>
      </div>
    </header>
  );
}
