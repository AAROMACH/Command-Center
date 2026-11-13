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

const dismissKey = (uid: string) => `dismissedAnnouncements:${uid}`;
function readDismissed(uid: string): string[] {
  try { return JSON.parse(localStorage.getItem(dismissKey(uid)) || "[]"); } catch { return []; }
}

/**
 * Office announcements (Messages → New announcement) as a pop-up on every
 * portal page, for the audience they were sent to. Stays up until the person
 * taps "Got it" (remembered on this device), or until it expires / is removed.
 */
export function AnnouncementBanner({ userId }: { userId: string }) {
  const pathname = usePathname();
  const portal = portalForPath(pathname);
  const [all, setAll] = useState<Broadcast[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => onSharedSnapshot("broadcasts", snap => {
    setAll(snap.docs.map(d => ({ ...d.data(), id: d.id } as Broadcast)));
  }), []);
  useEffect(() => { setDismissed(readDismissed(userId)); }, [userId]);

  const now = new Date().toISOString();
  const live = useMemo(() => all
    .filter(b => !b.revoked && (!b.expiresAt || b.expiresAt > now))
    // Sales users see office announcements ("admin") — they're staff.
    .filter(b => b.targetPortal === "all" || b.targetPortal === portal || (portal === "sales" && b.targetPortal === "admin"))
    .filter(b => !dismissed.includes(b.id))
    .sort((a, b) => {
      const rank = { critical: 0, warning: 1, info: 2, success: 3 };
      return rank[a.type] - rank[b.type] || (b.timestamp || "").localeCompare(a.timestamp || "");
    }), [all, dismissed, portal, now.slice(0, 16)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (index >= live.length) setIndex(0); }, [live.length, index]);

  const b = live[index];
  if (!b) return null;
  const { cls, Icon } = STYLE[b.type] || STYLE.info;

  const dismiss = () => {
    const next = [...dismissed, b.id];
    setDismissed(next);
    try { localStorage.setItem(dismissKey(userId), JSON.stringify(next.slice(-200))); } catch { /* storage blocked */ }
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
