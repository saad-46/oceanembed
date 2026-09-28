"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Presentation, X } from "lucide-react";
import { DEMO_KEY, DEMO_STEPS, N_DEMO, demoHref, parseDemo } from "@/lib/demo";

const readStored = (): number | null => {
  try {
    const v = sessionStorage.getItem(DEMO_KEY);
    return v === null ? null : parseDemo(v);
  } catch {
    return null;
  }
};
const store = (i: number | null) => {
  try {
    if (i === null) sessionStorage.removeItem(DEMO_KEY);
    else sessionStorage.setItem(DEMO_KEY, String(i + 1));
  } catch {}
};

/**
 * Presenter bar for /demo: floats over the real screens. The step comes from `?demo=` (deep link)
 * or, after the presenter interacts and a screen rewrites its URL, from sessionStorage.
 */
export default function DemoBar() {
  const sp = useSearchParams();
  const router = useRouter();
  const fromUrl = parseDemo(sp.get("demo"));
  const [stored, setStored] = useState<number | null>(null);
  useEffect(() => {
    if (fromUrl !== null) store(fromUrl);
    const raf = requestAnimationFrame(() => setStored(fromUrl ?? readStored()));
    return () => cancelAnimationFrame(raf);
  }, [fromUrl]);
  const step = fromUrl ?? stored;
  // where we are heading: a burst of clicker presses queues up instead of collapsing into one step
  const target = useRef<number | null>(null);
  useEffect(() => {
    if (target.current === step) target.current = null;
  }, [step]);

  const go = (i: number) => {
    target.current = i;
    store(i);
    router.push(demoHref(i));
  };
  const exit = () => {
    store(null);
    setStored(null);
    router.push("/demo");
  };

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea, [contenteditable]")) return;
      const base = target.current ?? step;
      if (e.key === "PageDown" || (e.key === "ArrowRight" && e.altKey)) go(Math.min(N_DEMO - 1, base + 1));
      if (e.key === "PageUp" || (e.key === "ArrowLeft" && e.altKey)) go(Math.max(0, base - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (step === null) return null;
  const s = DEMO_STEPS[step];
  return (
    <div role="region" aria-label="Presenter demo" className="fixed z-40 bottom-3 left-1/2 -translate-x-1/2 w-[min(760px,calc(100vw-16px))] glass glass-strong shadow-2xl px-3 py-2.5 sm:px-4 fade-in">
      <div className="flex items-center gap-3">
        <span className="hidden sm:flex w-8 h-8 rounded-lg bg-accent/15 text-accent items-center justify-center shrink-0">
          <Presentation size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-ink-3">
            <span className="num text-accent">
              Step {step + 1} / {N_DEMO}
            </span>
            <span className="truncate">Bay of Bengal · Cyclone Mocha</span>
          </div>
          <div className="text-sm text-ink font-medium truncate">{s.title}</div>
          <p className="hidden md:block text-[12px] text-ink-2 leading-snug mt-0.5" aria-live="polite">
            {s.say}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous demo step" className="p-2 rounded-lg border border-line text-ink-2 hover:text-ink disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>
          {step < N_DEMO - 1 ? (
            <button onClick={() => go(step + 1)} className="inline-flex items-center gap-1 rounded-lg bg-accent text-[#04121c] text-sm font-semibold px-3 py-1.5 hover:brightness-110">
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={exit} className="rounded-lg bg-accent text-[#04121c] text-sm font-semibold px-3 py-1.5">
              Finish
            </button>
          )}
          <button onClick={exit} aria-label="Exit presenter demo" className="p-2 rounded-lg text-ink-3 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {DEMO_STEPS.map((d, i) => (
          <span key={d.title} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}
