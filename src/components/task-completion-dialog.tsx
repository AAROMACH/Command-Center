"use client";

import { useEffect, useRef, useState } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Camera, FileUp, Loader2, Eraser, FileText, Hash, ListTodo, Signature, Plus } from 'lucide-react';
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
    { on: task.requiresPhoto, Icon: Camera, label: 'Photo', href: task.photoUrl },
    { on: task.requiresText, Icon: FileText, label: 'Notes', value: task.textValue },
    { on: task.requiresNumeric, Icon: Hash, label: 'Count', value: task.numericValue != null ? String(task.numericValue) : undefined },
    { on: task.requiresDropdown, Icon: ListTodo, label: 'Selection', value: task.dropdownValue },
    { on: task.requiresSignature, Icon: Signature, label: 'Signature', href: task.signatureUrl },
    { on: task.requiresFileUpload, Icon: FileUp, label: 'Document', href: task.fileUrl },
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
 * Uploads a completion file and lists it in the project's Documents, under
 * the task's phase (label "Completion Evidence", same as the admin tab uses).
 */
async function upload(projectId: string, phaseId: string | undefined, task: Task, kind: string, blob: Blob, name: string): Promise<string> {
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
    name: `${task.name} — ${label}`,
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
  const [photo, setPhoto] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [count, setCount] = useState('');
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const sigRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open || !task) return;
    setPhoto(null); setFile(null); setSigned(false);
    setText(task.textValue || ''); setCount(task.numericValue != null ? String(task.numericValue) : '');
    setChoice(task.dropdownValue || ''); setOther(task.otherValue || '');
  }, [open, task]);

  if (!task) return null;
  const options = (task.dropdownOptions || []).map(o => o.trim()).filter(Boolean);

  // What's still missing, counting what's already saved on the task.
  const missing = [
    task.requiresPhoto && !photo && !task.photoUrl && 'a photo',
    task.requiresText && !text.trim() && 'notes',
    task.requiresNumeric && (count.trim() === '' || isNaN(Number(count))) && 'a count',
    task.requiresDropdown && !choice && 'a selection',
    task.requiresSignature && !signed && !task.signatureUrl && 'a signature',
    task.requiresFileUpload && !file && !task.fileUrl && 'a document',
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
      if (task.requiresPhoto && photo) patch.photoUrl = await upload(projectId, phaseId, task, 'photo', photo, photo.name);
      if (task.requiresFileUpload && file) patch.fileUrl = await upload(projectId, phaseId, task, 'file', file, file.name);
      if (task.requiresSignature && signed && sigRef.current) {
        const blob = await new Promise<Blob | null>(res => sigRef.current!.toBlob(res, 'image/png'));
        if (blob) patch.signatureUrl = await upload(projectId, phaseId, task, 'signature', blob, 'signature.png');
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
              <Label>Photo</Label>
              <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-main text-[13px] text-text-secondary hover:bg-bg-tertiary">
                <Camera size={16} /> {photo ? photo.name : task.photoUrl ? 'Replace photo' : 'Take or choose a photo'}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => setPhoto(e.target.files?.[0] || null)} />
              </label>
              {(photo || task.photoUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo ? URL.createObjectURL(photo) : task.photoUrl} alt="Task photo" className="max-h-40 rounded-lg border border-border-sub object-cover" />
              )}
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
              <Label>Document</Label>
              <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-main text-[13px] text-text-secondary hover:bg-bg-tertiary">
                <FileUp size={16} /> {file ? file.name : task.fileUrl ? 'Replace document' : 'Choose a file'}
                <input type="file" className="sr-only" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          )}

          {task.requiresSignature && (
            <div className="space-y-1.5">
              <Label>Signature</Label>
              <SignaturePad canvasRef={sigRef} onChange={setSigned} />
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
