'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

/**
 * Small map of one address (OpenStreetMap / CARTO tiles via Leaflet — no API
 * key). Used on assignments, the tech check-in dialog, client site pages and
 * the Directory map. Import it with next/dynamic and ssr:false (Leaflet
 * needs the browser).
 */

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

// Metro Detroit — shown when there's no address (or it can't be found).
const DEFAULT_CENTER: [number, number] = [42.48, -83.25];

type Props = {
  location?: string | null;
  lat?: number;
  lng?: number;
  zoom?: number;
  /** Allow pinch/drag and zoom buttons (full maps); off for small previews. */
  interactive?: boolean;
};

export default function LocationMap({ location, lat, lng, zoom = 13, interactive = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let map: any = null;

    (async () => {
      const found: [number, number] | null = lat && lng ? [lat, lng] : await geocodeAddress(location || '');
      const leafletMod = await import('leaflet');
      // A quick re-render can start a second setup before this one finishes —
      // only the latest may create the map, and never on a used container.
      if (cancelled || (el as any)._leaflet_id) return;
      const L = (leafletMod as any).default ?? leafletMod;
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      const coords = found || DEFAULT_CENTER;

      map = L.map(el, {
        center: coords,
        zoom: found ? zoom : 9,
        zoomControl: interactive,
        attributionControl: false,
        // Previews shouldn't trap a finger scrolling the page on phones.
        dragging: interactive,
        touchZoom: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

      if (found) {
        L.marker(coords, {
          icon: L.divIcon({
            html: `<div style="width:22px;height:22px;border-radius:50%;background:#00d36f;border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 16px rgba(0,211,111,0.5),0 2px 6px rgba(0,0,0,0.4)"></div>`,
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).addTo(map);
      }

      mapRef.current = map;
      // Containers in dialogs/tabs size after mount — re-measure.
      setTimeout(() => map?.invalidateSize(), 250);
    })();

    return () => {
      cancelled = true;
      if (map) { map.remove(); map = null; }
      mapRef.current = null;
    };
  }, [location, lat, lng, zoom, interactive]);

  return <div ref={containerRef} className="w-full h-full" />;
}
