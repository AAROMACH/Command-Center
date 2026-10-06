import { SidebarLayout } from '@/components/sidebar-layout';

export default function SalesPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout>{children}</SidebarLayout>;
}
