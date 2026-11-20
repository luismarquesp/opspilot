param(
    [string]$Endpoint = "http://localhost:3000/chat"
)

$ErrorActionPreference = "Stop"
$UserId = "plantonista-operacional"
$ConversationId = ""

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "      OpsPilot - Medicao de Contexto e Tokens em Dialogo Longo    " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "Endpoint: $Endpoint"
Write-Host "UserId:   $UserId"
Write-Host ""

$Messages = @(
    "Ola! Qual e o estado geral do plantao e dos servicos agora?",
    "Quais incidentes estao abertos e com qual severidade?",
    "Sou responsavel pelo checkout e payment-api. O que tem para eles?",
    "Consulte o runbook do payment-api para verificar o procedimento."
)

for ($i = 0; $i -lt $Messages.Count; $i++) {
    $Turn = $i + 1
    $Msg = $Messages[$i]

    Write-Host "------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "[Turno $Turn] Enviando:" -ForegroundColor Yellow
    Write-Host "  `"$Msg`""
    Write-Host "------------------------------------------------------------------" -ForegroundColor DarkGray

    $BodyObj = @{
        message = $Msg
        userId  = $UserId
    }
    if ($ConversationId -ne "") {
        $BodyObj["conversationId"] = $ConversationId
    }
    $BodyJson = [System.Text.Encoding]::UTF8.GetBytes(($BodyObj | ConvertTo-Json -Compress))

    try {
        $Response = Invoke-RestMethod -Uri $Endpoint -Method POST -ContentType "application/json; charset=utf-8" -Body $BodyJson
    } catch {
        Write-Host "ERRO: O servidor nao respondeu. Certifique-se de que 'npm run dev' esta rodando em $Endpoint." -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        break
    }

    if ($Response.conversationId) {
        $ConversationId = $Response.conversationId
    }

    $promptTokens = if ($null -ne $Response.metrics.promptTokens) { $Response.metrics.promptTokens } else { "N/A" }
    $historyMsgs  = if ($null -ne $Response.metrics.historyMessages) { $Response.metrics.historyMessages } else { 0 }
    $latency      = if ($null -ne $Response.metrics.latencyMs) { "$($Response.metrics.latencyMs)ms" } else { "0ms" }

    Write-Host "  Metricas por Turno:" -ForegroundColor Green
    Write-Host "    * promptTokens:      $promptTokens"
    Write-Host "    * historyMessages:   $historyMsgs"
    Write-Host "    * latencia:          $latency"

    if ($Response.metrics.contextBreakdown) {
        $cb = $Response.metrics.contextBreakdown
        $summaryPart = if ($null -ne $cb.summary) { ", summary=$($cb.summary)" } else { "" }
        Write-Host "    * contextBreakdown: system=$($cb.system), history=$($cb.history)$summaryPart, memories=$($cb.memories), user=$($cb.userMessage) (total=$($cb.totalEstimated))"
    }

    $snippet = ""
    if ($Response.answer) {
        $clean = [regex]::Replace($Response.answer, "[\r\n]+", " ")
        if ($clean.Length -gt 140) {
            $snippet = $clean.Substring(0, 140) + "..."
        } else {
            $snippet = $clean
        }
    }

    Write-Host ""
    Write-Host "  Resposta do Assistente:" -ForegroundColor White
    Write-Host "    $snippet"
    Write-Host ""
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "                 Dialogo Finalizado com Sucesso                   " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
