
"use server";

import { recommendTechnician } from "@/ai/flows/admin-assignment-recommendation-flow";
import type { AdminAssignmentRecommendationInput, AdminAssignmentRecommendationOutput } from "@/ai/flows/admin-assignment-recommendation-flow";

/**
 * @fileOverview Administrative server action for AI-driven technician allocation.
 * Orchestrates the handshake between the dispatch terminal and the Genkit recommendation flow.
 */
export async function getRecommendation(
  input: AdminAssignmentRecommendationInput
): Promise<AdminAssignmentRecommendationOutput> {
  try {
    // Audit available technician pool size
    if (!input.availableTechnicians || input.availableTechnicians.length === 0) {
      console.warn("AI Dispatch Handshake: Empty operative registry transmitted.");
      throw new Error("No field operatives currently available in the dispatch pool.");
    }

    console.log(`AI Analysis Initiated: Mission ${input.workOrder.id.toUpperCase()} vs ${input.availableTechnicians.length} Operatives.`);
    
    // Execute tactical analysis flow
    const recommendation = await recommendTechnician(input);
    
    if (!recommendation || !recommendation.recommendedTechnicianId) {
      console.error("AI Logic Terminal: Recommendation engine returned null result.");
      throw new Error("AI engine failed to identify an optimal match.");
    }

    console.log(`AI Analysis Success: Operative ${recommendation.recommendedTechnicianId} identified as primary target.`);
    return recommendation;
  } catch (error: any) {
    // Precision logging for Command Center audit
    console.error("Critical Dispatch Intelligence Failure:", {
        message: error.message,
        stack: error.stack,
        params: { 
            woId: input.workOrder.id, 
            techCount: input.availableTechnicians?.length 
        }
    });

    // Detect Quota Exhaustion (429 / RESOURCE_EXHAUSTED)
    const errorMsg = error.message || "";
    if (errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('429')) {
      throw new Error("AI DISPATCH QUOTA EXHAUSTED: Please verify Gemini API credits in Google AI Studio or transition to Manual Dispatch protocol.");
    }
    
    // Pass tactical error message to UI
    throw new Error(errorMsg || "Failed to retrieve AI dispatch intelligence.");
  }
}
