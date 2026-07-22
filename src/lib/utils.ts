import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { normalizeLegacyRole } from "./permissions"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const TECH_ROLES = ['field_technician', 'project_lead'];

/**
 * Whether a user can be deployed to a job as a field technician. Anyone
 * holding field_technician or project_lead is always deployable, no matter
 * what other roles they also carry (e.g. a dispatcher who also does field
 * work). Everyone else — Client-only, Admin-only, or Client+Admin
 * combinations with no tech role at all — is excluded from assignment
 * pickers.
 */
export function isAssignableTechnician(t: { roles?: string[]; role?: string }): boolean {
  if ((t.roles || []).some(r => TECH_ROLES.includes(r.toLowerCase()))) return true;
  const normalized = normalizeLegacyRole(t.role);
  return normalized ? TECH_ROLES.includes(normalized) : false;
}

/**
 * A technician whose account has been deactivated. They remain deployable
 * (marking inactive never removes them from assignment pickers) but are
 * sorted to the bottom of tech lists and shown with an "Inactive" tag.
 */
export function isInactiveTechnician(t: { accountStatus?: string }): boolean {
  return t.accountStatus === 'inactive';
}

/**
 * Orders a technician list for assignment/deployment pickers: active
 * operatives first, deactivated accounts grouped at the bottom. This is a
 * stable partition — it only moves inactive techs down and otherwise preserves
 * whatever order the caller already applied (reliability, alphabetical, etc.).
 */
export function sortTechniciansForDeployment<T extends { accountStatus?: string }>(techs: T[]): T[] {
  const active = techs.filter(t => !isInactiveTechnician(t));
  const inactive = techs.filter(isInactiveTechnician);
  return [...active, ...inactive];
}

/**
 * Recursively strips `undefined` values from an object/array. Firestore's
 * updateDoc() rejects any undefined field value, even nested inside an
 * array of objects, so build write payloads through this first.
 */
export function sanitize<T = any>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize) as any;
  const result: any = {};
  Object.keys(obj as any).forEach(key => {
    const val = (obj as any)[key];
    if (val !== undefined) result[key] = sanitize(val);
  });
  return result;
}

/**
 * Tactical geographic anchor extractor.
 * Converts "36246 St Dr, Wayne, MI 48184, USA" -> "Wayne, MI"
 */
export function formatCityState(location: string) {
  if (!location) return 'N/A';
  const parts = location.split(',').map(p => p.trim());
  
  // Detect standard Google format: ... City, ST Zip, USA
  const usaIndex = parts.indexOf('USA');
  
  if (usaIndex !== -1) {
    if (usaIndex >= 2) {
      const city = parts[usaIndex - 2];
      const statePart = parts[usaIndex - 1];
      const state = statePart.split(' ')[0];
      return `${city}, ${state}`;
    } else if (usaIndex === 1) {
      // Case: City, State Zip, USA
      const city = parts[0];
      const state = parts[1].split(' ')[0];
      return `${city}, ${state}`;
    }
  }

  // Fallback: search for something like "City, ST" at the end (ignoring zip)
  if (parts.length >= 2) {
    const city = parts[parts.length - 2];
    const statePart = parts[parts.length - 1];
    const state = statePart.split(' ')[0];
    return `${city}, ${state}`;
  }
  
  return location;
}

/**
 * High-fidelity Reverse Geocoding Utility.
 * Resolves raw coordinates into tactical city/state anchors.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (typeof window === 'undefined' || !window.google || !window.google.maps) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; // Fallback to coords if API restricted
  }
  
  const geocoder = new window.google.maps.Geocoder();
  try {
    const response = await new Promise<any>((resolve, reject) => {
      geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
        if (status === 'OK') resolve(results);
        else reject(status);
      });
    });
    
    if (response && response[0]) {
      return formatCityState(response[0].formatted_address);
    }
  } catch (e) {
    console.warn("Tactical resolution failed:", e);
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * Operative Location Retrieval.
 * Returns verified city location or raw coords if geocoding is restricted.
 */
export async function getTacticalLocation(): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      resolve("GPS Unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const city = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        resolve(city);
      },
      () => resolve("GPS Restricted"),
      { timeout: 5000 }
    );
  });
}

/**
 * Current GPS coordinates, or null if unavailable/denied. Complements
 * getTacticalLocation (which returns a human-readable city) for mileage math.
 */
export async function getTacticalCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 },
    );
  });
}

/**
 * Haversine formula to calculate distance between two coordinates in miles.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of the earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const MILES_TO_KM = 1.60934;

/** Formats a mileage figure (always computed in miles internally) per the tech's unit preference. */
export function formatDistance(miles: number, unit: 'mi' | 'km' = 'mi'): string {
  const value = unit === 'km' ? miles * MILES_TO_KM : miles;
  return `${value.toFixed(1)} ${unit}`;
}

/**
 * Parses a free-text schedule time ("9:00 AM", "10:00 AM EST", "15:30",
 * "3:10 PM") into minutes-since-midnight for correct chronological sorting.
 * A plain string sort puts "10:00 AM" before "9:00 AM" because '1' < '9' —
 * this fixes that. Unparseable/empty values sort last.
 */
export function scheduleTimeToMinutes(raw: string | undefined | null): number {
  const str = (raw || '').trim();
  const match = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  if (Number.isNaN(hour) || Number.isNaN(minute)) return Number.MAX_SAFE_INTEGER;
  return hour * 60 + minute;
}

/** Comparator for Array.sort — orders jobs chronologically by scheduleTime. */
export function compareScheduleTime(a: string | undefined | null, b: string | undefined | null): number {
  return scheduleTimeToMinutes(a) - scheduleTimeToMinutes(b);
}

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

/**
 * Forward-geocode a free-text address into coordinates via Nominatim.
 * Results are cached in-memory per address string for the session.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    const coords = data && data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
    geocodeCache.set(key, coords);
    return coords;
  } catch {
    return null;
  }
}

/**
 * Total mileage for a day's route: home -> stop 1 -> stop 2 -> ... -> home.
 * Stops without resolvable coordinates are skipped (they can't contribute a
 * real leg), so the total is a best-effort figure, not silently wrong.
 */
export function sumRouteMileage(home: { lat: number; lng: number }, stops: { lat: number; lng: number }[]): number {
  const points = [home, ...stops, home];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += calculateDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return total;
}
