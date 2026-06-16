// Domain events that auto-post to the treasury ledger (ADR 0007 follow-up). The
// emitting modules (Billing/Payroll/Costs) import these names + payloads; the
// TreasuryService subscribes via @OnEvent. Keeps the wiring decoupled — emitters
// know nothing about accounts.

export const INVOICE_PAID = 'invoice.paid';
export interface InvoicePaidEvent {
  invoiceId: string;
  number: string;
  clientName: string;
  total: string; // 2-dp string
  date: Date; // post date (paidAt)
}

export const PAYROLL_PAID = 'payroll.paid';
export interface PayrollPaidEvent {
  runId: string;
  number: string;
  total: string;
  date: Date;
}

export const COST_CREATED = 'cost.created';
export interface CostCreatedEvent {
  costId: string;
  truckId: string;
  truckCode: string;
  category: string; // CostCategory
  amount: string;
  date: Date;
  note: string | null;
}
