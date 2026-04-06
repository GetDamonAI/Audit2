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

    const breakdownHtml = (data.breakdown || [])
      .map((item) => `<li>${item.label}: ${item.value}/100</li>`)
      .join("");

    const prioritiesHtml = (data.priorities || [])
      .map((item) => `<li>${item}</li>`)
      .join("");

    const adminHtml = `
      <div style="font-family: Roboto, Arial, sans-serif; padding: 24px; max-width: 640px; margin: 0 auto;">
        <p style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777; margin:0 0 8px;">
          New AI Visibility Audit Lead
        </p>

        <h2 style="font-size:28px; margin:0 0 16px;">
          ${data.businessName || "New lead"}
        </h2>

        <p><strong>Website:</strong> ${data.url || ""}</p>
        <p><strong>Email:</strong> ${data.email || ""}</p>
        <p><strong>Industry:</strong> ${data.industry || ""}</p>
        <p><strong>Main Product or Service:</strong> ${data.service || ""}</p>

        <h3 style="font-size:16px; margin:20px 0 8px;">Audit Score</h3>
        <p><strong>${data.score}/100</strong></p>

        <h3 style="font-size:16px; margin:20px 0 8px;">Summary</h3>
        <p style="font-size:16px; line-height:1.6; color:#444;">
          ${data.summary || ""}
        </p>

        <h3 style="font-size:16px; margin:20px 0 8px;">Signal Breakdown</h3>
        <ul style="padding-left:18px; margin:0 0 20px;">
          ${breakdownHtml}
        </ul>

        <h3 style="font-size:16px; margin:20px 0 8px;">Top Priorities</h3>
        <ol style="padding-left:18px; margin:0 0 24px;">
          ${prioritiesHtml}
        </ol>
      </div>
    `;

    const userHtml = `
      <div style="font-family: Roboto, Arial, sans-serif; padding: 24px; max-width: 640px; margin: 0 auto;">
        <p style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777; margin:0 0 8px;">
          AI Visibility Audit
        </p>

        <h2 style="font-size:28px; margin:0 0 12px;">
          Your AI Visibility Score: ${data.score}/100
        </h2>

        <p style="font-size:16px; line-height:1.6; color:#444; margin:0 0 20px;">
          ${data.summary || ""}
        </p>

        <h3 style="font-size:16px; margin:0 0 8px;">Top Priorities</h3>
        <ol style="padding-left:18px; margin:0 0 24px;">
          ${prioritiesHtml}
        </ol>

        <p style="font-size:16px; line-height:1.6; color:#444; margin:0 0 24px;">
          This is a quick snapshot. I’ll review your site and follow up with a more tailored perspective on where AI visibility is being won or lost.
        </p>

        <a href="https://calendar.app.google/XtiHBsQCKT1hSoJe6"
           style="display:inline-block; padding:14px 22px; background:#232323; color:#fff; text-decoration:none; border-radius:999px;">
          Book a 10 Minute Review
        </a>
      </div>
    `;

    async function sendOne(toAddress, subject, html) {
      const response = await fetch("https://api.resend.com/emails", {
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

      const result = await response.json();
      return { ok: response.ok, to: toAddress, result };
    }

    const adminSend = await sendOne(
      "hello@semanticsearchmarketing.com",
      `New Audit Lead${data.businessName ? ` - ${data.businessName}` : ""}`,
      adminHtml
    );

    const userSend = data.email
      ? await sendOne(
          data.email,
          `Your AI Visibility Audit${data.businessName ? ` - ${data.businessName}` : ""}`,
          userHtml
        )
      : { ok: true, to: null, result: null };

    if (!adminSend.ok || !userSend.ok) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Email send failed",
          adminSend,
          userSend
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        adminSend,
        userSend
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Email send failed" })
    };
  }
};
