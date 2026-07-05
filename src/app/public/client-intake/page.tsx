'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  ChevronRight, ChevronLeft, Check, Loader2, AlertTriangle,
  Building2, Briefcase, FileText,
} from 'lucide-react';

const SERVICE_INTERESTS = [
  'Managed IT (Desktops, Servers, Helpdesk)',
  'Low Voltage Cabling & Infrastructure',
  'Networking (Switches, Routers)',
  'WiFi & Wireless Solutions',
  'Security Cameras (CCTV)',
  'Multi-Site Support/Rollouts',
  'Routine Maintenance Agreements',
  '24/7 Emergency Support',
  'Specific Project Support (Non-Subscription)',
  'Other',
];

const LOCATION_OPTIONS = [
  { value: '1', label: '1 (Single Site)' },
  { value: '2-5', label: '2–5 Sites' },
  { value: '6-15', label: '6–15 Sites' },
  { value: '16-50', label: '16–50 Sites' },
  { value: '50+', label: '50+ Sites' },
];

const EMPLOYEE_OPTIONS = [
  { value: '1-10', label: '1–10 Employees' },
  { value: '11-50', label: '11–50 Employees' },
  { value: '51-200', label: '51–200 Employees' },
  { value: '201-500', label: '201–500 Employees' },
  { value: '500+', label: '500+ Employees' },
];

const SUBSCRIPTION_TIERS = [
  { value: 'essential', label: 'Essential', desc: 'Foundational support, basic monitoring' },
  { value: 'professional', label: 'Professional', desc: 'Comprehensive support, proactive maintenance, enhanced SLA' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Fully managed services, dedicated resources, rapid response' },
  { value: 'not_sure', label: "I'm not sure yet", desc: 'Advise me during the review' },
];

const VOLUME_OPTIONS = [
  { value: 'under_500', label: 'Under $500' },
  { value: '500_2500', label: '$500 – $2,500' },
  { value: '2501_7500', label: '$2,501 – $7,500' },
  { value: '7501_15000', label: '$7,501 – $15,000' },
  { value: '15000_plus', label: '$15,000+' },
];

const STEPS = ['Company Info', 'Business Profile', 'Service Interests', 'Final Details'];

type FormState = {
  email: string;
  companyName: string;
  primaryContactName: string;
  jobTitle: string;
  phoneNumber: string;
  companyWebsiteUrl: string;
  industryType: string;
  numberOfLocations: string;
  totalEmployeeCount: string;
  primaryOperatingRegion: string;
  existingItProviderOrInternalTeam: string;
  currentPainPoints: string;
  serviceInterests: string[];
  subscriptionTier: string;
  typicalServiceNeeds: string;
  estimatedMonthlyServiceVolume: string;
  emergencyResponseRequired: boolean | null;
  preferredCommunicationMethod: string;
  additionalNotesOrQuestions: string;
  informationAccuracyConfirmed: boolean;
  termsConsent: boolean;
};

const EMPTY: FormState = {
  email: '', companyName: '', primaryContactName: '', jobTitle: '', phoneNumber: '', companyWebsiteUrl: '',
  industryType: '', numberOfLocations: '', totalEmployeeCount: '', primaryOperatingRegion: '',
  existingItProviderOrInternalTeam: '', currentPainPoints: '',
  serviceInterests: [], subscriptionTier: '', typicalServiceNeeds: '',
  estimatedMonthlyServiceVolume: '', emergencyResponseRequired: null,
  preferredCommunicationMethod: '', additionalNotesOrQuestions: '',
  informationAccuracyConfirmed: false, termsConsent: false,
};

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-widest text-text-muted mb-1.5">
      {label}{required && <span className="text-brand-red ml-0.5">*</span>}
    </label>
  );
}

function FInput({ value, onChange, type = 'text', placeholder, className }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={cn(
        'w-full h-11 px-3 rounded-lg border border-border-sub bg-bg-secondary text-[13px] text-text-primary placeholder:text-text-muted',
        'focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red/50 transition-colors',
        className,
      )}
    />
  );
}

function FTextarea({ value, onChange, placeholder, rows = 4 }: any) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2.5 rounded-lg border border-border-sub bg-bg-secondary text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red/50 transition-colors resize-none"
    />
  );
}

export default function PublicClientIntakePage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedCode, setSubmittedCode] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleInterest = (type: string) => {
    set('serviceInterests', form.serviceInterests.includes(type)
      ? form.serviceInterests.filter(s => s !== type)
      : [...form.serviceInterests, type]);
  };

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email required';
      if (!form.companyName.trim()) e.companyName = 'Company name required';
      if (!form.primaryContactName.trim()) e.primaryContactName = 'Contact name required';
      if (!form.jobTitle.trim()) e.jobTitle = 'Job title required';
      if (!form.phoneNumber.trim() || form.phoneNumber.replace(/\D/g, '').length < 7) e.phoneNumber = 'Valid phone required';
    } else if (s === 2) {
      if (!form.industryType.trim()) e.industryType = 'Industry required';
      if (!form.numberOfLocations) e.numberOfLocations = 'Number of locations required';
      if (!form.primaryOperatingRegion.trim()) e.primaryOperatingRegion = 'Operating region required';
      if (!form.currentPainPoints.trim()) e.currentPainPoints = 'Please describe your current challenges';
    } else if (s === 3) {
      if (form.serviceInterests.length === 0) e.serviceInterests = 'Select at least one service area';
      if (!form.subscriptionTier) e.subscriptionTier = 'Please select a plan tier';
    } else if (s === 4) {
      if (!form.informationAccuracyConfirmed) e.informationAccuracyConfirmed = 'You must confirm your information is accurate';
      if (!form.termsConsent) e.termsConsent = 'You must consent to the Terms of Service and Privacy Policy';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;
    setStep(s => s + 1);
    window.scrollTo(0, 0);
  };

  const back = () => { setStep(s => s - 1); window.scrollTo(0, 0); };

  const handleSubmit = async () => {
    if (!validate(4)) return;
    setSubmitting(true);
    setError('');

    try {
      const requestCode = await createDocId(ID_PREFIXES.CLIENT_REQUEST);
      const docId = requestCode;

      await setDoc(doc(db, 'clientRequests', docId), {
        requestCode,
        clientRequestId: docId,
        requestCategory: 'client_intake',
        requestType: 'client_partnership_request',
        source: 'client_intake_form',
        status: 'pending_review',
        // Section 1
        email: form.email,
        companyName: form.companyName,
        primaryContactName: form.primaryContactName,
        jobTitle: form.jobTitle,
        phoneNumber: form.phoneNumber,
        companyWebsiteUrl: form.companyWebsiteUrl || null,
        // Section 2
        industryType: form.industryType,
        numberOfLocations: form.numberOfLocations,
        totalEmployeeCount: form.totalEmployeeCount || null,
        primaryOperatingRegion: form.primaryOperatingRegion,
        existingItProviderOrInternalTeam: form.existingItProviderOrInternalTeam || null,
        currentPainPoints: form.currentPainPoints,
        // Section 3
        serviceInterests: form.serviceInterests,
        subscriptionTier: form.subscriptionTier,
        typicalServiceNeeds: form.typicalServiceNeeds || null,
        // Section 4
        estimatedMonthlyServiceVolume: form.estimatedMonthlyServiceVolume || null,
        emergencyResponseRequired: form.emergencyResponseRequired,
        preferredCommunicationMethod: form.preferredCommunicationMethod || null,
        additionalNotesOrQuestions: form.additionalNotesOrQuestions || null,
        // Consent
        informationAccuracyConfirmed: form.informationAccuracyConfirmed,
        contactAuthorizationConfirmed: form.informationAccuracyConfirmed,
        termsConsent: form.termsConsent,
        consentConfirmed: form.informationAccuracyConfirmed && form.termsConsent,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSubmittedCode(requestCode);
      setSubmitted(true);
    } catch (e: any) {
      setError('Submission failed. Please try again or contact us directly.');
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-bg-primary">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-text-green/15 flex items-center justify-center mx-auto">
            <Check size={32} className="text-text-green" />
          </div>
          <div>
            <h1 className="text-[20px] font-black text-text-primary mb-2">Application Received</h1>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              Thank you. Your client partnership request has been submitted. Aaromach will review your information and contact you regarding next steps.
            </p>
          </div>
          <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 text-left space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Your submission</p>
            <p className="text-[12px] font-bold text-text-primary">{form.companyName}</p>
            <p className="text-[11px] text-text-muted">{form.primaryContactName} · {form.email}</p>
            {submittedCode && (
              <p className="text-[10px] font-mono text-text-muted">Reference: {submittedCode}</p>
            )}
          </div>
          <button
            onClick={() => { setForm(EMPTY); setStep(1); setSubmitted(false); setSubmittedCode(''); }}
            className="text-[11px] text-text-muted hover:text-text-primary underline transition-colors"
          >
            Submit another application
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-10">
      <div className="max-w-[640px] mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-red">Aaromach</p>
          <h1 className="text-[28px] font-black text-text-primary">Partner With Aaromach</h1>
          <p className="text-[13px] text-text-secondary max-w-md mx-auto">
            This is the initial vetting application for businesses seeking ongoing managed IT and low-voltage support subscriptions.
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((label, i) => {
            const s = i + 1;
            return (
              <div key={s} className="flex items-center gap-1.5 flex-1 min-w-0">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0',
                  step > s ? 'bg-text-green text-white' : step === s ? 'bg-brand-red text-white' : 'bg-bg-secondary border border-border-sub text-text-muted',
                )}>
                  {step > s ? <Check size={12} /> : s}
                </div>
                <span className={cn('text-[9px] font-bold uppercase tracking-wider truncate hidden sm:block', step === s ? 'text-text-primary' : 'text-text-muted')}>
                  {label}
                </span>
                {s < STEPS.length && <div className="flex-1 h-px bg-border-sub" />}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Company Information ── */}
        {step === 1 && (
          <div className="rounded-2xl border border-border-sub bg-bg-secondary p-6 space-y-5">
            <div className="flex items-center gap-2.5 border-b border-border-sub pb-4">
              <Building2 size={16} className="text-brand-red" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-red">Section 1 of 4</p>
                <h2 className="text-[15px] font-black text-text-primary">Company Information</h2>
              </div>
            </div>

            <div>
              <FieldLabel label="Business Email" required />
              <FInput type="email" value={form.email} onChange={(e: any) => set('email', e.target.value)} placeholder="contact@yourcompany.com" />
              {errors.email && <p className="text-[11px] text-brand-red mt-1">{errors.email}</p>}
            </div>

            <div>
              <FieldLabel label="Company / Organization Name" required />
              <FInput value={form.companyName} onChange={(e: any) => set('companyName', e.target.value)} placeholder="Acme Corp" />
              {errors.companyName && <p className="text-[11px] text-brand-red mt-1">{errors.companyName}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Primary Contact Name" required />
                <FInput value={form.primaryContactName} onChange={(e: any) => set('primaryContactName', e.target.value)} placeholder="Jane Smith" />
                {errors.primaryContactName && <p className="text-[11px] text-brand-red mt-1">{errors.primaryContactName}</p>}
              </div>
              <div>
                <FieldLabel label="Job Title" required />
                <FInput value={form.jobTitle} onChange={(e: any) => set('jobTitle', e.target.value)} placeholder="IT Director" />
                {errors.jobTitle && <p className="text-[11px] text-brand-red mt-1">{errors.jobTitle}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Phone Number" required />
                <FInput type="tel" value={form.phoneNumber} onChange={(e: any) => set('phoneNumber', e.target.value)} placeholder="+1 (555) 000-0000" />
                {errors.phoneNumber && <p className="text-[11px] text-brand-red mt-1">{errors.phoneNumber}</p>}
              </div>
              <div>
                <FieldLabel label="Company Website URL" />
                <FInput type="url" value={form.companyWebsiteUrl} onChange={(e: any) => set('companyWebsiteUrl', e.target.value)} placeholder="https://yourcompany.com" />
              </div>
            </div>

            <button type="button" onClick={next}
              className="w-full h-12 rounded-xl bg-brand-red hover:bg-brand-red/90 text-white text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
              Next: Business Profile <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 2: Business Profile ── */}
        {step === 2 && (
          <div className="rounded-2xl border border-border-sub bg-bg-secondary p-6 space-y-5">
            <div className="flex items-center gap-2.5 border-b border-border-sub pb-4">
              <Briefcase size={16} className="text-brand-red" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-red">Section 2 of 4</p>
                <h2 className="text-[15px] font-black text-text-primary">Business Profile</h2>
              </div>
            </div>

            <div>
              <FieldLabel label="Industry Type" required />
              <FInput value={form.industryType} onChange={(e: any) => set('industryType', e.target.value)}
                placeholder="e.g. Finance, Retail, Healthcare, Manufacturing" />
              {errors.industryType && <p className="text-[11px] text-brand-red mt-1">{errors.industryType}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Number of Locations Requiring Support" required />
                <div className="space-y-1.5">
                  {LOCATION_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => set('numberOfLocations', opt.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg border text-[11px] font-bold text-left transition-all',
                        form.numberOfLocations === opt.value
                          ? 'border-brand-red bg-brand-red/10 text-brand-red'
                          : 'border-border-sub bg-bg-primary text-text-secondary hover:border-border-main',
                      )}
                    >{opt.label}</button>
                  ))}
                </div>
                {errors.numberOfLocations && <p className="text-[11px] text-brand-red mt-1">{errors.numberOfLocations}</p>}
              </div>
              <div>
                <FieldLabel label="Total Employee Count" />
                <div className="space-y-1.5">
                  {EMPLOYEE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => set('totalEmployeeCount', form.totalEmployeeCount === opt.value ? '' : opt.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg border text-[11px] font-bold text-left transition-all',
                        form.totalEmployeeCount === opt.value
                          ? 'border-brand-red bg-brand-red/10 text-brand-red'
                          : 'border-border-sub bg-bg-primary text-text-secondary hover:border-border-main',
                      )}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <FieldLabel label="Primary Operating Region (State/Province or Country)" required />
              <FInput value={form.primaryOperatingRegion} onChange={(e: any) => set('primaryOperatingRegion', e.target.value)}
                placeholder="e.g. Greater Los Angeles, CA or Pacific Northwest" />
              {errors.primaryOperatingRegion && <p className="text-[11px] text-brand-red mt-1">{errors.primaryOperatingRegion}</p>}
            </div>

            <div>
              <FieldLabel label="Existing IT Provider or Internal Team" />
              <FInput value={form.existingItProviderOrInternalTeam} onChange={(e: any) => set('existingItProviderOrInternalTeam', e.target.value)}
                placeholder="e.g. Internal IT team of 3, or Company XYZ manages our network" />
            </div>

            <div>
              <FieldLabel label="What are your current IT or low-voltage pain points?" required />
              <FTextarea value={form.currentPainPoints} onChange={(e: any) => set('currentPainPoints', e.target.value)}
                placeholder="What challenges are you facing today? What's not working well with your current setup?" rows={4} />
              {errors.currentPainPoints && <p className="text-[11px] text-brand-red mt-1">{errors.currentPainPoints}</p>}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={back}
                className="h-12 px-5 rounded-xl border border-border-main text-[11px] font-black uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2">
                <ChevronLeft size={16} /> Back
              </button>
              <button type="button" onClick={next}
                className="flex-1 h-12 rounded-xl bg-brand-red hover:bg-brand-red/90 text-white text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
                Next: Service Interests <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Service Interests ── */}
        {step === 3 && (
          <div className="rounded-2xl border border-border-sub bg-bg-secondary p-6 space-y-5">
            <div className="flex items-center gap-2.5 border-b border-border-sub pb-4">
              <Briefcase size={16} className="text-brand-red" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-red">Section 3 of 4</p>
                <h2 className="text-[15px] font-black text-text-primary">Service Interests</h2>
              </div>
            </div>

            <div>
              <FieldLabel label="Select all services your company is currently interested in" required />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SERVICE_INTERESTS.map(type => (
                  <label key={type} className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-bg-tertiary transition-colors">
                    <input type="checkbox" checked={form.serviceInterests.includes(type)} onChange={() => toggleInterest(type)}
                      className="w-4 h-4 rounded accent-brand-red shrink-0" />
                    <span className={cn('text-[12px] font-medium leading-tight', form.serviceInterests.includes(type) ? 'text-text-primary' : 'text-text-secondary')}>
                      {type}
                    </span>
                  </label>
                ))}
              </div>
              {errors.serviceInterests && <p className="text-[11px] text-brand-red mt-1">{errors.serviceInterests}</p>}
            </div>

            <div>
              <FieldLabel label="Which Subscription Tier best fits your needs?" required />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUBSCRIPTION_TIERS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => set('subscriptionTier', opt.value)}
                    className={cn(
                      'px-3 py-2.5 rounded-lg border text-left transition-all',
                      form.subscriptionTier === opt.value
                        ? 'border-brand-red bg-brand-red/10'
                        : 'border-border-sub bg-bg-primary hover:border-border-main',
                    )}>
                    <span className={cn('block text-[11px] font-black uppercase tracking-widest mb-0.5',
                      form.subscriptionTier === opt.value ? 'text-brand-red' : 'text-text-primary')}>{opt.label}</span>
                    <span className="text-[10px] text-text-muted leading-tight">{opt.desc}</span>
                  </button>
                ))}
              </div>
              {errors.subscriptionTier && <p className="text-[11px] text-brand-red mt-1">{errors.subscriptionTier}</p>}
            </div>

            <div>
              <FieldLabel label="Describe your typical service needs" />
              <FTextarea value={form.typicalServiceNeeds} onChange={(e: any) => set('typicalServiceNeeds', e.target.value)}
                placeholder="Number of monthly support tickets, expected low-voltage projects per year, recurring maintenance needs, rollout volume, etc." rows={3} />
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={back}
                className="h-12 px-5 rounded-xl border border-border-main text-[11px] font-black uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2">
                <ChevronLeft size={16} /> Back
              </button>
              <button type="button" onClick={next}
                className="flex-1 h-12 rounded-xl bg-brand-red hover:bg-brand-red/90 text-white text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
                Next: Final Details <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Additional Details & Requirements ── */}
        {step === 4 && (
          <div className="rounded-2xl border border-border-sub bg-bg-secondary p-6 space-y-5">
            <div className="flex items-center gap-2.5 border-b border-border-sub pb-4">
              <FileText size={16} className="text-brand-red" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-red">Section 4 of 4</p>
                <h2 className="text-[15px] font-black text-text-primary">Additional Details & Requirements</h2>
              </div>
            </div>

            <div>
              <FieldLabel label="Estimated Monthly Service Volume / Budget Range" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {VOLUME_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => set('estimatedMonthlyServiceVolume', form.estimatedMonthlyServiceVolume === opt.value ? '' : opt.value)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-[11px] font-bold text-left transition-all',
                      form.estimatedMonthlyServiceVolume === opt.value
                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                        : 'border-border-sub bg-bg-primary text-text-secondary hover:border-border-main',
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel label="Is 24/7 Emergency Response a mandatory requirement?" />
              <div className="flex gap-2">
                {[
                  { v: true, label: 'Yes' },
                  { v: false, label: 'No' },
                ].map(opt => (
                  <button key={String(opt.v)} type="button"
                    onClick={() => set('emergencyResponseRequired', form.emergencyResponseRequired === opt.v ? null : opt.v)}
                    className={cn(
                      'flex-1 px-3 py-2.5 rounded-lg border text-[11px] font-bold text-center transition-all',
                      form.emergencyResponseRequired === opt.v
                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                        : 'border-border-sub bg-bg-primary text-text-secondary hover:border-border-main',
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel label="Preferred Communication Method for follow-up" />
              <div className="flex gap-2">
                {[{ v: 'email', label: 'Email' }, { v: 'phone_call', label: 'Phone Call' }].map(opt => (
                  <button key={opt.v} type="button"
                    onClick={() => set('preferredCommunicationMethod', form.preferredCommunicationMethod === opt.v ? '' : opt.v)}
                    className={cn(
                      'px-6 py-2 rounded-lg border text-[11px] font-bold uppercase tracking-widest transition-all',
                      form.preferredCommunicationMethod === opt.v
                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                        : 'border-border-sub bg-bg-primary text-text-secondary hover:border-border-main',
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel label="Additional Notes or Questions for the Aaromach Team" />
              <FTextarea value={form.additionalNotesOrQuestions} onChange={(e: any) => set('additionalNotesOrQuestions', e.target.value)}
                placeholder="Anything else we should know about your organization or requirements?" rows={4} />
            </div>

            {/* Consent checkboxes */}
            <div className="space-y-3 pt-2 border-t border-border-sub">
              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.informationAccuracyConfirmed}
                    onChange={e => set('informationAccuracyConfirmed', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-brand-red shrink-0" />
                  <span className="text-[12px] text-text-secondary leading-relaxed">
                    I confirm that the information provided is accurate and I authorize Aaromach to contact me regarding this partnership request.
                    <span className="text-brand-red ml-0.5">*</span>
                  </span>
                </label>
                {errors.informationAccuracyConfirmed && <p className="text-[11px] text-brand-red mt-1 ml-7">{errors.informationAccuracyConfirmed}</p>}
              </div>

              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.termsConsent}
                    onChange={e => set('termsConsent', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-brand-red shrink-0" />
                  <span className="text-[12px] text-text-secondary leading-relaxed">
                    I consent to the{' '}
                    <a href="https://www.aaromach.com/about-us/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-brand-red underline hover:text-brand-red/80">Terms of Service</a>
                    {' '}and{' '}
                    <a href="https://www.aaromach.com/about-us/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-brand-red underline hover:text-brand-red/80">Privacy Policy</a>.
                    <span className="text-brand-red ml-0.5">*</span>
                  </span>
                </label>
                {errors.termsConsent && <p className="text-[11px] text-brand-red mt-1 ml-7">{errors.termsConsent}</p>}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-red/10 border border-brand-red/30">
                <AlertTriangle size={14} className="text-brand-red shrink-0" />
                <p className="text-[12px] text-brand-red">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={back}
                className="h-12 px-5 rounded-xl border border-border-main text-[11px] font-black uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2">
                <ChevronLeft size={16} /> Back
              </button>
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="flex-1 h-12 rounded-xl bg-brand-red hover:bg-brand-red/90 disabled:opacity-60 text-white text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
                {submitting ? <><Loader2 size={16} className="animate-spin" />Submitting...</> : 'Submit Application'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-text-muted pb-4">
          Aaromach · Managed IT &amp; Low-Voltage Services · This form is secure and confidential. ·{' '}
          <a href="https://www.aaromach.com/about-us/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-secondary">Privacy Policy</a>
          {' '}·{' '}
          <a href="https://www.aaromach.com/about-us/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-secondary">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}
