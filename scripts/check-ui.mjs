#!/usr/bin/env node
/**
 * UI consistency check (docs/ui-unification-plan.md, Phase 5).
 * Fails when page code reintroduces what the unification removed:
 *   - text smaller than 10px (text-[6-9px])
 *   - raw Tailwind palette colors (text-blue-400, bg-amber-500 …) instead of theme tokens
 *   - hex colors inside className strings
 *   - <style jsx global> blocks
 *   - sci-fi jargon in visible strings
 * Usage: npm run lint:ui   (exit 1 on violations)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const SKIP = [/\/components\/ui\//, /\/lib\/status-styles\.ts$/, /\/lib\/ui-classes\.ts$/];

const PALETTE = '(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)';
const RULES = [
  { name: 'tiny text (<10px)', re: /\btext-\[[6-9]px\]/g },
  { name: 'raw palette color', re: new RegExp(`\\b(text|bg|border|ring|fill|stroke|from|to|via)-${PALETTE}-\\d{2,3}\\b`, 'g') },
  { name: 'hex color in className', re: /\b(text|bg|border|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g },
  { name: '<style jsx global>', re: /<style jsx global>/g },
  // Jargon in quoted strings / JSX text only (not identifiers).
  { name: 'jargon', re: /(["'`>][^"'`<>\n]*\b(Registry|Terminal|Mission|Tactical|Operative|Protocol|Manifest|Directive|Handshake|Synchroniz\w*)\b[^"'`<>\n]*["'`<])/g },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !SKIP.some(r => r.test(p))) out.push(p);
  }
  return out;
}

const hits = {};
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments
    if (/ui-check-ignore/.test(line) || /ui-check-ignore/.test(lines[i - 1] || '')) return; // stored text other code parses
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      if (rule.re.test(line)) (hits[rule.name] ||= []).push(`${relative(ROOT, file)}:${i + 1}`);
    }
  });
}

const total = Object.values(hits).reduce((s, a) => s + a.length, 0);
for (const [name, list] of Object.entries(hits)) {
  console.log(`\n${name}: ${list.length}`);
  list.slice(0, 15).forEach(l => console.log(`  ${l}`));
  if (list.length > 15) console.log(`  … ${list.length - 15} more`);
}
console.log(total ? `\n✗ ${total} UI consistency issue(s)` : '✓ UI consistency check passed');
process.exit(total && !process.argv.includes('--report') ? 1 : 0);
