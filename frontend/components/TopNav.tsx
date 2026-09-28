"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/map", label: "Ocean Map" },
  { href: "/analysis", label: "Analysis" },
  { href: "/validation", label: "Validation" },
  { href: "/insights", label: "AI Insights" },
  { href: "/reports", label: "Reports" },
  { href: "/methodology", label: "Methodology" },
];

export default function TopNav() {
  const path = usePathname();
  return (
    <header className="h-12 shrink-0 border-b border-line bg-bg/95 flex items-center px-4 gap-6 z-20">
      <Link href="/" className="flex items-baseline gap-2" aria-label="OceanSight home">
        <span className="font-display text-lg font-semibold tracking-[0.06em] text-accent">OceanSight</span>
        <span className="hidden md:inline text-[11px] text-ink-3 num">SIH26066 · OceanEmbed</span>
      </Link>
      <nav className="flex gap-1 overflow-x-auto" aria-label="Main">
        {LINKS.map((l) => {
          const active = path?.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-1.5 text-sm rounded whitespace-nowrap transition-colors ${
                active ? "text-ink bg-surface-2" : "text-ink-2 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
