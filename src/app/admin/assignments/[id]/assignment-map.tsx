'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  if (!address) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch { /* silent */ }
  return null;
}

type Props = { location: string; lat?: number; lng?: number };

export default function AssignmentMap({ location, lat, lng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const coords: [number, number] | null =
        lat && lng ? [lat, lng] : await geocodeAddress(location);
      if (cancelled || !coords || !containerRef.current || mapRef.current) return;

      const leafletMod = await import('leaflet');
      const L = (leafletMod as any).default ?? leafletMod;
      delete (L.Icon.Default.prototype as any)._getIconUrl;

      const map = L.map(containerRef.current, {
        center: coords,
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      L.marker(coords, {
        icon: L.divIcon({
          html: `<div style="width:22px;height:22px;border-radius:50%;background:#00d36f;border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 16px rgba(0,211,111,0.5),0 2px 6px rgba(0,0,0,0.4)"></div>`,
          className: '',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(map);

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [location, lat, lng]);

  return <div ref={containerRef} className="w-full h-full" />;
}
