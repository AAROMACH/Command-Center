'use client';

import { Download, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type ViewableDoc = { name: string; url?: string; type?: string; originalName?: string };

const ext = (d: ViewableDoc) => (d.originalName || d.name || d.url || '').split('?')[0].split('.').pop()?.toLowerCase() || '';
export const isImageDoc = (d: ViewableDoc) => d.type === 'img' || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext(d));
const isPdf = (d: ViewableDoc) => d.type === 'pdf' || ext(d) === 'pdf';
const isOffice = (d: ViewableDoc) => ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext(d));
const isText = (d: ViewableDoc) => ['txt', 'csv'].includes(ext(d)) || d.type === 'csv';
// Android browsers download PDFs rather than showing them in a frame.
const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/**
 * Opens a project document inside the app instead of downloading it: photos
 * full size, PDFs in the browser's viewer (Google's viewer on Android, which
 * can't show PDFs inline), Office files in Microsoft's online viewer, text
 * as-is. Anything else gets Open / Download buttons.
 */
export function DocumentViewer({ doc, onOpenChange }: { doc: ViewableDoc | null; onOpenChange: (open: boolean) => void }) {
  const url = doc?.url || '';
  let body: React.ReactNode = null;
  if (doc && url) {
    if (isImageDoc(doc)) {
      // eslint-disable-next-line @next/next/no-img-element
      body = <img src={url} alt={doc.name} className="mx-auto max-h-[70svh] w-auto max-w-full rounded-lg object-contain" />;
    } else if (isPdf(doc)) {
      const src = isAndroid() ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}` : url;
      body = <iframe src={src} title={doc.name} className="h-[70svh] w-full rounded-lg border border-border-sub bg-white" />;
    } else if (isOffice(doc)) {
      body = <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`} title={doc.name} className="h-[70svh] w-full rounded-lg border border-border-sub bg-white" />;
    } else if (isText(doc)) {
      body = <iframe src={url} title={doc.name} className="h-[70svh] w-full rounded-lg border border-border-sub bg-white" />;
    } else {
      body = <p className="py-8 text-center text-[13px] text-text-muted">This file type can't be previewed here.</p>;
    }
  }
  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,64rem)] p-4 sm:p-5">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="truncate text-base">{doc?.name}</DialogTitle>
          {doc?.originalName && doc.originalName !== doc.name && <DialogDescription className="truncate">{doc.originalName}</DialogDescription>}
        </DialogHeader>
        {body}
        {url && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="outline" size="sm"><a href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} className="mr-1.5" /> Open in new tab</a></Button>
            <Button asChild variant="outline" size="sm"><a href={url} download={doc?.originalName || doc?.name}><Download size={14} className="mr-1.5" /> Download</a></Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
