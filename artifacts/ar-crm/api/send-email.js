// Vercel serverless function: sends an email (with optional CC) as the connected Gmail account.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, cc, subject, body } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing to, subject, or body" });
  }

  const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
  const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return res.status(500).json({ error: "Server not configured (missing Gmail env vars)" });
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(500).json({ error: "Could not get access token", detail: tokenData });
    }

    // build headers; to and cc can be comma-separated lists
    const headerLines = [`To: ${to}`];
    if (cc && String(cc).trim()) headerLines.push(`Cc: ${cc}`);
    headerLines.push(`Subject: ${subject}`);
    headerLines.push("Content-Type: text/plain; charset=UTF-8");
    headerLines.push("");
    headerLines.push(body);

    const raw = Buffer.from(headerLines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sendRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }
    );
    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      return res.status(500).json({ error: "Gmail send failed", detail: sendData });
    }

    return res.status(200).json({ ok: true, id: sendData.id, threadId: sendData.threadId });
  } catch (e) {
    return res.status(500).json({ error: "Unexpected error", detail: String(e) });
  }
}
