'use client';

import { useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { OperationsManualViewer } from '@/components/operations-manual-viewer';
import { useAuth } from '@/contexts/auth-context';
import { isProjectManager } from '@/lib/permissions';
import { OPERATIONS_MANUAL } from '@/content/operations-manual';

/** Tech → SOP: the field SOPs and safety procedures from the Operations Manual (PMs also get theirs). */
export default function TechSopPage() {
  const { user } = useAuth();
  const pm = isProjectManager(user as never);
  const sections = useMemo(() => OPERATIONS_MANUAL.filter(s => s.audience === 'tech' || (pm && s.audience === 'pm')), [pm]);
  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <PageHeader eyebrow="Operations manual" icon={BookOpen} title="SOP"
        subtitle="How we work: field procedures, troubleshooting and safety." />
      <OperationsManualViewer sections={sections} />
    </div>
  );
}
