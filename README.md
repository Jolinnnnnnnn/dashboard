# Relay

Relay predicts where a stuck task goes next and shows how similar issues were solved for other clients, so TPMs can unblock work before it slips.

> **Status:** in progress. See [docs/plan.md](docs/plan.md).
>
> **All data is synthetic.** 400 historical and 100 open tasks for a fictional CDN company, generated with planted patterns ([docs/data-spec.md](docs/data-spec.md)). Accuracy numbers are indicative, not real-world performance.

## Results (synthetic data, held-out test set)

Trained on tasks created Oct 2025–Jun 2026 (300 tasks), tested on Jul–Sep 2026 (100 tasks). Reproduce with `python scripts/backtest.py`.

**Next stakeholder:** knowing the task type matters most where routes branch.

| | Model (stakeholder + task type) | Baseline (stakeholder only) |
|---|---|---|
| Top-1 accuracy | **89.0%** | 56.2% |
| Top-3 accuracy | **97.8%** | 90.6% |

Biggest gains at Intake (99% vs 41%), Support (89% vs 38%), and Dev (88% vs 6%). At Customer both are 98%: tasks almost always close next.

**Days to close** (predicted when a task reaches each team): median error **0.90 days** vs 1.02 baseline; 74% of predictions within 2 days. A modest gain: hold times are noisy, so the ETA is shown as an estimate, not a promise.

**Similar past cases** (100 open tasks searched against 400 closed):

| Signal | Precision@3 | At least one right in top 3 |
|---|---|---|
| Ticket text only | 73.7% | 94.0% |
| Code modules only | 94.7% | 97.0% |
| **Combined** (0.7 text + 0.3 modules) | **96.7%** | **100%** |

Ticket text is noisy (vague titles, tickets worded like a different problem), and code areas carry most of the signal. Combining them is the only setup that always surfaces a relevant fix.

**AI summaries:** 100 open-task summaries from Claude Haiku 5.5, grounded only in precomputed facts. An automated check confirms no summary cites a task ID it wasn't given.

**Agent briefing:** five detectors (most overdue task with a known fix, module behind at-risk tasks, clients slow to respond, rising rework, process-change effects) find insights in the data; Claude writes each card from the detected facts, and any wording with a number not in the facts is rejected for a template. Today's briefing: 4 insights, all Claude-worded, all passing the check.

> These numbers show the pipeline recovers patterns planted in synthetic data ([data spec](docs/data-spec.md)). They are not real-world accuracy; with real data the same scripts would be re-run.

## Run locally

```bash
npm ci
npm run dev        # http://localhost:3000
```

Data and model scripts (Python 3.12): see the Commands section of [CLAUDE.md](CLAUDE.md).

## Docs

- [Plan](docs/plan.md)
- [Data spec](docs/data-spec.md)
- [Definitions](docs/definitions.md)
- [Prompt log](docs/prompt-log.md)
