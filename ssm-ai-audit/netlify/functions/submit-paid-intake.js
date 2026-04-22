const { createImplementationPlanSeed } = require("./_implementation-plan");
const {
  escapeHtml,
  getAuditBookingUrl,
  getAuditNotificationTo,
  respond,
  sendResendEmail,
  stripeRequest
} = require("./_paid-utils");

exports.handler = async (event) => {
  try {
    const input = JSON.parse(event.body || "{}");
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const sessionId = String(input.sessionId || "").trim();

    if (!secretKey) {
      return respond(500, { error: "Missing STRIPE_SECRET_KEY." });
    }

    if (!sessionId) {
      return respond(400, { error: "Missing checkout session ID." });
    }

    const sessionResponse = await stripeRequest({
      secretKey,
      path: `checkout/sessions/${encodeURIComponent(sessionId)}`
    });

    if (!sessionResponse.ok) {
      return respond(404, {
        error: sessionResponse.json?.error?.message || "Unable to find Stripe checkout session."
      });
    }

    const session = sessionResponse.json;
    if (session.payment_status !== "paid") {
      return respond(400, { error: "Checkout session is not marked as paid." });
    }

    const intake = {
      businessGoal: String(input.businessGoal || "").trim(),
      idealCustomer: String(input.idealCustomer || "").trim(),
      topServices: String(input.topServices || "").trim(),
      priorityPages: String(input.priorityPages || "").trim(),
      targetLocations: String(input.targetLocations || "").trim(),
      topCompetitors: String(input.topCompetitors || "").trim(),
      hasBlog: String(input.hasBlog || "").trim(),
      cmsPlatform: String(input.cmsPlatform || "").trim(),
      canEditCode: String(input.canEditCode || "").trim(),
      marketingSupport: String(input.marketingSupport || "").trim(),
      aiQuestionTargeting: String(input.aiQuestionTargeting || "").trim(),
      currentMarketingFocus: String(input.currentMarketingFocus || "").trim(),
      biggestChallenge: String(input.biggestChallenge || "").trim(),
      customerIntent: String(input.customerIntent || "").trim(),
      desiredVisibility: String(input.desiredVisibility || "").trim(),
      differentiation: String(input.differentiation || "").trim(),
      conversionGoal: String(input.conversionGoal || "").trim(),
      contentMaturity: String(input.contentMaturity || "").trim()
    };

    const implementationPlanSeed = createImplementationPlanSeed({
      metadata: session.metadata || {},
      intake
    });

    const reportQueueResult = await queuePaidReportGeneration({
      event,
      session,
      intake
    });

    if (!reportQueueResult.ok) {
      throw new Error(reportQueueResult.error || "Paid report queue failed.");
    }

    if (resendKey) {
      const customerEmail = session.customer_details?.email || session.customer_email || "";
      const bookingUrl = getAuditBookingUrl();
      const internalHtml = renderInternalPaidIntakeEmail({
        session,
        intake,
        implementationPlanSeed,
        bookingUrl,
        reportQueueResult
      });

      const sends = [
        sendResendEmail({
          resendKey,
          to: getAuditNotificationTo(),
          subject: `Paid AI Audit Intake Submitted - ${session.metadata?.businessName || session.metadata?.url || session.id}`,
          html: internalHtml
        })
      ];

      if (customerEmail) {
        sends.push(
          sendResendEmail({
            resendKey,
            to: customerEmail,
            subject: "Your AI Visibility Audit + Implementation Plan is in production",
            html: renderCustomerIntakeReceiptEmail({
              session,
              bookingUrl
            })
          })
        );
      }

      const sendResults = await Promise.all(sends);
      if (sendResults.some((result) => !result.ok)) {
        throw new Error("Paid intake emails failed to send.");
      }
    }

    return respond(200, {
      success: true,
      bookingUrl: getAuditBookingUrl(),
      implementationPlanSeed,
      reportQueued: true
    });
  } catch (error) {
    return respond(500, { error: error.message || "Paid intake submission failed." });
  }
};

async function queuePaidReportGeneration({ event, session, intake }) {
  const baseUrl = getBaseUrl(event);

  if (!baseUrl) {
    return {
      ok: false,
      error: "Unable to determine site URL for paid report generation."
    };
  }

  const response = await fetch(`${baseUrl}/.netlify/functions/generate-paid-report-background`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionId: session.id,
      intake
    })
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      error: data.error || "Unable to queue paid report generation."
    };
  }

  return {
    ok: true,
    data
  };
}

function getBaseUrl(event) {
  const explicitUrl = String(process.env.URL || "").trim();
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");

  const protocol = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["x-forwarded-host"] || event.headers.host || "";
  return host ? `${protocol}://${host}` : "";
}

function renderInternalPaidIntakeEmail({ session, intake, implementationPlanSeed, bookingUrl, reportQueueResult }) {
  const recommendations = implementationPlanSeed.recommendations
    .map((recommendation) => `<li><strong>${escapeHtml(recommendation.title)}</strong> (${escapeHtml(recommendation.priority)})</li>`)
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto;">
      <h2 style="margin:0 0 12px;">Paid Intake Submitted</h2>
      <p><strong>Website:</strong> ${escapeHtml(session.metadata?.url || "Unknown")}</p>
      <p><strong>Business:</strong> ${escapeHtml(session.metadata?.businessName || "Unknown")}</p>
      <p><strong>Customer Email:</strong> ${escapeHtml(session.customer_details?.email || session.customer_email || "Unknown")}</p>
      <p><strong>Stripe Session:</strong> ${escapeHtml(session.id || "Unknown")}</p>
      <p><strong>Quick Audit Score:</strong> ${escapeHtml(session.metadata?.quickAuditScore || "Unknown")}</p>
      <p><strong>Report queued:</strong> ${escapeHtml(reportQueueResult?.ok ? "Yes" : "No")}</p>

      <div style="margin-top:18px;">
        <p><strong>What are you trying to sell or inform people about?</strong></p>
        <p>${escapeHtml(intake.businessGoal || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Ideal customer</strong></p>
        <p>${escapeHtml(intake.idealCustomer || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Top services or products</strong></p>
        <p>${escapeHtml(intake.topServices || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Key pages or services to drive traffic to</strong></p>
        <p>${escapeHtml(intake.priorityPages || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Target locations</strong></p>
        <p>${escapeHtml(intake.targetLocations || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Main competitors</strong></p>
        <p>${escapeHtml(intake.topCompetitors || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Blog/resources section</strong></p>
        <p>${escapeHtml(intake.hasBlog || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>CMS/platform</strong></p>
        <p>${escapeHtml(intake.cmsPlatform || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Can edit code/schema</strong></p>
        <p>${escapeHtml(intake.canEditCode || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Internal marketing support</strong></p>
        <p>${escapeHtml(intake.marketingSupport || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Questions they'd like to show up for in AI</strong></p>
        <p>${escapeHtml(intake.aiQuestionTargeting || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Current marketing focus</strong></p>
        <p>${escapeHtml(intake.currentMarketingFocus || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Biggest challenge right now</strong></p>
        <p>${escapeHtml(intake.biggestChallenge || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Customer intent before choosing</strong></p>
        <p>${escapeHtml(intake.customerIntent || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Desired AI visibility</strong></p>
        <p>${escapeHtml(intake.desiredVisibility || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Differentiation</strong></p>
        <p>${escapeHtml(intake.differentiation || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Conversion goal</strong></p>
        <p>${escapeHtml(intake.conversionGoal || "Not provided")}</p>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Content maturity</strong></p>
        <p>${escapeHtml(intake.contentMaturity || "Not provided")}</p>
      </div>

      <div style="margin-top:18px;">
        <p><strong>Implementation plan seed</strong></p>
        <ol>${recommendations}</ol>
      </div>

      <div style="margin-top:22px;">
        <p><strong>Booking link</strong></p>
        <p><a href="${escapeHtml(bookingUrl)}">${escapeHtml(bookingUrl)}</a></p>
      </div>
    </div>
  `;
}

function renderCustomerIntakeReceiptEmail({ session, bookingUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f7f5f2; padding:24px 16px;">
      <div style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid rgba(23,23,23,0.08); border-radius:24px; padding:32px 28px;">
        <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">AI Visibility Audit</p>
        <h2 style="margin:0 0 12px; font-size:34px; line-height:1.05; color:#1a1a1a;">Your AI Visibility Audit + Implementation Plan is in production</h2>
        <p style="margin:0 0 16px; font-size:16px; line-height:1.55; color:#555555;">
          We’ve got your extra details, and we’re building your full AI Visibility Audit + Implementation Plan now.
        </p>
        <p style="margin:0 0 16px; font-size:16px; line-height:1.55; color:#555555;">
          Damon will use your intake details to shape the diagnosis, the priority actions, the tactical recommendations, and the 60-day rollout plan around your site, priorities, and the recommendations most likely to move the needle.
        </p>
        <p style="margin:0 0 16px; font-size:16px; line-height:1.55; color:#555555;">
          This takes longer than the quick audit because it’s designed to be more comprehensive, practical, and tailored to your site.
        </p>
        <p style="margin:0 0 20px; font-size:16px; line-height:1.55; color:#555555;">
          When you’re ready, book your real live human coaching session so you can walk through the report together and decide what to tackle first.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${escapeHtml(bookingUrl)}"
             style="display:inline-block; padding:14px 22px; background:#232323; color:#ffffff; text-decoration:none; border-radius:999px; font-weight:600; line-height:1; border:1px solid #232323;">
            Book My Coaching Session
          </a>
        </p>
        <p style="margin:0; font-size:16px; line-height:1.5; color:#555555;">
          We’ll be in touch soon with your full report for:<br />
          ${escapeHtml(session.metadata?.url || "your site")}
        </p>
      </div>
    </div>
  `;
}
