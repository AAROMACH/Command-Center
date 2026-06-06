"use server";

import { formatCityState } from "@/lib/utils";
import type { WorkOrder, Technician, Route } from "@/lib/types";

/**
 * @fileOverview Master Algorithmic Dispatch Engine.
 * Implements high-fidelity deterministic routing based on:
 * 1. Operative Geographic Anchor (Base Address).
 * 2. Mission Temporal Sequence (Start Times).
 * 3. Tactical Urgency (Priority weighting).
 */

export async function getOptimizedRoutes(input: {
  unassignedJobs: any[];
  availableTechnicians: any[];
  targetRouteCount: number;
}): Promise<{
  routes: {
    routeId: string;
    technicianId: string;
    technicianName: string;
    jobIds: string[];
    reasoning: string;
    estimatedRouteLabel: string;
  }[];
  unassignedJobIds: string[];
  warnings?: string[];
}> {
  try {
    const { unassignedJobs, availableTechnicians, targetRouteCount } = input;

    // 1. DATA VALIDATION & ROSTER SCRUBBING
    const validTechs = availableTechnicians.filter(t => t.id && t.name && (t.currentLocation || t.address));
    const validJobs = unassignedJobs.filter(j => j.id && j.location);

    if (validJobs.length === 0 || validTechs.length === 0) {
      return {
        routes: [],
        unassignedJobIds: unassignedJobs.map(j => j.id),
        warnings: ["Registry Insufficient: Verify operative base locations and mission pool."]
      };
    }

    // 2. TEMPORAL & TACTICAL SEQUENCING
    // Sort jobs by priority (Critical first) and then by schedule time
    const prioritizedJobs = [...validJobs].sort((a, b) => {
      const pMap = { critical: 0, high: 1, medium: 2, low: 3 };
      const pDiff = (pMap[a.priority as keyof typeof pMap] ?? 2) - (pMap[b.priority as keyof typeof pMap] ?? 2);
      if (pDiff !== 0) return pDiff;
      return (a.scheduleTime || '').localeCompare(b.scheduleTime || '');
    });

    const routes: any[] = [];
    const assignedJobIds = new Set<string>();
    
    // 3. TACTICAL FORMATION GENERATION
    // Limit to either targetRouteCount or available tech roster
    const activeRouteCount = Math.min(targetRouteCount, validTechs.length);

    for (let i = 0; i < activeRouteCount; i++) {
      const tech = validTechs[i];
      const techBase = formatCityState(tech.currentLocation || tech.address || "");
      const techCity = techBase.split(',')[0].trim();

      // Cluster Strategy: 
      // 1. Find jobs in tech's home city
      // 2. Find jobs in tech's home state
      // 3. Fill with remaining high priority jobs
      
      let routeJobs = prioritizedJobs
        .filter(j => !assignedJobIds.has(j.id))
        .filter(j => j.location.includes(techCity))
        .slice(0, 4); // Max 4 jobs per cluster for operative safety

      // Expansion if home city is clear
      if (routeJobs.length < 2) {
        const extraJobs = prioritizedJobs
          .filter(j => !assignedJobIds.has(j.id) && !routeJobs.some(rj => rj.id === j.id))
          .filter(j => j.location.includes(techBase.split(',')[1]?.trim() || "MI"))
          .slice(0, 4 - routeJobs.length);
        routeJobs = [...routeJobs, ...extraJobs];
      }

      if (routeJobs.length > 0) {
        routeJobs.forEach(j => assignedJobIds.add(j.id));
        
        // Sequence by time for final manifest
        const sequencedJobIds = routeJobs
          .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || ''))
          .map(j => j.id);

        routes.push({
          routeId: `route-${Date.now()}-${i}`,
          technicianId: tech.id,
          technicianName: tech.name,
          jobIds: sequencedJobIds,
          reasoning: `Geographic cluster anchored to ${techCity}. Sequence optimized by mission priority and start times.`,
          estimatedRouteLabel: `${techCity} Tactical Cluster`
        });
      }
    }

    return {
      routes,
      unassignedJobIds: validJobs.filter(j => !assignedJobIds.has(j.id)).map(j => j.id),
      warnings: routes.length < targetRouteCount ? ["Roster saturation reached. Unable to generate additional formations."] : []
    };

  } catch (error: any) {
    console.error("[SERVER] TACTICAL ROUTING CRASH:", error.message);
    return {
      routes: [],
      unassignedJobIds: input.unassignedJobs.map(j => j.id),
      warnings: ["Tactical routing engine encountered a registry error. Please use Manual Dispatch."]
    };
  }
}