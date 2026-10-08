"""Prediction and similarity logic shared by backtest.py, build_artifacts.py, and the validator.

Terms follow docs/definitions.md.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import signal_data as rd

TEXT_WEIGHT, MODULE_WEIGHT = 0.7, 0.3
MIN_CONDITIONAL_EXAMPLES = 3  # for "remaining time given it's already been held this long"
MAX_PATH_STEPS = 8


class TransitionModel:
    """Next-stakeholder probabilities by (stakeholder, type), with stakeholder-only fallback.

    Built from completed stints (stints whose next stakeholder is known).
    """

    def __init__(self, completed_stints: pd.DataFrame):
        s = completed_stints.dropna(subset=["next_stakeholder"])
        self.by_pair = {k: Counter(g) for k, g in s.groupby(["stakeholder", "type"])["next_stakeholder"]}
        self.by_stakeholder = {k: Counter(g) for k, g in s.groupby("stakeholder")["next_stakeholder"]}
        self.holds_by_pair = {k: g.to_numpy() for k, g in s.groupby(["stakeholder", "type"])["hold_days"]}
        self.holds_by_stakeholder = {k: g.to_numpy() for k, g in s.groupby("stakeholder")["hold_days"]}

    def counts(self, stakeholder: str, task_type: str) -> tuple[Counter, str]:
        """Counts of next stakeholders and the basis used ('type' or 'stakeholder')."""
        pair = self.by_pair.get((stakeholder, task_type))
        if pair and sum(pair.values()) >= rd.MIN_PAIR_EXAMPLES:
            return pair, "type"
        return self.by_stakeholder.get(stakeholder, Counter()), "stakeholder"

    def distribution(self, stakeholder: str, task_type: str) -> list[tuple[str, float, int]]:
        """[(next_stakeholder, probability, count)] sorted by probability."""
        c, _ = self.counts(stakeholder, task_type)
        n = sum(c.values())
        return [(k, v / n, v) for k, v in c.most_common()] if n else []

    def baseline(self, stakeholder: str) -> list[str]:
        """Stakeholder-only ranking, ignoring task type."""
        return [k for k, _ in self.by_stakeholder.get(stakeholder, Counter()).most_common()]

    def holds(self, stakeholder: str, task_type: str) -> np.ndarray:
        pair = self.holds_by_pair.get((stakeholder, task_type))
        if pair is not None and len(pair) >= rd.MIN_PAIR_EXAMPLES:
            return pair
        return self.holds_by_stakeholder.get(stakeholder, np.array([1.0]))

    def median_hold(self, stakeholder: str, task_type: str) -> float:
        return float(np.median(self.holds(stakeholder, task_type)))

    def remaining_at_current(self, stakeholder: str, task_type: str, elapsed: float) -> float:
        """Expected remaining hold given the task has already been held `elapsed` days:
        median of (hold - elapsed) over past stints that lasted longer than elapsed."""
        h = self.holds(stakeholder, task_type)
        longer = h[h > elapsed]
        if len(longer) >= MIN_CONDITIONAL_EXAMPLES:
            return float(np.median(longer - elapsed))
        return 0.25 * float(np.median(h))

    def expected_path(self, stakeholder: str, task_type: str) -> list[str]:
        """Most probable remaining route after the current stakeholder, ending at 'closed'."""
        path, current = [], stakeholder
        for _ in range(MAX_PATH_STEPS):
            dist = self.distribution(current, task_type)
            if not dist:
                break
            # Skip a step that would loop straight back to where we already are
            nxt = next((k for k, _, _ in dist if k not in path and k != current), dist[0][0])
            path.append(nxt)
            if nxt == "closed":
                break
            current = nxt
        return path

    def eta_days(self, stakeholder: str, task_type: str, elapsed: float) -> float:
        """Days until close: remaining at current + median holds along the expected path."""
        days = self.remaining_at_current(stakeholder, task_type, elapsed)
        for s in self.expected_path(stakeholder, task_type):
            if s != "closed":
                days += self.median_hold(s, task_type)
        return days


def module_set(code_areas) -> set[str]:
    return {p.split("/")[0] for p in code_areas}


class SimilarityIndex:
    """Similar-case search: TEXT_WEIGHT × TF-IDF cosine + MODULE_WEIGHT × module Jaccard."""

    def __init__(self, library: pd.DataFrame):
        self.library = library.reset_index(drop=True)
        self.vectorizer = TfidfVectorizer(stop_words="english")
        self.lib_vectors = self.vectorizer.fit_transform(self._text(self.library))
        self.lib_modules = [module_set(a) for a in self.library["code_areas"]]

    @staticmethod
    def _text(tasks: pd.DataFrame) -> list[str]:
        return (tasks["title"] + ". " + tasks["description"]).tolist()

    def scores(self, queries: pd.DataFrame, text_weight: float = TEXT_WEIGHT,
               module_weight: float = MODULE_WEIGHT) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """(combined, text, module) score matrices: queries × library. Self-matches get -1."""
        text = cosine_similarity(self.vectorizer.transform(self._text(queries)), self.lib_vectors)
        q_modules = [module_set(a) for a in queries["code_areas"]]
        mod = np.zeros_like(text)
        for i, qm in enumerate(q_modules):
            for j, lm in enumerate(self.lib_modules):
                union = qm | lm
                mod[i, j] = len(qm & lm) / len(union) if union else 0.0
        combined = text_weight * text + module_weight * mod
        lib_ids = self.library["id"].to_numpy()
        for i, qid in enumerate(queries["id"]):
            combined[i, lib_ids == qid] = -1
        return combined, text, mod

    def top_k(self, queries: pd.DataFrame, k: int = 5, **weights) -> list[list[dict]]:
        combined, text, mod = self.scores(queries, **weights)
        q_modules = [module_set(a) for a in queries["code_areas"]]
        results = []
        for i in range(len(queries)):
            order = np.argsort(-combined[i])[:k]
            results.append([{
                "index": int(j),
                "score": float(combined[i, j]),
                "text_score": float(text[i, j]),
                "module_score": float(mod[i, j]),
                "shared_modules": sorted(q_modules[i] & self.lib_modules[j]),
            } for j in order])
        return results


def family_match_rate(queries: pd.DataFrame, index: SimilarityIndex, k: int = 3, **weights) -> float:
    """Share of each query's top-k similar cases that share its issue family (evaluation only)."""
    lib_families = index.library["family"].to_numpy()
    hits = [lib_families[m["index"]] == fam
            for fam, matches in zip(queries["family"], index.top_k(queries, k=k, **weights))
            for m in matches]
    return float(np.mean(hits))
