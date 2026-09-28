"use client";
import DemoBar from "@/components/DemoBar";
import GuideMe from "@/components/GuideMe";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ReactNode, Suspense, useState } from "react";
import {
  Activity, BarChart3, BookOpen, CircleHelp, FileText, LayoutDashboard, Map as MapIcon, Menu, ShieldCheck, Sparkles, Waves, X,
} from "lucide-react";
import { Logo, StatusDot } from "./ui";
import { useApi } from "@/lib/useApi";
import type { Meta } from "@/lib/api";

export const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/map", label: "Ocean Map", icon: MapIcon },
  { href: "/profiles", label: "Profiles", icon: Waves },
  { href: "/analysis", label: "Analysis", icon: BarChart3 },
  { href: "/validation", label: "Validation", icon: ShieldCheck },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
];

interface Health { status: string; model_version: string | null; database: string; reconstruction_store: string }

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const health = useApi<Health>("/health");
  const meta = useApi<Meta>("/v1/meta").data;
  const h = health.data;
  const ok = h ? h.status === "ok" : health.error ? false : null;
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 h-16 flex items-center border-b border-line shrink-0">
        <Link href="/" aria-label="OceanSight home" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" aria-label="Application">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-accent/[0.09] text-ink" : "text-ink-2 hover:text-ink hover:bg-white/[0.035]"
              }`}
            >
              {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" aria-hidden />}
              <Icon size={17} className={active ? "text-accent" : "text-ink-3 group-hover:text-ink-2"} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-4 py-3 space-y-1.5 text-[11px] shrink-0">
        <div className="flex items-center gap-2 text-ink-2">
          <StatusDot ok={ok} />
          {ok === null ? "Checking services…" : ok ? "All systems operational" : health.error ? "API unreachable — offline mode" : "Degraded — some services down"}
        </div>
        <div className="flex justify-between text-ink-3">
          <span>Data</span>
          <span className="num text-ink-2">{meta ? `${meta.period.start.slice(0, 4)}–${meta.period.end.slice(0, 4)}` : "—"}</span>
        </div>
        <div className="flex justify-between text-ink-3">
          <span>Model</span>
          <span className="num text-ink-2">{h?.model_version ?? meta?.production_model ?? "—"}</span>
        </div>
        <div className="flex justify-between text-ink-3">
          <span>Database</span>
          <span className={`num ${h?.database === "ok" ? "text-ink-2" : "text-warn"}`}>{h?.database ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const path = usePathname();
  const sp = useSearchParams();
  const item = NAV.find((n) => path?.startsWith(n.href));
  const date = sp.get("date");
  const health = useApi<Health>("/health");
  const ok = health.data ? health.data.status === "ok" : health.error ? false : null;
  return (
    <header className="h-14 shrink-0 border-b border-line bg-bg/80 backdrop-blur-md flex items-center gap-3 px-3 md:px-5 z-20">
      <button onClick={onMenu} className="lg:hidden p-2 -ml-1 rounded-md text-ink-2 hover:text-ink" aria-label="Open navigation">
        <Menu size={20} />
      </button>
      <div className="lg:hidden">
        <Logo size={22} sub={false} />
      </div>
      <div className="hidden lg:flex items-center gap-2 min-w-0">
        {item && <item.icon size={16} className="text-accent" aria-hidden />}
        <h1 className="font-display text-[15px] text-ink truncate">{item?.label ?? "OceanSight"}</h1>
      </div>
      <div className="flex-1" />
      {date && (
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-ink-2 border border-line rounded-full px-3 py-1 num">
          <Activity size={12} className="text-accent" /> {date}
        </span>
      )}
      <span className="hidden sm:inline-flex items-center gap-2 text-xs text-ink-2 border border-line rounded-full px-3 py-1">
        <StatusDot ok={ok} />
        {ok === null ? "…" : ok ? "Live API" : "Offline"}
      </span>
      <GuideMe />
      <Link href="/methodology" className="p-2 rounded-md text-ink-3 hover:text-ink" aria-label="Help and methodology">
        <CircleHelp size={18} />
      </Link>
    </header>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  return (
    <div className="h-dvh flex bg-bg overflow-hidden">
      <aside className="hidden lg:block w-60 shrink-0 border-r border-line bg-bg-2">
        <SidebarBody />
      </aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="w-64 bg-bg-2 border-r border-line fade-in relative">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-4 p-1.5 text-ink-2" aria-label="Close navigation">
              <X size={18} />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
          <button className="flex-1 bg-black/50" onClick={() => setOpen(false)} aria-label="Close navigation" />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <Suspense fallback={<div className="h-14 border-b border-line" />}>
          <TopBar onMenu={() => setOpen(true)} />
        </Suspense>
        <main key={path} className="flex-1 min-h-0 overflow-y-auto flex flex-col fade-in">
          {children}
        </main>
        <Suspense fallback={null}>
          <DemoBar />
        </Suspense>
      </div>
    </div>
  );
}
