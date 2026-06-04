import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
    const response = await geocoder.geocode({ location: { lat, lng } });
    if (response.results && response.results[0]) {
      return formatCityState(response.results[0].formatted_address);
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
