# STS ecosystem readiness roadmap

## Objective

Evolve the current STS Cold application into a secure, observable and scalable
multi-product ecosystem without interrupting the existing operational path.

The detailed architecture and security baseline is documented in
`docs/security-architecture-assessment.md`.

## Verified baseline (2026-08-29)

- The Express backend passes `node --check server.js`.
- The Next.js dashboard passes ESLint and a production build.
- Multi-device selection, per-device access, live updates, alerts, configuration
  and multi-device reports already exist.
- The dashboard already builds a provisional building/room/device hierarchy from
  current device and profile fields.
- Normalized migrations already model products, models, clients, sites, spaces,
  sensors, immutable ingestion, events, learning foundations and credentials.
- Legacy ingestion remains the operational compatibility path.
- There is no automated backend test command yet.
- Production deployment of the normalized schema and parity with legacy writes
  have not been demonstrated from this repository.

## Delivery principles

1. Preserve legacy reads and writes until measured parity is proven.
2. Apply database changes in staging first and keep migrations reversible by release.
3. Enforce tenant authorization server-side; UI filtering is never an access boundary.
4. Introduce per-device credentials through a dual-auth transition.
5. Add tests and operational metrics before increasing rollout scope.
6. Treat firmware, backend, database and dashboard as one versioned product surface.

## Phase 0 — Baseline and release discipline

Deliverables:

- Environment and deployment documentation for firmware, backend, dashboard and database.
- Automated checks for backend syntax/tests, dashboard lint/build and migration preflight.
- Versioned release checklist and rollback procedure.
- Inventory of production schema, active firmware versions and deployed environment variables.

Exit criteria:

- A clean checkout can be validated with documented commands.
- Staging and production configuration are separated and secrets are not committed.
- Every release has an owner, change record, validation evidence and rollback path.

## Phase 1 — Normalized multi-tenant foundation

Deliverables:

- Apply migrations `20260819_01` through `20260819_06` in staging.
- Run preflight and architecture tests against a production-like schema.
- Activate backend dual-write and expose normalized-write success/failure metrics.
- Map existing devices to product/model/client/site/space.
- Map existing grants to `client_users` while retaining `device_access` compatibility.
- Add controlled reconciliation for legacy and normalized row counts.

Exit criteria:

- Legacy ingestion success is unchanged.
- Normalized writes meet an agreed success target for a representative trial period.
- No tested user can access another tenant's data.
- Every active device has valid organizational and product context.

## Phase 2 — Device identity and secure provisioning

Deliverables:

- Per-device credential issuance, hashing, rotation, revocation and audit trail.
- Dual-auth rollout in the backend with explicit device-level migration status.
- Secure onboarding/pairing workflow with one-time secret handling.
- Firmware support for individual credentials and protected local storage.
- Trusted TLS certificate validation and removal of production shared/static secrets.
- OTA policy with unique credentials or signed firmware delivery.

Exit criteria:

- A device credential can be revoked without affecting other devices.
- Impersonating another `device_id` with the wrong credential is rejected.
- Shared authentication can be disabled per migrated device.
- No production secret exists in source-controlled firmware or dashboard code.

## Phase 3 — Ecosystem management experience

Deliverables:

- Administration screens for clients, sites, spaces, products, models and sensors.
- Search, filters, grouping and fleet health summaries based on normalized context.
- Bulk assignment and configuration with preview, validation and audit history.
- Role-aware navigation for super-admin, client-admin, technician and viewer workflows.
- Product/model capability descriptors so the UI is not hard-coded to STS Cold fields.

Exit criteria:

- An administrator can provision and locate a device without editing raw database rows.
- A client administrator manages only their own hierarchy and authorized users.
- Unsupported controls are hidden or disabled according to device capabilities.

## Phase 4 — Fleet operations and reliability

Deliverables:

- Fleet-level availability, last contact, firmware, configuration drift and sensor health.
- Alert deduplication, acknowledgement, ownership, escalation and resolution lifecycle.
- Safe bulk firmware/configuration rollout with staged cohorts and rollback.
- Offline-buffer, ingestion-lag and communication-quality monitoring.
- Maintenance schedules and auditable technician interventions.

Exit criteria:

- Operators can identify affected tenants/devices and the likely failure domain quickly.
- Alert state remains consistent across firmware, backend and dashboard.
- A failed rollout can be stopped and reverted without fleet-wide interruption.

## Phase 5 — Scale, observability and resilience

Deliverables:

- Structured logs with request, tenant, device and ingestion correlation identifiers.
- Metrics and alerts for API latency/errors, database failures, queue depth and stale devices.
- Load tests for ingestion, realtime subscriptions, history and fleet dashboards.
- Backup/restore verification, retention policy and recovery objectives.
- Query-plan review and partitioning/rollups only when measured thresholds require them.

Exit criteria:

- Capacity limits and service objectives are documented from repeatable tests.
- Operational alerts are actionable and linked to runbooks.
- A restore exercise proves that critical configuration and telemetry can be recovered.

## Phase 6 — Data quality and intelligence

Deliverables:

- Sensor calibration history and data-quality flags.
- Reviewed event outcomes and ground-truth workflows.
- Versioned derived features and device/space baselines.
- Predictive models introduced behind evaluation and rollback controls.

Exit criteria:

- Predictions identify their algorithm, source window and confidence.
- Model performance is measured against reviewed outcomes.
- Predictive failures cannot suppress deterministic safety alarms.

## Immediate implementation order

1. Add a real backend test runner and cover authentication/authorization boundaries.
2. Validate all migrations and RLS in a disposable staging database.
3. Add dual-write health metrics and reconciliation reporting.
4. Implement the per-device authentication transition.
5. Build normalized hierarchy administration APIs and screens.
6. Add fleet filters, health summaries and bulk-safe operations.

## Definition of ecosystem-ready

STS is ecosystem-ready when a new product model and its devices can be securely
provisioned, assigned to a tenant/site/space, monitored and maintained without code
changes to tenant-specific logic; access isolation, ingestion reliability, fleet
health and recovery are continuously tested and observable.
