'use client';

import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GLOSSARY_TIPS, type GlossaryTerm } from '@/content/glossary';

/**
 * Glossary pop-ups for the Operations Manual: a rehype plugin marks the first
 * use of each glossary abbreviation/code in a section, and <GlossaryTip>
 * renders it as a dotted-underlined button that opens the definition.
 */
type HastNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] };

const SKIP = new Set(['a', 'code', 'pre', 'abbr', 'h1', 'h2', 'h3', 'button']);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(`(?<![\\w-])(${GLOSSARY_TIPS.map(t => esc(t.word)).join('|')})(?![\\w-]*\\d)(?![\\w])`, 'g');
const byWord = new Map(GLOSSARY_TIPS.map(t => [t.word, t.entry]));

export function rehypeGlossary() {
  return (tree: HastNode) => {
    const seen = new Set<string>(); // first use of each term per section
    const walk = (node: HastNode) => {
      if (!node.children) return;
      const out: HastNode[] = [];
      for (const child of node.children) {
        if (child.type === 'element') {
          if (!SKIP.has(child.tagName || '')) walk(child);
          out.push(child);
          continue;
        }
        if (child.type !== 'text' || !child.value) { out.push(child); continue; }
        let last = 0;
        const text = child.value;
        PATTERN.lastIndex = 0;
        for (let m = PATTERN.exec(text); m; m = PATTERN.exec(text)) {
          const entry = byWord.get(m[1]);
          if (!entry || seen.has(entry.term)) continue;
          seen.add(entry.term);
          if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
          out.push({ type: 'element', tagName: 'abbr', properties: { dataTerm: m[1] }, children: [{ type: 'text', value: m[1] }] });
          last = m.index + m[1].length;
        }
        if (last === 0) out.push(child);
        else if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
      }
      node.children = out;
    };
    walk(tree);
  };
}

export function GlossaryTip({ word, children, onOpenSection }: { word: string; children: ReactNode; onOpenSection?: (id: string) => void }) {
  const entry: GlossaryTerm | undefined = byWord.get(word);
  if (!entry) return <>{children}</>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline cursor-help border-b border-dotted border-current text-inherit font-inherit leading-inherit p-0 bg-transparent">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-left" side="top">
        <p className="text-[13px] font-semibold text-text-primary">{entry.term}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{entry.definition}</p>
        {entry.sop && onOpenSection && (
          <button type="button" onClick={() => onOpenSection(entry.sop!)} className="mt-2 text-[12px] font-medium text-brand-red hover:underline">
            Open this document →
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
