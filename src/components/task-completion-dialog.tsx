"use client";

import { useEffect, useRef, useState } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Camera, FileUp, Loader2, Eraser, FileText, Hash, ListTodo, Signature, Plus, X, CheckCircle2 } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { storage, db, auth } from '@/lib/firebase';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import type { Task, ProjectDocument } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/** True when a task needs something filled in before it can be checked off. */
export function taskHasRequirements(task: Partial<Task>): boolean {
  return !!(task.requiresPhoto || task.requiresText || task.requiresNumeric || task.requiresDropdown
    || task.requiresSignature || task.requiresFileUpload || task.requiresOther);
}

/** Small icons for what a task requires; filled-in ones link to the upload or show the value. */
export function TaskRequirementIcons({ task }: { task: Partial<Task> }) {
  const items: { on?: boolean; Icon: typeof Camera; label: string; value?: string; href?: string }[] = [
    { on: task.requiresPhoto, Icon: Camera, label: 'Photo', href: task.photos?.[0]?.url || task.photoUrl },
    { on: task.requiresText, Icon: FileText, label: 'Notes', value: task.textValue },
    { on: task.requiresNumeric, Icon: Hash, label: 'Count', value: task.numericValue != null ? String(task.numericValue) : undefined },
    { on: task.requiresDropdown, Icon: ListTodo, label: 'Selection', value: task.dropdownValue },
    { on: task.requiresSignature, Icon: Signature, label: 'Signature', href: task.signatureUrl },
    { on: task.requiresFileUpload, Icon: FileUp, label: 'Document', href: task.files?.[0]?.url || task.fileUrl },
    { on: task.requiresOther, Icon: Plus, label: task.otherRequirementLabel || 'Other', value: task.otherValue },
  ];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {items.filter(i => i.on).map(({ Icon, label, value, href }) => {
        const title = value ? `${label}: ${value}` : href ? `${label} (open)` : `${label} required`;
        const icon = <Icon size={13} className={href || value ? 'text-text-green' : 'text-text-muted'} />;
        return href
          ? <a key={label} href={href} target="_blank" rel="noreferrer" title={title} aria-label={title} onClick={e => e.stopPropagation()}>{icon}</a>
          : <span key={label} title={title} aria-label={title}>{icon}</span>;
      })}
    </span>
  );
}

/**
 * What was filled in when the task was completed, shown under the task: when
 * and by whom, the answers, photo thumbnails, documents and the signature.
 */
export function TaskAnswers({ task, nameOf }: { task: Partial<Task>; nameOf?: (id: string) => string }) {
  if (!task.isCompleted) return null;
  const photos = task.photos?.length ? task.photos : task.photoUrl ? [{ url: task.photoUrl, name: 'Photo' }] : [];
  const files = task.files?.length ? task.files : task.fileUrl ? [{ url: task.fileUrl, name: 'Document' }] : [];
  const answers: [string, string][] = [];
  if (task.requiresText && task.textValue) answers.push(['Notes', task.textValue]);
  if (task.requiresNumeric && task.numericValue != null) answers.push(['Count', String(task.numericValue)]);
  if (task.requiresDropdown && task.dropdownValue) answers.push(['Selection', task.dropdownValue]);
  if (task.requiresOther && task.otherValue) answers.push([task.otherRequirementLabel || 'Details', task.otherValue]);
  let when = '';
  try { if (task.completedAt) when = format(new Date(task.completedAt), 'MMM d, yyyy · h:mm a'); } catch { /* bad date */ }
  const who = task.completedBy ? (nameOf?.(task.completedBy) || '') : '';
  return (
    <div className="mt-1.5 space-y-1.5 text-left" onClick={e => e.stopPropagation()}>
      {(when || who) && (
        <p className="flex items-center gap-1 text-[11px] text-text-muted">
          <CheckCircle2 size={11} className="text-text-green shrink-0" />
          Completed{when && ` ${when}`}{who && ` · ${who}`}
        </p>
      )}
      {answers.map(([k, v]) => (
        <p key={k} className="text-[12px] text-text-secondary break-words"><span className="font-semibold text-text-primary">{k}:</span> {v}</p>
      ))}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {photos.map(p => (
            <a key={p.url} href={p.url} target="_blank" rel="noreferrer" title={p.name} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} className="h-14 w-14 rounded-md border border-border-sub object-cover" />
            </a>
          ))}
        </div>
      )}
      {files.map(f => (
        <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-brand-red hover:underline">
          <FileUp size={12} /> {f.name}
        </a>
      ))}
      {task.signatureUrl && (
        <a href={task.signatureUrl} target="_blank" rel="noreferrer" className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={task.signatureUrl} alt="Signature" className="h-10 rounded border border-border-sub bg-white px-1" />
        </a>
      )}
    </div>
  );
}

/** Files picked in the dialog, each with the name the tech gives it. */
type Picked = { file: File; name: string; preview?: string };
const baseName = (n: string) => n.replace(/\.[^.]+$/, '');

/** Pick several photos or documents and name each one before upload. */
function NamedFilePicker({ items, setItems, accept, capture, icon: Icon, emptyLabel, addLabel }: {
  items: Picked[]; setItems: (f: (prev: Picked[]) => Picked[]) => void;
  accept?: string; capture?: boolean; icon: typeof Camera; emptyLabel: string; addLabel: string;
}) {
  const add = (list: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list).map(file => ({ file, name: baseName(file.name), preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined }));
    setItems(prev => [...prev, ...next]);
  };
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          {it.preview
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={it.preview} alt="" className="h-11 w-11 shrink-0 rounded-md border border-border-sub object-cover" />
            : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border-sub bg-bg-tertiary"><Icon size={16} className="text-text-muted" /></div>}
          <Input value={it.name} onChange={e => setItems(prev => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))} placeholder="Name" aria-label="Name" className="h-11" />
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Remove" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}><X size={16} /></Button>
        </div>
      ))}
      <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-main text-[13px] text-text-secondary hover:bg-bg-tertiary">
        <Icon size={16} /> {items.length ? addLabel : emptyLabel}
        <input type="file" multiple accept={accept} {...(capture ? { capture: 'environment' as const } : {})} className="sr-only" onChange={e => { add(e.target.files); e.target.value = ''; }} />
      </label>
    </div>
  );
}

/** A typed signature, drawn in a handwriting-style font onto a PNG. */
async function typedSignatureBlob(text: string): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 220;
  const ctx = c.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#111'; ctx.textBaseline = 'middle';
  let size = 110;
  const font = (px: number) => `italic ${px}px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive`;
  ctx.font = font(size);
  while (ctx.measureText(text).width > c.width - 60 && size > 30) { size -= 6; ctx.font = font(size); }
  ctx.fillText(text, 30, c.height / 2);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

/**
 * Uploads a completion file and lists it in the project's Documents, under
 * the task's phase (label "Completion Evidence", same as the admin tab uses).
 */
async function upload(projectId: string, phaseId: string | undefined, task: Task, kind: string, blob: Blob, name: string, displayName?: string): Promise<string> {
  const safe = name.replace(/[^\w.-]+/g, '_').slice(-80);
  const r = storageRef(storage, `projectDocuments/${projectId}/task-${task.id}-${kind}-${Date.now()}-${safe}`);
  await uploadBytes(r, blob, { contentType: blob.type || undefined });
  const url = await getDownloadURL(r);
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const type: ProjectDocument['type'] = ext === 'pdf' ? 'pdf' : blob.type.startsWith('image/') ? 'img'
    : ['doc', 'docx', 'txt'].includes(ext) ? 'doc' : ext === 'csv' ? 'csv' : 'other';
  const label = kind === 'signature' ? 'Signature' : kind === 'photo' ? 'Photo' : 'Document';
  const id = await createDocId(ID_PREFIXES.PROJECT_DOCUMENT);
  await setDoc(doc(db, 'projectDocuments', id), {
    id, projectId, url, type,
    name: `${task.name} — ${displayName?.trim() || label}`,
    originalName: name,
    label: 'Completion Evidence',
    uploader: auth.currentUser?.displayName || auth.currentUser?.email || 'Team member',
    uploadDate: format(new Date(), 'MM-dd-yyyy'),
    size: `${(blob.size / (1024 * 1024)).toFixed(1)} MB`,
    taskId: task.id,
    ...(phaseId ? { phaseId } : {}),
  });
  return url;
}

/** Finger / mouse signature pad. Calls onChange with whether anything is drawn. */
function SignaturePad({ canvasRef, onChange }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; onChange: (drawn: boolean) => void }) {
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  }, [canvasRef]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const clear = () => {
    const c = canvasRef.current; const ctx = c?.getContext('2d');
    if (c && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); }
    onChange(false);
  };

  return (
    <div className="space-y-1.5">
      <canvas
        ref={canvasRef}
        className="h-36 w-full touch-none rounded-lg border border-border-main bg-white"
        onPointerDown={e => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const ctx = e.currentTarget.getContext('2d'); const p = point(e); ctx?.beginPath(); ctx?.moveTo(p.x, p.y); }}
        onPointerMove={e => { if (!drawing.current) return; const ctx = e.currentTarget.getContext('2d'); const p = point(e); ctx?.lineTo(p.x, p.y); ctx?.stroke(); onChange(true); }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerLeave={() => { drawing.current = false; }}
      />
      <Button type="button" variant="ghost" size="sm" onClick={clear}><Eraser size={14} className="mr-1.5" /> Clear</Button>
    </div>
  );
}

/**
 * Collects whatever a task requires (photo, notes, count, selection,
 * signature, document, custom field), uploads files to the project's storage
 * folder, then hands back the fields to save with isCompleted: true.
 */
export function TaskCompletionDialog({ task, projectId, phaseId, open, onOpenChange, onComplete }: {
  task: Task | null;
  projectId: string;
  /** Phase the task sits in — its files are filed under that phase in Documents. */
  phaseId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (patch: Partial<Task>) => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [files, setFiles] = useState<Picked[]>([]);
  const [sigMode, setSigMode] = useState<'draw' | 'type'>('draw');
  const [typedSig, setTypedSig] = useState('');
  const [text, setText] = useState('');
  const [count, setCount] = useState('');
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const sigRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open || !task) return;
    setPhotos([]); setFiles([]); setSigned(false); setSigMode('draw'); setTypedSig('');
    setText(task.textValue || ''); setCount(task.numericValue != null ? String(task.numericValue) : '');
    setChoice(task.dropdownValue || ''); setOther(task.otherValue || '');
  }, [open, task]);

  if (!task) return null;
  const options = (task.dropdownOptions || []).map(o => o.trim()).filter(Boolean);

  // What's still missing, counting what's already saved on the task.
  const missing = [
    task.requiresPhoto && !photos.length && !task.photoUrl && !task.photos?.length && 'a photo',
    task.requiresText && !text.trim() && 'notes',
    task.requiresNumeric && (count.trim() === '' || isNaN(Number(count))) && 'a count',
    task.requiresDropdown && !choice && 'a selection',
    task.requiresSignature && !(sigMode === 'draw' ? signed : typedSig.trim()) && !task.signatureUrl && 'a signature',
    task.requiresFileUpload && !files.length && !task.fileUrl && !task.files?.length && 'a document',
    task.requiresOther && !other.trim() && (task.otherRequirementLabel || 'the custom field').toLowerCase(),
  ].filter(Boolean) as string[];

  const submit = async () => {
    if (missing.length) {
      toast({ variant: 'destructive', title: 'Still needed', description: `Add ${missing.join(', ')} to complete this task.` });
      return;
    }
    setSaving(true);
    try {
      const patch: Partial<Task> = { isCompleted: true };
      const sendAll = (kind: string, list: Picked[]) => Promise.all(list.map(async (it, i) => ({
        name: it.name.trim() || `${kind === 'photo' ? 'Photo' : 'Document'} ${i + 1}`,
        url: await upload(projectId, phaseId, task, kind, it.file, it.file.name, it.name),
      })));
      if (task.requiresPhoto && photos.length) {
        patch.photos = [...(task.photos || []), ...await sendAll('photo', photos)];
        patch.photoUrl = patch.photos[0].url;
      }
      if (task.requiresFileUpload && files.length) {
        patch.files = [...(task.files || []), ...await sendAll('file', files)];
        patch.fileUrl = patch.files[0].url;
      }
      if (task.requiresSignature) {
        const blob = sigMode === 'type'
          ? (typedSig.trim() ? await typedSignatureBlob(typedSig.trim()) : null)
          : (signed && sigRef.current ? await new Promise<Blob | null>(res => sigRef.current!.toBlob(res, 'image/png')) : null);
        if (blob) {
          patch.signatureUrl = await upload(projectId, phaseId, task, 'signature', blob, 'signature.png', 'Signature');
          patch.signatureName = sigMode === 'type' ? typedSig.trim() : '';
        }
      }
      if (task.requiresText) patch.textValue = text.trim();
      if (task.requiresNumeric) patch.numericValue = Number(count);
      if (task.requiresDropdown) patch.dropdownValue = choice;
      if (task.requiresOther) patch.otherValue = other.trim();
      await onComplete(patch);
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not complete task', description: e?.message || 'Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Complete task</DialogTitle>
          <DialogDescription>{task.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {task.requiresPhoto && (
            <div className="space-y-1.5">
              <Label>Photos</Label>
              {!!(task.photos?.length || task.photoUrl) && !photos.length && (
                <p className="text-[12px] text-text-muted">{task.photos?.length || 1} already added — add more below.</p>
              )}
              <NamedFilePicker items={photos} setItems={setPhotos} accept="image/*" capture icon={Camera}
                emptyLabel="Take or choose photos" addLabel="Add more photos" />
            </div>
          )}

          {task.requiresText && (
            <div className="space-y-1.5">
              <Label htmlFor="task-notes">Notes</Label>
              <Textarea id="task-notes" value={text} onChange={e => setText(e.target.value)} placeholder="What was done, findings, readings…" className="min-h-[90px]" />
            </div>
          )}

          {task.requiresNumeric && (
            <div className="space-y-1.5">
              <Label htmlFor="task-count">Count</Label>
              <Input id="task-count" type="number" inputMode="decimal" value={count} onChange={e => setCount(e.target.value)} placeholder="0" />
            </div>
          )}

          {task.requiresDropdown && (
            <div className="space-y-1.5">
              <Label>Selection</Label>
              {options.length ? (
                <Select value={choice} onValueChange={setChoice}>
                  <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                  <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={choice} onChange={e => setChoice(e.target.value)} placeholder="No options were set — type a value" />
              )}
            </div>
          )}

          {task.requiresOther && (
            <div className="space-y-1.5">
              <Label htmlFor="task-other">{task.otherRequirementLabel || 'Details'}</Label>
              <Input id="task-other" value={other} onChange={e => setOther(e.target.value)} />
            </div>
          )}

          {task.requiresFileUpload && (
            <div className="space-y-1.5">
              <Label>Documents</Label>
              {!!(task.files?.length || task.fileUrl) && !files.length && (
                <p className="text-[12px] text-text-muted">{task.files?.length || 1} already added — add more below.</p>
              )}
              <NamedFilePicker items={files} setItems={setFiles} icon={FileUp}
                emptyLabel="Choose files" addLabel="Add more files" />
            </div>
          )}

          {task.requiresSignature && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Signature</Label>
                <div className="inline-flex rounded-md border border-border-sub p-0.5" role="tablist">
                  {(['draw', 'type'] as const).map(m => (
                    <button key={m} type="button" role="tab" aria-selected={sigMode === m} onClick={() => setSigMode(m)}
                      className={`h-7 rounded px-3 text-[12px] font-semibold ${sigMode === m ? 'bg-brand-red text-white' : 'text-text-muted'}`}>
                      {m === 'draw' ? 'Draw' : 'Type'}
                    </button>
                  ))}
                </div>
              </div>
              {sigMode === 'draw' ? (
                <SignaturePad canvasRef={sigRef} onChange={setSigned} />
              ) : (
                <div className="space-y-1.5">
                  <Input value={typedSig} onChange={e => setTypedSig(e.target.value)} placeholder="Type your full name" autoComplete="name" />
                  <div className="flex h-20 items-center rounded-lg border border-border-main bg-white px-4 text-[34px] italic text-[#111]"
                    style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive' }}>
                    {typedSig || <span className="text-[14px] not-italic text-gray-400" style={{ fontFamily: 'inherit' }}>Preview</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Complete task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
