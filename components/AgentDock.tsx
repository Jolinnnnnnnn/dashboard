"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// The agent dock (design v3): any "Ask agent" button opens it with a question and its context.
// Until the agent route exists (Phase 7), replies say plainly that it isn't connected.

export const NOT_CONNECTED =
  "The agent isn't connected in this build yet. Next step: it answers this from the task data with read-only tools and shows its steps.";

type Message = { q: string; context: string };
type AgentApi = { ask: (q: string, context?: string) => void; open: () => void; close: () => void; isOpen: boolean };

const AgentContext = createContext<AgentApi | null>(null);

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used inside <AgentProvider>");
  return ctx;
}

type DockProps = { openTasks: number; insights: number; chips: string[] };

export function AgentProvider({ children, ...dock }: DockProps & { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const ask = useCallback((q: string, context = "Briefing") => {
    setMessages((m) => [...m, { q, context }]);
    setOpen(true);
  }, []);
  const api: AgentApi = { ask, open: () => setOpen(true), close: () => setOpen(false), isOpen };

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
        {isOpen && <Dock {...dock} messages={messages} onClose={() => setOpen(false)} onAsk={ask} />}
      </div>
    </AgentContext.Provider>
  );
}

function Dock({ openTasks, chips, messages, onClose, onAsk }: DockProps & {
  messages: Message[]; onClose: () => void; onAsk: (q: string, context?: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length]);
  const context = messages.at(-1)?.context ?? "Briefing";

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
        <button onClick={onClose} aria-label="Close agent" className="border-0 bg-transparent text-lg leading-none text-muted hover:text-ink">×</button>
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
                <button key={c} onClick={() => onAsk(c)} className="rounded-lg border border-line bg-bg px-3 py-[9px] text-left text-ink hover:border-line2">{c}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <div className="max-w-[88%] self-end rounded-lg border border-line bg-surface2 px-3 py-2">{m.q}</div>
            <div className="anim-rise flex items-start gap-2.5 rounded-lg bg-amber-soft px-3 py-2.5">
              <div className="mt-1.5 size-1.5 flex-none rounded-full bg-amber" />
              <div className="leading-normal">{NOT_CONNECTED}</div>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onAsk(draft.trim(), context); setDraft(""); } }}
        className="border-t border-line px-3.5 pb-3.5 pt-3"
      >
        <div className="flex items-center gap-2 rounded-[10px] border border-line2 bg-bg py-[5px] pl-3 pr-[5px]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a follow-up…"
            aria-label="Ask the agent"
            className="h-7 min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-faint"
          />
          <button type="submit" className="h-7 rounded-[7px] border-0 bg-accent px-3 font-medium text-on-accent">Send</button>
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
