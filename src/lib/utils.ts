import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Tactical geographic anchor extractor.
 * Converts "123 Main St, Royal Oak, MI 48067" -> "Royal Oak, MI"
 */
export function formatCityState(location: string) {
  if (!location) return 'N/A';
  const parts = location.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    const city = parts[parts.length - 2];
    const statePart = parts[parts.length - 1];
    const state = statePart.split(' ')[0];
    return `${city}, ${state}`;
  }
  return location;
}