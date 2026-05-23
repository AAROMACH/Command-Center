import { Navbar } from '@/components/navbar';

export default function TechPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <div className="page-wrapper pt-[52px]">
        <div className="page-content">{children}</div>
      </div>
    </>
  );
}
