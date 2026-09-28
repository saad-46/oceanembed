"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Compass, X } from "lucide-react";
import { GUIDE_STEP_KEY, readGuideStatus, shouldPromptOnboarding, stepHref, writeGuideStatus } from "@/lib/guide";

/**
 * One-time, dismissible "New to OceanSight?" prompt. Never shown again once the visitor chooses
 * (start, explore on their own, or close), and never while the guide is running.
 */
export default function OnboardingPrompt({ exploreHref }: { exploreHref?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let guiding = sp.get("guide") !== null;
    try {
      guiding ||= sessionStorage.getItem(GUIDE_STEP_KEY) !== null;
    } catch {}
    const f = requestAnimationFrame(() => setShow(shouldPromptOnboarding(readGuideStatus(), guiding)));
    return () => cancelAnimationFrame(f);
  }, [sp]);
  if (!show) return null;
  const dismiss = () => {
    writeGuideStatus("dismissed");
    setShow(false);
  };
  return (
    <aside aria-label="Getting started" className="fixed z-40 left-3 right-3 bottom-3 sm:left-auto sm:right-5 sm:bottom-5 sm:w-[360px] glass glass-strong p-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-ink font-medium">
          <Compass size={15} className="text-accent" aria-hidden /> New to OceanSight?
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-ink-3 hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">A short guided walkthrough shows how to move from the surface to the subsurface and investigate changes through time — on the real application.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={stepHref(0)} onClick={() => setShow(false)} className="rounded-lg bg-accent text-[#04121c] text-sm font-semibold px-3.5 py-1.5 hover:brightness-110">
          Start Guided Exploration
        </Link>
        <button
          onClick={() => {
            dismiss();
            if (exploreHref) router.push(exploreHref);
          }}
          className="rounded-lg border border-line-2 text-ink text-sm px-3.5 py-1.5 hover:border-accent/50"
        >
          Explore on my own
        </button>
      </div>
    </aside>
  );
}
