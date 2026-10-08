"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; short: string; icon: React.ReactNode; count?: number };

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

function items(openCount: number): Item[] {
  return [
    { href: "/", label: "Queue", short: "Queue", icon: <QueueIcon />, count: openCount },
    { href: "/process", label: "Process Map", short: "Map", icon: <MapIcon /> },
    { href: "/ask", label: "Ask", short: "Ask", icon: <AskIcon /> },
  ];
}

function isActive(href: string, pathname: string | null) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/" || pathname.startsWith("/task/");
  return pathname.startsWith(href);
}

function Logo({ size = 18 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-[5px] bg-accent" style={{ width: size, height: size }}>
      <div className="size-1.5 rounded-[2px] bg-on-accent" />
    </div>
  );
}

function SidebarView({ openCount, pathname }: { openCount: number; pathname: string | null }) {
  const nav = items(openCount);
  return (
    <>
      {/* Wide: fixed left sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[228px] flex-none flex-col border-r border-line bg-surface px-3 pb-4 pt-[18px] min-[900px]:flex">
        <Link href="/" className="flex items-center gap-[9px] px-2.5 pb-[22px] pt-0.5 text-ink no-underline hover:text-ink">
          <Logo />
          <div className="text-base font-semibold tracking-[-0.02em]">Relay</div>
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
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className="border-t border-line px-2.5 pt-3 text-xs text-faint">Synthetic data · Built with Claude Code</div>
      </aside>

      {/* Narrow: compact header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 min-[900px]:hidden">
        <Link href="/" className="mr-auto flex items-center gap-2 text-ink no-underline hover:text-ink">
          <Logo size={16} />
          <div className="text-[15px] font-semibold tracking-[-0.02em]">Relay</div>
        </Link>
        <div className="flex gap-1">
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

export function Sidebar({ openCount }: { openCount: number }) {
  return <SidebarView openCount={openCount} pathname={usePathname()} />;
}

export function SidebarFallback({ openCount }: { openCount: number }) {
  return <SidebarView openCount={openCount} pathname={null} />;
}
