# Web security gate before STS Cold hardware validation

## Findings

`SUPABASE_SERVICE_ROLE_KEY` is used only in server contexts:

- `server.js`: trusted ingestion/backend client.
- `smart-dashboard/src/app/api/admin/create-user/route.js`: Auth Admin user creation.
- `smart-dashboard/src/app/api/admin/delete-user/route.js`: Auth Admin deletion.
- `smart-dashboard/src/app/api/admin/update-user-password/route.js`: Auth Admin password update.
- `scripts/staging-runtime-validation.js`: child backend process for local staging validation.

The dashboard API routes first validate the Supabase session and require an
active `super_admin` profile before creating a service-role client. No reference
exists in client components or static browser assets. The key must remain a
server-only environment variable and must never receive a `NEXT_PUBLIC_` prefix.

`NEXT_PUBLIC_ADMIN_CODE` is not referenced in source or local environment files.
It is not part of the current authorization path and must not be reintroduced.
If it still exists in Vercel, remove it manually after confirming no older
deployment depends on it.

## Critical RLS finding

The legacy `profiles_update_own` policy permits an authenticated user to update
their own profile row. Row-level security alone does not prevent changing
authorization columns such as `role`, so a user may be able to self-promote.

`20260831_09_profile_role_escalation_guard.sql` adds a `BEFORE UPDATE` trigger
that rejects changes to `role`, `is_active`, `client_id` and `email` by a
non-administrator while preserving ordinary self-profile updates. It has been
prepared but not applied to staging or production in this hardware task.

## Required manual actions

1. Review and apply migration 09 to STAGING, then test attempted self-promotion,
   legitimate self-profile editing and `super_admin` administration.
2. Only after staging approval, schedule the same migration for production under
   a separate database-change authorization.
3. In Vercel, confirm `SUPABASE_SERVICE_ROLE_KEY` is server-only and scoped to the
   correct environment; add a server-only `SUPABASE_URL` alias if desired.
4. Remove `NEXT_PUBLIC_ADMIN_CODE` manually if it remains configured in Vercel.
5. Rotate the service-role key if it has ever been exposed in a client bundle,
   log, screenshot or public environment variable.
6. Replace the shared backend API token with per-device credentials or signed,
   revocable device tokens before fleet rollout.

No Vercel setting, production database, deployment or secret was changed during
this review.
