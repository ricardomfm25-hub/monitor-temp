# STS audit and basic observability contract

## Audit model

`audit_logs` is append-only and records:

- actor type/reference and authenticated user where applicable;
- action and target/resource type/ID;
- client and device context;
- previous and new summaries;
- reason and source;
- event/occurrence time and database record time;
- request/correlation identifier;
- success, denial or failure result.

Actor naming remains compatible: `user`, `device`, `system`, `service`, with `api` and
`admin` accepted where a more explicit origin is required. Authorization role may be
stored as metadata; actor type is not used as the authorization decision itself.

Sensitive values, credentials, Wi-Fi passwords and full secret-bearing payloads must
never be copied into audit metadata.

Maintenance sessions are mutable only to close the session (`ended_at`, `ended_by`,
state and end-event reference). Their start/end events and audit records remain append-only,
making the lifecycle traceable without inventing two maintenance records for one session.

## Basic Core observability

The backend maintains bounded-process counters for:

- normalized dual-write success/unavailable/failure;
- legacy/Core parity failures;
- Component Health persistence/unavailability/failure;
- Device State changes/unavailability/failure;
- alert and event persistence failures;
- authorization denial on the protected Core health endpoint.

Counters are available only through authenticated `GET /api/core/health`. They contain
operation labels and counts, not payloads or secrets. They reset on process restart and
are therefore an initial operational signal, not a complete monitoring platform.

Structured application errors remain visible in backend logs. Durable, distributed
metrics and alerting are deferred until measured deployment requirements are known.
