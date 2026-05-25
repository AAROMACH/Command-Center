import { TechNavbar } from '@/components/tech-navbar';
import { AlertBand } from '@/components/alert-band';

export default function TechPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0f0f0f]">
        <TechNavbar />
        <AlertBand />
      </div>
      <div className="page-wrapper pt-[92px]">
        <div className="page-content">{children}</div>
      </div>
    </>
  );
}
