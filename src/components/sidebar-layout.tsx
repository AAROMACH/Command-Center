"use client";

import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AlertBand } from "@/components/alert-band";
import { MessagesMenu } from "@/components/messages-menu";
import { NotificationBell } from "@/components/notification-bell";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { startNativePush } from "@/lib/native-push";
import { getAvailablePortals } from "@/lib/permissions";
import { canAccessPath } from "@/lib/route-permissions";
import { Home, CalendarDays, FileText, Coins, Wrench, ClipboardList, Inbox, Receipt, Target, Users, FileSearch, Settings } from "lucide-react";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const isTechPortal = pathname.startsWith("/tech");
  const isAdminPortal = pathname.startsWith("/admin");
  const isSalesPortal = pathname.startsWith("/sales");

  // Enforce one composite effective-access decision (portal lock + page
  // permission) for direct-URL/refresh access — the same result the nav and
  // middleware use, read from the live user doc. A page hidden from the nav, or
  // inside a locked portal, must not be reachable by direct URL either. Only
  // gate once a real user profile has loaded — while loading (or when no
  // Firestore profile exists) the middleware/session flow remains in charge.
  const denied = !loading && !!user && !canAccessPath(user, pathname);

  // Android app: register this phone for push once someone is signed in.
  const { toast } = useToast();
  const uid = user?.id;
  useEffect(() => {
    if (!uid) return;
    let cleanup: (() => void) | undefined;
    startNativePush(url => router.push(url), (title, body) => toast({ title, description: body }))
      .then(c => { cleanup = c; })
      .catch(e => console.warn('[push] setup failed', e));
    return () => cleanup?.();
  }, [uid, router, toast]);

  useEffect(() => {
    if (!denied) return;
    const portals = getAvailablePortals(user);
    router.replace(portals[0]?.path ?? "/portal-select");
  }, [denied, user, router]);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-svh w-full overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Top strip: trigger on desktop, minimal on mobile */}
          <div className="flex items-center shrink-0 bg-sidebar border-b border-border-main z-40">
            <div className="flex items-center gap-2 px-2 py-1.5 border-r border-border-sub">
              <SidebarTrigger className="text-text-muted hover:text-text-primary h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <AlertBand />
            </div>
            {/* Messages + notifications on every page — small, out of the way */}
            <div className="flex items-center gap-0.5 px-1.5 shrink-0 border-l border-border-sub">
              <MessagesMenu />
              <NotificationBell compact />
            </div>
          </div>
          {/* Page content */}
          <main className="flex-1 min-w-0 overflow-y-auto bg-bg-primary">
            <div className="page-content">
              {denied ? null : children}
            </div>
          </main>
          {/* Tech mobile bottom nav */}
          {isTechPortal && <BottomNav items={TECH_NAV} />}
          {isAdminPortal && <BottomNav items={ADMIN_NAV} />}
          {isSalesPortal && <BottomNav items={SALES_NAV} />}
        </div>
      </div>
    </SidebarProvider>
  );
}

type NavItem = { href: string; label: string; Icon: typeof Home; /** Path whose permission decides visibility (defaults to href). */ gate?: string };

const TECH_NAV: NavItem[] = [
  { href: "/tech/assignments", label: "Assignments", Icon: ClipboardList },
  { href: "/tech/calendar", label: "Schedule", Icon: CalendarDays },
  { href: "/tech/dashboard", label: "Home", Icon: Home },
  { href: "/tech/logs", label: "Logs", Icon: FileText },
  { href: "/tech/earnings", label: "Earnings", Icon: Coins },
];

// Phone bottom tabs, Home in the middle. Pages the user can't open are hidden
// (a dispatch admin without payroll sees four).
const ADMIN_NAV: NavItem[] = [
  { href: "/admin/assignments", label: "Jobs", Icon: ClipboardList },
  { href: "/admin/dispatch", label: "Dispatch", Icon: Wrench },
  { href: "/admin/dashboard", label: "Home", Icon: Home },
  { href: "/admin/payroll/audit", label: "Payroll", Icon: Receipt, gate: "/admin/financials" },
  { href: "/admin/requests", label: "Requests", Icon: Inbox },
];

// Sales: My Day in the middle as the home screen.
const SALES_NAV: NavItem[] = [
  { href: "/sales/pipeline", label: "Pipeline", Icon: Target },
  { href: "/sales/accounts", label: "Accounts", Icon: Users },
  { href: "/sales/my-day", label: "My Day", Icon: Home },
  { href: "/sales/quotes", label: "Quotes", Icon: FileSearch },
  { href: "/sales/settings", label: "Settings", Icon: Settings },
];

/** Phone-only bottom tabs; hides pages the user can't open (e.g. Earnings for project managers). */
function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isActive = (href: string) => {
    if (href.endsWith("/dashboard")) return pathname === href;
    return pathname.startsWith(href);
  };
  const shown = items.filter(({ href, gate }) => !user || canAccessPath(user, gate || href)).slice(0, 5);

  return (
    <nav className="md:hidden shrink-0 bg-sidebar border-t border-border-main z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center">
        {shown.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 min-h-[48px] flex-1 min-w-0 transition-colors ${
              isActive(href) ? "text-brand-red" : "text-sidebar-foreground hover:text-text-primary"
            }`}
          >
            <Icon size={18} strokeWidth={2} />
            <span className="text-[11px] font-medium leading-none truncate max-w-full px-0.5">{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
