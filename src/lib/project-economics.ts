import type { Project, ProjectDailyLog, Expense, Invoice, Quote } from '@/lib/types';
import { money } from '@/lib/financial-summary';

/** One tech's share of field labor. rate / cost are null where the viewer may
 *  not see pay rates (the project's assigned PM — only hours are shown). */
export type LaborLine = { techId: string; name: string; hours: number; rate: number | null; cost: number | null };
export type CostItem = { label: string; amount: number; detail?: string; date?: string };
/** What the linked quote sold: labor hours and the material lines. */
export type QuoteEstimate = {
  quoteId: string; quoteNumber: string; status: string;
  laborHours: number; laborAmount: number;
  materials: { name: string; quantity: number; unitPrice: number; total: number }[];
  materialsAmount: number; total: number;
};

export type ProjectEconomics = {
  loggedHours: number;
  estimatedHours: number;
  laborCost: number;
  rateMissing: boolean;
  materialCost: number;
  otherExpenses: number;
  actualCost: number;
  remainingBudget: number;
  profit: number;
  isActualProfit: boolean;
  margin: number;
  budgetStatus: 'On Budget' | 'Near Limit' | 'Over Budget' | 'Not Enough Data';
  revenue: number;
  /** Where the numbers come from (hover panels in Project Economics). */
  laborByTech: LaborLine[];
  materialItems: CostItem[];
  incidentalItems: CostItem[];
  estimate: QuoteEstimate | null;
  /** True when pay rates were removed for this viewer (assigned PM). */
  ratesHidden?: boolean;
};

const LABOR_CATEGORIES = ['labor', 'service', 'travel'];

/** The linked quote as an estimate. Labor quantity is taken as hours. */
export function quoteEstimate(quote: Pick<Quote, 'id' | 'quoteNumber' | 'status' | 'lineItems' | 'total'> | null | undefined): QuoteEstimate | null {
  if (!quote) return null;
  const lines = quote.lineItems || [];
  const labor = lines.filter(l => LABOR_CATEGORIES.includes(l.category));
  const mats = lines.filter(l => !LABOR_CATEGORIES.includes(l.category));
  return {
    quoteId: quote.id, quoteNumber: quote.quoteNumber, status: quote.status,
    laborHours: labor.reduce((s, l) => s + (Number(l.quantity) || 0), 0),
    laborAmount: labor.reduce((s, l) => s + money(l.total), 0),
    materials: mats.map(l => ({ name: l.name, quantity: Number(l.quantity) || 0, unitPrice: money(l.unitPrice), total: money(l.total) })),
    materialsAmount: mats.reduce((s, l) => s + money(l.total), 0),
    total: money(quote.total),
  };
}

/**
 * Budget, cost and profit for one project. Pure, so the admin view (live
 * listeners) and the server route for assigned project managers (who can't
 * read invoices, expenses or pay rates) compute exactly the same numbers.
 */
export function computeProjectEconomics(
  project: Pick<Project, 'id' | 'actualHours' | 'estimatedHours' | 'phases' | 'projectBudget'> & Pick<Partial<Project>, 'addedParts'>,
  dailyLogs: Pick<ProjectDailyLog, 'techId' | 'hoursWorked'>[],
  rateOf: (techId: string) => number | undefined,
  expenses: Pick<Expense, 'projectId' | 'status' | 'category' | 'amount' | 'description' | 'date'>[],
  invoices: Pick<Invoice, 'projectId' | 'status' | 'total'>[],
  extra: { nameOf?: (techId: string) => string | undefined; quote?: Parameters<typeof quoteEstimate>[0] } = {},
): ProjectEconomics {
  const projectExpenses = expenses.filter(e => e.projectId === project.id && e.status === 'Approved');
  const projectInvoices = invoices.filter(i => i.projectId === project.id && i.status === 'paid');
  const estimate = quoteEstimate(extra.quote);

  const loggedHours = project.actualHours || 0;

  let estimatedHours = project.estimatedHours || 0;
  const taskEstSum = (project.phases || []).reduce((pAcc, phase) =>
    pAcc + (phase.tasks || []).reduce((tAcc, task) => tAcc + (task.estimatedHours || 0), 0), 0);
  if (taskEstSum > 0) estimatedHours = taskEstSum;
  if (!estimatedHours && estimate?.laborHours) estimatedHours = estimate.laborHours;

  // Field labor per tech: hours × their hourly rate.
  const byTech = new Map<string, number>();
  dailyLogs.forEach(l => { if (l.techId) byTech.set(l.techId, (byTech.get(l.techId) || 0) + (l.hoursWorked || 0)); });
  const laborByTech: LaborLine[] = [...byTech.entries()].map(([techId, hours]) => {
    const rate = rateOf(techId);
    return { techId, name: extra.nameOf?.(techId) || techId, hours: Math.round(hours * 100) / 100, rate: rate ?? null, cost: rate ? Math.round(hours * rate * 100) / 100 : null };
  }).sort((a, b) => b.hours - a.hours);
  const laborCost = laborByTech.reduce((acc, l) => acc + (l.cost || 0), 0);
  const rateMissing = laborByTech.some(l => !l.rate);

  const partItems: CostItem[] = (project.addedParts || []).map(p => ({
    label: p.name, amount: Math.round(p.quantity * p.unitCost * 100) / 100,
    detail: `${p.quantity} × $${p.unitCost.toFixed(2)} cost · added by ${p.addedBy}`, date: p.addedAt?.slice(0, 10),
  }));
  const expenseItem = (e: typeof projectExpenses[number]): CostItem => ({ label: e.description || e.category, amount: money(e.amount), detail: e.category, date: e.date });
  const materialItems = [...partItems, ...projectExpenses.filter(e => e.category === 'Materials').map(expenseItem)];
  const incidentalItems = projectExpenses.filter(e => e.category !== 'Materials').map(expenseItem);
  const materialCost = materialItems.reduce((acc, i) => acc + i.amount, 0);
  const otherExpenses = incidentalItems.reduce((acc, i) => acc + i.amount, 0);

  const actualCost = laborCost + materialCost + otherExpenses;
  const budget = project.projectBudget || estimate?.total || 0;
  const revenue = projectInvoices.length > 0
    ? projectInvoices.reduce((acc, i) => acc + money(i.total), 0)
    : budget;

  const profit = revenue - actualCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const remainingBudget = budget - actualCost;

  let budgetStatus: ProjectEconomics['budgetStatus'] = 'On Budget';
  if (!budget) budgetStatus = 'Not Enough Data';
  else if (remainingBudget < 0) budgetStatus = 'Over Budget';
  else if (remainingBudget < (budget * 0.1)) budgetStatus = 'Near Limit';

  return {
    loggedHours, estimatedHours, laborCost, rateMissing, materialCost, otherExpenses, actualCost,
    remainingBudget, profit, isActualProfit: projectInvoices.length > 0, margin, budgetStatus, revenue,
    laborByTech, materialItems, incidentalItems, estimate,
  };
}

/** For the assigned PM (server route): keep hours per tech, drop rates and per-tech cost. */
export function withoutPayRates(e: ProjectEconomics): ProjectEconomics {
  return { ...e, ratesHidden: true, laborByTech: e.laborByTech.map(l => ({ ...l, rate: null, cost: null })) };
}
