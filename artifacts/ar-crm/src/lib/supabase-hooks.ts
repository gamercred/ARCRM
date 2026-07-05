import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ListInvoicesStatus =
  | "not_due"
  | "current"
  | "overdue_1_30"
  | "overdue_31_60"
  | "overdue_61_90"
  | "overdue_90_plus";

function computeStatus(dueDate: string, today: Date) {
  const due = new Date(dueDate);
  const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (diffDays < 0) return { status: "not_due", overdueDays: 0 };
  if (diffDays === 0) return { status: "current", overdueDays: 0 };
  if (diffDays <= 30) return { status: "overdue_1_30", overdueDays: diffDays };
  if (diffDays <= 60) return { status: "overdue_31_60", overdueDays: diffDays };
  if (diffDays <= 90) return { status: "overdue_61_90", overdueDays: diffDays };
  return { status: "overdue_90_plus", overdueDays: diffDays };
}

async function fetchAllInvoices() {
  const { data, error } = await supabase.from("invoices").select("*");
  if (error) throw error;
  return data ?? [];
}
async function fetchAllAnalysts() {
  const { data, error } = await supabase.from("analysts").select("*");
  if (error) throw error;
  return data ?? [];
}

function formatInvoice(row: any, analystMap: Map<number, string>, today: Date) {
  const { status, overdueDays } = computeStatus(row.due_date, today);
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email ?? null,
    amount: Number(row.amount),
    paidAmount: Number(row.paid_amount),
    currency: row.currency,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status,
    overdueDays,
    analystId: row.analyst_id ?? null,
    analystName: row.analyst_id ? analystMap.get(row.analyst_id) ?? null : null,
    netsuiteId: row.netsuite_id ?? null,
    salesforceId: row.salesforce_id ?? null,
    lastContactDate: row.last_contact_date ?? null,
    notes: row.notes ?? null,
    ptpDate: row.ptp_date ?? null,
    ptpAmount: row.ptp_amount != null ? Number(row.ptp_amount) : null,
    isDisputed: row.is_disputed ?? false,
    disputeReason: row.dispute_reason ?? null,
  };
}

export function useListAnalysts() {
  return useQuery({
    queryKey: ["analysts"],
    queryFn: async () => {
      const rows = await fetchAllAnalysts();
      return rows.map((a: any) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        createdAt: a.created_at,
      }));
    },
  });
}

export function useGetDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const invoices = await fetchAllInvoices();
      const today = new Date();
      let totalOutstanding = 0, overdueCount = 0, overdueAmount = 0, currentCount = 0,
        notDueCount = 0, disputedCount = 0, disputedAmount = 0, ptpCount = 0,
        ptpAmountTotal = 0, weightedAgeDays = 0;
      const customerMap = new Map<string, { customerName: string; outstanding: number; invoiceCount: number }>();
      for (const inv of invoices) {
        const outstanding = Number(inv.amount) - Number(inv.paid_amount);
        if (outstanding <= 0) continue;
        totalOutstanding += outstanding;
        const daysSinceIssue = Math.max(0, Math.floor((today.getTime() - new Date(inv.issue_date).getTime()) / 86400000));
        weightedAgeDays += outstanding * daysSinceIssue;
        const { status } = computeStatus(inv.due_date, today);
        if (["overdue_1_30", "overdue_31_60", "overdue_61_90", "overdue_90_plus"].includes(status)) {
          overdueCount++; overdueAmount += outstanding;
        } else if (status === "current") currentCount++;
        else if (status === "not_due") notDueCount++;
        if (inv.is_disputed) { disputedCount++; disputedAmount += outstanding; }
        if (inv.ptp_date) { ptpCount++; ptpAmountTotal += inv.ptp_amount ? Number(inv.ptp_amount) : outstanding; }
        const ex = customerMap.get(inv.customer_id);
        if (ex) { ex.outstanding += outstanding; ex.invoiceCount++; }
        else customerMap.set(inv.customer_id, { customerName: inv.customer_name, outstanding, invoiceCount: 1 });
      }
      const dso = totalOutstanding > 0 ? Math.round(weightedAgeDays / totalOutstanding) : 0;
      const topCustomers = Array.from(customerMap.entries())
        .map(([customerId, d]) => ({ customerId, ...d }))
        .sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);
      return {
        totalOutstanding, totalInvoices: invoices.length, overdueCount, overdueAmount,
        currentCount, notDueCount, collectedThisMonth: 0, dso, disputedCount,
        disputedAmount, ptpCount, ptpAmount: ptpAmountTotal, topCustomers,
      };
    },
  });
}

export function useGetDashboardAging() {
  return useQuery({
    queryKey: ["dashboard-aging"],
    queryFn: async () => {
      const invoices = await fetchAllInvoices();
      const today = new Date();
      const buckets: any = {
        notDue: { count: 0, amount: 0 }, current: { count: 0, amount: 0 },
        overdue1to30: { count: 0, amount: 0 }, overdue31to60: { count: 0, amount: 0 },
        overdue61to90: { count: 0, amount: 0 }, overdue90plus: { count: 0, amount: 0 },
      };
      for (const inv of invoices) {
        const outstanding = Number(inv.amount) - Number(inv.paid_amount);
        if (outstanding <= 0) continue;
        const { status } = computeStatus(inv.due_date, today);
        const key = status === "not_due" ? "notDue" : status === "current" ? "current"
          : status === "overdue_1_30" ? "overdue1to30" : status === "overdue_31_60" ? "overdue31to60"
          : status === "overdue_61_90" ? "overdue61to90" : "overdue90plus";
        buckets[key].count++; buckets[key].amount += outstanding;
      }
      return buckets;
    },
  });
}

export function useListInvoices(params: {
  status?: string; analystId?: number; search?: string;
  customerId?: string; disputed?: boolean; page?: number; pageSize?: number;
} = {}) {
  return useQuery({
    queryKey: ["invoices", params],
    queryFn: async () => {
      const [invoices, analysts] = await Promise.all([fetchAllInvoices(), fetchAllAnalysts()]);
      const analystMap = new Map<number, string>(analysts.map((a: any) => [a.id, a.name]));
      const today = new Date();
      let formatted = invoices.map((inv: any) => formatInvoice(inv, analystMap, today));
      if (params.status && params.status !== "all") formatted = formatted.filter((i) => i.status === params.status);
      if (params.analystId != null) formatted = formatted.filter((i) => i.analystId === params.analystId);
      if (params.customerId) formatted = formatted.filter((i) => i.customerId === params.customerId);
      if (params.disputed != null) formatted = formatted.filter((i) => i.isDisputed === params.disputed);
      if (params.search) {
        const q = params.search.toLowerCase();
        formatted = formatted.filter((i) => i.invoiceNumber.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q));
      }
      const total = formatted.length;
      const p = params.page ?? 1;
      const ps = params.pageSize ?? 50;
      return { invoices: formatted.slice((p - 1) * ps, p * ps), total, page: p, pageSize: ps };
    },
  });
}
