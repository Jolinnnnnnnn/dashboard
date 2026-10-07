# Prompt Log

Key prompts given to Claude Code and where its output needed correcting. Interview evidence for how the project was built with AI assistance. Add an entry for anything notable: a decision, a correction, or a prompt that worked well.

| Date | Phase | Prompt / decision | Outcome / correction |
|---|---|---|---|
| 2026-10-07 | Planning | Reviewed a 5-view outline as a hiring manager would | Cut Knowledge Graph to stretch; kept the agent as the main proof of AI skill |
| 2026-10-07 | Planning | Use synthetic data with planted patterns instead of real APIs | Mock API layer keeps the same interface so real endpoints can be swapped in |
| 2026-10-07 | 0 | Setup | System Python was 3.9 (end of life); installed 3.12 via Homebrew and rebuilt the venv |
| 2026-10-07 | 1 | Drafted data spec at 2,000 historical / 150 open tasks | Reduced to 400 / 100; widened validation ranges and cut issue families from 15 to 10 to keep patterns detectable |
