#!/usr/bin/env bash
# conversa-long.sh — Demonstração e medição de consumo de promptTokens em múltiplos turnos
# Uso: ./conversa-long.sh [URL_ENDPOINT]

set -e

ENDPOINT="${1:-http://localhost:3000/chat}"
USER_ID="plantonista-operacional"
CONVERSATION_ID=""

echo "=================================================================="
echo "      OpsPilot — Medição de Contexto & Tokens em Diálogo Longo    "
echo "=================================================================="
echo "Endpoint: $ENDPOINT"
echo "UserId:   $USER_ID"
echo ""

MESSAGES=(
  "Olá! Qual é o estado geral do plantão e dos serviços agora?"
  "Quais incidentes estão abertos e com qual severidade?"
  "Sou responsável pelo checkout e payment-api. O que tem para eles?"
  "Consulte o runbook do payment-api para verificar o procedimento."
)

for i in "${!MESSAGES[@]}"; do
  TURN=$((i + 1))
  MSG="${MESSAGES[$i]}"

  echo "------------------------------------------------------------------"
  echo "[Turno $TURN] Enviando:"
  echo "  \"$MSG\""
  echo "------------------------------------------------------------------"

  # Build JSON payload
  if [ -z "$CONVERSATION_ID" ]; then
    PAYLOAD=$(node -e "console.log(JSON.stringify({ message: process.argv[1], userId: process.argv[2] }))" "$MSG" "$USER_ID")
  else
    PAYLOAD=$(node -e "console.log(JSON.stringify({ message: process.argv[1], userId: process.argv[2], conversationId: process.argv[3] }))" "$MSG" "$USER_ID" "$CONVERSATION_ID")
  fi

  # Execute HTTP Request
  RESPONSE=$(curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" || true)

  if [ -z "$RESPONSE" ]; then
    echo "ERRO: O servidor não respondeu. Certifique-se de que 'npm run dev' está rodando em $ENDPOINT."
    exit 1
  fi

  # Parse JSON response using node
  PARSE_SCRIPT='
    try {
      const data = JSON.parse(process.argv[1]);
      if (data.error) {
        console.log("ERROR:" + data.error);
        process.exit(0);
      }
      console.log("CONV_ID:" + (data.conversationId || ""));
      console.log("PROMPT_TOKENS:" + (data.metrics?.promptTokens ?? "N/A"));
      console.log("COMPLETION_TOKENS:" + (data.metrics?.completionTokens ?? "N/A"));
      console.log("HISTORY_MSGS:" + (data.metrics?.historyMessages ?? 0));
      console.log("LATENCY:" + (data.metrics?.latencyMs ?? 0) + "ms");
      const cb = data.metrics?.contextBreakdown;
      if (cb) {
        console.log("BREAKDOWN: system=" + cb.system + ", history=" + cb.history + ", memories=" + cb.memories + ", user=" + cb.userMessage + " (total=" + cb.totalEstimated + ")");
      }
      const answerSnippet = (data.answer || "").replace(/\r?\n/g, " ").slice(0, 140);
      console.log("ANSWER:" + answerSnippet + (data.answer?.length > 140 ? "..." : ""));
    } catch (e) {
      console.log("PARSE_ERROR:" + e.message);
    }
  '

  PARSED=$(node -e "$PARSE_SCRIPT" "$RESPONSE")

  # Extract fields
  NEW_CONV_ID=$(echo "$PARSED" | grep '^CONV_ID:' | cut -d':' -f2-)
  PROMPT_TOKENS=$(echo "$PARSED" | grep '^PROMPT_TOKENS:' | cut -d':' -f2-)
  HISTORY_MSGS=$(echo "$PARSED" | grep '^HISTORY_MSGS:' | cut -d':' -f2-)
  LATENCY=$(echo "$PARSED" | grep '^LATENCY:' | cut -d':' -f2-)
  BREAKDOWN=$(echo "$PARSED" | grep '^BREAKDOWN:' | cut -d':' -f2-)
  ANSWER=$(echo "$PARSED" | grep '^ANSWER:' | cut -d':' -f2-)

  if [ -n "$NEW_CONV_ID" ]; then
    CONVERSATION_ID="$NEW_CONV_ID"
  fi

  echo "  Métricas por Turno:"
  echo "    * promptTokens:      $PROMPT_TOKENS"
  echo "    * historyMessages:   $HISTORY_MSGS"
  echo "    * latência:          $LATENCY"
  if [ -n "$BREAKDOWN" ]; then
    echo "    * contextBreakdown: $BREAKDOWN"
  fi
  echo ""
  echo "  Resposta do Assistente:"
  echo "    $ANSWER"
  echo ""
done

echo "=================================================================="
echo "                 Diálogo Finalizado com Sucesso                   "
echo "=================================================================="
