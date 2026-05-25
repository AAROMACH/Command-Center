import { Navbar } from '@/components/navbar';
import { AlertBand } from '@/components/alert-band';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0f0f0f]">
        <Navbar />
        <AlertBand />
      </div>
      <div className="page-wrapper pt-[92px]">
        <div className="page-content">{children}</div>
      </div>
    </>
  );
}
