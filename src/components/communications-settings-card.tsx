'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ChevronRight, Mail } from 'lucide-react';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { billingContactLine, isEmail, type CommunicationsSettings } from '@/lib/communications-settings';

const DEFAULT_REPLY = 'support@aaromach.com';

/**
 * Settings → Communications: where replies go, and the direct-contact line on
 * billing emails. Saved to adminConfig/communications; the server reads it on
 * every send.
 */
export function CommunicationsSettingsCard({ showEmailLog }: { showEmailLog?: boolean }) {
  const { toast } = useToast();
  const [s, setS] = useState<CommunicationsSettings>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => onSnapshot(doc(db, 'adminConfig', 'communications'),
    snap => { setS((snap.data() as CommunicationsSettings) || {}); setLoaded(true); },
    () => setLoaded(true)), []);

  const set = (patch: Partial<CommunicationsSettings>) => setS(prev => ({ ...prev, ...patch }));
  const bad = (v?: string) => !!v?.trim() && !isEmail(v);
  const invalid = bad(s.supportReplyTo) || bad(s.billingReplyTo) || bad(s.billingContactEmail)
    || (!!s.billingContactOn && !s.billingContactEmail?.trim());

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    try {
      const clean = (v?: string) => (v || '').trim();
      await setDoc(doc(db, 'adminConfig', 'communications'), {
        supportReplyTo: clean(s.supportReplyTo), billingReplyTo: clean(s.billingReplyTo),
        billingContactOn: !!s.billingContactOn, billingContactName: clean(s.billingContactName),
        billingContactEmail: clean(s.billingContactEmail), billingContactPhone: clean(s.billingContactPhone),
      }, { merge: true });
      toast({ title: 'Communications saved', description: 'Emails sent from now on use these settings.' });
    } catch (e) {
      toast({ title: 'Couldn’t save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const field = (label: string, hint: string, value: string | undefined, onChange: (v: string) => void, placeholder: string, type = 'email') => (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-text-primary">{label}</span>
      <Input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="h-10 text-[13px]" aria-invalid={type === 'email' && bad(value)} />
      <span className={type === 'email' && bad(value) ? 'block text-[11px] text-brand-red' : 'block text-[11px] text-text-muted'}>
        {type === 'email' && bad(value) ? 'Enter a full email address.' : hint}
      </span>
    </label>
  );

  const preview = billingContactLine(s);

  return (<>
    <Card>
      <CardHeader className="text-left">
        <CardTitle>Reply addresses</CardTitle>
        <CardDescription>When someone hits Reply on an email from the app, it goes here. Leave blank to use {DEFAULT_REPLY}.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {field('Support replies', 'Website forms, service requests, FAQs and client questions.', s.supportReplyTo, v => set({ supportReplyTo: v }), DEFAULT_REPLY)}
        {field('Billing replies', 'Invoices, quotes and payments.', s.billingReplyTo, v => set({ billingReplyTo: v }), DEFAULT_REPLY)}
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <CardTitle>Direct contact on billing emails</CardTitle>
            <CardDescription>Adds a line at the bottom of every invoice and billing email so customers can reach you directly.</CardDescription>
          </div>
          <Switch checked={!!s.billingContactOn} onCheckedChange={v => set({ billingContactOn: v })} aria-label="Add direct contact to billing emails" />
        </div>
      </CardHeader>
      {s.billingContactOn && (
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {field('Name', 'How you’re named in the line.', s.billingContactName, v => set({ billingContactName: v }), 'Corey', 'text')}
            {field('Email', 'Your direct email.', s.billingContactEmail, v => set({ billingContactEmail: v }), 'you@aaromach.com')}
            {field('Phone (optional)', 'Shown after the email.', s.billingContactPhone, v => set({ billingContactPhone: v }), '(248) 555-0100', 'tel')}
          </div>
          <div className="rounded-lg border border-border-sub bg-bg-primary p-3">
            <p className="text-[11px] text-text-muted mb-1">Added to the bottom of billing emails</p>
            <p className="text-[13px] text-text-primary break-words">{preview || 'Enter your email to see the line.'}</p>
          </div>
        </CardContent>
      )}
    </Card>

    <Button size="sm" onClick={save} disabled={!loaded || saving || invalid} className="h-10 bg-brand-red hover:bg-brand-red/90 text-white w-full sm:w-auto">
      {saving ? 'Saving…' : 'Save communications'}
    </Button>

    {showEmailLog && (
      <Card>
        <CardContent className="p-0">
          <Link href="/admin/email-log" className="flex items-center gap-3 p-4 hover:bg-bg-tertiary/40 transition-colors">
            <Mail size={16} className="text-text-muted shrink-0" />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[13px] font-semibold text-text-primary">Email log</p>
              <p className="text-[12px] text-text-muted">Every email the app sent, exactly as it went out.</p>
            </div>
            <ChevronRight size={16} className="text-text-muted shrink-0" />
          </Link>
        </CardContent>
      </Card>
    )}
  </>);
}
