"""Shared loading and cleaning for Relay's synthetic data.

Terms follow docs/definitions.md. Used by validate_patterns.py and the Phase 3 scripts.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

TODAY = pd.Timestamp("2026-10-07T09:00:00Z")
MIN_PAIR_EXAMPLES = 5  # below this, (stakeholder, type) falls back to stakeholder-only
RISK_MEDIUM = 1.5
RISK_HIGH = 2.0

TABLES = ["stakeholders", "clients", "modules", "tasks", "handoffs", "events"]


def load(data_dir: Path = DATA_DIR) -> dict[str, pd.DataFrame]:
    """Load every data file into a DataFrame, parsing timestamps as UTC."""
    out = {}
    for name in TABLES:
        with open(data_dir / f"{name}.json") as f:
            out[name] = pd.DataFrame(json.load(f))
    for col in ["created_at", "closed_at"]:
        out["tasks"][col] = pd.to_datetime(out["tasks"][col], utc=True)
    for col in ["entered_at", "left_at"]:
        out["handoffs"][col] = pd.to_datetime(out["handoffs"][col], utc=True)
    return out


def clean_handoffs(handoffs: pd.DataFrame) -> pd.DataFrame:
    """Merge duplicate handoffs (from == to) into the preceding stint and renumber seq."""
    h = handoffs.sort_values(["task_id", "seq"]).reset_index(drop=True)
    is_dup = h["from_stakeholder"] == h["to_stakeholder"]
    group = (~is_dup).cumsum()
    first = lambda s: s.iloc[0]  # noqa: E731 — groupby "first" skips NaN, which breaks the Intake row
    last = lambda s: s.iloc[-1]  # noqa: E731
    merged = h.groupby(group).agg(
        task_id=("task_id", first),
        from_stakeholder=("from_stakeholder", first),
        to_stakeholder=("to_stakeholder", first),
        entered_at=("entered_at", first),
        left_at=("left_at", last),
        hold_days=("hold_days", lambda s: s.sum(min_count=len(s))),
    )
    merged["seq"] = merged.groupby("task_id").cumcount() + 1
    return merged.reset_index(drop=True)[list(handoffs.columns)]


def stints(tasks: pd.DataFrame, handoffs_clean: pd.DataFrame, clients: pd.DataFrame) -> pd.DataFrame:
    """One row per stint (excluding the terminal 'closed' row), with next stakeholder.

    For an open task's current stint, next_stakeholder is NaN and hold_days is
    TODAY - entered_at.
    """
    h = handoffs_clean.sort_values(["task_id", "seq"]).copy()
    h["next_stakeholder"] = h.groupby("task_id")["to_stakeholder"].shift(-1)
    s = h[h["to_stakeholder"] != "closed"].rename(columns={"to_stakeholder": "stakeholder"})
    current = s["left_at"].isna()
    s.loc[current, "hold_days"] = (TODAY - s.loc[current, "entered_at"]) / pd.Timedelta(days=1)
    s["is_current"] = current
    tier = tasks.merge(clients, left_on="client_id", right_on="id")[["id_x", "tier"]]
    meta = tasks[["id", "type", "family", "status", "created_at", "client_id"]].merge(
        tier.rename(columns={"id_x": "id"}), on="id"
    )
    s = s.merge(meta, left_on="task_id", right_on="id").drop(columns="id")
    return s.reset_index(drop=True)


def with_rework(stints_df: pd.DataFrame) -> pd.DataFrame:
    """Add `rework`: True when a stint hands the task back to a stakeholder it was already with
    (docs/definitions.md). The final handoff of an open task's current stint is unknown, so False."""
    s = stints_df.sort_values(["task_id", "seq"]).copy()
    flags = []
    for _, g in s.groupby("task_id", sort=False):
        seen: set = set()
        for stk, nxt in zip(g["stakeholder"], g["next_stakeholder"]):
            seen = seen | {stk}
            flags.append(isinstance(nxt, str) and nxt in seen)
    s["rework"] = flags
    return s


def routes(handoffs_clean: pd.DataFrame) -> pd.Series:
    """Ordered list of stakeholders per task (including 'closed' when resolved)."""
    h = handoffs_clean.sort_values(["task_id", "seq"])
    return h.groupby("task_id")["to_stakeholder"].apply(list)


def median_holds(closed_stints: pd.DataFrame) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Median hold by (stakeholder, type), example counts, and stakeholder-only fallback."""
    by_pair = closed_stints.groupby(["stakeholder", "type"])["hold_days"]
    return by_pair.median(), by_pair.size(), closed_stints.groupby("stakeholder")["hold_days"].median()


def risk_levels(open_current: pd.DataFrame, closed_stints: pd.DataFrame) -> pd.DataFrame:
    """Hold ratio and risk level for each open task's current stint."""
    pair_med, pair_n, stk_med = median_holds(closed_stints)
    out = open_current.copy()

    def median_for(row):
        key = (row["stakeholder"], row["type"])
        if pair_n.get(key, 0) >= MIN_PAIR_EXAMPLES:
            return pair_med[key]
        return stk_med[row["stakeholder"]]

    out["median_hold"] = out.apply(median_for, axis=1)
    out["hold_ratio"] = out["hold_days"] / out["median_hold"]
    out["risk"] = "Low"
    out.loc[out["hold_ratio"] > RISK_MEDIUM, "risk"] = "Medium"
    out.loc[out["hold_ratio"] > RISK_HIGH, "risk"] = "High"
    return out
