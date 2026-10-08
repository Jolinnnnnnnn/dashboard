"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAgent } from "@/components/AgentDock";

type Stats = { open: number; handoffs_90d: number; insights: number };
type Item = { href: string; label: string; short: string; icon: React.ReactNode; count?: number; badge?: number };

const BriefingIcon = () => (
  <div className="flex w-3.5 justify-center">
    <div className="flex size-2.5 items-center justify-center rounded-full border-[1.5px] border-current"><div className="size-[3px] rounded-full bg-current" /></div>
  </div>
);
const QueueIcon = () => (
  <div className="flex w-3.5 flex-col gap-[2.5px]">
    <div className="h-[1.5px] bg-current" /><div className="h-[1.5px] bg-current" /><div className="h-[1.5px] w-[9px] bg-current" />
  </div>
);
const MapIcon = () => (
  <div className="flex w-3.5 items-center">
    <div className="size-1 rounded-full border-[1.5px] border-current" /><div className="h-[1.5px] flex-1 bg-current" />
    <div className="size-1 rounded-full border-[1.5px] border-current" />
  </div>
);
const AskIcon = () => (
  <div className="flex w-3.5 justify-center"><div className="h-[9px] w-[11px] rounded-[3px] border-[1.5px] border-current" /></div>
);

function items(openCount: number, insights: number): Item[] {
  return [
    { href: "/", label: "Briefing", short: "Briefing", icon: <BriefingIcon />, badge: insights },
    { href: "/queue", label: "Queue", short: "Queue", icon: <QueueIcon />, count: openCount },
    { href: "/process", label: "Process Map", short: "Map", icon: <MapIcon /> },
    { href: "/ask", label: "Ask", short: "Ask", icon: <AskIcon /> },
  ];
}

function isActive(href: string, pathname: string | null) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  if (href === "/queue") return pathname.startsWith("/queue") || pathname.startsWith("/task/");
  return pathname.startsWith(href);
}

function Logo({ size = 22 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-md bg-accent" style={{ width: size, height: size }}>
      <div className="size-2 rounded-[2px] bg-bg" />
    </div>
  );
}

function AgentStatus({ stats }: { stats: Stats }) {
  const { open } = useAgent();
  return (
    <button onClick={open} className="flex flex-col gap-1.5 rounded-lg border-0 bg-transparent p-2.5 text-left text-ink hover:bg-surface2">
      <div className="flex items-center gap-2">
        <div className="anim-breathe size-[7px] rounded-full bg-accent" />
        <div className="text-[12.5px] font-medium">Agent watching</div>
      </div>
      <div className="text-xs leading-normal text-muted">
        {stats.open} open tasks · {stats.handoffs_90d} handoffs (90d)
        <br />
        Data as of Oct 7 · {stats.insights} insights
      </div>
    </button>
  );
}

function SidebarView({ openCount, stats, pathname }: { openCount: number; stats: Stats; pathname: string | null }) {
  const nav = items(openCount, stats.insights);
  return (
    <>
      {/* Wide: fixed left sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[232px] flex-none flex-col bg-bg px-3 pb-4 pt-5 min-[900px]:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2.5 pb-[26px] text-ink no-underline hover:text-ink">
          <Logo />
          <div className="font-serif text-[28px] leading-none tracking-[-0.01em]">Signal</div>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {nav.map((it) => {
            const active = isActive(it.href, pathname);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-[7px] no-underline hover:bg-surface2 ${active ? "bg-surface2 font-medium text-ink hover:text-ink" : "text-muted hover:text-ink"}`}
              >
                {it.icon}
                <div className="flex-1">{it.label}</div>
                {it.count !== undefined && <div className="font-mono text-[11px] text-faint">{it.count}</div>}
                {it.badge !== undefined && (
                  <div className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-accent px-[5px] text-[11px] font-semibold text-on-accent">{it.badge}</div>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <AgentStatus stats={stats} />
        <div className="px-2.5 pt-3.5 text-xs text-faint">Synthetic data · Built with Claude Code</div>
      </aside>

      {/* Narrow: compact header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-bg px-4 py-3 min-[900px]:hidden">
        <Link href="/" className="mr-auto flex items-center gap-2 text-ink no-underline hover:text-ink">
          <Logo size={16} />
          <div className="font-serif text-[22px] leading-none">Signal</div>
        </Link>
        <div className="flex flex-wrap gap-1">
          {nav.map((it) => {
            const active = isActive(it.href, pathname);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`rounded-md px-2.5 py-1.5 no-underline ${active ? "bg-surface2 font-medium text-ink hover:text-ink" : "text-muted hover:text-ink"}`}
              >
                {it.short}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function Sidebar({ openCount, stats }: { openCount: number; stats: Stats }) {
  return <SidebarView openCount={openCount} stats={stats} pathname={usePathname()} />;
}

export function SidebarFallback({ openCount, stats }: { openCount: number; stats: Stats }) {
  return <SidebarView openCount={openCount} stats={stats} pathname={null} />;
}
