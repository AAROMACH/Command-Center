"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Wrench,
  Briefcase,
  Users,
  Banknote,
  Activity,
  Coins,
  FolderKanban,
  ClipboardList,
  FileText,
  BookOpen,
  BarChart2,
  Target,
  CalendarDays,
  MessageSquare,
  Building2,
  Receipt,
  Package,
  Flag,
  Inbox,
  FileSearch,
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
      { href: "/admin/dashboard",        label: "Dashboard",        icon: LayoutDashboard, permission: "admin.dashboard.view" },
      { href: "/admin/requests",         label: "Requests",         icon: Inbox,           permission: "admin.requests.view" },
      { href: "/admin/reports",          label: "Activity",         icon: Activity,        permission: "admin.reports.view" },
      { href: "/admin/analytics",        label: "Field Intelligence", icon: BarChart2,     permission: "admin.reports.view" },
      { href: "/admin/company-planning", label: "Company Planning", icon: Flag,            permission: "admin.reports.view" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/dispatch",     label: "Dispatch Hub", icon: Wrench,      permission: "admin.dispatch.view" },
      { href: "/admin/calendar",     label: "Schedule",     icon: CalendarDays, permission: "admin.schedule.view" },
      { href: "/admin/assignments",  label: "Assignments",  icon: ClipboardList, permission: "admin.assignments.view" },
      { href: "/admin/projects",     label: "Projects",     icon: Briefcase,   permission: "admin.projects.view" },
    ],
  },
  {
    label: "Sales & Clients",
    items: [
      { href: "/admin/crm",    label: "CRM",           icon: Target,     permission: "admin.crm.view" },
      { href: "/admin/plans",  label: "Service Plans", icon: BookOpen,   permission: "admin.reports.view" },
      { href: "/admin/sites",  label: "Clients",       icon: Building2,  permission: "admin.clients.view" },
      { href: "/admin/quotes", label: "Quotes",        icon: FileSearch, permission: "admin.crm.view" },
    ],
  },
  {
    label: "People & Communication",
    items: [
      { href: "/admin/directory", label: "Directory", icon: Users,         permission: "admin.directory.view" },
      { href: "/admin/messaging", label: "Messages",  icon: MessageSquare, permission: "admin.messages.view" },
    ],
  },
  {
    label: "Financials & Assets",
    items: [
      { href: "/admin/financials", label: "Financials", icon: Banknote, permission: "admin.financials.view" },
      { href: "/admin/assets",     label: "Assets",     icon: Package,  permission: "admin.assignments.view" },
    ],
  },
];

const techNavGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/tech/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "tech.dashboard.view" },
      { href: "/tech/activity",  label: "Activity",  icon: Activity,        permission: "tech.dashboard.view" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/tech/calendar",    label: "Schedule",    icon: CalendarDays,  permission: "tech.schedule.view" },
      { href: "/tech/assignments", label: "Assignments", icon: ClipboardList, permission: "tech.assignments.view" },
      { href: "/tech/projects",    label: "Projects",    icon: FolderKanban,  permission: "tech.projects.view" },
      { href: "/tech/logs",        label: "Logs",        icon: FileText,      permission: "tech.logs.view" },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/tech/messaging", label: "Messages", icon: MessageSquare, permission: "tech.messages.view" },
    ],
  },
  {
    label: "Financials",
    items: [
      { href: "/tech/earnings", label: "Earnings", icon: Coins, permission: "tech.earnings.view" },
    ],
  },
];

const clientNavGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/client/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "client.dashboard.view" },
      { href: "/client/tickets",   label: "Requests",  icon: Inbox,           permission: "client.tickets.view" },
    ],
  },
  {
    label: "Sales & Clients",
    items: [
      { href: "/client/sites",   label: "Clients", icon: Building2, permission: "client.sites.view" },
      { href: "/client/quotes",  label: "Quotes",  icon: Receipt,   permission: "client.quotes.view" },
    ],
  },
  {
    label: "Projects",
    items: [
      { href: "/client/projects", label: "Projects", icon: Briefcase, permission: "client.projects.view" },
    ],
  },
  {
    label: "People & Communication",
    items: [
      { href: "/client/messaging", label: "Messages", icon: MessageSquare, permission: "client.messages.view" },
    ],
  },
  {
    label: "Financials & Assets",
    items: [
      { href: "/client/financials", label: "Financials", icon: FileText, permission: "client.financials.view" },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<Technician | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [newAssignments, setNewAssignments] = useState(0);
  const logo = PlaceHolderImages.find(img => img.id === "app-logo");

  useEffect(() => {
    setMounted(true);
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setFirebaseUid(fbUser.uid);
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
        setFirebaseUid(null);
        const storedId = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("currentUserId") : null;
        if (storedId) {
          const registryUser = fallbackTechs.find(t => t.id === storedId);
          setCurrentUser(registryUser);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  // Unread DM badge
  useEffect(() => {
    if (!firebaseUid) return;
    const q = query(collection(db, "messages"), where("receiverId", "==", firebaseUid));
    return onSnapshot(q, (snap) => {
      const count = snap.docs.filter(d => {
        const rb = (d.data().readBy || []) as string[];
        return !rb.includes(firebaseUid);
      }).length;
      setUnreadMessages(count);
    });
  }, [firebaseUid]);

  // New assignment badge for techs
  useEffect(() => {
    if (!firebaseUid) return;
    const key = `lastAssignmentSeen_${firebaseUid}`;
    const lastSeen = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (!lastSeen) return;
    const q = query(collection(db, "assignments"), where("techId", "==", firebaseUid));
    return onSnapshot(q, (snap) => {
      const count = snap.docs.filter(d => {
        const data = d.data();
        const updated = data.updatedAt || data.createdAt || "";
        return updated > lastSeen;
      }).length;
      setNewAssignments(count);
    });
  }, [firebaseUid]);

  const isTechPortal = pathname.startsWith("/tech");
  const isClientPortal = pathname.startsWith("/client");
  const portalLabel = isTechPortal ? "Field Terminal" : isClientPortal ? "Client Portal" : "Command Center";
  const dashboardHref = isTechPortal ? "/tech/dashboard" : isClientPortal ? "/client/dashboard" : "/admin/dashboard";

  const activeNavGroups = isTechPortal ? techNavGroups : isClientPortal ? clientNavGroups : adminNavGroups;

  const filteredGroups = useMemo(() => {
    return activeNavGroups
      .map(group => ({
        ...group,
        items: mounted
          ? group.items.filter(item => hasPermission(currentUser, item.permission))
          : group.items,
      }))
      .filter(group => group.items.length > 0);
  }, [mounted, currentUser, activeNavGroups]);

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
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const isMessages = item.href.endsWith("/messaging");
                  const isAssignments = item.href.endsWith("/assignments");
                  const badge = isMessages && unreadMessages > 0
                    ? unreadMessages
                    : isAssignments && newAssignments > 0
                    ? newAssignments
                    : 0;
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
                          <span className="flex-1">{item.label}</span>
                          {badge > 0 && (
                            <span className="ml-auto text-[8px] font-black bg-brand-red text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 group-data-[collapsible=icon]:hidden">
                              {badge > 99 ? "99+" : badge}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </div>
          ))}
        </div>
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
