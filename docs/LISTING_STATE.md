# Listing State Semantics

`product.State` is a `varchar` enum whose labels are **misleading** — the name of a
state does not indicate whether a listing is live. These semantics were established
empirically (2026-07-29) by correlating each state against real booking activity on
the read-only platform database, because bookings are a signal an archived listing
cannot produce. Aggregate counts only; no customer identifiers are recorded here.

## The lifecycle

```
Initial  ->  Incomplete  ->  Created (LIVE)  ->  Suspended (paused)
                                              \-> Final (retired / archived)
```

| State | Meaning for Mapwise | Total listings | Modified last 30d | Recent live bookings* |
|---|---|---:|---:|---:|
| **Created** | **Live / active — the mapping target** | 91,925 | 16,740 | **38,091** |
| Incomplete | Active onboarding drafts (data not finished) | 113,899 | 8,960 | 34 |
| Suspended | Paused | 370,648 | 13,946 | 93 |
| Final | Retired / archived | 593,024 | 929 | 195 |
| Initial | Abandoned stubs (no activity since 2025) | 2,549 | 0 | 0 |

\* Distinct `Confirmed`/`FullyPaid` reservations with a stay date in Jun–Dec 2026.
`Created` accounts for ~99% of all live booking activity.

## Eligibility rule

Mapwise pulls **`State = 'Created'`** as the reviewable population. This is the live,
data-complete universe.

- **`Incomplete`** is an *active* onboarding pipeline (new listings are still created in
  this state daily) but carries incomplete data, so mapping it produces mostly
  "field not filled in yet" blockers rather than channel-mapping decisions. Leave it
  **out of the pilot**; enable it behind a flag only if pre-launch onboarding mapping
  becomes a goal.
- **`Initial`**, **`Suspended`**, and **`Final`** are excluded: abandoned, paused, and
  retired respectively.

## Two traps this corrects

1. **The prototype had it backwards.** Early rules treated `Final` as the
   "channel-ready" state and blocked anything not Final. `Final` is *retired* — 593k
   listings with ~0.15% recent activity and 195 recent bookings. The live state is
   `Created`.

2. **"Final" is a false friend across two tables.** `product.State = 'Final'` means
   *retired*, but `product_text.State = 3` is also labelled "Final" and there means
   *finalized / good text*. Same word, opposite meaning. The text-state logic in the
   extraction SQL (prefer `State = 3`, fall back to `State = 2` as non-final evidence)
   is correct and unaffected — only the **product**-level lifecycle rule was wrong.

## Caution for reporting (not a Mapwise concern, but noted)

`channel_product_map.state = 1` ("active mapping") rows are **not** cleaned up when a
listing is retired. `Final` listings carry ~179k stale "active" mappings despite ~0
bookings — so an active-mapping count is **not** a liveness signal. Any distribution
metric keyed on `product.State = 'Final'` may be counting retired listings' leftover
mappings and should be reviewed separately.
