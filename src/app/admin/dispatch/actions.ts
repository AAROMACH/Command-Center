"use server";

import { recommendTechnician } from "@/ai/flows/admin-assignment-recommendation-flow";
import type { AdminAssignmentRecommendationInput, AdminAssignmentRecommendationOutput } from "@/ai/flows/admin-assignment-recommendation-flow";

export async function getRecommendation(
  input: AdminAssignmentRecommendationInput
): Promise<AdminAssignmentRecommendationOutput> {
  try {
    const recommendation = await recommendTechnician(input);
    return recommendation;
  } catch (error) {
    console.error("Error getting recommendation:", error);
    throw new Error("Failed to get AI recommendation.");
  }
}
