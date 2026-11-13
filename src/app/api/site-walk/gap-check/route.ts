import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { GEMINI_MODEL, gemini, geminiKey } from '@/lib/server/gemini';
import {
  DEFAULT_ASSUMPTIONS, DEFAULT_SERVICES, walkScopeText,
  type CatalogService, type EstimatingSettings, type SiteWalk,
} from '@/lib/estimating';
import type { Technician } from '@/lib/types';

/**
 * Site walk "check for missed items". Reads the walk's free text (notes,
 * discovery answers, Wi-Fi checks, photo captions) against the lines the walk
 * already produced, and suggests catalog lines that look missing plus open
 * questions. Suggestions only: the admin ticks what to add, and prices still
 * come from the catalog — the model never sets a price or invents a code.
 */

type Suggestion = { code: string; qty: number; reason: string };

const SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'A code from the catalog list, exactly.' },
          qty: { type: 'number' },
          reason: { type: 'string', description: 'One short sentence quoting what in the walk implies this.' },
        },
        required: ['code', 'qty', 'reason'],
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['suggestions', 'questions'],
};

const INSTRUCTIONS = `You review site walks for a low-voltage / IT contractor (structured cabling, cameras, Wi-Fi, network, AV, POS).
You get the walk's write-up, the line items it already produced, and the service catalog.
Find work the write-up clearly implies that is NOT already covered by an existing line — e.g. a note saying "remove the old rack" with no removal line, cameras mentioned with no camera install line, a lift mentioned with no lift line.
Rules:
- Only use codes from the catalog, exactly as written. If nothing in the catalog fits, put it in questions instead.
- Do not repeat work an existing line already covers. Do not pad: zero suggestions is a fine answer.
- qty must follow from the write-up; if the count is unclear, use 1 and say so in the reason.
- questions: short, specific things the office should confirm before quoting (missing counts, unanswered decisions, who supplies hardware). At most 5.
- Never mention prices.`;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAuth(adminApp).verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!geminiKey()) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });

  const db = getFirestore(adminApp);
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? ({ ...(userSnap.data() as Technician), id: uid }) : null;
  if (!hasPermission(user, 'admin.crm.review_site_walk')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { walkId?: string; lines?: { code: string; qty: number }[] } | null;
  const walkId = typeof body?.walkId === 'string' ? body.walkId : '';
  if (!walkId) return NextResponse.json({ error: 'No walk.' }, { status: 400 });
  const walkSnap = await db.collection('siteWalks').doc(walkId).get();
  if (!walkSnap.exists) return NextResponse.json({ error: 'Walk not found.' }, { status: 404 });
  const walk = { ...(walkSnap.data() as SiteWalk), id: walkId };

  // Same catalog merge as useEstimatingSettings: saved services + built-ins added since.
  const saved = (await db.collection('adminConfig').doc('estimating').get()).data() as Partial<EstimatingSettings> | undefined;
  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...(saved?.assumptions || {}) };
  const services: CatalogService[] = (saved?.services?.length
    ? [...saved.services, ...DEFAULT_SERVICES.filter(x => !saved.services!.some(y => y.code === x.code))]
    : DEFAULT_SERVICES).filter(s => s.active !== false);
  const byCode = new Map(services.map(s => [s.code, s]));

  // The review screen's current (possibly edited) lines, else the saved ones.
  const lines = (Array.isArray(body?.lines) ? body!.lines : walk.lines || [])
    .filter(l => l && typeof l.code === 'string')
    .slice(0, 200);
  const existing = lines.map(l => `${l.code} × ${Number(l.qty) || 0} — ${byCode.get(l.code)?.name ?? 'unknown item'}`);
  const captions = (walk.photos || []).map(p => p.caption).filter(Boolean);

  const prompt = [
    'WALK WRITE-UP:',
    walkScopeText(walk, assumptions),
    captions.length ? `Photo captions:\n${captions.map(c => `  • ${c}`).join('\n')}` : '',
    '',
    'EXISTING LINES:',
    existing.length ? existing.join('\n') : '(none)',
    '',
    'CATALOG (code | category | name | unit | note):',
    services.map(s => `${s.code} | ${s.category} | ${s.name} | ${s.unit}${s.note ? ` | ${s.note}` : ''}`).join('\n'),
  ].filter(x => x !== '').join('\n');

  try {
    const response = await gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: INSTRUCTIONS,
        responseMimeType: 'application/json',
        responseJsonSchema: SCHEMA,
        maxOutputTokens: 3000,
      },
    });
    const parsed = JSON.parse(response.text || '{}') as { suggestions?: Suggestion[]; questions?: string[] };
    const have = new Set(lines.map(l => l.code));
    const suggestions = (parsed.suggestions || [])
      .filter(s => s && byCode.has(s.code)) // drop invented codes
      .map(s => ({
        code: s.code,
        name: byCode.get(s.code)!.name,
        unit: byCode.get(s.code)!.unit,
        qty: Math.max(1, Math.min(10000, Math.round(Number(s.qty) || 1))),
        reason: String(s.reason || '').slice(0, 300),
        alreadyOnQuote: have.has(s.code),
      }))
      .slice(0, 12);
    const questions = (parsed.questions || []).map(q => String(q).slice(0, 300)).slice(0, 5);
    return NextResponse.json({ suggestions, questions });
  } catch (e) {
    console.error('[gap-check] failed', e);
    return NextResponse.json({ error: 'Could not check this walk right now.' }, { status: 502 });
  }
}
