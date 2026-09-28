"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import { CycloneStage, MapStage, ProfileStage, TrustStage } from "@/components/tour/LiveStages";
import { AIStage, GapStage, ProblemStage, SystemStage, ValueStage, type StageProps } from "@/components/tour/StoryStages";
import { Logo } from "@/components/ui";
import { TOUR_STEPS, back, counter, isLast, next, parseStep, progress, stepParam, writeTourStatus } from "@/lib/tour";

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    const raf = requestAnimationFrame(on);
    m.addEventListener("change", on);
    return () => {
      cancelAnimationFrame(raf);
      m.removeEventListener("change", on);
    };
  }, []);
  return r;
}

export default function TourScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const step = parseStep(sp.get("step"));
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);

  const go = useCallback((i: number) => router.push(`/tour?step=${stepParam(i)}`, { scroll: false }), [router]);
  const exit = useCallback(
    (to: string, status: "completed" | "skipped") => {
      writeTourStatus(status);
      router.push(to);
    },
    [router],
  );

  useEffect(() => {
    if (isLast(step)) writeTourStatus("completed");
    stageRef.current?.scrollTo({ top: 0 });
    const h = stageRef.current?.querySelector<HTMLElement>("[data-stage-title]");
    h?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea, [role=dialog]")) return;
      if (e.key === "ArrowRight") go(next(step));
      else if (e.key === "ArrowLeft") go(back(step));
      else if (e.key === "Escape") exit("/", "skipped");
      else if (e.key.toLowerCase() === "p") setPlaying((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go, exit]);

  const props: StageProps = { playing, reduced, onNext: () => go(next(step)) };
  const id = TOUR_STEPS[step].id;
  const stage =
    id === "problem" ? <ProblemStage /> : id === "gap" ? <GapStage /> : id === "system" ? <SystemStage /> : id === "ai" ? <AIStage {...props} /> : id === "map" ? <MapStage {...props} /> : id === "profile" ? <ProfileStage /> : id === "trust" ? <TrustStage {...props} /> : id === "cyclone" ? <CycloneStage {...props} /> : <ValueStage onReplay={() => go(0)} />;

  return (
    <div className="h-dvh flex flex-col bg-bg relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(31,111,178,.22),transparent_60%)]" aria-hidden />
      <header className="relative z-10 shrink-0 flex items-center gap-3 px-4 md:px-8 h-14 border-b border-line/70 bg-bg/70 backdrop-blur">
        <Link href="/" aria-label="OceanSight home">
          <Logo size={22} sub={false} />
        </Link>
        <span className="hidden md:inline text-[11px] uppercase tracking-[.18em] text-ink-3">Guided tour · {TOUR_STEPS[step].label}</span>
        <div className="flex-1" />
        <span className="num text-sm text-accent" aria-label={`Step ${step + 1} of ${TOUR_STEPS.length}`}>
          {counter(step)}
        </span>
        <button onClick={() => exit("/overview", "skipped")} className="text-xs text-ink-3 hover:text-ink underline-offset-4 hover:underline">
          Skip tour
        </button>
        <button onClick={() => exit("/", "skipped")} aria-label="Exit tour" className="p-1.5 rounded-md text-ink-3 hover:text-ink">
          <X size={18} />
        </button>
      </header>
      <div className="relative z-10 h-[3px] bg-line shrink-0" role="progressbar" aria-valuemin={1} aria-valuemax={TOUR_STEPS.length} aria-valuenow={step + 1} aria-label="Tour progress">
        <div className="h-full bg-gradient-to-r from-ocean to-accent transition-[width] duration-500" style={{ width: `${progress(step) * 100}%` }} />
      </div>

      <main ref={stageRef} className="relative z-10 flex-1 min-h-0 overflow-y-auto">
        <div key={step} className="fade-in max-w-[1280px] mx-auto px-4 md:px-8 py-6 md:py-10">
          {stage}
        </div>
      </main>

      <nav className="relative z-10 shrink-0 border-t border-line/70 bg-bg/80 backdrop-blur px-3 md:px-8 py-2.5 flex items-center gap-2" aria-label="Tour navigation">
        <button onClick={() => go(back(step))} disabled={step === 0} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm text-ink-2 hover:text-ink disabled:opacity-40">
          <ChevronLeft size={16} /> <span className="hidden sm:inline">Back</span>
        </button>
        <button onClick={() => setPlaying(!playing)} aria-pressed={!playing} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink-2 hover:text-ink" title="Pause or resume animations (P)">
          {playing ? <Pause size={15} /> : <Play size={15} />} <span className="hidden sm:inline">{playing ? "Pause" : "Play"}</span>
        </button>
        <button onClick={() => go(0)} className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-ink-3 hover:text-ink" aria-label="Restart tour">
          <RotateCcw size={14} /> Restart
        </button>
        <ol className="flex-1 flex justify-center gap-1.5" aria-label="Tour steps">
          {TOUR_STEPS.map((s, i) => (
            <li key={s.id}>
              <button onClick={() => go(i)} aria-label={`Go to step ${i + 1}: ${s.label}`} aria-current={i === step ? "step" : undefined} className={`block h-2 rounded-full transition-all ${i === step ? "w-6 bg-accent" : i < step ? "w-2 bg-accent/50" : "w-2 bg-line-2"}`} />
            </li>
          ))}
        </ol>
        {isLast(step) ? (
          <Link href="/overview" onClick={() => writeTourStatus("completed")} className="inline-flex items-center gap-1 rounded-lg bg-accent text-[#04121c] font-semibold px-4 py-2 text-sm">
            Explore <ChevronRight size={16} />
          </Link>
        ) : (
          <button onClick={() => go(next(step))} className="inline-flex items-center gap-1 rounded-lg bg-accent text-[#04121c] font-semibold px-4 py-2 text-sm hover:brightness-110">
            Next <ChevronRight size={16} />
          </button>
        )}
      </nav>
    </div>
  );
}
