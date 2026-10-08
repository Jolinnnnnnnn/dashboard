# Relay

Operations dashboard for a (fictional) CDN company. Predicts which stakeholder a pending client task goes to next, shows where tasks get stuck, and surfaces how similar issues were solved for other clients. Includes a read-only AI agent that answers questions via tool calls. Portfolio project; all data is synthetic.

## Users

TPMs / support leads tracking client tasks across teams.

## Stack

- Offline data & analysis: Python 3.12 (`scripts/`, venv in `.venv/`), pandas, numpy, scikit-learn
- App: Next.js 16 (App Router, `cacheComponents` + `partialPrefetching` on), React 19, TypeScript (strict), Tailwind v4. Charts and the process map are custom SVG/divs matching the Claude Design prototype (no chart library, no shadcn).
- AI: Claude API. Sonnet 5.5 (`claude-sonnet-5-5`) for the agent, Haiku 5.5 (`claude-haiku-5-5`) for offline task summaries
- Hosting: GitHub → Vercel

## Repo layout

- `scripts/`: `generate_data.py`, `validate_patterns.py`, `backtest.py`, `build_artifacts.py`
- `data/`: generated JSON (committed); `data/artifacts/`: transition tables, similar cases, summaries
- `lib/agent/`: agent tools + system prompt
- `app/`: pages (`/` queue, `task/[id]`, `process`, `ask`; later `api/agent`)
- `components/`: client components (TopBar, Sidebar, QueueTable, ProcessView, AskView, ui)
- `lib/data.ts` (server-only data access) and `lib/types.ts` (view models)
- `design/`: Claude Design handoff (`project/Relay.dc.html`), the visual source of truth; tokens copied into `app/globals.css`
- `docs/`: `plan.md`, `data-spec.md`, `definitions.md`, `prompt-log.md`
- `evals/`: agent eval questions + runner

## Key docs (read before changing related code)

- `docs/data-spec.md`: entities, routes, planted patterns. Source of truth for the data.
- `docs/definitions.md`: handoff, hold time, at-risk, resolved.

## Rules

- Never hand-edit files in `data/`. Change the spec or the generator, then regenerate.
- After regenerating data, run `validate_patterns.py`; all checks must pass.
- All data access in the app goes through `lib/data.ts`. Pages and the agent never read JSON directly.
- Next.js 16 is not the version in most training data: read `node_modules/next/dist/docs/` before using an unfamiliar API (see AGENTS.md). Key rules here: `params`/`searchParams` are Promises; anything reading them, `useSearchParams`, or `usePathname` must sit inside `<Suspense>` or the production build fails; no `dynamic`/`dynamicParams`/`revalidate` exports; route handlers run on Node.js (no edge).
- Secrets live only in `.env.local` / Vercel env vars. Never import them into client components.
- The agent is read-only, must cite task IDs for claims, and says "I don't know" when the data doesn't support an answer. Max 6 tool calls per question.
- The UI shows a "synthetic data" disclaimer; never present the data as real.

## Workflow

- One feature per session; plan first, then implement.
- Commit after each working step with a clear message.
- Verify your own work: run scripts, check numbers against validation output, run tests/evals.
- Update this file when a decision or convention changes.

## Commands

App (from the repo root):

- `npm run dev`: dev server on http://localhost:3000
- `npx tsc --noEmit && npx eslint .`: typecheck and lint (`next build` no longer lints)
- `npm run build`: production build; prerenders all 500 task pages. Run it before pushing: Suspense mistakes only fail here.

Data pipeline, run from the repo root with the venv active (`source .venv/bin/activate`):

- `pip install -r requirements.txt`: install Python deps
- `python scripts/generate_data.py`: regenerate `data/` (deterministic, seed 42)
- `python scripts/validate_patterns.py`: check counts, demo task, noise, and patterns P1–P7; exits 1 on failure
- `python scripts/backtest.py`: train Oct–Jun / test Jul–Sep; next-stakeholder, ETA, and similar-case metrics → `data/artifacts/backtest.json`
- `python scripts/build_artifacts.py`: `transitions.json`, `predictions.json` (open tasks), `similar_cases.json` (all tasks) in `data/artifacts/`
- `python scripts/summarize_tasks.py [--limit N] [--force]`: Haiku summaries for open tasks → `summaries.json`. Calls the Claude API (reads `ANTHROPIC_API_KEY` from env or `.env.local`); cached by input hash, so only changed tasks are re-sent.
- Pipeline order after changing data or model code: generate → validate → backtest → build_artifacts → summarize_tasks
- `generate_data.py` and `validate_patterns.py` accept `--data-dir DIR` (and the generator `--seed N`) to test other seeds without touching `data/`. After changing the generator, check a range of seeds, not just 42.

`scripts/relay_data.py` holds shared loading/cleaning (`load`, `clean_handoffs`, `stints`, `routes`, `risk_levels`); `scripts/relay_model.py` holds `TransitionModel` (prediction, ETA) and `SimilarityIndex`. Reuse them rather than re-implementing. The TypeScript app reads the precomputed artifacts; it doesn't re-implement the model.
