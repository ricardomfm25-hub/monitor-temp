# STS Global Foundation staging validation runbook

Status on 2026-08-30: **NOT EXECUTED**. No disposable PostgreSQL/Supabase environment
or local PostgreSQL tooling was available. The existing `.env` was not used because it
was not proven to reference staging.

## Environment safety gate

Before execution, record evidence that the target is disposable/staging:

- separate Supabase project ID/URL from production;
- no production customer data;
- dedicated staging service-role credential;
- backup/restore policy appropriate to the test;
- explicit operator confirmation of target name.

Never paste credentials into commands, logs or committed files.

## Migration order

Run preflight, then migrations in filename order through:

1. `20260819_01_core_hierarchy.sql`
2. `20260819_02_normalized_ingestion.sql`
3. `20260819_03_events_ground_truth.sql`
4. `20260819_04_learning_foundations.sql`
5. `20260819_05_rls_and_device_security.sql`
6. `20260819_06_secure_device_pairing.sql`
7. `20260830_07_core_state_component_health_maintenance.sql`
8. `20260830_08_data_integrity_device_lifecycle.sql`

## Required tests

1. `supabase/tests/preflight_schema_check.sql`
2. `supabase/tests/core_state_foundation_test.sql`
3. `supabase/tests/data_architecture_test.sql`

The architecture test runs inside a transaction and rolls back. It now covers A/B tenant
visibility, indirect joins, Component Health, audit, alerts, maintenance RPC, lifecycle
RPC, cross-tenant update/delete attempts and known foreign IDs.

## Runtime validation

Against a staging backend/device fixture, execute normal, duplicate, retry, delayed,
offline-replay and out-of-order payloads. Record:

- legacy reading count/value/time;
- ingestion batch identity, event time and ingestion time;
- normalized sensor values/units/quality;
- parity result and Core counters;
- alert/event/state/component effects;
- behavior when normalized tables are temporarily unavailable.

## Pass conditions

- all migrations and SQL tests complete without error;
- Cliente A/B leakage count is zero for every tested path;
- unauthorized RPCs fail and authorized RPCs append event/audit evidence;
- duplicate logical readings produce one ingestion batch/measurement set;
- legacy/Core applicable values, units and event times match;
- legacy ingestion remains successful on controlled Core-write failure;
- no production project or data is accessed.
