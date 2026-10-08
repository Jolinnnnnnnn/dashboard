"use client";

import { useEffect, useState } from "react";

const KEY = "relay-banner-dismissed";

export function Banner() {
  // Shown by default; hidden after mount if this viewer dismissed it before.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setVisible(false); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      // Storage unavailable: keep showing the banner.
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };

  return (
    <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-accent-soft py-2.5 pl-3.5 pr-3 min-[900px]:mx-8">
      <div className="mt-1.5 size-1.5 flex-none rounded-full bg-accent" />
      <div className="flex-1 text-pretty">
        All data is synthetic, generated with realistic patterns. Try: open a high-risk task, explore the process map, or ask the agent a question.
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="border-0 bg-transparent px-0.5 text-base leading-none text-muted hover:text-ink">
        ×
      </button>
    </div>
  );
}
