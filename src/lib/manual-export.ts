'use client';

import { marked } from 'marked';

/**
 * Save or print one manual section: a Word document (.doc — Word, Google
 * Docs and Pages open it and keep the tables/checkboxes editable) or the
 * browser's print dialog (also "Save as PDF").
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sectionHtml(title: string, body: string, forPrint: boolean): string {
  const content = marked.parse(body, { gfm: true, breaks: true, async: false }) as string;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; ${forPrint ? 'margin: 0.6in;' : ''} }
  h1 { font-size: 18pt; margin: 0 0 4pt; } h2 { font-size: 13pt; margin: 16pt 0 6pt; } h3 { font-size: 11.5pt; margin: 12pt 0 4pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; } th, td { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  p { margin: 4pt 0; } th:empty { padding: 0; border: 0; } thead:has(th:empty) { display: none; } ul, ol { margin: 4pt 0 4pt 18pt; } hr { border: 0; border-top: 1px solid #ccc; }
  .brand { color: #b71c1c; font-weight: bold; font-size: 9pt; letter-spacing: .5pt; }
  @media print { h2 { page-break-after: avoid; } table, tr { page-break-inside: avoid; } }
</style></head><body>
<p class="brand">AAROMACH</p><h1>${esc(title)}</h1>${content}</body></html>`;
}

const fileName = (title: string) => `${title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'Aaromach'}.doc`;

export function downloadSectionAsWord(title: string, body: string): void {
  const blob = new Blob(['﻿', sectionHtml(title, body, false)], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName(title);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function printSection(title: string, body: string): void {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for this site to print.'); return; }
  w.document.open();
  w.document.write(sectionHtml(title, body, true));
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* closed */ } }, 600);
}
