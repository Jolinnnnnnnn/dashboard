"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
import type { FilterOptions } from "@/lib/types";

export const ALL = { type: "All task types", client: "All clients", stakeholder: "All stakeholders" } as const;
export const WINDOWS = [
  { key: "90", label: "Last 90 days" },
  { key: "180", label: "Last 6 months" },
  { key: "365", label: "Last 12 months" },
];
export const DEFAULT_WINDOW = "365";

const BAR = "sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5 min-[900px]:px-8";

function SearchBox({ value, onChange, inputRef }: {
  value?: string; onChange?: (v: string) => void; inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="flex h-8 max-w-[340px] flex-[1_1_220px] items-center gap-2 rounded-lg border border-line bg-bg px-2.5">
      <div className="size-[9px] flex-none rounded-full border-[1.5px] border-faint" />
      <input
        ref={inputRef}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="Search task ID or client"
        aria-label="Search task ID or client"
        className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-faint"
      />
      <div className="rounded border border-line px-[5px] font-mono text-[11px] text-faint">/</div>
    </div>
  );
}

function Select({ value, options, onChange, label }: {
  value: string; options: string[]; onChange: (v: string) => void; label: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="field max-w-[170px]">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function TopBar({ options }: { options: FilterOptions }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const onQueue = pathname === "/" || pathname.startsWith("/task/");
  const onMap = pathname.startsWith("/process");

  // "/" focuses search, like the hint in the box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Queue filters live in the URL so a filtered view can be shared
  const setQueueParam = (key: string, value: string, empty: string) => {
    const next = new URLSearchParams(pathname === "/" ? params : undefined);
    if (value && value !== empty) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  };

  return (
    <div className={BAR}>
      {!onMap && (
        <SearchBox inputRef={searchRef} value={pathname === "/" ? params.get("q") ?? "" : ""} onChange={(v) => setQueueParam("q", v, "")} />
      )}
      {onQueue && (
        <>
          <Select label="Task type" value={params.get("type") ?? ALL.type} options={[ALL.type, ...options.types]} onChange={(v) => setQueueParam("type", v, ALL.type)} />
          <Select label="Client" value={params.get("client") ?? ALL.client} options={[ALL.client, ...options.clients]} onChange={(v) => setQueueParam("client", v, ALL.client)} />
          <Select label="Currently with" value={params.get("stakeholder") ?? ALL.stakeholder} options={[ALL.stakeholder, ...options.stakeholders]} onChange={(v) => setQueueParam("stakeholder", v, ALL.stakeholder)} />
        </>
      )}
      {onMap && (
        <select
          aria-label="History window"
          className="field"
          value={params.get("window") ?? DEFAULT_WINDOW}
          onChange={(e) => {
            const v = e.target.value;
            router.replace(v === DEFAULT_WINDOW ? "/process" : `/process?window=${v}`, { scroll: false });
          }}
        >
          {WINDOWS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
        </select>
      )}
      <div className="flex-1" />
      <ThemeToggle />
    </div>
  );
}

export function TopBarFallback() {
  return (
    <div className={BAR}>
      <SearchBox />
      <div className="flex-1" />
      <ThemeToggle />
    </div>
  );
}
