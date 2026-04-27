'use server';
/**
 * @fileOverview This file implements a Genkit flow for recommending technicians for new work orders.
 *
 * - recommendTechnician - A function that handles the technician recommendation process.
 * - AdminAssignmentRecommendationInput - The input type for the recommendTechnician function.
 * - AdminAssignmentRecommendationOutput - The return type for the recommendTechnician function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Input Schema
const AdminAssignmentRecommendationInputSchema = z.object({
  workOrder: z.object({
    id: z.string().describe('The unique identifier for the work order.'),
    description: z.string().describe('A description of the work to be done.'),
    location: z.string().describe('The geographical location of the work order (e.g., full address or coordinates).'),
    requiredSkills: z.array(z.string()).describe('An array of skills required to complete this work order.'),
    priority: z.enum(['low', 'medium', 'high', 'critical']).describe('The priority level of the work order.'),
  }).describe('Details of the new work order needing assignment.'),
  availableTechnicians: z.array(z.object({
    id: z.string().describe('The unique identifier for the technician.'),
    name: z.string().describe('The name of the technician.'),
    currentLocation: z.string().describe('The current geographical location of the technician (e.g., full address or coordinates).'),
    reliabilityScore: z.number().min(0).max(100).describe('A score (0-100) indicating the technician\'s reliability.'),
    currentWorkload: z.number().min(0).describe('The current number of active assignments or estimated workload hours for the technician.'),
    skills: z.array(z.string()).describe('An array of skills possessed by the technician.'),
  })).describe('A list of currently available technicians with their relevant details.'),
});
export type AdminAssignmentRecommendationInput = z.infer<typeof AdminAssignmentRecommendationInputSchema>;

// Output Schema
const AdminAssignmentRecommendationOutputSchema = z.object({
  recommendedTechnicianId: z.string().describe('The ID of the technician recommended for the work order.'),
  reasoning: z.string().describe('A detailed explanation for why this technician was recommended, considering all input factors.'),
  alternativeTechnicianIds: z.array(z.string()).optional().describe('An optional list of IDs for other suitable technicians, if any, in order of preference.'),
});
export type AdminAssignmentRecommendationOutput = z.infer<typeof AdminAssignmentRecommendationOutputSchema>;

// Wrapper function
export async function recommendTechnician(input: AdminAssignmentRecommendationInput): Promise<AdminAssignmentRecommendationOutput> {
  return adminAssignmentRecommendationFlow(input);
}

// Prompt definition
const recommendTechnicianPrompt = ai.definePrompt({
  name: 'recommendTechnicianPrompt',
  input: { schema: AdminAssignmentRecommendationInputSchema },
  output: { schema: AdminAssignmentRecommendationOutputSchema },
  prompt: `You are an intelligent assignment recommendation system for a command center. Your goal is to recommend the best technician for a new work order based on several key factors.

Consider the following details for the new work order:
Work Order ID: {{{workOrder.id}}}
Description: {{{workOrder.description}}}
Location: {{{workOrder.location}}}
Required Skills: {{#each workOrder.requiredSkills}}- {{{this}}}
{{/each}}
Priority: {{{workOrder.priority}}}

Here is a list of available technicians and their current profiles:
{{#each availableTechnicians}}
Technician ID: {{{id}}}
Name: {{{name}}}
Current Location: {{{currentLocation}}}
Reliability Score: {{{reliabilityScore}}} (0-100)
Current Workload: {{{currentWorkload}}}
Skills: {{#each skills}}- {{{this}}}
{{/each}}
---
{{/each}}

Based on the work order requirements and the available technicians, recommend the single best technician to assign to this work order.
Your recommendation should prioritize:
1.  Matching all required skills.
2.  Proximity of the technician's current location to the work order location (closer is better).
3.  Lower current workload.
4.  Higher reliability score.
5.  Consider the priority of the work order; for 'critical' or 'high' priority, prioritize availability and speed.

Provide a detailed reasoning for your choice, explaining how the technician fits the criteria. Also, suggest up to two alternative technicians if there are other good candidates.
Output your recommendation in JSON format, strictly adhering to the specified output schema.`,
});

// Genkit Flow definition
const adminAssignmentRecommendationFlow = ai.defineFlow(
  {
    name: 'adminAssignmentRecommendationFlow',
    inputSchema: AdminAssignmentRecommendationInputSchema,
    outputSchema: AdminAssignmentRecommendationOutputSchema,
  },
  async (input) => {
    const { output } = await recommendTechnicianPrompt(input);
    if (!output) {
      throw new Error('No output received from recommendation prompt.');
    }
    return output;
  }
);
