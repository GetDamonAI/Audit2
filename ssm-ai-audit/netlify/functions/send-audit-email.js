exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body || "{}");
    const resendKey = process.env.RESEND_API_KEY;

    if (!resendKey) {
      return respond(500, { error: "Missing RESEND_API_KEY" });
    }

    const email = String(data.email || "").trim();
    const businessName = String(data.businessName || "").trim();
    const url = String(data.url || "").trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(400, { error: "Please enter a valid email address." });
    }

    if (!url) {
      return respond(400, { error: "Missing website URL." });
    }

    const prioritiesHtml = (data.priorities || [])
      .map((item) => `<li>${escapeHtml(String(item))}</li>`)
      .join("");

    const adminHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 640px; margin: 0 auto;">
        <h2>${escapeHtml(businessName || "New lead")}</h2>
        <p><strong>Website:</strong> ${escapeHtml(url)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Score:</strong> ${escapeHtml(String(data.score || 0))}/100</p>
        <p>${escapeHtml(String(data.summary || ""))}</p>
        <ol>${prioritiesHtml}</ol>
      </div>
    `;

    const userHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 640px; margin: 0 auto;">
        <h2>Your AI Visibility Score: ${escapeHtml(String(data.score || 0))}/100</h2>
        <p>${escapeHtml(String(data.summary || ""))}</p>
        <ol>${prioritiesHtml}</ol>

        <p style="margin:20px 0 12px;">
          <a href="https://calendar.app.google/XtiHBsQCKT1hSoJe6"
             style="display:inline-block; padding:14px 22px; background:#232323; color:#fff; text-decoration:none; border-radius:999px;">
            Book a 15 Minute Review
          </a>
        </p>

        <p style="margin:0 0 24px;">
          <a href="https://www.semanticsearchmarketing.com/contact"
             style="display:inline-block; padding:14px 22px; background:#f1efeb; color:#171717; text-decoration:none; border-radius:999px; border:1px solid #ddd;">
            Get a Full Review
          </a>
        </p>

        <p>Thanks,<br>Damon Holowchak<br>Semantic Search Marketing</p>
      </div>
    `;

    const adminSend = await sendOne(resendKey, "hello@semanticsearchmarketing.com", `New Audit Lead${businessName ? ` - ${businessName}` : ""}`, adminHtml);
    const userSend = await sendOne(resendKey, email, `Your AI Visibility Audit${businessName ? ` - ${businessName}` : ""}`, userHtml);

    if (!adminSend.ok || !userSend.ok) {
      return respond(500, {
        error: "Email send failed",
        adminSend,
        userSend
      });
    }

    return respond(200, { success: true });
  } catch (error) {
    return respond(500, { error: error.message || "Email send failed" });
  }
};

async function sendOne(resendKey, to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "audit@semanticsearchmarketing.com",
      to: [to],
      subject,
      html
    })
  });

  const result = await res.json();
  return { ok: res.ok, result };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
