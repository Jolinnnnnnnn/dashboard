"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="flex size-7 items-center justify-center rounded-full bg-red-soft font-semibold text-red-ink">!</div>
      <div className="mt-1 text-[15px] font-semibold">Couldn&apos;t load this view</div>
      <div className="max-w-[380px] text-muted">Something went wrong while rendering. Nothing was lost; your filters are kept.</div>
      <button onClick={reset} className="btn mt-2.5">Retry</button>
    </div>
  );
}
