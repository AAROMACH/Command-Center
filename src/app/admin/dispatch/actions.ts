"use server";

import { formatCityState } from "@/lib/utils";
import type { WorkOrder, Technician, Route } from "@/lib/types";

/**
 * @fileOverview Master Algorithmic Dispatch Engine.
 * Implements high-fidelity deterministic routing based on:
 * 1. Geographic Anchors (City/ST).
 * 2. Mission Temporal Sequence (Start Times).
 * 3. Tactical Urgency (Priority weighting).
 * 
 * Protocol Update: This engine now prioritizes the requested route quantity 
 * even if no technician match is found for a specific cluster.
 */

export async function getOptimizedRoutes(input: {
  unassignedJobs: any[];
  availableTechnicians: any[];
  targetRouteCount: number;
}): Promise<{
  routes: {
    routeId: string;
    technicianId: string | null;
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
    const validJobs = unassignedJobs.filter(j => j.id && j.location);

    if (validJobs.length === 0) {
      return {
        routes: [],
        unassignedJobIds: unassignedJobs.map(j => j.id),
        warnings: ["Registry Empty: No unassigned missions found in pool."]
      };
    }

    // 2. TEMPORAL & TACTICAL SEQUENCING
    const prioritizedJobs = [...validJobs].sort((a, b) => {
      const pMap = { critical: 0, high: 1, medium: 2, low: 3 };
      const pDiff = (pMap[a.priority as keyof typeof pMap] ?? 2) - (pMap[b.priority as keyof typeof pMap] ?? 2);
      if (pDiff !== 0) return pDiff;
      return (a.scheduleTime || '').localeCompare(b.scheduleTime || '');
    });

    // 3. GEOGRAPHIC CLUSTERING
    // Group jobs by City, ST to minimize field travel friction
    const cityGroups: Record<string, string[]> = {};
    prioritizedJobs.forEach(job => {
        const city = formatCityState(job.location);
        if (!cityGroups[city]) cityGroups[city] = [];
        cityGroups[city].push(job.id);
    });

    // 4. TACTICAL FORMATION GENERATION
    // Flatten job pool while maintaining geographic grouping
    const sortedCities = Object.keys(cityGroups).sort((a, b) => cityGroups[b].length - cityGroups[a].length);
    const jobPool: string[] = [];
    sortedCities.forEach(city => jobPool.push(...cityGroups[city]));

    const routes: any[] = [];
    const assignedJobIds = new Set<string>();
    
    // Calculate even job distribution per requested route count
    const jobsPerRoute = Math.ceil(jobPool.length / targetRouteCount);

    for (let i = 0; i < targetRouteCount; i++) {
        const start = i * jobsPerRoute;
        const end = Math.min(start + jobsPerRoute, jobPool.length);
        const routeJobIds = jobPool.slice(start, end);

        if (routeJobIds.length > 0) {
            // Find a common location anchor for the cluster
            const firstJobId = routeJobIds[0];
            const firstJob = prioritizedJobs.find(j => j.id === firstJobId);
            const cityAnchor = firstJob ? formatCityState(firstJob.location) : "Regional";
            const cityNameOnly = cityAnchor.split(',')[0].trim();

            // Roster Handshake: Look for technician with matching city base
            const nearbyTech = availableTechnicians.find(t => {
                const techBase = formatCityState(t.currentLocation || t.address || "");
                return techBase.includes(cityNameOnly);
            });

            routes.push({
                routeId: `route-${Date.now()}-${i}`,
                technicianId: nearbyTech?.id || null,
                technicianName: nearbyTech?.name || "",
                jobIds: routeJobIds,
                reasoning: `Geographic cluster anchored to ${cityAnchor}. Sequence optimized by mission priority and start times.`,
                estimatedRouteLabel: `${cityNameOnly} Tactical Cluster ${i + 1}`
            });

            routeJobIds.forEach(id => assignedJobIds.add(id));
        }
    }

    return {
      routes,
      unassignedJobIds: validJobs.filter(j => !assignedJobIds.has(j.id)).map(j => j.id),
      warnings: routes.length < targetRouteCount ? ["Registry Concentration: Job volume insufficient for full tactical distribution."] : []
    };

  } catch (error: any) {
    console.error("[SERVER] TACTICAL ROUTING FAILURE:", error.message);
    return {
      routes: [],
      unassignedJobIds: input.unassignedJobs.map(j => j.id),
      warnings: ["Tactical routing engine encountered a registry error. Please use Manual Dispatch."]
    };
  }
}
