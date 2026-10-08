"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAgent } from "@/components/AgentDock";
import { Exchange } from "@/components/AgentThread";

// Full-page view of the same conversation the dock shows.

const CHIPS = [
  "Why is T-4821 at risk?",
  "How have we solved cache purge delays before?",
  "Which clients have at-risk tasks touching edge-sync?",
  "Where do Security Review tasks get stuck?",
  "Which team holds SSL renewals longest?",
  "What's likely to breach SLA this week?",
];

/** Reads ?task= and prefills the input. Must render inside <Suspense>. */
export function AskWithTask() {
  const task = useSearchParams().get("task");
  return <AskView key={task ?? ""} task={task} />;
}

export function AskView({ task = null }: { task?: string | null }) {
  const { messages, ask, reset, busy, close } = useAgent();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (task ? `What should happen next on ${task}?` : "");
  const bottom = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);

  // The page shows the conversation itself, so the dock would be a duplicate
  useEffect(() => close(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, last?.text.length]);

  const send = (q: string) => {
    if (!q.trim() || busy) return;
    ask(q.trim(), task ?? "Ask");
    setDraft("");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-150px)] max-w-[800px] flex-col">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="m-0 text-xl font-semibold tracking-[-0.015em]">Ask</h1>
          <div className="text-xs text-faint">Signal agent</div>
        </div>
        <button onClick={() => { reset(); setDraft(""); }} className="btn h-[30px] font-normal">New chat</button>
      </div>

      {messages.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 pb-6 pt-16 text-center">
          <div className="text-xl font-semibold tracking-[-0.015em]">Ask about any task, team, or past fix</div>
          <div className="text-muted">The agent queries the task data with tools and shows its steps.</div>
          <div className="mt-6 grid w-full grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => send(c)} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-ink hover:border-line2 hover:bg-surface2">
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-7">
        {messages.map((m, i) => <Exchange key={i} m={m} onFollowUp={send} />)}
      </div>
      <div ref={bottom} />

      <div className="min-h-6 flex-1" />
      <div className="sticky bottom-0 bg-bg pb-4 pt-3">
        <form
          onSubmit={(e) => { e.preventDefault(); send(value); }}
          className="flex items-center gap-2 rounded-[10px] border border-line2 bg-surface py-1.5 pl-3.5 pr-1.5"
        >
          <input
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={busy ? "Working…" : "Ask about a task, team, or past fix"}
            aria-label="Ask a question"
            maxLength={500}
            className="h-[30px] min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint"
          />
          <button type="submit" disabled={busy} className="h-[30px] rounded-[7px] border-0 bg-accent px-3.5 font-medium text-on-accent disabled:opacity-50">Send</button>
        </form>
        <div className="mt-2 text-center text-[11.5px] text-faint">Answers are generated from the task data via tool calls</div>
      </div>
    </div>
  );
}
