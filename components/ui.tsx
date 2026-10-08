"use client";

import { useEffect, useState } from "react";

import type { Risk } from "@/lib/types";

const RISK_TONE: Record<Risk, string> = { High: "red", Medium: "amber", Low: "green" };

export function riskVars(risk: Risk) {
  const k = RISK_TONE[risk];
  return { bg: `var(--${k}-soft)`, ink: `var(--${k}-ink)`, dot: `var(--${k})` };
}

export function RiskPill({ risk, suffix = "" }: { risk: Risk; suffix?: string }) {
  const v = riskVars(risk);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: v.bg, color: v.ink }}>
      <span className="size-1.5 rounded-full" style={{ background: v.dot }} />
      {risk}{suffix}
    </span>
  );
}

/** Hold-ratio color: red over 2× the median, amber over 1.5×, else green (docs/definitions.md). */
export const ratioColor = (ratio: number) => (ratio > 2 ? "var(--red)" : ratio > 1.5 ? "var(--amber)" : "var(--green)");

/** Counts up from 0 on first render (450ms ease-out); shows the final value immediately for reduced motion. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(1); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 450);
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <>{(value * t).toFixed(decimals)}</>;
}
