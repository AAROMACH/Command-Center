import type { SiteSurvey } from './types';

export const CEILING_TYPES = ['Drop / Grid', 'Hard Lid', 'Open Deck', 'Mixed'];
export const CABLE_TYPES = ['Cat6', 'Cat6A', 'Cat5e', 'Fiber (SM)', 'Fiber (MM)', 'Coax'];
export const PATHWAYS = ['J-Hooks', 'Cable Tray', 'Conduit', 'Surface Raceway', 'Existing Pathway', 'Wall Fish'];
export const SITE_CONDITIONS = ['Occupied', 'New Construction', 'Renovation', 'Vacant'];

/** Which survey sections a service line needs. */
export const SECTION_FOR_SERVICE: Record<string, SurveySection> = {
  'Structured Cabling': 'cabling',
  'Network Racks': 'closets',
  'Cameras / CCTV': 'cameras',
  'Access Control': 'access',
  'Wireless / Wi-Fi': 'wireless',
  'AV': 'av',
  'Fiber': 'fiber',
  'VoIP': 'cabling',
};
export type SurveySection = 'site' | 'cabling' | 'closets' | 'cameras' | 'access' | 'wireless' | 'av' | 'fiber';
export const SECTIONS: { key: SurveySection; label: string }[] = [
  { key: 'site', label: 'Site Conditions' },
  { key: 'cabling', label: 'Cabling' },
  { key: 'closets', label: 'MDF / IDF' },
  { key: 'cameras', label: 'Cameras' },
  { key: 'access', label: 'Access Control' },
  { key: 'wireless', label: 'Wireless' },
  { key: 'av', label: 'AV' },
  { key: 'fiber', label: 'Fiber' },
];

export function emptySurvey(): Omit<SiteSurvey, 'id' | 'leadId' | 'createdAt' | 'updatedAt' | 'createdBy'> {
  return {
    title: 'Site Survey',
    status: 'draft',
    surveyDate: '',
    surveyedBy: '',
    site: { condition: '', squareFeet: 0, floors: 0, ceilingType: '', ceilingHeightFt: 0, afterHoursOnly: false, liftNeeded: false, permitRequired: false, unionSite: false, accessNotes: '', hazardNotes: '' },
    cabling: { dataDrops: 0, voiceDrops: 0, wapDrops: 0, cameraDrops: 0, otherDrops: 0, cableType: 'Cat6', plenum: true, avgRunFt: 150, pathways: [], removeExisting: false, notes: '' },
    closets: [],
    cameras: { indoor: 0, outdoor: 0, ptz: 0, nvrLocation: '', retentionDays: 30, existingSystem: '', notes: '' },
    access: { doors: 0, readers: 0, rex: 0, existingSystem: '', notes: '' },
    wireless: { aps: 0, existingSystem: '', coverageNotes: '' },
    av: { rooms: 0, displays: 0, notes: '' },
    fiber: { runs: 0, strands: 0, notes: '' },
    photos: [],
    notes: '',
  };
}

export function totalDrops(s: Pick<SiteSurvey, 'cabling'>): number {
  const c = s.cabling;
  return (c.dataDrops || 0) + (c.voiceDrops || 0) + (c.wapDrops || 0) + (c.cameraDrops || 0) + (c.otherDrops || 0);
}

/** Cable footage estimate: drops × average run, plus 10% for service loops and waste. */
export function estimatedCableFt(s: Pick<SiteSurvey, 'cabling'>): number {
  return Math.round(totalDrops(s) * (s.cabling.avgRunFt || 0) * 1.1);
}

/** Plain-text takeoff — goes into quote scope and the ops project. */
export function surveySummary(s: SiteSurvey): string {
  const lines: string[] = [`${s.title}${s.surveyDate ? ` (${s.surveyDate})` : ''}${s.surveyedBy ? ` — ${s.surveyedBy}` : ''}`];
  const st = s.site;
  const site = [st.condition, st.squareFeet ? `${st.squareFeet.toLocaleString()} sq ft` : '', st.floors ? `${st.floors} floor(s)` : '',
    st.ceilingType ? `${st.ceilingType} ceiling${st.ceilingHeightFt ? ` @ ${st.ceilingHeightFt} ft` : ''}` : '',
    st.afterHoursOnly ? 'after-hours work only' : '', st.liftNeeded ? 'lift required' : '', st.permitRequired ? 'permit required' : '', st.unionSite ? 'union site' : '']
    .filter(Boolean).join(', ');
  if (site) lines.push(`Site: ${site}`);
  const drops = totalDrops(s);
  if (drops) {
    const c = s.cabling;
    lines.push(`Cabling: ${drops} drops (${[c.dataDrops && `${c.dataDrops} data`, c.voiceDrops && `${c.voiceDrops} voice`, c.wapDrops && `${c.wapDrops} WAP`, c.cameraDrops && `${c.cameraDrops} camera`, c.otherDrops && `${c.otherDrops} other`].filter(Boolean).join(', ')}), ${c.cableType}${c.plenum ? ' plenum' : ''}, ~${estimatedCableFt(s).toLocaleString()} ft est.${c.pathways.length ? `, via ${c.pathways.join(' / ')}` : ''}${c.removeExisting ? ', remove existing cabling' : ''}`);
  }
  if (s.closets.length) lines.push(`Closets: ${s.closets.map(r => `${r.name}${r.location ? ` (${r.location})` : ''}${r.rackNeeded ? ' — new rack' : ''}${r.powerAvailable ? '' : ' — needs power'}`).join('; ')}`);
  const cam = s.cameras;
  if (cam.indoor || cam.outdoor || cam.ptz) lines.push(`Cameras: ${cam.indoor} indoor, ${cam.outdoor} outdoor${cam.ptz ? `, ${cam.ptz} PTZ` : ''}${cam.retentionDays ? `, ${cam.retentionDays}-day retention` : ''}${cam.nvrLocation ? `, NVR in ${cam.nvrLocation}` : ''}`);
  if (s.access.doors) lines.push(`Access control: ${s.access.doors} doors, ${s.access.readers} readers${s.access.rex ? `, ${s.access.rex} REX` : ''}${s.access.existingSystem ? `, existing: ${s.access.existingSystem}` : ''}`);
  if (s.wireless.aps) lines.push(`Wireless: ${s.wireless.aps} APs${s.wireless.existingSystem ? `, existing: ${s.wireless.existingSystem}` : ''}`);
  if (s.av.rooms) lines.push(`AV: ${s.av.rooms} room(s), ${s.av.displays} display(s)`);
  if (s.fiber.runs) lines.push(`Fiber: ${s.fiber.runs} run(s), ${s.fiber.strands} strands`);
  if (st.accessNotes) lines.push(`Access: ${st.accessNotes}`);
  if (st.hazardNotes) lines.push(`Hazards: ${st.hazardNotes}`);
  if (s.notes) lines.push(`Notes: ${s.notes}`);
  if (s.photos.length) lines.push(`${s.photos.length} photo(s) on the survey`);
  return lines.join('\n');
}
