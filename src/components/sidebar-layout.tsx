"use client";

import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AlertBand } from "@/components/alert-band";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasPermission, getAvailablePortals } from "@/lib/permissions";
import { requiredPermissionForPath } from "@/lib/route-permissions";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const isTechPortal = pathname.startsWith("/tech");

  // Enforce the same permissions the sidebar nav uses for visibility: a page
  // hidden from the nav must not be reachable by direct URL either. Only
  // gate once a real user profile has loaded — while loading (or when no
  // Firestore profile exists) the middleware/session flow remains in charge.
  const required = requiredPermissionForPath(pathname);
  const denied = !loading && !!user && !!required && !hasPermission(user, required);

  useEffect(() => {
    if (!denied) return;
    const portals = getAvailablePortals(user);
    router.replace(portals[0]?.path ?? "/portal-select");
  }, [denied, user, router]);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-svh w-full overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Top strip: trigger on desktop, minimal on mobile */}
          <div className="flex items-center shrink-0 bg-[#0f0f0f] border-b border-border-main z-40">
            <div className="flex items-center gap-2 px-2 py-1.5 border-r border-border-sub">
              <SidebarTrigger className="text-text-muted hover:text-text-primary h-7 w-7" />
            </div>
            <div className="flex-1 overflow-hidden">
              <AlertBand />
            </div>
          </div>
          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-bg-primary">
            <div className="page-content">
              {denied ? null : children}
            </div>
          </main>
          {/* Tech mobile bottom nav */}
          {isTechPortal && <TechBottomNav />}
        </div>
      </div>
    </SidebarProvider>
  );
}

function TechBottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href.endsWith("/dashboard")) return pathname === href;
    return pathname.startsWith(href);
  };

  const items = [
    { href: "/tech/dashboard", label: "Home", Icon: HomeIcon },
    { href: "/tech/assignments", label: "Jobs", Icon: CalendarIcon },
    { href: "/tech/logs", label: "Logs", Icon: ScrollIcon },
    { href: "/tech/earnings", label: "Earnings", Icon: CoinsIcon },
    { href: "/tech/map", label: "Map", Icon: MapIcon },
  ];

  return (
    <nav className="md:hidden shrink-0 bg-[#0f0f0f] border-t border-border-main z-50">
      <div className="flex items-center">
        {items.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 py-2.5 flex-1 transition-colors ${
              isActive(href) ? "text-brand-red" : "text-[#666] hover:text-text-primary"
            }`}
          >
            <Icon />
            <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function ScrollIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
    </svg>
  );
}
function CoinsIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="8" cy="8" r="5" />
      <path d="M16 3c1.657 0 3 1.343 3 3v0c0 1.657-1.343 3-3 3" />
      <path d="M11 13c0 2.761 2.239 5 5 5s5-2.239 5-5-2.239-5-5-5" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
