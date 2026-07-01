'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { WorkOrder, Route } from '@/lib/types';

const ROUTE_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6',
];

async function geocodeLocation(location: string): Promise<[number, number] | null> {
  if (!location) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch { /* silent */ }
  return null;
}

type Props = {
  routes: Route[];
  allWorkOrders: WorkOrder[];
  selectedRouteId: string | null;
  onSelectRoute?: (id: string) => void;
};

export default function RoutesMapView({ routes, allWorkOrders, selectedRouteId, onSelectRoute }: Props) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<any[]>([]);
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, [number, number]>>({});

  // Geocode jobs in routes that need it
  useEffect(() => {
    const routeJobIds = new Set(routes.flatMap(r => r.workOrderIds));
    const routeJobs = allWorkOrders.filter(j => routeJobIds.has(j.id));
    const needsGeocode = routeJobs.filter(j => !j.lat && !j.lng && j.location && !geocodedCoords[j.id]);
    if (needsGeocode.length === 0) return;

    let cancelled = false;
    (async () => {
      const results: Record<string, [number, number]> = {};
      for (let i = 0; i < needsGeocode.length; i++) {
        if (cancelled) break;
        const job = needsGeocode[i];
        const coords = await geocodeLocation(job.location);
        if (coords) results[job.id] = coords;
        if (i < needsGeocode.length - 1) await new Promise(r => setTimeout(r, 1100));
      }
      if (!cancelled) setGeocodedCoords(prev => ({ ...prev, ...results }));
    })();

    return () => { cancelled = true; };
  }, [routes, allWorkOrders]);

  // Init map once
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    import('leaflet').then((L) => {
      const leaflet = L.default || L;
      if (mapRef.current) return;

      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;

      const map = leaflet.map(containerRef.current!, {
        center: [39.8283, -98.5795],
        zoom: 4,
        zoomControl: true,
        attributionControl: true,
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
      }
    };
  }, []);

  // Redraw route layers whenever data changes
  useEffect(() => {
    if (!mapRef.current) return;

    import('leaflet').then((L) => {
      const leaflet = L.default || L;
      const map = mapRef.current;
      if (!map) return;

      // Clear existing layers
      layersRef.current.forEach(l => { try { map.removeLayer(l); } catch { /* already removed */ } });
      layersRef.current = [];

      const allCoords: [number, number][] = [];
      const selectedCoords: [number, number][] = [];

      routes.forEach((route, routeIdx) => {
        const color = ROUTE_COLORS[routeIdx % ROUTE_COLORS.length];
        const isSelected = !selectedRouteId || route.id === selectedRouteId;
        const opacity = selectedRouteId && route.id !== selectedRouteId ? 0.3 : 1;

        const jobs = route.workOrderIds
          .map(id => allWorkOrders.find(j => j.id === id))
          .filter(Boolean) as WorkOrder[];

        const coords: [number, number][] = jobs
          .map(j => {
            if (j.lat && j.lng) return [j.lat, j.lng] as [number, number];
            return geocodedCoords[j.id] ?? null;
          })
          .filter(Boolean) as [number, number][];

        if (coords.length === 0) return;

        // Polyline connecting stops in order
        if (coords.length > 1) {
          const line = leaflet.polyline(coords, {
            color,
            weight: isSelected ? 4 : 2,
            opacity,
            dashArray: selectedRouteId && route.id !== selectedRouteId ? '6,4' : undefined,
          }).addTo(map);
          line.on('click', () => onSelectRoute?.(route.id));
          layersRef.current.push(line);
        }

        // Numbered stop markers
        coords.forEach((coord, idx) => {
          const marker = leaflet.marker(coord, {
            icon: leaflet.divIcon({
              html: `<div style="
                width:24px;height:24px;border-radius:50%;
                background:${color};
                border:2.5px solid white;
                box-shadow:0 2px 6px rgba(0,0,0,0.4);
                display:flex;align-items:center;justify-content:center;
                font-size:10px;font-weight:900;color:white;
                opacity:${opacity};
                font-family:monospace;
              ">${idx + 1}</div>`,
              className: '',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            }),
          }).addTo(map);

          const job = jobs[idx];
          marker.bindTooltip(
            `<b style="font-size:10px">${route.name}</b><br/>Stop ${idx + 1}: ${job?.description || job?.id || ''}`,
            { direction: 'top', offset: [0, -14] }
          );
          marker.on('click', () => onSelectRoute?.(route.id));
          layersRef.current.push(marker);
          allCoords.push(coord);
          if (route.id === selectedRouteId) selectedCoords.push(coord);
        });
      });

      // Fit bounds
      const boundsCoords = selectedRouteId && selectedCoords.length > 0 ? selectedCoords : allCoords;
      if (boundsCoords.length > 0) {
        map.fitBounds(boundsCoords, { padding: [40, 40], maxZoom: 14 });
      }
    });
  }, [routes, allWorkOrders, geocodedCoords, selectedRouteId]);

  return (
    <div className="rounded-xl overflow-hidden border border-border-sub" style={{ height: 380 }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
