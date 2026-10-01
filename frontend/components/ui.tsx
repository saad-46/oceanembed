"use client";
import Explain from "@/components/Explain";
import type { TermKey } from "@/lib/glossary";
/**
 * OceanSight UI primitives. Existing exports (Card, StatTile, Skeleton, ErrorState, Notice, DataBadge,
 * Toggle, Segmented, fmt) keep their signatures; new design-system pieces are added below them.
 */
import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { AlertTriangle, CloudOff, RefreshCw, WifiOff } from "lucide-react";

export function Card({ children, className = "", title, right, icon }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2 gap-3 flex-wrap">
          {title && (
            <h2 className="flex items-center gap-2 font-display text-[13px] tracking-wide text-ink-2 uppercase">
              {icon && <span className="text-accent">{icon}</span>}
              {title}
            </h2>
          )}
          {right}
        </div>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, unit, hint, loading, icon, info }: { label: string; value: string | number | null | undefined; unit?: string; hint?: ReactNode; loading?: boolean; icon?: ReactNode; info?: TermKey }) {
  return (
    <div className="panel px-4 py-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-3">
        {icon && <span className="text-accent">{icon}</span>}
        {label}
        {info && <Explain term={info} />}
      </div>
      {loading ? (
        <div className="skeleton h-7 w-24 mt-1.5" />
      ) : (
        <div className="mt-1 flex items-baseline gap-1">
          <span className="num text-2xl text-ink">{value ?? "—"}</span>
          {unit && value !== null && value !== undefined && <span className="text-xs text-ink-2">{unit}</span>}
        </div>
      )}
      {hint && <div className="text-[11px] text-ink-3 mt-1 leading-snug">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Skeleton with a meaningful label ("Loading ocean field…") instead of a spinner. */
export function LoadingState({ label, className = "h-48" }: { label: string; className?: string }) {
  return (
    <div className={`relative skeleton ${className}`} role="status" aria-live="polite">
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="glass px-3 py-1.5 text-xs text-ink-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot text-accent" aria-hidden />
          {label}
        </span>
      </div>
    </div>
  );
}

/**
 * Calm error block. `message` is the what; optional `why` and `action` explain cause and remedy.
 */
export function ErrorState({ message, why, action, onRetry, offline }: { message: string; why?: string; action?: string; onRetry?: () => void; offline?: boolean }) {
  // A connection problem (API down or not configured) is not a data problem: never explain it with a
  // screen's "no data here" reason or suggest picking another point.
  const backendRequired = /requires OceanSight's live scientific backend|requires the OceanSight backend/.test(message);
  const connection = backendRequired || /temporarily unavailable/.test(message);
  if (connection) {
    offline = true;
    why = undefined;
    action = undefined;
  }
  // Offline Demo Mode is an expected state, not a fault: a calm notice with a title, and no Retry.
  if (backendRequired)
    return (
      <div role="status" className="border border-warn/35 bg-warn/[0.06] rounded-[var(--radius)] px-3.5 py-3 flex items-start gap-3 text-sm">
        <CloudOff size={16} className="text-warn mt-0.5 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-ink font-medium">{/export/.test(message) ? "Backend Required for Export" : "Live Backend Required"}</div>
          <div className="text-[13px] text-ink-2 leading-relaxed">{message}</div>
        </div>
      </div>
    );
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div role="alert" className="border border-bad/35 bg-bad/[0.06] rounded-[var(--radius)] px-3.5 py-3 flex items-start gap-3 text-sm">
      <Icon size={16} className="text-bad mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="text-ink">{message}</div>
        {why && <div className="text-xs text-ink-2">Why: {why}</div>}
        {action && <div className="text-xs text-ink-2">What you can do: {action}</div>}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="text-accent text-xs hover:underline flex items-center gap-1">
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) {
  const c = tone === "warn" ? "border-warn/40 bg-warn/[0.07]" : "border-accent/30 bg-accent/[0.06]";
  return (
    <div role="status" className={`border ${c} text-xs text-ink rounded-[var(--radius-sm)] px-3 py-1.5 backdrop-blur`}>
      {children}
    </div>
  );
}

/**
 * Shown only when a view is served from the bundled offline copy (the API was unreachable).
 * Normal data needs no badge: the status bar already states the data period and model.
 */
export function DataBadge({ fallback }: { label?: string; fallback?: boolean }) {
  if (!fallback) return null;
  return (
    <span
      title="Offline Demo Mode: this view shows precomputed demonstration data saved from the same reconstruction."
      className="inline-flex items-center gap-1.5 text-[10.5px] border border-warn/50 text-warn rounded-full px-2.5 py-0.5 bg-bg/70"
    >
      <WifiOff size={10} aria-hidden /> Offline Demo data
    </span>
  );
}

const PROV = {
  measured: { dot: "bg-good", label: "Measured" },
  satellite: { dot: "bg-[#7fb8ff]", label: "Satellite" },
  reanalysis: { dot: "bg-[#b49cf5]", label: "Reanalysis" },
  reconstructed: { dot: "bg-accent", label: "Reconstructed" },
  derived: { dot: "bg-ink-2", label: "Derived" },
  estimated: { dot: "bg-warn", label: "Estimated" },
  forecast: { dot: "bg-[#f08a5d]", label: "Forecast" },
  baseline: { dot: "bg-warn", label: "Baseline" },
} as const;

export const KIND_LABEL: Record<DataKind, string> = Object.fromEntries(Object.entries(PROV).map(([k, v]) => [k, v.label])) as Record<DataKind, string>;

/**
 * Compact provenance line: "● Reconstructed · OceanSight U-Net". With `lineage`, the label links to the
 * variable's row in the Data Sources & Lineage workspace ("how this value was produced").
 */
export function Provenance({ kind, source, className = "", lineage }: { kind: DataKind; source?: ReactNode; className?: string; lineage?: string | null }) {
  const p = PROV[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] text-ink-2 ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dot}`} aria-hidden />
      {lineage ? (
        <Link href={`/provenance#${lineage}`} className="text-ink underline decoration-dotted decoration-ink-3 underline-offset-2 hover:text-accent" title="How this value was produced">
          {p.label}
        </Link>
      ) : (
        <span className="text-ink">{p.label}</span>
      )}
      {source && <span className="text-ink-3">· {source}</span>}
    </span>
  );
}

/** Quality flag from the analysis endpoints (good / limited / insufficient), never colour alone. */
export function QualityBadge({ quality, className = "" }: { quality: "good" | "limited" | "insufficient" | null | undefined; className?: string }) {
  if (!quality) return <Badge className={className}>n/a</Badge>;
  const tone = quality === "good" ? "good" : quality === "limited" ? "warn" : "bad";
  const icon = quality === "good" ? "✓" : quality === "limited" ? "!" : "×";
  return (
    <Badge tone={tone} className={className}>
      <span aria-hidden>{icon}</span> {quality}
    </Badge>
  );
}

/** Calm "not available" block for optional data (never an error colour). */
export function UnavailableState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div role="status" className="border border-line-2 border-dashed rounded-[var(--radius)] px-3.5 py-3 text-sm bg-white/[0.015]">
      <div className="text-ink">{title}</div>
      <div className="text-xs text-ink-2 mt-0.5 leading-relaxed">{detail}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Consistent page header: group › title, one-line description, optional actions. */
export function PageHeader({ group, title, description, actions }: { group: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="eyebrow">{group}</div>
        <h1 className="font-display text-[22px] md:text-2xl text-ink mt-1 leading-tight">{title}</h1>
        {description && <p className="text-[13.5px] text-ink-2 mt-1.5 max-w-3xl leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Toggle({ checked, onChange, label, color }: { checked: boolean; onChange: (v: boolean) => void; label: string; color?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2 cursor-pointer select-none hover:text-ink transition-colors">
      <input type="checkbox" className="accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {color && <span className="w-3 h-[3px] rounded" style={{ background: color }} aria-hidden />}
      {label}
    </label>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-bg/60 border border-line">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${o.value === value ? "bg-accent/15 text-accent" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const fmt = (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(d));

// ---------------------------------------------------------------- design-system additions

export function Logo({ size = 26, withText = true, sub = true }: { size?: number; withText?: boolean; sub?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="lg-o" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7fe3ef" />
            <stop offset="1" stopColor="#1f6fb2" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="14.5" fill="none" stroke="url(#lg-o)" strokeWidth="2" />
        <path d="M4 14c3-2 6-2 9 0s6 2 9 0 5-2 6-1" fill="none" stroke="#7fe3ef" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 19.5c2.5-1.3 5-1.3 7.5 0s5 1.3 7.5 0 4-1.3 5.5-.6" fill="none" stroke="#2ec5d8" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
        <path d="M8.5 24.5c2-.9 4-.9 6 0s4 .9 6 0" fill="none" stroke="#1f6fb2" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
        <circle cx="22.5" cy="7.5" r="1.6" fill="#e8eef6" />
      </svg>
      {withText && (
        <span className="flex flex-col leading-none">
          <span className="font-display font-semibold text-[17px] tracking-tight text-ink">
            Ocean<span className="text-accent">Sight</span>
          </span>
          {sub && <span className="text-[10px] text-ink-3 mt-1 tracking-wide">Subsurface Ocean Intelligence</span>}
        </span>
      )}
    </span>
  );
}

type BtnProps = { children: ReactNode; href?: string; onClick?: () => void; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" | "lg"; className?: string; icon?: ReactNode; external?: boolean; disabled?: boolean; ariaLabel?: string };
export function Button({ children, href, onClick, variant = "primary", size = "md", className = "", icon, external, disabled, ariaLabel }: BtnProps) {
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2", lg: "text-[15px] px-5 py-2.5" };
  const variants = {
    primary: "bg-accent text-[#04121c] font-semibold hover:brightness-110",
    secondary: "border border-line-2 text-ink hover:border-accent/60 hover:bg-accent/[0.06] bg-bg/40",
    ghost: "text-ink-2 hover:text-ink hover:bg-white/[0.04]",
  };
  const cls = `inline-flex items-center justify-center gap-2 rounded-lg transition-all duration-200 ${sizes[size]} ${variants[variant]} ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`;
  if (href)
    return external ? (
      <a href={href} className={cls} aria-label={ariaLabel} target="_blank" rel="noreferrer">
        {icon}
        {children}
      </a>
    ) : (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {icon}
        {children}
      </Link>
    );
  return (
    <button onClick={onClick} className={cls} disabled={disabled} aria-label={ariaLabel}>
      {icon}
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warn" | "bad"; className?: string }) {
  const tones = {
    neutral: "border-line-2 text-ink-2",
    accent: "border-accent/40 text-accent bg-accent/[0.06]",
    good: "border-good/40 text-good bg-good/[0.06]",
    warn: "border-warn/40 text-warn bg-warn/[0.06]",
    bad: "border-bad/40 text-bad bg-bad/[0.06]",
  };
  return <span className={`inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider border rounded-full px-2 py-0.5 ${tones[tone]} ${className}`}>{children}</span>;
}

/** Evidence-type label so measured / reconstructed / derived values are never confused. */
export type DataKind = "measured" | "satellite" | "reanalysis" | "reconstructed" | "derived" | "estimated" | "forecast" | "baseline";
export function KindBadge({ kind }: { kind: DataKind }) {
  const map = { measured: ["good", "Measured"], satellite: ["neutral", "Satellite"], reanalysis: ["neutral", "Reanalysis"], reconstructed: ["accent", "Reconstructed"], derived: ["neutral", "Derived"], estimated: ["warn", "Estimated"], forecast: ["warn", "Forecast"], baseline: ["warn", "Baseline"] } as const;
  const [tone, label] = map[kind];
  return <Badge tone={tone}>{label}</Badge>;
}

export function SectionHeader({ eyebrow, title, sub, center }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={`max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h2 className="font-display text-3xl md:text-4xl leading-tight text-ink">{title}</h2>
      {sub && <p className="text-ink-2 mt-3 text-base md:text-lg leading-relaxed">{sub}</p>}
    </div>
  );
}

/** Adds the .in class when scrolled into view (CSS handles the motion; reduced-motion safe). */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${inView ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Counts up to a real value once visible. Renders the final value immediately for reduced motion. */
export function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (reduce) {
        setShown(value);
        return;
      }
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / 1100);
        setShown(value * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <span ref={ref} className="num">
      {shown.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

export function StatusDot({ ok }: { ok: boolean | null }) {
  const c = ok === null ? "bg-ink-3 text-ink-3" : ok ? "bg-good text-good" : "bg-warn text-warn";
  return <span className={`inline-block w-2 h-2 rounded-full ${c} ${ok ? "pulse-dot" : ""}`} aria-hidden />;
}
