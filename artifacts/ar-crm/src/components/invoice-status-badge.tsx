import { Badge } from "@/components/ui/badge";
import { InvoiceStatus } from "@workspace/api-client-react";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus | string }) {
  switch (status) {
    case "not_due":
      return <Badge variant="outline" className="status-not-due uppercase text-[10px] tracking-wider font-mono">Not Due</Badge>;
    case "current":
      return <Badge variant="outline" className="status-current uppercase text-[10px] tracking-wider font-mono">Current</Badge>;
    case "overdue_1_30":
      return <Badge variant="outline" className="status-overdue-1-30 uppercase text-[10px] tracking-wider font-mono">1-30 Days</Badge>;
    case "overdue_31_60":
      return <Badge variant="outline" className="status-overdue-31-60 uppercase text-[10px] tracking-wider font-mono">31-60 Days</Badge>;
    case "overdue_61_90":
      return <Badge variant="outline" className="status-overdue-61-90 uppercase text-[10px] tracking-wider font-mono">61-90 Days</Badge>;
    case "overdue_90_plus":
      return <Badge variant="outline" className="status-overdue-90-plus uppercase text-[10px] tracking-wider font-mono">90+ Days</Badge>;
    case "paid":
      return <Badge variant="outline" className="status-paid uppercase text-[10px] tracking-wider font-mono">Paid</Badge>;
    default:
      return <Badge variant="outline" className="uppercase text-[10px] tracking-wider font-mono">{status}</Badge>;
  }
}
