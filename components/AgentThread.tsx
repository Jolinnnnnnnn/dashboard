"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

// Renders the agent conversation (shared by the dock and the Ask page).

export type Step = { id: string; label: string; status: "running" | "done" | "error" };
export type AgentMessage = {
  q: string;
  context: string;
  status: "thinking" | "done" | "error" | "limited";
  steps: Step[];
  text: string;
  sources: string[];
  unverified: string[];
  error?: string;
  toolCalls?: number;
  costUsd?: number;
};

const TASK_ID = /(T-\d{4})/g;

/** Inline formatting: **bold**, `code`, and task IDs as links. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="font-mono text-[12.5px]">{part.slice(1, -1)}</code>;
        return (
          <Fragment key={i}>
            {part.split(TASK_ID).map((piece, j) =>
              /^T-\d{4}$/.test(piece)
                ? <Link key={j} href={`/task/${piece}`} className="font-mono text-[12.5px]">{piece}</Link>
                : piece,
            )}
          </Fragment>
        );
      })}
    </>
  );
}

function Draft({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-bg px-3.5 py-3">
      <div className="whitespace-pre-wrap text-pretty leading-relaxed">{text}</div>
      <button
        onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setCopied(true); }}
        className="h-[26px] self-start rounded-md border border-line2 bg-transparent px-2.5 text-xs text-ink hover:border-faint"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Minimal markdown: paragraphs, "- " bullets, "> " quote blocks (drafts), inline formatting. */
export function Answer({ text }: { text: string }) {
  const blocks: { kind: "p" | "ul" | "quote"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const kind = /^\s*[-*] /.test(line) ? "ul" : line.startsWith(">") ? "quote" : line.trim() ? "p" : null;
    if (!kind) { blocks.push({ kind: "p", lines: [] }); continue; }
    const last = blocks.at(-1);
    const content = kind === "ul" ? line.replace(/^\s*[-*] /, "") : kind === "quote" ? line.replace(/^>\s?/, "") : line;
    if (last && last.kind === kind && (kind !== "p" || last.lines.length)) last.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }
  return (
    <div className="flex flex-col gap-2.5 leading-relaxed">
      {blocks.filter((b) => b.lines.length).map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className="m-0 flex list-disc flex-col gap-1 pl-5">{b.lines.map((l, j) => <li key={j}><Inline text={l} /></li>)}</ul>
        ) : b.kind === "quote" ? (
          <Draft key={i} text={b.lines.join("\n")} />
        ) : (
          <p key={i} className="m-0 text-pretty"><Inline text={b.lines.join(" ")} /></p>
        ),
      )}
    </div>
  );
}

function Steps({ steps, thinking }: { steps: Step[]; thinking: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((s) => (
        <div key={s.id} className={`anim-rise flex items-center gap-2 text-[12.5px] ${s.status === "running" ? "text-ink" : "text-muted"}`}>
          {s.status === "running" && <span className="anim-spin mx-px box-border size-2.5 rounded-full border-[1.5px] border-accent border-t-transparent" />}
          {s.status === "done" && <span className="w-3 text-center text-green-ink">✓</span>}
          {s.status === "error" && <span className="w-3 text-center text-amber-ink">–</span>}
          {s.label}
        </div>
      ))}
      {thinking && steps.every((s) => s.status !== "running") && (
        <div className="flex items-center gap-2 text-[12.5px] text-faint">
          <span className="anim-spin mx-px box-border size-2.5 rounded-full border-[1.5px] border-faint border-t-transparent" />
          {steps.length ? "Writing the answer…" : "Reading the question…"}
        </div>
      )}
    </div>
  );
}

export function Exchange({ m, onFollowUp }: { m: AgentMessage; onFollowUp?: (q: string) => void }) {
  const thinking = m.status === "thinking";
  return (
    <div className="flex flex-col gap-2.5">
      <div className="max-w-[88%] self-end rounded-lg border border-line bg-surface2 px-3 py-2">{m.q}</div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-[7px] text-xs font-medium text-muted">
          <div className="size-2 rounded-[2px] bg-accent" />Signal agent
          {thinking && <span className="font-normal text-faint">· working</span>}
        </div>
        {(m.steps.length > 0 || thinking) && <Steps steps={m.steps} thinking={thinking && !m.text} />}
        {m.text && <Answer text={m.text} />}
        {(m.status === "error" || m.status === "limited") && (
          <div className="anim-rise flex items-start gap-2.5 rounded-lg bg-amber-soft px-3 py-2.5">
            <div className="mt-1.5 size-1.5 flex-none rounded-full bg-amber" />
            <div className="leading-normal">{m.error}</div>
          </div>
        )}
        {m.status === "done" && (
          <div className="flex flex-wrap items-center gap-1.5">
            {m.sources.length > 0 && <div className="text-[11.5px] text-faint">Sources</div>}
            {m.sources.map((id) => (
              <Link key={id} href={`/task/${id}`} className="rounded border border-line px-1.5 py-px font-mono text-[11px] text-muted no-underline hover:border-line2 hover:text-ink">{id}</Link>
            ))}
            {m.unverified.length > 0 && (
              <span className="rounded bg-amber-soft px-1.5 py-px text-[11px] text-amber-ink" title="Mentioned in the answer but not returned by any tool">
                unverified: {m.unverified.join(", ")}
              </span>
            )}
            <div className="ml-auto text-[11px] text-faint">
              {m.toolCalls} tool call{m.toolCalls === 1 ? "" : "s"} · ${m.costUsd?.toFixed(3)}
            </div>
          </div>
        )}
        {m.status === "done" && onFollowUp && /^T-\d{4}$/.test(m.context) && !m.q.startsWith("Draft") && (
          <div className="flex flex-wrap gap-1.5">
            {[`Draft a ping about ${m.context}`, `Which past fix applies to ${m.context}?`].filter((q) => q !== m.q).map((q) => (
              <button key={q} onClick={() => onFollowUp(q)} className="rounded-full border border-line2 bg-transparent px-2.5 py-[5px] text-xs text-ink hover:border-accent">{q}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
