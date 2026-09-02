'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { Route, WorkOrder } from '@/lib/types';
import { jobIdsOf, jobLabel, ROUTE_COLORS } from './routes-view';

type RoutesMapViewProps = {
  routes: Route[];
  jobsById: Record<string, WorkOrder>;
  unroutedJobs: WorkOrder[];
  onResolveCoords?: (jobId: string, lat: number, lng: number, address: string) => void;
};

function bestAddress(job: WorkOrder): string {
  const candidates = [job.location, (job as any).locationText]
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

export default function RoutesMapView({ routes, jobsById, unroutedJobs, onResolveCoords }: RoutesMapViewProps) {
  const safeRoutes = routes || [];
  const safeUnrouted = unroutedJobs || [];
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const linesRef = useRef<any[]>([]);
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, [number, number]>>({});
  const [geocoding, setGeocoding] = useState(false);

  // Every job the map needs to place: routed jobs (via jobsById) + unrouted.
  const allJobs: WorkOrder[] = (() => {
    const seen = new Set<string>();
    const out: WorkOrder[] = [];
    safeRoutes.forEach(r => jobIdsOf(r).forEach(id => {
      const job = jobsById[id];
      if (job && !seen.has(job.id)) { seen.add(job.id); out.push(job); }
    }));
    safeUnrouted.forEach(j => { if (!seen.has(j.id)) { seen.add(j.id); out.push(j); } });
    return out;
  })();

  useEffect(() => {
    const needsGeocode = allJobs.filter(j => {
      const addr = bestAddress(j);
      if (!addr) return false;
      const hasFresh = j.lat && j.lng && (!j.geocodedAddress || j.geocodedAddress === addr);
      return !hasFresh && !geocodedCoords[j.id];
    });
    if (needsGeocode.length === 0) { setGeocoding(false); return; }

    let cancelled = false;
    setGeocoding(true);

    (async () => {
      const results: Record<string, [number, number]> = {};
      for (let i = 0; i < needsGeocode.length; i++) {
        if (cancelled) break;
        const job = needsGeocode[i];
        const addr = bestAddress(job);
        const coords = await geocodeLocation(addr);
        if (coords) {
          results[job.id] = coords;
          onResolveCoords?.(job.id, coords[0], coords[1], addr);
        }
        if (i < needsGeocode.length - 1) await new Promise(r => setTimeout(r, 1100));
      }
      if (!cancelled) {
        setGeocodedCoords(prev => ({ ...prev, ...results }));
        setGeocoding(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allJobs.map(j => j.id).join(',')]);

  const coordsFor = (job: WorkOrder): [number, number] | null => {
    if (job.lat && job.lng) return [job.lat, job.lng];
    return geocodedCoords[job.id] || null;
  };

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
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markersRef.current = []; linesRef.current = []; }
    };
  }, []);

  // Rebuild markers + route polylines whenever routes/jobs/coords change.
  useEffect(() => {
    if (!mapRef.current) return;
    import('leaflet').then((L) => {
      const leaflet = L.default || L;
      const map = mapRef.current;
      if (!map) return;

      markersRef.current.forEach(m => m.remove());
      linesRef.current.forEach(l => l.remove());
      markersRef.current = [];
      linesRef.current = [];

      const allBounds: [number, number][] = [];

      safeRoutes.forEach((route, idx) => {
        const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
        const stops = jobIdsOf(route)
          .map(id => jobsById[id])
          .filter((j): j is WorkOrder => !!j)
          .map((j, i) => ({ job: j, coords: coordsFor(j), stopNumber: i + 1 }))
          .filter(s => s.coords) as { job: WorkOrder; coords: [number, number]; stopNumber: number }[];

        if (stops.length > 1) {
          const line = leaflet.polyline(stops.map(s => s.coords), { color, weight: 3, opacity: 0.7 }).addTo(map);
          linesRef.current.push(line);
        }

        stops.forEach(({ job, coords, stopNumber }) => {
          allBounds.push(coords);
          const icon = leaflet.divIcon({
            html: `<div style="background:${color};width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
                     <span style="transform:rotate(45deg);font-size:11px;font-weight:900;color:white;font-family:monospace;">${stopNumber}</span>
                   </div>`,
            className: '', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -30],
          });
          const marker = leaflet.marker(coords, { icon })
            .addTo(map)
            .bindPopup(`<div style="font-family:monospace;min-width:160px;"><p style="font-size:10px;font-weight:900;text-transform:uppercase;margin:0 0 2px 0;">${jobLabel(job)}</p><p style="font-size:9px;color:#e53e3e;font-weight:900;text-transform:uppercase;margin:0 0 2px 0;">${route.name}</p><p style="font-size:9px;color:#555;margin:0;">${job.location || ''}</p></div>`);
          markersRef.current.push(marker);
        });
      });

      safeUnrouted.forEach(job => {
        const coords = coordsFor(job);
        if (!coords) return;
        allBounds.push(coords);
        const icon = leaflet.divIcon({
          html: `<div style="background:#6b7280;width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
          className: '', iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12],
        });
        const marker = leaflet.marker(coords, { icon })
          .addTo(map)
          .bindPopup(`<div style="font-family:monospace;min-width:160px;"><p style="font-size:10px;font-weight:900;text-transform:uppercase;margin:0 0 2px 0;">${jobLabel(job)}</p><p style="font-size:9px;color:#888;text-transform:uppercase;margin:0 0 2px 0;">Unrouted</p><p style="font-size:9px;color:#555;margin:0;">${job.location || ''}</p></div>`);
        markersRef.current.push(marker);
      });

      if (allBounds.length > 0) {
        map.fitBounds(leaflet.latLngBounds(allBounds), { padding: [30, 30], maxZoom: 13 });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeRoutes, safeUnrouted, geocodedCoords, jobsById]);

  return (
    <div className="relative w-full h-full">
      {geocoding && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-bg-elevated border border-border-main rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
          <div className="h-3 w-3 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Resolving locations...</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" style={{ background: '#1a1a1a' }} />
    </div>
  );
}
