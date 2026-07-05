import { Router } from "express";
import OpenAI from "openai";

const router = Router();

// Groq uses an OpenAI-compatible API — same SDK, different base URL + key
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

type Tone = "friendly" | "formal" | "firm";

function buildSystemPrompt(tone: Tone, overdueDays: number, invoiceNumber: string, amount: number): string {
  const overdueContext =
    overdueDays > 0
      ? `The invoice is ${overdueDays} days past due.`
      : `The invoice is not yet overdue.`;

  const toneInstructions: Record<Tone, string> = {
    friendly: `Write in a warm, collaborative tone. Be understanding and solution-focused. Assume good intent from the customer. Use phrases like "we understand", "happy to help", "looking forward to resolving this". Keep it professional but approachable. Avoid pressure language.`,
    formal: `Write in a professional, neutral business tone using standard business language. Be polite but direct. Avoid casual phrasing and emotional appeals. Stick to facts — invoice number, amounts, due dates, and next steps.`,
    firm: `Write in a firm, assertive tone. Make clear that payment is overdue and required promptly. Reference contractual or payment terms. Be polite but unambiguous about urgency. Indicate that further escalation steps may follow if payment is not received promptly.`,
  };

  return `You are an experienced AR collections specialist drafting a follow-up email on behalf of your company's finance team.

Context:
- Invoice: ${invoiceNumber}
- Amount: $${Number(amount).toLocaleString()}
- ${overdueContext}
- Tone required: ${tone.toUpperCase()}

Tone instructions: ${toneInstructions[tone]}

Rules:
- Write ONLY the email body — no subject line, no From/To headers
- Start directly with a greeting (e.g. "Dear [Customer Name]," or "Hi [Name],")
- Keep it concise: 3–5 short paragraphs
- End with a clear call to action (expected payment date, confirmation request, or next step)
- Sign off with "Best regards," and leave "[Your Name]" as a placeholder
- Do not invent facts not provided — only reference the invoice number, amount, and days overdue
- If the customer raised a concern in their last message, acknowledge it naturally`;
}

router.post("/ai/generate-reply", async (req, res) => {
  const {
    tone,
    invoiceNumber,
    amount,
    overdueDays,
    customerMessage,
    threadHistory,
  } = req.body as {
    tone: Tone;
    invoiceNumber: string;
    amount: number;
    overdueDays: number;
    customerMessage?: string;
    threadHistory?: Array<{ direction: string; body: string; from: string }>;
  };

  if (!tone || !invoiceNumber) {
    res.status(400).json({ error: "tone and invoiceNumber are required" });
    return;
  }

  const systemPrompt = buildSystemPrompt(tone, overdueDays ?? 0, invoiceNumber, amount ?? 0);

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  let userContent = "";

  if (threadHistory && threadHistory.length > 0) {
    const lastFew = threadHistory.slice(-4);
    userContent += "Email thread context (recent messages):\n";
    for (const msg of lastFew) {
      const label = msg.direction === "inbound" ? `Customer (${msg.from})` : "Our team";
      userContent += `\n${label}:\n${msg.body}\n`;
    }
    userContent += "\n---\n";
  }

  if (customerMessage) {
    userContent += `The customer's latest message to respond to:\n${customerMessage}\n\n`;
  }

  userContent += `Now draft a ${tone} reply email body.`;
  messages.push({ role: "user", content: userContent });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 600,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  }

  res.end();
});

export default router;
