"""Write short AI summaries for open tasks into data/artifacts/summaries.json.

Each summary is grounded only in precomputed facts (task, prediction, similar cases).
Results are cached by input hash: re-running only calls the API for tasks whose inputs changed.
Run build_artifacts.py first. Needs ANTHROPIC_API_KEY (environment or .env.local).

Usage (from repo root, venv active):
    python scripts/summarize_tasks.py [--limit N] [--force]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor

import anthropic

import relay_data as rd

MODEL = "claude-haiku-5-5"
ARTIFACTS = rd.DATA_DIR / "artifacts"
OUT = ARTIFACTS / "summaries.json"
WORKERS = 8

SYSTEM = """You write the summary card for one open task in an operations dashboard used by technical program managers at a CDN company.

Write at most 3 sentences (under 70 words total), then one line starting with "Suggested action:" (under 30 words). Cover: why the task is or isn't at risk, where it is likely to go next, and the single most relevant past fix (cite its task ID, e.g. T-4663). The card is read at a glance, so prefer the one fact that matters over completeness.

Use only the facts provided. Do not invent numbers, teams, causes, or fixes. If no similar case has a useful solution note, say so instead of guessing. Plain text, no markdown, no greeting."""


def load_env() -> None:
    """Read ANTHROPIC_API_KEY from .env.local if it isn't already set (tolerates spaces around '=')."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    env_file = rd.ROOT / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() == "ANTHROPIC_API_KEY":
            os.environ["ANTHROPIC_API_KEY"] = value.strip().strip('"').strip("'")


def build_facts(task: dict, client: dict, pred: dict, similar: list[dict], names: dict) -> str:
    next_steps = ", ".join(f"{names[n['stakeholder']]} {n['probability']:.0%}" for n in pred["next"][:3])
    path = " → ".join(names[s] for s in pred["expected_path"])
    lines = [
        f"Task {task['id']}: {task['title']}",
        f"Client: {client['name']} ({client['tier']}, {client['region']})",
        f"Type: {task['type']}",
        f"Description: {task['description']}",
        f"Code areas: {', '.join(task['code_areas']) or 'none recorded'}",
        f"Currently with: {names[pred['current_stakeholder']]} for {pred['hold_days']:.1f} days "
        f"(median {pred['median_hold_days']:.1f} days, {pred['hold_ratio']:.1f}x) → risk {pred['risk']}",
        f"Predicted next: {next_steps}. Evidence: {pred['reason']}.",
        f"Expected route: {path}. Estimated close: {pred['estimated_close']}.",
        "Similar past cases:",
    ]
    for m in similar[:3]:
        note = m["solution_note"] or "(no solution note recorded)"
        lines.append(f"- {m['task_id']} ({m['client']}, {m['score']:.0%} match, {m['matched_on']}, "
                     f"resolved in {m['resolution_days']} days): {m['title']}. Fix: {note}")
    return "\n".join(lines)


def summarize(client: anthropic.Anthropic, facts: str) -> str | None:
    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        output_config={"effort": "low"},
        system=SYSTEM,
        messages=[{"role": "user", "content": facts}],
    )
    if response.stop_reason == "refusal":
        return None
    return "".join(b.text for b in response.content if b.type == "text").strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--limit", type=int, help="only summarize the first N tasks (for a test run)")
    parser.add_argument("--force", action="store_true", help="ignore the cache and regenerate all")
    args = parser.parse_args()

    load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (environment or .env.local)")

    d = rd.load()
    names = dict(zip(d["stakeholders"]["id"], d["stakeholders"]["name"]))
    tasks = d["tasks"].set_index("id")
    clients = d["clients"].set_index("id")
    preds = json.loads((ARTIFACTS / "predictions.json").read_text())
    similar = json.loads((ARTIFACTS / "similar_cases.json").read_text())
    cache = json.loads(OUT.read_text()) if OUT.exists() else {}

    selected = sorted(preds)[: args.limit]
    jobs = {}
    for task_id in selected:
        task = {"id": task_id, **tasks.loc[task_id].to_dict()}
        facts = build_facts(task, clients.loc[task["client_id"]].to_dict(), preds[task_id], similar[task_id], names)
        digest = hashlib.sha256(f"{MODEL}\n{SYSTEM}\n{facts}".encode()).hexdigest()[:16]
        if args.force or cache.get(task_id, {}).get("input_hash") != digest:
            jobs[task_id] = (facts, digest)

    print(f"{len(jobs)} to summarize, {len(selected) - len(jobs)} cached", flush=True)
    api = anthropic.Anthropic(timeout=60.0, max_retries=2)  # fail fast instead of hanging on a stalled request
    with ThreadPoolExecutor(WORKERS) as pool:
        results = dict(zip(jobs, pool.map(lambda job: summarize(api, job[0]), jobs.values())))

    refused = [t for t, s in results.items() if s is None]
    for task_id, summary in results.items():
        if summary is not None:
            cache[task_id] = {"summary": summary, "model": MODEL, "input_hash": jobs[task_id][1]}
    OUT.write_text(json.dumps(dict(sorted(cache.items())), indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(rd.ROOT)} ({len(cache)} summaries)"
          + (f"; refused: {', '.join(refused)}" if refused else ""))


if __name__ == "__main__":
    main()
