'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
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

export default function AdminMapView({ jobs, selectedJob, onSelectJob }: AdminMapViewProps) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

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
      });

      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
      addMarkers(leaflet, map, jobs);

      if (jobs.length > 0) {
        const bounds = leaflet.latLngBounds(jobs.map(j => [j.lat!, j.lng!] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = [];
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    import('leaflet').then((L) => {
      const leaflet = L.default || L;
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      addMarkers(leaflet, mapRef.current, jobs);
      if (jobs.length > 0) {
        const bounds = leaflet.latLngBounds(jobs.map(j => [j.lat!, j.lng!] as [number, number]));
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    });
  }, [jobs]);

  useEffect(() => {
    if (!mapRef.current || !selectedJob?.lat || !selectedJob?.lng) return;
    mapRef.current.setView([selectedJob.lat, selectedJob.lng], 15, { animate: true });
  }, [selectedJob]);

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
    <div ref={containerRef} className="w-full h-full rounded-lg" style={{ background: '#1a1a1a' }} />
  );
}
