"""Generate Relay's synthetic dataset into data/. Implements docs/data-spec.md.

Usage (from repo root, venv active):
    python scripts/generate_data.py [--seed N] [--data-dir DIR]
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import relay_data as rd

SEED = 42
N_CLOSED = 400
N_OPEN = 100
N_AT_RISK = 7  # plus the demo task
HOLD_SIGMA = 0.55  # lognormal spread around each stakeholder's median hold

HISTORY_START = datetime(2025, 10, 1, tzinfo=timezone.utc)
HISTORY_END = datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc)
TODAY = rd.TODAY.to_pydatetime()
OPEN_WINDOW_DAYS = 30

DEMO_ID = "T-4821"
DEMO_RATIO = 2.2  # demo task's hold vs. its (stakeholder, type) median, so it reads as High risk


def make_rngs(seed: int) -> tuple[np.random.Generator, np.random.Generator]:
    """Independent streams: structure (routes, holds, dates, clients) and text/code areas.

    Keeping them separate means tweaking text noise never re-draws the planted patterns.
    """
    structure, text = np.random.SeedSequence(seed).spawn(2)
    return np.random.default_rng(structure), np.random.default_rng(text)


rng, rng_text = make_rngs(SEED)


def pick(items, gen=None):
    gen = gen or rng
    return items[int(gen.integers(len(items)))]


def weighted(items, weights):
    w = np.asarray(weights, dtype=float)
    return items[int(rng.choice(len(items), p=w / w.sum()))]


# ── Entities ────────────────────────────────────────────────────────────────

STAKEHOLDERS = [
    ("intake", "Intake", "Logs and triages new requests", 0.2),
    ("support", "Support", "First-line troubleshooting", 0.8),
    ("network_eng", "Network Eng", "Edge, cache, routing fixes", 1.8),
    ("security", "Security Review", "Certs, WAF, access approvals", 2.9),
    ("ops", "Ops", "Config rollout, deployments", 1.0),
    ("qa", "QA", "Verification before release", 0.7),
    ("dev", "Dev", "Code fixes", 2.0),
    ("customer", "Customer", "Client confirms or provides info", 1.2),
    ("closed", "Closed", "Terminal state", None),
]
MEDIAN_HOLD = {s[0]: s[3] for s in STAKEHOLDERS if s[3] is not None}
CUSTOMER_HOLD_BY_TIER = {"Enterprise": 0.6, "Mid-market": 0.85, "SMB": 1.0}  # P6

CLIENTS = [
    ("Northwind Media", "Enterprise", "NA"),
    ("Lumen Games", "Enterprise", "APAC"),
    ("Kestrel Retail", "Enterprise", "EU"),
    ("Halcyon Bank", "Enterprise", "APAC"),
    ("Orbital Streaming", "Enterprise", "NA"),
    ("Fernway Travel", "Mid-market", "EU"),
    ("Copperleaf Health", "Mid-market", "NA"),
    ("Tidepool Apps", "Mid-market", "APAC"),
    ("Saffron Foods", "Mid-market", "APAC"),
    ("Brightline Sports", "Mid-market", "LATAM"),
    ("Quillstone Publishing", "Mid-market", "EU"),
    ("Pebble Labs", "SMB", "NA"),
    ("Mosaic Studio", "SMB", "LATAM"),
    ("Juniper Analytics", "SMB", "EU"),
    ("Driftwood Outdoor", "SMB", "LATAM"),
]
CLIENT_WEIGHT = {"Enterprise": 3, "Mid-market": 2, "SMB": 1}

POPS = {
    "APAC": ["Singapore", "Tokyo", "Sydney", "Mumbai"],
    "NA": ["Ashburn", "Dallas", "San Jose", "Toronto"],
    "EU": ["Frankfurt", "Amsterdam", "London", "Paris"],
    "LATAM": ["São Paulo", "Santiago", "Bogotá", "Mexico City"],
}

MODULES = {
    "edge-sync": ["propagation.go", "batch_scheduler.go", "node_registry.go"],
    "cdn-cache-purge": ["purge_api.go", "purge_queue.go"],
    "config-service": ["ttl_rules.yaml", "config_loader.go"],
    "ssl-cert": ["cert_renewal.py", "acme_client.py"],
    "dns-routing": ["geo_resolver.go", "health_check.go"],
    "origin-failover": ["failover_policy.go", "origin_probe.go"],
    "waf-rules": ["rule_engine.go", "rulesets/default.yaml"],
    "log-export": ["exporter.py", "s3_sink.py"],
    "traffic-shaping": ["shaper.go", "qos_policy.yaml"],
    "rate-limiter": ["limiter.go", "thresholds.yaml"],
    "ddos-mitigation": ["scrubber.go", "signatures.yaml"],
    "domain-onboarding": ["verify_ownership.py", "onboarding_flow.py"],
    "billing-metering": ["meter.go", "usage_rollup.py"],
    "analytics-pipeline": ["ingest.py", "aggregate.sql"],
    "edge-auth": ["token_validator.go", "signed_urls.go"],
    "image-optimizer": ["resize.go", "formats.yaml"],
    "video-streaming": ["hls_packager.go", "segmenter.go"],
    "api-gateway": ["router.go", "middleware.go"],
    "monitoring-alerts": ["alert_rules.yaml", "notifier.py"],
    "customer-portal": ["settings_page.tsx", "api_client.ts"],
}

# ── Task types and routes ──────────────────────────────────────────────────

I, SU, NE, SE, OP, QA, DV, CU, CL = (
    "intake", "support", "network_eng", "security", "ops", "qa", "dev", "customer", "closed"
)

TYPES = {
    # type: (share, [(probability, route), ...])
    "Cache purge bug": (0.18, [
        (0.65, [I, SU, NE, CU, CL]),
        (0.22, [I, SU, NE, QA, CU, CL]),
        (0.13, [I, SU, NE, DV, CU, CL]),
    ]),
    "New domain setup": (0.15, [
        (0.70, [I, SU, SE, OP, CU, CL]),
        (0.30, [I, SU, SE, OP, CL]),
    ]),
    "SSL renewal": (0.12, [
        (0.75, [I, SE, OP, CL]),
        (0.25, [I, SE, OP, CU, CL]),
    ]),
    "Traffic spike": (0.12, [
        (0.60, [I, NE, OP, CU, CL]),
        (0.25, [I, NE, DV, OP, CU, CL]),
        (0.15, [I, NE, CL]),
    ]),
    "Config change": (0.13, [
        (0.70, [I, OP, QA, CU, CL]),
        (0.30, [I, OP, CU, CL]),
    ]),
    "DNS routing issue": (0.10, [
        (0.60, [I, SU, NE, QA, CL]),
        (0.40, [I, SU, NE, CU, CL]),
    ]),
    "Origin failover": (0.10, [
        (0.65, [I, NE, DV, QA, CU, CL]),
        (0.35, [I, NE, QA, CU, CL]),
    ]),
    "Log access request": (0.10, [
        (0.80, [I, SE, SU, CU, CL]),
        (0.20, [I, SE, OP, SU, CU, CL]),
    ]),
}
TYPE_NAMES = list(TYPES)
REWORK_TYPES = {"New domain setup", "Log access request"}
REWORK_RATE = 0.18  # P3
DETOUR_RATE = 0.08
SEASONAL_TYPE = "Traffic spike"
SEASONAL_MONTHS = {11, 12}
SEASONAL_FACTOR = 3.5  # P7

# ── Issue families (templates) ─────────────────────────────────────────────

FAMILIES = {
    "purge_propagation_delay": {
        "type": "Cache purge bug",
        "modules": ["edge-sync", "cdn-cache-purge"],
        "titles": [
            "Cache purge not propagating to edge nodes",
            "Purge requests delayed on {region} edges",
            "Purged content still served from {pop} for {minutes} min",
            "Slow purge propagation for {domain}",
        ],
        "descriptions": [
            "{client} reports purge requests for {domain} take {minutes} minutes to reach edge nodes in {region}. {nodes} nodes in {pop} still served old objects after the purge completed in the console.",
            "After issuing a purge for {domain}, {client} sees stale assets on {pop} edges for up to {minutes} minutes. The propagation queue shows a backlog on {nodes} nodes.",
            "Purge status shows complete but {pct}% of {region} edge nodes kept serving cached content for {domain}. {client} needs purges to land within 5 minutes for releases.",
        ],
        "fixes": [
            "Lowered the edge-sync propagation batch interval for {region} from 60s to 15s; purges now land in under 2 minutes.",
            "Increased propagation workers for {pop} and lowered the batch interval; verified with test purges on {domain}.",
            "Tuned the batch_scheduler.go interval for the {region} node group; backlog cleared and purge latency back under SLA.",
        ],
    },
    "stale_content_after_purge": {
        "type": "Cache purge bug",
        "modules": ["config-service", "cdn-cache-purge"],
        "titles": [
            "Stale content served after purge",
            "Old assets returned after successful purge on {domain}",
            "Purge succeeds but users still get outdated files",
            "Cache serving outdated JS/CSS for {domain}",
        ],
        "descriptions": [
            "{client} purged {domain} successfully but users in {region} still receive outdated JS and CSS files. Response headers show Age values above the configured TTL.",
            "Objects on {domain} are served from cache instead of origin after purge. A TTL override for the /static path appears to ignore purge events.",
            "After a deploy, {client} purged {domain} but {pct}% of requests still return old file hashes. Origin sends Cache-Control no-cache but edges keep a long TTL.",
        ],
        "fixes": [
            "Fixed a TTL override rule in ttl_rules.yaml that pinned /static to 7 days regardless of purge; redeployed config.",
            "Removed a conflicting TTL override for {domain} in config-service and re-purged; edges now respect origin Cache-Control.",
            "Corrected path-matching order in ttl_rules.yaml so origin headers take precedence; verified fresh assets in {pop}.",
        ],
    },
    "partial_purge_failures": {
        "type": "Cache purge bug",
        "modules": ["edge-sync"],
        "titles": [
            "Partial purge failures on edge nodes",
            "Purge fails on some nodes with {code} errors",
            "Intermittent purge failures for {domain}",
            "Purge API reports partial success",
        ],
        "descriptions": [
            "Purge API returns partial success for {domain}: {nodes} nodes in {region} respond with {code} and are never retried. {client} has to purge multiple times.",
            "{client} sees purge jobs finish with {pct}% of nodes failed. Logs show timeouts from node_registry on {pop} edges.",
            "Purges for {domain} intermittently fail on a subset of {region} nodes; failed nodes are not retried and keep stale content.",
        ],
        "fixes": [
            "Patched retry logic in propagation.go to retry failed nodes with backoff; partial failures dropped to zero in testing.",
            "Added retry with exponential backoff for {code} responses in edge-sync propagation; re-ran the purge for {domain} successfully.",
            "Fixed a node_registry timeout and added retries for failed purge targets; confirmed full success across {pop}.",
        ],
    },
    "domain_onboarding_blocked": {
        "type": "New domain setup",
        "modules": ["domain-onboarding", "waf-rules"],
        "titles": [
            "New domain setup blocked for {domain}",
            "Cannot activate CDN for {domain}",
            "Domain onboarding stuck at verification",
            "Onboarding {domain} fails security checks",
        ],
        "descriptions": [
            "{client} is onboarding {domain} but ownership verification has been pending for days. The domain cannot go live until verification and the WAF baseline are applied.",
            "Activation of {domain} is stuck: the verification TXT record is not detected and no WAF policy is attached. {client} plans to launch in {region} next week.",
            "{client} added {domain} in the portal but it fails onboarding security checks; the default WAF ruleset was not applied.",
        ],
        "fixes": [
            "Completed ownership verification after the client corrected the TXT record; applied the default WAF ruleset and activated the domain.",
            "Manually verified domain ownership, attached the default WAF ruleset, and rolled out config to {region} edges.",
            "Fixed subdomain lookup in verify_ownership.py; applied baseline WAF rules and activated {domain}.",
        ],
    },
    "cert_autorenew_failure": {
        "type": "SSL renewal",
        "modules": ["ssl-cert"],
        "titles": [
            "SSL certificate auto-renewal failed for {domain}",
            "Cert expiring in {days} days, renewal not triggered",
            "ACME challenge failing for {domain}",
            "HTTPS warnings after certificate expiry alert",
        ],
        "descriptions": [
            "Auto-renewal for {domain} failed: the ACME DNS challenge could not validate. The certificate expires in {days} days and {client} sees warnings in the portal.",
            "{client} received expiry alerts for {domain}. Renewal job logs show the DNS TXT record for the ACME challenge is missing.",
            "Certificate renewal for {domain} keeps failing validation; {client} recently moved DNS providers.",
        ],
        "fixes": [
            "Re-validated the ACME challenge after fixing the DNS TXT record at the client's new DNS provider; certificate renewed.",
            "Updated acme_client.py to use the delegated challenge record; renewal succeeded and expiry alerts cleared.",
            "Worked with {client} to restore the _acme-challenge CNAME; re-ran renewal and confirmed the new cert on {pop} edges.",
        ],
    },
    "edge_overload_spike": {
        "type": "Traffic spike",
        "modules": ["traffic-shaping", "rate-limiter", "edge-sync"],
        "titles": [
            "Traffic spike overloading {pop} edges",
            "Latency spike during {client} campaign",
            "{pct}% error rate during traffic surge",
            "Edge capacity exhausted in {region}",
        ],
        "descriptions": [
            "{client} traffic to {domain} jumped {x}x during a campaign; {pop} edges hit CPU limits and {pct}% of requests returned {code}.",
            "Sudden surge on {domain} in {region}; the rate limiter throttled legitimate users and p95 latency rose above 2s.",
            "{client} is seeing peak traffic; {region} capacity is saturated and edge-sync lags behind under load.",
        ],
        "fixes": [
            "Raised regional capacity for {region} and adjusted rate-limit thresholds for {domain}; errors returned to baseline.",
            "Shifted traffic to neighboring POPs with a traffic-shaping policy and raised rate-limiter thresholds during the campaign.",
            "Added temporary capacity in {pop} and tuned thresholds.yaml for {client}; latency back under 300ms.",
        ],
    },
    "config_rollout_regression": {
        "type": "Config change",
        "modules": ["config-service", "api-gateway"],
        "titles": [
            "Config change caused regression on {domain}",
            "Requests failing after config rollout",
            "{code} errors after header rule change",
            "Rollback needed for {client} config update",
        ],
        "descriptions": [
            "After rolling out config version {version} for {domain}, {pct}% of API requests return {code}. {client} requested an urgent fix.",
            "A routing rule change for {client} broke redirects on {domain} in {region}. The issue started right after the config deploy.",
            "{client} config update {version} introduced a header rewrite that the api-gateway rejects.",
        ],
        "fixes": [
            "Rolled back {domain} to the previous config version and added a validation rule to block malformed header rewrites.",
            "Reverted config {version}, fixed the redirect rule, and added a pre-deploy validation check in config_loader.go.",
            "Rolled back, corrected the gateway middleware rule, and redeployed with config validation enabled.",
        ],
    },
    "geo_misrouting": {
        "type": "DNS routing issue",
        "modules": ["dns-routing"],
        "titles": [
            "Users in {region} routed to wrong POP",
            "Geo DNS misrouting for {domain}",
            "High latency from {region} due to routing",
            "DNS resolving {domain} to a distant edge",
        ],
        "descriptions": [
            "{client} users in {region} are being resolved to edges outside the region, adding 150ms+ latency on {domain}.",
            "The geo resolver maps a {region} ISP range to the wrong POP; {client} traffic meant for {pop} is served elsewhere.",
            "After a network change, {domain} resolves to a far-away edge for {pct}% of {region} users.",
        ],
        "fixes": [
            "Updated the geo resolver mapping for the affected {region} ISP ranges; traffic now lands on {pop}.",
            "Corrected the IP range table in geo_resolver.go and refreshed DNS; latency back to normal for {client}.",
            "Fixed health_check flapping that pulled {pop} out of rotation; geo routing restored.",
        ],
    },
    "origin_failover_not_triggering": {
        "type": "Origin failover",
        "modules": ["origin-failover", "monitoring-alerts"],
        "titles": [
            "Origin failover not triggering for {domain}",
            "Primary origin down but no failover",
            "Failover delayed {minutes} min during origin outage",
            "Backup origin never received traffic",
        ],
        "descriptions": [
            "{client}'s primary origin for {domain} went down but edges kept retrying it for {minutes} minutes instead of failing over.",
            "Health checks marked the origin unhealthy but the failover policy did not switch {domain} to the backup origin.",
            "During a {client} origin outage, {pct}% of requests in {region} failed with {code} because failover never triggered.",
        ],
        "fixes": [
            "Tuned health-check thresholds in failover_policy.go so failover triggers after 3 failed probes instead of 10.",
            "Fixed the origin_probe timeout and failover threshold for {domain}; tested failover end to end with {client}.",
            "Lowered the failover threshold and added an alert in monitoring-alerts for failover events.",
        ],
    },
    "log_export_access": {
        "type": "Log access request",
        "modules": ["log-export", "edge-auth"],
        "titles": [
            "Request for log export access",
            "{client} needs raw logs for {domain}",
            "Set up log delivery for {domain}",
            "Log access request for security audit",
        ],
        "descriptions": [
            "{client} requests raw access logs for {domain} delivered to their storage bucket for an audit.",
            "{client}'s security team needs edge logs for {domain} for the last 30 days; requires approval and scoped credentials.",
            "Set up log export for {domain} to {client}'s bucket in {region}; access must be limited to their domains.",
        ],
        "fixes": [
            "Granted scoped bucket access after security approval; log export for {domain} runs hourly.",
            "Security approved the request; configured s3_sink with signed credentials limited to {domain}.",
            "Enabled log export with an edge-auth scoped token after review; the client confirmed receipt.",
        ],
    },
}
FAMILIES_BY_TYPE = {t: [f for f, spec in FAMILIES.items() if spec["type"] == t] for t in TYPES}

# Text overlap, so similar-case search isn't trivially perfect (target ~80–90% on P5).
VAGUE_TITLE_RATE = 0.25
VAGUE_TITLES = [
    "Issue with {domain}",
    "{client} escalation: {domain}",
    "Urgent: problem reported in {region}",
    "Customer reports errors on {domain}",
    "Follow-up on {client} ticket",
]
GENERIC_SENTENCE_RATE = 0.40
GENERIC_SENTENCES = [
    "This is impacting production traffic.",
    "{client} escalated via their account manager.",
    "The issue started after the weekend maintenance window.",
    "Please prioritize, this affects an upcoming launch.",
    "Errors and latency are visible in the {region} dashboards.",
    "Edge nodes in {pop} are affected.",
]
CONFUSED_WORDING_RATE = 0.15  # reporter describes it (title + description) like a related problem
CONFUSABLE = {
    "purge_propagation_delay": "partial_purge_failures",
    "partial_purge_failures": "purge_propagation_delay",
    "stale_content_after_purge": "config_rollout_regression",
    "config_rollout_regression": "stale_content_after_purge",
    "edge_overload_spike": "purge_propagation_delay",
    "geo_misrouting": "origin_failover_not_triggering",
    "origin_failover_not_triggering": "geo_misrouting",
    "domain_onboarding_blocked": "cert_autorenew_failure",
    "cert_autorenew_failure": "domain_onboarding_blocked",
    "log_export_access": "domain_onboarding_blocked",
}

EMPTY_NOTE_RATE = 0.10
NO_CODE_AREAS_RATE = 0.05
DUPLICATE_RATE = 0.03
EXTRA_MODULE_RATE = 0.30
EDGE_SYNC_EXTRA_TYPES = {"DNS routing issue", "Origin failover"}  # P4
EDGE_SYNC_EXTRA_RATE = 0.25

# ── Builders ───────────────────────────────────────────────────────────────


def build_clients():
    rows = []
    for i, (name, tier, region) in enumerate(CLIENTS, start=1):
        rows.append({"id": f"c{i:02d}", "name": name, "tier": tier, "region": region,
                     "slug": name.lower().replace(" ", "")})
    return rows


def pick_client(clients):
    return weighted(clients, [CLIENT_WEIGHT[c["tier"]] for c in clients])


def pick_type(created: datetime) -> str:
    weights = [TYPES[t][0] for t in TYPE_NAMES]
    if created.month in SEASONAL_MONTHS:
        weights[TYPE_NAMES.index(SEASONAL_TYPE)] *= SEASONAL_FACTOR
    return weighted(TYPE_NAMES, weights)


rework_quota = {"eligible": 0, "reworked": 0}


def wants_rework() -> bool:
    """Systematic sampling: keeps the running rework share at REWORK_RATE (P3) instead of
    leaving it to independent coin flips, which swing ±4 points over ~100 tasks."""
    rework_quota["eligible"] += 1
    shortfall = REWORK_RATE * rework_quota["eligible"] - rework_quota["reworked"]
    if rng.random() < shortfall:
        rework_quota["reworked"] += 1
        return True
    return False


def build_route(task_type: str) -> list[str]:
    options = TYPES[task_type][1]
    route = list(weighted([r for _, r in options], [p for p, _ in options]))
    if task_type in REWORK_TYPES and wants_rework():
        i = route.index(SE)
        route[i + 1:i + 1] = [SU, SE]
    if rng.random() < DETOUR_RATE:
        pos = int(rng.integers(1, len(route) - 1))
        candidates = [s for s in (SU, NE, SE, OP, QA, DV, CU) if s not in (route[pos - 1], route[pos])]
        route.insert(pos, pick(candidates))
    return route


def sample_hold(stakeholder: str, tier: str) -> float:
    median = MEDIAN_HOLD[stakeholder]
    if stakeholder == CU:
        median *= CUSTOMER_HOLD_BY_TIER[tier]
    return max(0.05, float(rng.lognormal(np.log(median), HOLD_SIGMA)))


def text_values(client: dict) -> dict:
    return {
        "client": client["name"],
        "region": client["region"],
        "pop": pick(POPS[client["region"]], rng_text),
        "domain": f"{pick(['www', 'static', 'api', 'cdn', 'media'], rng_text)}.{client['slug']}.com",
        "nodes": int(rng_text.integers(3, 40)),
        "pct": int(rng_text.integers(5, 45)),
        "minutes": int(rng_text.integers(10, 90)),
        "code": pick(["502", "503", "504", "408"], rng_text),
        "days": int(rng_text.integers(3, 14)),
        "x": int(rng_text.integers(3, 12)),
        "version": f"v{int(rng_text.integers(40, 99))}",
    }


def build_code_areas(family: str, task_type: str) -> list[str]:
    g = rng_text
    if g.random() < NO_CODE_AREAS_RATE:
        return []
    modules = list(FAMILIES[family]["modules"])
    if task_type in EDGE_SYNC_EXTRA_TYPES and g.random() < EDGE_SYNC_EXTRA_RATE:
        modules.append("edge-sync")
    if g.random() < EXTRA_MODULE_RATE:
        modules.append(pick([m for m in MODULES if m not in modules], g))
    files = set()
    for m in modules:
        n = int(g.integers(1, min(2, len(MODULES[m])) + 1))
        for f in g.choice(MODULES[m], size=n, replace=False):
            files.add(f"{m}/{f}")
    return sorted(files)


def make_task(client: dict, task_type: str, created: datetime, status: str) -> dict:
    family = pick(FAMILIES_BY_TYPE[task_type])
    spec = FAMILIES[family]
    g = rng_text
    values = text_values(client)
    note = pick(spec["fixes"], g).format(**values)
    wording = FAMILIES[CONFUSABLE[family]] if g.random() < CONFUSED_WORDING_RATE else spec
    title = pick(VAGUE_TITLES if g.random() < VAGUE_TITLE_RATE else wording["titles"], g)
    description = pick(wording["descriptions"], g)
    if g.random() < GENERIC_SENTENCE_RATE:
        description += " " + pick(GENERIC_SENTENCES, g)
    return {
        "client": client,
        "type": task_type,
        "family": family,
        "title": title.format(**values),
        "description": description.format(**values),
        "solution_note": note if status == "closed" and g.random() >= EMPTY_NOTE_RATE else "",
        "code_areas": build_code_areas(family, task_type),
        "created_at": created,
        "status": status,
    }


def iso(dt: datetime | None) -> str | None:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def stint_rows(stints: list[tuple[str, float | None]], created: datetime, closed: bool) -> list[dict]:
    """Turn [(stakeholder, hold_days)] into handoff rows. hold None = current (open) stint."""
    rows, t, prev = [], created, None
    for stakeholder, hold in stints:
        left = t + timedelta(days=hold) if hold is not None else None
        rows.append({"from_stakeholder": prev, "to_stakeholder": stakeholder,
                     "entered_at": t, "left_at": left,
                     "hold_days": round(hold, 2) if hold is not None else None})
        prev, t = stakeholder, left
    if closed:
        rows.append({"from_stakeholder": prev, "to_stakeholder": CL,
                     "entered_at": t, "left_at": None, "hold_days": None})
    return rows


def split_duplicate(rows: list[dict]) -> list[dict]:
    """Noise: split one completed stint into two consecutive rows for the same stakeholder."""
    candidates = [i for i, r in enumerate(rows) if r["hold_days"] is not None]
    i = pick(candidates)
    r = rows[i]
    frac = float(rng.uniform(0.2, 0.8))
    mid = r["entered_at"] + (r["left_at"] - r["entered_at"]) * frac
    first = {**r, "left_at": mid, "hold_days": round(r["hold_days"] * frac, 2)}
    second = {"from_stakeholder": r["to_stakeholder"], "to_stakeholder": r["to_stakeholder"],
              "entered_at": mid, "left_at": r["left_at"],
              "hold_days": round(r["hold_days"] - first["hold_days"], 2)}
    return rows[:i] + [first, second] + rows[i + 1:]


def generate_closed(clients) -> list[dict]:
    tasks = []
    span = (HISTORY_END - HISTORY_START).total_seconds()
    for k in range(N_CLOSED):
        # Stratified: evenly spread over the year with jitter, so monthly volume isn't lumpy
        created = HISTORY_START + timedelta(seconds=span * (k + float(rng.uniform())) / N_CLOSED)
        client = pick_client(clients)
        task_type = pick_type(created)
        route = build_route(task_type)
        stints = [(s, sample_hold(s, client["tier"])) for s in route[:-1]]
        duration = timedelta(days=sum(h for _, h in stints))
        if created + duration > HISTORY_END:  # must be resolved inside the history window
            created = HISTORY_END - duration - timedelta(hours=float(rng.uniform(1, 48)))
        created = created.replace(second=0, microsecond=0)
        task = make_task(client, task_type, created, "closed")
        rows = stint_rows(stints, created, closed=True)
        if rng.random() < DUPLICATE_RATE:
            rows = split_duplicate(rows)
        task["rows"] = rows
        task["closed_at"] = rows[-1]["entered_at"]
        task["current_stakeholder"] = CL
        tasks.append(task)
    return tasks


def network_eng_cache_median(closed_tasks) -> float:
    holds = []
    for t in closed_tasks:
        if t["type"] != "Cache purge bug":
            continue
        for r in t["rows"]:
            if r["to_stakeholder"] != NE:
                continue
            if r["from_stakeholder"] == NE:  # duplicate split: belongs to the previous stint
                holds[-1] += r["hold_days"]
            else:
                holds.append(r["hold_days"])
    return float(np.median(holds))


def generate_open(clients) -> list[dict]:
    tasks = []
    at_risk = set(rng.choice(N_OPEN - 1, size=N_AT_RISK, replace=False).tolist())
    for k in range(N_OPEN - 1):
        while True:
            client = pick_client(clients)
            task_type = pick_type(TODAY)
            route = build_route(task_type)
            stakeholders = route[:-1]
            i = int(rng.integers(1, len(stakeholders)))
            prior = [(s, sample_hold(s, client["tier"])) for s in stakeholders[:i]]
            current = stakeholders[i]
            ratio = rng.uniform(1.6, 2.8) if k in at_risk else rng.uniform(0.05, 1.2)
            median = MEDIAN_HOLD[current] * (CUSTOMER_HOLD_BY_TIER[client["tier"]] if current == CU else 1)
            elapsed = float(ratio * median)
            created = TODAY - timedelta(days=sum(h for _, h in prior) + elapsed)
            if (TODAY - created).days < OPEN_WINDOW_DAYS:
                break
        created = created.replace(second=0, microsecond=0)
        task = make_task(client, task_type, created, "open")
        task["rows"] = stint_rows(prior + [(current, None)], created, closed=False)
        task["closed_at"] = None
        task["current_stakeholder"] = current
        tasks.append(task)
    return tasks


def demo_task(clients, ne_median: float) -> dict:
    """T-4821: the task the demo script walks through (see data-spec.md)."""
    client = next(c for c in clients if c["name"] == "Northwind Media")
    elapsed = round(DEMO_RATIO * ne_median, 1)
    prior = [(I, 0.2), (SU, 0.8)]
    created = (TODAY - timedelta(days=sum(h for _, h in prior) + elapsed)).replace(second=0, microsecond=0)
    domain = "static.northwindmedia.com"
    return {
        "client": client,
        "type": "Cache purge bug",
        "family": "purge_propagation_delay",
        "title": "Cache purge not propagating to edge nodes",
        "description": f"Northwind Media reports purge requests for {domain} take 45 minutes to reach edge "
                       "nodes in NA. 18 nodes in Ashburn still served old objects after the purge "
                       "completed in the console, delaying their product launch assets.",
        "solution_note": "",
        "code_areas": ["cdn-cache-purge/purge_queue.go", "config-service/ttl_rules.yaml",
                       "edge-sync/propagation.go"],
        "created_at": created,
        "status": "open",
        "rows": stint_rows(prior + [(NE, None)], created, closed=False),
        "closed_at": None,
        "current_stakeholder": NE,
        "is_demo": True,
    }


def assign_ids(tasks: list[dict]) -> None:
    """Sequential IDs by creation time, offset so the demo task is exactly T-4821."""
    tasks.sort(key=lambda t: t["created_at"])
    demo_rank = next(i for i, t in enumerate(tasks) if t.get("is_demo"))
    base = int(DEMO_ID.split("-")[1]) - demo_rank
    for i, t in enumerate(tasks):
        t["id"] = f"T-{base + i}"


def write_json(data_dir: Path, name: str, rows) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    with open(data_dir / f"{name}.json", "w") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--data-dir", type=Path, default=rd.DATA_DIR)
    args = parser.parse_args()
    global rng, rng_text
    rng, rng_text = make_rngs(args.seed)

    clients = build_clients()
    closed = generate_closed(clients)
    ne_median = network_eng_cache_median(closed)
    tasks = closed + generate_open(clients) + [demo_task(clients, ne_median)]
    assign_ids(tasks)

    task_rows, handoff_rows = [], []
    for t in tasks:
        task_rows.append({
            "id": t["id"],
            "title": t["title"],
            "description": t["description"],
            "client_id": t["client"]["id"],
            "type": t["type"],
            "family": t["family"],
            "status": t["status"],
            "created_at": iso(t["created_at"]),
            "closed_at": iso(t["closed_at"]),
            "code_areas": t["code_areas"],
            "solution_note": t["solution_note"],
            "current_stakeholder": t["current_stakeholder"],
        })
        for seq, r in enumerate(t["rows"], start=1):
            handoff_rows.append({
                "task_id": t["id"],
                "seq": seq,
                "from_stakeholder": r["from_stakeholder"],
                "to_stakeholder": r["to_stakeholder"],
                "entered_at": iso(r["entered_at"]),
                "left_at": iso(r["left_at"]),
                "hold_days": r["hold_days"],
            })

    write_json(args.data_dir, "stakeholders", [{"id": s, "name": n, "role": r} for s, n, r, _ in STAKEHOLDERS])
    write_json(args.data_dir, "clients", [{k: c[k] for k in ("id", "name", "tier", "region")} for c in clients])
    write_json(args.data_dir, "modules", [{"id": m, "path": f"{m}/", "files": files} for m, files in MODULES.items()])
    write_json(args.data_dir, "tasks", task_rows)
    write_json(args.data_dir, "handoffs", handoff_rows)

    n_open = sum(t["status"] == "open" for t in tasks)
    print(f"Wrote {len(tasks)} tasks ({len(tasks) - n_open} closed, {n_open} open), "
          f"{len(handoff_rows)} handoff rows to {args.data_dir}/ (seed {args.seed})")
    print(f"Demo task {DEMO_ID}: Network Eng hold {round(DEMO_RATIO * ne_median, 1)}d "
          f"(cache-type median {ne_median:.2f}d)")


if __name__ == "__main__":
    main()
