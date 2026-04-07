function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listHtml(items) {
  return (items || [])
    .map(
      (item) =>
        `<li style="margin:0 0 10px; line-height:1.6; color:#3f3933;">${esc(item)}</li>`
    )
    .join("");
}

async function resendEmail({ resendKey, from, to, subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html
    })
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.AUDIT_EMAIL_FROM || "audit@semanticsearchmarketing.com";
    const notificationTo = process.env.AUDIT_NOTIFICATION_TO || "";
    const bookingUrl =
      process.env.AUDIT_BOOKING_URL || "https://calendar.app.google/XtiHBsQCKT1hSoJe6";
    const contactUrl =
      process.env.AUDIT_CONTACT_URL || "https://www.semanticsearchmarketing.com/contact";

    if (!resendKey) {
      throw new Error("Missing RESEND_API_KEY");
    }

    const body = JSON.parse(event.body || "{}");
    const lead = body.lead || {};
    const audit = body.audit || {};

    if (!lead.email || !audit.overallScore) {
      return json(400, { error: "Missing lead email or audit payload" });
    }

    const leadHtml = `
      <div style="margin:0; padding:0; background:#f7f5f2;">
        <div style="max-width:680px; margin:0 auto; padding:32px 20px; font-family:Arial, sans-serif; color:#111111;">
          <div style="background:#ffffff; border:1px solid #e9e3da; border-radius:20px; padding:32px;">
            <p style="margin:0 0 10px; font-size:12px; line-height:1.4; letter-spacing:0.12em; text-transform:uppercase; color:#6b645b; font-weight:700;">
              AI Visibility Audit
            </p>

            <h1 style="margin:0 0 12px; font-size:30px; line-height:1.1; color:#111111;">
              Your AI Visibility Score: ${esc(audit.overallScore)}/100
            </h1>

            <p style="margin:0 0 20px; font-size:16px; line-height:1.7; color:#4d463f;">
              ${esc(audit.executiveSummary || "")}
            </p>

            <div style="margin:0 0 24px; padding:18px; background:#faf8f4; border:1px solid #eee7de; border-radius:16px;">
              <p style="margin:0 0 8px; font-size:14px; line-height:1.5;"><strong>Website:</strong> ${esc(lead.url || "")}</p>
              <p style="margin:0 0 8px; font-size:14px; line-height:1.5;"><strong>Business:</strong> ${esc(lead.businessName || "")}</p>
              <p style="margin:0; font-size:14px; line-height:1.5;"><strong>Main service:</strong> ${esc(lead.service || "")}</p>
            </div>

            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:0 0 24px;">
              <div style="border:1px solid #eee7de; border-radius:16px; padding:14px; background:#fffdfa;">
                <div style="font-size:12px; color:#6b645b; margin-bottom:6px;">Overall</div>
                <div style="font-size:24px; font-weight:700;">${esc(audit.overallScore)}</div>
              </div>
              <div style="border:1px solid #eee7de; border-radius:16px; padding:14px; background:#fffdfa;">
                <div style="font-size:12px; color:#6b645b; margin-bottom:6px;">Performance</div>
                <div style="font-size:24px; font-weight:700;">${esc(audit.categoryScores?.performance || "--")}</div>
              </div>
              <div style="border:1px solid #eee7de; border-radius:16px; padding:14px; background:#fffdfa;">
                <div style="font-size:12px; color:#6b645b; margin-bottom:6px;">SEO</div>
                <div style="font-size:24px; font-weight:700;">${esc(audit.categoryScores?.seo || "--")}</div>
              </div>
              <div style="border:1px solid #eee7de; border-radius:16px; padding:14px; background:#fffdfa;">
                <div style="font-size:12px; color:#6b645b; margin-bottom:6px;">SERP</div>
                <div style="font-size:24px; font-weight:700;">${esc(audit.categoryScores?.serp || "--")}</div>
              </div>
            </div>

            <h2 style="margin:0 0 10px; font-size:20px; line-height:1.2;">What’s working</h2>
            <ul style="margin:0 0 22px; padding-left:18px;">
              ${listHtml(audit.strengths)}
            </ul>

            <h2 style="margin:0 0 10px; font-size:20px; line-height:1.2;">Priority fixes</h2>
            <ul style="margin:0 0 22px; padding-left:18px;">
              ${listHtml(audit.priorityFixes)}
            </ul>

            <h2 style="margin:0 0 10px; font-size:20px; line-height:1.2;">AI search interpretation</h2>
            <ul style="margin:0 0 24px; padding-left:18px;">
              ${listHtml(audit.aiVisibilityReadout)}
            </ul>

            <div style="margin:0 0 8px;">
              <a href="${esc(bookingUrl)}"
                 style="display:inline-block; background:#232323; color:#ffffff; text-decoration:none; padding:14px 22px; border-radius:999px; font-size:15px; font-weight:600; margin:0 10px 10px 0;">
                Book a 15 Minute Review
              </a>

              <a href="${esc(contactUrl)}"
                 style="display:inline-block; background:#efebe5; color:#111111; text-decoration:none; padding:14px 22px; border-radius:999px; font-size:15px; font-weight:600; margin:0 10px 10px 0;">
                Get Full Review
              </a>
            </div>

            <p style="margin:22px 0 0; font-size:15px; line-height:1.6; color:#4d463f;">
              — Damon<br />
              Semantic Search Marketing
            </p>
          </div>
        </div>
      </div>
    `;

    const leadSend = await resendEmail({
      resendKey,
      from: `Semantic Search Marketing <${fromEmail}>`,
      to: [lead.email],
      subject: "Your AI Visibility Audit",
      html: leadHtml
    });

    if (!leadSend.ok) {
      return json(500, {
        error: "Failed to send lead email",
        details: leadSend.data
      });
    }

    if (notificationTo) {
      const internalHtml = `
        <div style="font-family:Arial,sans-serif; padding:24px;">
          <h2>New AI Audit Lead</h2>
          <p><strong>Business:</strong> ${esc(lead.businessName)}</p>
          <p><strong>Website:</strong> ${esc(lead.url)}</p>
          <p><strong>Email:</strong> ${esc(lead.email)}</p>
          <p><strong>Industry:</strong> ${esc(lead.industry)}</p>
          <p><strong>Service:</strong> ${esc(lead.service)}</p>
          <hr />
          <p><strong>Overall Score:</strong> ${esc(audit.overallScore)}</p>
          <p><strong>Summary:</strong> ${esc(audit.executiveSummary || "")}</p>
          <p><strong>Strengths:</strong></p>
          <ul>${listHtml(audit.strengths)}</ul>
          <p><strong>Priority Fixes:</strong></p>
          <ul>${listHtml(audit.priorityFixes)}</ul>
          <p><strong>AI Search Interpretation:</strong></p>
          <ul>${listHtml(audit.aiVisibilityReadout)}</ul>
        </div>
      `;

      await resendEmail({
        resendKey,
        from: `Semantic Search Marketing <${fromEmail}>`,
        to: [notificationTo],
        subject: `New AI Audit Lead: ${lead.businessName || lead.email}`,
        html: internalHtml
      });
    }

    return json(200, {
      success: true
    });
  } catch (error) {
    console.error("send-audit-email error:", error);
    return json(500, {
      error: error.message || "Internal server error"
    });
  }
};
