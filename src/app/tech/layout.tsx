import { Navbar } from '@/components/navbar';
import { AlertBand } from '@/components/alert-band';

export default function TechPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <div className="page-wrapper pt-[52px]">
        <AlertBand />
        <div className="page-content">{children}</div>
      </div>
    </>
  );
}
