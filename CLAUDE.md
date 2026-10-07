# Relay

Operations dashboard for a (fictional) CDN company. Predicts which stakeholder a pending client task goes to next, shows where tasks get stuck, and surfaces how similar issues were solved for other clients. Includes a read-only AI agent that answers questions via tool calls. Portfolio project; all data is synthetic.

## Users

TPMs / support leads tracking client tasks across teams.

## Stack

- Offline data & analysis: Python 3.12 (`scripts/`, venv in `.venv/`), pandas, numpy, scikit-learn
- App: Next.js (App Router), TypeScript (strict), Tailwind, shadcn/ui, Recharts, React Flow
- AI: Claude API. Sonnet 5.5 (`claude-sonnet-5-5`) for the agent, Haiku 5.5 (`claude-haiku-5-5`) for offline task summaries
- Hosting: GitHub → Vercel

## Repo layout

- `scripts/`: `generate_data.py`, `validate_patterns.py`, `backtest.py`, `build_artifacts.py`
- `data/`: generated JSON (committed); `data/artifacts/`: transition tables, similar cases, summaries
- `lib/data/`: mock API layer (same signatures as the future real APIs)
- `lib/predict/`: prediction from transition tables
- `lib/agent/`: agent tools + system prompt
- `app/`: pages (queue, `task/[id]`, process, ask) and `api/agent`
- `docs/`: `plan.md`, `data-spec.md`, `definitions.md`, `prompt-log.md`
- `evals/`: agent eval questions + runner

## Key docs (read before changing related code)

- `docs/data-spec.md`: entities, routes, planted patterns. Source of truth for the data.
- `docs/definitions.md`: handoff, hold time, at-risk, resolved.

## Rules

- Never hand-edit files in `data/`. Change the spec or the generator, then regenerate.
- After regenerating data, run `validate_patterns.py`; all checks must pass.
- All data access in the app goes through `lib/data/`. Pages and the agent never read JSON directly.
- Secrets live only in `.env.local` / Vercel env vars. Never import them into client components.
- The agent is read-only, must cite task IDs for claims, and says "I don't know" when the data doesn't support an answer. Max 6 tool calls per question.
- The UI shows a "synthetic data" disclaimer; never present the data as real.

## Workflow

- One feature per session; plan first, then implement.
- Commit after each working step with a clear message.
- Verify your own work: run scripts, check numbers against validation output, run tests/evals.
- Update this file when a decision or convention changes.

## Commands

Run from the repo root with the venv active (`source .venv/bin/activate`):

- `pip install -r requirements.txt`: install Python deps
- `python scripts/generate_data.py`: regenerate `data/` (deterministic, seed 42)
- `python scripts/validate_patterns.py`: check counts, demo task, noise, and patterns P1–P7; exits 1 on failure
- Both accept `--data-dir DIR` (and the generator `--seed N`) to test other seeds without touching `data/`. After changing the generator, check a range of seeds, not just 42.

`scripts/relay_data.py` holds shared loading/cleaning (`load`, `clean_handoffs`, `stints`, `routes`, `risk_levels`). Reuse it in later scripts rather than re-implementing.
