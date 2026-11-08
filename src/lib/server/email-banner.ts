import 'server-only';
import { DEFAULT_COMPANY_PHONE, DEFAULT_COMPANY_WEBSITE, isEmail, type CommunicationsSettings } from '@/lib/communications-settings';

/**
 * The HTML version of every email: the message, then a banner.
 *  - billing: personal banner (logo, your name, title, direct email, phone)
 *  - support: company banner (logo, AAROMACH, support email, phone, website)
 *  - notifications (staff alerts): no banner
 * Tables + inline styles only, so it renders the same in Gmail/Outlook/Apple Mail.
 * The plain-text version is sent alongside for clients that block HTML/images.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const RED = '#d32f2f';

export type BannerKind = 'billing' | 'support' | 'notifications';

export function bannerHtml(kind: BannerKind, s: CommunicationsSettings | null | undefined, supportEmail: string | null): string {
  if (kind === 'notifications') return '';
  const base = (process.env.APP_URL || s?.appUrl || '').replace(/\/+$/, '');
  const logo = base ? `<img src="${esc(base)}/email-logo.png" width="72" height="72" alt="AAROMACH" style="display:block;border:0;width:72px;height:72px;" />` : '';
  const phone = (kind === 'billing' ? s?.billingContactPhone : '')?.trim() || s?.companyPhone?.trim() || DEFAULT_COMPANY_PHONE;
  const tel = phone.replace(/[^\d+]/g, '');
  const site = (s?.companyWebsite?.trim() || DEFAULT_COMPANY_WEBSITE).replace(/^https?:\/\//, '');
  const line = (t: string) => `<div style="font-size:13px;line-height:19px;color:#444;">${t}</div>`;
  const link = (href: string, text: string) => `<a href="${esc(href)}" style="color:#444;text-decoration:none;">${esc(text)}</a>`;

  let lines: string[];
  if (kind === 'billing' && s?.billingContactName?.trim()) {
    const email = s.billingContactEmail?.trim() && isEmail(s.billingContactEmail) ? s.billingContactEmail.trim() : null;
    lines = [
      `<div style="font-size:15px;line-height:20px;font-weight:bold;color:#111;">${esc(s.billingContactName.trim())}</div>`,
      s.billingContactTitle?.trim() ? `<div style="font-size:13px;line-height:19px;color:${RED};font-weight:bold;">${esc(s.billingContactTitle.trim())} · AAROMACH</div>` : `<div style="font-size:13px;line-height:19px;color:${RED};font-weight:bold;">AAROMACH</div>`,
      email ? line(link(`mailto:${email}`, email)) : '',
      line(link(`tel:${tel}`, phone)),
    ];
  } else {
    lines = [
      `<div style="font-size:15px;line-height:20px;font-weight:bold;color:#111;">AAROMACH</div>`,
      `<div style="font-size:13px;line-height:19px;color:${RED};font-weight:bold;">Precision, Quality and Connectivity</div>`,
      supportEmail ? line(link(`mailto:${supportEmail}`, supportEmail)) : '',
      line(`${link(`tel:${tel}`, phone)} · ${link(`https://${site}`, site)}`),
    ];
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-top:3px solid ${RED};padding-top:16px;width:100%;max-width:560px;">
<tr>${logo ? `<td valign="top" style="padding:16px 16px 0 0;width:72px;">${logo}</td>` : ''}<td valign="top" style="padding-top:16px;font-family:Arial,Helvetica,sans-serif;">${lines.filter(Boolean).join('')}</td></tr></table>`;
}

export function emailHtml(body: string, banner: string): string {
  const text = esc(body).replace(/\n/g, '<br/>');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#111;max-width:560px;">${text}${banner}</div>`;
}
