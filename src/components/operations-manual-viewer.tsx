'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';
import { SearchField } from '@/components/search-field';
import { cn } from '@/lib/utils';
import { MANUAL_SOURCE_URL, type ManualSection } from '@/content/operations-manual';

/**
 * Reads the Operations Manual: a list of SOPs, then the one picked. Search
 * filters by title and text. ?sop=<id> opens one directly.
 */
export function OperationsManualViewer({ sections, showSource }: { sections: ManualSection[]; showSource?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(sections[0]?.id || '');

  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('sop');
      if (id && sections.some(s => s.id === id)) setOpen(id);
    } catch { /* none */ }
  }, [sections]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sections.filter(s => words.every(w => s.title.toLowerCase().includes(w) || s.body.toLowerCase().includes(w)));
  }, [sections, q]);
  const current = sections.find(s => s.id === open) || shown[0];

  const pick = (id: string) => {
    setOpen(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('sop', id);
      window.history.replaceState(null, '', url.toString());
    } catch { /* ignore */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
        <SearchField value={q} onChange={setQ} placeholder="Search the manual" />
        <nav className="rounded-xl border border-border-sub bg-bg-secondary p-1.5 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {shown.map(s => (
            <button key={s.id} type="button" onClick={() => pick(s.id)}
              className={cn('shrink-0 rounded-lg px-3 py-2 text-left text-[13px] whitespace-nowrap lg:whitespace-normal',
                current?.id === s.id ? 'bg-brand-red/10 text-brand-red font-semibold' : 'text-text-secondary hover:bg-bg-tertiary')}>
              {s.title}
            </button>
          ))}
          {!shown.length && <p className="px-3 py-2 text-[12px] text-text-muted">Nothing matches.</p>}
        </nav>
        {showSource && (
          <a href={MANUAL_SOURCE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1 text-[12px] text-text-muted hover:text-text-primary">
            <ExternalLink size={12} /> Open the Google Doc
          </a>
        )}
      </aside>

      {current && (
        <article className="min-w-0 rounded-xl border border-border-sub bg-bg-secondary p-4 sm:p-6">
          <h2 className="text-[20px] font-bold text-text-primary mb-4">{current.title}</h2>
          <div className={cn(
            'text-[14px] leading-relaxed text-text-secondary break-words',
            '[&_h1]:text-[18px] [&_h1]:font-bold [&_h1]:text-text-primary [&_h1]:mt-6 [&_h1]:mb-2',
            '[&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-6 [&_h2]:mb-2',
            '[&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-4 [&_h3]:mb-1.5',
            '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
            '[&_strong]:text-text-primary [&_a]:text-brand-red [&_a]:underline [&_hr]:my-5 [&_hr]:border-border-sub',
            '[&_table]:w-full [&_table]:text-[12px] [&_table]:my-3 [&_th]:border [&_th]:border-border-sub [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
            '[&_td]:border [&_td]:border-border-sub [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
          )}>
            <div className="overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.body}</ReactMarkdown>
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
