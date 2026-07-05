import { Briefcase } from 'lucide-react';

export function SubscriptionTab() {
  return (
    <div className="py-16 text-center text-text-muted">
      <Briefcase size={28} className="mx-auto mb-3 opacity-20" />
      <p className="text-[12px] font-bold">Subscription Requests</p>
      <p className="text-[11px] mt-1">Subscription and service plan inquiries will appear here.</p>
    </div>
  );
}
