"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

// The theme lives on <html data-theme>; the inline script in app/layout.tsx sets it before hydration.
function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const getTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("relay-theme", next);
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
  };

  return (
    <button
      onClick={toggle}
      title="Toggle theme"
      className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-muted hover:border-line2 hover:text-ink"
    >
      <div
        className="size-2.5 rounded-full border-[1.5px] border-current"
        style={{ background: "linear-gradient(90deg, currentColor 50%, transparent 50%)" }}
      />
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
