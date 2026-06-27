'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { WorkOrder } from '@/lib/types';

type AdminMapViewProps = {
  jobs: WorkOrder[];
  selectedJob: WorkOrder | null;
  onSelectJob: (job: WorkOrder) => void;
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

async function geocodeLocation(location: string): Promise<[number, number] | null> {
  if (!location) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data && data[0]) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
  } catch { /* silent */ }
  return null;
}

export default function AdminMapView({ jobs, selectedJob, onSelectJob }: AdminMapViewProps) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, [number, number]>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);

  // Batch-geocode jobs that lack lat/lng
  useEffect(() => {
    const needsGeocode = jobs.filter(j => !j.lat && !j.lng && j.location);
    if (needsGeocode.length === 0) return;

    let cancelled = false;
    setGeocoding(true);
    setGeocodedCount(0);

    (async () => {
      const results: Record<string, [number, number]> = {};
      for (let i = 0; i < needsGeocode.length; i++) {
        if (cancelled) break;
        const job = needsGeocode[i];
        // Skip if already resolved
        if (geocodedCoords[job.id]) continue;
        const coords = await geocodeLocation(job.location);
        if (coords) results[job.id] = coords;
        setGeocodedCount(i + 1);
        // Rate-limit: 1 req/sec per Nominatim policy
        if (i < needsGeocode.length - 1) await new Promise(r => setTimeout(r, 1100));
      }
      if (!cancelled) {
        setGeocodedCoords(prev => ({ ...prev, ...results }));
        setGeocoding(false);
      }
    })();

    return () => { cancelled = true; };
  }, [jobs]);

  // Build effective jobs list (with resolved coords)
  const effectiveJobs = jobs.map(j => {
    if (j.lat && j.lng) return j;
    const coords = geocodedCoords[j.id];
    if (coords) return { ...j, lat: coords[0], lng: coords[1] };
    return j;
  }).filter(j => j.lat && j.lng);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    import('leaflet').then((L) => {
      const leaflet = L.default || L;

      if (mapRef.current) return;

      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const map = leaflet.map(containerRef.current!, {
        zoomControl: true,
        attributionControl: true,
        center: [39.8283, -98.5795],
        zoom: 4,
      });

      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = [];
      }
    };
  }, []);

  // Update markers whenever effectiveJobs changes
  useEffect(() => {
    if (!mapRef.current) return;
    import('leaflet').then((L) => {
      const leaflet = L.default || L;
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      addMarkers(leaflet, mapRef.current, effectiveJobs);
      if (effectiveJobs.length > 0) {
        const bounds = leaflet.latLngBounds(effectiveJobs.map(j => [j.lat!, j.lng!] as [number, number]));
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    });
  }, [effectiveJobs]);

  useEffect(() => {
    if (!mapRef.current || !selectedJob) return;
    const coords = selectedJob.lat && selectedJob.lng
      ? [selectedJob.lat, selectedJob.lng]
      : geocodedCoords[selectedJob.id];
    if (coords) mapRef.current.setView(coords, 15, { animate: true });
  }, [selectedJob, geocodedCoords]);

  function addMarkers(leaflet: any, map: any, jobList: WorkOrder[]) {
    jobList.forEach((job, index) => {
      if (!job.lat || !job.lng) return;
      const color = getColor(job.status);
      const markerHtml = `
        <div style="
          background: ${color};
          width: 32px; height: 32px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
        ">
          <span style="transform: rotate(45deg); font-size: 11px; font-weight: 900; color: white; font-family: monospace;">${index + 1}</span>
        </div>
      `;
      const icon = leaflet.divIcon({ html: markerHtml, className: '', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -36] });
      const marker = leaflet.marker([job.lat, job.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: monospace; min-width: 200px; padding: 4px;">
            <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 6px 0; color: #111;">
              ${job.title || job.description || `Job ${job.id.slice(0, 6).toUpperCase()}`}
            </p>
            <p style="font-size: 10px; color: #555; margin: 0 0 3px 0;">📍 ${job.location || 'TBD'}</p>
            <p style="font-size: 10px; color: #555; margin: 0 0 3px 0;">👤 ${(job as any).technicianName || 'Unassigned'}</p>
            <p style="font-size: 10px; color: #555; margin: 0 0 4px 0;">🕐 ${job.scheduleTime || 'Time TBD'}</p>
            <div style="
              display: inline-block; background: ${color}; color: white;
              font-size: 9px; font-weight: 900; text-transform: uppercase;
              padding: 2px 6px; border-radius: 3px; margin-top: 4px;
            ">${job.status}</div>
          </div>
        `, { maxWidth: 260 })
        .on('click', () => onSelectJob(job));
      markersRef.current.push(marker);
    });
  }

  return (
    <div className="relative w-full h-full">
      {geocoding && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-bg-elevated border border-border-main rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
          <div className="h-3 w-3 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Resolving {geocodedCount}/{jobs.filter(j => !j.lat && !j.lng && j.location).length} locations...
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
