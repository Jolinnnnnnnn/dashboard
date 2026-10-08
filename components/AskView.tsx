"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

// Placeholder until the agent (/api/agent) is built in Phase 7: same layout as the design,
// but replies say plainly that the agent isn't connected instead of showing a canned answer.

const CHIPS = [
  "Why is T-4821 at risk?",
  "How have we solved cache purge delays before?",
  "Which clients hit edge-sync issues this quarter?",
  "Where do Security tasks get stuck?",
  "Which team resolves SSL tasks fastest?",
  "What's likely to breach SLA this week?",
];

type Message = { q: string };

/** Reads ?task= (from "Ask about this task") and prefills the input. Must render inside <Suspense>. */
export function AskWithTask() {
  const task = useSearchParams().get("task");
  return <AskView key={task ?? ""} task={task} />;
}

export function AskView({ task = null }: { task?: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<string | null>(null);

  const ask = (q: string) => {
    if (!q.trim()) return;
    setMessages((m) => [...m, { q: q.trim() }]);
    setDraft("");
  };
  const value = draft ?? (task ? `What should happen next on ${task}?` : "");

  return (
    <div className="mx-auto flex min-h-[calc(100vh-150px)] max-w-[800px] flex-col">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="m-0 text-xl font-semibold tracking-[-0.015em]">Ask</h1>
          <div className="text-xs text-faint">Relay agent</div>
        </div>
        <button onClick={() => { setMessages([]); setDraft(""); }} className="btn h-[30px] font-normal">New chat</button>
      </div>

      {messages.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 pb-6 pt-16 text-center">
          <div className="text-xl font-semibold tracking-[-0.015em]">Ask about any task, team, or past fix</div>
          <div className="text-muted">The agent queries the task data with tools and shows its steps.</div>
          <div className="mt-6 grid w-full grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => ask(c)} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-ink hover:border-line2 hover:bg-surface2">
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-7">
        {messages.map((m, i) => (
          <div key={i} className="flex flex-col gap-7">
            <div className="max-w-[80%] self-end rounded-lg border border-line bg-surface2 px-[13px] py-[9px]">{m.q}</div>
            <div className="anim-rise flex flex-col gap-3">
              <div className="flex items-center gap-[7px] text-xs font-medium text-muted"><div className="size-2 rounded-[2px] bg-accent" />Relay agent</div>
              <div className="flex items-center gap-2.5 rounded-lg border border-line bg-amber-soft px-3 py-2.5">
                <div className="size-1.5 rounded-full bg-amber" />
                <div className="flex-1 text-ink">The agent isn&apos;t connected in this build yet. Meanwhile, the Queue, task pages, and Process Map show live predictions and similar cases.</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="min-h-6 flex-1" />
      <div className="sticky bottom-0 bg-bg pb-4 pt-3">
        <form
          onSubmit={(e) => { e.preventDefault(); ask(value); }}
          className="flex items-center gap-2 rounded-[10px] border border-line2 bg-surface py-1.5 pl-3.5 pr-1.5"
        >
          <input
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about a task, team, or past fix"
            aria-label="Ask a question"
            className="h-[30px] min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint"
          />
          <button type="submit" className="h-[30px] rounded-[7px] border-0 bg-accent px-3.5 font-medium text-on-accent">Send</button>
        </form>
        <div className="mt-2 text-center text-[11.5px] text-faint">Answers are generated from the task data via tool calls</div>
      </div>
    </div>
  );
}
