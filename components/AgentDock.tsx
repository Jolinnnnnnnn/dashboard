"use client";

import { usePathname } from "next/navigation";
import { Suspense, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// The agent dock (design v3): any "Ask agent" button opens it with a question and its context.
// One conversation is shared by the dock and the Ask page; answers stream from /api/agent.

import { Exchange, type AgentMessage } from "@/components/AgentThread";

type AgentApi = {
  ask: (q: string, context?: string, opts?: { openDock?: boolean }) => void;
  open: () => void;
  close: () => void;
  reset: () => void;
  isOpen: boolean;
  busy: boolean;
  messages: AgentMessage[];
};

const AgentContext = createContext<AgentApi | null>(null);
const HISTORY_TURNS = 4; // prior exchanges sent back as plain text for follow-ups
// Dock open/closed state and finished exchanges survive reloads within this browser tab
const STORAGE_KEY = "signal-agent";

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used inside <AgentProvider>");
  return ctx;
}

type DockProps = { openTasks: number; insights: number; chips: string[] };
type StreamEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "error" }
  | { type: "text"; delta: string }
  | { type: "done"; sources: string[]; unverified: string[]; toolCalls: number; usage: { costUsd: number } }
  | { type: "error"; code: string; message: string };

export function AgentProvider({ children, ...dock }: DockProps & { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [restored, setRestored] = useState(false);

  // Restore after mount (not in the initial state) so server and client render the same HTML.
  // Saving waits for `restored`, so the defaults never overwrite what was saved.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as { isOpen: boolean; messages: AgentMessage[] } | null;
      if (saved) {
        setOpen(saved.isOpen); // eslint-disable-line react-hooks/set-state-in-effect
        setMessages(saved.messages);
      }
    } catch {
      // Storage unavailable or corrupt: start fresh
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      // Only finished exchanges; an answer still streaming can't be resumed after a reload
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ isOpen, messages: messages.filter((m) => m.status !== "thinking") }));
    } catch {}
  }, [isOpen, messages, restored]);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const update = (index: number, fn: (m: AgentMessage) => AgentMessage) =>
    setMessages((all) => all.map((m, i) => (i === index ? fn(m) : m)));

  const ask = useCallback((q: string, context = "Briefing", opts?: { openDock?: boolean }) => {
    if (opts?.openDock !== false) setOpen(true);
    if (busyRef.current || !q.trim()) return;
    busyRef.current = true;
    setBusy(true);
    let index = 0;
    let history: { role: "user" | "assistant"; content: string }[] = [];
    setMessages((all) => {
      index = all.length;
      history = all.filter((m) => m.status === "done").slice(-HISTORY_TURNS)
        .flatMap((m) => [{ role: "user" as const, content: m.q }, { role: "assistant" as const, content: m.text.slice(0, 4000) }]);
      return [...all, { q, context, status: "thinking", steps: [], text: "", sources: [], unverified: [] }];
    });

    const controller = new AbortController();
    abortRef.current = controller;
    (async () => {
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, context, history }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          update(index, (m) => ({ ...m, status: res.status === 429 ? "limited" : "error", error: body.error ?? "The agent request failed." }));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line) as StreamEvent;
            if (e.type === "text") update(index, (m) => ({ ...m, text: m.text + e.delta }));
            else if (e.type === "step") update(index, (m) => ({
              ...m, steps: m.steps.some((s) => s.id === e.id) ? m.steps.map((s) => (s.id === e.id ? { ...s, status: e.status } : s)) : [...m.steps, e],
            }));
            else if (e.type === "done") update(index, (m) => ({ ...m, status: "done", sources: e.sources, unverified: e.unverified, toolCalls: e.toolCalls, costUsd: e.usage.costUsd }));
            else if (e.type === "error") update(index, (m) => ({ ...m, status: "error", error: e.message }));
          }
        }
        update(index, (m) => (m.status === "thinking" ? { ...m, status: "error", error: "The answer was cut off. Try again." } : m));
      } catch {
        if (!controller.signal.aborted) update(index, (m) => ({ ...m, status: "error", error: "Couldn't reach the agent. Check your connection and try again." }));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    })();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    busyRef.current = false;
    setBusy(false);
    setMessages([]);
  }, []);

  const api: AgentApi = { ask, open: () => setOpen(true), close: () => setOpen(false), reset, isOpen, busy, messages };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <AgentContext.Provider value={api}>
      <div className="flex min-h-screen flex-col bg-bg text-ink min-[900px]:flex-row">
        {children}
        {isOpen && (
          <Suspense fallback={null}>
            <DockSlot {...dock} />
          </Suspense>
        )}
      </div>
    </AgentContext.Provider>
  );
}

/** The Ask page shows the same conversation full-width, so the dock is hidden there (not closed). */
function DockSlot(props: DockProps) {
  const pathname = usePathname();
  return pathname.startsWith("/ask") ? null : <Dock {...props} />;
}

function Dock({ openTasks, chips }: DockProps) {
  const { messages, ask, close, busy } = useAgent();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length, last?.text.length, last?.steps.length]);
  const context = last?.context ?? "Briefing";

  return (
    <aside
      aria-label="Signal agent"
      className="anim-slide fixed inset-y-0 right-0 z-50 flex h-screen w-full flex-none flex-col border-l border-line bg-surface shadow-[-12px_0_40px_rgba(16,24,40,0.10)] min-[900px]:w-[384px] min-[1280px]:sticky min-[1280px]:top-0 min-[1280px]:shadow-none"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-4">
        <div className="anim-breathe size-2 rounded-full bg-accent" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Signal agent</div>
          <div className="text-xs text-muted">
            Watching {openTasks} open tasks · context: <span className="font-mono text-[11.5px] text-ink">{context}</span>
          </div>
        </div>
        <button onClick={close} aria-label="Close agent" className="border-0 bg-transparent text-lg leading-none text-muted hover:text-ink">×</button>
      </div>

      <div ref={scroller} className="flex flex-1 flex-col gap-[26px] overflow-y-auto p-[18px]">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <div className="font-serif text-[26px] leading-[1.1]">I&apos;m already looking. Ask me where to start.</div>
            <div className="leading-normal text-muted">
              Press <span className="text-ink">Ask agent</span> on any card and I&apos;ll start from that context, or type below.
            </div>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {chips.map((c) => (
                <button key={c} onClick={() => ask(c)} className="rounded-lg border border-line bg-bg px-3 py-[9px] text-left text-ink hover:border-line2">{c}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => <Exchange key={i} m={m} onFollowUp={(q) => ask(q, m.context)} />)}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !busy) { ask(draft.trim(), context); setDraft(""); } }}
        className="border-t border-line px-3.5 pb-3.5 pt-3"
      >
        <div className="flex items-center gap-2 rounded-[10px] border border-line2 bg-bg py-[5px] pl-3 pr-[5px]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={busy ? "Working…" : "Ask a follow-up…"}
            aria-label="Ask the agent"
            maxLength={500}
            className="h-7 min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-faint"
          />
          <button type="submit" disabled={busy} className="h-7 rounded-[7px] border-0 bg-accent px-3 font-medium text-on-accent disabled:opacity-50">Send</button>
        </div>
        <div className="mt-[7px] text-center text-[11px] text-faint">Answers are generated from the task data via tool calls</div>
      </form>
    </aside>
  );
}

/** Floating "Ask Signal" button (hidden while the dock is open and on the Ask page). */
export function AgentLauncher({ insights }: { insights: number }) {
  const { isOpen, open } = useAgent();
  const pathname = usePathname();
  if (isOpen || pathname.startsWith("/ask")) return null;
  return (
    <button
      onClick={open}
      className="fixed bottom-5 right-5 z-40 flex h-11 items-center gap-2.5 rounded-[22px] border-0 bg-accent pl-3.5 pr-4 font-medium text-on-accent shadow-[0_6px_20px_oklch(0.5_0.2_266/0.28)] hover:opacity-90"
    >
      <span className="size-2 rounded-full bg-on-accent" />
      Ask Signal
      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-white/20 px-[5px] text-[11px]">{insights}</span>
    </button>
  );
}

/** Small "Ask agent" pill used on cards and section headers. */
export function AskButton({ q, context, label = "Ask agent", size = "sm" }: {
  q: string; context?: string; label?: string; size?: "sm" | "md";
}) {
  const { ask } = useAgent();
  const sm = size === "sm";
  return (
    <button
      onClick={() => ask(q, context)}
      className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-md border border-transparent bg-accent-soft font-medium text-accent-ink hover:border-accent ${sm ? "h-[22px] px-[7px] text-[11.5px]" : "h-7 rounded-[7px] px-2.5 text-[12.5px]"}`}
    >
      <span className={`${sm ? "size-[5px]" : "size-1.5"} rounded-[1.5px] bg-accent`} />
      {label}
    </button>
  );
}
