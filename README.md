# Relay

Relay predicts where a stuck task goes next and shows how similar issues were solved for other clients, so TPMs can unblock work before it slips.

> **Status:** in progress. See [docs/plan.md](docs/plan.md).
>
> **All data is synthetic.** 400 historical and 100 open tasks for a fictional CDN company, generated with planted patterns ([docs/data-spec.md](docs/data-spec.md)). Accuracy numbers are indicative, not real-world performance.

## Results (synthetic data, held-out test set)

Trained on tasks created Oct 2025–Jun 2026 (299 tasks), tested on Jul–Sep 2026 (101 tasks). Reproduce with `python scripts/backtest.py`.

**Next stakeholder:** knowing the task type matters most where routes branch.

| | Model (stakeholder + task type) | Baseline (stakeholder only) |
|---|---|---|
| Top-1 accuracy | **89.3%** | 60.5% |
| Top-3 accuracy | **97.3%** | 90.2% |

Biggest gains at Intake (97% vs 43%), Support (93% vs 44%), and Network Eng (70% vs 35%). At Customer both are 99%: tasks almost always close next.

**Days to close** (predicted when a task reaches each team): median error **0.75 days** vs 0.99 baseline; 78% of predictions within 2 days. A modest gain: hold times are noisy, so the ETA is shown as an estimate, not a promise.

**Similar past cases** (100 open tasks searched against 400 closed):

| Signal | Precision@3 | At least one right in top 3 |
|---|---|---|
| Ticket text only | 73.7% | 90.0% |
| Code modules only | 93.3% | 98.0% |
| **Combined** (0.7 text + 0.3 modules) | **93.0%** | **100%** |

Ticket text is noisy (vague titles, tickets worded like a different problem), and code areas carry most of the signal. Combining them is the only setup that always surfaces a relevant fix.

**AI summaries:** 100 open-task summaries from Claude Haiku 5.5, grounded only in precomputed facts. An automated check confirms no summary cites a task ID it wasn't given.

> These numbers show the pipeline recovers patterns planted in synthetic data ([data spec](docs/data-spec.md)). They are not real-world accuracy; with real data the same scripts would be re-run.

## Docs

- [Plan](docs/plan.md)
- [Data spec](docs/data-spec.md)
- [Definitions](docs/definitions.md)
- [Prompt log](docs/prompt-log.md)
