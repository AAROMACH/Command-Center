"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

export type GuideStep = { say: string; path?: string; click?: string };
export type StepsCard = { type: "steps"; title: string; steps: GuideStep[]; goTo?: string };

export const HIGHLIGHT_CLASSES = ["ring-2", "ring-accent-gold", "ring-offset-2", "ring-offset-bg-primary", "rounded-md", "animate-pulse"];

const CLICKABLE = 'button, a, [role="tab"], [role="button"], [role="menuitem"], [role="option"], label, h1, h2, h3, th';

/** Smallest visible clickable element whose text matches `text` — page, dialogs and sidebar; never the assistant itself. */
export function findByText(text: string): HTMLElement | null {
  const want = text.trim().toLowerCase();
  if (!want) return null;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of document.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (el.closest("[data-help-assistant]")) continue;
    const t = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!t.includes(want)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // Prefer an exact label, then the shortest text, then things inside an open dialog.
    const score = (t === want ? 0 : 1000) + t.length - (el.closest('[role="dialog"]') ? 500 : 0);
    if (score < bestScore) { best = el; bestScore = score; }
  }
  return best;
}

/** The link that opens `path`: sidebar, or the phone's bottom nav. */
export function findNavLink(path: string): HTMLElement | null {
  const links = [...document.querySelectorAll<HTMLAnchorElement>(`a[href="${CSS.escape(path)}"]`)]
    .filter(a => !a.closest("[data-help-assistant]"))
    .filter(a => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  return links[0] || null;
}

/**
 * "Show me how": walks the user through the steps on the real screen. Each
 * step highlights the thing to press and waits for them to press it — the
 * sidebar link for a page step (advances when the page opens), the button for
 * a click step (advances on click). Plain steps wait for Next.
 */
export function HelpWalkthrough({ card, onExit }: { card: StepsCard; onExit: () => void }) {
  const pathname = usePathname();
  const [index, setIndex] = useState(0);
  const [missing, setMissing] = useState(false);
  const step = card.steps[index];
  const lit = useRef<HTMLElement | null>(null);

  const next = () => (index + 1 < card.steps.length ? setIndex(index + 1) : onExit());

  // Page step: done once that page is open.
  useEffect(() => {
    if (step?.path && pathname === step.path && !step.click) {
      const t = setTimeout(next, 400);
      return () => clearTimeout(t);
    }
  }, [pathname, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight the current target and listen for the user's click on it.
  useEffect(() => {
    if (!step) return;
    setMissing(false);
    let cancelled = false;
    let tries = 0;
    let target: HTMLElement | null = null;
    const onClick = () => { if (!step.path || pathname === step.path) setTimeout(next, 250); };
    const find = () => {
      if (cancelled) return;
      const onPage = !step.path || pathname === step.path;
      target = !onPage ? findNavLink(step.path!) : step.click ? findByText(step.click) : null;
      if (target) {
        lit.current = target;
        target.classList.add(...HIGHLIGHT_CLASSES);
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        if (onPage) target.addEventListener("click", onClick, { once: true });
      } else if ((step.click || !onPage) && tries++ < 20) {
        setTimeout(find, 300);
      } else if (step.click || !onPage) {
        setMissing(true);
      }
    };
    const t = setTimeout(find, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
      target?.removeEventListener("click", onClick);
      lit.current?.classList.remove(...HIGHLIGHT_CLASSES);
      lit.current = null;
    };
  }, [index, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null;
  const onPage = !step.path || pathname === step.path;
  const hint = !onPage
    ? missing ? "Open the menu (top left) to find it." : "Tap the highlighted link."
    : step.click
      ? missing ? `Look for “${step.click}” on this page.` : `Tap the highlighted “${step.click}”.`
      : "";

  return (
    <div data-help-assistant className="fixed z-50 left-1/2 -translate-x-1/2 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-8 w-[min(26rem,calc(100vw-3rem))] rounded-lg border border-accent-gold/50 bg-bg-elevated shadow-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-gold">{card.title} · Step {index + 1} of {card.steps.length}</p>
        <button aria-label="Stop walkthrough" onClick={onExit} className="text-text-muted hover:text-text-primary"><X className="h-4 w-4" /></button>
      </div>
      <p className="mt-1 text-sm text-text-primary">{step.say}</p>
      {hint && <p className="mt-0.5 text-[12px] text-text-muted">{hint}</p>}
      <div className="mt-2 flex justify-between">
        <button disabled={index === 0} onClick={() => setIndex(index - 1)} className="text-[12px] text-text-muted disabled:opacity-40">Back</button>
        <button onClick={next} className="text-[12px] font-semibold text-accent-gold">{index + 1 < card.steps.length ? (step.click || !onPage ? "Skip" : "Next") : "Done"}</button>
      </div>
    </div>
  );
}
