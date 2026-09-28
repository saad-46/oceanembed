"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Compass, RotateCcw, X } from "lucide-react";
import { GUIDE_STEPS, GUIDE_STEP_KEY, N_GUIDE, panelCorner, parseGuide, stepDone, stepHref, writeGuideStatus } from "@/lib/guide";

type GuideState = number | "done" | null;

const readSession = (): GuideState => {
  try {
    return parseGuide(sessionStorage.getItem(GUIDE_STEP_KEY));
  } catch {
    return null;
  }
};
const writeSession = (s: GuideState) => {
  try {
    if (s === null) sessionStorage.removeItem(GUIDE_STEP_KEY);
    else sessionStorage.setItem(GUIDE_STEP_KEY, s === "done" ? "done" : String(s + 1));
  } catch {}
};

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = requestAnimationFrame(() => setR(m.matches));
    return () => cancelAnimationFrame(f);
  }, []);
  return r;
}

/**
 * Guided Exploration: a floating guide panel + a highlight ring over the real OceanSight screens.
 * It never dims or blocks the application; Back / Continue / Exit are always available.
 */
export default function GuideLayer() {
  const sp = useSearchParams();
  const path = usePathname() ?? "";
  const router = useRouter();
  const fromUrl = parseGuide(sp.get("guide"));
  const [stored, setStored] = useState<GuideState>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vw, setVw] = useState(1280);
  const [vh, setVh] = useState(800);
  const reduced = useReducedMotion();
  const pending = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fromUrl !== null) writeSession(fromUrl);
    const f = requestAnimationFrame(() => setStored(fromUrl ?? readSession()));
    return () => cancelAnimationFrame(f);
  }, [fromUrl]);
  const state: GuideState = fromUrl ?? stored;
  const step = typeof state === "number" ? GUIDE_STEPS[state] : null;
  useEffect(() => {
    if (pending.current === state) pending.current = null;
  }, [state]);

  // follow the highlighted element as layouts settle, panels open and the page scrolls
  useEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    measure();
    const t = setInterval(measure, 500);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, path]);

  const go = (i: number) => {
    pending.current = i;
    writeSession(i);
    router.push(stepHref(i));
  };
  const finish = () => {
    writeGuideStatus("completed");
    writeSession("done");
    setStored("done");
    const p = new URLSearchParams(sp.toString());
    p.set("guide", "done");
    router.replace(`${path}?${p.toString()}`, { scroll: false });
  };
  const exit = (status: "completed" | "skipped") => {
    writeGuideStatus(status);
    writeSession(null);
    setStored(null);
    const p = new URLSearchParams(sp.toString());
    p.delete("guide");
    const q = p.toString();
    router.replace(q ? `${path}?${q}` : path, { scroll: false });
  };

  useEffect(() => {
    if (typeof state !== "number") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea, [contenteditable]")) return;
      const base = pending.current ?? state;
      const fwd = e.key === "PageDown" || (e.altKey && e.key === "ArrowRight");
      const bwd = e.key === "PageUp" || (e.altKey && e.key === "ArrowLeft");
      if (fwd) {
        e.preventDefault();
        if (base >= N_GUIDE - 1) finish();
        else go(base + 1);
      } else if (bwd && base > 0) {
        e.preventDefault();
        go(base - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === null) return null;

  const mobile = vw < 640;
  const corner = mobile ? "br" : panelCorner(rect, vw, vh);
  const pos = mobile ? "left-2 right-2 bottom-2" : corner === "br" ? "right-4 bottom-4" : corner === "bl" ? "left-4 bottom-4 lg:left-64" : "right-4 top-[72px]";

  if (state === "done")
    return (
      <div ref={panel} role="dialog" aria-label="Guided Exploration complete" className={`fixed z-[60] ${pos} w-auto sm:w-[380px] glass glass-strong p-4 fade-in`}>
        <div className="flex items-start justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider text-ink-3">Guided Exploration</div>
          <button onClick={() => exit("completed")} aria-label="Close" className="text-ink-3 hover:text-ink">
            <X size={15} />
          </button>
        </div>
        <h2 className="font-display text-lg text-ink mt-1">You&apos;re ready to explore.</h2>
        <p className="text-[13px] text-ink-2 mt-1">You now know how to:</p>
        <ul className="mt-2 grid grid-cols-1 gap-1 text-[13px] text-ink-2">
          {["inspect the ocean at any point", "move through depth", "follow changes through time", "compare with observations", "investigate events", "generate reports"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Check size={13} className="text-good shrink-0" aria-hidden /> {t}
            </li>
          ))}
        </ul>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Link href="/map" onClick={() => exit("completed")} className="rounded-lg bg-accent text-[#04121c] text-sm font-semibold px-4 py-1.5 hover:brightness-110">
            Explore OceanSight
          </Link>
          <button onClick={() => go(0)} className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 text-ink-2 text-sm px-3 py-1.5 hover:text-ink">
            <RotateCcw size={13} /> Replay
          </button>
        </div>
      </div>
    );

  const s = step!;
  const i = state;
  const onScreen = path === s.path.split("?")[0];
  const done = stepDone(s, path, sp);
  return (
    <>
      {rect && onScreen && (
        <div
          aria-hidden
          className={`fixed z-[55] pointer-events-none rounded-xl ${reduced ? "" : "guide-ring"}`}
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8, boxShadow: "0 0 0 2px var(--accent), 0 0 0 6px rgba(46,197,216,.18)" }}
        />
      )}
      <div ref={panel} role="region" aria-label={`Guided Exploration, step ${i + 1} of ${N_GUIDE}`} className={`fixed z-[60] ${pos} w-auto sm:w-[380px] glass glass-strong p-4 fade-in`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider text-ink-3 flex items-center gap-1.5">
            <Compass size={12} className="text-accent" aria-hidden /> Guided Exploration · <span className="num">{i + 1} of {N_GUIDE}</span>
          </div>
          <button onClick={() => exit("skipped")} aria-label="Exit Guided Exploration" className="text-ink-3 hover:text-ink">
            <X size={15} />
          </button>
        </div>
        <h2 className="font-display text-[17px] text-ink mt-1.5" aria-live="polite">
          {s.title}
        </h2>
        <p className="text-[13px] text-ink-2 mt-1 leading-relaxed">{s.body}</p>
        {done && s.done && (
          <p className="text-[12.5px] text-good mt-2 flex items-center gap-1.5">
            <Check size={13} aria-hidden /> {s.done}
          </p>
        )}
        {!onScreen && (
          <button onClick={() => go(i)} className="text-[12.5px] text-accent hover:underline mt-2">
            Return to this step&apos;s screen
          </button>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => go(i - 1)} disabled={i === 0} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink-2 hover:text-ink disabled:opacity-40">
            <ChevronLeft size={15} /> Back
          </button>
          <div className="flex-1 flex justify-center gap-1" aria-hidden>
            {GUIDE_STEPS.map((g, k) => (
              <span key={g.id} className={`h-1.5 rounded-full ${k === i ? "w-4 bg-accent" : k < i ? "w-1.5 bg-accent/50" : "w-1.5 bg-line-2"}`} />
            ))}
          </div>
          {i < N_GUIDE - 1 ? (
            <button onClick={() => go(i + 1)} className="inline-flex items-center gap-1 rounded-lg bg-accent text-[#04121c] font-semibold px-3 py-1.5 text-sm hover:brightness-110">
              Continue <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={finish} className="rounded-lg bg-accent text-[#04121c] font-semibold px-3 py-1.5 text-sm hover:brightness-110">
              Finish
            </button>
          )}
        </div>
        <button onClick={() => exit("skipped")} className="mt-2 text-[11.5px] text-ink-3 hover:text-ink">
          Exit exploration
        </button>
      </div>
    </>
  );
}
