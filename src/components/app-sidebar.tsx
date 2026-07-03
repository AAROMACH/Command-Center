"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { hasPermission, type Permission } from "@/lib/permissions";
import { technicians as fallbackTechs } from "@/lib/data";
import type { Technician } from "@/lib/types";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { UserNav } from "@/components/user-nav";
import { PortalSwitcher } from "@/components/portal-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Wrench,
  Briefcase,
  Users,
  Banknote,
  Activity,
  Calendar,
  ScrollText,
  Coins,
  FolderKanban,
  ClipboardList,
  FileText,
  Settings,
  BookOpen,
  MapPin,
  BarChart2,
  Target,
  CalendarDays,
  MessageSquare,
  Building2,
  Receipt,
  Package,
  Flag,
  Inbox,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  permission: Permission;
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const adminNavGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "admin.dashboard.view" },
      { href: "/admin/requests", label: "Requests", icon: Inbox, permission: "admin.requests.view" },
      { href: "/admin/reports", label: "Activity", icon: Activity, permission: "admin.reports.view" },
      { href: "/admin/analytics", label: "Field Intelligence", icon: BarChart2, permission: "admin.reports.view" },
    ],
  },
  {
    label: "Dispatch",
    items: [
      { href: "/admin/dispatch", label: "Dispatch Hub", icon: Wrench, permission: "admin.dispatch.view" },
      { href: "/admin/calendar", label: "Schedule", icon: CalendarDays, permission: "admin.schedule.view" },
      { href: "/admin/assignments", label: "Assignments", icon: ClipboardList, permission: "admin.assignments.view" },
    ],
  },
  {
    label: "CRM & Sales",
    items: [
      { href: "/admin/crm", label: "CRM", icon: Target, permission: "admin.crm.view" },
      { href: "/admin/plans", label: "Service Plans", icon: BookOpen, permission: "admin.reports.view" },
      { href: "/admin/company-planning", label: "Company Planning", icon: Flag, permission: "admin.reports.view" },
    ],
  },
  {
    label: "Clients & Projects",
    items: [
      { href: "/admin/sites", label: "Clients", icon: Building2, permission: "admin.clients.view" },
      { href: "/admin/projects", label: "Projects", icon: Briefcase, permission: "admin.projects.view" },
      { href: "/admin/messaging", label: "Messages", icon: MessageSquare, permission: "admin.messages.view" },
    ],
  },
  {
    label: "Directory",
    items: [
      { href: "/admin/directory", label: "Directory", icon: Users, permission: "admin.directory.view" },
    ],
  },
  {
    label: "Financials",
    items: [
      { href: "/admin/financials", label: "Financials", icon: Banknote, permission: "admin.financials.view" },
      { href: "/admin/assets", label: "Assets", icon: Package, permission: "admin.assignments.view" },
    ],
  },
];

const techNavItems: NavItem[] = [
  { href: "/tech/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "tech.dashboard.view" },
  { href: "/tech/assignments", label: "Assignments", icon: Calendar, permission: "tech.assignments.view" },
  { href: "/tech/calendar", label: "Schedule", icon: CalendarDays, permission: "tech.schedule.view" },
  { href: "/tech/projects", label: "Projects", icon: FolderKanban, permission: "tech.projects.view" },
  { href: "/tech/logs", label: "Logs", icon: ScrollText, permission: "tech.logs.view" },
  { href: "/tech/earnings", label: "Earnings", icon: Coins, permission: "tech.earnings.view" },
  { href: "/tech/messaging", label: "Messages", icon: MessageSquare, permission: "tech.messages.view" },
];

const clientNavItems: NavItem[] = [
  { href: "/client/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "client.dashboard.view" },
  { href: "/client/tickets", label: "Support", icon: ClipboardList, permission: "client.tickets.view" },
  { href: "/client/projects", label: "Projects", icon: Briefcase, permission: "client.projects.view" },
  { href: "/client/sites", label: "Sites", icon: MapPin, permission: "client.sites.view" },
  { href: "/client/quotes", label: "Quotes", icon: Receipt, permission: "client.quotes.view" },
  { href: "/client/financials", label: "Financials", icon: FileText, permission: "client.financials.view" },
  { href: "/client/messaging", label: "Messages", icon: MessageSquare, permission: "client.messages.view" },
  { href: "/client/profile", label: "Profile", icon: Users, permission: "client.profile.view" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<Technician | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const logo = PlaceHolderImages.find(img => img.id === "app-logo");

  useEffect(() => {
    setMounted(true);
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const unsubUser = onSnapshot(doc(db, "users", fbUser.uid), (snap) => {
          if (snap.exists()) {
            setCurrentUser({ ...snap.data(), id: snap.id } as Technician);
          } else {
            const storedId = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("currentUserId") : null;
            const registryUser = fallbackTechs.find(t => t.id === fbUser.uid || t.id === storedId);
            setCurrentUser(registryUser);
          }
        });
        return () => unsubUser();
      } else {
        const storedId = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("currentUserId") : null;
        if (storedId) {
          const registryUser = fallbackTechs.find(t => t.id === storedId);
          setCurrentUser(registryUser);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  const isTechPortal = pathname.startsWith("/tech");
  const isClientPortal = pathname.startsWith("/client");
  const portalLabel = isTechPortal ? "Field Terminal" : isClientPortal ? "Client Portal" : "Command Center";
  const dashboardHref = isTechPortal ? "/tech/dashboard" : isClientPortal ? "/client/dashboard" : "/admin/dashboard";

  const rawItems = isTechPortal ? techNavItems : isClientPortal ? clientNavItems : adminNavGroups.flatMap(g => g.items);
  const navItems = useMemo(
    () => (mounted ? rawItems.filter(item => hasPermission(currentUser, item.permission)) : rawItems),
    [mounted, currentUser, rawItems]
  );

  const filteredGroups = useMemo(() => {
    if (isTechPortal || isClientPortal) return null;
    return adminNavGroups
      .map(group => ({
        ...group,
        items: mounted
          ? group.items.filter(item => hasPermission(currentUser, item.permission))
          : group.items,
      }))
      .filter(group => group.items.length > 0);
  }, [mounted, currentUser, isTechPortal, isClientPortal]);

  const isActive = (href: string) => {
    if (href.endsWith("/dashboard")) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border-main" style={{ background: "#0f0f0f" }}>
      <SidebarHeader className="border-b border-border-sub px-3 py-3">
        <div className="flex items-center gap-2 overflow-hidden group-data-[collapsible=icon]:justify-center">
          <Link href={dashboardHref} className="flex items-center gap-2.5 min-w-0">
            {logo && (
              <Image
                src={logo.imageUrl}
                alt="Aaromach"
                width={30}
                height={30}
                className="shrink-0 object-contain"
                style={{ height: "30px", width: "auto" }}
                priority
              />
            )}
            <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="font-mono text-[13px] font-bold uppercase tracking-tight text-white leading-none truncate">Aaromach</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-brand-red truncate">{portalLabel}</span>
            </div>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {filteredGroups ? (
          <div className="space-y-1">
            {filteredGroups.map((group, gi) => (
              <div key={gi}>
                {group.label && (
                  <div className={cn("px-2 pb-1", gi > 0 ? "pt-4" : "pt-1")}>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#555] group-data-[collapsible=icon]:hidden">
                      {group.label}
                    </p>
                    <div className="h-px bg-[#222] mt-1 group-data-[collapsible=icon]:hidden" />
                  </div>
                )}
                {!group.label && gi > 0 && <div className="h-2" />}
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className={cn(
                            "h-9 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors",
                            active
                              ? "!bg-brand-red/10 !text-brand-red"
                              : "text-[#888] hover:!bg-bg-tertiary hover:!text-text-primary"
                          )}
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </div>
        ) : (
          <SidebarMenu>
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={item.label}
                    className={cn(
                      "h-9 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors",
                      active
                        ? "!bg-brand-red/10 !text-brand-red"
                        : "text-[#888] hover:!bg-bg-tertiary hover:!text-text-primary"
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border-sub p-3 space-y-2">
        <div className="group-data-[collapsible=icon]:hidden">
          <PortalSwitcher />
        </div>
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="group-data-[collapsible=icon]:hidden">
            <UserNav />
          </div>
          <SidebarTrigger className="text-text-muted hover:text-text-primary shrink-0" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
