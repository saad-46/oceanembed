import Link from "next/link";
import { CalendarDays, Crosshair, Keyboard, MapPin, Play, Tornado, WifiOff } from "lucide-react";
import { Logo } from "@/components/ui";
import { DEMO_STEPS, SCENARIO, demoHref } from "@/lib/demo";

export const metadata = { title: "Presenter demo — OceanSight", description: "A deterministic 8-step SIH demonstration on real OceanSight data." };

export default function DemoPage() {
  return (
    <div className="min-h-dvh bg-bg relative">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(31,111,178,.22),transparent_60%)]" aria-hidden />
      <header className="relative flex items-center justify-between px-4 md:px-8 h-14 border-b border-line/70">
        <Link href="/" aria-label="OceanSight home">
          <Logo size={22} sub={false} />
        </Link>
        <Link href="/tour" className="text-sm text-ink-2 hover:text-ink">
          Self-guided tour →
        </Link>
      </header>
      <main className="relative max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-8">
        <div>
          <div className="eyebrow">Presenter demo · SIH 2026</div>
          <h1 className="font-display text-3xl md:text-5xl text-ink mt-2 leading-tight">{SCENARIO.title}</h1>
          <p className="text-ink-2 mt-3 max-w-3xl leading-relaxed">
            Eight fixed steps through the real platform, 3–5 minutes. Every step opens a real screen in a prepared state — no searching, no typing coordinates. A presenter bar at the bottom carries
            the talking point and the Next button.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            [CalendarDays, "Date", SCENARIO.date],
            [MapPin, "Region", SCENARIO.region],
            [Crosshair, "Profile point", SCENARIO.point],
            [Tornado, "Cyclone", SCENARIO.cyclone],
          ].map(([I, k, v]) => {
            const Ic = I as typeof CalendarDays;
            return (
              <div key={k as string} className="panel p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-3">
                  <Ic size={13} className="text-accent" aria-hidden /> {k as string}
                </div>
                <div className="text-sm text-ink mt-1">{v as string}</div>
              </div>
            );
          })}
        </div>
        <ol className="panel divide-y divide-line">
          {DEMO_STEPS.map((s, i) => (
            <li key={s.title}>
              <Link href={demoHref(i)} className="flex gap-4 px-4 py-3 hover:bg-white/[0.02] group">
                <span className="num text-accent text-sm w-6 shrink-0 pt-0.5">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block text-ink font-medium group-hover:text-accent">{s.title}</span>
                  <span className="block text-[13px] text-ink-3 leading-relaxed">{s.say}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={demoHref(0)} className="inline-flex items-center gap-2 rounded-xl bg-accent text-[#04121c] font-semibold px-6 py-3 hover:brightness-110 shadow-[0_0_30px_-6px_var(--accent)]">
            <Play size={16} /> Start presentation
          </Link>
          <Link href="/tour" className="rounded-xl border border-line-2 text-ink px-5 py-3 hover:border-accent/60">
            Or take the 3-minute tour
          </Link>
        </div>
        <div className="grid md:grid-cols-2 gap-3 text-[13px] text-ink-3">
          <p className="flex gap-2">
            <Keyboard size={16} className="text-accent shrink-0" aria-hidden /> Page Down / Page Up (or a presentation clicker) move between steps; the bar stays through any clicks you make on a screen.
          </p>
          <p className="flex gap-2">
            <WifiOff size={16} className="text-accent shrink-0" aria-hidden /> Every view in this scenario is also bundled as an offline snapshot, so steps 1–7 still run if the backend is unreachable (screens then show a &ldquo;cached&rdquo; badge). Generating the PDF in step 8 needs the live API.
          </p>
        </div>
      </main>
    </div>
  );
}
