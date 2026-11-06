'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type SettingsTab = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Leave out (or false) to hide the tab, e.g. a role-only tab. */
  show?: boolean;
  content: ReactNode;
};

/**
 * Settings and profile pages, every portal: one tab per section instead of a
 * long scroll. On a phone the tab bar is a single row that swipes sideways
 * (it never wraps into a block of pills). The open tab is kept in the URL
 * (?tab=…), so a link can open a tab and Back / reload keep it; an old
 * #anchor link (e.g. #quickbooks) opens the tab named in `hashTabs`.
 */
export function SettingsTabs({ tabs, defaultTab, hashTabs = {}, className }: {
  tabs: SettingsTab[];
  defaultTab?: string;
  /** Old #anchor → tab id, e.g. { quickbooks: 'integrations' }. */
  hashTabs?: Record<string, string>;
  className?: string;
}) {
  const shown = tabs.filter(t => t.show !== false);
  const first = defaultTab && shown.some(t => t.id === defaultTab) ? defaultTab : shown[0]?.id;
  const [tab, setTab] = useState(first);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the open tab visible in the swipe row (e.g. a link to the last tab on a phone).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-state="active"]');
    const row = listRef.current;
    if (el && row && (el.offsetLeft < row.scrollLeft || el.offsetLeft + el.offsetWidth > row.scrollLeft + row.clientWidth)) {
      row.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' });
    }
  }, [tab]);

  // Read ?tab= / #anchor once on load (client only — no hydration mismatch).
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromHash = hashTabs[url.hash.replace('#', '')];
    const want = url.searchParams.get('tab') || fromHash;
    if (want && shown.some(t => t.id === want)) setTab(want);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A tab that disappears (role loads late) falls back to the first one.
  useEffect(() => { if (tab && !shown.some(t => t.id === tab)) setTab(first); }, [shown.map(t => t.id).join(','), tab, first]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (id: string) => {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  };

  if (!shown.length) return null;
  return (
    <Tabs value={tab} onValueChange={pick} className={cn('w-full', className)}>
      {/* Full-bleed swipe row on phones; edge fade hints there's more. */}
      <div className="relative -mx-4 sm:mx-0 mb-4">
        <TabsList ref={listRef} className="!flex !flex-nowrap !justify-start w-full overflow-x-auto no-scrollbar gap-1 bg-transparent !h-auto p-0 px-4 sm:px-0 snap-x">
          {shown.map(t => (
            <TabsTrigger key={t.id} value={t.id} className="tab !rounded-full shrink-0 snap-start flex items-center gap-1.5 min-h-[40px] sm:min-h-0">
              {t.icon && <t.icon size={14} className="shrink-0" />}
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="pointer-events-none absolute right-0 top-0 h-full w-6 bg-gradient-to-l from-bg-primary to-transparent sm:hidden" />
      </div>
      {shown.map(t => (
        <TabsContent key={t.id} value={t.id} className="mt-0 space-y-4 focus-visible:ring-0 focus-visible:ring-offset-0">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
