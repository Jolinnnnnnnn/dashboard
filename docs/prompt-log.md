# Prompt Log

Key prompts given to Claude Code and where its output needed correcting. Interview evidence for how the project was built with AI assistance. Add an entry for anything notable: a decision, a correction, or a prompt that worked well.

| Date | Phase | Prompt / decision | Outcome / correction |
|---|---|---|---|
| 2026-10-07 | Planning | Reviewed a 5-view outline as a hiring manager would | Cut Knowledge Graph to stretch; kept the agent as the main proof of AI skill |
| 2026-10-07 | Planning | Use synthetic data with planted patterns instead of real APIs | Mock API layer keeps the same interface so real endpoints can be swapped in |
| 2026-10-07 | 0 | Setup | System Python was 3.9 (end of life); installed 3.12 via Homebrew and rebuilt the venv |
| 2026-10-07 | 1 | Drafted data spec at 2,000 historical / 150 open tasks | Reduced to 400 / 100; widened validation ranges and cut issue families from 15 to 10 to keep patterns detectable |
| 2026-10-07 | 2 | "Start phase 2": generator + validator from the spec | Validator caught a real bug: pandas `groupby().first()` skips NaN, so merging a duplicate on the first Intake row copied the wrong `from_stakeholder`. Fixed with positional first/last. 17/17 checks pass. |
| 2026-10-07 | 2 | Spec said P3 = "Security → Support rate 12–24%" | Wrong metric: Log access's normal route already goes Security → Support. Changed to share of tasks with a Security → Support → Security sequence. |
| 2026-10-07 | 2 | Demo task T-4821 planned at 3.1 days with Network Eng | 3.1 / 1.85 median = 1.7×, which is Medium, not High. Generator now sets it to 2.2× the generated median (4.2 days); design prompt numbers updated. |
| 2026-10-07 | 2 | Similar-case hit rate was 100%: too clean to be believable | Added text overlap (vague titles, generic sentences, tickets worded like a related family) |
| 2026-10-07 | 2 | Adding text noise re-drew every route, and P3/P7 then failed by luck | Root cause: patterns depended on the seed. Split structure and text into separate random streams, assigned rework by quota, spread dates evenly, raised the holiday factor. Added `--seed`; all checks now pass on seeds 1–30. |
| 2026-10-07 | 2 | Tried to push similar-case hit rate down to 80–90% | Measured why it stays ~93%: text alone 78%, code modules alone 90%, combined 93%. Stopped tuning: combining the signals beating either one is realistic and a Phase 3 talking point. |
