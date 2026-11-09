import Link from 'next/link';

/** Shared shell for the public legal pages (/public/privacy, /public/terms). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14 text-left">
      <p className="text-[12px] font-semibold text-brand-red">AAROMACH</p>
      <h1 className="mt-1 text-2xl font-bold text-text-primary">{title}</h1>
      <p className="mt-1 text-[12px] text-text-muted">Last updated {updated}</p>
      <div className="mt-8 space-y-6 text-[14px] leading-relaxed text-text-secondary [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-brand-red [&_a]:underline">
        {children}
      </div>
      <p className="mt-12 border-t border-border-sub pt-4 text-[12px] text-text-muted">
        <Link href="/public/terms">Terms of Service</Link> · <Link href="/public/privacy">Privacy Policy</Link> · AAROMACH · support@aaromach.com · (313) 241-0588
      </p>
    </main>
  );
}
