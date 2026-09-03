# STS Core state contracts

Date: 2026-08-30

Status: **IMPLEMENTED locally**, **TESTED with local unit tests**. The database
migration is **not applied** and the firmware changes are **not hardware-validated**.

## Independent dimensions

The Core never collapses these dimensions into one ambiguous status:

| Dimension | Meaning | Values |
|---|---|---|
| Operational State | Condition of the monitored process | `NORMAL`, `WARNING`, `CRITICAL`, `UNKNOWN` |
| Component Health | Evidence about internal component health | `HEALTHY`, `DEGRADED`, `FAULT`, `UNKNOWN` |
| Communication State | Availability and quality of communication | `ONLINE`, `DEGRADED`, `OFFLINE`, `UNKNOWN` |
| Maintenance State | Technical intervention lifecycle | `ACTIVE`, `INACTIVE` |

`Operational=CRITICAL`, `Component=HEALTHY`, `Communication=ONLINE` and
`Maintenance=INACTIVE` is valid: the monitored process is unsafe while the STS
equipment itself is healthy and communicating.

## Diagnostic confidence

Every normalized component observation identifies the strength of its evidence:

- `CONFIRMED`: a dedicated feedback/test path confirms the relevant outcome.
- `OBSERVED`: a real runtime signal was observed, but may cover only part of the component.
- `INFERRED`: state is derived indirectly from related evidence.
- `UNKNOWN`: evidence is insufficient.

`diagnostic_scope` explains what was actually tested. A successful TFT initialization,
for example, is `OBSERVED` with scope `interface_initialization_only`; it does not
confirm pixels, backlight or visible output.

## Cold component adapter

| Component | Evidence | Mapping |
|---|---|---|
| DHT22 (interior do dispositivo) | Successful/failed reads and consecutive errors | Healthy, degraded or fault; observed; diagnostic only |
| SHT30 (ambiente monitorizado) | Successful/failed I²C reads and consecutive errors | Healthy, degraded or fault; observed; critical to Cold operation |
| TFT | Interface initialization only | Unknown physical health; interface evidence observed |
| RGB button | Pin configuration only | Unknown |
| Buzzer | Command/configuration only; no acoustic feedback | Unknown |
| Offline queue | Filesystem/queue initialization and I/O | Healthy or fault; observed |
| Runtime memory | Free-heap measurement | Healthy or degraded; observed |
| Wi-Fi/backend | Transport metrics, RSSI, requests and responses | Communication State, not hardware health |

The legacy `ok` field remains in compatibility payloads. Core consumers prioritize
`health_state`; they never convert configured-only evidence into `HEALTHY`.

## Component Health persistence

- `device_components`: stable generic component registry.
- `component_health_events`: append-only observations with state, confidence,
  source, scope, counters, timestamps and evidence.
- Existing `hardware_diagnostics` remains accepted as the Cold compatibility input.

Unknown components do not automatically make a diagnosed component faulty. Summary
logic reports fault/degradation first, then healthy diagnosed components, while retaining
an explicit unknown count. If every component is unknown, the summary is unknown.

## Maintenance lifecycle

`maintenance_sessions` records start, scheduled end, actual end, reason, actors,
source, notification policy and event references. Only one active session is allowed
per device. `devices.config.maintenance` remains a compatibility mirror.

The lifecycle RPC performs an authorized, transactional change and records:

- the maintenance session;
- a normalized lifecycle event when complete hierarchy context exists;
- an append-only audit record;
- the compatibility configuration update and version increment.

Until the migration is deployed, the existing dashboard falls back to the legacy
configuration update. That fallback is compatible but does not provide formal database
audit; it must be retired only after staging validation and deployment approval.

## Notification policy

Default maintenance policy:

| Category | State/event calculation | History | Notification |
|---|---:|---:|---:|
| Process warning alarm | Continues | Continues | Suppressed by default |
| Communication/offline | Continues | Continues | Not suppressed |
| Component Health | Continues | Continues | Not suppressed |
| Security/integrity | Continues | Continues | Never suppressed |
| System critical | Continues | Continues | Never suppressed |
| Any critical severity | Continues | Continues | Never suppressed |

Maintenance never converts `OFFLINE` into `NORMAL`. It controls delivery policy, not
the underlying state or evidence. Measurements, heartbeat, ingestion, diagnostics and
events continue normally.

## Compatibility and rollout

1. Current Cold payloads without new fields are normalized by the Core adapter.
2. New Cold payloads expose honest health state/confidence while keeping legacy keys.
3. Migration `20260830_07` is additive and is not automatically applied.
4. Run `supabase/tests/core_state_foundation_test.sql` in staging after migration.
5. Validate firmware on a bench unit before any real-device update.
