"use client";

import { JumpSearch } from "@/components/JumpSearch";
import { ThemeToggle } from "@/components/ThemeToggle";

// Global bar: jump-to search and theme only. Filters live on the page they control
// (queue filter row, classic dashboard filters, process map window).

const BAR = "sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-bg px-4 py-2.5 min-[900px]:px-8";

export function TopBar() {
  return (
    <div className={BAR}>
      <JumpSearch />
      <div className="flex-1" />
      <ThemeToggle />
    </div>
  );
}
