'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Download, ExternalLink, Pencil, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { downloadSectionAsWord, printSection } from '@/lib/manual-export';
import { auth } from '@/lib/firebase';
import { SearchField } from '@/components/search-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MANUAL_SOURCE_URL, type ManualSection } from '@/content/operations-manual';
import { useHandbookSync, type HandbookSection } from '@/lib/use-handbook';
import { GlossaryTip, rehypeGlossary } from '@/components/glossary-terms';

const MD = cn(
  'text-[14px] leading-relaxed text-text-secondary break-words',
  '[&_h1]:text-[18px] [&_h1]:font-bold [&_h1]:text-text-primary [&_h1]:mt-6 [&_h1]:mb-2',
  '[&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-6 [&_h2]:mb-2',
  '[&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-4 [&_h3]:mb-1.5',
  '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_strong]:text-text-primary [&_a]:text-brand-red [&_a]:underline [&_hr]:my-5 [&_hr]:border-border-sub',
  '[&_table]:w-full [&_table]:text-[12px] [&_table]:my-3 [&_th]:border [&_th]:border-border-sub [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
  '[&_td]:border [&_td]:border-border-sub [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
);
const AUD: { v: ManualSection['audience']; label: string }[] = [
  { v: 'tech', label: 'All technicians' }, { v: 'pm', label: 'Project Managers' }, { v: 'office', label: 'Office only' },
];

/**
 * Reads the Operations Manual: a list of sections, then the one picked.
 * Search filters by title and text; ?sop=<id> opens one. With `editable`
 * (Super Admins) sections can be edited, added and removed — each save also
 * re-publishes the Google Doc.
 */
export function OperationsManualViewer({ sections, showSource, editable }: { sections: HandbookSection[]; showSource?: boolean; editable?: boolean }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(sections[0]?.id || '');
  const [draft, setDraft] = useState<(Partial<HandbookSection> & { isNew?: boolean }) | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const sync = useHandbookSync(!!editable);

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

  const call = async (method: 'POST' | 'DELETE' | 'PUT', body?: unknown, qs = '') => {
    const t = await auth.currentUser?.getIdToken();
    const r = await fetch(`/api/handbook${qs}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
    return d as { section?: HandbookSection; doc?: { ok: boolean; error?: string } };
  };
  const docToast = (d?: { ok: boolean; error?: string }) => d && !d.ok
    ? toast({ variant: 'destructive', title: 'Saved in the app — Google Doc not updated', description: d.error })
    : toast({ title: 'Saved', description: 'The Google Doc was updated too.' });

  const save = async () => {
    if (!draft?.title?.trim()) return;
    setBusy(true);
    try {
      const d = await call('POST', { id: draft.isNew ? undefined : draft.id, title: draft.title, audience: draft.audience || 'office', body: draft.body || '', order: draft.order });
      if (d.section) setOpen(d.section.id);
      setDraft(null);
      docToast(d.doc);
    } catch (e) { toast({ variant: 'destructive', title: 'Couldn’t save', description: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!draft?.id || draft.isNew || !confirm(`Delete “${draft.title}” from the manual? It’s also removed from the Google Doc.`)) return;
    setBusy(true);
    try { const d = await call('DELETE', undefined, `?id=${encodeURIComponent(draft.id)}`); setDraft(null); setOpen(sections[0]?.id || ''); docToast(d.doc); }
    catch (e) { toast({ variant: 'destructive', title: 'Couldn’t delete', description: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true);
    try { docToast((await call('PUT')).doc); }
    catch (e) { toast({ variant: 'destructive', title: 'Couldn’t publish', description: (e as Error).message }); }
    finally { setBusy(false); }
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
        {editable && (
          <div className="flex flex-wrap gap-2 px-1">
            <Button size="sm" variant="outline" className="h-8" disabled={busy}
              onClick={() => { setPreview(false); setDraft({ isNew: true, title: '', audience: 'office', body: '', order: sections.length }); }}>
              <Plus size={13} className="mr-1" /> New section
            </Button>
            <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={publish}>
              <RefreshCw size={13} className={cn('mr-1', busy && 'animate-spin')} /> Publish to Google Doc
            </Button>
          </div>
        )}
        {showSource && (
          <a href={MANUAL_SOURCE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1 text-[12px] text-text-muted hover:text-text-primary">
            <ExternalLink size={12} /> Open the Google Doc
          </a>
        )}
        {editable && sync && (
          <p className={cn('px-1 text-[11px] break-words', sync.ok ? 'text-text-muted' : 'text-brand-red')}>
            {sync.ok ? `Google Doc updated ${new Date(sync.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : `Google Doc not updated: ${sync.error}`}
          </p>
        )}
      </aside>

      {current && (
        <article className="min-w-0 rounded-xl border border-border-sub bg-bg-secondary p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-[20px] font-bold text-text-primary">{current.title}</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => downloadSectionAsWord(current.title, current.body)}
                title="Download as a Word document — opens in Word or Google Docs to fill in or edit">
                <Download size={13} className="mr-1" /> Download (Word)
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => printSection(current.title, current.body)} title="Print or save as PDF">
                <Printer size={13} className="mr-1" /> Print
              </Button>
              {editable && (
                <Button size="sm" variant="outline" className="h-8" onClick={() => { setPreview(false); setDraft({ ...current }); }}>
                  <Pencil size={13} className="mr-1" /> Edit
                </Button>
              )}
            </div>
          </div>
          <div className={cn(MD, 'overflow-x-auto')}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={current.id === 'glossary' ? [] : [rehypeGlossary]}
              components={{
                abbr: ({ children, ...p }) => {
                  const word = String((p as Record<string, unknown>)['data-term'] ?? (p as Record<string, unknown>).dataTerm ?? '');
                  return word ? <GlossaryTip word={word} onOpenSection={id => sections.some(x => x.id === id) && pick(id)}>{children}</GlossaryTip> : <abbr>{children}</abbr>;
                },
              }}>{current.body}</ReactMarkdown>
          </div>
          {current.updatedAt && current.updatedBy !== 'import' && (
            <p className="mt-6 text-[11px] text-text-muted">Last edited {new Date(current.updatedAt).toLocaleDateString()} by {current.updatedBy}</p>
          )}
        </article>
      )}

      <Dialog open={!!draft} onOpenChange={v => !v && !busy && setDraft(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[92svh] overflow-y-auto">
          <DialogHeader className="text-left"><DialogTitle>{draft?.isNew ? 'New section' : `Edit ${draft?.title || ''}`}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-text-primary">Title</span>
                <Input value={draft.title || ''} onChange={e => setDraft({ ...draft, title: e.target.value })} className="h-10" />
              </label>
              <div className="space-y-1">
                <span className="block text-[12px] font-medium text-text-primary">Who sees it</span>
                <div className="flex flex-wrap gap-2">
                  {AUD.map(a => (
                    <button key={a.v} type="button" onClick={() => setDraft({ ...draft, audience: a.v })}
                      className={cn('h-8 px-3 rounded-full border text-[12px]', draft.audience === a.v ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>
                      {a.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-text-muted">Technicians see “All technicians” sections under SOP; PMs also see “Project Managers”. Everything shows here in Company planning.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPreview(false)} className={cn('tab', !preview && 'active')}>Write</button>
                <button type="button" onClick={() => setPreview(true)} className={cn('tab', preview && 'active')}>Preview</button>
              </div>
              {preview ? (
                <div className={cn(MD, 'rounded-lg border border-border-sub p-4 overflow-x-auto max-h-[55svh] overflow-y-auto')}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{draft.body || ''}</ReactMarkdown>
                </div>
              ) : (
                <>
                  <Textarea value={draft.body || ''} onChange={e => setDraft({ ...draft, body: e.target.value })} className="min-h-[50svh] font-mono text-[13px]" />
                  <p className="text-[11px] text-text-muted">Formatting: ## Heading, ### Subheading, **bold**, - bullet, 1. numbered, | tables |.</p>
                </>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {draft && !draft.isNew ? (
              <Button variant="outline" className="text-brand-red" disabled={busy} onClick={remove}><Trash2 size={13} className="mr-1" /> Delete</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button>
              <Button disabled={busy || !draft?.title?.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
