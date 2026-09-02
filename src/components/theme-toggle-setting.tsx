'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/**
 * Dark/light mode toggle. Device-local (localStorage `aaromach_theme` + a
 * class on <html>, applied globally via the inline script in layout.tsx) —
 * unlike Display Font, this is not synced through Firestore. Drop this into
 * any portal's Settings page.
 */
export function ThemeToggleSetting() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('aaromach_theme');
    const isLight = saved ? saved === 'light' : document.documentElement.classList.contains('light');
    setTheme(isLight ? 'light' : 'dark');
  }, []);

  const toggleTheme = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    localStorage.setItem('aaromach_theme', newTheme);
    if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
    toast({
      title: 'Interface Refined',
      description: `Terminal visual profile set to ${newTheme.toUpperCase()}.`,
    });
  };

  if (!mounted) return null;

  return (
    <Card>
      <CardHeader className="text-left">
        <CardTitle>Visual Mode</CardTitle>
        <CardDescription>Customize the tactical visibility of this terminal, on this device.</CardDescription>
      </CardHeader>
      <CardContent className="text-left">
        <div className="flex gap-2 p-1 bg-bg-primary rounded-lg border border-border-sub w-fit">
          <button
            onClick={() => toggleTheme('dark')}
            className={cn(
              'px-6 h-9 rounded transition-colors text-[10px] font-bold uppercase tracking-widest',
              theme === 'dark' ? 'bg-brand-red text-white' : 'hover:bg-bg-secondary text-text-muted'
            )}
          >
            <Moon size={14} className="inline mr-2" /> Dark
          </button>
          <button
            onClick={() => toggleTheme('light')}
            className={cn(
              'px-6 h-9 rounded transition-colors text-[10px] font-bold uppercase tracking-widest',
              theme === 'light' ? 'bg-brand-red text-white' : 'hover:bg-bg-secondary text-text-muted'
            )}
          >
            <Sun size={14} className="inline mr-2" /> Light
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
