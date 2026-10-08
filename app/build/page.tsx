import type { Metadata } from "next";

import { getBuildStory } from "@/lib/data";
import { CATCHES, LAYERS, RULES } from "@/lib/story";

export const metadata: Metadata = { title: "How it was built · Signal" };

const fmt = (iso: string) => `${iso.slice(5, 10).replace("-", "/")} ${iso.slice(11, 16)}`;

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rule">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1.5 font-serif text-[40px] leading-none tracking-[-0.02em]">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-faint">{sub}</div>}
    </div>
  );
}

function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <div className="font-mono text-[11px] tracking-[.08em] text-faint">{kicker}</div>
        <h2 className="m-0 mt-2 text-balance font-serif text-[32px] font-normal leading-[1.1] tracking-[-0.01em]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function BuildPage() {
  const s = getBuildStory();
  const repo = s.repo;
  const loc = s.lines.typescript + s.lines.python;
  const evalsLabel = `${s.evals.passed}/${s.evals.total} · median ${s.evals.median_seconds.toFixed(1)}s`;

  return (
    <div className="flex max-w-[1100px] flex-col gap-14">
      <div>
        <div className="flex items-center gap-2 font-mono text-[11.5px] tracking-[.08em] text-muted">
          <div className="size-[7px] rounded-full bg-accent" />HOW IT WAS BUILT
        </div>
        <h1 className="m-0 mt-3.5 text-balance font-serif text-[40px] font-normal leading-none tracking-[-0.02em] min-[900px]:text-[60px]">
          {s.hours_to_live_agent} hours from first commit to a live agent.
        </h1>
        <div className="mt-4 max-w-[680px] text-pretty text-[15px] leading-relaxed text-muted">
          Built with Claude Code, designed with Claude Design, powered by the Claude API. Moving fast was the easy part.
          The work was catching where the AI was wrong, and building checks so the numbers on every page can be trusted.
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-8">
        <Stat value={`${s.hours_to_live_agent}h`} label="First commit → live agent" sub={`${fmt(s.first_commit)} → ${fmt(s.agent_live)}`} />
        <Stat value={String(s.commits)} label="Commits" sub="One working step each" />
        <Stat value={loc.toLocaleString("en-US")} label="Lines of code" sub={`${s.lines.typescript.toLocaleString("en-US")} TypeScript · ${s.lines.python.toLocaleString("en-US")} Python`} />
        <Stat value={String(s.logged_decisions)} label="Logged decisions & fixes" sub="docs/prompt-log.md" />
        <Stat value={`${s.evals.passed}/${s.evals.total}`} label="Agent evals passing" sub={`~$${(s.evals.total_cost_usd / s.evals.total).toFixed(3)} per question`} />
      </div>

      <Section kicker="WHERE THE AI WAS WRONG" title="And how each one was caught.">
        <div className="max-w-[680px] text-pretty leading-relaxed text-muted">
          Every one of these shipped as working-looking code or output. None would have been caught by just reading the code.
        </div>
        <div className="grid gap-x-10 gap-y-8 min-[900px]:grid-cols-2">
          {CATCHES.map((c, i) => (
            <div key={c.title} className="rule flex flex-col gap-2.5">
              <div className="flex items-baseline gap-3">
                <div className="font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</div>
                <div className="text-balance font-serif text-[22px] leading-[1.15]">{c.title}</div>
              </div>
              <div className="text-pretty leading-relaxed text-muted">{c.what}</div>
              <div className="text-pretty leading-relaxed">
                <span className="font-medium text-accent-ink">Caught by </span>{c.caughtBy.charAt(0).toLowerCase() + c.caughtBy.slice(1)}
              </div>
              <div className="text-pretty leading-relaxed"><span className="font-medium text-green-ink">Fix </span>{c.fix}</div>
              <a href={`${repo}/commit/${c.commit}`} className="self-start font-mono text-[11.5px] text-muted no-underline hover:text-ink" target="_blank" rel="noreferrer">
                commit {c.commit} ↗
              </a>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="VERIFICATION" title="Every layer has a check that runs.">
        <div className="overflow-x-auto border-t border-line2">
          <table className="w-full min-w-[640px] border-collapse">
            <tbody>
              {LAYERS.map((l) => (
                <tr key={l.layer} className="border-b border-line">
                  <td className="w-[140px] py-3 pr-4 align-top font-medium">{l.layer}</td>
                  <td className="py-3 pr-4 align-top text-muted">{l.check}</td>
                  <td className="py-3 text-right align-top font-mono text-[12.5px]">{l.result === "EVALS" ? evalsLabel : l.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-faint">* Recorded in the README and data spec when last run; the rest are generated from the repo.</div>
      </Section>

      <Section kicker="HOW I STEER CLAUDE CODE" title="Rules the AI works under, and why.">
        <div className="flex flex-wrap gap-2">
          {["Plan the step", "One feature per session", "Verify with scripts & evals", "Commit", "Log the decision"].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className="rounded-full border border-line2 px-3 py-1">{step}</div>
              {i < 4 && <span className="text-faint">→</span>}
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          {RULES.map((r) => (
            <div key={r.rule} className="grid gap-1 border-t border-line py-3.5 min-[900px]:grid-cols-[1.2fr_1fr] min-[900px]:gap-8">
              <div className="font-mono text-[12.5px] leading-relaxed">{r.rule}</div>
              <div className="text-pretty leading-relaxed text-muted">{r.why}</div>
            </div>
          ))}
        </div>
        <div className="text-muted">
          Full rules in <a href={`${repo}/blob/main/CLAUDE.md`} target="_blank" rel="noreferrer">CLAUDE.md</a>; every decision and correction in{" "}
          <a href={`${repo}/blob/main/docs/prompt-log.md`} target="_blank" rel="noreferrer">docs/prompt-log.md</a>.
        </div>
      </Section>

      <Section kicker="TIMELINE" title="Every step, as committed.">
        <div className="flex flex-col border-t border-line2">
          {s.timeline.map((c) => (
            <a
              key={c.hash}
              href={`${repo}/commit/${c.hash}`}
              target="_blank"
              rel="noreferrer"
              className="grid grid-cols-[96px_1fr] gap-4 border-b border-line py-2.5 text-ink no-underline hover:bg-surface2 hover:text-ink min-[900px]:grid-cols-[110px_80px_1fr]"
            >
              <div className="font-mono text-xs text-muted">{fmt(c.date)}</div>
              <div className="hidden font-mono text-xs text-faint min-[900px]:block">{c.hash}</div>
              <div>{c.subject}</div>
            </a>
          ))}
        </div>
      </Section>
    </div>
  );
}
