"""Build the agent briefing: detectors find insights in the data; Claude writes the wording.

Writes data/artifacts/briefing.json. Every insight is backed by computed facts (numbers, task IDs).
Claude (Haiku) turns each fact set into a title and body; a check rejects any wording containing a
number that isn't in the facts, falling back to a plain template. Wording is cached by input hash.
Run after build_artifacts.py. Needs ANTHROPIC_API_KEY for the wording (env or .env.local);
without it, templates are used.

Usage (from repo root, venv active):
    python scripts/build_briefing.py [--no-llm]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

import signal_data as rd
import signal_model as rm
from summarize_tasks import load_env

MODEL = "claude-haiku-5-5"
ARTIFACTS = rd.DATA_DIR / "artifacts"
OUT = ARTIFACTS / "briefing.json"
CACHE = ARTIFACTS / "briefing_text_cache.json"
TREND_SPLIT = pd.Timestamp("2026-07-01T00:00:00Z")
MIN_MODULE_AT_RISK = 3
MIN_CLIENT_WAITING = 2
CLIENT_WAIT_SIGNIFICANT = 1.5  # longest wait vs the client's usual response time
CLIENT_SLOWER_SIGNIFICANT = 1.25  # client's usual response vs other clients
MIN_EVENT_EFFECT = 0.2

WRITER_SYSTEM = """You write one insight card for a morning briefing read by technical program managers at a CDN company. The card was found by an automated detector; you only phrase it.

Return exactly two lines:
TITLE: one sentence, at most 16 words, stating the finding with its key number.
BODY: at most 2 sentences (under 45 words) giving the evidence and why it matters.

Use only the facts provided. Every number you write must appear in the facts exactly as given (same rounding). Do not invent causes, teams, clients, or fixes. Plain text, no markdown."""


def pct(x: float) -> str:
    return f"{x * 100:.0f}%"


# ── Detectors ──

def featured(ctx) -> dict | None:
    """The at-risk task furthest past its normal pace that has a proven fix from a similar case."""
    risk = ctx["risk"].sort_values("hold_ratio", ascending=False)
    for r in risk[risk["risk"] == "High"].itertuples():
        match = next((m for m in ctx["similar"][r.task_id][:3] if m["solution_note"]), None)
        if not match:
            continue
        stk = ctx["names"][r.stakeholder]
        pred = ctx["preds"][r.task_id]
        task = ctx["tasks"][r.task_id]
        facts = {
            "task": r.task_id, "client": ctx["client"][r.task_id], "type": r.type, "stakeholder": stk,
            "days_with_stakeholder": round(r.hold_days, 1), "stakeholder_median_days": round(r.median_hold, 1),
            "times_median": round(r.hold_ratio, 1), "estimated_close": pd.Timestamp(pred["estimated_close"]).strftime("%b %-d"),
            "similar_case": match["task_id"], "similar_client": match["client"], "similar_match": pct(match["score"]),
            "similar_fix": match["solution_note"],
            "task_title": task["title"],
        }
        return {
            "kind": "need", "id": "featured", "facts": facts,
            "meta": f"Risk · {facts['client']}",
            "fallback_title": f"{r.task_id} has been with {stk} {facts['times_median']}× longer than usual, and {match['task_id']} shows a fix.",
            "fallback_body": f"It has sat with {stk} for {facts['days_with_stakeholder']} days against a {facts['stakeholder_median_days']}-day median. "
                             f"The closest past case, {match['task_id']} ({facts['similar_match']} match), was fixed this way: {match['solution_note']}",
            "bars": [
                {"label": f"{r.task_id} with {stk}", "value": facts["days_with_stakeholder"], "unit": "d", "tone": "red"},
                {"label": "Stakeholder median", "value": facts["stakeholder_median_days"], "unit": "d", "tone": "muted"},
            ],
            "evidence": [r.task_id, match["task_id"]],
            "actions": [
                {"label": f"Open {r.task_id}", "href": f"/task/{r.task_id}", "primary": True},
                {"label": "Ask agent why", "ask": f"Why is {r.task_id} at risk?"},
                {"label": f"Draft ping to {stk}", "ask": f"Draft a ping to {stk} about {r.task_id}"},
            ],
        }
    return None


def module_behind_risk(ctx) -> dict | None:
    at_risk = ctx["risk"][ctx["risk"]["risk"] != "Low"]
    counts: dict[str, list[str]] = {}
    for tid in at_risk["task_id"]:
        for m in rm.module_set(ctx["tasks"][tid]["code_areas"]):
            counts.setdefault(m, []).append(tid)
    ranked = sorted(counts.items(), key=lambda kv: (-len(kv[1]), kv[0]))  # name breaks ties deterministically
    if not ranked or len(ranked[0][1]) < MIN_MODULE_AT_RISK:
        return None
    mod, ids = ranked[0]
    clients = sorted({ctx["client"][t] for t in ids})
    modules_12mo = ctx["pmap"]["365"]["modules"]
    total_12mo = next(m["count"] for m in modules_12mo if m["id"] == mod)
    is_top = modules_12mo[0]["id"] == mod
    facts = {"module": f"{mod}/", "at_risk_tasks_touching_module": len(ids), "at_risk_tasks_total": len(at_risk),
             "clients_affected": clients, "client_count": len(clients), "tasks_touching_module_12_months": total_12mo,
             "most_tasks_of_any_module": is_top}
    return {
        "kind": "need", "id": "module", "facts": facts,
        "meta": f"Risk · {len(clients)} clients affected",
        "fallback_title": f"{mod}/ sits behind {len(ids)} of the {len(at_risk)} at-risk tasks.",
        "fallback_body": f"{', '.join(clients[:3])}{' and others' if len(clients) > 3 else ''} are waiting on it. "
                         f"It has touched {total_12mo} tasks in the last 12 months"
                         f"{', more than any other module' if is_top else ''}.",
        "bars": [{"label": f"{m}/", "value": len(t), "unit": " at-risk", "tone": "red" if i == 0 else "accent"} for i, (m, t) in enumerate(ranked[:3])],
        "evidence": ids[:4],
        "actions": [{"label": "Ask agent", "ask": f"Which clients are blocked on {mod}/?"},
                    {"label": "See modules on map", "href": "/process"}],
    }


def client_waits(ctx) -> dict | None:
    at_customer = ctx["risk"][ctx["risk"]["stakeholder"] == "customer"].copy()
    at_customer["client"] = at_customer["task_id"].map(ctx["client"])
    groups = at_customer.groupby("client")["task_id"].apply(list)
    groups = groups[groups.apply(len) >= MIN_CLIENT_WAITING]
    hist = ctx["s"][(ctx["s"]["stakeholder"] == "customer") & ctx["s"]["left_at"].notna()].copy()
    hist["client"] = hist["task_id"].map(ctx["client"])

    def stats(c):
        waiting = at_customer[at_customer["client"] == c]
        theirs = hist.loc[hist["client"] == c, "hold_days"].median()
        others = hist.loc[hist["client"] != c, "hold_days"].median()
        return waiting, theirs, others

    # Only a finding if something is actually slow: a wait well past the client's norm, or a slow client
    def significant(c):
        waiting, theirs, others = stats(c)
        return waiting["hold_days"].max() >= CLIENT_WAIT_SIGNIFICANT * theirs or theirs >= CLIENT_SLOWER_SIGNIFICANT * others

    candidates = [c for c in groups.index if significant(c)]
    if not candidates:
        return None
    client = max(candidates, key=lambda c: (len(groups[c]), at_customer.loc[at_customer["client"] == c, "hold_days"].sum()))
    ids = groups[client]
    waiting, theirs, others = stats(client)
    facts = {"client": client, "tasks_waiting_on_client": len(ids), "task_ids": ids,
             "longest_wait_days": round(waiting["hold_days"].max(), 1),
             "client_median_response_days": round(theirs, 1), "other_clients_median_response_days": round(others, 1)}
    return {
        "kind": "need", "id": "client", "facts": facts,
        "meta": f"Client wait · {client}",
        "fallback_title": f"{len(ids)} {client} tasks are waiting on the client at the same time.",
        "fallback_body": f"The longest has waited {facts['longest_wait_days']} days. {client} usually responds in "
                         f"{facts['client_median_response_days']} days against {facts['other_clients_median_response_days']} for other clients, "
                         "so one message covering all of them could unblock them together.",
        "bars": [{"label": client, "value": facts["client_median_response_days"], "unit": "d", "tone": "amber"},
                 {"label": "Other clients", "value": facts["other_clients_median_response_days"], "unit": "d", "tone": "muted"}],
        "evidence": ids[:4],
        "actions": [{"label": "Ask agent", "ask": f"What is {client} waiting on?"},
                    {"label": f"Show {client} tasks", "href": f"/queue?client={client}"}],
    }


def rework_trend(ctx) -> dict | None:
    sec = rd.with_rework(ctx["s"])
    sec = sec[(sec["stakeholder"] == "security") & sec["left_at"].notna()].copy()
    before = sec[sec["left_at"] < TREND_SPLIT]["rework"].mean()
    recent_rows = sec[sec["left_at"] >= TREND_SPLIT]
    recent = recent_rows["rework"].mean()
    if recent < 1.5 * before:
        return None
    sec["month"] = sec["left_at"].dt.strftime("%b")
    sec["month_start"] = sec["left_at"].dt.tz_convert(None).dt.to_period("M").dt.start_time
    monthly = sec.groupby(["month_start", "month"])["rework"].mean().reset_index().tail(6)
    bounced = recent_rows[recent_rows["rework"]]
    by_type = bounced["type"].value_counts()
    facts = {"team": "Security Review",
             "measure": "share of tasks leaving Security Review that were sent back to a team they had already been with (rework)",
             "rate_before_july": pct(before), "rate_since_july": pct(recent), "bounces_since_july": len(bounced),
             "top_type": by_type.index[0], "top_type_bounces": int(by_type.iloc[0]),
             "monthly_rates": {m: pct(v) for m, v in zip(monthly["month"], monthly["rework"])}}
    return {
        "kind": "pattern", "id": "rework", "facts": facts,
        "meta": "Pattern · Security handoffs, last 12 months",
        "fallback_title": f"Security sends {pct(recent)} of tasks back for rework since July, up from {pct(before)}.",
        "fallback_body": f"{facts['top_type_bounces']} of the {len(bounced)} bounces since July were {facts['top_type'].lower()} tasks. "
                         "Catching what Security needs at intake would avoid the round trip.",
        "cols": [{"label": m, "value": round(v * 100)} for m, v in zip(monthly["month"], monthly["rework"])],
        "evidence": bounced["task_id"].head(3).tolist(),
        "actions": [{"label": "Ask agent", "ask": "Why is Security rework rising?"},
                    {"label": "See on process map", "href": "/process?node=security"}],
    }


def event_wins(ctx) -> list[dict]:
    out = []
    for ev in ctx["events"]:
        when = pd.Timestamp(ev["date"], tz="UTC")
        g = ctx["s"][(ctx["s"]["stakeholder"] == ev["stakeholder"]) & ctx["s"]["left_at"].notna()]
        before = g[g["entered_at"] < when]["hold_days"].median()
        after = g[g["entered_at"] >= when]["hold_days"].median()
        effect = 1 - after / before
        if effect < MIN_EVENT_EFFECT:
            continue
        stk = ctx["names"][ev["stakeholder"]]
        date = when.strftime("%b %-d")
        facts = {"stakeholder": stk, "change": ev["title"], "change_date": date,
                 "measure": f"median time a task of any type spends with {stk}",
                 "median_hold_before_days": round(before, 1), "median_hold_after_days": round(after, 1), "faster": pct(effect)}
        out.append({
            "kind": "win", "id": f"event-{ev['stakeholder']}", "facts": facts,
            "meta": f"Process change · since {date}",
            "fallback_title": f"{stk} clears tasks {pct(effect)} faster since “{ev['title'].lower()}”.",
            "fallback_body": f"Median hold fell from {facts['median_hold_before_days']} to {facts['median_hold_after_days']} days after {date}. "
                             "A similar rule could help teams where holds are rising.",
            "bars": [{"label": f"Before {date}", "value": facts["median_hold_before_days"], "unit": "d", "tone": "muted"},
                     {"label": f"After {date}", "value": facts["median_hold_after_days"], "unit": "d", "tone": "green"}],
            "evidence": [],
            "actions": [{"label": "Ask agent", "ask": f"Why did {stk} get faster?"},
                        {"label": f"Open {stk} on map", "href": f"/process?node={ev['stakeholder']}"}],
        })
    return out


def watch_rules(ctx, insights) -> list[dict]:
    risk = ctx["risk"]
    rework_open = rd.with_rework(ctx["s"][ctx["s"]["status"] == "open"]).groupby("task_id")["rework"].any().sum()
    at_risk = risk[risk["risk"] != "Low"]
    mods: dict[str, int] = {}
    for tid in at_risk["task_id"]:
        for m in rm.module_set(ctx["tasks"][tid]["code_areas"]):
            mods[m] = mods.get(m, 0) + 1
    return [
        {"label": "Holds over 2× stakeholder median", "count": int((risk["risk"] == "High").sum()), "tone": "red"},
        {"label": "Open tasks in a rework loop", "count": int(rework_open), "tone": "amber"},
        {"label": "Modules behind 2+ at-risk tasks", "count": sum(1 for v in mods.values() if v >= 2), "tone": "red"},
        {"label": "Client-side waits over 2 days", "count": int(((risk["stakeholder"] == "customer") & (risk["hold_days"] > 2)).sum()), "tone": "amber"},
        {"label": "Process changes with measurable effect", "count": sum(1 for i in insights if i["kind"] == "win"), "tone": "green"},
    ]


def classic(ctx) -> dict:
    """Numbers for the 'classic dashboard' comparison view."""
    risk = ctx["risk"].copy()
    risk["client"] = risk["task_id"].map(ctx["client"])
    risk["stake_name"] = risk["stakeholder"].map(ctx["names"])
    open_tasks = ctx["tasks_df"][ctx["tasks_df"]["status"] == "open"].copy()
    open_tasks["age"] = (rd.TODAY - open_tasks["created_at"]) / pd.Timedelta(days=1)
    open_tasks["client"] = open_tasks["id"].map(ctx["client"])
    weeks = ctx["tasks_df"].assign(week=ctx["tasks_df"]["created_at"].dt.tz_convert(None).dt.to_period("W-SUN").dt.start_time)
    per_week = weeks.groupby("week").size().tail(9).head(8)  # last 8 complete weeks
    handoffs_90 = int((ctx["h"]["entered_at"] >= rd.TODAY - pd.Timedelta(days=90)).sum())
    return {
        "kpis": {"open": len(open_tasks), "at_risk": int((risk["risk"] != "Low").sum()),
                 "avg_days_open": round(float(open_tasks["age"].mean()), 1), "handoffs_90d": handoffs_90},
        "charts": [
            {"title": "Open tasks by stakeholder", "bars": [{"label": k, "value": int(v)} for k, v in risk["stake_name"].value_counts().items()]},
            {"title": "Open tasks by type", "bars": [{"label": k, "value": int(v)} for k, v in risk["type"].value_counts().items()]},
            {"title": "Avg days open by client", "bars": [{"label": k, "value": round(float(v), 1)} for k, v in open_tasks.groupby("client")["age"].mean().sort_values(ascending=False).head(8).items()]},
            {"title": "Tasks opened per week", "cols": [{"label": f"W{w.isocalendar()[1]}", "value": int(v)} for w, v in per_week.items()]},
        ],
    }


# ── Wording ──

NUM = re.compile(r"\d+(?:\.\d+)?")


def grounded(text: str, facts: dict) -> bool:
    """Every number in the text must appear in the facts (task IDs and dates included)."""
    allowed = set(NUM.findall(json.dumps(facts, ensure_ascii=False)))
    return all(n in allowed for n in NUM.findall(text))


def write_text(client, facts: dict) -> tuple[str, str] | None:
    response = client.messages.create(
        model=MODEL, max_tokens=1500, output_config={"effort": "low"}, system=WRITER_SYSTEM,
        messages=[{"role": "user", "content": json.dumps(facts, ensure_ascii=False, indent=1)}],
    )
    if response.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in response.content if b.type == "text")
    title = re.search(r"^TITLE:\s*(.+)$", text, re.M)
    body = re.search(r"^BODY:\s*(.+)$", text, re.M)
    return (title.group(1).strip(), body.group(1).strip()) if title and body else None


def apply_wording(insights: list[dict], use_llm: bool) -> None:
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    keys = {i["id"]: hashlib.sha256(f"{MODEL}\n{WRITER_SYSTEM}\n{json.dumps(i['facts'], sort_keys=True)}".encode()).hexdigest()[:16] for i in insights}
    todo = [i for i in insights if keys[i["id"]] not in cache]
    if use_llm and todo:
        import anthropic
        api = anthropic.Anthropic(timeout=60.0, max_retries=2)
        with ThreadPoolExecutor(4) as pool:
            for i, result in zip(todo, pool.map(lambda x: write_text(api, x["facts"]), todo)):
                cache[keys[i["id"]]] = result
    rejected = []
    for i in insights:
        result = cache.get(keys[i["id"]])
        ok = result is not None and grounded(result[0], i["facts"]) and grounded(result[1], i["facts"])
        if result is not None and not ok:
            rejected.append(i["id"])
        i["title"], i["body"] = (result if ok else (i["fallback_title"], i["fallback_body"]))
        i["written_by"] = "claude" if ok else "template"
    CACHE.write_text(json.dumps({k: cache[k] for k in keys.values() if k in cache}, indent=2, ensure_ascii=False) + "\n")
    if rejected:
        print(f"Wording rejected by the grounding check (template used): {', '.join(rejected)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-llm", action="store_true", help="use templates only")
    args = parser.parse_args()
    load_env()
    use_llm = not args.no_llm and bool(os.environ.get("ANTHROPIC_API_KEY"))

    d = rd.load()
    h = rd.clean_handoffs(d["handoffs"])
    s = rd.stints(d["tasks"], h, d["clients"])
    closed_s = s[s["status"] == "closed"]
    tasks_df = d["tasks"]
    client_names = dict(zip(d["clients"]["id"], d["clients"]["name"]))
    ctx = {
        "s": s, "h": h, "tasks_df": tasks_df,
        "tasks": {r["id"]: r for r in tasks_df.to_dict("records")},
        "client": {t: client_names[c] for t, c in zip(tasks_df["id"], tasks_df["client_id"])},
        "names": dict(zip(d["stakeholders"]["id"], d["stakeholders"]["name"])),
        "risk": rd.risk_levels(s[(s["status"] == "open") & s["is_current"]], closed_s),
        "preds": json.loads((ARTIFACTS / "predictions.json").read_text()),
        "similar": json.loads((ARTIFACTS / "similar_cases.json").read_text()),
        "pmap": json.loads((ARTIFACTS / "process_map.json").read_text())["windows"],
        "events": d["events"].to_dict("records"),
    }

    feat = featured(ctx)
    cards = [x for x in [module_behind_risk(ctx), client_waits(ctx), rework_trend(ctx)] if x] + event_wins(ctx)
    insights = ([feat] if feat else []) + cards
    apply_wording(insights, use_llm)
    for i in insights:
        i.pop("fallback_title"); i.pop("fallback_body")

    needs = sum(1 for i in insights if i["kind"] == "need")
    words = ["No", "One", "Two", "Three", "Four", "Five"]
    handoffs_90 = classic(ctx)["kpis"]["handoffs_90d"]
    briefing = {
        "as_of": rd.TODAY.strftime("%a %b %-d").upper(),
        "headline": f"{words[min(needs, 5)]} thing{'s' if needs != 1 else ''} need{'' if needs != 1 else 's'} you today.",
        "subhead": f"I checked {len(ctx['preds'])} open tasks and {handoffs_90} handoffs from the last 90 days. "
                   f"{needs} need a decision from you, {len(insights) - needs} {'are' if len(insights) - needs != 1 else 'is'} worth knowing about.",
        "featured": feat,
        "insights": cards,
        "watch_rules": watch_rules(ctx, insights),
        "stats": {"open": len(ctx["preds"]), "handoffs_90d": handoffs_90, "insights": len(insights)},
        "classic": classic(ctx),
    }
    OUT.write_text(json.dumps(briefing, indent=2, ensure_ascii=False, default=float) + "\n")
    print(f"Wrote {OUT.relative_to(rd.ROOT)}: {briefing['headline']} "
          f"({len(insights)} insights, wording: {sum(i['written_by'] == 'claude' for i in insights)} Claude / "
          f"{sum(i['written_by'] == 'template' for i in insights)} template)")
    for i in insights:
        print(f"  [{i['kind']}] {i['title']}\n         {i['body']}")


if __name__ == "__main__":
    main()
