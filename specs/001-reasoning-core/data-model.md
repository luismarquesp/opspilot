# Phase 1 Data Model: OpsPilot Reasoning Core

**Feature**: OpsPilot Reasoning Core (`001-reasoning-core`)  
**Date**: 2026-09-08  
**Status**: Draft  

## 1. Core Domain & Persistence Entities

### Service
Represents a managed microservice or component within the operational landscape.

- **Fields**:
  - `id`: `string` (UUID v4 or slug like `payment-service`, Primary Key)
  - `name`: `string` (Human-readable name, e.g. `Payment Gateway`)
  - `environment`: `string` (e.g. `production`, `staging`)
  - `status`: `'healthy' | 'degraded' | 'down'`
  - `createdAt`: `Date` (ISO 8601)
  - `updatedAt`: `Date` (ISO 8601)
- **Relationships**:
  - Has many `Alert` entities (`serviceId`).
  - Has many `Incident` entities (`serviceId`).

### Alert
Represents a monitoring system trigger/alarm for a given service.

- **Fields**:
  - `id`: `string` (Primary Key, e.g. `alt-001`)
  - `serviceId`: `string` (Foreign Key -> `Service.id`)
  - `serviceName`: `string` (Denormalized service name for fast tool inspection)
  - `title`: `string` (Short summary of the alert condition)
  - `severity`: `'info' | 'warning' | 'critical'`
  - `status`: `'firing' | 'resolved'`
  - `description`: `string` (Detailed metric anomaly, threshold breach, or log trace)
  - `triggeredAt`: `Date` (ISO 8601)
  - `resolvedAt`: `Date | null` (ISO 8601 or null when firing)
- **Validation Rules**:
  - `status` MUST be either `'firing'` or `'resolved'`.
  - `severity` MUST be one of `'info'`, `'warning'`, `'critical'`.

### Incident
Represents a formal tracked production incident created in response to alerts or outages.

- **Fields**:
  - `id`: `string` (Primary Key, e.g. `inc-101`)
  - `title`: `string` (Descriptive incident summary)
  - `service`: `string` (Service identifier or name)
  - `severity`: `'info' | 'warning' | 'critical'`
  - `status`: `'open' | 'investigating' | 'resolved'`
  - `summary`: `string | null` (Agent synthesis or mitigation notes)
  - `openedAt`: `Date` (ISO 8601)
  - `resolvedAt`: `Date | null` (ISO 8601)
- **Validation Rules**:
  - `title` MUST NOT be empty.
  - `service` MUST NOT be empty.

---

## 2. Telemetry & Reasoning State Entities

### TraceEvent
A typed event record capturing a single discrete step in the agent's thought process.

```typescript
export type TraceEventType =
  | 'thought'
  | 'action'
  | 'observation'
  | 'plan'
  | 'critique'
  | 'answer';

export interface BaseTraceEvent {
  type: TraceEventType;
  content: string;
  timestamp: number;
}

export interface ActionTraceEvent extends BaseTraceEvent {
  type: 'action';
  tool: string;
  args: Record<string, unknown>;
}

export type TraceEvent = BaseTraceEvent | ActionTraceEvent;
```

### StrategyMetrics
Performance and consumption metrics for a reasoning execution.

```typescript
export interface StrategyMetrics {
  llmCalls: number;
  latencyMs: number;
}
```

### PlanExecuteState (LangGraph Internal State)
Graph state for Plan-and-Execute reasoning strategy.

```typescript
export interface PlanExecuteState {
  input: string;
  plan: string[];
  pastSteps: Array<[step: string, result: string]>;
  response?: string;
  stepCount: number;
}
```

---

## 3. Seed Baseline Data Specification

The primary seed populates exactly 5 services and 6 alerts (3 firing, 3 resolved):

### Services (5):
1. `payment-api` ("Payment API", production, degraded)
2. `auth-service` ("Authentication Service", production, healthy)
3. `order-processor` ("Order Processing Worker", production, degraded)
4. `database-cluster` ("Primary MySQL Cluster", production, degraded)
5. `notification-hub` ("Notification Dispatcher", production, healthy)

### Alerts (6):
1. **Firing**: `alt-001` | Service: `payment-api` | Severity: `critical` | Title: `High 5xx error rate (>15%) on /v1/charges`
2. **Firing**: `alt-002` | Service: `database-cluster` | Severity: `critical` | Title: `Deadlock spike in transaction manager`
3. **Firing**: `alt-003` | Service: `order-processor` | Severity: `warning` | Title: `Message queue depth backlog > 10,000`
4. **Resolved**: `alt-004` | Service: `auth-service` | Severity: `warning` | Title: `Token validation latency p99 > 800ms`
5. **Resolved**: `alt-005` | Service: `notification-hub` | Severity: `info` | Title: `Push notification rate limit reached`
6. **Resolved**: `alt-006` | Service: `payment-api` | Severity: `info` | Title: `Stripe webhook delivery retry backlog`
