# Contract: Operational Incident Management Tools

All operational tools are exposed to LangChain/LangGraph agents and enforce strict Zod schemas for input validation and output formatting.

## 1. `list_alerts`

Retrieves alerts filtered by status.

### Input Schema
```typescript
import { z } from 'zod';

export const ListAlertsInputSchema = z.object({
  status: z
    .enum(['firing', 'resolved', 'all'])
    .default('firing')
    .describe('Filter alerts by operational status: "firing", "resolved", or "all"'),
});

export type ListAlertsInput = z.infer<typeof ListAlertsInputSchema>;
```

### Output Format
```json
[
  {
    "id": "alt-001",
    "serviceName": "payment-api",
    "title": "High 5xx error rate (>15%) on /v1/charges",
    "severity": "critical",
    "status": "firing",
    "triggeredAt": "2026-09-08T07:00:00.000Z"
  }
]
```

---

## 2. `open_incident`

Creates a new tracked production incident.

### Input Schema
```typescript
export const OpenIncidentInputSchema = z.object({
  title: z.string().min(5).describe('Concise title summarizing the incident'),
  service: z.string().min(1).describe('Target service identifier or name'),
  severity: z
    .enum(['info', 'warning', 'critical'])
    .describe('Operational severity level'),
});

export type OpenIncidentInput = z.infer<typeof OpenIncidentInputSchema>;
```

### Output Format
```json
{
  "id": "inc-101",
  "title": "Payment API 5xx outage",
  "service": "payment-api",
  "severity": "critical",
  "status": "open",
  "openedAt": "2026-09-08T07:30:00.000Z"
}
```

---

## 3. `resolve_incident`

Marks an open incident as resolved.

### Input Schema
```typescript
export const ResolveIncidentInputSchema = z.object({
  id: z.string().min(1).describe('Unique ID of the incident to resolve'),
});

export type ResolveIncidentInput = z.infer<typeof ResolveIncidentInputSchema>;
```

### Output Format
```json
{
  "id": "inc-101",
  "status": "resolved",
  "resolvedAt": "2026-09-08T07:35:00.000Z",
  "message": "Incident inc-101 has been successfully resolved."
}
```
If the incident is not found:
```json
{
  "error": "Incident inc-999 not found"
}
```
