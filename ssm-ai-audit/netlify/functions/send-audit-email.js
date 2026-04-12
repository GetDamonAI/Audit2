exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body || "{}");
    const resendKey = process.env.RESEND_API_KEY;
    const alertTo = process.env.AUDIT_NOTIFICATION_TO || process.env.AUDIT_ALERT_EMAIL || "hello@semanticsearchmarketing.com";
    const fromEmail = process.env.AUDIT_EMAIL_FROM || "audit@semanticsearchmarketing.com";
    const mode = String(data.mode || "full-report").trim();

    if (!resendKey) {
      return respond(500, { error: "Missing RESEND_API_KEY" });
    }

    const businessName = String(data.businessName || "").trim();
    const url = String(data.url || "").trim();
    const submittedAt = new Date().toISOString();

    if (!url) {
      return respond(400, { error: "Missing website URL." });
    }

    if (mode === "quick-audit-notify") {
      const quickAuditHtml = renderQuickAuditInternalEmail({
        businessName,
        url,
        submittedAt,
        data
      });

      const quickAuditSend = await sendOne({
        resendKey,
        fromEmail,
        to: alertTo,
        subject: `Quick Audit Completed - ${businessName || url}`,
        html: quickAuditHtml
      });

      if (!quickAuditSend.ok) {
        return respond(500, {
          error: "Quick audit notification send failed",
          quickAuditSend
        });
      }

      return respond(200, {
        success: true,
        mode
      });
    }

    const email = String(data.email || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(400, { error: "Please enter a valid email address." });
    }

    const userHtml = renderUserEmail({
      businessName,
      url,
      data
    });

    const internalHtml = renderInternalEmail({
      businessName,
      email,
      url,
      submittedAt,
      data
    });

    const [userSend, internalSend] = await Promise.all([
      sendOne({
        resendKey,
        fromEmail,
        to: email,
        subject: `Your AI Visibility Audit${businessName ? ` - ${businessName}` : ""}`,
        html: userHtml
      }),
      sendOne({
        resendKey,
        fromEmail,
        to: alertTo,
        subject: `Full Report Requested - ${businessName || url}`,
        html: internalHtml
      }).catch((error) => ({ ok: false, error: error.message }))
    ]);

    if (!userSend.ok) {
      return respond(500, {
        error: "User email send failed",
        userSend
      });
    }

    return respond(200, {
      success: true,
      mode,
      internalNotificationSent: Boolean(internalSend?.ok)
    });
  } catch (error) {
    return respond(500, { error: error.message || "Email send failed" });
  }
};

async function sendOne({ resendKey, fromEmail, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail || "audit@semanticsearchmarketing.com",
      to: [to],
      subject,
      html
    })
  });

  const text = await res.text();
  let result = {};

  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { raw: text };
  }

  return { ok: res.ok, result };
}

function renderQuickAuditInternalEmail({ businessName, url, submittedAt, data }) {
  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 680px; margin: 0 auto;">
      <h2 style="margin:0 0 12px;">Quick Audit Completed</h2>
      <p><strong>Website:</strong> ${escapeHtml(url)}</p>
      <p><strong>Business:</strong> ${escapeHtml(businessName || "Unknown")}</p>
      <p><strong>Timestamp:</strong> ${escapeHtml(submittedAt)}</p>
      <p><strong>Score:</strong> ${escapeHtml(String(data.score || 0))}/100</p>
      <p><strong>Current Status:</strong> ${escapeHtml(String(data.aiVerdict || "Not available"))}</p>
      <p><strong>Summary:</strong> ${escapeHtml(String(data.summary || "Not available"))}</p>
      <p><strong>Entity Confidence:</strong> ${escapeHtml(formatEntityConfidence(data.entityConfidence))}</p>
      <p><strong>AI Recommendation:</strong> ${escapeHtml(formatRecommendation(data.recommendation))}</p>
      <div style="margin-top:18px;">
        <p><strong>Breakdown</strong></p>
        <ul>${renderPlainBreakdownItems(data.breakdown)}</ul>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Main Findings</strong></p>
        <ol>${renderPlainListItems(data.aiIssues, "No findings returned.")}</ol>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Priorities</strong></p>
        <ol>${renderPlainListItems(data.priorities, "No priorities returned.")}</ol>
      </div>
    </div>
  `;
}

function renderUserEmail({ businessName, url, data }) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f7f5f2; padding: 24px 16px;">
      <div style="max-width: 680px; margin: 0 auto; background:#ffffff; border:1px solid rgba(23,23,23,0.08); border-radius:24px; padding:32px 28px;">
        <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">AI Visibility Audit</p>
        <h2 style="margin:0 0 12px; font-size:34px; line-height:1.05; color:#1a1a1a;">Your AI visibility score: ${escapeHtml(String(data.score || 0))}/100</h2>
        <p style="margin:0 0 8px; font-size:16px; line-height:1.5; color:#555555;"><strong style="color:#1a1a1a;">Business:</strong> ${escapeHtml(businessName || "Your business")}</p>
        <p style="margin:0 0 22px; font-size:16px; line-height:1.5; color:#555555;"><strong style="color:#1a1a1a;">Website:</strong> ${escapeHtml(url)}</p>

        ${renderTextSection("Summary", data.summary)}
        ${renderTextSection("AI Verdict", data.aiVerdict)}
        ${renderTextSection("AI Recommendation", formatRecommendation(data.recommendation))}
        ${renderTextSection("Entity Confidence", formatEntityConfidence(data.entityConfidence))}
        ${renderBreakdownSection("Full Breakdown", data.breakdown)}
        ${renderListSection("What AI Is Missing", data.aiIssues)}
        ${renderListSection("What You Should Fix", data.priorities)}
        ${renderListSection("Top AI Queries", data.topAiQueries)}
        ${renderListSection("Competitor Recommendation Notes", data.competitorAdvantage)}
        ${renderTextSection("Biggest Opportunity", data.opportunity)}

        <div style="margin:28px 0 0; padding-top:24px; border-top:1px solid rgba(23,23,23,0.08);">
          <p style="margin:0 0 14px; font-size:16px; line-height:1.5; color:#555555;">Want a more tailored review? Book a quick walkthrough or get extra help.</p>
          <p style="margin:0 0 12px;">
            <a href="https://calendar.app.google/XtiHBsQCKT1hSoJe6"
               style="display:inline-block; padding:14px 22px; background:#232323; color:#ffffff; text-decoration:none; border-radius:999px;">
              Book a 15 Minute Review
            </a>
          </p>
          <p style="margin:0 0 24px;">
            <a href="https://www.semanticsearchmarketing.com/contact"
               style="display:inline-block; padding:14px 22px; background:#f1efeb; color:#171717; text-decoration:none; border-radius:999px; border:1px solid #dddddd;">
              Get Some Extra Help Here
            </a>
          </p>
        </div>

        <p style="margin:0; font-size:16px; line-height:1.5; color:#555555;">Thanks,<br>Damon Holowchak<br>Semantic Search Marketing</p>
      </div>
    </div>
  `;
}

function renderInternalEmail({ businessName, email, url, submittedAt, data }) {
  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 680px; margin: 0 auto;">
      <h2 style="margin:0 0 12px;">Full Report Requested</h2>
      <p><strong>Website:</strong> ${escapeHtml(url)}</p>
      <p><strong>Business:</strong> ${escapeHtml(businessName || "Unknown")}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Timestamp:</strong> ${escapeHtml(submittedAt)}</p>
      <p><strong>Score:</strong> ${escapeHtml(String(data.score || 0))}/100</p>
      <p><strong>Current Status:</strong> ${escapeHtml(String(data.aiVerdict || "Not available"))}</p>
      <p><strong>Summary:</strong> ${escapeHtml(String(data.summary || "Not available"))}</p>
      <p><strong>Entity Confidence:</strong> ${escapeHtml(formatEntityConfidence(data.entityConfidence))}</p>
      <p><strong>AI Recommendation:</strong> ${escapeHtml(formatRecommendation(data.recommendation))}</p>
      <div style="margin-top:18px;">
        <p><strong>Breakdown</strong></p>
        <ul>${renderPlainBreakdownItems(data.breakdown)}</ul>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Main Findings</strong></p>
        <ol>${renderPlainListItems(data.aiIssues, "No findings returned.")}</ol>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Priorities</strong></p>
        <ol>${renderPlainListItems(data.priorities, "No priorities returned.")}</ol>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Top AI Queries</strong></p>
        <ol>${renderPlainListItems(data.topAiQueries, "No queries returned.")}</ol>
      </div>
    </div>
  `;
}

function renderTextSection(title, value) {
  const safeValue = escapeHtml(String(value || "").trim() || "Not available");
  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">${escapeHtml(title)}</p>
      <p style="margin:0; font-size:16px; line-height:1.55; color:#1a1a1a;">${safeValue}</p>
    </div>
  `;
}

function renderListSection(title, items) {
  const list = renderStyledListItems(items);
  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">${escapeHtml(title)}</p>
      <ol style="margin:0; padding-left:20px; color:#1a1a1a; font-size:16px; line-height:1.55;">${list}</ol>
    </div>
  `;
}

function renderBreakdownSection(title, breakdown) {
  const rows = Array.isArray(breakdown) && breakdown.length
    ? breakdown.map((item) => {
        const label = escapeHtml(String(item?.label || "Signal"));
        const value = escapeHtml(String(item?.value ?? 0));
        return `
          <tr>
            <td style="padding:10px 0; border-bottom:1px solid rgba(23,23,23,0.08); font-size:16px; line-height:1.45; color:#1a1a1a;">${label}</td>
            <td style="padding:10px 0; border-bottom:1px solid rgba(23,23,23,0.08); font-size:16px; line-height:1.45; color:#555555; text-align:right; white-space:nowrap;">${value} / 100</td>
          </tr>
        `;
      }).join("")
    : `
        <tr>
          <td style="padding:10px 0; font-size:16px; line-height:1.45; color:#1a1a1a;">Audit signals</td>
          <td style="padding:10px 0; font-size:16px; line-height:1.45; color:#555555; text-align:right; white-space:nowrap;">0 / 100</td>
        </tr>
      `;

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">${escapeHtml(title)}</p>
      <table role="presentation" style="width:100%; border-collapse:collapse;">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderPlainListItems(items, fallback) {
  const values = Array.isArray(items)
    ? items.filter((item) => String(item || "").trim())
    : [];

  const entries = values.length ? values : [fallback];
  return entries
    .map((item) => `<li>${escapeHtml(String(item))}</li>`)
    .join("");
}

function renderPlainBreakdownItems(items) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) {
    return "<li>No breakdown returned.</li>";
  }

  return values
    .map((item) => {
      const label = escapeHtml(String(item?.label || "Signal"));
      const value = escapeHtml(String(item?.value ?? 0));
      return `<li>${label}: ${value}/100</li>`;
    })
    .join("");
}

function renderStyledListItems(items) {
  const values = Array.isArray(items)
    ? items.filter((item) => String(item || "").trim())
    : [];

  const entries = values.length ? values : ["Not available"];
  return entries
    .map((item) => `<li style="margin:0 0 8px;">${escapeHtml(String(item))}</li>`)
    .join("");
}

function formatRecommendation(recommendation) {
  const likelihood = String(recommendation?.likelihood || "").trim();
  const reason = String(recommendation?.reason || "").trim();

  if (likelihood && reason) {
    return `${likelihood}: ${reason}`;
  }

  return likelihood || reason || "Not available";
}

function formatEntityConfidence(value) {
  return `${Number(value ?? 0)}/100`;
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
