"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SearchIndex } from "@/lib/data";

// Global jump-to search: suggests tasks and clients as you type; nothing navigates until you pick.
// The index is static JSON (/api/search-index), loaded on first focus.

type Result = { key: string; href: string; primary: string; secondary: string; kind: "task" | "client" };

const MAX_TASKS = 6;
const MAX_CLIENTS = 3;

function search(index: SearchIndex, query: string): Result[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const clients = index.clients
    .filter((c) => c.name.toLowerCase().includes(q))
    .slice(0, MAX_CLIENTS)
    .map((c) => ({ key: `c:${c.name}`, href: `/queue?client=${encodeURIComponent(c.name)}`, primary: c.name, secondary: `${c.open} open task${c.open === 1 ? "" : "s"}`, kind: "client" as const }));
  const tasks = index.tasks
    .filter((t) => t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.client.toLowerCase().includes(q))
    // Exact ID first, then open tasks
    .sort((a, b) => Number(b.id.toLowerCase() === q) - Number(a.id.toLowerCase() === q) || Number(b.status === "open") - Number(a.status === "open"))
    .slice(0, MAX_TASKS)
    .map((t) => ({ key: t.id, href: `/task/${t.id}`, primary: `${t.id} · ${t.title}`, secondary: `${t.client} · ${t.status}`, kind: "task" as const }));
  return [...clients, ...tasks];
}

export function JumpSearch() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => (index ? search(index, query) : []), [index, query]);

  const load = () => {
    if (!index) fetch("/api/search-index").then((r) => r.json()).then(setIndex).catch(() => {});
  };

  // "/" focuses search; clicking elsewhere closes the suggestions
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    };
    const onClick = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClick); };
  }, []);

  const go = (r: Result) => {
    router.push(r.href);
    setQuery("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div ref={box} className="relative max-w-[380px] flex-[1_1_240px]">
      <div className="flex h-8 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 focus-within:border-line2">
        <div className="size-[9px] flex-none rounded-full border-[1.5px] border-faint" />
        <input
          ref={input}
          value={query}
          onFocus={() => { load(); setOpen(true); }}
          onChange={(e) => { load(); setQuery(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
            else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
          }}
          placeholder="Jump to a task or client"
          aria-label="Jump to a task or client"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="jump-results"
          className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-faint"
        />
        <div className="rounded border border-line px-[5px] font-mono text-[11px] text-faint">/</div>
      </div>
      {open && query.trim() && (
        <div id="jump-results" role="listbox" className="absolute left-0 right-0 top-9 z-30 overflow-hidden rounded-lg border border-line bg-surface shadow-[0_8px_24px_rgba(16,24,40,0.12)]">
          {!index && <div className="px-3 py-2.5 text-muted">Loading…</div>}
          {index && results.length === 0 && <div className="px-3 py-2.5 text-muted">No tasks or clients match “{query.trim()}”.</div>}
          {results.map((r, i) => (
            <button
              key={r.key}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
              className={`flex w-full items-center gap-2.5 border-0 px-3 py-2 text-left ${i === active ? "bg-surface2" : "bg-transparent"}`}
            >
              <span className={`flex-none rounded px-1.5 py-px text-[10.5px] font-medium ${r.kind === "client" ? "bg-accent-soft text-accent-ink" : "bg-surface3 text-muted"}`}>
                {r.kind === "client" ? "Client" : "Task"}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{r.primary}</span>
              <span className="flex-none text-xs text-faint">{r.secondary}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
