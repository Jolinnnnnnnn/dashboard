"""Evaluate prediction, ETA, and similar-case search. Writes data/artifacts/backtest.json.

Train on tasks created Oct 2025–Jun 2026, test on Jul–Sep 2026 (docs/plan.md, Phase 3).

Usage (from repo root, venv active):
    python scripts/backtest.py
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import relay_data as rd
import relay_model as rm

SPLIT = pd.Timestamp("2026-07-01T00:00:00Z")
OUT = rd.DATA_DIR / "artifacts" / "backtest.json"


def next_stakeholder(model: rm.TransitionModel, test: pd.DataFrame) -> dict:
    rows = []
    for r in test.itertuples():
        ranked = [k for k, _, _ in model.distribution(r.stakeholder, r.type)]
        base = model.baseline(r.stakeholder)
        rows.append({
            "stakeholder": r.stakeholder,
            "model_top1": ranked[:1] == [r.next_stakeholder],
            "model_top3": r.next_stakeholder in ranked[:3],
            "base_top1": base[:1] == [r.next_stakeholder],
            "base_top3": r.next_stakeholder in base[:3],
        })
    df = pd.DataFrame(rows)
    per = df.groupby("stakeholder").agg(n=("model_top1", "size"), model_top1=("model_top1", "mean"),
                                        base_top1=("base_top1", "mean")).sort_values("n", ascending=False)
    return {
        "n": len(df),
        "model_top1": df["model_top1"].mean(), "model_top3": df["model_top3"].mean(),
        "baseline_top1": df["base_top1"].mean(), "baseline_top3": df["base_top3"].mean(),
        "by_stakeholder": per.reset_index().to_dict("records"),
    }


def eta(model: rm.TransitionModel, train: pd.DataFrame, test: pd.DataFrame, tasks: pd.DataFrame) -> dict:
    """Predict days-to-close at the moment each test stint starts (elapsed = 0)."""
    closed_at = tasks.set_index("id")["closed_at"]

    def actual(df):
        return (df["task_id"].map(closed_at) - df["entered_at"]) / pd.Timedelta(days=1)

    train_remaining = train.assign(remaining=actual(train)).groupby("stakeholder")["remaining"].median()
    t = test.assign(actual=actual(test))
    t["model"] = [model.eta_days(r.stakeholder, r.type, 0.0) for r in t.itertuples()]
    t["baseline"] = t["stakeholder"].map(train_remaining)
    model_err = (t["model"] - t["actual"]).abs()
    base_err = (t["baseline"] - t["actual"]).abs()
    return {
        "n": len(t),
        "model_median_abs_error_days": model_err.median(), "model_mae_days": model_err.mean(),
        "model_within_2_days": (model_err <= 2).mean(),
        "baseline_median_abs_error_days": base_err.median(), "baseline_mae_days": base_err.mean(),
        "baseline_within_2_days": (base_err <= 2).mean(),
    }


def similar_cases(open_tasks: pd.DataFrame, closed: pd.DataFrame) -> dict:
    index = rm.SimilarityIndex(closed)
    lib_families = index.library["family"].to_numpy()
    variants = {"text_only": (1.0, 0.0), "modules_only": (0.0, 1.0),
                "combined": (rm.TEXT_WEIGHT, rm.MODULE_WEIGHT)}
    out = {"n_queries": len(open_tasks)}
    for name, (tw, mw) in variants.items():
        top3 = index.top_k(open_tasks, k=3, text_weight=tw, module_weight=mw)
        same = np.array([[lib_families[m["index"]] == fam for m in matches]
                         for fam, matches in zip(open_tasks["family"], top3)])
        out[name] = {"precision_at_3": same.mean(), "hit_at_3": same.any(axis=1).mean()}
        if name == "combined":
            per = pd.Series(same.mean(axis=1), index=open_tasks["family"].to_numpy())
            out["combined_by_family"] = per.groupby(level=0).mean().round(3).to_dict()
    return out


def pct(x: float) -> str:
    return f"{x:.1%}"


def main() -> None:
    d = rd.load()
    tasks = d["tasks"]
    s = rd.stints(tasks, rd.clean_handoffs(d["handoffs"]), d["clients"])
    completed = s[(s["status"] == "closed")].dropna(subset=["next_stakeholder"])
    train = completed[completed["created_at"] < SPLIT]
    test = completed[completed["created_at"] >= SPLIT]
    model = rm.TransitionModel(train)

    results = {
        "split": {"train_before": SPLIT.isoformat(), "train_stints": len(train), "test_stints": len(test),
                  "train_tasks": int(train["task_id"].nunique()), "test_tasks": int(test["task_id"].nunique())},
        "next_stakeholder": next_stakeholder(model, test),
        "eta": eta(model, train, test, tasks),
        "similar_cases": similar_cases(tasks[tasks["status"] == "open"], tasks[tasks["status"] == "closed"]),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, indent=2, default=float) + "\n")

    ns, e, sc = results["next_stakeholder"], results["eta"], results["similar_cases"]
    sp = results["split"]
    print(f"Train: {sp['train_tasks']} tasks / {sp['train_stints']} stints · "
          f"Test: {sp['test_tasks']} tasks / {sp['test_stints']} stints\n")
    print("Next stakeholder        Model    Baseline")
    print(f"  Top-1                 {pct(ns['model_top1']):>6}   {pct(ns['baseline_top1']):>6}")
    print(f"  Top-3                 {pct(ns['model_top3']):>6}   {pct(ns['baseline_top3']):>6}")
    print("  By current stakeholder (top-1):")
    for r in ns["by_stakeholder"]:
        print(f"    {r['stakeholder']:<12} n={r['n']:<4} model {pct(r['model_top1']):>6}  baseline {pct(r['base_top1']):>6}")
    print("\nDays to close (at stint start)   Model    Baseline")
    print(f"  Median abs error            {e['model_median_abs_error_days']:>6.2f}d  {e['baseline_median_abs_error_days']:>6.2f}d")
    print(f"  Mean abs error              {e['model_mae_days']:>6.2f}d  {e['baseline_mae_days']:>6.2f}d")
    print(f"  Within 2 days               {pct(e['model_within_2_days']):>7}  {pct(e['baseline_within_2_days']):>7}")
    print(f"\nSimilar cases ({sc['n_queries']} open tasks vs closed library)   Precision@3   Hit@3")
    for name in ["text_only", "modules_only", "combined"]:
        print(f"  {name:<14}                               {pct(sc[name]['precision_at_3']):>6}     {pct(sc[name]['hit_at_3']):>6}")
    print(f"\nWrote {OUT.relative_to(rd.ROOT)}")


if __name__ == "__main__":
    main()
