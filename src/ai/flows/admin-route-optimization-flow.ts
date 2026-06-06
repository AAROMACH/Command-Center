'use server';
/**
 * @fileOverview This file implements a Genkit flow for optimized batch route planning.
 *
 * - optimizeRoutes - A function that handles the route optimization process.
 * - AdminRouteOptimizationInput - The input type for the optimizeRoutes function.
 * - AdminRouteOptimizationOutput - The return type for the optimizeRoutes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Input Schema - Hardened to use sanitized locations
const AdminRouteOptimizationInputSchema = z.object({
  unassignedJobs: z.array(z.object({
    id: z.string().describe('The unique identifier for the work order.'),
    description: z.string().describe('A description of the work.'),
    location: z.string().describe('Sanitized geographical location (City, ST).'),
    scheduleDate: z.string().describe('YYYY-MM-DD format.'),
    scheduleTime: z.string().describe('Target start time (e.g. 09:00 AM).'),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    requiredSkills: z.array(z.string()),
  })).describe('Pool of jobs awaiting allocation.'),
  availableTechnicians: z.array(z.object({
    id: z.string().describe('Technician ID.'),
    name: z.string().describe('Technician name.'),
    currentLocation: z.string().describe('Sanitized base coordinates (City, ST).'),
    reliabilityScore: z.number().min(0).max(100),
    skills: z.array(z.string()),
  })).describe('Registry of field operatives available for deployment.'),
  targetRouteCount: z.number().min(1).max(20).describe('The specific number of routes the dispatcher wants to create.'),
});
export type AdminRouteOptimizationInput = z.infer<typeof AdminRouteOptimizationInputSchema>;

// Output Schema - Included warnings for safe failure handling
const AdminRouteOptimizationOutputSchema = z.object({
  proposedRoutes: z.array(z.object({
    technicianId: z.string().describe('The ID of the tech assigned to this route.'),
    technicianName: z.string().describe('The name of the assigned tech.'),
    orderedWorkOrderIds: z.array(z.string()).describe('List of Job IDs in chronological/logical order.'),
    reasoning: z.string().describe('Tactical justification for this specific route and tech match.'),
  })).describe('A collection of optimized tactical routes.'),
  unassignedReasoning: z.string().optional().describe('Explanation for why any jobs remained unassigned.'),
  warnings: z.array(z.string()).optional().describe('Non-critical alerts encountered during analysis.'),
});
export type AdminRouteOptimizationOutput = z.infer<typeof AdminRouteOptimizationOutputSchema>;

// Wrapper function
export async function optimizeRoutes(input: AdminRouteOptimizationInput): Promise<AdminRouteOptimizationOutput> {
  return adminRouteOptimizationFlow(input);
}

// Prompt definition
const optimizeRoutesPrompt = ai.definePrompt({
  name: 'optimizeRoutesPrompt',
  input: { schema: AdminRouteOptimizationInputSchema },
  output: { schema: AdminRouteOptimizationOutputSchema },
  prompt: `You are a high-level tactical routing engine for an operations command center. Your mission is to organize a pool of unassigned field jobs into exactly {{{targetRouteCount}}} optimized routes for our operatives.

TACTICAL PRIORITIES (STRICT):
1. ROUTE VOLUME: You MUST generate exactly {{{targetRouteCount}}} routes. Do not generate more or less unless there are fewer than {{{targetRouteCount}}} total jobs.
2. GEOGRAPHIC CLUSTERING: Group jobs by physical proximity (City/ST) to minimize travel time and operational overhead.
3. TEMPORAL SEQUENCING: Order jobs logically based on their schedule times and priorities.
4. OPERATIVE FIT: Match the most critical or difficult jobs to technicians with high Reliability Index scores and matching Skills.

Mission Pool:
{{#each unassignedJobs}}
- JOB ID: {{{id}}}
  - Scope: {{{description}}}
  - Location: {{{location}}}
  - Schedule: {{{scheduleDate}}} at {{{scheduleTime}}}
  - Priority: {{{priority}}}
  - Skills: {{#each requiredSkills}}{{{this}}}, {{/each}}
---
{{/each}}

Operative Registry:
{{#each availableTechnicians}}
- TECH ID: {{{id}}}
  - Name: {{{name}}}
  - Base: {{{currentLocation}}}
  - Reliability: {{{reliabilityScore}}}
  - Skills: {{#each skills}}{{{this}}}, {{/each}}
---
{{/each}}

Operational Protocol:
- Architect routes that maximize daily throughput.
- Distribute the unassigned jobs as evenly as possible across the {{{targetRouteCount}}} routes while maintaining geographic logic.
- If a technician is unqualified for a job, DO NOT include it in their route.
- If multiple techs are qualified, prioritize the tech closest to the cluster.
- Provide a brief 'Reasoning' for each route explaining the geographical and skill-based logic used.

Output the results in JSON format matching the schema.`,
});

// Genkit Flow definition
const adminRouteOptimizationFlow = ai.defineFlow(
  {
    name: 'adminRouteOptimizationFlow',
    inputSchema: AdminRouteOptimizationInputSchema,
    outputSchema: AdminRouteOptimizationOutputSchema,
  },
  async (input) => {
    const { output } = await optimizeRoutesPrompt(input);
    if (!output) {
      throw new Error('Intelligence terminal failed to generate routing plan.');
    }
    return output;
  }
);
