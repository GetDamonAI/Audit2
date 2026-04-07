exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body || "{}");
    const resendKey = process.env.RESEND_API_KEY;

    if (!resendKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing RESEND_API_KEY" })
      };
    }

    if (!data.email || !data.url) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing lead email or audit payload" })
      };
    }

    const prioritiesHtml = (data.priorities || [])
      .map((item) => `<li>${item}</li>`)
      .join("");

    const adminHtml = `
      <div style="font-family: Roboto, Arial, sans-serif; padding: 24px; max-width: 640px; margin: 0 auto;">
        <h2>${data.businessName || "New lead"}</h2>
        <p><strong>Website:</strong> ${data.url || ""}</p>
        <p><strong>Email:</strong> ${data.email || ""}</p>
        <p><strong>Industry:</strong> ${data.industry || ""}</p>
        <p><strong>Main Product or Service:</strong> ${data.service || ""}</p>
        <p><strong>Score:</strong> ${data.score || 0}/100</p>
        <p>${data.summary || ""}</p>
        <ol>${prioritiesHtml}</ol>
      </div>
    `;

    const userHtml = `
      <div style="font-family: Roboto, Arial, sans-serif; padding: 24px; max-width: 640px; margin: 0 auto;">
        <h2>Your AI Visibility Score: ${data.score || 0}/100</h2>
        <p>${data.summary || ""}</p>
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

    async function sendOne(toAddress, subject, html) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "audit@semanticsearchmarketing.com",
          to: [toAddress],
          subject,
          html
        })
      });

      const result = await res.json();
      return { ok: res.ok, result };
    }

    const adminSend = await sendOne(
      "hello@semanticsearchmarketing.com",
      `New Audit Lead${data.businessName ? ` - ${data.businessName}` : ""}`,
      adminHtml
    );

    const userSend = await sendOne(
      data.email,
      `Your AI Visibility Audit${data.businessName ? ` - ${data.businessName}` : ""}`,
      userHtml
    );

    if (!adminSend.ok || !userSend.ok) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Email send failed", adminSend, userSend })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Email send failed" })
    };
  }
};
