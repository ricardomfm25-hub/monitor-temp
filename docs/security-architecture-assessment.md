# STS global architecture and security assessment

Date: 2026-08-29

## 1. Current-state diagnosis

### STS Core already present

- Supabase authentication, profiles, roles and per-device access grants.
- Generic device registry, heartbeat, online/offline state and communication diagnostics.
- Backend ingestion, alert processing, remote configuration, reports and notifications.
- Persistent offline queue, replay metadata and telemetry sequence in firmware.
- Dashboard shell with multi-device selection, live state, history and administration.
- Normalized foundations for products, models, clients, sites, spaces, sensors,
  immutable ingestion, events, outcomes, features, baselines and credentials.

### STS Cold-specific logic

- DHT22/SHT30 acquisition and associated hardware diagnostics.
- Temperature/humidity limits, hysteresis and refrigeration state.
- Thermal alarms, buzzer/RGB/TFT presentation and local acknowledgement.
- Cold-oriented fields and labels still embedded in the legacy reading and dashboard path.

### Infrastructure

- ESP32 firmware with Wi-Fi provisioning, recovery, watchdog, local OTA and LittleFS.
- Express backend using Supabase service role for trusted ingestion operations.
- Next.js global dashboard and server-side API routes.
- Supabase database, Realtime, RLS and staged SQL migrations.

### Main technical debt

- Shared device authentication token; knowledge of a device code enables impersonation
  if that token leaks.
- Device token, OTA password and setup password are currently embedded in firmware source.
- Firmware uses `WiFiClientSecure.setInsecure()`, so it does not authenticate the server.
- Service-role backend has broad database authority and requires strict endpoint validation.
- In-memory IP rate limiting is instance-local and is ineffective as a global distributed limit.
- No automated backend test command or continuous security regression suite.
- Legacy wide readings and Cold-specific dashboard assumptions remain the active read path.
- Pairing codes have no explicit expiry, attempt counter or server-side throttling in the schema.
- No complete audit-log model for administrative and security-sensitive changes.

## 2. Target architecture

```text
Devices
  -> authenticated STS ingestion gateway
  -> STS Core services
       identity and tenancy
       device registry and capabilities
       ingestion and synchronization
       state, alerts, events and audit
       configuration and firmware management
  -> generic normalized data model
  -> product modules (Cold, Engine, Air, ...)
  -> intelligence layer
  -> one role-aware global dashboard
```

The Core owns identity, context, transport, storage, authorization and lifecycle.
Product modules own metrics, rules, device-state interpretation and presentation.
Every product-specific state maps to one global state: `NORMAL`, `WARNING`,
`CRITICAL`, `OFFLINE`, `MAINTENANCE` or `UNKNOWN`.

## 3. Security target

### Device identity

- Each device receives a random, unique secret during controlled provisioning.
- The backend stores only an Argon2id/scrypt hash or an HMAC-verification key strategy;
  plaintext is shown once and is never logged or returned again.
- Credentials have prefix, status, issue/expiry/use timestamps, rotation lineage and revocation.
- Authentication binds the credential to the claimed internal device identifier.
- Requests include timestamp, nonce and body digest, authenticated with HMAC, to limit replay.
- Telemetry sequence remains the idempotency boundary for data duplication.

### Transport and firmware

- Replace `setInsecure()` with a trusted CA bundle or pinned public key with a safe rotation plan.
- Move build-time secrets to a private provisioning step, not source-controlled headers.
- Generate unique setup and OTA credentials per device; do not display permanent secrets openly.
- Prefer signed firmware manifests and signed binaries for fleet OTA.
- Disable or time-limit local OTA outside maintenance/provisioning mode.
- Redact authorization headers, Wi-Fi credentials, tokens and payload secrets from logs.

### Users and tenants

- Supabase user sessions authenticate people; RLS remains the final database boundary.
- Authorization follows client -> site -> space -> device scope, with least privilege.
- Roles distinguish platform administration, client ownership, operations, technicians and viewing.
- Sensitive mutations go through server-side routes/RPCs with explicit authorization and validation.
- Service-role keys are backend-only and never bundled into the dashboard.
- MFA is required for privileged operators when supported by the identity configuration.

### Audit and operations

- Append-only audit records capture actor, tenant, action, target, request/correlation ID,
  before/after summaries, time, source and result.
- Security events include failed device authentication, pairing attempts, credential rotation,
  permission changes, configuration changes and firmware rollout actions.
- Central/distributed throttling protects authentication, pairing and ingestion separately.
- Alerts detect credential abuse, cross-tenant denials, replay attempts and unusual device traffic.

## 4. Proposed data structure

Keep the existing normalized entities and extend them incrementally:

- `products`, `product_models`: product catalog and capability definitions.
- `clients`, `client_users`, `sites`, `spaces`: tenant and location hierarchy.
- `devices`: stable internal UUID, public code, model, space and global state.
- `sensors`, `actuators`: device channels, metric/action type, unit and metadata.
- `ingestion_batches`: immutable raw envelope, digest, sequence and configuration context.
- `sensor_readings`: generic value, observed time, quality/status and sensor reference.
- `events`, `event_outcomes`: detection, diagnosis, action and reviewed outcome.
- `device_configurations`, `sensor_calibrations`: effective-dated technical history.
- `device_credentials`: hashed individual credentials and lifecycle.
- `firmware_versions`, `firmware_rollouts`: signed artifact and staged deployment history.
- `device_states`: effective-dated global and product-specific state transitions.
- `audit_logs`: append-only security and administrative audit.
- `reports`: generated-report metadata and access context; generated files remain private.

Context is resolved by joins rather than duplicating client/site fields into each measurement:

```text
reading -> sensor -> device -> space -> site -> client
                         |
                         -> product_model -> product
```

## 5. Safe migration plan

### Phase A — Model and security inventory

- Verify the real production schema and RLS before applying migrations.
- Inventory active firmware and rotate any exposed production credentials.
- Add audit/firmware/state entities without changing legacy reads.
- Establish secret management and documented environment separation.

### Phase B — Compatibility and dual-write

- Apply normalized migrations in staging and run tenant-isolation tests.
- Keep legacy ingestion authoritative while writing normalized records best-effort.
- Measure parity, idempotency, ordering and normalized-write failures.
- Introduce per-device authentication alongside the shared token.

### Phase C — Global dashboard

- Read client/site/space/device hierarchy through authorized server routes or RLS views.
- Add fleet filters and global-state summaries without removing Cold views.
- Record configuration, permission and pairing mutations in audit logs.

### Phase D — Modularization

- Extract product-neutral contracts for metrics, capabilities, state mapping and UI modules.
- Register Cold as the first product module while retaining current APIs.
- Validate a minimal second mock product before declaring the Core generic.

### Phase E — Security cutover and validation

- Migrate devices in cohorts to individual credentials and trusted TLS.
- Compare readings, alerts, configuration and history across both paths.
- Test tenant boundaries, replay, credential revocation, rollback and offline recovery.
- Disable the shared token only per proven migrated device.

### Phase F — Legacy retirement

- Stop legacy writes only after sustained parity and approved rollback evidence.
- Archive rather than delete historical structures in the first retirement release.
- Remove old access paths only after consumers and reports have migrated.

## 6. Files and modules

### Keep operational

- `server.js` legacy endpoints during compatibility.
- Existing dashboard device/history/alerts/config routes.
- Current firmware offline queue, watchdog, heartbeat and configuration behavior.
- Existing `readings`, `alerts` and `device_access` until final validation.

### Change incrementally

- `server.js`: isolate authentication, validation, ingestion and product rules into modules.
- Firmware: provisioning-backed credentials, request signing, trusted TLS and signed OTA.
- Dashboard: consume hierarchy/capabilities and enforce server-side mutations.
- RLS migrations: expand tests before production activation.

### Create

- `src/core/auth/device-auth.js`
- `src/core/ingestion/ingestion-service.js`
- `src/core/audit/audit-service.js`
- `src/core/devices/capability-registry.js`
- `src/products/cold/` for Cold rules and adapters.
- Database migrations for audit, firmware rollout and device-state history.
- Automated security, authorization, ingestion and compatibility tests.

These paths are target boundaries, not authorization for a single large file move.

## 7. Critical risks and controls

| Risk | Severity | Control |
|---|---:|---|
| Shared token impersonates any device | Critical | Dual-auth rollout, unique credentials, binding and revocation |
| TLS server is not verified | Critical | CA/public-key validation with rotation and expiry monitoring |
| Secrets embedded in firmware source | Critical | Private provisioning, generated per-device secrets and rotation |
| Service-role endpoint vulnerability crosses tenants | Critical | Strict schemas, device binding, least-privilege RPCs and tests |
| RLS regression leaks tenant data | Critical | Two-tenant negative tests on every migration/build |
| Pairing-code guessing or reuse | High | Random one-time codes, expiry, throttling, audit and invalidation |
| Replay/duplicate telemetry | High | Signed timestamp/nonce/digest plus telemetry sequence constraint |
| Big-bang migration interrupts Cold | High | Dual-write, measured parity, cohorts and release rollback |
| Product logic leaks into Core | Medium | Capability contracts and a second-product validation fixture |
| In-memory rate limiter does not scale | Medium | Shared edge/Redis-backed throttling and per-credential quotas |

## 8. Immediate security gates

No production cutover should occur until all are true:

1. Known embedded/shared secrets are treated as exposed and rotated.
2. Firmware authenticates the backend TLS certificate.
3. Cross-tenant RLS tests pass for legacy and normalized tables.
4. Pairing is expiring, throttled, one-time and audited.
5. Per-device credentials can be issued, rotated and revoked safely.
6. Logs and reports contain no credentials or Wi-Fi secrets.
7. Backup/restore and rollback procedures have been exercised in staging.
