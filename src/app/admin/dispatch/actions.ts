"use server";

import { optimizeRoutes } from "@/ai/flows/admin-route-optimization-flow";
import type { AdminRouteOptimizationInput, AdminRouteOptimizationOutput } from "@/ai/flows/admin-route-optimization-flow";
import { formatCityState } from "@/lib/utils";

/**
 * @fileOverview Administrative server action for Auto Dispatch.
 * Implements a "Safety-First" architecture:
 * 1. Strict Input Sanitization (Privacy protection for technicians).
 * 2. Deterministic Fallback Dispatcher (If AI/GenAI fails).
 * 3. Black-Box Error Protocol (Never leak tech data to UI).
 */

/**
 * DETERMINISTIC FALLBACK DISPATCHER
 * Used when AI intelligence is unavailable (Quota, Auth, or System failures).
 * Clusters by city and priority.
 */
function generateFallbackRoutes(input: AdminRouteOptimizationInput): AdminRouteOptimizationOutput {
  const { unassignedJobs, availableTechnicians, targetRouteCount } = input;
  
  // Sort jobs by priority and then by city
  const sortedJobs = [...unassignedJobs].sort((a, b) => {
    const prio = { critical: 0, high: 1, medium: 2, low: 3 };
    const pDiff = prio[a.priority] - prio[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.location.localeCompare(b.location);
  });

  const routes: AdminRouteOptimizationOutput['routes'] = [];
  const assignedJobIds = new Set<string>();

  // Distribute jobs into buckets
  for (let i = 0; i < Math.min(targetRouteCount, availableTechnicians.length); i++) {
    const tech = availableTechnicians[i];
    const techBaseCity = tech.currentLocation.split(',')[0];
    
    // Find jobs in the same city or priority matches
    const techJobs = sortedJobs
        .filter(j => !assignedJobIds.has(j.id))
        .filter(j => j.location.includes(techBaseCity) || j.priority === 'critical')
        .slice(0, 5); // Max 5 jobs per fallback route

    if (techJobs.length > 0) {
      techJobs.forEach(j => assignedJobIds.add(j.id));
      routes.push({
        routeId: `fallback-${Date.now()}-${i}`,
        technicianId: tech.id,
        technicianName: tech.name,
        jobIds: techJobs.map(j => j.id),
        reasoning: `Deterministic cluster based on geographic anchor (${techBaseCity}) and mission priority.`,
        estimatedRouteLabel: `${techBaseCity} Tactical Cluster`
      });
    }
  }

  return {
    routes,
    unassignedJobIds: unassignedJobs.filter(j => !assignedJobIds.has(j.id)).map(j => j.id),
    warnings: ["AI Dispatch is unavailable. Fallback routing was used."]
  };
}

export async function getOptimizedRoutes(
  input: AdminRouteOptimizationInput
): Promise<AdminRouteOptimizationOutput> {
  try {
    // 1. DATA SANITIZATION & VALIDATION
    // Ensure we only dispatch valid technicians (Exclude admins/blank records)
    const validTechs = input.availableTechnicians
        .filter(t => t.id && t.name && !t.id.toLowerCase().includes('admin') && t.currentLocation)
        .map(t => ({
            ...t,
            currentLocation: formatCityState(t.currentLocation) // STRIP STREET ADDRESS
        }));

    // Clean and validate jobs
    const validJobs = input.unassignedJobs
        .filter(j => j.id && j.location)
        .map(j => ({
            ...j,
            location: formatCityState(j.location), // STRIP STREET ADDRESS
            // Enforce strict time format: HH:MM AM/PM only
            scheduleTime: (j.scheduleTime || '09:00 AM').split('→')[0].split('to')[0].trim()
        }));

    if (validJobs.length === 0 || validTechs.length === 0) {
        return {
            routes: [],
            unassignedJobIds: input.unassignedJobs.map(j => j.id),
            warnings: ["Insufficient registry data for optimization. Verify technician locations and mission pools."]
        };
    }

    const sanitizedInput: AdminRouteOptimizationInput = {
        ...input,
        unassignedJobs: validJobs,
        availableTechnicians: validTechs
    };

    // 2. ATTEMPT AI DISPATCH
    try {
        // Check for API Key presence before attempting handshake
        if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENAI_API_KEY) {
            throw new Error("CREDENTIAL_MISMATCH: API Key not found in operational environment.");
        }

        const result = await optimizeRoutes(sanitizedInput);
        if (!result || !result.routes) throw new Error("EMPTY_MANIFEST: AI Terminal returned null results.");
        return result;
    } catch (aiError: any) {
        // LOG REAL ERROR SECURELY ON SERVER
        const errorMessage = aiError.originalMessage || aiError.message || JSON.stringify(aiError);
        console.error("[SERVER] AI DISPATCH FAILURE:", errorMessage);
        
        // 3. TRIGGER DETERMINISTIC FALLBACK
        return generateFallbackRoutes(sanitizedInput);
    }

  } catch (error: any) {
    // CATASTROPHIC FAILURE RECOVERY
    console.error("[SERVER] CRITICAL DISPATCH ENGINE CRASH:", error.message);

    return {
      routes: [],
      unassignedJobIds: input.unassignedJobs.map(j => j.id),
      warnings: ["Auto Dispatch is temporarily unavailable. Please use Manual Dispatch."]
    };
  }
}
