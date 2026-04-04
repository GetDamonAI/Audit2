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

    const html = `
      <div style="font-family: Roboto, Arial, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto;">
        <p style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777; margin:0 0 8px;">
          AI Visibility Audit
        </p>

        <h2 style="font-size:28px; margin:0 0 12px;">
          Your Score: ${data.score}/100
        </h2>

        <p style="font-size:16px; line-height:1.6; color:#444; margin:0 0 20px;">
          ${data.summary || ""}
        </p>

        <h3 style="font-size:16px; margin:0 0 8px;">Signal Breakdown</h3>
        <ul style="padding-left:18px; margin:0 0 20px;">
          ${breakdownHtml}
        </ul>

        <h3 style="font-size:16px; margin:0 0 8px;">Top Priorities</h3>
        <ol style="padding-left:18px; margin:0 0 24px;">
          ${prioritiesHtml}
        </ol>
      </div>
    `;

    const recipients = ["hello@semanticsearchmarketing.com"];
    if (data.email) recipients.push(data.email);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "audit@semanticsearchmarketing.com",
        to: recipients,
        subject: `AI Visibility Audit${data.businessName ? ` - ${data.businessName}` : ""}`,
        html: html
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: result.message || result.error || "Email send failed" })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, result })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Email send failed" })
    };
  }
};
