const crypto = require("crypto");

function getAuditEmailFrom() {
  return process.env.AUDIT_EMAIL_FROM || "audit@semanticsearchmarketing.com";
}

function getAuditNotificationTo() {
  return process.env.AUDIT_NOTIFICATION_TO || process.env.AUDIT_ALERT_EMAIL || "hello@semanticsearchmarketing.com";
}

function getAuditBookingUrl() {
  return process.env.AUDIT_BOOKING_URL || "https://calendar.app.google/XtiHBsQCKT1hSoJe6";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

async function sendResendEmail({ resendKey, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: getAuditEmailFrom(),
      to: Array.isArray(to) ? to : [to],
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

  return {
    ok: res.ok,
    result
  };
}

async function stripeRequest({ secretKey, path, method = "GET", body }) {
  const headers = {
    Authorization: `Bearer ${secretKey}`
  };

  const options = {
    method,
    headers
  };

  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = body instanceof URLSearchParams ? body.toString() : String(body);
  }

  const res = await fetch(`https://api.stripe.com/v1/${path}`, options);
  const text = await res.text();
  let json = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    json
  };
}

function withSessionPlaceholder(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  return parsed.toString();
}

function withRealSessionId(url, sessionId) {
  if (!url) return "";
  const parsed = new URL(url);
  parsed.searchParams.set("session_id", sessionId);
  return parsed.toString();
}

function verifyStripeSignature({ rawBody, signatureHeader, webhookSecret }) {
  const entries = String(signatureHeader || "")
    .split(",")
    .map((part) => part.trim())
    .reduce((acc, part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});

  const timestamp = entries.t;
  const signature = entries.v1;

  if (!timestamp || !signature) {
    throw new Error("Missing Stripe signature values.");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Error("Invalid Stripe signature.");
  }

  return true;
}

module.exports = {
  escapeHtml,
  getAuditBookingUrl,
  getAuditEmailFrom,
  getAuditNotificationTo,
  respond,
  sendResendEmail,
  stripeRequest,
  verifyStripeSignature,
  withRealSessionId,
  withSessionPlaceholder
};
