"use client";
import { ReactNode } from "react";

export function Card({ children, className = "", title, right }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <section className={`bg-surface border border-line rounded ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-3">
          {title && <h2 className="font-display text-sm tracking-wide text-ink-2 uppercase">{title}</h2>}
          {right}
        </div>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, unit, hint, loading }: { label: string; value: string | number | null | undefined; unit?: string; hint?: ReactNode; loading?: boolean }) {
  return (
    <div className="bg-surface border border-line rounded px-4 py-3 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-ink-3">{label}</div>
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

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="border border-bad/40 bg-bad/5 text-sm text-ink rounded px-3 py-2 flex items-start gap-3">
      <span className="text-bad mt-0.5" aria-hidden>●</span>
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-accent text-xs hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) {
  const c = tone === "warn" ? "border-warn/40 bg-warn/5" : "border-accent/30 bg-accent/5";
  return (
    <div role="status" className={`border ${c} text-xs text-ink rounded px-3 py-1.5`}>
      {children}
    </div>
  );
}

export function DataBadge({ label = "cached", fallback }: { label?: string; fallback?: boolean }) {
  if (fallback)
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider border border-warn/50 text-warn rounded px-2 py-0.5">
        Offline fallback · bundled snapshot
      </span>
    );
  return (
    <span
      title="Precomputed reconstruction from real historical satellite observations (not live, not simulated)"
      className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider border border-line text-ink-2 rounded px-2 py-0.5"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-good" aria-hidden />
      {label} · real satellite observations 2019–2023
    </span>
  );
}

export function Toggle({ checked, onChange, label, color }: { checked: boolean; onChange: (v: boolean) => void; label: string; color?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2 cursor-pointer select-none">
      <input type="checkbox" className="accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {color && <span className="w-3 h-[3px] rounded" style={{ background: color }} aria-hidden />}
      {label}
    </label>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex border border-line rounded overflow-hidden">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-xs ${o.value === value ? "bg-accent/15 text-accent" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const fmt = (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(d));
