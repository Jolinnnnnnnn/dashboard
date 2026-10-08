import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="text-[15px] font-semibold">Task not found</div>
      <div className="max-w-[380px] text-muted">There&apos;s no task with that ID. Task IDs look like T-4821.</div>
      <Link href="/" className="btn mt-2.5 inline-flex items-center text-ink no-underline hover:text-ink">Back to the queue</Link>
    </div>
  );
}
