import { useEffect, useRef, useState, type FormEvent } from "react";
import { DEFAULT_API_URL, isValidApiUrl, normalizeApiUrl } from "../lib/url.js";
import type { WarRoomSettings } from "../types/war-room.js";

export interface ApiConfigModalProps {
  open: boolean;
  settings: WarRoomSettings;
  onSave: (nextSettings: WarRoomSettings) => void;
  onClose: () => void;
}

export function ApiConfigModal({
  open,
  settings,
  onSave,
  onClose,
}: ApiConfigModalProps) {
  const [apiUrlInput, setApiUrlInput] = useState(settings.apiUrl);
  const [themeInput, setThemeInput] = useState<"dark" | "light">(settings.theme);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setApiUrlInput(settings.apiUrl);
      setThemeInput(settings.theme);
      setError(null);
      inputRef.current?.focus();
    }
  }, [open, settings.apiUrl, settings.theme]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValidApiUrl(apiUrlInput)) {
      setError("Informe uma URL HTTP ou HTTPS válida (ex.: http://localhost:3000).");
      inputRef.current?.focus();
      return;
    }

    onSave({
      apiUrl: normalizeApiUrl(apiUrlInput),
      theme: themeInput,
    });
    onClose();
  };

  const handleResetDefault = () => {
    setApiUrlInput(DEFAULT_API_URL);
    setError(null);
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-config-title"
      >
        <div className="modal-header">
          <h2 id="api-config-title">Configurações do War Room</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar configurações"
            onClick={onClose}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <form className="field-group" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="war-room-api-url" className="field-label">
              URL base da API OpsPilot
            </label>
            <input
              ref={inputRef}
              id="war-room-api-url"
              type="url"
              className="text-input mono"
              value={apiUrlInput}
              placeholder="http://localhost:3000"
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "api-url-error api-url-hint" : "api-url-hint"}
              onChange={(e) => {
                setApiUrlInput(e.target.value);
                if (error && isValidApiUrl(e.target.value)) {
                  setError(null);
                }
              }}
            />
            <span id="api-url-hint" className="header-subtitle">
              Barras finais são removidas automaticamente e o valor persiste em{" "}
              <code className="mono">localStorage</code>.
            </span>
            {error && (
              <span id="api-url-error" className="inline-error" role="alert">
                {error}
              </span>
            )}
          </div>

          <div className="field-group">
            <label htmlFor="war-room-theme-select" className="field-label">
              Tema visual
            </label>
            <select
              id="war-room-theme-select"
              className="select-input"
              value={themeInput}
              onChange={(e) =>
                setThemeInput(e.target.value === "light" ? "light" : "dark")
              }
            >
              <option value="dark">Escuro (Dark-first de plantão)</option>
              <option value="light">Claro (High-contrast daylight)</option>
            </select>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={handleResetDefault}>
              Restaurar padrão
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary">
              Salvar configurações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
