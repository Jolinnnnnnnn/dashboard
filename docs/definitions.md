# Definitions

Exact meanings of the terms used across the data scripts, the app, and the agent. If code and this file disagree, fix one of them; don't let them drift.

## Tasks and handoffs

| Term | Definition |
|---|---|
| **Task** | One client request, identified by `id` (e.g. `T-4821`). Has a type, family, client, and code areas. |
| **Handoff** | One row in `handoffs.json`: the task moving from `from_stakeholder` to `to_stakeholder`. A task's handoffs, ordered by `seq`, form its route. |
| **Stint** | A continuous period a task spends with one stakeholder, from `entered_at` to `left_at`. |
| **Hold time** | `left_at − entered_at` for a stint, in days (`hold_days`). For the current stint of an open task, `today − entered_at`. |
| **Current stakeholder** | For an open task, the stakeholder of its latest stint. Closed tasks have `current_stakeholder = closed`. |
| **Route** | The ordered list of stakeholders a task passed through, starting at Intake. |
| **Rework** | A handoff back to a stakeholder the task already left earlier in its route (e.g. Security → Support → Security). |
| **Duplicate handoff** | Two consecutive handoffs to the same stakeholder; a data-entry error removed during cleaning. |

## Status

| Term | Definition |
|---|---|
| **Open** | `status = open`: no handoff to `closed` yet. |
| **Resolved / closed** | `status = closed`: the last handoff goes to `closed`; `closed_at` is set. |
| **Days open** | For open tasks: `today − created_at`. For closed tasks: `closed_at − created_at`. |
| **Today** | Fixed at `2026-10-07` for the synthetic data, so numbers don't drift. |

## Risk

| Term | Definition |
|---|---|
| **Median hold (stakeholder, type)** | Median hold time of closed stints for that stakeholder and task type. Falls back to the stakeholder's overall median if the pair has < 5 stints. |
| **Hold ratio** | Current hold time ÷ median hold for the task's (current stakeholder, type). |
| **Risk level** | Hold ratio > 2.0 → **High**; > 1.5 → **Medium**; otherwise **Low**. |
| **Bottleneck** | The stakeholder with the highest median hold time across closed stints. |

## Prediction

| Term | Definition |
|---|---|
| **Next stakeholder** | The stakeholder a task is handed to after its current stint. |
| **Transition probability** | Share of closed stints at stakeholder S (for task type T) whose next handoff went to N. Falls back to stakeholder-only when (S, T) has < 5 examples. |
| **Baseline** | Always predicts the single most common next stakeholder from S, ignoring task type. |
| **Top-k accuracy** | Share of test stints where the actual next stakeholder is among the k most probable predictions. |
| **Reason text** | Plain-language evidence for a prediction, e.g. "17 of 25 similar cache tasks went to Customer after Network Eng". |
| **Estimated close** | Today + sum of median hold times along the most probable remaining route. |

## Similar cases

| Term | Definition |
|---|---|
| **Similar case** | A closed task ranked by combined similarity to a given task. |
| **Similarity score** | 0.7 × TF-IDF cosine similarity on title + description + 0.3 × Jaccard overlap of code modules (module = first path segment of each code area). Weights may be tuned in Phase 3; update here if they change. |
| **Hit** | A similar case from the same issue family as the query task (used only for evaluation; the app never uses family labels to rank). |
| **Problem module** | A code module ranked by the number of tasks linked to it. |
