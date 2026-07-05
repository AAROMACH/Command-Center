'use client';

import { useState, useRef, useEffect } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { cn } from '@/lib/utils';
import {
  ChevronRight, ChevronLeft, Check, Loader2, Upload, X, AlertTriangle,
  Star, Building2, MapPin, Phone, Mail, Clock,
} from 'lucide-react';

const SERVICE_TYPES = [
  'Consultation & Planning',
  'Technical Support / Troubleshooting',
  'Installation / Setup',
  'Maintenance & Repair',
  'Custom Development / Project Work',
  'Training / Onboarding',
  'Other',
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', desc: 'Routine task, flexible timeline' },
  { value: 'medium', label: 'Medium', desc: 'Standard response time' },
  { value: 'high', label: 'High', desc: 'Urgent — needs fast review' },
  { value: 'critical', label: 'Critical', desc: 'Business-impacting outage — call us if immediate' },
];

const CONTACT_METHODS = ['Email', 'Phone Call', 'Text Message (SMS)'];
const SERVICE_MODES = [
  { value: 'onsite', label: 'Onsite' },
  { value: 'remote', label: 'Remote' },
  { value: 'either', label: 'Either / Not Sure' },
];

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/csv',
];

type FormState = {
  // Section 1
  email: string;
  customerType: 'first_time' | 'returning_customer' | '';
  fullName: string;
  phoneNumber: string;
  companyName: string;
  preferredContactMethod: string;
  // Section 2
  serviceTypes: string[];
  otherServiceDetails: string;
  priorityLevel: 'low' | 'medium' | 'high' | 'critical' | '';
  serviceLocation: string;
  serviceMode: 'onsite' | 'remote' | 'either' | '';
  detailedDescription: string;
  hasSupportingDocuments: 'yes' | 'no' | '';
  desiredStartDate: string;
  desiredDeadlineTime: string;
  bestAvailability: string;
  formEaseRating: number;
};

const EMPTY: FormState = {
  email: '', customerType: '', fullName: '', phoneNumber: '', companyName: '',
  preferredContactMethod: '',
  serviceTypes: [], otherServiceDetails: '', priorityLevel: '', serviceLocation: '',
  serviceMode: '', detailedDescription: '', hasSupportingDocuments: '',
  desiredStartDate: '', desiredDeadlineTime: '', bestAvailability: '', formEaseRating: 0,
};

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-widest text-text-muted mb-1.5">
      {label}{required && <span className="text-brand-red ml-0.5">*</span>}
    </label>
  );
}

function Input({ value, onChange, type = 'text', placeholder, required, className }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className={cn(
        'w-full h-11 px-3 rounded-lg border border-border-sub bg-bg-secondary text-[13px] text-text-primary placeholder:text-text-muted',
        'focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red/50 transition-colors',
        className,
      )}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 4, required }: any) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      required={required}
      className="w-full px-3 py-2.5 rounded-lg border border-border-sub bg-bg-secondary text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red/50 transition-colors resize-none"
    />
  );
}

export default function PublicServiceRequestPage() {
  const [form, setForm] = useState<FormState>(EMPTY);

  // Pre-fill from URL query params (passed by client portal "Go to Form" button)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const name = sp.get('name') || '';
    const email = sp.get('email') || '';
    const phone = sp.get('phone') || '';
    const company = sp.get('company') || '';
    if (name || email || phone || company) {
      setForm(prev => ({
        ...prev,
        fullName: name || prev.fullName,
        email: email || prev.email,
        phoneNumber: phone || prev.phoneNumber,
        companyName: company || prev.companyName,
      }));
    }
  }, []);
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleService = (type: string) => {
    set('serviceTypes', form.serviceTypes.includes(type)
      ? form.serviceTypes.filter(s => s !== type)
      : [...form.serviceTypes, type]);
  };

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const valid = Array.from(selected)
      .filter(f => ACCEPTED_TYPES.includes(f.type))
      .slice(0, 5 - files.length);
    setFiles(prev => [...prev, ...valid].slice(0, 5));
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email required';
    if (!form.customerType) e.customerType = 'Please select one';
    if (!form.fullName.trim()) e.fullName = 'Name required';
    if (!form.phoneNumber.trim() || form.phoneNumber.replace(/\D/g, '').length < 7) e.phoneNumber = 'Valid phone required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (form.serviceTypes.length === 0) e.serviceTypes = 'Select at least one service type';
    if (form.serviceTypes.includes('Other') && !form.otherServiceDetails.trim()) e.otherServiceDetails = 'Please describe the other service';
    if (!form.priorityLevel) e.priorityLevel = 'Priority required';
    if (!form.detailedDescription.trim()) e.detailedDescription = 'Description required';
    if (!form.hasSupportingDocuments) e.hasSupportingDocuments = 'Please answer this question';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const nextStep = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep(s => s + 1);
    window.scrollTo(0, 0);
  };

  const handleSubmit = async () => {
    if (!validateStep2()) { setStep(2); return; }
    setSubmitting(true);
    setError('');

    try {
      // Pre-generate a doc ref so we can use its ID for Storage paths and include it in the single write.
      // Writes go to `clientRequests` — the collection the admin app reads for
      // request intake (the legacy `serviceRequests` collection had no readers).
      const newDocRef = doc(collection(db, 'clientRequests'));
      const docId = newDocRef.id;

      // Upload files before the Firestore write so URLs are available in the initial create
      let supportingFiles: any[] = [];
      if (files.length > 0) {
        supportingFiles = await Promise.all(files.map(async file => {
          const path = `serviceRequests/${docId}/attachments/${file.name}`;
          const sRef = storageRef(storage, path);
          await uploadBytes(sRef, file, { contentType: file.type });
          const url = await getDownloadURL(sRef);
          return { fileName: file.name, storagePath: path, downloadUrl: url, contentType: file.type, sizeBytes: file.size };
        }));
      }

      // Single Firestore write — no updateDoc needed (avoids admin-only update rule)
      await setDoc(newDocRef, {
        serviceRequestId: docId,
        requestCategory: 'service_ticket',
        source: 'public_service_request',
        status: 'pending_review',
        customerType: form.customerType,
        fullName: form.fullName,
        email: form.email,
        phoneNumber: form.phoneNumber,
        companyName: form.companyName || null,
        preferredContactMethod: form.preferredContactMethod || null,
        serviceTypes: form.serviceTypes,
        otherServiceDetails: form.otherServiceDetails || null,
        priorityLevel: form.priorityLevel,
        serviceLocation: form.serviceLocation || null,
        serviceMode: form.serviceMode || null,
        detailedDescription: form.detailedDescription,
        hasSupportingDocuments: form.hasSupportingDocuments === 'yes',
        desiredStartDate: form.desiredStartDate || null,
        desiredDeadlineTime: form.desiredDeadlineTime || null,
        bestAvailability: form.bestAvailability || null,
        formEaseRating: form.formEaseRating || null,
        supportingFiles,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

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
            <h1 className="text-[20px] font-black text-text-primary mb-2">Request Submitted</h1>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              Your service request has been submitted. A member of Aaromach will review your request and contact you soon.
            </p>
          </div>
          <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 text-left space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Your submission</p>
            <p className="text-[12px] font-bold text-text-primary">{form.fullName}</p>
            <p className="text-[11px] text-text-muted">{form.email}</p>
            <p className="text-[11px] text-text-muted">Priority: <span className="capitalize">{form.priorityLevel}</span></p>
          </div>
          <button
            onClick={() => { setForm(EMPTY); setFiles([]); setStep(1); setSubmitted(false); }}
            className="text-[11px] text-text-muted hover:text-text-primary underline transition-colors"
          >
            Submit another request
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
          <h1 className="text-[28px] font-black text-text-primary">Service Request</h1>
          <p className="text-[13px] text-text-secondary max-w-md mx-auto">
            Submit a service request for technical support, installation, maintenance, or any other service need.
            No account required.
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0',
                step > s ? 'bg-text-green text-white' : step === s ? 'bg-brand-red text-white' : 'bg-bg-secondary border border-border-sub text-text-muted',
              )}>
                {step > s ? <Check size={13} /> : s}
              </div>
              <span className={cn('text-[10px] font-bold uppercase tracking-widest', step === s ? 'text-text-primary' : 'text-text-muted')}>
                {s === 1 ? 'Contact Info' : 'Service Details'}
              </span>
              {s < 2 && <div className="flex-1 h-px bg-border-sub" />}
            </div>
          ))}
        </div>

        {/* Step 1: Contact Information */}
        {step === 1 && (
          <div className="rounded-2xl border border-border-sub bg-bg-secondary p-6 space-y-5">
            <h2 className="text-[15px] font-black text-text-primary">Contact Information</h2>

            <div>
              <FieldLabel label="Email Address" required />
              <Input type="email" value={form.email} onChange={(e: any) => set('email', e.target.value)} placeholder="you@company.com" />
              {errors.email && <p className="text-[11px] text-brand-red mt-1">{errors.email}</p>}
            </div>

            <div>
              <FieldLabel label="Customer Type" required />
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'first_time', label: 'First-Time Customer' },
                  { value: 'returning_customer', label: 'Returning / Existing Client' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('customerType', opt.value)}
                    className={cn(
                      'px-3 py-2.5 rounded-lg border text-[11px] font-bold text-left transition-all',
                      form.customerType === opt.value
                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                        : 'border-border-sub bg-bg-primary text-text-secondary hover:border-border-main',
                    )}
                  >{opt.label}</button>
                ))}
              </div>
              {errors.customerType && <p className="text-[11px] text-brand-red mt-1">{errors.customerType}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Full Name" required />
                <Input value={form.fullName} onChange={(e: any) => set('fullName', e.target.value)} placeholder="Jane Smith" />
                {errors.fullName && <p className="text-[11px] text-brand-red mt-1">{errors.fullName}</p>}
              </div>
              <div>
                <FieldLabel label="Phone Number" required />
                <Input type="tel" value={form.phoneNumber} onChange={(e: any) => set('phoneNumber', e.target.value)} placeholder="+1 (555) 000-0000" />
                {errors.phoneNumber && <p className="text-[11px] text-brand-red mt-1">{errors.phoneNumber}</p>}
              </div>
            </div>

            <div>
              <FieldLabel label="Company / Organization Name" />
              <Input value={form.companyName} onChange={(e: any) => set('companyName', e.target.value)} placeholder="Acme Corp (optional)" />
            </div>

            <div>
              <FieldLabel label="Preferred Contact Method" />
              <div className="flex gap-2 flex-wrap">
                {CONTACT_METHODS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set('preferredContactMethod', form.preferredContactMethod === m ? '' : m)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all',
                      form.preferredContactMethod === m
                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                        : 'border-border-sub bg-bg-primary text-text-secondary hover:border-border-main',
                    )}
                  >{m}</button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={nextStep}
              className="w-full h-12 rounded-xl bg-brand-red hover:bg-brand-red/90 text-white text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
            >
              Next: Service Details <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2: Service Information */}
        {step === 2 && (
          <div className="rounded-2xl border border-border-sub bg-bg-secondary p-6 space-y-5">
            <h2 className="text-[15px] font-black text-text-primary">Service Information</h2>

            <div>
              <FieldLabel label="Types of Services Required" required />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SERVICE_TYPES.map(type => (
                  <label key={type} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={form.serviceTypes.includes(type)}
                      onChange={() => toggleService(type)}
                      className="w-4 h-4 rounded accent-brand-red"
                    />
                    <span className={cn('text-[12px] font-medium', form.serviceTypes.includes(type) ? 'text-text-primary' : 'text-text-secondary')}>
                      {type}
                    </span>
                  </label>
                ))}
              </div>
              {errors.serviceTypes && <p className="text-[11px] text-brand-red mt-1">{errors.serviceTypes}</p>}

              {form.serviceTypes.includes('Other') && (
                <div className="mt-3">
                  <FieldLabel label="Describe the other service" required />
                  <Textarea
                    value={form.otherServiceDetails}
                    onChange={(e: any) => set('otherServiceDetails', e.target.value)}
                    placeholder="Please describe..."
                    rows={2}
                  />
                  {errors.otherServiceDetails && <p className="text-[11px] text-brand-red mt-1">{errors.otherServiceDetails}</p>}
                </div>
              )}
            </div>

            <div>
              <FieldLabel label="Priority Level" required />
              <div className="grid grid-cols-2 gap-2">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('priorityLevel', opt.value)}
                    className={cn(
                      'px-3 py-2.5 rounded-lg border text-left transition-all',
                      form.priorityLevel === opt.value
                        ? 'border-brand-red bg-brand-red/10'
                        : 'border-border-sub bg-bg-primary hover:border-border-main',
                    )}
                  >
                    <span className={cn('block text-[11px] font-black uppercase tracking-widest mb-0.5',
                      opt.value === 'critical' ? 'text-brand-red' : opt.value === 'high' ? 'text-orange-400' : opt.value === 'medium' ? 'text-amber-400' : 'text-text-muted',
                    )}>{opt.label}</span>
                    <span className="text-[10px] text-text-muted">{opt.desc}</span>
                  </button>
                ))}
              </div>
              {errors.priorityLevel && <p className="text-[11px] text-brand-red mt-1">{errors.priorityLevel}</p>}
            </div>

            <div>
              <FieldLabel label="Service Location / Site Address" />
              <Input
                value={form.serviceLocation}
                onChange={(e: any) => set('serviceLocation', e.target.value)}
                placeholder="123 Main St, City, State (for onsite work)"
              />
            </div>

            <div>
              <FieldLabel label="Is this service onsite, remote, or either?" />
              <div className="flex gap-2">
                {SERVICE_MODES.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => set('serviceMode', form.serviceMode === m.value ? '' : m.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all flex-1',
                      form.serviceMode === m.value
                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                        : 'border-border-sub bg-bg-primary text-text-secondary hover:border-border-main',
                    )}
                  >{m.label}</button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel label="Detailed Description" required />
              <Textarea
                value={form.detailedDescription}
                onChange={(e: any) => set('detailedDescription', e.target.value)}
                placeholder="Describe the issue, work requested, symptoms, impact, and desired outcome..."
                rows={5}
              />
              {errors.detailedDescription && <p className="text-[11px] text-brand-red mt-1">{errors.detailedDescription}</p>}
            </div>

            <div>
              <FieldLabel label="Do you have supporting documents, images, or logs?" required />
              <div className="flex gap-2">
                {['yes', 'no'].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('hasSupportingDocuments', v)}
                    className={cn(
                      'px-6 py-2 rounded-lg border text-[11px] font-bold uppercase tracking-widest transition-all',
                      form.hasSupportingDocuments === v
                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                        : 'border-border-sub bg-bg-primary text-text-secondary hover:border-border-main',
                    )}
                  >{v === 'yes' ? 'Yes' : 'No, provide later'}</button>
                ))}
              </div>
              {errors.hasSupportingDocuments && <p className="text-[11px] text-brand-red mt-1">{errors.hasSupportingDocuments}</p>}
            </div>

            {form.hasSupportingDocuments === 'yes' && (
              <div>
                <FieldLabel label={`Upload Files (${files.length}/5 max)`} />
                <div
                  className="border-2 border-dashed border-border-sub rounded-xl p-6 text-center cursor-pointer hover:border-brand-red/40 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                >
                  <Upload size={20} className="mx-auto mb-2 text-text-muted" />
                  <p className="text-[12px] text-text-secondary">Drop files here or click to upload</p>
                  <p className="text-[10px] text-text-muted mt-1">Images, PDF, Word, text/CSV · Max 5 files</p>
                  <input ref={fileRef} type="file" multiple accept={ACCEPTED_TYPES.join(',')} className="hidden"
                    onChange={e => handleFiles(e.target.files)} />
                </div>
                {files.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-primary border border-border-sub">
                        <span className="text-[11px] text-text-primary flex-1 truncate">{f.name}</span>
                        <span className="text-[10px] text-text-muted">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                          className="text-text-muted hover:text-brand-red transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Desired Start Date" />
                <Input type="date" value={form.desiredStartDate} onChange={(e: any) => set('desiredStartDate', e.target.value)} />
              </div>
              <div>
                <FieldLabel label="Preferred Start Time" />
                <Input type="time" value={form.desiredDeadlineTime} onChange={(e: any) => set('desiredDeadlineTime', e.target.value)} />
              </div>
            </div>

            <div>
              <FieldLabel label="Best Availability Window" />
              <Input
                value={form.bestAvailability}
                onChange={(e: any) => set('bestAvailability', e.target.value)}
                placeholder="e.g. Weekdays 9am-5pm, or Tue/Thu afternoons"
              />
            </div>

            <div>
              <FieldLabel label="How easy was this form to fill out? (optional)" />
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set('formEaseRating', form.formEaseRating === n ? 0 : n)}
                    className="transition-colors"
                  >
                    <Star
                      size={22}
                      className={n <= form.formEaseRating ? 'text-amber-400 fill-amber-400' : 'text-border-sub'}
                    />
                  </button>
                ))}
                {form.formEaseRating > 0 && (
                  <span className="text-[11px] text-text-muted ml-1">
                    {['', 'Very Difficult', 'Difficult', 'Neutral', 'Easy', 'Very Easy'][form.formEaseRating]}
                  </span>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-red/10 border border-brand-red/30">
                <AlertTriangle size={14} className="text-brand-red shrink-0" />
                <p className="text-[12px] text-brand-red">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep(1); window.scrollTo(0, 0); }}
                className="h-12 px-5 rounded-xl border border-border-main text-[11px] font-black uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 h-12 rounded-xl bg-brand-red hover:bg-brand-red/90 disabled:opacity-60 text-white text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
              >
                {submitting ? <><Loader2 size={16} className="animate-spin" />Submitting...</> : 'Submit Request'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-text-muted">
          Aaromach · Managed IT &amp; Low-Voltage Services · This form is secure and confidential. ·{' '}
          <a href="https://www.aaromach.com/about-us/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-secondary">Privacy Policy</a>
          {' '}·{' '}
          <a href="https://www.aaromach.com/about-us/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-secondary">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}
