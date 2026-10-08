# Signal

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
- `app/`: pages (`/` briefing, `queue`, `task/[id]`, `process`, `ask`) and `api/agent` (POST, streams NDJSON events)
- `lib/agent/`: `run.ts` (tool-use loop, Sonnet 5.5, guardrails), `tools.ts` (8 read-only tools, zod-validated), `ratelimit.ts` (Upstash or in-memory fallback)
- `components/`: client components (AgentDock: provider, dock, launcher, AskButton; BriefingView, TopBar, Sidebar, QueueTable, ProcessView, AskView, ui)
- `lib/data.ts` (server-only data access) and `lib/types.ts` (view models)
- `design/`: Claude Design handoff; `project/Relay v3.dc.html` is the current visual source of truth (v1/v2 kept for reference; designed under the working name Relay); tokens copied into `app/globals.css`
- `docs/`: `plan.md`, `data-spec.md`, `definitions.md`, `prompt-log.md`
- `lib/workspace.ts` + `app/api/workspace`: demo team workspace (task claims and notes). Seeded teammates in `data/seed_workspace.json` plus each visitor's own changes, sandboxed per anonymous cookie for 24h (Upstash or memory). No login; in production this would sit behind SSO.
- `evals/`: `agent-questions.json` (16 graded questions) + `run.ts`; results in `evals/results.json`

## Key docs (read before changing related code)

- `docs/data-spec.md`: entities, routes, planted patterns. Source of truth for the data.
- `docs/definitions.md`: handoff, hold time, at-risk, resolved.

## Rules

- Never hand-edit files in `data/`. Change the spec or the generator, then regenerate.
- After regenerating data, run `validate_patterns.py`; all checks must pass.
- All data access in the app goes through `lib/data.ts`. Pages and the agent never read JSON directly.
- Next.js 16 is not the version in most training data: read `node_modules/next/dist/docs/` before using an unfamiliar API (see AGENTS.md). Key rules here: `params`/`searchParams` are Promises; anything reading them, `useSearchParams`, or `usePathname` must sit inside `<Suspense>` or the production build fails; no `dynamic`/`dynamicParams`/`revalidate` exports; route handlers run on Node.js (no edge).
- Secrets live only in `.env.local` / Vercel env vars. Never import them into client components.
- The agent is read-only, must cite task IDs for claims, and says "I don't know" when the data doesn't support an answer. Max 6 tool calls per question; then tools are switched off and it must answer.
- Agent answers only show task IDs as sources if a tool returned them; any other ID is flagged "unverified" in the UI and fails the evals.
- The UI shows a "synthetic data" disclaimer; never present the data as real.
- Every briefing insight must come from a detector over the data, never hand-written copy. If the design needs a finding the data can't support, plant the pattern in the generator (spec + validation) or drop the card.

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
- `npm run story`: regenerates `data/artifacts/build_story.json` (commits, code size, logged decisions, eval results) for the How it was built page (`/build`; curated catches in `lib/story.ts`, each tied to a real prompt-log entry and commit). Run before pushing when history changes.
- `npm run eval [-- <id filter>]`: runs the agent eval set against the real API (~$0.23 for all 16). Re-run after changing the system prompt, tools, or model.
- Env vars: `ANTHROPIC_API_KEY` (agent; without it the dock reports "not configured"), `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (rate limits; required in production, the in-memory fallback resets per instance).

Data pipeline, run from the repo root with the venv active (`source .venv/bin/activate`):

- `pip install -r requirements.txt`: install Python deps
- `python scripts/generate_data.py`: regenerate `data/` (deterministic, seed 42)
- `python scripts/validate_patterns.py`: check counts, demo task, noise, and patterns P1–P7; exits 1 on failure
- `python scripts/backtest.py`: train Oct–Jun / test Jul–Sep; next-stakeholder, ETA, and similar-case metrics → `data/artifacts/backtest.json`
- `python scripts/build_artifacts.py`: `transitions.json`, `predictions.json` (open tasks), `similar_cases.json` (all tasks) in `data/artifacts/`
- `python scripts/summarize_tasks.py [--limit N] [--force]`: Haiku summaries for open tasks → `summaries.json`. Calls the Claude API (reads `ANTHROPIC_API_KEY` from env or `.env.local`); cached by input hash, so only changed tasks are re-sent.
- `python scripts/build_briefing.py [--no-llm]`: agent briefing → `briefing.json`. Detectors find insights; Claude (Haiku) words them; wording with any number not in the facts is rejected for a template. Cached by input hash.
- Pipeline order after changing data or model code: generate → validate → backtest → build_artifacts → summarize_tasks → build_briefing
- `generate_data.py` and `validate_patterns.py` accept `--data-dir DIR` (and the generator `--seed N`) to test other seeds without touching `data/`. After changing the generator, check a range of seeds, not just 42.

`scripts/signal_data.py` holds shared loading/cleaning (`load`, `clean_handoffs`, `stints`, `routes`, `risk_levels`); `scripts/signal_model.py` holds `TransitionModel` (prediction, ETA) and `SimilarityIndex`. Reuse them rather than re-implementing. The TypeScript app reads the precomputed artifacts; it doesn't re-implement the model.
