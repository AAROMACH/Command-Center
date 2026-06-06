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

// Input Schema
const AdminRouteOptimizationInputSchema = z.object({
  unassignedJobs: z.array(z.object({
    id: z.string().describe('The unique identifier for the work order.'),
    description: z.string().describe('A description of the work.'),
    location: z.string().describe('Geographical location.'),
    scheduleDate: z.string().describe('YYYY-MM-DD format.'),
    scheduleTime: z.string().describe('Target start time.'),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    requiredSkills: z.array(z.string()),
  })).describe('Pool of jobs awaiting allocation.'),
  availableTechnicians: z.array(z.object({
    id: z.string().describe('Technician ID.'),
    name: z.string().describe('Technician name.'),
    currentLocation: z.string().describe('Base or current coordinates.'),
    reliabilityScore: z.number().min(0).max(100),
    skills: z.array(z.string()),
  })).describe('Registry of field operatives available for deployment.'),
});
export type AdminRouteOptimizationInput = z.infer<typeof AdminRouteOptimizationInputSchema>;

// Output Schema
const AdminRouteOptimizationOutputSchema = z.object({
  proposedRoutes: z.array(z.object({
    technicianId: z.string().describe('The ID of the tech assigned to this route.'),
    technicianName: z.string().describe('The name of the assigned tech.'),
    orderedWorkOrderIds: z.array(z.string()).describe('List of Job IDs in chronological/logical order.'),
    reasoning: z.string().describe('Tactical justification for this specific route and tech match.'),
  })).describe('A collection of optimized tactical routes.'),
  unassignedReasoning: z.string().optional().describe('Explanation for why any jobs remained unassigned.'),
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
  prompt: `You are a high-level tactical routing engine for an operations command center. Your mission is to organize a pool of unassigned field jobs into optimized routes for our operatives.

TACTICAL PRIORITIES:
1. GEOGRAPHIC CLUSTERING: Group jobs by physical proximity to minimize travel time and operational overhead.
2. TEMPORAL SEQUENCING: Order jobs logically based on their schedule times and priorities.
3. OPERATIVE FIT: Match the most critical or difficult jobs to technicians with high Reliability Index scores and matching Skills.

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
