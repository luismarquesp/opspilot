export interface ServiceRecord {
  id: string;
  name: string;
  environment: string;
  status: "healthy" | "degraded" | "down";
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AlertRecord {
  id: string;
  serviceId: string;
  serviceName: string;
  title: string;
  severity: "info" | "warning" | "critical";
  status: "firing" | "resolved";
  description: string;
  triggeredAt: Date;
  resolvedAt: Date | null;
}

export interface IncidentRecord {
  id: string;
  title: string;
  service: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "investigating" | "resolved";
  summary: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
}

export interface RunbookRecord {
  serviceId: string;
  content: string;
}

export interface IOpsStore {
  listAlerts(status?: "firing" | "resolved" | "all"): Promise<AlertRecord[]> | AlertRecord[];
  getAlert(id: string): Promise<AlertRecord | null> | AlertRecord | null;
  listServices(): Promise<ServiceRecord[]> | ServiceRecord[];
  getService(id: string): Promise<ServiceRecord | null> | ServiceRecord | null;
  openIncident(input: {
    title: string;
    service: string;
    severity: "info" | "warning" | "critical";
  }): Promise<IncidentRecord> | IncidentRecord;
  resolveIncident(id: string): Promise<IncidentRecord | null> | IncidentRecord | null;
  listIncidents(status?: "open" | "resolved" | "all"): Promise<IncidentRecord[]> | IncidentRecord[];
  getRunbook(serviceId: string): Promise<RunbookRecord | null> | RunbookRecord | null;
  seed(services?: ServiceRecord[], alerts?: AlertRecord[]): Promise<void> | void;
  reset(): Promise<void> | void;
}

export const BASELINE_SERVICES: readonly ServiceRecord[] = [
  { id: "payment-api", name: "Payment API", environment: "production", status: "degraded" },
  { id: "auth-service", name: "Authentication Service", environment: "production", status: "healthy" },
  { id: "order-processor", name: "Order Processing Worker", environment: "production", status: "degraded" },
  { id: "database-cluster", name: "Primary Database Cluster", environment: "production", status: "degraded" },
  { id: "notification-hub", name: "Notification Dispatcher", environment: "production", status: "healthy" },
];

export const BASELINE_ALERTS: readonly AlertRecord[] = [
  {
    id: "alt-001",
    serviceId: "payment-api",
    serviceName: "payment-api",
    title: "High 5xx error rate (>15%) on /v1/charges",
    severity: "critical",
    status: "firing",
    description: "HTTP 500 error rate surged to 17.4% on /v1/charges",
    triggeredAt: new Date("2026-09-08T07:00:00.000Z"),
    resolvedAt: null,
  },
  {
    id: "alt-002",
    serviceId: "database-cluster",
    serviceName: "database-cluster",
    title: "Deadlock spike in transaction manager",
    severity: "critical",
    status: "firing",
    description: "Database deadlock rate exceeded threshold (42/min)",
    triggeredAt: new Date("2026-09-08T07:05:00.000Z"),
    resolvedAt: null,
  },
  {
    id: "alt-003",
    serviceId: "order-processor",
    serviceName: "order-processor",
    title: "Message queue depth backlog > 10,000",
    severity: "warning",
    status: "firing",
    description: "Order processing queue consumer lag is 12,450 messages",
    triggeredAt: new Date("2026-09-08T07:10:00.000Z"),
    resolvedAt: null,
  },
  {
    id: "alt-004",
    serviceId: "auth-service",
    serviceName: "auth-service",
    title: "Token validation latency p99 > 800ms",
    severity: "warning",
    status: "resolved",
    description: "JWT validation p99 spiked during cache restart, now normalized to 45ms",
    triggeredAt: new Date("2026-09-08T06:00:00.000Z"),
    resolvedAt: new Date("2026-09-08T06:25:00.000Z"),
  },
  {
    id: "alt-005",
    serviceId: "notification-hub",
    serviceName: "notification-hub",
    title: "Push notification rate limit reached",
    severity: "info",
    status: "resolved",
    description: "Apple APNS throttle encountered and recovered",
    triggeredAt: new Date("2026-09-08T05:30:00.000Z"),
    resolvedAt: new Date("2026-09-08T05:45:00.000Z"),
  },
  {
    id: "alt-006",
    serviceId: "payment-api",
    serviceName: "payment-api",
    title: "Stripe webhook delivery retry backlog",
    severity: "info",
    status: "resolved",
    description: "Webhook retries cleared after endpoint scale-up",
    triggeredAt: new Date("2026-09-08T04:15:00.000Z"),
    resolvedAt: new Date("2026-09-08T04:45:00.000Z"),
  },
];

export const BASELINE_RUNBOOKS: readonly RunbookRecord[] = [
  {
    serviceId: "order-processor",
    content: `# Checkout / Order Processor Runbook

## Sintomas
- Queue depth acima de 10.000 mensagens
- Consumer lag crescente
- Timeout nas APIs de checkout

## Diagnóstico
1. Verificar métricas da fila: \`kubectl top pod -l app=order-processor\`
2. Inspecionar logs de erro: \`kubectl logs -l app=order-processor --tail=200\`
3. Checar conexão com o banco: consultar status do serviço \`database-cluster\`

## Remediação
1. **Scale-up imediato**: \`kubectl scale deployment order-processor --replicas=6\`
2. **Limpar mensagens stuck**: reiniciar consumidores com \`kubectl rollout restart deployment/order-processor\`
3. **Priorizar fila**: se lag > 50k, ativar modo degradado (processar apenas pedidos críticos)
4. **Validar recovery**: monitorar consumer lag por 10 min após scale-up

## Rollback
- Reverter replicas: \`kubectl scale deployment order-processor --replicas=3\`
- Escalar banco se necessário: contatar DBA on-call

## Contatos
- On-call Engineering: #oncall-engineering (Slack)
- DBA: #db-oncall (Slack)`,
  },
  {
    serviceId: "payment-api",
    content: `# Payment API Runbook

## Sintomas
- Taxa de erro 5xx acima de 5% em /v1/charges
- Webhook retries acumulando
- Latência p99 > 2000ms

## Diagnóstico
1. Checar status do Stripe: https://status.stripe.com
2. Verificar logs de erro: \`kubectl logs -l app=payment-api --tail=500 | grep ERROR\`
3. Verificar dependência do banco: status do \`database-cluster\`
4. Inspecionar circuit breaker: dashboard de métricas do payment-api

## Remediação
1. **Circuit breaker aberto**: aguardar 60s e verificar se normaliza automaticamente
2. **Problema no banco**: escalar \`database-cluster\` ou ativar réplica de leitura
3. **Webhook backlog**: aumentar workers de webhook: \`kubectl scale deployment payment-webhook --replicas=4\`
4. **Rollback de deploy**: \`kubectl rollout undo deployment/payment-api\` se o problema coincide com deploy recente

## Runbook de Escalation
- Severity Critical: notificar CTO + responsável financeiro em até 5 min
- Impacto em produção: abrir bridge de incidente no Zoom

## Contatos
- Payment Team: #team-payments (Slack)
- Stripe Support: suporte@stripe.com (ticket urgente)`,
  },
  {
    serviceId: "auth-service",
    content: `# Auth Service Runbook

## Sintomas
- Latência de validação de token p99 > 500ms
- Erros de autenticação em cascata em outros serviços
- Cache hit rate abaixo de 80%

## Diagnóstico
1. Verificar status do cache Redis: \`redis-cli -h auth-cache ping\`
2. Inspecionar logs: \`kubectl logs -l app=auth-service --tail=200\`
3. Verificar métricas JWT: dashboard Grafana > Auth Service > Token Validation
4. Checar expiração de certificados: \`kubectl get secret auth-tls -o yaml\`

## Remediação
1. **Cache frio após restart**: aguardar 3-5 min para warm-up automático; latência deve normalizar
2. **Cache indisponível**: \`kubectl rollout restart deployment/auth-cache\`; monitorar reconexão
3. **Alta carga**: \`kubectl scale deployment auth-service --replicas=4\`
4. **Certificado expirado**: renovar via cert-manager: \`kubectl annotate cert auth-tls cert-manager.io/force-renew=true\`

## Impacto em Outros Serviços
- Todos os serviços com autenticação serão afetados
- Prioridade: restaurar auth-service antes de qualquer outro

## Contatos
- Auth Team: #team-auth (Slack)
- Security On-call: #security-oncall (Slack) — obrigatório se suspeita de comprometimento`,
  },
];

import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.cwd(), "data");
export const SEED_FILE = path.join(DATA_DIR, "seed.json");

export interface StoreDataPayload {
  services: ServiceRecord[];
  alerts: AlertRecord[];
  incidents: IncidentRecord[];
}

export class InMemoryOpsStore implements IOpsStore {
  private services = new Map<string, ServiceRecord>();
  private alerts = new Map<string, AlertRecord>();
  private incidents = new Map<string, IncidentRecord>();
  private incidentCounter = 100;
  private filePath: string | null = null;

  constructor(autoSeed = true, jsonFilePath: string | null = null) {
    this.filePath = jsonFilePath;
    if (this.filePath && fs.existsSync(this.filePath)) {
      this.loadFromFile();
    } else if (autoSeed) {
      this.seed();
    }
  }

  private loadFromFile(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const data: StoreDataPayload = JSON.parse(raw);
      this.services.clear();
      this.alerts.clear();
      this.incidents.clear();

      for (const s of data.services ?? []) {
        this.services.set(s.id, {
          ...s,
          createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
          updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
        });
      }

      for (const a of data.alerts ?? []) {
        this.alerts.set(a.id, {
          ...a,
          triggeredAt: new Date(a.triggeredAt),
          resolvedAt: a.resolvedAt ? new Date(a.resolvedAt) : null,
        });
      }

      for (const inc of data.incidents ?? []) {
        this.incidents.set(inc.id, {
          ...inc,
          openedAt: new Date(inc.openedAt),
          resolvedAt: inc.resolvedAt ? new Date(inc.resolvedAt) : null,
        });
        const num = parseInt(inc.id.replace("inc-", ""), 10);
        if (!isNaN(num) && num > this.incidentCounter) {
          this.incidentCounter = num;
        }
      }
    } catch {
      // Fallback if parsing fails
      this.seed();
    }
  }

  public saveToFile(): void {
    if (!this.filePath) return;
    try {
      if (!fs.existsSync(path.dirname(this.filePath))) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      }
      const payload: StoreDataPayload = {
        services: Array.from(this.services.values()),
        alerts: Array.from(this.alerts.values()),
        incidents: Array.from(this.incidents.values()),
      };
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf-8");
    } catch {
      // Silent in environments where file writing might be constrained
    }
  }

  seed(services = BASELINE_SERVICES, alerts = BASELINE_ALERTS): void {
    this.services.clear();
    this.alerts.clear();
    this.incidents.clear();
    for (const s of services) {
      this.services.set(s.id, { ...s, createdAt: new Date(), updatedAt: new Date() });
    }
    for (const a of alerts) {
      this.alerts.set(a.id, { ...a });
    }
    this.saveToFile();
  }

  reset(): void {
    this.services.clear();
    this.alerts.clear();
    this.incidents.clear();
    this.incidentCounter = 100;
    this.saveToFile();
  }

  listAlerts(status: "firing" | "resolved" | "all" = "firing"): AlertRecord[] {
    const all = Array.from(this.alerts.values());
    if (status === "all") return all;
    return all.filter((a) => a.status === status);
  }

  getAlert(id: string): AlertRecord | null {
    return this.alerts.get(id) ?? null;
  }

  listServices(): ServiceRecord[] {
    return Array.from(this.services.values());
  }

  getService(id: string): ServiceRecord | null {
    return this.services.get(id) ?? null;
  }

  openIncident(input: {
    title: string;
    service: string;
    severity: "info" | "warning" | "critical";
  }): IncidentRecord {
    this.incidentCounter++;
    const id = `inc-${this.incidentCounter}`;
    const incident: IncidentRecord = {
      id,
      title: input.title,
      service: input.service,
      severity: input.severity,
      status: "open",
      summary: null,
      openedAt: new Date(),
      resolvedAt: null,
    };
    this.incidents.set(id, incident);
    this.saveToFile();
    return incident;
  }

  resolveIncident(id: string): IncidentRecord | null {
    const inc = this.incidents.get(id);
    if (!inc) return null;
    inc.status = "resolved";
    inc.resolvedAt = new Date();
    this.incidents.set(id, inc);
    this.saveToFile();
    return inc;
  }

  listIncidents(status: "open" | "resolved" | "all" = "open"): IncidentRecord[] {
    const all = Array.from(this.incidents.values());
    if (status === "all") return all;
    if (status === "resolved") return all.filter((i) => i.status === "resolved");
    // "open" includes both "open" and "investigating" (active states)
    return all.filter((i) => i.status === "open" || i.status === "investigating");
  }

  getRunbook(serviceId: string): RunbookRecord | null {
    return BASELINE_RUNBOOKS.find((r) => r.serviceId === serviceId) ?? null;
  }
}

export const defaultStore: IOpsStore = new InMemoryOpsStore(true, SEED_FILE);
