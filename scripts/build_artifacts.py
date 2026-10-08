"""Precompute what the app reads: transition tables, open-task predictions, similar cases.

Writes to data/artifacts/:
  transitions.json    next-stakeholder counts and median holds, by (stakeholder, type) and stakeholder
  predictions.json    per open task: risk, next-stakeholder distribution, reason, expected path, ETA
  similar_cases.json  per task (open and closed): top-5 similar closed tasks with match explanation

The model here is trained on all closed tasks; backtest.py measures it on a held-out split.

Usage (from repo root, venv active):
    python scripts/build_artifacts.py
"""
from __future__ import annotations

import json

import pandas as pd

import relay_data as rd
import relay_model as rm

OUT_DIR = rd.DATA_DIR / "artifacts"
TOP_K = 5
SIMILAR_TEXT_THRESHOLD = 0.25  # text score above which we say "similar description"


def write(name: str, obj) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_DIR / f"{name}.json", "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False, default=float)
        f.write("\n")


def transitions(model: rm.TransitionModel, completed: pd.DataFrame) -> dict:
    by_pair: dict = {}
    for (stk, typ), counts in model.by_pair.items():
        by_pair.setdefault(stk, {})[typ] = {
            "n": sum(counts.values()),
            "next": dict(counts.most_common()),
            "median_hold_days": round(float(completed.loc[(completed["stakeholder"] == stk)
                                                          & (completed["type"] == typ), "hold_days"].median()), 2),
        }
    by_stakeholder = {
        stk: {"n": sum(c.values()), "next": dict(c.most_common()),
              "median_hold_days": round(float(completed.loc[completed["stakeholder"] == stk, "hold_days"].median()), 2)}
        for stk, c in model.by_stakeholder.items()
    }
    return {"min_pair_examples": rd.MIN_PAIR_EXAMPLES, "by_stakeholder": by_stakeholder, "by_pair": by_pair}


def reason_text(model: rm.TransitionModel, stk: str, typ: str, names: dict) -> str:
    counts, basis = model.counts(stk, typ)
    top, k = counts.most_common(1)[0]
    n = sum(counts.values())
    if basis == "type":
        return f"{k} of {n} past {typ.lower()} tasks went to {names[top]} after {names[stk]}"
    return (f"{k} of {n} past tasks at {names[stk]} went to {names[top]} next "
            f"(too few {typ.lower()} examples to split by type)")


def predictions(model: rm.TransitionModel, risk: pd.DataFrame, names: dict) -> dict:
    out = {}
    for r in risk.sort_values("task_id").itertuples():
        _, basis = model.counts(r.stakeholder, r.type)
        eta = model.eta_days(r.stakeholder, r.type, r.hold_days)
        out[r.task_id] = {
            "current_stakeholder": r.stakeholder,
            "hold_days": round(r.hold_days, 2),
            "median_hold_days": round(r.median_hold, 2),
            "hold_ratio": round(r.hold_ratio, 2),
            "risk": r.risk,
            "next": [{"stakeholder": k, "probability": round(p, 3), "count": c}
                     for k, p, c in model.distribution(r.stakeholder, r.type)],
            "basis": basis,
            "reason": reason_text(model, r.stakeholder, r.type, names),
            "expected_path": model.expected_path(r.stakeholder, r.type),
            "eta_days": round(eta, 1),
            "estimated_close": (rd.TODAY + pd.Timedelta(days=eta)).strftime("%Y-%m-%d"),
        }
    return out


def matched_on(m: dict) -> str:
    parts = []
    if m["shared_modules"]:
        label = "module" if len(m["shared_modules"]) == 1 else "modules"
        parts.append(f"shared {label} {', '.join(m['shared_modules'])}")
    if m["text_score"] >= SIMILAR_TEXT_THRESHOLD:
        parts.append("similar description")
    return ", ".join(parts) or "related wording"


def similar_cases(tasks: pd.DataFrame, closed: pd.DataFrame, client_names: dict) -> dict:
    index = rm.SimilarityIndex(closed)
    lib = index.library
    resolution_days = (lib["closed_at"] - lib["created_at"]) / pd.Timedelta(days=1)
    out = {}
    for task_id, matches in zip(tasks["id"], index.top_k(tasks, k=TOP_K)):
        out[task_id] = [{
            "task_id": lib.at[m["index"], "id"],
            "title": lib.at[m["index"], "title"],
            "client": client_names[lib.at[m["index"], "client_id"]],
            "score": round(m["score"], 3),
            "text_score": round(m["text_score"], 3),
            "module_score": round(m["module_score"], 3),
            "shared_modules": m["shared_modules"],
            "matched_on": matched_on(m),
            "solution_note": lib.at[m["index"], "solution_note"],
            "resolution_days": round(float(resolution_days[m["index"]]), 1),
        } for m in matches]
    return out


def main() -> None:
    d = rd.load()
    tasks, clients = d["tasks"], d["clients"]
    names = dict(zip(d["stakeholders"]["id"], d["stakeholders"]["name"]))
    client_names = dict(zip(clients["id"], clients["name"]))
    s = rd.stints(tasks, rd.clean_handoffs(d["handoffs"]), clients)
    closed_s = s[s["status"] == "closed"]
    completed = closed_s.dropna(subset=["next_stakeholder"])
    model = rm.TransitionModel(completed)
    risk = rd.risk_levels(s[(s["status"] == "open") & s["is_current"]], closed_s)

    write("transitions", transitions(model, completed))
    preds = predictions(model, risk, names)
    write("predictions", preds)
    similar = similar_cases(tasks, tasks[tasks["status"] == "closed"], client_names)
    write("similar_cases", similar)

    demo = preds["T-4821"]
    print(f"Wrote transitions, predictions ({len(preds)} open tasks), similar_cases ({len(similar)} tasks) "
          f"to {OUT_DIR.relative_to(rd.ROOT)}/")
    print(f"T-4821: {demo['risk']} risk, {demo['hold_days']}d vs median {demo['median_hold_days']}d; "
          f"next {demo['next'][0]['stakeholder']} {demo['next'][0]['probability']:.0%}; {demo['reason']}; "
          f"close ~{demo['estimated_close']}")
    for m in similar["T-4821"][:3]:
        print(f"  {m['score']:.2f} {m['task_id']} {m['client']}: {m['title']} [{m['matched_on']}]")


if __name__ == "__main__":
    main()
