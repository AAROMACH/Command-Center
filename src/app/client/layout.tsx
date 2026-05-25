import { Navbar } from '@/components/navbar';
import { AlertBand } from '@/components/alert-band';

/**
 * @fileOverview Client Portal Core Layout.
 * Enforces a high-priority fixed header registry to prevent navigation disappearing.
 */
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0f0f0f] border-b border-border-main shadow-xl">
        <Navbar />
        <AlertBand />
      </div>
      <div className="page-wrapper pt-[92px]">
        <div className="page-content">{children}</div>
      </div>
    </>
  );
}
