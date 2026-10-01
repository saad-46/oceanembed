"use client";
import { useEffect, useState } from "react";
import { CloudOff, X } from "lucide-react";
import { API_CONFIGURED } from "@/lib/api";
import { markOfflineNoticeSeen, OFFLINE_NOTICE_EVENT, offlineNoticeSeen, useBackendStatus } from "@/lib/backendStatus";

/**
 * "Offline Demo Mode" notice. Shown once per browser session while the live backend is not reachable,
 * dismissible, and never blocking: the application underneath stays usable. It closes on its own when
 * the backend becomes available, and the status indicator can reopen it.
 */
export default function OfflineNotice() {
  const { mode } = useBackendStatus();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (mode !== "offline") return;
    if (offlineNoticeSeen()) return;
    const f = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(f);
  }, [mode]);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(OFFLINE_NOTICE_EVENT, reopen);
    return () => window.removeEventListener(OFFLINE_NOTICE_EVENT, reopen);
  }, []);

  const visible = open && mode === "offline";
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      markOfflineNoticeSeen();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible) return null;
  const dismiss = () => {
    markOfflineNoticeSeen();
    setOpen(false);
  };

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="offline-notice-title"
      className="fixed z-[45] top-16 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[460px] max-h-[calc(100dvh-5rem)] overflow-y-auto glass glass-strong p-5 fade-in"
      style={{ background: "rgba(9, 17, 29, 0.94)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warn/40 bg-warn/[0.08]">
            <CloudOff size={15} className="text-warn" aria-hidden />
          </span>
          <h2 id="offline-notice-title" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink">
            Offline Demo Mode
          </h2>
        </div>
        <button onClick={dismiss} aria-label="Close" className="text-ink-3 hover:text-ink">
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-ink-2">
        {API_CONFIGURED ? (
          <p>OceanSight&rsquo;s frontend is online, but the live scientific backend cannot be reached right now.</p>
        ) : (
          <>
            <p>OceanSight&rsquo;s public frontend is online, but the complete live backend is not publicly deployed.</p>
            <p className="text-ink">Deploying the full scientific backend requires paid cloud infrastructure and an active cloud billing setup, so the live backend is currently available only in the local demonstration environment.</p>
          </>
        )}
        <p>You can still explore OceanSight using precomputed demonstration data.</p>
        <p>
          Some live-data analysis and backend-powered downloads require the backend
          {API_CONFIGURED ? "." : ", which is available when OceanSight is run locally with its FastAPI backend and data services."}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-line pt-3 text-[11.5px]">
        <dt className="text-ink-3">Frontend</dt>
        <dd className="text-good">Online</dd>
        <dt className="text-ink-3">Backend</dt>
        <dd className="text-warn">{API_CONFIGURED ? "Not reachable" : "Not publicly deployed"}</dd>
        <dt className="text-ink-3">Data</dt>
        <dd className="text-ink-2">Precomputed demonstration data</dd>
      </dl>
      <div className="mt-4 flex justify-end">
        <button onClick={dismiss} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-[#04121c] hover:brightness-110">
          Continue Exploring
        </button>
      </div>
    </aside>
  );
}
