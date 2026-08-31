# Legacy Cold schema baseline

Date: 2026-08-30

## Origin and safety

`000_legacy_cold_baseline.sql` is a schema-only export of the current Legacy
Cold production database. The export session was explicitly opened as a
PostgreSQL `READ ONLY` transaction and used TLS with the Supabase CA. Only
catalog/schema information was read; no DDL, DML or migration ran in production.

The source project reference was verified locally against the existing Legacy
Cold API configuration and confirmed different from the staging project. No
project reference, connection string or credential is stored in the baseline.

## Included objects

- Tables: `alerts`, `clients`, `device_access`, `device_alert_recipients`,
  `devices`, `profiles`, `readings`.
- The real columns, types, defaults, identities/sequences, primary keys,
  foreign keys, checks and unique constraints belonging to those tables.
- Public views derived from the Legacy tables.
- Two authorization helper functions used by the Legacy policies.
- Twelve indexes, RLS enablement and 20 Legacy policies. The source export
  contained no custom `CREATE TRIGGER` object.
- References to the pre-existing Supabase `auth.users` relation, without
  exporting Auth schema objects or users.

## Excluded objects

- All table rows and real customer/device data.
- Auth users and Storage schema/data.
- Database passwords, API tokens, service keys and other credentials.
- Ownership and ACL/grant statements tied to the source project.
- Supabase-managed schemas, roles, extensions and platform configuration.
- Ephemeral `pg_dump` restrict/unrestrict session tokens.

## Intentional differences from the source dump

1. `CREATE SCHEMA public` is idempotent because a fresh Supabase project already
   owns a `public` schema.
2. Source ownership and privileges are omitted (`--no-owner --no-privileges`).
3. Ephemeral pg_dump session markers are removed.
4. A non-executable documentation header records provenance and safety intent.

All remaining SQL matches the schema-only source export. Automated comparison
confirmed exact equality after applying only the transformations above. Secret,
data-copy and data-insert scans returned zero findings.

## Compatibility findings

- Legacy `clients` uses `slug` and `is_active`; migration 01 now adds/backfills
  the STS Core `code`, `active`, `metadata` and `updated_at` fields additively.
- Legacy `alerts` required temperature and humidity even for non-metric alerts.
  Migration 08 now permits null metrics for offline/system alerts without
  changing any historical numeric value.
- All Legacy columns remain present. No Legacy table or field is removed.
