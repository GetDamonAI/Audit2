const { createImplementationPlanSeed } = require("./_implementation-plan");
const {
  escapeHtml,
  getAuditBookingUrl,
  getAuditNotificationTo,
  respond,
  sendResendEmail,
  verifyStripeSignature,
  withRealSessionId
} = require("./_paid-utils");

exports.handler = async (event) => {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const successUrl = process.env.STRIPE_SUCCESS_URL;

    if (!webhookSecret) {
      return respond(500, { error: "Missing STRIPE_WEBHOOK_SECRET." });
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : String(event.body || "");

    verifyStripeSignature({
      rawBody,
      signatureHeader: event.headers["stripe-signature"] || event.headers["Stripe-Signature"],
      webhookSecret
    });

    const payload = JSON.parse(rawBody || "{}");

    if (payload.type === "checkout.session.completed") {
      const session = payload.data?.object || {};
      const bookingUrl = getAuditBookingUrl();
      const implementationPlanSeed = createImplementationPlanSeed({
        metadata: session.metadata || {},
        intake: {}
      });

      console.log(
        JSON.stringify({
          type: "paid-audit-checkout-completed",
          sessionId: session.id,
          customerEmail: session.customer_details?.email || session.customer_email || "",
          metadata: session.metadata || {},
          implementationPlanSeed
        })
      );

      if (resendKey) {
        const customerEmail = session.customer_details?.email || session.customer_email || "";
        const finishIntakeUrl = successUrl ? withRealSessionId(successUrl, session.id) : "";

        const sends = [];

        if (customerEmail) {
          sends.push(
            sendResendEmail({
              resendKey,
              to: customerEmail,
              subject: "Your AI Visibility Audit + Implementation Plan is underway",
              html: renderCustomerPaidEmail({
                session,
                bookingUrl,
                finishIntakeUrl
              })
            })
          );
        }

        sends.push(
          sendResendEmail({
            resendKey,
            to: getAuditNotificationTo(),
            subject: `Paid AI Audit Purchased - ${session.metadata?.businessName || session.metadata?.url || session.id}`,
            html: renderInternalPaidEmail({
              session,
              bookingUrl,
              implementationPlanSeed
            })
          })
        );

        const sendResults = await Promise.all(sends);
        if (sendResults.some((result) => !result.ok)) {
          throw new Error("Paid checkout emails failed to send.");
        }
      }

      // Hook point: trigger full report generation / implementation plan generation here.
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };
  } catch (error) {
    return respond(400, { error: error.message || "Stripe webhook handling failed." });
  }
};

function renderCustomerPaidEmail({ session, bookingUrl, finishIntakeUrl }) {
  const businessName = escapeHtml(session.metadata?.businessName || "your site");

  return `
    <div style="font-family: Arial, sans-serif; background:#f7f5f2; padding:24px 16px;">
      <div style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid rgba(23,23,23,0.08); border-radius:24px; padding:32px 28px;">
        <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">AI Visibility Audit</p>
        <h2 style="margin:0 0 12px; font-size:34px; line-height:1.05; color:#1a1a1a;">You’re in. We’ve got the payment.</h2>
        <p style="margin:0 0 16px; font-size:16px; line-height:1.55; color:#555555;">
          We’re now preparing the deeper AI Visibility Audit + Implementation Plan for ${businessName}. The next best move is to add a little more context so the report can be tailored to your site, priorities, and market.
        </p>
        ${finishIntakeUrl ? `
          <p style="margin:0 0 12px;">
            <a href="${escapeHtml(finishIntakeUrl)}"
               style="display:inline-block; padding:14px 22px; background:#232323; color:#ffffff; text-decoration:none; border-radius:999px;">
              Finish My Intake
            </a>
          </p>
        ` : ""}
        <p style="margin:0 0 12px;">
          <a href="${escapeHtml(bookingUrl)}"
             style="display:inline-block; padding:14px 22px; background:#f1efeb; color:#171717; text-decoration:none; border-radius:999px; border:1px solid #dddddd;">
            Book My Coaching Session
          </a>
        </p>
        <p style="margin:18px 0 0; font-size:16px; line-height:1.5; color:#555555;">
          Damon will use your audit signals, your intake, and your goals to build a more useful implementation plan than a generic list of fixes ever could.
        </p>
      </div>
    </div>
  `;
}

function renderInternalPaidEmail({ session, bookingUrl, implementationPlanSeed }) {
  const recommendationList = implementationPlanSeed.recommendations
    .map((recommendation) => `<li>${escapeHtml(recommendation.title)} (${escapeHtml(recommendation.priority)})</li>`)
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; padding:24px; max-width:720px; margin:0 auto;">
      <h2 style="margin:0 0 12px;">Paid AI Audit Purchased</h2>
      <p><strong>Website:</strong> ${escapeHtml(session.metadata?.url || "Unknown")}</p>
      <p><strong>Business:</strong> ${escapeHtml(session.metadata?.businessName || "Unknown")}</p>
      <p><strong>Email:</strong> ${escapeHtml(session.customer_details?.email || session.customer_email || "Unknown")}</p>
      <p><strong>Stripe Session:</strong> ${escapeHtml(session.id || "Unknown")}</p>
      <p><strong>Quick Audit Score:</strong> ${escapeHtml(session.metadata?.quickAuditScore || "Unknown")}</p>
      <p><strong>Industry:</strong> ${escapeHtml(session.metadata?.industry || "Not provided")}</p>
      <p><strong>Service:</strong> ${escapeHtml(session.metadata?.service || "Not provided")}</p>
      <p><strong>Booking URL:</strong> <a href="${escapeHtml(bookingUrl)}">${escapeHtml(bookingUrl)}</a></p>
      <div style="margin-top:18px;">
        <p><strong>Implementation plan scaffold</strong></p>
        <ol>${recommendationList}</ol>
      </div>
    </div>
  `;
}
