exports.handler = async (event) => {
  const data = JSON.parse(event.body);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Audit <onboarding@resend.dev>",
      to: ["hello@semanticsearchmarketing.com", data.email],
      subject: "Your AI Visibility Audit",
      html: `
        <h2>Your AI Visibility Score: ${data.score}/100</h2>
        <p>${data.summary}</p>
        <p><strong>Top Priorities:</strong></p>
        <ul>${data.priorities.map(p => `<li>${p}</li>`).join("")}</ul>
      `
    })
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};
