"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Claims and notes for one task (demo team workspace; see lib/workspace.ts).
// A provider holds the state so the claim button and the notes list stay in sync on a page.

type Claim = { by: string; at: string; mine: boolean };
type Note = { author: string; at: string; text: string; mine: boolean };
type State = { claim: Claim | null; notes: Note[] };
type Api = {
  state: State | null;
  busy: boolean;
  error: string | null;
  act: (action: "claim" | "unclaim" | "note", text?: string) => Promise<boolean>;
};

const Ctx = createContext<Api | null>(null);

export function TaskWorkspaceProvider({ task, children }: { task: string; children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/workspace?task=${task}`).then((r) => r.json()).then((d) => live && setState(d)).catch(() => {});
    return () => { live = false; };
  }, [task]);

  const act = useCallback(async (action: "claim" | "unclaim" | "note", text?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, task, text }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Couldn't save that."); return false; }
      setState(body);
      return true;
    } catch {
      setError("Couldn't reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [task]);

  return <Ctx.Provider value={{ state, busy, error, act }}>{children}</Ctx.Provider>;
}

function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Use inside <TaskWorkspaceProvider>");
  return ctx;
}

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `today ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

/** "Claim" / "Claimed by …" control. */
export function ClaimButton({ task, size = "md" }: { task: string; size?: "sm" | "md" }) {
  const { state, busy, act, error } = useWorkspace();
  const h = size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3";
  if (!state) return <div className={`${h} w-20 animate-pulse rounded-lg bg-surface2`} />;
  const c = state.claim;
  if (c && !c.mine) {
    return <div className={`flex ${h} items-center gap-1.5 rounded-lg border border-line text-muted`}><span className="size-1.5 rounded-full bg-green" />Claimed by {c.by}</div>;
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => act(c ? "unclaim" : "claim")}
        disabled={busy}
        aria-label={c ? `Unclaim ${task}` : `Claim ${task}`}
        className={`flex ${h} items-center gap-1.5 rounded-lg border font-medium disabled:opacity-60 ${c ? "border-green bg-green-soft text-green-ink" : "border-line2 bg-transparent text-ink hover:bg-surface2"}`}
      >
        {c ? <><span className="size-1.5 rounded-full bg-green" />Claimed by you</> : "Claim"}
      </button>
      {c && <button onClick={() => act("unclaim")} disabled={busy} className="border-0 bg-transparent p-0 text-xs text-muted hover:text-ink">Unclaim</button>}
      {error && <div className="text-xs text-red-ink">{error}</div>}
    </div>
  );
}

/** Notes list with an input to add one. */
export function NotesPanel() {
  const { state, busy, act, error } = useWorkspace();
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <div className="text-[15px] font-semibold">Notes</div>
        <div className="text-xs text-faint">Private to you · clears after 24h</div>
      </div>
      <div className="flex flex-col border-t border-line2">
        {!state && <div className="py-3 text-muted">Loading…</div>}
        {state?.notes.length === 0 && <div className="py-3 text-muted">No notes yet.</div>}
        {state?.notes.map((n, i) => (
          <div key={i} className="flex flex-col gap-1 border-b border-line py-3">
            <div className="flex items-center gap-2 text-xs">
              <span className={`font-medium ${n.mine ? "text-accent-ink" : "text-ink"}`}>{n.author}</span>
              <span className="text-faint">{when(n.at)}</span>
            </div>
            <div className="whitespace-pre-wrap text-pretty leading-relaxed">{n.text}</div>
          </div>
        ))}
      </div>
      <form
        onSubmit={async (e) => { e.preventDefault(); if (draft.trim() && (await act("note", draft.trim()))) setDraft(""); }}
        className="flex items-start gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note for the team…"
          aria-label="Add a note"
          maxLength={500}
          rows={2}
          className="min-w-0 flex-1 resize-y rounded-lg border border-line2 bg-surface px-3 py-2 text-ink outline-none placeholder:text-faint focus:border-accent"
        />
        <button type="submit" disabled={busy || !draft.trim()} className="h-8 rounded-lg border-0 bg-accent px-3 font-medium text-on-accent disabled:opacity-50">Add</button>
      </form>
      {error && <div className="text-xs text-red-ink">{error}</div>}
    </div>
  );
}
