import 'server-only';

/** A PDF sent up by the browser for an email attachment: must really be a PDF, ≤ 8 MB. */
export function cleanPdfAttachment(v: unknown): { filename: string; content: string } | null {
  if (!v || typeof v !== 'object') return null;
  const { filename, content } = v as { filename?: unknown; content?: unknown };
  if (typeof content !== 'string' || content.length > 11_000_000) return null;
  const buf = Buffer.from(content, 'base64');
  if (buf.length < 100 || buf.subarray(0, 5).toString() !== '%PDF-') return null;
  const name = String(filename || 'Aaromach.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 100);
  return { filename: name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`, content };
}
