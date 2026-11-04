'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import type { WorkOrder } from '@/lib/types';
import { SERVICE_AREA_BOUNDS, densityBreaks, densityGrid } from '@/lib/intel-insights';

/**
 * Job density across the service area: jobs (with saved coordinates) are binned
 * into ~10-mile grid squares and shaded on one blue ramp — the busiest areas
 * darkest, sparse areas light, empty areas uncolored. Hover a square for its
 * count and top cities.
 */

// Sequential single-hue ramp (light → dark), five classes by quantile.
const RAMP = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'];

export function JobDensityMap({ jobs }: { jobs: WorkOrder[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const layerRef = useRef<any>(null);

    const grid = useMemo(() => densityGrid(jobs), [jobs]);
    const breaks = useMemo(() => densityBreaks(grid.cells.map(c => c.count)), [grid]);
    // Spread the classes over the darkest end when there are fewer than five.
    const colors = RAMP.slice(RAMP.length - breaks.length);
    const colorFor = (count: number) => colors[Math.max(0, breaks.findIndex(b => count <= b))] || colors[colors.length - 1];

    // Zoom to where the jobs in view are (the whole service area when none).
    const fit = (map: any) => {
        if (!grid.cells.length) { map.fitBounds(SERVICE_AREA_BOUNDS); return; }
        const s = Math.min(...grid.cells.map(c => c.south)), w = Math.min(...grid.cells.map(c => c.west));
        const n = Math.max(...grid.cells.map(c => c.north)), e = Math.max(...grid.cells.map(c => c.east));
        map.fitBounds([[s, w], [n, e]], { padding: [24, 24], maxZoom: 9 });
    };

    // Create the map once.
    useEffect(() => {
        let cancelled = false;
        import('leaflet').then(L => {
            const leaflet = (L as any).default || L;
            if (cancelled || !containerRef.current || mapRef.current) return;
            const map = leaflet.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true });
            fit(map);
            leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 12,
                opacity: 0.85,
            }).addTo(map);
            mapRef.current = map;
            layerRef.current = leaflet.layerGroup().addTo(map);
            drawCells(leaflet);
            // Opened inside an animating dialog, the container's size isn't
            // final yet — re-measure once it has settled.
            setTimeout(() => { if (mapRef.current === map) { map.invalidateSize(); fit(map); } }, 250);
        });
        return () => {
            cancelled = true;
            mapRef.current?.remove();
            mapRef.current = null;
            layerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const drawCells = (leaflet: any) => {
        const layer = layerRef.current;
        if (!layer) return;
        layer.clearLayers();
        for (const cell of grid.cells) {
            const fill = colorFor(cell.count);
            const rect = leaflet.rectangle([[cell.south, cell.west], [cell.north, cell.east]], {
                stroke: true, color: '#ffffff', weight: 1, opacity: 0.6,
                fillColor: fill, fillOpacity: 0.78,
            });
            const cities = cell.cities.map(([c, n]) => `${c} (${n})`).join('<br/>');
            rect.bindTooltip(`<strong>${cell.count} job${cell.count !== 1 ? 's' : ''}</strong>${cities ? `<br/>${cities}` : ''}`, { sticky: true });
            layer.addLayer(rect);
        }
    };

    // Redraw (and re-frame) when the filtered jobs change.
    useEffect(() => {
        import('leaflet').then(L => { drawCells((L as any).default || L); if (mapRef.current) fit(mapRef.current); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grid, breaks]);

    return (
        <div className="space-y-2">
            <div className="relative h-[60vh] min-h-[320px] max-h-[560px] rounded-lg overflow-hidden border border-border-main isolate">
                <div ref={containerRef} className="absolute inset-0" aria-label="Job density map" role="img" />
                {breaks.length > 0 && (
                    <div className="absolute bottom-3 left-3 z-[400] rounded-md border border-border-main bg-bg-elevated/95 px-3 py-2 shadow-lg">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Jobs per ~10-mile square</p>
                        <div className="flex items-end gap-1">
                            {breaks.map((b, i) => (
                                <div key={b} className="flex flex-col items-center gap-1">
                                    <span className="block h-3 w-8 rounded-sm" style={{ background: colors[i] }} />
                                    <span className="text-[11px] font-mono text-text-secondary">
                                        {i === 0 ? (b === 1 ? '1' : `1–${b}`) : (breaks[i - 1] + 1 === b ? `${b}` : `${breaks[i - 1] + 1}–${b}`)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                {grid.plotted} job{grid.plotted !== 1 ? 's' : ''} mapped
                {grid.missingCoords > 0 && ` · ${grid.missingCoords} without saved coordinates`}
                {grid.outside > 0 && ` · ${grid.outside} outside the service area`}
            </p>
        </div>
    );
}
