import { useState, useRef } from "react";
import {
  useListEmailThreads, useGetEmailThread, useCreateEmailThread,
  useReplyEmailThread, useCloseEmailThread, useListInvoices,
  getGetEmailThreadQueryKey, getListEmailThreadsQueryKey, EmailThreadStatus
} from "@workspace/api-client-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, CheckCircle2, Send, Plus, Filter, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<EmailThreadStatus, string> = {
  open: "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
  awaiting_reply: "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
  closed: "bg-muted text-muted-foreground",
};
const STATUS_LABELS: Record<EmailThreadStatus, string> = {
  open: "Open",
  awaiting_reply: "Awaiting Reply",
  closed: "Closed",
};

type Tone = "friendly" | "formal" | "firm";

const TONES: { value: Tone; label: string; color: string; activeColor: string; description: string }[] = [
  {
    value: "friendly",
    label: "Friendly",
    color: "border-emerald-500/30 text-emerald-400/60 hover:text-emerald-400 hover:border-emerald-500/60",
    activeColor: "bg-emerald-500/15 border-emerald-500 text-emerald-400",
    description: "Warm, collaborative — assumes good intent",
  },
  {
    value: "formal",
    label: "Formal",
    color: "border-blue-500/30 text-blue-400/60 hover:text-blue-400 hover:border-blue-500/60",
    activeColor: "bg-blue-500/15 border-blue-500 text-blue-400",
    description: "Professional, neutral business language",
  },
  {
    value: "firm",
    label: "Firm",
    color: "border-red-500/30 text-red-400/60 hover:text-red-400 hover:border-red-500/60",
    activeColor: "bg-red-500/15 border-red-500 text-red-400",
    description: "Assertive, urgent — escalation implied",
  },
];

const CURRENT_ANALYST_ID = 1;

export default function Mailbox() {
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedTone, setSelectedTone] = useState<Tone>("formal");
  const [isGenerating, setIsGenerating] = useState(false);
  const [composeData, setComposeData] = useState({ invoiceId: "", to: "", body: "" });
  const abortRef = useRef<AbortController | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: threads, isLoading: isLoadingThreads } = useListEmailThreads({
    status: filterStatus !== "all" ? filterStatus as EmailThreadStatus : undefined,
  });
  const { data: selectedThread, isLoading: isLoadingThread } = useGetEmailThread(selectedThreadId!, {
    query: { enabled: !!selectedThreadId },
  });
  const { data: invoicesData } = useListInvoices({ pageSize: 200 });

  const replyMutation = useReplyEmailThread();
  const closeMutation = useCloseEmailThread();
  const createMutation = useCreateEmailThread();

  // Find the invoice linked to the selected thread
  const linkedInvoice = selectedThread
    ? invoicesData?.invoices.find((i) => i.id === selectedThread.invoiceId)
    : null;

  const handleGenerateAI = async () => {
    if (!selectedThread) return;

    // Cancel any in-flight generation
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setReplyBody("");

    // Find the last inbound message to respond to
    const messages = selectedThread.messages ?? [];
    const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");

    try {
      const res = await fetch("/api/ai/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          tone: selectedTone,
          invoiceNumber: selectedThread.invoiceNumber,
          amount: linkedInvoice?.amount ?? 0,
          overdueDays: linkedInvoice?.overdueDays ?? 0,
          customerMessage: lastInbound?.body,
          threadHistory: messages.map((m) => ({
            direction: m.direction,
            body: m.body,
            from: m.from,
          })),
        }),
      });

      if (!res.ok || !res.body) throw new Error("Generation failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const parsed = JSON.parse(json);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.done) break;
            if (parsed.content) {
              setReplyBody((prev) => prev + parsed.content);
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast({ title: "AI generation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReply = () => {
    if (!selectedThreadId || !replyBody.trim()) return;
    replyMutation.mutate(
      { id: selectedThreadId, data: { body: replyBody, direction: "outbound" } },
      {
        onSuccess: () => {
          setReplyBody("");
          queryClient.invalidateQueries({ queryKey: getGetEmailThreadQueryKey(selectedThreadId) });
          queryClient.invalidateQueries({ queryKey: getListEmailThreadsQueryKey() });
          toast({ title: "Reply sent" });
        },
      }
    );
  };

  const handleCloseThread = () => {
    if (!selectedThreadId) return;
    closeMutation.mutate(
      { id: selectedThreadId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEmailThreadQueryKey(selectedThreadId) });
          queryClient.invalidateQueries({ queryKey: getListEmailThreadsQueryKey() });
          toast({ title: "Thread resolved" });
        },
      }
    );
  };

  const handleSelectInvoice = (invoiceId: string) => {
    const inv = invoicesData?.invoices.find((i) => i.id === invoiceId);
    setComposeData((d) => ({ ...d, invoiceId, to: inv?.customerEmail ?? d.to }));
  };

  const selectedInvoice = invoicesData?.invoices.find((i) => i.id === composeData.invoiceId);

  const handleCompose = () => {
    createMutation.mutate(
      { data: { invoiceId: composeData.invoiceId, to: composeData.to, body: composeData.body, analystId: CURRENT_ANALYST_ID } },
      {
        onSuccess: (newThread) => {
          setIsComposeOpen(false);
          setComposeData({ invoiceId: "", to: "", body: "" });
          queryClient.invalidateQueries({ queryKey: getListEmailThreadsQueryKey() });
          setSelectedThreadId(newThread.id);
          toast({ title: "Follow-up email sent" });
        },
      }
    );
  };

  const activeToneConfig = TONES.find((t) => t.value === selectedTone)!;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Panel — Thread List */}
      <div className="w-[320px] shrink-0 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold tracking-tight">Team Mailbox</h2>
            <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 gap-1">
                  <Plus className="w-3.5 h-3.5" /> Compose
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>New Collections Follow-up</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Invoice</label>
                    <Select value={composeData.invoiceId} onValueChange={handleSelectInvoice}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select invoice..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        {invoicesData?.invoices
                          .filter((inv) => inv.overdueDays > 0 || inv.status === "current")
                          .map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>
                              <span className="font-mono text-xs">{inv.invoiceNumber}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{inv.customerName}</span>
                              {inv.overdueDays > 0 && (
                                <span className="text-destructive ml-2 text-xs">({inv.overdueDays}d overdue)</span>
                              )}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {selectedInvoice && (
                      <div className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
                        Amount: <span className="font-mono text-foreground">${selectedInvoice.amount.toLocaleString()}</span> · Due: {formatDate(selectedInvoice.dueDate)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">To (Customer Email)</label>
                    <Input type="email" placeholder="ap@customer.com" value={composeData.to} onChange={(e) => setComposeData({ ...composeData, to: e.target.value })} className="bg-background" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Message</label>
                    <Textarea className="min-h-[140px] bg-background text-sm" placeholder="Write your follow-up message..." value={composeData.body} onChange={(e) => setComposeData({ ...composeData, body: e.target.value })} />
                  </div>
                  <Button className="w-full gap-2" onClick={handleCompose} disabled={!composeData.invoiceId || !composeData.to || !composeData.body || createMutation.isPending}>
                    <Send className="w-4 h-4" />
                    {createMutation.isPending ? "Sending..." : "Send Follow-up"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs bg-background">
              <Filter className="w-3 h-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Threads</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="awaiting_reply">Awaiting Reply</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          {isLoadingThreads ? (
            <div className="p-4 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : threads?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
              <Mail className="w-8 h-8 mb-2 opacity-20" />No threads found.
            </div>
          ) : (
            threads?.map((thread) => (
              <div
                key={thread.id}
                onClick={() => { setSelectedThreadId(thread.id); setReplyBody(""); }}
                className={`p-4 border-b border-border cursor-pointer transition-colors border-l-2 ${
                  selectedThreadId === thread.id ? "bg-secondary/40 border-l-primary" : "hover:bg-muted/20 border-l-transparent"
                }`}
              >
                <div className="flex justify-between items-start mb-0.5">
                  <div className="font-semibold text-sm truncate flex-1">{thread.customerName}</div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">{formatDate(thread.updatedAt)}</div>
                </div>
                <div className="text-[10px] font-mono text-primary mb-1.5">{thread.invoiceNumber}</div>
                <div className="flex justify-between items-center gap-2">
                  <div className="text-xs text-muted-foreground truncate flex-1">
                    {thread.messages?.[thread.messages.length - 1]?.body?.substring(0, 45)}...
                  </div>
                  <Badge className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${STATUS_COLORS[thread.status]}`}>
                    {STATUS_LABELS[thread.status]}
                  </Badge>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1.5">via {thread.analystName}</div>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Right Panel — Conversation */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {selectedThreadId ? (
          isLoadingThread || !selectedThread ? (
            <div className="flex-1 flex items-center justify-center">
              <Skeleton className="h-64 w-full max-w-2xl mx-8" />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="p-4 border-b border-border bg-card shrink-0">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold truncate">{selectedThread.subject}</h2>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium text-foreground">{selectedThread.customerName}</span>
                      {" "}<span className="opacity-50">({selectedThread.customerEmail})</span>
                      {" "}→{" "}
                      <span className="font-medium text-foreground">{selectedThread.analystName}</span>
                      {linkedInvoice && linkedInvoice.overdueDays > 0 && (
                        <span className="ml-3 text-destructive font-semibold">{linkedInvoice.overdueDays}d overdue</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`${STATUS_COLORS[selectedThread.status]} text-xs`}>{STATUS_LABELS[selectedThread.status]}</Badge>
                    {selectedThread.status !== "closed" && (
                      <Button variant="outline" size="sm" onClick={handleCloseThread} className="gap-1 h-8 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-6 py-4">
                <div className="max-w-3xl mx-auto space-y-5">
                  {selectedThread.messages.map((msg) => {
                    const isOutbound = msg.direction === "outbound";
                    return (
                      <div key={msg.id} className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}>
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            {isOutbound ? selectedThread.analystName : selectedThread.customerName}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">{formatDateTime(msg.sentAt)}</span>
                        </div>
                        <div className={`p-4 rounded-xl max-w-[80%] text-sm leading-relaxed ${
                          isOutbound
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted text-foreground rounded-tl-sm border border-border"
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Reply area */}
              {selectedThread.status !== "closed" && (
                <div className="border-t border-border bg-card shrink-0">
                  {/* Tone selector + AI generate */}
                  <div className="px-4 pt-3 pb-2 flex items-center gap-3 border-b border-border/50">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI Tone</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-1">
                      {TONES.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setSelectedTone(t.value)}
                          title={t.description}
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                            selectedTone === t.value ? t.activeColor : t.color
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn(
                        "h-7 gap-1.5 text-xs shrink-0 border transition-all",
                        isGenerating
                          ? "border-violet-500/50 text-violet-400"
                          : "border-violet-500/30 text-violet-400/80 hover:text-violet-400 hover:border-violet-500/70 hover:bg-violet-500/10"
                      )}
                      onClick={isGenerating ? () => abortRef.current?.abort() : handleGenerateAI}
                    >
                      {isGenerating ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Stop</>
                      ) : (
                        <><Sparkles className="w-3 h-3" /> Generate {activeToneConfig.label} Draft</>
                      )}
                    </Button>
                  </div>

                  <div className="p-4">
                    <div className="max-w-3xl mx-auto">
                      <div className="relative">
                        <Textarea
                          placeholder={`Reply as ${selectedThread.analystName}... or use AI to generate a ${selectedTone} draft above.`}
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          className={cn(
                            "resize-none bg-background border-input mb-3 min-h-[110px] text-sm transition-all",
                            isGenerating && "border-violet-500/40"
                          )}
                        />
                        {isGenerating && (
                          <div className="absolute bottom-5 right-3 flex items-center gap-1 text-[10px] text-violet-400">
                            <span className="inline-block w-1 h-3 bg-violet-400 animate-pulse rounded-sm" />
                            Writing…
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-xs text-muted-foreground">
                          Sending as <span className="font-medium text-foreground">{selectedThread.analystName}</span>
                          {replyBody && (
                            <button
                              className="ml-3 text-muted-foreground/60 hover:text-muted-foreground"
                              onClick={() => setReplyBody("")}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <Button
                          onClick={handleReply}
                          disabled={!replyBody.trim() || replyMutation.isPending || isGenerating}
                          className="gap-2"
                          size="sm"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {replyMutation.isPending ? "Sending..." : "Send Reply"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Mail className="w-14 h-14 opacity-10" />
            <p className="text-sm">Select a thread to view the conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}
