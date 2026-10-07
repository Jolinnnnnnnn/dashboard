"""Check that data/ matches docs/data-spec.md: counts, demo task, noise, and planted patterns P1–P7.

Usage (from repo root, venv active):
    python scripts/validate_patterns.py [--data-dir DIR]
Exits 1 if any check fails.
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import relay_data as rd

BACKTEST_SPLIT = pd.Timestamp("2026-07-01T00:00:00Z")
TEXT_WEIGHT, MODULE_WEIGHT = 0.7, 0.3  # similar-case score; recorded in docs/definitions.md

results: list[tuple[str, bool, str]] = []


def check(name: str, passed: bool, detail: str) -> None:
    results.append((name, bool(passed), detail))


def predict_top1(train: pd.DataFrame, test: pd.DataFrame) -> tuple[float, float]:
    """Top-1 accuracy of (stakeholder, type) transitions vs. stakeholder-only baseline."""
    by_pair = train.groupby(["stakeholder", "type"])["next_stakeholder"].agg(Counter)
    by_stk = train.groupby("stakeholder")["next_stakeholder"].agg(Counter)
    model_hits = base_hits = 0
    for row in test.itertuples():
        base = by_stk[row.stakeholder].most_common(1)[0][0]
        pair = by_pair.get((row.stakeholder, row.type))
        model = pair.most_common(1)[0][0] if pair and sum(pair.values()) >= rd.MIN_PAIR_EXAMPLES else base
        model_hits += model == row.next_stakeholder
        base_hits += base == row.next_stakeholder
    return model_hits / len(test), base_hits / len(test)


def module_sets(tasks: pd.DataFrame) -> list[set[str]]:
    return [{p.split("/")[0] for p in areas} for areas in tasks["code_areas"]]


def similar_family_rate(closed: pd.DataFrame) -> float:
    """Share of each closed task's top-3 similar cases that come from the same issue family."""
    text = (closed["title"] + ". " + closed["description"]).tolist()
    cos = cosine_similarity(TfidfVectorizer(stop_words="english").fit_transform(text))
    mods = module_sets(closed)
    n = len(closed)
    jac = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            union = mods[i] | mods[j]
            jac[i, j] = len(mods[i] & mods[j]) / len(union) if union else 0.0
    score = TEXT_WEIGHT * cos + MODULE_WEIGHT * jac
    np.fill_diagonal(score, -1)
    families = closed["family"].to_numpy()
    top3 = np.argsort(-score, axis=1)[:, :3]
    return float((families[top3] == families[:, None]).mean())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=rd.DATA_DIR)
    d = rd.load(parser.parse_args().data_dir)
    tasks, clients = d["tasks"], d["clients"]
    raw = d["handoffs"]
    h = rd.clean_handoffs(raw)
    s = rd.stints(tasks, h, clients)
    closed_tasks = tasks[tasks["status"] == "closed"]
    open_tasks = tasks[tasks["status"] == "open"]
    closed_s = s[s["status"] == "closed"]
    open_current = s[(s["status"] == "open") & s["is_current"]]

    # ── Counts and schema ──
    check("Counts", len(closed_tasks) == 400 and len(open_tasks) == 100,
          f"{len(closed_tasks)} closed, {len(open_tasks)} open")
    expected = {"id", "title", "description", "client_id", "type", "family", "status", "created_at",
                "closed_at", "code_areas", "solution_note", "current_stakeholder"}
    check("Task fields", expected <= set(tasks.columns), f"missing: {sorted(expected - set(tasks.columns)) or 'none'}")
    check("Unique task IDs", tasks["id"].is_unique, f"{tasks['id'].nunique()} unique of {len(tasks)}")
    window = closed_tasks["closed_at"].max() <= pd.Timestamp("2026-10-01T00:00:00Z") and \
        closed_tasks["created_at"].min() >= pd.Timestamp("2025-10-01T00:00:00Z")
    check("History window", window,
          f"closed tasks span {closed_tasks['created_at'].min():%Y-%m-%d} → {closed_tasks['closed_at'].max():%Y-%m-%d}")
    open_age = (rd.TODAY - open_tasks["created_at"]).dt.days.max()
    check("Open tasks recent", open_age < 30, f"oldest open task created {open_age} days ago")

    # ── Risk and demo task ──
    risk = rd.risk_levels(open_current, closed_s)
    n_risk = int((risk["risk"] != "Low").sum())
    n_high = int((risk["risk"] == "High").sum())
    check("At-risk open tasks", 5 <= n_risk <= 12, f"{n_risk} at risk ({n_high} High), target ~8")
    demo = risk[risk["task_id"] == "T-4821"]
    if demo.empty:
        check("Demo task T-4821", False, "not found among open tasks")
    else:
        r = demo.iloc[0]
        client = clients.set_index("id").loc[tasks.set_index("id").loc["T-4821", "client_id"], "name"]
        ok = (r["stakeholder"] == "network_eng" and r["type"] == "Cache purge bug"
              and client == "Northwind Media" and r["risk"] == "High")
        check("Demo task T-4821", ok,
              f"{client}, {r['type']}, with {r['stakeholder']} {r['hold_days']:.1f}d "
              f"(median {r['median_hold']:.2f}d, ratio {r['hold_ratio']:.2f}, {r['risk']})")

    # ── Noise ──
    n_dup = int((raw["from_stakeholder"] == raw["to_stakeholder"]).sum())
    n_dup_clean = int((h["from_stakeholder"] == h["to_stakeholder"]).sum())
    check("Duplicate handoffs cleaned", n_dup > 0 and n_dup_clean == 0,
          f"{n_dup} duplicates in raw data, {n_dup_clean} after cleaning")
    empty_notes = (closed_tasks["solution_note"] == "").mean()
    check("Empty solution notes", 0.05 <= empty_notes <= 0.15, f"{empty_notes:.1%} of closed tasks (target 10%)")
    no_code = (tasks["code_areas"].str.len() == 0).mean()
    check("No code areas", 0.02 <= no_code <= 0.08, f"{no_code:.1%} of tasks (target 5%)")

    # ── P1: routing depends on task type ──
    with_next = closed_s.dropna(subset=["next_stakeholder"])
    train = with_next[with_next["created_at"] < BACKTEST_SPLIT]
    test = with_next[with_next["created_at"] >= BACKTEST_SPLIT]
    model_acc, base_acc = predict_top1(train, test)
    check("P1 Routing by type", model_acc - base_acc >= 0.10,
          f"top-1 {model_acc:.1%} vs baseline {base_acc:.1%} "
          f"(+{(model_acc - base_acc) * 100:.1f} pts; {len(train)} train / {len(test)} test stints)")

    # ── P2: Security is the bottleneck ──
    medians = closed_s.groupby("stakeholder")["hold_days"].median().sort_values(ascending=False)
    sec = medians["security"]
    check("P2 Security bottleneck", medians.index[0] == "security" and 2.3 <= sec <= 3.5,
          f"security median {sec:.2f}d; next highest {medians.index[1]} {medians.iloc[1]:.2f}d")

    # ── P3: rework loop ──
    route = rd.routes(h)
    eligible = closed_tasks[closed_tasks["type"].isin(["New domain setup", "Log access request"])]["id"]

    def has_rework(r):
        return any(r[i:i + 3] == ["security", "support", "security"] for i in range(len(r) - 2))

    rework = route[eligible].apply(has_rework).mean()
    check("P3 Rework loop", 0.12 <= rework <= 0.24,
          f"{rework:.1%} of {len(eligible)} New domain / Log access tasks go Security → Support → Security")

    # ── P4: problem module ──
    counts = Counter(m for ms in module_sets(tasks) for m in ms)
    all_modules = d["modules"]["id"].tolist()
    ranked = sorted(all_modules, key=lambda m: -counts.get(m, 0))
    avg = np.mean([counts.get(m, 0) for m in all_modules])
    check("P4 Problem module", ranked[0] == "edge-sync",
          f"edge-sync {counts['edge-sync']} tasks ({counts['edge-sync'] / avg:.1f}× avg {avg:.0f}); "
          f"#2 {ranked[1]} {counts[ranked[1]]}")

    # ── P5: issue families have consistent fixes ──
    fam_rate = similar_family_rate(closed_tasks.reset_index(drop=True))
    check("P5 Similar cases share family", fam_rate >= 0.70,
          f"{fam_rate:.1%} of top-3 similar cases share the family")

    # ── P6: Enterprise responds faster ──
    cust = closed_s[closed_s["stakeholder"] == "customer"].groupby("tier")["hold_days"].median()
    check("P6 Enterprise faster at Customer", cust["Enterprise"] < cust["SMB"],
          f"Customer median hold: Enterprise {cust['Enterprise']:.2f}d, "
          f"Mid-market {cust['Mid-market']:.2f}d, SMB {cust['SMB']:.2f}d")

    # ── P7: holiday traffic spike ──
    spikes = closed_tasks[closed_tasks["type"] == "Traffic spike"]
    monthly = spikes["created_at"].dt.month.value_counts()
    holiday = (monthly.get(11, 0) + monthly.get(12, 0)) / 2
    overall = len(spikes) / 12
    check("P7 Holiday traffic spike", holiday >= 1.5 * overall,
          f"Nov–Dec avg {holiday:.1f}/month vs overall {overall:.1f}/month ({holiday / overall:.1f}×)")

    # ── Report ──
    width = max(len(n) for n, _, _ in results)
    for name, passed, detail in results:
        print(f"{'PASS' if passed else 'FAIL'}  {name:<{width}}  {detail}")
    failed = [n for n, p, _ in results if not p]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
