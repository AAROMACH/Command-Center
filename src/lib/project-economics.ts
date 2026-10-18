import type { Project, ProjectDailyLog, Expense, Invoice } from '@/lib/types';
import { money } from '@/lib/financial-summary';

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
};

/**
 * Budget, cost and profit for one project. Pure, so the admin view (live
 * listeners) and the server route for assigned project managers (who can't
 * read invoices, expenses or pay rates) compute exactly the same numbers.
 */
export function computeProjectEconomics(
  project: Pick<Project, 'id' | 'actualHours' | 'estimatedHours' | 'phases' | 'projectBudget'>,
  dailyLogs: Pick<ProjectDailyLog, 'techId' | 'hoursWorked'>[],
  rateOf: (techId: string) => number | undefined,
  expenses: Pick<Expense, 'projectId' | 'status' | 'category' | 'amount'>[],
  invoices: Pick<Invoice, 'projectId' | 'status' | 'total'>[],
): ProjectEconomics {
  const projectExpenses = expenses.filter(e => e.projectId === project.id && e.status === 'Approved');
  const projectInvoices = invoices.filter(i => i.projectId === project.id && i.status === 'paid');

  const loggedHours = project.actualHours || 0;

  let estimatedHours = project.estimatedHours || 0;
  const taskEstSum = (project.phases || []).reduce((pAcc, phase) =>
    pAcc + (phase.tasks || []).reduce((tAcc, task) => tAcc + (task.estimatedHours || 0), 0), 0);
  if (taskEstSum > 0) estimatedHours = taskEstSum;

  const laborCost = dailyLogs.reduce((acc, log) => acc + ((log.hoursWorked || 0) * (rateOf(log.techId) || 0)), 0);
  const rateMissing = dailyLogs.some(log => !rateOf(log.techId));

  const materialCost = projectExpenses.filter(e => e.category === 'Materials').reduce((acc, e) => acc + money(e.amount), 0);
  const otherExpenses = projectExpenses.filter(e => e.category !== 'Materials').reduce((acc, e) => acc + money(e.amount), 0);

  const actualCost = laborCost + materialCost + otherExpenses;
  const revenue = projectInvoices.length > 0
    ? projectInvoices.reduce((acc, i) => acc + money(i.total), 0)
    : (project.projectBudget || 0);

  const profit = revenue - actualCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const remainingBudget = (project.projectBudget || 0) - actualCost;

  let budgetStatus: ProjectEconomics['budgetStatus'] = 'On Budget';
  if (!project.projectBudget) budgetStatus = 'Not Enough Data';
  else if (remainingBudget < 0) budgetStatus = 'Over Budget';
  else if (remainingBudget < (project.projectBudget * 0.1)) budgetStatus = 'Near Limit';

  return {
    loggedHours, estimatedHours, laborCost, rateMissing, materialCost, otherExpenses, actualCost,
    remainingBudget, profit, isActualProfit: projectInvoices.length > 0, margin, budgetStatus, revenue,
  };
}
