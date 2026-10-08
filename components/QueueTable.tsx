"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { RiskPill, ratioColor } from "@/components/ui";
import type { QueueRow, Risk } from "@/lib/types";

const PAGE_SIZE = 12;
const RISK_RANK: Record<Risk, number> = { High: 3, Medium: 2, Low: 1 };

type SortKey = "id" | "client" | "type" | "stakeholder" | "owner" | "days" | "next" | "risk";
const COLUMNS: [SortKey, string, string][] = [
  ["id", "Task ID", "96px"], ["client", "Client", "auto"], ["type", "Type", "auto"], ["stakeholder", "Currently with", "auto"], ["owner", "Owner", "110px"],
  ["days", "Days there", "210px"], ["next", "Predicted next", "172px"], ["risk", "Risk", "100px"],
];
type Owners = Record<string, { by: string; mine: boolean }>;
const sorters = (owners: Owners): Record<SortKey, (r: QueueRow) => string | number> => ({
  id: (r) => r.id, client: (r) => r.client, type: (r) => r.type, stakeholder: (r) => r.stakeholder,
  owner: (r) => (owners[r.id] ? (owners[r.id].mine ? "0" : "1" + owners[r.id].by) : "2"),
  days: (r) => r.ratio, next: (r) => r.next[0]?.pct ?? 0, risk: (r) => RISK_RANK[r.risk] * 10 + r.ratio,
});

function Legend() {
  return (
    <div className="flex items-center gap-3.5 text-xs text-faint">
      <div className="flex items-center gap-1.5"><div className="h-2.5 w-px bg-ink" />Stakeholder median</div>
      <div className="flex items-center gap-1.5">
        <div className="h-1 w-4 rounded-sm" style={{ background: "linear-gradient(90deg,var(--accent) 60%,var(--accent-soft) 60%)" }} />
        Next-stop probability
      </div>
    </div>
  );
}

function Shell({ count, children, footer }: { count: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="border-t border-line2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
        <div className="flex items-baseline gap-2"><div className="font-semibold">Open tasks</div><div className="text-xs text-faint">{count}</div></div>
        <Legend />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse">{children}</table>
      </div>
      {footer}
    </div>
  );
}

export function QueueTable({ rows }: { rows: QueueRow[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "risk", dir: "desc" });
  const [page, setPage] = useState(0);
  // Claims from the demo team workspace (seeded teammates + this visitor's own)
  const [owners, setOwners] = useState<Owners>({});
  useEffect(() => {
    fetch("/api/workspace").then((r) => r.json()).then((d) => setOwners(d.claims ?? {})).catch(() => {});
  }, []);

  const q = (params.get("q") ?? "").trim().toLowerCase();
  const type = params.get("type"), client = params.get("client"), stakeholder = params.get("stakeholder");
  const filterKey = `${q}|${type}|${client}|${stakeholder}`;
  // Reset to the first page whenever the filters change
  const [lastFilter, setLastFilter] = useState(filterKey);
  if (filterKey !== lastFilter) {
    setLastFilter(filterKey);
    setPage(0);
  }

  const filtered = rows.filter((r) =>
    (!q || r.id.toLowerCase().includes(q) || r.client.toLowerCase().includes(q))
    && (!type || r.type === type) && (!client || r.client === client) && (!stakeholder || r.stakeholder === stakeholder));
  const key = sorters(owners)[sort.key];
  const dir = sort.dir === "asc" ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * dir);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const header = (
    <thead>
      <tr>
        {COLUMNS.map(([k, label, w]) => {
          const active = sort.key === k;
          return (
            <th
              key={k}
              onClick={() => { setSort((s) => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" })); setPage(0); }}
              aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              className={`cursor-pointer select-none whitespace-nowrap border-b border-line bg-transparent px-4 py-[9px] text-left text-xs font-medium first:pl-0 ${active ? "text-ink" : "text-muted"}`}
              style={{ width: w }}
            >
              {label} <span className="font-mono text-[11px] text-faint">{active ? (sort.dir === "asc" ? "↑" : "↓") : ""}</span>
            </th>
          );
        })}
      </tr>
    </thead>
  );

  const footer = (
    <div className="flex items-center justify-between py-2.5 text-xs text-muted">
      <div>{sorted.length ? `${current * PAGE_SIZE + 1}–${Math.min(sorted.length, current * PAGE_SIZE + PAGE_SIZE)} of ${sorted.length}` : "0 results"}</div>
      <div className="flex gap-1.5">
        <button disabled={current === 0} onClick={() => setPage(current - 1)} className="h-7 rounded-md border border-line bg-surface px-2.5 text-ink hover:bg-surface2 disabled:opacity-40">← Prev</button>
        <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="h-7 rounded-md border border-line bg-surface px-2.5 text-ink hover:bg-surface2 disabled:opacity-40">Next →</button>
      </div>
    </div>
  );

  const count = filtered.length === rows.length ? `${rows.length} tasks` : `${filtered.length} of ${rows.length} tasks`;

  return (
    <Shell count={count} footer={footer}>
      {header}
      <tbody>
        {visible.map((r) => (
          <tr key={r.id} onClick={() => router.push(`/task/${r.id}`)} className="cursor-pointer border-b border-line hover:bg-surface2">
            <td className="whitespace-nowrap py-2.5 pl-0 pr-4 font-mono text-[12.5px] font-medium">
              <Link href={`/task/${r.id}`} className="text-ink no-underline" onClick={(e) => e.stopPropagation()}>{r.id}</Link>
            </td>
            <td className="whitespace-nowrap px-4 py-2.5">{r.client}</td>
            <td className="whitespace-nowrap px-4 py-2.5 text-muted">{r.type}</td>
            <td className="px-4 py-2.5">
              <span className="inline-block whitespace-nowrap rounded border border-line bg-surface2 px-2 py-px text-xs">{r.stakeholder}</span>
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px]">
              {owners[r.id] ? (
                <span className={owners[r.id].mine ? "font-medium text-accent-ink" : "text-ink"}>{owners[r.id].mine ? "You" : owners[r.id].by.split(" (")[0]}</span>
              ) : <span className="text-faint">—</span>}
            </td>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2.5" title={`${r.ratio.toFixed(1)}× the ${r.median}-day median`}>
                <div className="w-[34px] font-medium tabular-nums">{r.days}d</div>
                {/* Bar scale: 3× the median; the tick marks the median */}
                <div className="relative h-1.5 w-[76px] rounded-[3px] bg-surface3">
                  <div className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${Math.min(100, (r.ratio / 3) * 100)}%`, background: ratioColor(r.ratio) }} />
                  <div className="absolute left-[33.3%] top-[-3px] h-3 w-px bg-ink" />
                </div>
                <div className="whitespace-nowrap text-[11.5px] text-faint">med {r.median}</div>
              </div>
            </td>
            <td className="px-4 py-2.5">
              <div className="flex w-[140px] justify-between text-[12.5px]"><div>{r.next[0]?.name}</div><div className="tabular-nums text-muted">{r.next[0]?.pct}%</div></div>
              <div className="mt-1 flex h-1 w-[140px] gap-px overflow-hidden rounded-sm">
                {r.next.map((n, i) => (
                  <div key={n.name} title={`${n.name} ${n.pct}%`} className="bg-accent" style={{ width: `${n.pct}%`, opacity: [1, 0.45, 0.2][i] }} />
                ))}
              </div>
            </td>
            <td className="px-4 py-2.5"><RiskPill risk={r.risk} /></td>
          </tr>
        ))}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={8} className="px-4 py-14 text-center">
              <div className="text-sm font-semibold">No tasks match {q ? `“${params.get("q")}”` : "the current filters"}</div>
              <div className="mt-1 text-muted">Try a task ID like T-4821, a client name, or clear the filters.</div>
              <button onClick={() => router.replace("/queue", { scroll: false })} className="btn mt-3.5 h-[30px] font-normal">Clear search and filters</button>
            </td>
          </tr>
        )}
      </tbody>
    </Shell>
  );
}

export function QueueTableFallback() {
  return (
    <Shell count="Loading…" footer={<div className="h-12" />}>
      <tbody>
        {Array.from({ length: 8 }, (_, i) => (
          <tr key={i} className="border-b border-line">
            {[52, 110, 96, 84, 50, 130, 120, 52].map((w, j) => (
              <td key={j} className="px-4 py-[15px]"><div className="skeleton" style={{ width: w, height: j === 3 || j === 6 ? 18 : 10 }} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </Shell>
  );
}

