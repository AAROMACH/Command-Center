'use client';

import { useRef, useState } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { makeLeadId } from '@/lib/doc-ids';
import { parseCsv, rowsToLeads, groupLeadsByCompany, extractLeadFromPdfText, type ExtractedLead } from '@/lib/lead-import';
import { companyKey, findCompany, findContact, resolveLeadAccount, saveContact } from '@/lib/crm-accounts';
import { SOURCES, findDuplicates } from '@/lib/crm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CrmCompany, CrmContact, Lead, LeadAttachment } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Upload, FileText, FileSpreadsheet, Loader2, X, CheckCircle2, AlertTriangle,
} from 'lucide-react';

type Candidate = ExtractedLead & { include: boolean; duplicateOf?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  currentUserName?: string;
  /** Existing CRM data — used to flag companies already in the pipeline and to link accounts. */
  leads?: Lead[];
  companies?: CrmCompany[];
  contacts?: CrmContact[];
};

async function extractPdfFirstPageText(file: File): Promise<string> {
  // Loaded on demand so pdfjs stays out of the main CRM bundle
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  try {
    const pdf = await loadingTask.promise;
    // The lead info is on the first page in practice; later pages are
    // preserved via the attached original file.
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    let text = '';
    let lastY: number | null = null;
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue;
      const y = Array.isArray(item.transform) ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) text += '\n';
      else if (text && !text.endsWith('\n')) text += ' ';
      text += item.str;
      if (y !== null) lastY = y;
    }
    return text;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

async function extractXlsxRows(file: File): Promise<(string | number | null)[][]> {
  const XLSX = await import('xlsx');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: '' });
}

function fileKindIcon(name: string) {
  return /\.(csv|xlsx?|xls)$/i.test(name) ? FileSpreadsheet : FileText;
}

export function ImportLeadsDialog({ open, onClose, currentUserId, currentUserName, leads = [], companies = [], contacts = [] }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [source, setSource] = useState<Lead['source']>('other');

  const reset = () => {
    setFiles([]); setCandidates([]); setParseErrors([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => { if (!importing) { reset(); onClose(); } };

  async function handleFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    setParsing(true);
    const newFiles: File[] = [];
    const newCandidates: Candidate[] = [];
    const errors: string[] = [];

    for (const file of Array.from(selected)) {
      try {
        const name = file.name;
        if (/\.pdf$/i.test(name)) {
          const text = await extractPdfFirstPageText(file);
          newCandidates.push({ ...extractLeadFromPdfText(text, name), include: true });
        } else if (/\.csv$/i.test(name)) {
          const text = await file.text();
          const leads = rowsToLeads(parseCsv(text), name);
          if (leads.length === 0) errors.push(`${name}: no lead rows found (needs a header row + data rows)`);
          leads.forEach(l => newCandidates.push({ ...l, include: true }));
        } else if (/\.(xlsx?|xls)$/i.test(name)) {
          const rows = await extractXlsxRows(file);
          const leads = rowsToLeads(rows, name);
          if (leads.length === 0) errors.push(`${name}: no lead rows found (needs a header row + data rows)`);
          leads.forEach(l => newCandidates.push({ ...l, include: true }));
        } else {
          errors.push(`${name}: unsupported type (PDF, CSV, or Excel only)`);
          continue;
        }
        newFiles.push(file);
      } catch (e: any) {
        errors.push(`${file.name}: ${e?.message || 'failed to parse'}`);
      }
    }

    setFiles(prev => [...prev, ...newFiles]);
    // One deal per company: Apollo-style exports have a row per person.
    setCandidates(prev => {
      const merged = groupLeadsByCompany([...prev, ...newCandidates], companyKey).map(c => ({ ...c, include: true } as Candidate));
      return merged.map(c => {
        const prior = prev.find(p => companyKey(p.companyName) === companyKey(c.companyName));
        const dup = findDuplicates(leads, c)[0];
        return {
          ...c,
          duplicateOf: dup ? dup.companyName : undefined,
          // Already in the pipeline → off by default; keep earlier manual choices.
          include: prior ? prior.include : !dup,
        };
      });
    });
    setParseErrors(prev => [...prev, ...errors]);
    setParsing(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleImport() {
    const included = candidates.filter(c => c.include);
    if (included.length === 0) return;
    setImporting(true);
    try {
      // Upload each original file once; every lead extracted from it links back.
      const uploadsByName = new Map<string, LeadAttachment>();
      for (const file of files) {
        if (!included.some(c => c.sourceFile === file.name)) continue;
        const path = `leadImports/${Date.now()}-${file.name}`;
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, file, { contentType: file.type || undefined });
        const url = await getDownloadURL(sRef);
        uploadsByName.set(file.name, {
          fileName: file.name,
          downloadUrl: url,
          storagePath: path,
          contentType: file.type || undefined,
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString(),
        });
      }

      const now = new Date().toISOString();
      // Local copies so companies/contacts created earlier in this batch are reused.
      const knownCompanies = [...companies];
      const knownContacts = [...contacts];
      let contactCount = 0;
      for (const c of included) {
        const id = await makeLeadId();
        const attachment = uploadsByName.get(c.sourceFile);
        const companyName = c.companyName || c.sourceFile;

        // Attach to an account (found or created) with every person from the file.
        let account: { companyId?: string; contactId?: string } = {};
        try {
          account = await resolveLeadAccount(
            { companyName, contactName: c.contactName, contactTitle: c.contactTitle, contactEmail: c.contactEmail, contactPhone: c.contactPhone, industry: c.industry, website: c.website, address: c.address },
            knownCompanies, knownContacts, { id: currentUserId, name: currentUserName },
          );
          if (!knownCompanies.some(k => k.id === account.companyId)) {
            knownCompanies.push({ id: account.companyId!, name: companyName, createdAt: now, updatedAt: now });
          }
          if (account.contactId) {
            contactCount++;
            if (!knownContacts.some(k => k.id === account.contactId)) {
              knownContacts.push({ id: account.contactId, companyId: account.companyId!, name: c.contactName, email: c.contactEmail, createdAt: now, updatedAt: now });
            }
          }
          for (const p of c.otherContacts) {
            if (findContact(knownContacts, account.companyId!, p)) continue;
            const cid = await saveContact({ companyId: account.companyId!, name: p.name, title: p.title, email: p.email, phone: p.phone });
            knownContacts.push({ id: cid, companyId: account.companyId!, name: p.name, email: p.email, createdAt: now, updatedAt: now });
            contactCount++;
          }
        } catch {
          // Account linking is additive — the lead still imports without it.
        }

        const lead: Lead = {
          id,
          companyName,
          contactName: c.contactName,
          contactEmail: c.contactEmail,
          contactPhone: c.contactPhone,
          contactTitle: c.contactTitle,
          website: c.website,
          address: c.address,
          industry: c.industry,
          source,
          stage: 'new',
          estimatedValue: c.estimatedValue,
          assignedTo: currentUserId,
          assignedToName: currentUserName || '',
          notes: c.notes,
          tags: ['imported'],
          createdAt: now,
          updatedAt: now,
          stageChangedAt: now,
          importedFrom: c.sourceFile,
          attachments: attachment ? [attachment] : [],
          ...(account.companyId ? { companyId: account.companyId } : {}),
          ...(account.contactId ? { contactId: account.contactId } : {}),
        };
        await addDoc(collection(db, 'leads'), { ...lead });
      }

      toast({ title: 'Leads imported', description: `${included.length} deal${included.length !== 1 ? 's' : ''} added to New · ${contactCount} contact${contactCount !== 1 ? 's' : ''} saved to Accounts.` });
      reset();
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Import failed', description: e?.message || 'Could not complete the import.' });
    } finally {
      setImporting(false);
    }
  }

  const includedCount = candidates.filter(c => c.include).length;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="bg-bg-elevated border-border-main sm:max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border-sub">
          <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
            <Upload size={14} className="text-brand-red" /> Import Leads
          </DialogTitle>
          <DialogDescription className="text-[10px] uppercase font-bold text-text-muted">
            PDF (first page), CSV or Excel — including Apollo exports. One deal per company; every person is saved to the account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-4">
          {/* File picker */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={parsing || importing}
            className="w-full rounded-xl border-2 border-dashed border-border-main hover:border-brand-red/50 transition-colors p-6 text-center"
          >
            {parsing ? (
              <span className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                <Loader2 size={14} className="animate-spin" /> Extracting…
              </span>
            ) : (
              <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                Click to select files <span className="text-text-primary">·</span> .pdf .csv .xlsx
              </span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.csv,.xlsx,.xls"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />

          {/* Source files */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map(f => {
                const Icon = fileKindIcon(f.name);
                return (
                  <span key={f.name} className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border-sub bg-bg-secondary text-[10px] font-bold text-text-secondary">
                    <Icon size={11} className="text-brand-red" />{f.name}
                  </span>
                );
              })}
            </div>
          )}

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-1">
              {parseErrors.map((err, i) => (
                <p key={i} className="text-[10px] text-amber-400 flex items-start gap-1.5">
                  <AlertTriangle size={11} className="shrink-0 mt-0.5" />{err}
                </p>
              ))}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Lead Source</span>
              <Select value={source} onValueChange={v => setSource(v as Lead['source'])}>
                <SelectTrigger className="h-8 w-[180px] text-xs bg-bg-tertiary border-border-main"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {SOURCES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Extracted candidates */}
          {candidates.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-2">
                Extracted Leads ({includedCount} of {candidates.length} selected)
              </p>
              <ScrollArea className="flex-1 rounded-lg border border-border-sub">
                <div className="divide-y divide-border-sub">
                  {candidates.map((c, i) => (
                    <div key={i} className={cn('flex items-start gap-3 p-3 transition-opacity', !c.include && 'opacity-40')}>
                      <button
                        type="button"
                        onClick={() => setCandidates(prev => prev.map((p, pi) => pi === i ? { ...p, include: !p.include } : p))}
                        className={cn('mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                          c.include ? 'bg-brand-red border-brand-red' : 'border-border-main bg-bg-primary')}
                        aria-label={c.include ? 'Exclude lead' : 'Include lead'}
                      >
                        {c.include && <CheckCircle2 size={10} className="text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-text-primary truncate flex items-center gap-2">
                          {c.companyName || '(no company)'}
                          {c.duplicateOf && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-amber-400 border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0">Already in CRM</span>
                          )}
                          {findCompany(companies, c.companyName) && !c.duplicateOf && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-text-green border border-text-green/30 bg-text-green/10 px-1.5 py-0.5 rounded shrink-0">Existing account</span>
                          )}
                        </p>
                        <p className="text-[10px] text-text-muted truncate">
                          {[[c.contactName, c.contactTitle].filter(Boolean).join(', '), c.contactEmail, c.contactPhone].filter(Boolean).join(' · ') || 'No contact details extracted'}
                        </p>
                        {(c.industry || c.address) && (
                          <p className="text-[10px] text-text-muted truncate">{[c.industry, c.address].filter(Boolean).join(' · ')}</p>
                        )}
                        {c.otherContacts.length > 0 && (
                          <p className="text-[10px] text-text-secondary truncate">
                            +{c.otherContacts.length} more: {c.otherContacts.map(o => [o.name, o.title].filter(Boolean).join(' – ')).join('; ')}
                          </p>
                        )}
                        {c.estimatedValue > 0 && <p className="text-[10px] text-text-green font-mono">${c.estimatedValue.toLocaleString()}</p>}
                        <p className="text-[8px] text-text-muted uppercase tracking-widest mt-0.5">{c.sourceFile}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCandidates(prev => prev.filter((_, pi) => pi !== i))}
                        className="text-text-muted hover:text-text-red transition-colors shrink-0"
                        aria-label="Remove lead"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 pt-4 border-t border-border-sub gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={importing} className="text-[10px] font-black uppercase">Cancel</Button>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={importing || includedCount === 0}
            className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase"
          >
            {importing ? <><Loader2 size={12} className="mr-1.5 animate-spin" />Importing…</> : `Import ${includedCount} Lead${includedCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
