// Vercel serverless function: pulls recent Gmail messages and stores new inbound ones in Supabase.
import { createClient } from "@supabase/supabase-js";

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

function header(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

function extractEmail(fromRaw) {
  const m = (fromRaw || "").match(/<([^>]+)>/);
  return (m ? m[1] : fromRaw || "").trim().toLowerCase();
}

// walk MIME parts to find text/plain body
function findBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const b = findBody(part);
      if (b) return b;
    }
  }
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  return "";
}

export default async function handler(req, res) {
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: "Missing Supabase env vars" });

  try {
    const supabase = createClient(SUPA_URL, SUPA_KEY);
    const token = await getAccessToken();
    if (!token) return res.status(500).json({ error: "Could not get access token" });

    // list recent inbox messages (last 20)
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const listData = await listRes.json();
    const ids = (listData.messages || []).map((m) => m.id);

    // map sender email -> customer
    const { data: contacts } = await supabase.from("customer_contacts").select("customer_id, email");
    const contactMap = new Map((contacts || []).map((c) => [c.email.toLowerCase(), c.customer_id]));

    let inserted = 0;
    for (const id of ids) {
      // skip if already stored
      const { data: existing } = await supabase.from("email_messages").select("id").eq("gmail_message_id", id).maybeSingle();
      if (existing) continue;

      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msg = await msgRes.json();
      const headers = msg.payload?.headers || [];
      const fromRaw = header(headers, "From");
      const fromEmail = extractEmail(fromRaw);
      const subject = header(headers, "Subject");
      const body = findBody(msg.payload).slice(0, 5000);
      const dateHeader = header(headers, "Date");
      const sentAt = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();

      const customerId = contactMap.get(fromEmail) || null;

      // find or create a thread (by gmail thread id)
      let threadId = null;
      const { data: existingThread } = await supabase
        .from("email_messages").select("thread_id").eq("gmail_thread_id", msg.threadId).limit(1).maybeSingle();
      if (existingThread?.thread_id) {
        threadId = existingThread.thread_id;
      } else {
        const { data: t } = await supabase.from("email_threads")
          .insert({ customer_id: customerId, customer_name: fromEmail, subject, last_message_at: sentAt })
          .select().single();
        threadId = t?.id ?? null;
      }

      await supabase.from("email_messages").insert({
        thread_id: threadId,
        direction: "inbound",
        from_email: fromEmail,
        to_email: "me",
        subject,
        body,
        gmail_message_id: id,
        gmail_thread_id: msg.threadId,
        sent_at: sentAt,
      });
      inserted++;
    }

    return res.status(200).json({ ok: true, scanned: ids.length, inserted });
  } catch (e) {
    return res.status(500).json({ error: "Unexpected error", detail: String(e) });
  }
}
