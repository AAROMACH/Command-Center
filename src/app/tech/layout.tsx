import { SidebarLayout } from '@/components/sidebar-layout';

export default function TechPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout>{children}</SidebarLayout>;
}
