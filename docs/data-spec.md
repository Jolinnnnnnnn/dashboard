# Data Spec

Source of truth for Signal's synthetic dataset. The generator (`scripts/generate_data.py`) implements this spec; the validator (`scripts/validate_patterns.py`) checks it. To change the data, change this spec and the generator, then regenerate. Never hand-edit `data/`.

## Purpose

Synthetic task-routing data for a fictional CDN company. It must be realistic enough for the dashboard to feel real, and contain **planted patterns** that the prediction, process map, and similar-case search should recover.

## Global settings

| Setting | Value |
|---|---|
| Random seed | `42` (same output every run) |
| History window | 2025-10-01 → 2026-09-30 (12 months) |
| "Today" for open tasks | 2026-10-07 |
| Historical (closed) tasks | 400 |
| Open tasks | 100 |
| Open tasks flagged at risk | ~8 (seed 42: 10) |
| Backtest split | Train: Oct 2025–Jun 2026 (~300 tasks) · Test: Jul–Sep 2026 (~100 tasks) |

## Stakeholders (9)

| ID | Name | Role | Median hold (days) |
|---|---|---|---|
| `intake` | Intake | Logs and triages new requests | 0.2 |
| `support` | Support | First-line troubleshooting | 0.8 |
| `network_eng` | Network Eng | Edge, cache, routing fixes | 1.8 |
| `security` | Security Review | Certs, WAF, access approvals | **2.9** (bottleneck) |
| `ops` | Ops | Config rollout, deployments | 1.0 |
| `qa` | QA | Verification before release | 0.7 |
| `dev` | Dev | Code fixes | 2.0 |
| `customer` | Customer | Client confirms or provides info | 1.2 |
| `closed` | Closed | Terminal state | — |

Hold times are drawn from a lognormal distribution around these medians: most tasks sit near the median, with a long tail of slow ones.

## Clients (15, fictional)

Invented brand names (e.g. "Northwind Media", "Lumen Games", "Kestrel Retail"). Each client has:

- **Tier:** Enterprise (5), Mid-market (6), SMB (4). Enterprise clients create more tasks.
- **Region:** APAC, NA, EU, LATAM.

## Code modules (20)

Each module has 2–4 files.

| Module | Example files |
|---|---|
| `edge-sync/` | `propagation.go`, `batch_scheduler.go`, `node_registry.go` |
| `cdn-cache-purge/` | `purge_api.go`, `purge_queue.go` |
| `config-service/` | `ttl_rules.yaml`, `config_loader.go` |
| `ssl-cert/` | `cert_renewal.py`, `acme_client.py` |
| `dns-routing/` | `geo_resolver.go`, `health_check.go` |
| `origin-failover/` | `failover_policy.go`, `origin_probe.go` |
| `waf-rules/` | `rule_engine.go`, `rulesets/default.yaml` |
| `log-export/` | `exporter.py`, `s3_sink.py` |
| `traffic-shaping/` | |
| `rate-limiter/` | |
| `ddos-mitigation/` | |
| `domain-onboarding/` | |
| `billing-metering/` | |
| `analytics-pipeline/` | |
| `edge-auth/` | |
| `image-optimizer/` | |
| `video-streaming/` | |
| `api-gateway/` | |
| `monitoring-alerts/` | |
| `customer-portal/` | |

Files for the last 12 modules are chosen by the generator.

## Task types (8) and routes

| Type | Share | Main route (probability) | Other routes |
|---|---|---|---|
| Cache purge bug | 18% | Intake → Support → Network Eng → Customer → Closed (65%) | via QA (22%), via Dev (13%) |
| New domain setup | 15% | Intake → Support → Security → Ops → Customer → Closed (70%) | skip Customer (30%) |
| SSL renewal | 12% | Intake → Security → Ops → Closed (75%) | via Customer (25%) |
| Traffic spike | 12% | Intake → Network Eng → Ops → Customer → Closed (60%) | via Dev (25%), direct close (15%) |
| Config change | 13% | Intake → Ops → QA → Customer → Closed (70%) | skip QA (30%) |
| DNS routing issue | 10% | Intake → Support → Network Eng → QA → Closed (60%) | via Customer (40%) |
| Origin failover | 10% | Intake → Network Eng → Dev → QA → Customer → Closed (65%) | skip Dev (35%) |
| Log access request | 10% | Intake → Security → Support → Customer → Closed (80%) | via Ops (20%) |

The rework loop (P3) is applied on top of the chosen route for New domain setup and Log access request: Support → Security is inserted right after the first Security stint.

## Issue families (10)

Recurring problems with consistent fixes, so similar-case search has something real to find. Each family has a task type, linked modules, 3–5 title templates, 3–5 description templates, and 2–3 fix templates. About 40 tasks per family.

| Family | Type | Modules | Typical fix |
|---|---|---|---|
| Purge propagation delay | Cache purge bug | `edge-sync/`, `cdn-cache-purge/` | Lower the propagation batch interval for the region |
| Stale content after purge | Cache purge bug | `config-service/`, `cdn-cache-purge/` | Fix TTL override rule in `ttl_rules.yaml` |
| Partial purge failures | Cache purge bug | `edge-sync/` | Patch retry logic in `propagation.go` |
| Domain onboarding blocked | New domain setup | `domain-onboarding/`, `waf-rules/` | Complete ownership verification; apply default WAF ruleset |
| Cert auto-renew failure | SSL renewal | `ssl-cert/` | Re-validate ACME challenge; fix DNS TXT record |
| Edge overload during spike | Traffic spike | `traffic-shaping/`, `rate-limiter/`, `edge-sync/` | Raise regional capacity; adjust rate-limit thresholds |
| Config rollout regression | Config change | `config-service/`, `api-gateway/` | Roll back config version; add validation rule |
| Geo misrouting | DNS routing issue | `dns-routing/` | Update geo resolver mapping for the region |
| Origin failover not triggering | Origin failover | `origin-failover/`, `monitoring-alerts/` | Tune health-check thresholds in `failover_policy.go` |
| Log export access | Log access request | `log-export/`, `edge-auth/` | Grant scoped bucket access after security approval |

Template placeholders vary the text: client name, region, domain, node count, error codes, etc.

## Planted patterns

`validate_patterns.py` checks every one and fails loudly if any is missing.

| # | Pattern | How it's planted | Validation check |
|---|---|---|---|
| P1 | Routing depends on task type | Per-type route probabilities above | Prediction by (stakeholder, type) beats the baseline by ≥ 10 points top-1. Falls back to stakeholder-only when a pair has < 5 examples. |
| P2 | Security is the bottleneck | Median hold 2.9 days vs 0.2–2.0 elsewhere | Security has the highest median hold, within 2.3–3.5 days |
| P3 | Rework loop | 18% of New domain setup and Log access tasks go Security → Support → Security (assigned by quota, not independent coin flips, so the share stays near 18% on a small sample) | Share of those tasks with a Security → Support → Security sequence within 12–24% (a plain Security → Support rate doesn't work: Log access's main route already has that handoff) |
| P4 | Problem module | `edge-sync/` in 3 families, plus added to 25% of DNS routing / Origin failover tasks | `edge-sync/` ranks #1 by task count |
| P5 | Issue families have consistent fixes | Shared templates per family | Top-3 similar cases share the family ≥ 70% of the time (score = 0.7 × TF-IDF cosine + 0.3 × module Jaccard) |
| P6 | Enterprise clients respond faster | Customer hold × 0.6 for Enterprise | Enterprise median Customer hold < SMB median Customer hold |
| P7 | Holiday traffic spike | Traffic spike weight × 3.5 in Nov–Dec; closed-task creation dates are spread evenly across the year (with jitter) so monthly volume isn't lumpy | Nov–Dec traffic spike volume ≥ 1.5× the monthly average |

### Added for the agent briefing (design v3)

| # | Pattern | How it's planted | Validation check |
|---|---|---|---|
| P8 | Security rework rising | Rework rate for eligible tasks by creation date: 12% before Jul 2026, 30% Jul–Aug, 45% from Sep (separate quota per period) | Share of Security exits sent back to an already-visited team since Jul ≥ 1.5× the rate before Jul |
| P9 | Ops process change | `events.json`: on 2026-08-01 Ops began requiring a rollback plan for config rollouts. Ops holds for tasks created before then are 1.5× longer | Ops median hold after the event ≤ 0.8× before |
| Demo | T-4821 is the most overdue open task | Its hold ratio is set to max(2.8, highest other open task's ratio + 0.15), measured against the generated history | T-4821 has the highest hold ratio of any open task |

Across seeds 1–30, all checks pass for 28. The two misses are near misses: seed 23 has 13 at-risk tasks (limit 12), seed 26 shows Ops only 12% faster (check needs 20%).

## Noise

Keeps the data realistic and gives the cleaning step something to do.

- 8% of tasks take a random detour (one extra stakeholder hop).
- 10% of closed tasks have an empty solution note.
- 5% of tasks have no code areas; 30% get one extra unrelated module.
- 3% of closed tasks have a duplicate consecutive handoff (data-entry mistake); `signal_data.clean_handoffs` merges these.
- **Text overlap** (so similar-case search isn't trivially perfect): 25% of tasks get a vague title ("Issue with {domain}"); 40% get a generic sentence appended ("This is impacting production traffic."); 15% are worded (title + description) like a related family, e.g. a stale-content ticket that reads like a config regression. The family label and code areas stay true.

## Randomness

- Two independent random streams from seed 42: one for structure (clients, types, routes, holds, dates) and one for text and code areas. Changing text noise never re-draws the planted patterns.
- `--seed N --data-dir DIR` generates alternative datasets. All 17 validation checks pass for seeds 1–30, so the patterns don't depend on a lucky seed.

## Open tasks (100)

- Created in the last 30 days, stopped partway through their route.
- About 8 are at risk, so the queue has realistic red flags.
- **At-risk rule:** time with the current stakeholder > 1.5× that stakeholder's median for the task type → **Medium**; > 2× → **High**.
- **T-4821** (Cache purge bug, Northwind Media, family "Purge propagation delay") is guaranteed to exist as the demo task: Intake 0.2d → Support 0.8d → Network Eng (current). Its Network Eng hold is set so it is **High** risk and the most overdue open task (see Demo row above). With seed 42: **4.7 days** vs a 1.6-day median (2.95×).
- Task IDs are sequential by creation time, offset so the demo task is exactly T-4821.

## Output files (`data/`)

All timestamps are ISO 8601 UTC.

| File | Fields |
|---|---|
| `stakeholders.json` | `id`, `name`, `role` |
| `clients.json` | `id`, `name`, `tier`, `region` |
| `modules.json` | `id`, `path`, `description` (one line, shown in the UI), `files[]` |
| `tasks.json` | `id`, `title`, `description`, `client_id`, `type`, `family`, `status` (`open`/`closed`), `created_at`, `closed_at`, `code_areas[]` (file paths like `edge-sync/propagation.go`), `solution_note`, `current_stakeholder` |
| `handoffs.json` | `task_id`, `seq`, `from_stakeholder`, `to_stakeholder`, `entered_at`, `left_at`, `hold_days` |
| `events.json` | `date`, `stakeholder`, `title`, `description` (process changes the briefing can test for an effect) |

Each `handoffs.json` row is one stint: the task arriving at `to_stakeholder` (from `from_stakeholder`, null for the first Intake row) at `entered_at` and leaving at `left_at`. An open task's current stint has `left_at` and `hold_days` null. A closed task ends with a row whose `to_stakeholder` is `closed`; its `entered_at` equals the task's `closed_at`.

## Caveat

This is a small synthetic dataset (400 historical tasks). Accuracy numbers show the pipeline recovers known patterns; they are indicative, not real-world performance.
