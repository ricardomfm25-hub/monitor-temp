# STS Global Foundation v1 — current-state audit

Date: 2026-08-30

Status labels used here:

- **IMPLEMENTED**: code or migration exists locally.
- **TESTED**: a relevant local automated check has passed.
- **UNVERIFIED**: deployment, staging or real-hardware evidence is unavailable.
- **PLANNED**: no complete implementation exists yet.

No item in this audit is classified as production-ready solely because code exists.

## Short requirements table

| Requirement | Current state | Necessary change | Risk |
|---|---|---|---|
| Preserve operational STS Cold | IMPLEMENTED locally; production state UNVERIFIED | Add repeatable regression tests and a valid Git baseline before structural changes | High |
| Stable Git baseline | Not available: `.git` exists but is not a valid repository in this workspace | Confirm the authoritative repository/remote, then create a clean commit/tag without secrets | High |
| Repository secret protection | Partial `.gitignore`; sensitive local files and firmware constants detected | Root ignore rules added; rotate previously exposed credentials and verify Git history with approval | Critical |
| Client → Site → Space → Device | IMPLEMENTED in additive migrations; dashboard still uses provisional labels in parts | Validate migrations/RLS in staging and bind current Cold devices to real hierarchy rows | High |
| Product/model and sensors | IMPLEMENTED in migrations and Cold legacy mapping | Add capability contracts and validate a second product fixture | Medium |
| Generic normalized measurements | IMPLEMENTED as immutable batches/readings | Add reconciliation metrics/tests for values, units, timestamps and ordering | High |
| Dual-write | IMPLEMENTED as best-effort; legacy write remains protected | Test idempotency and partial-failure cases; observe parity before read cutover | High |
| Global dashboard shell | Partially IMPLEMENTED: multi-device hierarchy and sections exist | Introduce explicit global navigation/context without removing Cold experience | Medium |
| Component Health | PLANNED formally; legacy `hardware_diagnostics` exists | Add generic component registry/current health/history and a compatibility adapter | High |
| Honest Cold diagnostics | Partial; DHT22, SHT30, TFT and queue have signals | Stop claiming confirmed health for button/buzzer; distinguish observed, inferred and unknown | High |
| Maintenance Mode | Partially IMPLEMENTED in device config and admin UI | Add reason, actor, lifecycle/history, events/audit and explicit notification policy | High |
| Offline during maintenance | Current health checker skips maintenance devices | Preserve communication state and record offline condition independently from notification suppression | High |
| Four state dimensions | Partial calculations exist but concepts remain mixed | Define Core contracts for operational, component, communication and maintenance state | High |
| Multi-tenant RLS | IMPLEMENTED in migrations; staging/production UNVERIFIED | Run two-tenant negative tests against the real preflight schema | Critical |
| Per-device credentials | Schema IMPLEMENTED; authentication rollout PLANNED | Add dual authentication, rotation/revocation service and pilot firmware | Critical |
| Validated TLS in firmware | Not implemented; secure client verification is disabled | Add CA/public-key validation and a rotation-safe pilot | Critical |
| Pairing security | One-time invalidation IMPLEMENTED | Add expiry, attempt throttling and audit records | High |
| Audit trail | Events exist but no complete security/admin audit model | Add append-only audit records and instrument sensitive mutations | High |
| Automated tests | SQL architecture tests exist; backend `npm test` is a placeholder | Add Core unit/integration tests and CI commands | High |
| Production readiness | UNVERIFIED | Requires staging, real hardware pilot, rollout evidence and explicit approval | Critical |

## What is already implemented

- Additive global hierarchy and product/model migrations.
- Stable internal device UUID while retaining the public Cold device code.
- Generic sensor registry and immutable normalized ingestion batches/readings.
- Best-effort normalized dual-write with legacy ingestion preserved on failure.
- Telemetry sequence uniqueness and duplicate-batch recovery.
- Events/outcomes, learning foundations, RLS and future credential schema.
- Transactional one-time device pairing.
- Multi-device dashboard, reports, live subscriptions and existing Cold views.
- Maintenance configuration with timed expiry and some notification suppression.
- Firmware telemetry for sensor, display, storage, memory and communication diagnostics.

## Partial or legacy-dependent areas

- The dashboard's building/room hierarchy can still be derived from legacy presentation fields.
- Legacy `readings`, `alerts`, `device_access` and wide Cold payloads remain operational sources.
- Maintenance state is configuration JSON rather than a Core lifecycle entity.
- Hardware diagnostics are stored as a device config snapshot rather than normalized component health.
- Alert suppression during maintenance is broad and not expressed as an auditable policy.
- Device authentication remains the shared-token compatibility path.

## Potential regressions or correctness issues

1. Firmware reports the RGB button and buzzer as healthy merely because they are configured;
   it cannot confirm physical light, button contact or sound output.
2. The periodic offline-health loop skips devices in maintenance, which can hide a real
   communication failure instead of separating state detection from notification policy.
3. A duplicate ingestion batch is recovered, after which normalized sensor inserts are
   attempted again. Unique constraints prevent duplicate rows, but this path needs an
   explicit idempotency test and clearer result semantics.
4. Normalized sensor readings are currently marked `valid` whenever a numeric value exists;
   sensor health and captured-offline/time-quality evidence are not yet mapped to quality flags.
5. Normalized-write failure is logged but no durable metric or operator alert proves parity.
6. Pairing code format and one-time invalidation exist, but expiry and distributed throttling do not.

## Implementation blocks

### Block 0 — Baseline and test harness

- Confirm the authoritative Git repository and clean baseline.
- Verify ignored/untracked secrets without printing their contents.
- Add backend tests and a single documented validation command.
- Capture current Cold API fixtures and expected responses.

### Block 1 — Core state contracts

- Define enums and mapping rules for operational, component, communication and maintenance.
- Add non-destructive tables for component registry/health history and maintenance sessions.
- Add append-only audit records and event integration.
- Preserve the existing config/diagnostics payload as a compatibility adapter.

### Block 2 — Honest Cold component mapping

- Map DHT22/SHT30 read success and counters to component health.
- Map TFT initialization, queue/filesystem status and backend transport evidence.
- Represent button/buzzer as `UNKNOWN` unless a defensible diagnostic signal exists.
- Add tests for stale, failed, recovered and unknown components.

### Block 3 — Maintenance lifecycle

- Add activate/end RPC/API with reason, actor, start/end and audit event.
- Continue measurement, heartbeat, health and communication evaluation.
- Separate alert/event creation from notification suppression.
- Define always-visible/always-notified critical classes.

### Block 4 — Hierarchy and global shell

- Validate RLS and hierarchy in staging.
- Add global navigation and fleet context.
- Route a real Cold device into the existing Cold module.
- Avoid placeholder product experiences.

### Block 5 — Dual-write validation

- Reconcile legacy/normalized values, units, timestamps, sequences and counts.
- Exercise offline replay, duplicate requests and partial normalized failures.
- Add durable health metrics before any read cutover.

### Block 6 — Security pilot

- Implement backend dual authentication and per-device lifecycle.
- Add pairing expiry/throttling/audit.
- Build a trusted-TLS firmware pilot with provisioned secrets.
- Validate on one bench device before requesting any real-fleet update.

## Decisions requiring approval

- Selecting/initializing the authoritative Git repository and creating a tag or remote push.
- Any history scan/rewrite to remove previously committed secrets.
- Rotation or revocation of real credentials.
- Applying migrations to staging or production.
- Deploying backend/dashboard changes.
- Flashing or OTA-updating real devices.
- Removing legacy columns, tables, routes or compatibility behavior.

## Safe change made in this block

Repository ignore rules were strengthened. No sensitive file was opened, deleted or modified;
no credential was printed or rotated; no migration, deployment or firmware update was executed.

## Implementation update — Core state block (2026-08-30)

The following is now **IMPLEMENTED locally**:

- Four independent state contracts and derivation helpers.
- Honest Component Health normalization with diagnostic confidence/scope.
- Best-effort component/state persistence that preserves legacy Cold ingestion when
  the new schema is unavailable.
- Additive migration `20260830_07` for components, health events, maintenance
  sessions, state snapshots, audit logs and the authorized maintenance lifecycle RPC.
- Explicit maintenance notification policy; communication evaluation is no longer
  skipped during maintenance.
- Cold firmware payload changes that no longer claim confirmed physical health for
  TFT, button or buzzer.
- Dashboard support for health state and confidence while retaining legacy `ok` input.
- Local unit tests for contracts, evidence mapping and maintenance policy.

Local JavaScript tests, backend syntax, dashboard lint and dashboard production build
pass. The migration remains **UNTESTED against PostgreSQL/staging**, and firmware remains
**UNCOMPILED/UNVALIDATED ON REAL HARDWARE** because the required local toolchain/hardware
is unavailable. Nothing was deployed or applied to a database.
