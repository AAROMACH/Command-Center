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
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  permission: Permission;
};

const adminNavItems: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "view_dashboard" },
  { href: "/admin/dispatch", label: "Dispatch", icon: Wrench, permission: "manage_assignments" },
  { href: "/admin/assignments", label: "Assignments", icon: ClipboardList, permission: "manage_assignments" },
  { href: "/admin/projects", label: "Projects", icon: Briefcase, permission: "view_projects" },
  { href: "/admin/directory", label: "Directory", icon: Users, permission: "view_directory" },
  { href: "/admin/financials", label: "Financials", icon: Banknote, permission: "view_financials" },
  { href: "/admin/reports", label: "Activity", icon: Activity, permission: "view_reports" },
  { href: "/admin/map", label: "Map", icon: MapPin, permission: "manage_assignments" },
  { href: "/admin/crm", label: "CRM", icon: Target, permission: "view_reports" },
  { href: "/admin/plans", label: "Plans", icon: BookOpen, permission: "view_reports" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart2, permission: "view_reports" },
  { href: "/admin/settings", label: "Settings", icon: Settings, permission: "view_reports" },
];

const techNavItems: NavItem[] = [
  { href: "/tech/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "view_dashboard" },
  { href: "/tech/assignments", label: "Assignments", icon: Calendar, permission: "view_assigned_work_only" },
  { href: "/tech/calendar", label: "Schedule", icon: Calendar, permission: "view_assigned_work_only" },
  { href: "/tech/projects", label: "Projects", icon: FolderKanban, permission: "view_projects" },
  { href: "/tech/logs", label: "Logs", icon: ScrollText, permission: "field_logs" },
  { href: "/tech/earnings", label: "Earnings", icon: Coins, permission: "field_logs" },
  { href: "/tech/map", label: "Map", icon: MapPin, permission: "field_logs" },
  { href: "/tech/profile", label: "Profile", icon: Users, permission: "view_assigned_work_only" },
];

const clientNavItems: NavItem[] = [
  { href: "/client/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "client_portal" },
  { href: "/client/tickets", label: "Tickets", icon: ClipboardList, permission: "client_portal" },
  { href: "/client/projects", label: "Projects", icon: Briefcase, permission: "client_portal" },
  { href: "/client/sites", label: "Sites", icon: MapPin, permission: "client_portal" },
  { href: "/client/financials", label: "Financials", icon: FileText, permission: "client_portal" },
  { href: "/client/profile", label: "Profile", icon: Users, permission: "client_portal" },
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

  const rawItems = isTechPortal ? techNavItems : isClientPortal ? clientNavItems : adminNavItems;
  const navItems = useMemo(
    () => (mounted ? rawItems.filter(item => hasPermission(currentUser, item.permission)) : rawItems),
    [mounted, currentUser, rawItems]
  );

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
      </SidebarContent>

      <SidebarFooter className="border-t border-border-sub p-3">
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
