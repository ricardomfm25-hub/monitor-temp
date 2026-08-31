# STS Global data integrity contracts

Date: 2026-08-30

Status: **IMPLEMENTED locally**. JavaScript contracts are locally tested. Database
migrations and SQL/RLS tests remain **UNVALIDATED IN STAGING**.

## Legacy versus STS Core

| Concern | Legacy Cold compatibility | STS Core |
|---|---|---|
| Measurements | `readings` wide Cold rows | `ingestion_batches` + `sensor_readings` |
| Device current state | `devices.status/config` | `device_state_snapshots` plus compatibility mirror |
| Diagnostics | `hardware_diagnostics` JSON | `device_components` + `component_health_events` |
| Alerts | `alerts` history | Same table with optional alert lifecycle; events remain separate |
| Events | Alert-shaped history | Context-rich append-oriented `events` |
| Maintenance | `devices.config.maintenance` | `maintenance_sessions`, event and audit, plus compatibility mirror |
| Configuration | Current JSON/config version | Effective-dated `device_configurations` |
| Identity/context | Public `device_id`, labels and grants | UUID hierarchy client/site/space/device/product/model |

Legacy structures are not removed or rewritten in Foundation v1.

## Measurement contract

A logical measurement is one `sensor_readings` row linked to an immutable
`ingestion_batches` envelope.

| Contract field | Storage/source |
|---|---|
| Tenant/site/space | Resolved through sensor → device → space → site → client |
| Device | `sensors.device_id` internal UUID; public code remains on `devices` |
| Sensor/component | `sensor_id`; component evidence linked through the device |
| Metric and unit | Sensor registry `sensor_type` and `unit` |
| Value | Exactly one of numeric, boolean or text |
| `event_time` | `recorded_at`, calculated from device epoch/sample age |
| `ingested_at` | `ingestion_batches.received_at` |
| Source | `sensor_readings.source` |
| Quality | `quality` plus `quality_reason_codes` |
| Confidence | `confidence` |
| Delivery | `original`, `delayed` or `retransmitted` on the batch |
| Raw evidence | Immutable `raw_payload` and SHA-256 digest |
| Idempotency | Device + telemetry sequence, or stable fallback `idempotency_key` |
| Schema | `schema_version` on envelope and measurement |

Offline replay preserves the original `event_time`; receipt does not silently replace it.
Out-of-order rows are valid time-series inputs and are ordered by event time for analysis.

## Idempotency

1. Preferred key: `(device_id, telemetry_seq)`.
2. Fallback for legacy payloads without sequence: stable SHA-256 over device,
   event time, measurement values and alarm event counter.
3. Delivery-attempt counters and backlog flags are excluded from the fallback key,
   so the same logical reading keeps the same identity when retransmitted.
4. One batch can contain at most one measurement per sensor.
5. New Legacy `readings` rows receive the same idempotency key, with a partial
   unique index. Historical Legacy rows remain unchanged and nullable.

The fallback database constraint requires migration `20260830_08`. Before that migration,
legacy payloads without `telemetry_seq` do not have complete database-enforced idempotency.

## Data Quality

States are lower-case to preserve the existing database convention:

- `valid`: value and timestamp are credible and component evidence is healthy.
- `suspect`: value is usable but evidence indicates degraded component, implausible
  range or timestamp anomaly.
- `invalid`: value is non-numeric where numeric is required, physically impossible,
  or associated with a diagnosed component fault.
- `missing`: expected value is absent.
- `unknown`: numeric value exists but evidence is insufficient; numeric never implies valid.
- `estimated`: retained for future derived/interpolated values and never assigned to raw data silently.

Initial range rules are deliberately conservative: humidity outside 0–100% is invalid;
temperature outside -100–150 °C is suspect. Product modules may later add versioned,
model-specific rules without changing raw evidence.

## Events and alerts

- **Event:** an occurrence, such as boot, reconnect, configuration change,
  maintenance transition or sensor failure. Events may be informational.
- **Alert:** a condition requiring attention. Alert lifecycle is `OPEN`,
  `ACKNOWLEDGED`, `RESOLVED`.

An alert may reference a source event, but events are never treated as persistent alert
state. Legacy alert rows retain `alert_status = null` unless lifecycle can be established
without rewriting history.

## Other integrity contracts

- Component Health is append-only evidence with state, confidence, source and scope.
- Device State snapshots keep four independent dimensions.
- Maintenance sessions may be updated only to record their formal end; corresponding
  events and audit records remain immutable.
- Audit and lifecycle event records are append-only.
- Configuration history uses effective time ranges and does not mutate raw measurements.

## Dual-write parity

Every successful normalized write now calculates a measurable legacy/Core value parity
result for applicable metrics. Mismatches increment an internal Core counter and are
returned in the ingestion result. This is evidence for rollout monitoring, not a claim
that staging parity has already been validated.
