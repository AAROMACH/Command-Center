'use server';
/**
 * @fileOverview High-fidelity tactical routing engine for operative deployment.
 * Orchestrates mission clustering based on sanitized geographic and temporal logic.
 *
 * - optimizeRoutes - Handshake with Genkit for AI-driven logistics.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Input Schema - Using sanitized location anchors
const AdminRouteOptimizationInputSchema = z.object({
  unassignedJobs: z.array(z.object({
    id: z.string().describe('Unique Job Identifier.'),
    description: z.string().describe('Scope of work briefing.'),
    location: z.string().describe('Sanitized anchor (City, ST).'),
    scheduleDate: z.string().describe('YYYY-MM-DD format.'),
    scheduleTime: z.string().describe('Clean time identifier (e.g. 09:00 AM).'),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    requiredSkills: z.array(z.string()),
  })).describe('Pool of jobs requiring deployment.'),
  availableTechnicians: z.array(z.object({
    id: z.string().describe('Operative ID.'),
    name: z.string().describe('Operative Name.'),
    currentLocation: z.string().describe('Sanitized base anchor (City, ST).'),
    reliabilityScore: z.number().min(0).max(100),
    skills: z.array(z.string()),
  })).describe('Registry of field-ready operatives.'),
  targetRouteCount: z.number().min(1).max(20).describe('Requested route volume.'),
});
export type AdminRouteOptimizationInput = z.infer<typeof AdminRouteOptimizationInputSchema>;

// Output Schema - Aligned with operational registry structure
const AdminRouteOptimizationOutputSchema = z.object({
  routes: z.array(z.object({
    routeId: z.string().describe('Internal tactical identifier.'),
    technicianId: z.string().describe('Assigned operative ID.'),
    technicianName: z.string().describe('Assigned operative name.'),
    jobIds: z.array(z.string()).describe('Sequenced job IDs.'),
    reasoning: z.string().describe('Tactical justification for this route.'),
    estimatedRouteLabel: z.string().describe('Brief geographic summary (e.g. Detroit East Cluster).'),
  })).describe('Proposed tactical routes.'),
  unassignedJobIds: z.array(z.string()).describe('Jobs unable to be allocated.'),
  warnings: z.array(z.string()).optional().describe('Registry alerts.'),
});
export type AdminRouteOptimizationOutput = z.infer<typeof AdminRouteOptimizationOutputSchema>;

export async function optimizeRoutes(input: AdminRouteOptimizationInput): Promise<AdminRouteOptimizationOutput> {
  return adminRouteOptimizationFlow(input);
}

const optimizeRoutesPrompt = ai.definePrompt({
  name: 'optimizeRoutesPrompt',
  input: { schema: AdminRouteOptimizationInputSchema },
  output: { schema: AdminRouteOptimizationOutputSchema },
  prompt: `You are a high-level tactical routing engine for an operations command center. Your mission is to organize unassigned jobs into exactly {{{targetRouteCount}}} optimized routes.

TACTICAL PRIORITIES (STRICT):
1. CLUSTERING: Group jobs by physical proximity (City/ST) to minimize travel time.
2. SEQUENCING: Order jobs logically by schedule times and priority.
3. FIT: Match critical missions to high-reliability operatives with verified skills.

Mission Pool:
{{#each unassignedJobs}}
- ID: {{{id}}} | Scope: {{{description}}} | Loc: {{{location}}} | Sched: {{{scheduleDate}}} @ {{{scheduleTime}}} | Priority: {{{priority}}}
{{/each}}

Operative Registry:
{{#each availableTechnicians}}
- ID: {{{id}}} | Name: {{{name}}} | Base: {{{currentLocation}}} | Reliability: {{{reliabilityScore}}}% | Skills: {{#each skills}}{{{this}}}, {{/each}}
{{/each}}

Operational Protocol:
- Generate EXACTLY {{{targetRouteCount}}} routes if job volume allows.
- If a tech lacks skills for a job, DO NOT allocate it to them.
- Provide a brief 'reasoning' for each cluster.

Output results in JSON format matching the schema.`,
});

const adminRouteOptimizationFlow = ai.defineFlow(
  {
    name: 'adminRouteOptimizationFlow',
    inputSchema: AdminRouteOptimizationInputSchema,
    outputSchema: AdminRouteOptimizationOutputSchema,
  },
  async (input) => {
    const { output } = await optimizeRoutesPrompt(input);
    if (!output) throw new Error('Terminal failed to produce valid routing manifest.');
    return output;
  }
);
