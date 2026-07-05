import { useState } from "react";
import {
  useGetInvoice, useListInvoiceComments, useCreateInvoiceComment,
  useUpdateInvoice, useListAnalysts, getGetInvoiceQueryKey, getListInvoiceCommentsQueryKey
} from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Calendar, DollarSign, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";

const CURRENT_ANALYST_ID = 1;

export function InvoiceDrawer({ invoiceId, onClose }: { invoiceId: string | null; onClose: () => void }) {
  const isOpen = !!invoiceId;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useGetInvoice(invoiceId!, { query: { enabled: !!invoiceId } });
  const { data: comments, isLoading: isLoadingComments } = useListInvoiceComments(invoiceId!, { query: { enabled: !!invoiceId } });
  const { data: analysts } = useListAnalysts();

  const createComment = useCreateInvoiceComment();
  const updateInvoice = useUpdateInvoice();

  const [newComment, setNewComment] = useState("");
  const [ptpDate, setPtpDate] = useState("");
  const [ptpAmount, setPtpAmount] = useState("");
  const [showPtpForm, setShowPtpForm] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId!) });
  };

  const handleAddComment = () => {
    if (!newComment.trim() || !invoiceId) return;
    createComment.mutate(
      { id: invoiceId, data: { body: newComment, authorId: CURRENT_ANALYST_ID } },
      {
        onSuccess: () => {
          setNewComment("");
          queryClient.invalidateQueries({ queryKey: getListInvoiceCommentsQueryKey(invoiceId) });
          toast({ title: "Note added" });
        },
      }
    );
  };

  const handleAssignAnalyst = (val: string) => {
    if (!invoiceId) return;
    updateInvoice.mutate(
      { id: invoiceId, data: { analystId: val === "unassigned" ? null : Number(val) } },
      { onSuccess: () => { invalidate(); toast({ title: "Analyst assigned" }); } }
    );
  };

  const handleSavePtp = () => {
    if (!invoiceId || !ptpDate) return;
    updateInvoice.mutate(
      { id: invoiceId, data: { ptpDate, ptpAmount: ptpAmount ? Number(ptpAmount) : null } },
      {
        onSuccess: () => {
          setShowPtpForm(false);
          setPtpDate("");
          setPtpAmount("");
          invalidate();
          toast({ title: "Promise to Pay recorded" });
        },
      }
    );
  };

  const handleClearPtp = () => {
    if (!invoiceId) return;
    updateInvoice.mutate(
      { id: invoiceId, data: { ptpDate: null, ptpAmount: null } },
      { onSuccess: () => { invalidate(); toast({ title: "PTP cleared" }); } }
    );
  };

  const handleMarkDisputed = () => {
    if (!invoiceId || !disputeReason.trim()) return;
    updateInvoice.mutate(
      { id: invoiceId, data: { isDisputed: true, disputeReason } },
      {
        onSuccess: () => {
          setShowDisputeForm(false);
          setDisputeReason("");
          invalidate();
          toast({ title: "Invoice marked as disputed" });
        },
      }
    );
  };

  const handleClearDispute = () => {
    if (!invoiceId) return;
    updateInvoice.mutate(
      { id: invoiceId, data: { isDisputed: false, disputeReason: null } },
      { onSuccess: () => { invalidate(); toast({ title: "Dispute cleared" }); } }
    );
  };

  const handleUpdateLastContact = () => {
    if (!invoiceId) return;
    const today = new Date().toISOString().split("T")[0];
    updateInvoice.mutate(
      { id: invoiceId, data: { lastContactDate: today } },
      { onSuccess: () => { invalidate(); toast({ title: "Last contact date updated to today" }); } }
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col p-0 border-l border-border bg-card">
        {isLoading || !invoice ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="p-5 border-b border-border bg-background shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="text-lg font-mono">{invoice.invoiceNumber}</SheetTitle>
                  <SheetDescription className="text-base text-foreground font-medium mt-0.5">
                    {invoice.customerName}
                  </SheetDescription>
                  {invoice.customerEmail && (
                    <div className="text-xs text-muted-foreground mt-0.5">{invoice.customerEmail}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <InvoiceStatusBadge status={invoice.status} />
                  {invoice.isDisputed && (
                    <Badge className="bg-amber-500/20 text-amber-400 text-[10px] hover:bg-amber-500/30">
                      <AlertTriangle className="w-2.5 h-2.5 mr-1" /> DISPUTED
                    </Badge>
                  )}
                </div>
              </div>

              {/* Key fields grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Invoice Amount</div>
                  <div className="font-mono font-semibold text-primary text-base">{formatCurrency(invoice.amount, invoice.currency)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Overdue</div>
                  <div className={cn("font-mono font-semibold", invoice.overdueDays > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {invoice.overdueDays > 0 ? `${invoice.overdueDays} days` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Issue Date</div>
                  <div className="font-medium text-sm">{formatDate(invoice.issueDate)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Due Date</div>
                  <div className="font-medium text-sm">{formatDate(invoice.dueDate)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Last Contact</div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {invoice.lastContactDate ? formatDate(invoice.lastContactDate) : <span className="text-muted-foreground">—</span>}
                    <button
                      className="text-[10px] text-primary hover:underline"
                      onClick={handleUpdateLastContact}
                    >
                      Mark today
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Assigned Analyst</div>
                  <Select value={invoice.analystId ? String(invoice.analystId) : "unassigned"} onValueChange={handleAssignAnalyst}>
                    <SelectTrigger className="h-7 text-xs bg-background w-full">
                      <SelectValue placeholder="Assign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {analysts?.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SheetHeader>

            {/* PTP Section */}
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  <Calendar className="w-3.5 h-3.5" />
                  Promise to Pay
                </div>
                {invoice.ptpDate ? (
                  <button className="text-[10px] text-muted-foreground hover:text-destructive" onClick={handleClearPtp}>Clear</button>
                ) : (
                  <button className="text-[10px] text-primary hover:underline" onClick={() => setShowPtpForm(!showPtpForm)}>
                    {showPtpForm ? "Cancel" : "+ Log PTP"}
                  </button>
                )}
              </div>

              {invoice.ptpDate ? (
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-md p-3 text-sm">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">PTP Date</div>
                      <div className="font-mono font-semibold text-cyan-400">{formatDate(invoice.ptpDate)}</div>
                    </div>
                    {invoice.ptpAmount && (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">PTP Amount</div>
                        <div className="font-mono font-semibold">{formatCurrency(invoice.ptpAmount)}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : showPtpForm ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Payment Date</label>
                      <Input type="date" value={ptpDate} onChange={(e) => setPtpDate(e.target.value)} className="h-8 text-xs bg-background" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Amount (optional)</label>
                      <Input type="number" placeholder={String(invoice.amount)} value={ptpAmount} onChange={(e) => setPtpAmount(e.target.value)} className="h-8 text-xs bg-background" />
                    </div>
                  </div>
                  <Button size="sm" className="w-full h-7 text-xs" onClick={handleSavePtp} disabled={!ptpDate || updateInvoice.isPending}>
                    Save PTP
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No promise to pay on record.</div>
              )}
            </div>

            {/* Dispute Section */}
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Dispute Status
                </div>
                {invoice.isDisputed ? (
                  <button className="text-[10px] text-muted-foreground hover:text-primary" onClick={handleClearDispute}>Resolve Dispute</button>
                ) : (
                  <button className="text-[10px] text-amber-400 hover:underline" onClick={() => setShowDisputeForm(!showDisputeForm)}>
                    {showDisputeForm ? "Cancel" : "Flag as Disputed"}
                  </button>
                )}
              </div>

              {invoice.isDisputed && invoice.disputeReason ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 text-xs">
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">Reason</div>
                  <div>{invoice.disputeReason}</div>
                </div>
              ) : showDisputeForm ? (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Describe the dispute reason..."
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="resize-none h-16 text-xs bg-background"
                  />
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10" onClick={handleMarkDisputed} disabled={!disputeReason.trim() || updateInvoice.isPending}>
                    Flag as Disputed
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No active dispute.</div>
              )}
            </div>

            {/* Activity / Comments */}
            <div className="px-5 py-4 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                <MessageSquare className="w-3.5 h-3.5" />
                Collection Notes
              </div>

              <div className="space-y-3 mb-4">
                {isLoadingComments ? (
                  <Skeleton className="h-20 w-full" />
                ) : comments?.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-md">
                    No notes yet — add the first one.
                  </div>
                ) : (
                  [...(comments ?? [])].reverse().map((comment) => (
                    <div key={comment.id} className="text-sm bg-muted/20 p-3 rounded-md border border-border">
                      <div className="flex justify-between items-start mb-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <User className="w-3 h-3" />
                          {comment.authorName}
                        </span>
                        <span>{formatDate(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{comment.body}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <Textarea
                  placeholder="Log a collection note, call outcome, dispute update..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="resize-none h-20 bg-background text-sm"
                />
                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || createComment.isPending}
                >
                  {createComment.isPending ? "Adding..." : "Add Note"}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
