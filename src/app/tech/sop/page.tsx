'use client';

import { BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { OperationsManualViewer } from '@/components/operations-manual-viewer';
import { useAuth } from '@/contexts/auth-context';
import { isProjectManager } from '@/lib/permissions';
import { useHandbook } from '@/lib/use-handbook';

/** Tech → SOP: the field SOPs and safety procedures from the Operations Manual (PMs also get theirs). */
export default function TechSopPage() {
  const { user } = useAuth();
  const sections = useHandbook(isProjectManager(user as never) ? ['tech', 'pm'] : ['tech']);
  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <PageHeader eyebrow="Operations manual" icon={BookOpen} title="SOP"
        subtitle="How we work: field procedures, troubleshooting and safety." />
      <OperationsManualViewer sections={sections} />
    </div>
  );
}
