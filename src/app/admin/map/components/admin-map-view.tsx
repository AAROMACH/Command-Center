'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { WorkOrder } from '@/lib/types';
import { displayWorkOrderNumber } from '@/lib/work-order-identity';

type AdminMapViewProps = {
  jobs: WorkOrder[];
  selectedJob: WorkOrder | null;
  onSelectJob: (job: WorkOrder) => void;
  /** Persist a resolved geocode so it isn't re-fetched every session. */
  onResolveCoords?: (jobId: string, lat: number, lng: number, address: string) => void;
};

const STATUS_COLORS: Record<string, string> = {
  'in-progress': '#22c55e',
  'on-my-way': '#3b82f6',
  'confirmed': '#3b82f6',
  'assigned': '#f59e0b',
  'scheduled': '#e53e3e',
  'completed': '#64748b',
  default: '#94a3b8',
};

function getColor(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.default;
}

// Pick the most specific address available. Prefer a value with a street number
// or comma (full address) over a bare city, so we don't geocode a vague city
// when a full address exists.
function bestAddress(job: WorkOrder): string {
  const candidates = [job.location, (job as any).locationText, (job as any).serviceLocation]
    .map(v => (v || '').toString().trim())
    .filter(Boolean);
  if (candidates.length === 0) return '';
  const specific = candidates.filter(c => /\d/.test(c) || c.includes(','));
  const pool = specific.length ? specific : candidates;
  return pool.sort((a, b) => b.length - a.length)[0];
}

async function geocodeLocation(location: string): Promise<[number, number] | null> {
  if (!location) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data && data[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch { /* silent */ }
  return null;
}

// Group key: round to ~4 decimals (~11m) so jobs at the same/adjacent address share a marker.
function coordKey(lat: number, lng: number) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export default function AdminMapView({ jobs, selectedJob, onSelectJob, onResolveCoords }: AdminMapViewProps) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({}); // keyed by coordKey
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectJob);
  onSelectRef.current = onSelectJob;
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, [number, number]>>({});
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [geocoding, setGeocoding] = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);

  // Geocode jobs missing coords, or whose stored geocode was for a different
  // address (address changed → refresh). Persist each result via callback.
  useEffect(() => {
    const needsGeocode = jobs.filter(j => {
      const addr = bestAddress(j);
      if (!addr) return false;
      const hasFresh = j.lat && j.lng && (!j.geocodedAddress || j.geocodedAddress === addr);
      return !hasFresh && !geocodedCoords[j.id];
    });
    if (needsGeocode.length === 0) { setGeocoding(false); return; }

    let cancelled = false;
    setGeocoding(true);
    setGeocodedCount(0);

    (async () => {
      const results: Record<string, [number, number]> = {};
      const failures = new Set<string>();
      for (let i = 0; i < needsGeocode.length; i++) {
        if (cancelled) break;
        const job = needsGeocode[i];
        const addr = bestAddress(job);
        const coords = await geocodeLocation(addr);
        if (coords) {
          results[job.id] = coords;
          onResolveCoords?.(job.id, coords[0], coords[1], addr);
        } else {
          failures.add(job.id);
        }
        setGeocodedCount(i + 1);
        if (i < needsGeocode.length - 1) await new Promise(r => setTimeout(r, 1100));
      }
      if (!cancelled) {
        setGeocodedCoords(prev => ({ ...prev, ...results }));
        setFailedIds(prev => new Set([...prev, ...failures]));
        setGeocoding(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  // Effective jobs with resolved coordinates (stored first, then session geocode).
  const effectiveJobs = jobs
    .map(j => {
      if (j.lat && j.lng) return j;
      const coords = geocodedCoords[j.id];
      if (coords) return { ...j, lat: coords[0], lng: coords[1] };
      return j;
    })
    .filter(j => j.lat && j.lng);

  // Jobs we could not place — surfaced for review rather than shown at a wrong spot.
  const needsReview = jobs.filter(j => bestAddress(j) && !(j.lat && j.lng) && !geocodedCoords[j.id] && failedIds.has(j.id));

  // Init map once
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;
    import('leaflet').then((L) => {
      const leaflet = L.default || L;
      if (mapRef.current) return;
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      const map = leaflet.map(containerRef.current!, {
        zoomControl: true, attributionControl: true, center: [39.8283, -98.5795], zoom: 4,
      });
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    });
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markersRef.current = {}; }
    };
  }, []);

  // Rebuild markers — grouped by coordinate — whenever jobs or selection change.
  useEffect(() => {
    if (!mapRef.current) return;
    import('leaflet').then((L) => {
      const leaflet = L.default || L;
      const map = mapRef.current;
      if (!map) return;

      Object.values(markersRef.current).forEach((m: any) => m.remove());
      markersRef.current = {};

      // Group jobs by rounded coordinate
      const groups = new Map<string, WorkOrder[]>();
      effectiveJobs.forEach(j => {
        const key = coordKey(j.lat!, j.lng!);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(j);
      });

      // Pin numbers must match the job's position in the caller's ordered
      // list (e.g. the numbered job list next to this map), not a
      // group-size/placeholder count.
      const orderIndex = new Map(jobs.map((j, i) => [j.id, i + 1]));

      groups.forEach((groupJobs, key) => {
        const [lat, lng] = key.split(',').map(Number);
        const isGroup = groupJobs.length > 1;
        const selectedHere = selectedJob ? groupJobs.some(j => j.id === selectedJob.id) : false;
        const color = getColor(groupJobs[0].status);
        const size = selectedHere ? 40 : 32;

        const indexes = groupJobs.map(j => orderIndex.get(j.id) ?? '?').sort((a, b) => Number(a) - Number(b));
        const label = indexes.join(',');
        const ring = selectedHere ? 'box-shadow:0 0 0 4px rgba(229,62,62,0.5),0 2px 6px rgba(0,0,0,0.4);' : 'box-shadow:0 2px 6px rgba(0,0,0,0.4);';
        const markerHtml = `
          <div style="
            background:${isGroup ? '#111827' : color};
            width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);border:${selectedHere ? '3px' : '2px'} solid ${selectedHere ? '#e53e3e' : 'white'};
            ${ring}
            display:flex;align-items:center;justify-content:center;">
            <span style="transform:rotate(45deg);font-size:${selectedHere ? 13 : 11}px;font-weight:900;color:white;font-family:monospace;">${label}</span>
          </div>`;
        const icon = leaflet.divIcon({ html: markerHtml, className: '', iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size - 4] });

        const popupHtml = `
          <div style="font-family:monospace;min-width:200px;padding:4px;">
            ${isGroup ? `<p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px 0;color:#e53e3e;">${groupJobs.length} jobs at this location</p>` : ''}
            ${groupJobs.map((job, i) => `
              <div class="cc-map-job" data-jobid="${job.id}" style="cursor:pointer;padding:5px 4px;${i > 0 ? 'border-top:1px solid #eee;' : ''}">
                <p style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 2px 0;color:#111;">
                  ${job.title || job.description || displayWorkOrderNumber(job)}
                </p>
                <p style="font-size:9px;color:#555;margin:0;">#${displayWorkOrderNumber(job)} · ${(job as any).technicianName || 'Unassigned'} · ${job.scheduleTime || 'Time TBD'}</p>
                <span style="display:inline-block;background:${getColor(job.status)};color:white;font-size:8px;font-weight:900;text-transform:uppercase;padding:1px 5px;border-radius:3px;margin-top:3px;">${job.status}</span>
              </div>`).join('')}
            <p style="font-size:9px;color:#888;margin:6px 0 0 0;">📍 ${groupJobs[0].location || 'TBD'}</p>
          </div>`;

        const marker = leaflet.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml, { maxWidth: 280 });
        // Single job: click selects it directly. Group: open popup for choice.
        marker.on('click', () => {
          if (!isGroup) onSelectRef.current(groupJobs[0]);
        });
        // Wire clicks inside the popup list to selection.
        marker.on('popupopen', () => {
          setTimeout(() => {
            document.querySelectorAll('.cc-map-job').forEach(el => {
              el.addEventListener('click', () => {
                const id = (el as HTMLElement).dataset.jobid;
                const job = groupJobs.find(j => j.id === id);
                if (job) onSelectRef.current(job);
              }, { once: true });
            });
          }, 0);
        });
        markersRef.current[key] = marker;
      });

      if (Object.keys(markersRef.current).length > 0 && !selectedJob) {
        const bounds = leaflet.latLngBounds(effectiveJobs.map(j => [j.lat!, j.lng!] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, geocodedCoords, selectedJob]);

  // Pan/zoom the selected job's pin into view.
  useEffect(() => {
    if (!mapRef.current || !selectedJob) return;
    const coords = selectedJob.lat && selectedJob.lng
      ? [selectedJob.lat, selectedJob.lng] as [number, number]
      : geocodedCoords[selectedJob.id];
    if (coords) mapRef.current.setView(coords, 14, { animate: true });
  }, [selectedJob, geocodedCoords]);

  const pendingCount = jobs.filter(j => bestAddress(j) && !(j.lat && j.lng) && !geocodedCoords[j.id]).length;

  return (
    <div className="relative w-full h-full">
      {geocoding && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-bg-elevated border border-border-main rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
          <div className="h-3 w-3 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Resolving {geocodedCount}/{pendingCount} locations...
          </span>
        </div>
      )}
      {!geocoding && needsReview.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-400/10 border border-amber-400/40 rounded-lg px-4 py-2 shadow-lg max-w-[90%]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
            {needsReview.length} location{needsReview.length !== 1 ? 's' : ''} need review — address could not be resolved
          </span>
        </div>
      )}
      {!geocoding && effectiveJobs.length === 0 && jobs.length > 0 && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-bg-primary/80 rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">No geocodable locations found</p>
            <p className="text-[10px] text-text-muted uppercase">Jobs may have incomplete address data</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full rounded-lg" style={{ background: '#1a1a1a' }} />
    </div>
  );
}
