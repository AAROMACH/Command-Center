import 'server-only';
import type { NextRequest } from 'next/server';
import { communicationsSettings } from './notify-delivery';

/**
 * The app's public address for links in emails. Behind App Hosting the
 * request's own origin is the container's (https://0.0.0.0:8080), so use, in
 * order: APP_URL, the address saved in Settings → Communications, the
 * forwarded host, then the production domain.
 */
const internal = (h: string) => /^(0\.0\.0\.0|localhost|127\.|\[?::)/.test(h);

export async function publicOrigin(req?: NextRequest): Promise<string> {
  const env = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  const saved = ((await communicationsSettings())?.appUrl || '').trim().replace(/\/+$/, '');
  if (saved && !internal(new URL(saved).host)) return saved;
  const host = req?.headers.get('x-forwarded-host') || req?.headers.get('host') || '';
  if (host && !internal(host)) return `${req?.headers.get('x-forwarded-proto') || 'https'}://${host.split(',')[0].trim()}`;
  return 'https://app.aaromach.com';
}
