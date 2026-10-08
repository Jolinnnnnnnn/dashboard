# Signal: Plan

> Renamed from the working name **Relay** on 2026-10-08. The Claude Design prompt in section 6 is kept verbatim as sent, so it still says Relay.

**Status (update as phases finish):** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ✅ · Phase 5 ✅ (live: https://signal-agent-nu.vercel.app) · Phase 6 ✅ · Design v3 ✅ (briefing, classic view, agent dock UI) · Phase 7 ✅ (agent, 15/15 evals) · Phase 8 in progress (Upstash + API key live on Vercel ✅; next: mobile check, README visuals, demo script, video, How-it-was-built page)

## 1. What it is

**Pitch:** "Signal is an AI agent for operations data: instead of a dashboard you have to dig through, it checks every client task and handoff, tells you what changed and what needs you, predicts where stuck tasks go next, and shows how similar issues were solved before."

- **User:** a TPM or support lead at a CDN company managing client tasks across teams.
- **Views:** Task Queue, Task Detail, Process Map, Ask (agent). Knowledge Graph is a stretch.
- **Data:** fully synthetic (400 historical + 100 open tasks) with planted patterns, behind a mock API layer. See `docs/data-spec.md`.
- **Not included:** login, editing tasks, real company data, live API integrations.

## 2. Architecture

```
Python (offline, scripts/)                    Next.js app (Vercel)
───────────────────────────                   ─────────────────────────────────────
generate_data.py ──▶ data/*.json ───────────▶ lib/data/  (mock API: getTask, listTasks,
validate_patterns.py   (tasks, handoffs,        getTaskHistory, getCodeAreas, searchCases)
backtest.py            modules, clients)               │
build_artifacts.py ──▶ data/artifacts/*.json ──▶ lib/predict/ (transition tables → prediction)
  (transition tables, similar cases,                  │
   precomputed AI summaries)                   app/ pages: Queue · Task Detail · Process Map · Ask
                                                       │
                                               app/api/agent ──▶ Claude API (tool use)
                                                 tools = mock API functions, read-only
```

Python handles data generation and analysis. The app reads static JSON, so it's fast and cheap. Only the agent calls Claude live.

## 3. Tech stack

- **Data and analysis:** Python 3.12, pandas, numpy, scikit-learn (TF-IDF for similar cases)
- **App:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui
- **Charts:** Recharts (bars, timelines); React Flow (Process Map); `react-force-graph` (Knowledge Graph stretch)
- **AI:** Claude API. Sonnet 5.5 for the agent; Haiku 5.5 for precomputed task summaries.
- **Hosting:** GitHub → Vercel auto-deploy. Upstash Redis (free tier) for rate limiting the public agent, added in Phase 8.

## 4. Repo structure

```
signal/
├── CLAUDE.md                 # goal, users, data model, rules, conventions
├── README.md
├── .env.example              # required env var names, no values
├── requirements.txt          # Python deps (Phase 2)
├── docs/
│   ├── plan.md
│   ├── data-spec.md          # entities, volumes, planted patterns
│   ├── definitions.md        # handoff, hold time, at-risk, resolved
│   └── prompt-log.md         # key Claude Code prompts + corrections
├── scripts/                  # Python: generate, validate, backtest, build artifacts
├── data/                     # generated JSON (committed) + artifacts/
├── evals/agent-questions.json
├── lib/data/  lib/predict/  lib/agent/
├── app/  (queue, task/[id], process, ask, api/agent)
└── components/
```

Folders are created in the phase that first needs them.

---

## 5. Phases

### Phase 0: Setup ✅ (you)
- GitHub repo, local git with `.gitignore`, first push.
- Python 3.12 via Homebrew, `.venv` created with 3.12.
- Anthropic API key with credits and a monthly spend limit, stored in `.env.local` (git-ignored).
- Vercel account created (repo linked in Phase 5). Upstash deferred to Phase 8.

### Phase 1: Docs ✅ (Claude Code)
- `docs/data-spec.md`, `docs/definitions.md`, `docs/plan.md`, `docs/prompt-log.md`, `CLAUDE.md`, `README.md` stub, `.env.example`.

**Done when:** you've reviewed and agreed with the spec.

### Phase 2: Generate + validate data ✅ (Claude Code, Python)
- `requirements.txt`; install into `.venv`.
- `generate_data.py` writes `stakeholders.json`, `clients.json`, `modules.json`, `tasks.json`, `handoffs.json` per the spec (seed 42).
- Titles, descriptions, and solution notes come from per-family templates with variation.
- `validate_patterns.py` checks P1–P7 and fails loudly if any is missing.

**Done when:** validation passes, and you've spot-checked 5 tasks by hand (including T-4821).

### Phase 3: Prediction + similar cases + backtest ✅ (Claude Code, Python)
- **Baseline:** most common next stakeholder overall.
- **Model:** transition probabilities by (current stakeholder, task type), falling back to stakeholder-only when a pair has < 5 examples. Includes median remaining hold time.
- **Backtest:** train Oct 2025–Jun 2026, test Jul–Sep 2026. Report top-1 and top-3 accuracy vs baseline.
- **Similar cases:** TF-IDF on text + code-module overlap, combined into one score. Measure top-3 hit rate on ~10 labeled tasks (one per family).
- **Artifacts:** `build_artifacts.py` writes transition tables, top-5 similar cases per open task, and Haiku-written summaries for the 100 open tasks.

**Done when:** accuracy beats baseline and the numbers are in the README draft.

### Phase 4: Design in Claude Design ✅ (you)
- Paste the prompt in section 6, make a few targeted revisions, then stop.
- Export → Hand off to Claude Code (local), pointed at this repo.

**Done when:** the handoff has landed in the repo.

### Phase 5: Scaffold + deploy day one ✅ (deploy pending: you import the repo into Vercel)
- Turn the handoff into a Next.js app with shadcn/ui, using mock data in the real JSON shapes.
- Import the repo into Vercel; add `ANTHROPIC_API_KEY` under Settings → Environment Variables.
- Push → live URL.

**Done when:** all four views render on the live URL, even with fake numbers.

### Phase 6: Data layer + wire up views ✅ (done together with Phase 5: the artifacts already existed, so no mock-data step)
- `lib/data/`: mock API functions with the same signatures real APIs would have, reading JSON.
- `lib/predict/`: reads transition tables, returns next stakeholder, probabilities, reason text, ETA.
- Wire up one view at a time, committing after each:
  1. **Task Queue:** summary cards + sortable, filterable table
  2. **Task Detail:** timeline with predicted dashed steps, prediction with reason, related code, similar cases, AI summary
  3. **Process Map:** React Flow graph (edge thickness = volume, color = wait time), node click panel, "top problem modules" bar chart

**Done when:** a few UI numbers match `validate_patterns.py` output (e.g. Security's median hold).

### Phase 7: Ask agent ✅ (Claude Code)
- `/api/agent`: Claude tool use with read-only tools: `list_tasks(filters)`, `get_task(id)`, `get_task_history(id)`, `get_code_areas(id)`, `search_similar_cases(query|id)`, `get_routing_stats(filters)`, `get_module_stats()`.
- **Guardrails:** max 6 tool calls per question, must cite task IDs, "I don't know" when evidence is thin, refuse requests outside the data.
- **UI:** streaming, step indicator, source chips, suggested questions, follow-ups.
- **Evals:** 15 questions in `evals/agent-questions.json` (lookups, multi-step, unanswerable). A script runs them and records the pass rate.

**Done when:** eval pass rate is recorded and failures are understood or fixed.

### Phase 8: Polish + ship (~3 hrs, Claude Code + you)
- Upstash Redis rate limit on `/api/agent` (per IP) + friendly limit message. Add Upstash env vars to `.env.local` and Vercel.
- Loading skeletons, error and empty states, responsive layout, dismissible "synthetic data" banner.
- README: pitch, live link, screenshot/GIF, architecture, planted-pattern table, backtest and eval numbers, guardrails, what was cut and why, "next: swap mock API for real endpoints".
- Finish `docs/prompt-log.md`. Record a 2-minute backup demo video.

**Done when:** the live link works in an incognito window on desktop and phone.

### Stretch: Knowledge Graph (~2 hrs, only after Phase 8)
- `react-force-graph`: tasks, modules, clients as nodes, centered on the selected task, plus a hotspot panel.

---

## 6. Claude Design prompt

```text
Design a 4-screen web app called "Relay", an operations dashboard for a CDN company's technical program managers. It predicts which team a pending client task will go to next, shows how long it's been stuck, and surfaces how similar issues were solved for other clients. An AI agent answers questions about tasks. Portfolio piece; it should feel like a polished internal tool from a top tech company: calm, dense with information but never cluttered.

Built in Next.js + Tailwind + shadcn/ui + Recharts + React Flow, so use standard buildable patterns: cards, tables, badges, tabs, selects, timelines, bar charts, a node-and-edge flow diagram, a chat panel. Desktop first (1440px), stacks cleanly on mobile.

VISUAL STYLE
- Light neutral background (cool off-white), near-black text, one accent color (deep teal or indigo). Status colors: green = on track, amber = at risk, red = high risk.
- Clean sans font (Inter or Geist) for UI; monospace (JetBrains Mono) for task IDs, file paths, and code.
- 1px borders, 8px radius, minimal shadows, generous spacing. Include a dark mode variant.

GLOBAL LAYOUT
- Left sidebar: "Relay" wordmark, nav: Queue / Process Map / Ask. Footer: "Synthetic data · Built with Claude Code".
- Top bar: search by task ID or client, filters for Task Type, Client, Stakeholder, Date range.
- Dismissible banner: "All data is synthetic, generated with realistic patterns. Try: open a high-risk task, explore the process map, or ask the agent a question."

SCREEN 1: TASK QUEUE (home)
- 4 summary cards: Open tasks (100), At risk (8), Avg days open (3.2), Biggest bottleneck (Security Review · 2.7d median hold).
- Table of open tasks, columns: Task ID (mono), Client, Type, Currently with (stakeholder badge), Days there (with a small bar compared against the median for that stakeholder), Predicted next (top stakeholder + a small stacked probability bar), Risk (badge). Sortable, row hover, click opens Task Detail.
- Example row: T-4821 · Northwind Media · Cache purge bug · Network Eng · 4.2d (median 1.9) · Customer 68% · High.

SCREEN 2: TASK DETAIL
- Header: "T-4821 · Cache purge not propagating to edge nodes", client, type, risk badge, "Open 5.2 days".
- Timeline: horizontal segmented bar of stakeholders so far with durations (Intake 0.2d → Support 0.8d → Network Eng 4.2d ongoing), then predicted next steps as dashed segments (Customer → Closed).
- Prediction card: "Next: Customer 68% · QA 22% · Dev 10%" as horizontal probability bars; reason line: "17 of 25 similar cache tasks went to Customer after Network Eng"; "Est. close: Oct 10".
- AI summary card: 2-3 sentences with a suggested action, small "Generated by Claude" label.
- Related code card: list of modules/files in monospace (cdn-cache-purge/, edge-sync/propagation.go, config-service/ttl_rules.yaml) with a "hotspot" tag on edge-sync.
- Similar cases: 3 cards, each with match score (92%), task ID, client, title, "Matched on: shared module edge-sync, similar description", "Solved by: …", resolution time.

SCREEN 3: PROCESS MAP
- Large canvas with a left-to-right directed flow diagram: nodes are stakeholders (Intake, Support, Network Eng, Security, Ops, QA, Dev, Customer, Closed), sized by task volume. Edges are handoffs; thickness = volume, color = avg wait (green to red). One edge loops back from Security to Support, labeled "18% rework".
- Clicking a node opens a right side panel: avg hold time vs median, open tasks currently there (mini list), top next stops with %, one-line insight.
- Below the canvas: "Top problem modules" horizontal bar chart (edge-sync/ first, then cdn-cache-purge/, …).

SCREEN 4: ASK (agent)
- Centered chat, max ~800px. Empty state: "Ask about any task, team, or past fix" plus 6 suggested chips (e.g. "Why is T-4821 at risk?", "How have we solved cache purge delays before?", "Which clients hit edge-sync issues this quarter?", "Where do Security tasks get stuck?", "Which team resolves SSL tasks fastest?", "What's likely to breach SLA this week?").
- Show one completed multi-step answer: a step trail ("Searched similar cases · Pulled routing stats · Compared clients"), a concise answer, a small table or bar chart, source chips with task IDs, and 2-3 follow-up chips.
- Show one honest "I don't know" answer: "There's no SLA contract data in this dataset, so I can't confirm breaches. I can show tasks open longer than the median for their type."
- Show the thinking state and a rate-limit message ("Demo limit reached, try again in a minute").
- Input bar pinned at the bottom: "Answers are generated from the task data via tool calls".

STATES: loading skeletons for cards/tables/graph, an error state with Retry, empty search results.

MOTION: subtle and purposeful only. Numbers count up on load, the timeline fills left to right, predicted segments fade in dashed, the process map edges draw in once, the agent's step trail ticks through steps, side panels slide in. Under 300ms, respect prefers-reduced-motion, nothing replays when filters change.

MOCK DATA: CDN company. Stakeholders: Intake, Support, Network Eng, Security, Ops, QA, Dev, Customer. Task types: Cache purge bug, New domain setup, SSL renewal, Traffic spike, Config change, DNS routing issue, Origin failover, Log access request. Clients: fictional brand names (e.g. Northwind Media, Lumen Games, Kestrel Retail). Modules: cdn-cache-purge/, edge-sync/, ssl-cert/, dns-routing/, origin-failover/, log-export/, waf-rules/, config-service/.
```

---

## 7. Deployment

- GitHub `main` auto-deploys to Vercel production; other branches get preview URLs.
- Vercel env vars: `ANTHROPIC_API_KEY` (Phase 5), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (Phase 8).
- Data JSON is committed and bundled; no database needed.
- Before sharing: test incognito on desktop and phone, hit the rate limit on purpose, confirm the Anthropic spend limit is set.

## 8. Verification (interview evidence)

| Check | Where | Target |
|---|---|---|
| Planted patterns present | `validate_patterns.py` | All pass |
| Prediction accuracy | `backtest.py` | Top-1 ≥ 10 points above baseline |
| Similar-case quality | ~10 labeled tasks | Top-3 hit rate recorded |
| Agent quality | `evals/` | Pass rate recorded, failures explained |
| UI numbers match data | Manual spot-check | 3–5 numbers match |

## 9. Demo script (~4 min, from the link)

1. **Queue:** "8 at risk. T-4821 has been at Network Eng more than twice the median."
2. **Task Detail:** prediction with its reason, then the similar case that has the fix.
3. **Process Map:** click Security to show the bottleneck and the rework loop.
4. **Ask:** a multi-step question, then the "I don't know" answer.
5. **README:** backtest and eval numbers, guardrails, "synthetic data; mock API ready to swap for real endpoints", "built in X days with Claude Code".

## 10. Timeline

| Day | Phases |
|---|---|
| 1 | 0, 1, 2, start 3 |
| 2 | Finish 3, 4 (Design), 5 (scaffold + deploy) |
| 3 | 6 (data layer + views) |
| 4 | 7 (agent + evals) |
| 5 | 8 (polish, README, video) + stretch if time |

**If squeezed (~2 days):** Phases 0–3 → Task Queue + Task Detail → agent with 3 tools → deploy. Drop Process Map and the evals UI; keep the backtest number.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Fake data looks too clean or too random | Planted patterns + noise, validation script |
| Small dataset makes numbers noisy | Widened validation ranges; README says results are indicative |
| Agent costs on a public link | Spend limit, rate limit, tool-call cap |
| Agent makes up answers | Must cite task IDs; "I don't know" path; evals |
| Design scope creep | 75-minute time-box; design locked after handoff |
| "Is this real data?" | Upfront banner and README disclaimer |
