'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

const TRIGGER = 70; // px of pull (after resistance) that refreshes
const MAX = 110;

/**
 * Pull down from the top of the page to reload — the Android app and the
 * iPhone Home Screen app have no built-in pull-to-refresh. Touch only, and
 * only when the page (and whatever was touched) is already scrolled to the
 * top and no dialog or menu is open, so normal scrolling is untouched.
 */
export function PullToRefresh({ scrollRef }: { scrollRef: React.RefObject<HTMLElement | null> }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ y: number; x: number } | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Something between the touch and the page that can still scroll up.
    const innerScrolled = (t: EventTarget | null) => {
      for (let n = t as HTMLElement | null; n && n !== el; n = n.parentElement) {
        if (n.scrollTop > 0) return true;
      }
      return false;
    };
    // Radix dialogs/sheets/menus lock scrolling on <body> while open.
    const overlayOpen = () => document.body.hasAttribute('data-scroll-locked') || document.body.style.pointerEvents === 'none';

    const onStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1 || el.scrollTop > 0 || overlayOpen() || innerScrolled(e.target)) { start.current = null; return; }
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX };
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dy <= 0 || dx > dy || el.scrollTop > 0) { if (pullRef.current) { pullRef.current = 0; setPull(0); } return; }
      const d = Math.min(MAX, dy * 0.5);
      pullRef.current = d;
      setPull(d);
      if (e.cancelable) e.preventDefault(); // stop the page bouncing while pulling
    };
    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (pullRef.current >= TRIGGER) {
        setRefreshing(true);
        setPull(TRIGGER);
        window.location.reload();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [scrollRef, refreshing]);

  if (!pull && !refreshing) return null;
  const ready = pull >= TRIGGER;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center" style={{ transform: `translateY(${pull - 40}px)` }} aria-live="polite">
      <div className="h-9 w-9 rounded-full bg-bg-elevated border border-border-main shadow-lg flex items-center justify-center">
        {refreshing
          ? <Loader2 size={16} className="animate-spin text-brand-red" aria-label="Refreshing" />
          : <ArrowDown size={16} className="text-text-muted transition-transform" style={{ transform: ready ? 'rotate(180deg)' : 'none', opacity: Math.min(1, pull / TRIGGER) }} aria-label={ready ? 'Release to refresh' : 'Pull to refresh'} />}
      </div>
    </div>
  );
}
