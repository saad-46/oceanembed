"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, Suspense, useState } from "react";
import { BarChart3, BookOpen, FileText, History, Map as MapIcon, Menu, ScanLine, ShieldCheck, Sparkles, Waves, X } from "lucide-react";
import GuideLayer from "@/components/guide/GuideLayer";
import HelpMenu from "@/components/guide/HelpMenu";
import type { Meta } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Logo, StatusDot } from "./ui";

/** Navigation by task: what users come to OceanSight to do. */
export const NAV_GROUPS = [
  { label: "Explore", items: [{ href: "/map", label: "Ocean map", icon: MapIcon }] },
  {
    label: "Analyze",
    items: [
      { href: "/profiles", label: "Profile", icon: Waves },
      { href: "/timeline", label: "Timeline", icon: History },
      { href: "/section", label: "Section", icon: ScanLine },
      { href: "/analysis", label: "Events & regions", icon: BarChart3 },
      { href: "/insights", label: "Daily summary", icon: Sparkles },
    ],
  },
  { label: "Validate", items: [{ href: "/validation", label: "Evidence", icon: ShieldCheck }] },
  { label: "Report", items: [{ href: "/reports", label: "Reports", icon: FileText }] },
  { label: "Learn", items: [{ href: "/methodology", label: "Methodology", icon: BookOpen }] },
] as const;
export const NAV = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

interface Health { status: string; model_version: string | null; database: string; reconstruction_store: string }

function useStatus() {
  const health = useApi<Health>("/health");
  const meta = useApi<Meta>("/v1/meta").data;
  const ok = health.data ? health.data.status === "ok" : health.error ? false : null;
  return { ok, health: health.data, meta, offline: !!health.error };
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { ok, health, meta, offline } = useStatus();
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 h-14 flex items-center border-b border-line shrink-0">
        <Link href="/" aria-label="OceanSight home" onClick={onNavigate}>
          <Logo size={24} />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Application">
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.12em] text-ink-3">{g.label}</div>
            {g.items.map(({ href, label, icon: Icon }) => {
              const active = path?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13.5px] transition-colors ${active ? "bg-white/[0.05] text-ink" : "text-ink-2 hover:text-ink hover:bg-white/[0.03]"}`}
                >
                  {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-accent" aria-hidden />}
                  <Icon size={16} className={active ? "text-accent" : "text-ink-3 group-hover:text-ink-2"} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <dl className="border-t border-line px-4 py-3 space-y-1 text-[11px] shrink-0">
        <div className="flex items-center gap-2 text-ink-2 pb-1">
          <StatusDot ok={ok} />
          <span>{ok === null ? "Connecting…" : ok ? "Service online" : offline ? "Offline — saved copies only" : "Service degraded"}</span>
        </div>
        {(
          [
            ["Data", meta ? `${meta.period.start.slice(0, 4)}–${meta.period.end.slice(0, 4)}` : "—"],
            ["Model", health?.model_version ?? meta?.production_model ?? "—"],
            ["Grid", "0.25° · daily · 0–1000 m"],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 text-ink-3">
            <dt>{k}</dt>
            <dd className="num text-ink-2 text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const path = usePathname() ?? "";
  const item = NAV.find((n) => path.startsWith(n.href));
  const { ok, offline } = useStatus();
  return (
    <header className="h-12 shrink-0 border-b border-line bg-bg/85 backdrop-blur flex items-center gap-3 px-3 md:px-5 z-20">
      <button onClick={onMenu} className="lg:hidden p-2 -ml-1 rounded-md text-ink-2 hover:text-ink" aria-label="Open navigation">
        <Menu size={19} />
      </button>
      <div className="lg:hidden">
        <Logo size={20} sub={false} />
      </div>
      <nav aria-label="Breadcrumb" className="hidden lg:flex items-center gap-1.5 text-[13px] min-w-0">
        <span className="text-ink-3">{item?.group ?? "OceanSight"}</span>
        {item && (
          <>
            <span className="text-ink-3" aria-hidden>
              /
            </span>
            <span className="text-ink truncate" aria-current="page">
              {item.label}
            </span>
          </>
        )}
      </nav>
      <div className="flex-1" />
      {ok === false && (
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-warn" role="status">
          <StatusDot ok={false} /> {offline ? "Offline — showing saved copies" : "Service degraded"}
        </span>
      )}
      <Suspense fallback={null}>
        <HelpMenu />
      </Suspense>
    </header>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  return (
    <div className="h-dvh flex bg-bg overflow-hidden">
      <aside className="hidden lg:block w-56 shrink-0 border-r border-line bg-bg-2">
        <SidebarBody />
      </aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="w-64 bg-bg-2 border-r border-line fade-in relative">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-3.5 p-1.5 text-ink-2" aria-label="Close navigation">
              <X size={18} />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
          <button className="flex-1 bg-black/50" onClick={() => setOpen(false)} aria-label="Close navigation" />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar onMenu={() => setOpen(true)} />
        <main key={path} className="flex-1 min-h-0 overflow-y-auto flex flex-col fade-in">
          {children}
        </main>
        <Suspense fallback={null}>
          <GuideLayer />
        </Suspense>
      </div>
    </div>
  );
}

