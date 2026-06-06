"use server";

import { optimizeRoutes } from "@/ai/flows/admin-route-optimization-flow";
import type { AdminRouteOptimizationInput, AdminRouteOptimizationOutput } from "@/ai/flows/admin-route-optimization-flow";

/**
 * @fileOverview Administrative server action for AI-driven route optimization.
 * Orchestrates batch logistical intelligence for unassigned mission pools.
 * Implements strict error-shielding to prevent technical leakage to the UI.
 */
export async function getOptimizedRoutes(
  input: AdminRouteOptimizationInput
): Promise<AdminRouteOptimizationOutput> {
  try {
    if (!input.unassignedJobs || input.unassignedJobs.length === 0) {
      return { 
        proposedRoutes: [], 
        warnings: ["Mission Pool Empty: No unassigned jobs located in registry."] 
      };
    }

    if (!input.availableTechnicians || input.availableTechnicians.length === 0) {
      return { 
        proposedRoutes: [], 
        warnings: ["Operative Registry Empty: No available field staff for allocation."] 
      };
    }

    // Handshake with AI Logic
    const result = await optimizeRoutes(input);
    
    if (!result || !result.proposedRoutes) {
      throw new Error("Null output from AI engine.");
    }

    return result;
  } catch (error: any) {
    // LOG TECHNICAL ERROR SECURELY ON SERVER
    console.error("[SERVER] AUTO-DISPATCH PROTOCOL FAILURE:", {
        errorMessage: error.message,
        errorStack: error.stack,
        timestamp: new Date().toISOString()
    });

    // RETURN STANDARDIZED SAFE FAILURE OBJECT
    return {
      proposedRoutes: [],
      warnings: ["Auto Dispatch is temporarily unavailable. Please use Manual Dispatch."]
    };
  }
}
