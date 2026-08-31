# STS device lifecycle

Date: 2026-08-30

## Scope

Lifecycle answers: “Which administrative phase of its existence is this device in?”
It does not express monitored-process condition, component health, communication or
maintenance.

## States

- `PROVISIONED`: identity/catalog record exists; ownership/location may be incomplete.
- `ONBOARDING`: pairing, assignment, commissioning or validation is in progress.
- `ACTIVE`: commissioned and authorized for normal operation.
- `SUSPENDED`: temporarily prevented from normal operational use without deleting history.
- `RETIRED`: withdrawn/replaced; historical data remains accessible under authorization.

Maintenance is an independent state. `DEGRADED`, `FAULT`, `OFFLINE` and `CRITICAL`
belong to other state dimensions and are intentionally absent.

## Allowed transitions

| From | To |
|---|---|
| PROVISIONED | ONBOARDING, SUSPENDED, RETIRED |
| ONBOARDING | ACTIVE, SUSPENDED, RETIRED |
| ACTIVE | SUSPENDED, RETIRED |
| SUSPENDED | ONBOARDING, ACTIVE, RETIRED |
| RETIRED | none in ordinary operation |

A platform administrator may explicitly restore `RETIRED → ONBOARDING`. Direct
`RETIRED → ACTIVE` is forbidden. The restore requires a reason and is flagged in audit.

## Operational flows

- Provisioning creates the device as `PROVISIONED`.
- Pairing/assignment begins `ONBOARDING`.
- Successful commissioning moves to `ACTIVE`.
- Relocation normally uses `SUSPENDED → ONBOARDING → ACTIVE`.
- Firmware update does not change lifecycle unless policy suspends the device;
  it generates firmware events/audit independently.
- Temporary disablement uses `SUSPENDED`.
- Replacement/withdrawal uses `RETIRED`; the replacement is a distinct device identity.

## Transition contract

Every transition requires authorization, reason, source and timestamp, then atomically:

1. updates the current lifecycle mirror on `devices`;
2. appends a `device_lifecycle_events` row;
3. appends an STS event when tenant/site/space context is complete;
4. appends an audit record with previous/new state and correlation ID.

The transition RPC rejects cross-tenant access and invalid state paths. Foundation v1
does not automatically infer lifecycle from health, heartbeat or maintenance.
