"use server";

import { optimizeRoutes } from "@/ai/flows/admin-route-optimization-flow";
import type { AdminRouteOptimizationInput, AdminRouteOptimizationOutput } from "@/ai/flows/admin-route-optimization-flow";

/**
 * @fileOverview Administrative server action for AI-driven route optimization.
 * Orchestrates batch logistical intelligence for unassigned mission pools.
 */
export async function getOptimizedRoutes(
  input: AdminRouteOptimizationInput
): Promise<AdminRouteOptimizationOutput> {
  try {
    if (!input.unassignedJobs || input.unassignedJobs.length === 0) {
      throw new Error("Mission Pool Empty: No unassigned jobs located in registry.");
    }

    if (!input.availableTechnicians || input.availableTechnicians.length === 0) {
      throw new Error("Operative Registry Empty: No available field staff for allocation.");
    }

    if (!input.targetRouteCount || input.targetRouteCount < 1) {
      throw new Error("Logistical Error: Route quantity must be at least 1.");
    }

    console.log(`AI Route Optimization Initiated: Analyzing ${input.unassignedJobs.length} jobs into ${input.targetRouteCount} routes.`);
    
    const result = await optimizeRoutes(input);
    
    if (!result || !result.proposedRoutes) {
      throw new Error("Intelligence Terminal Error: Optimization engine returned null manifest.");
    }

    console.log(`AI Route Optimization Success: ${result.proposedRoutes.length} tactical routes architected.`);
    return result;
  } catch (error: any) {
    console.error("Critical Route Intelligence Failure:", {
        message: error.message,
        params: { 
            jobCount: input.unassignedJobs?.length, 
            techCount: input.availableTechnicians?.length,
            targetCount: input.targetRouteCount
        }
    });

    const errorMsg = error.message || "";
    if (errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('429')) {
      throw new Error("AI ROUTING QUOTA EXHAUSTED: Please verify Gemini API credits or transition to manual batching.");
    }
    
    throw new Error(errorMsg || "Failed to generate optimized routing plan.");
  }
}
