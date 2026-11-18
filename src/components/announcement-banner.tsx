"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { onSharedSnapshot } from "@/lib/shared-snapshot";
import { portalForPath } from "@/lib/route-permissions";
import { cn } from "@/lib/utils";
import type { AdminMessage } from "@/lib/types";

type Broadcast = AdminMessage & { revoked?: boolean };

const STYLE: Record<AdminMessage["type"], { cls: string; Icon: React.ElementType }> = {
  critical: { cls: "border-brand-red/60 text-text-primary", Icon: AlertTriangle },
  warning: { cls: "border-accent-gold/60 text-text-primary", Icon: AlertTriangle },
  info: { cls: "border-brand-blue/50 text-text-primary", Icon: Megaphone },
  success: { cls: "border-green-border/60 text-text-primary", Icon: CheckCircle2 },
};
const ICON_CLS: Record<AdminMessage["type"], string> = {
  critical: "text-brand-red", warning: "text-accent-gold", info: "text-brand-blue", success: "text-text-green",
};

// When each announcement was last dismissed: id → epoch ms. localStorage for
// 'once' / 'hourly' / 'daily'; sessionStorage for 'open' (cleared each time
// the app is opened fresh).
type Dismissed = Record<string, number>;
const dismissKey = (uid: string) => `dismissedAnnouncements:${uid}`;
const sessionKey = (uid: string) => `dismissedAnnouncementsSession:${uid}`;
function readStore(store: Storage, key: string): Dismissed {
  try {
    const v = JSON.parse(store.getItem(key) || "{}");
    // Older format: a plain list of ids, dismissed for good.
    return Array.isArray(v) ? Object.fromEntries(v.map((id: string) => [id, 0])) : v;
  } catch { return {}; }
}
const REPEAT_MS: Record<string, number> = { hourly: 3600e3, daily: 86400e3 };

/** Should a dismissed announcement show again by now? */
function isHidden(b: Broadcast, local: Dismissed, session: Dismissed, now: number): boolean {
  const repeat = b.repeat || "once";
  if (repeat === "open") return b.id in session;
  if (!(b.id in local)) return false;
  if (repeat === "once") return true;
  return now - local[b.id] < (REPEAT_MS[repeat] ?? Infinity);
}

/**
 * Office announcements (Messages → New announcement) as a pop-up on every
 * portal page, for the audience they were sent to. Stays up until the person
 * taps "Got it", then comes back per the announcement's "Show again" setting
 * (once / every app open / hourly / daily) until it expires or is removed.
 * Dismissals are remembered on this device.
 */
export function AnnouncementBanner({ userId }: { userId: string }) {
  const pathname = usePathname();
  const portal = portalForPath(pathname);
  const [all, setAll] = useState<Broadcast[]>([]);
  const [local, setLocal] = useState<Dismissed>({});
  const [session, setSession] = useState<Dismissed>({});
  const [clock, setClock] = useState(() => Date.now());
  const [index, setIndex] = useState(0);

  useEffect(() => onSharedSnapshot("broadcasts", snap => {
    setAll(snap.docs.map(d => ({ ...d.data(), id: d.id } as Broadcast)));
  }), []);
  useEffect(() => {
    setLocal(readStore(localStorage, dismissKey(userId)));
    setSession(readStore(sessionStorage, sessionKey(userId)));
  }, [userId]);
  // Re-check every minute so hourly / daily ones come back without a reload.
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const now = new Date(clock).toISOString();
  const live = useMemo(() => all
    .filter(b => !b.revoked && (!b.expiresAt || b.expiresAt > now))
    // Sales users see office announcements ("admin") — they're staff.
    .filter(b => b.targetPortal === "all" || b.targetPortal === portal || (portal === "sales" && b.targetPortal === "admin"))
    .filter(b => !isHidden(b, local, session, clock))
    .sort((a, b) => {
      const rank = { critical: 0, warning: 1, info: 2, success: 3 };
      return rank[a.type] - rank[b.type] || (b.timestamp || "").localeCompare(a.timestamp || "");
    }), [all, local, session, portal, clock]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (index >= live.length) setIndex(0); }, [live.length, index]);

  const b = live[index];
  if (!b) return null;
  const { cls, Icon } = STYLE[b.type] || STYLE.info;

  const dismiss = () => {
    const at = Date.now();
    if ((b.repeat || "once") === "open") {
      const next = { ...session, [b.id]: at };
      setSession(next);
      try { sessionStorage.setItem(sessionKey(userId), JSON.stringify(next)); } catch { /* storage blocked */ }
    } else {
      // Keep the newest 200 so the store doesn't grow forever.
      const next = Object.fromEntries(Object.entries({ ...local, [b.id]: at }).sort((x, y) => y[1] - x[1]).slice(0, 200));
      setLocal(next);
      try { localStorage.setItem(dismissKey(userId), JSON.stringify(next)); } catch { /* storage blocked */ }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[calc(4rem+env(safe-area-inset-top))]">
      <div role="alertdialog" aria-labelledby="announcement-title" className={cn("w-full max-w-md rounded-lg border bg-bg-elevated shadow-2xl", cls)}>
        <div className="flex items-start gap-2 p-4">
          <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", ICON_CLS[b.type])} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Announcement{b.senderName ? ` · ${b.senderName}` : ""}{live.length > 1 ? ` · ${index + 1} of ${live.length}` : ""}
            </p>
            <p id="announcement-title" className="mt-0.5 text-base font-semibold leading-snug">{b.subject}</p>
            <p className="mt-1.5 text-sm text-text-secondary whitespace-pre-wrap max-h-[50svh] overflow-y-auto">{b.body}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border-sub px-4 py-2.5">
          {live.length > 1 ? (
            <div className="flex items-center gap-1 text-text-muted">
              <button aria-label="Previous announcement" onClick={() => setIndex((index - 1 + live.length) % live.length)}><ChevronLeft className="h-4 w-4" /></button>
              <button aria-label="Next announcement" onClick={() => setIndex((index + 1) % live.length)}><ChevronRight className="h-4 w-4" /></button>
            </div>
          ) : <span />}
          <button onClick={dismiss} className="rounded-md bg-brand-red px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-red-hover">Got it</button>
        </div>
      </div>
    </div>
  );
}
