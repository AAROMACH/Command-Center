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
