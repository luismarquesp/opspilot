import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiConfigModal } from "./components/ApiConfigModal.js";
import { ChatTimeline } from "./components/ChatTimeline.js";
import { Header } from "./components/Header.js";
import { StatsStrip } from "./components/StatsStrip.js";
import {
  fetchStatsSummary,
  sendChatMessage,
  submitApprovalDecision,
} from "./lib/api.js";
import { loadWarRoomSettings, saveWarRoomSettings } from "./lib/url.js";
import type {
  ApprovalDecision,
  ChatTimelineItem,
  StatsSummaryView,
  StrategyName,
  WarRoomSettings,
} from "./types/war-room.js";

function nextItemId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function App() {
  const [settings, setSettings] = useState<WarRoomSettings>(() =>
    loadWarRoomSettings()
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [conversationId, setConversationId] = useState<string | undefined>(
    undefined
  );
  const [timeline, setTimeline] = useState<ChatTimelineItem[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [strategyInput, setStrategyInput] = useState<StrategyName | "">("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const [stats, setStats] = useState<StatsSummaryView | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const refreshStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await fetchStatsSummary(settings.apiUrl, "24h");
      setStats(data);
    } catch (err) {
      setStatsError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar métricas em /stats?since=24h."
      );
    } finally {
      setStatsLoading(false);
    }
  }, [settings.apiUrl]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const handleSaveSettings = (nextSettings: WarRoomSettings) => {
    const persisted = saveWarRoomSettings(nextSettings);
    setSettings(persisted);
  };

  const handleToggleTheme = () => {
    const nextTheme = settings.theme === "dark" ? "light" : "dark";
    const persisted = saveWarRoomSettings({
      ...settings,
      theme: nextTheme,
    });
    setSettings(persisted);
  };

  const dispatchPrompt = async (
    rawMessage: string,
    selectedStrategy?: StrategyName,
    gateWith202?: boolean
  ) => {
    const trimmed = rawMessage.trim();
    if (!trimmed) {
      setComposerError("Digite uma mensagem ou comando operacional antes de enviar.");
      return;
    }

    setComposerError(null);
    setIsSending(true);

    const userItem: ChatTimelineItem = {
      kind: "user",
      id: nextItemId("usr"),
      message: trimmed,
      strategy: selectedStrategy,
      requireApproval: gateWith202,
      timestamp: Date.now(),
    };
    setTimeline((prev) => [...prev, userItem]);

    const parsed = await sendChatMessage({
      apiUrl: settings.apiUrl,
      message: trimmed,
      conversationId,
      strategy: selectedStrategy,
      requireApproval: gateWith202,
    });

    if (parsed.kind === "success") {
      if (parsed.data.conversationId) {
        setConversationId(parsed.data.conversationId);
      }
      setTimeline((prev) => [
        ...prev,
        {
          kind: "assistant",
          id: nextItemId("ast"),
          requestId: parsed.data.requestId,
          conversationId: parsed.data.conversationId,
          answer: parsed.data.answer,
          selectedRoute: parsed.data.selectedRoute,
          routeReason: parsed.data.routeReason,
          trace: parsed.data.trace,
          metrics: parsed.data.metrics,
          timestamp: Date.now(),
        },
      ]);
      void refreshStats();
    } else if (parsed.kind === "pending_approval") {
      if (parsed.data.conversationId) {
        setConversationId(parsed.data.conversationId);
      }
      setTimeline((prev) => [
        ...prev,
        {
          kind: "approval",
          id: nextItemId("apr"),
          requestId: parsed.data.requestId,
          conversationId: parsed.data.conversationId,
          originalMessage: trimmed,
          payload: parsed.data,
          approvalStatus: "pending",
          timestamp: Date.now(),
        },
      ]);
    } else {
      setTimeline((prev) => [
        ...prev,
        {
          kind: "error",
          id: nextItemId("err"),
          statusCode: parsed.statusCode,
          errorCode: parsed.errorCode,
          message: parsed.message,
          requestId: parsed.requestId,
          retryMessage: trimmed,
          retryStrategy: selectedStrategy,
          retryRequireApproval: gateWith202,
          timestamp: Date.now(),
        },
      ]);
      void refreshStats();
    }

    setIsSending(false);
  };

  const handleComposerSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSending) return;

    const currentText = messageInput;
    if (!currentText.trim()) {
      setComposerError("Digite uma mensagem ou comando operacional antes de enviar.");
      return;
    }

    setMessageInput("");
    await dispatchPrompt(
      currentText,
      strategyInput === "" ? undefined : strategyInput,
      requireApproval
    );
  };

  const handleQuickPrompt = async (prompt: string, gate202 = false) => {
    if (isSending) return;
    await dispatchPrompt(
      prompt,
      strategyInput === "" ? undefined : strategyInput,
      gate202
    );
  };

  const handleApproveDecision = async (
    itemId: string,
    decision: ApprovalDecision
  ) => {
    const target = timeline.find(
      (item): item is Extract<ChatTimelineItem, { kind: "approval" }> =>
        item.kind === "approval" && item.id === itemId
    );
    if (!target || target.approvalStatus === "submitting") {
      return;
    }

    setTimeline((prev) =>
      prev.map((item) =>
        item.kind === "approval" && item.id === itemId
          ? { ...item, approvalStatus: "submitting", resolutionError: undefined }
          : item
      )
    );

    const parsed = await submitApprovalDecision({
      apiUrl: settings.apiUrl,
      approvalId: target.payload.approvalId,
      conversationId: target.conversationId || target.payload.conversationId,
      message: target.originalMessage,
      decision,
      action: target.payload.action,
      tool: target.payload.tool,
      args: target.payload.args,
    });

    if (parsed.kind === "success") {
      if (parsed.data.conversationId) {
        setConversationId(parsed.data.conversationId);
      }
      setTimeline((prev) =>
        prev.map((item) =>
          item.kind === "approval" && item.id === itemId
            ? {
                ...item,
                approvalStatus: decision === "approve" ? "approved" : "rejected",
                resolutionAnswer: parsed.data.answer,
                resolutionTrace: parsed.data.trace,
                resolutionMetrics: parsed.data.metrics,
                resolutionError: undefined,
              }
            : item
        )
      );
      void refreshStats();
    } else if (parsed.kind === "error") {
      setTimeline((prev) =>
        prev.map((item) =>
          item.kind === "approval" && item.id === itemId
            ? {
                ...item,
                approvalStatus: "error",
                resolutionError: `${parsed.message}${
                  parsed.requestId ? ` (requestId: ${parsed.requestId})` : ""
                }`,
              }
            : item
        )
      );
    }
  };

  const handleRetryError = async (
    item: Extract<ChatTimelineItem, { kind: "error" }>
  ) => {
    if (!item.retryMessage || isSending) return;
    await dispatchPrompt(
      item.retryMessage,
      item.retryStrategy,
      item.retryRequireApproval
    );
  };

  return (
    <div className="war-room-shell">
      <Header
        apiUrl={settings.apiUrl}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="war-room-main">
        <StatsStrip
          stats={stats}
          loading={statsLoading}
          error={statsError}
          onRefresh={() => void refreshStats()}
        />

        <ChatTimeline
          items={timeline}
          onQuickPrompt={(prompt, gate202) => void handleQuickPrompt(prompt, gate202)}
          onApproveDecision={(itemId, decision) =>
            void handleApproveDecision(itemId, decision)
          }
          onRetryError={(item) => void handleRetryError(item)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <form className="composer-form" onSubmit={(e) => void handleComposerSubmit(e)} noValidate>
          <div className="field-group">
            <label htmlFor="war-room-prompt" className="field-label">
              Comando ou pergunta para <code className="mono">/chat</code>
              {conversationId && (
                <span className="mono"> · conversa: {conversationId}</span>
              )}
            </label>
            <textarea
              id="war-room-prompt"
              className="textarea-input"
              rows={3}
              placeholder="Descreva o incidente, consulte alertas ou solicite mitigação..."
              value={messageInput}
              aria-invalid={composerError ? "true" : "false"}
              aria-describedby={composerError ? "composer-error" : undefined}
              onChange={(e) => {
                setMessageInput(e.target.value);
                if (composerError && e.target.value.trim().length > 0) {
                  setComposerError(null);
                }
              }}
            />
            {composerError && (
              <span id="composer-error" className="inline-error" role="alert">
                {composerError}
              </span>
            )}
          </div>

          <div className="composer-controls">
            <div className="composer-options">
              <div className="field-group">
                <label htmlFor="war-room-strategy" className="field-label">
                  Estratégia
                </label>
                <select
                  id="war-room-strategy"
                  className="select-input"
                  value={strategyInput}
                  onChange={(e) =>
                    setStrategyInput(e.target.value as StrategyName | "")
                  }
                >
                  <option value="">Automática (Router)</option>
                  <option value="react">react</option>
                  <option value="plan-and-execute">plan-and-execute</option>
                  <option value="reflection">reflection</option>
                </select>
              </div>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                />
                <span>Exigir aprovação humana (HTTP 202)</span>
              </label>
            </div>

            <button
              type="submit"
              className="btn btn--primary"
              disabled={isSending}
            >
              {isSending ? "Executando..." : "Enviar para /chat"}
            </button>
          </div>
        </form>
      </main>

      <ApiConfigModal
        open={settingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
