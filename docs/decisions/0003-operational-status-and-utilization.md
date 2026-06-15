# 0003 — Per-day operational status + utilization redefinition

Date: 2026-06-15
Status: accepted

## Context

The client (Xavier) flagged that the fleet "utilization %" was misleading: it
divided trucks-that-drove by the whole fleet (or all active trucks), so a Sunday
(when only a few trucks run by design) or a just-bought truck not yet legal to
drive both **deflated** the number. He also wants to know *why* a truck was idle:
no work (sales) vs broken (mechanics). He built a quick "Zezet operativo" sheet
that classifies every truck each day as Operativo / No operativo / Dañado, and
leaves cells blank for trucks not expected to run.

## Decision

1. **`DailyTruckLog.operStatus`** enum `OperStatus { operating | no_clients | broken }`,
   nullable. Null = "not recorded / not expected" and is **excluded** from the
   percentage. The field chief sets it for every truck visited, including idle ones.
2. **`Truck.inServiceDate`** (date ready/legal to drive, distinct from
   `purchaseDate`). A truck counts toward operational metrics only from this date.
3. **Operational % redefinition**: `operating / (operating + no_clients + broken)`
   over *recorded* statuses, via `GET /reports/operational`. This replaces the
   old `trucksWithTrips / activeTrucks` "Avg. fleet use" on the dashboard.

`operStatus` is orthogonal to `LogStatus` (draft|confirmed, the entry workflow):
a day can be confirmed AND broken.

## Alternatives considered

- Keep dividing by active trucks and special-case Sundays — brittle, ignores the
  broken-vs-no-clients distinction the client needs.
- Infer status from trips (trips ⇒ operating) only — can't represent idle/broken,
  which is the whole point.

## Consequences

- Good: matches how the client actually tracks; honest %; opens a sales-vs-mechanics
  accountability split later.
- Cost: requires the chief to record idle/broken days; until then a period shows
  only operating logs, so historical operating % reads ~100% (we only know trips).
- Backfill: existing trip-bearing logs set to `operating`; trucks' `inServiceDate`
  seeded from `purchaseDate`.

## Rollback

Both columns are additive and nullable. Revert by dropping `operStatus` /
`inServiceDate` and restoring the utilization endpoint/KPI to the trip-based ratio;
no data loss for trips/logs.
