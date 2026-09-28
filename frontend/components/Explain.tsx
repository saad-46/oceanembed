"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { GLOSSARY, type TermKey } from "@/lib/glossary";

/** Small "What is this?" button with a two-level (simple / technical) explanation. */
export default function Explain({ term, className = "" }: { term: TermKey; className?: string }) {
  const t = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<"simple" | "technical">("simple");
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={box} className={`relative inline-flex align-middle normal-case tracking-normal ${className}`}>
      <button
        ref={btn}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What is ${t.title}?`}
        title={`What is ${t.title}?`}
        className="p-0.5 rounded text-ink-3 hover:text-accent focus-visible:text-accent"
      >
        <Info size={12} aria-hidden />
      </button>
      {open && (
        <span id={id} role="dialog" aria-label={t.title} className="absolute z-50 top-6 left-1/2 -translate-x-1/2 w-[min(300px,80vw)] glass glass-strong p-3 text-left fade-in shadow-xl">
          <span className="flex items-start justify-between gap-2">
            <span className="text-[12.5px] font-medium text-ink leading-snug">{t.title}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close explanation" className="text-ink-3 hover:text-ink">
              <X size={13} />
            </button>
          </span>
          <span className="mt-2 inline-flex rounded-md border border-line p-0.5 text-[10.5px]" role="tablist">
            {(["simple", "technical"] as const).map((l) => (
              <button key={l} type="button" role="tab" aria-selected={level === l} onClick={() => setLevel(l)} className={`px-2 py-0.5 rounded capitalize ${level === l ? "bg-accent/15 text-accent" : "text-ink-3 hover:text-ink"}`}>
                {l}
              </button>
            ))}
          </span>
          <span className="block mt-2 text-[12px] text-ink-2 leading-relaxed">{t[level]}</span>
        </span>
      )}
    </span>
  );
}
