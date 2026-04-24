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
    return await handleSubmitPaidIntake(event);
  } catch (error) {
    console.error("submit-paid-intake top-level error", error);
    return failureResponse("Intake submission failed", error.message || String(error), {
      reportGenerated: false,
      pdfGenerated: false,
      emailSent: false
    });
  }
};

async function handleSubmitPaidIntake(event) {
  try {
    const input = JSON.parse(event.body || "{}");
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const sessionId = String(input.sessionId || "").trim();
    const bypassMode = input.bypass === true || String(input.internal || "").trim() === "1";

    if (bypassMode) {
      console.log("Bypass mode detected in intake submission");
    }

    if (!secretKey && !bypassMode) {
      return failureResponse("Report generation failed", "Missing STRIPE_SECRET_KEY.");
    }

    if (!sessionId && !bypassMode) {
      return failureResponse("Report generation failed", "Missing checkout session ID.");
    }

    const session = bypassMode
      ? buildBypassSession(input, sessionId)
      : await fetchPaidSession({ secretKey, sessionId });

    const intake = {
      website: String(input.website || input.url || "").trim(),
      email: String(input.email || "").trim(),
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

    if (!intake.website) {
      return failureResponse("Report generation failed", "Missing website.");
    }

    const implementationPlanSeed = createImplementationPlanSeed({
      metadata: session.metadata || {},
      intake
    });

    let reportQueueResult = null;

    if (bypassMode) {
      console.log("Bypass intake accepted");
      reportQueueResult = await triggerBackgroundReportGeneration({
        event,
        sessionId: session.id,
        intake,
        bypassMode
      });

      if (!reportQueueResult.ok) {
        throw new Error(reportQueueResult.error || "Unable to start report generation.");
      }

      console.log("Background report generation trigger sent");
      console.log("Returning intake success immediately");

      return successResponse("Report generation started", {
        bookingUrl: getAuditBookingUrl(),
        implementationPlanSeed,
        reportQueued: true,
        reportQueueDebug: reportQueueResult.debug || null,
        bypassMode: true,
        reportReady: false
      });
    } else {
      reportQueueResult = await queuePaidReportGeneration({
        event,
        session,
        intake,
        bypassMode
      });

      if (!reportQueueResult.ok) {
        throw new Error(reportQueueResult.error || "Paid report queue failed.");
      }

      console.log("Paid report job queued successfully");
    }

    if (resendKey && !bypassMode) {
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

    return successResponse("Report generated successfully", {
      bookingUrl: getAuditBookingUrl(),
      implementationPlanSeed,
      reportQueued: !bypassMode,
      reportQueueDebug: reportQueueResult?.debug || null,
      bypassMode,
      reportReady: Boolean(
        reportQueueResult?.data?.driveUrl || reportQueueResult?.data?.downloadUrl
      ),
      reportGenerated: false,
      pdfGenerated: false,
      emailSent: false,
      driveUrl: String(reportQueueResult?.data?.driveUrl || "").trim(),
      downloadUrl: String(reportQueueResult?.data?.downloadUrl || "").trim(),
      reportFileName: String(reportQueueResult?.data?.fileName || "").trim()
    });
  } catch (error) {
    const pipelineStatus = error.pipelineStatus || {};
    console.error("submit-paid-intake top-level error", error);
    if (error.pipelineStep) {
      console.error(`Paid report pipeline failed at ${error.pipelineStep}`);
    }
    return failureResponse("Report generation failed", error.message || "Paid intake submission failed.", {
      reportGenerated: Boolean(pipelineStatus.reportGenerated),
      pdfGenerated: Boolean(pipelineStatus.pdfGenerated),
      emailSent: Boolean(pipelineStatus.emailSent),
      driveUrl: String(pipelineStatus.driveUrl || "").trim(),
      downloadUrl: String(pipelineStatus.downloadUrl || "").trim(),
      reportFileName: String(pipelineStatus.fileName || "").trim()
    });
  }
}

function successResponse(message, data = {}) {
  return respond(200, {
    success: true,
    message,
    data: {
      reportGenerated: Boolean(data.reportGenerated),
      pdfGenerated: Boolean(data.pdfGenerated),
      emailSent: Boolean(data.emailSent),
      driveUrl: String(data.driveUrl || "").trim(),
      downloadUrl: String(data.downloadUrl || "").trim(),
      reportFileName: String(data.reportFileName || "").trim(),
      bypassMode: Boolean(data.bypassMode),
      bookingUrl: String(data.bookingUrl || "").trim(),
      implementationPlanSeed: data.implementationPlanSeed || null,
      reportQueued: Boolean(data.reportQueued),
      reportReady: Boolean(data.reportReady),
      reportQueueDebug: data.reportQueueDebug || null
    }
  });
}

function failureResponse(message, error, data = {}) {
  return respond(200, {
    success: false,
    message,
    error: String(error || "Report generation failed."),
    data: {
      reportGenerated: Boolean(data.reportGenerated),
      pdfGenerated: Boolean(data.pdfGenerated),
      emailSent: Boolean(data.emailSent),
      driveUrl: String(data.driveUrl || "").trim(),
      downloadUrl: String(data.downloadUrl || "").trim(),
      reportFileName: String(data.reportFileName || "").trim(),
      bypassMode: Boolean(data.bypassMode)
    }
  });
}

async function fetchPaidSession({ secretKey, sessionId }) {
  const sessionResponse = await stripeRequest({
    secretKey,
    path: `checkout/sessions/${encodeURIComponent(sessionId)}`
  });

  if (!sessionResponse.ok) {
    const error = new Error(
      sessionResponse.json?.error?.message || "Unable to find Stripe checkout session."
    );
    error.statusCode = 404;
    throw error;
  }

  const session = sessionResponse.json;
  if (session.payment_status !== "paid") {
    const error = new Error("Checkout session is not marked as paid.");
    error.statusCode = 400;
    throw error;
  }

  return session;
}

function buildBypassSession(input, sessionId) {
  const website = String(input.website || input.url || "").trim();

  return {
    id: sessionId || "internal-bypass",
    payment_status: "paid",
    customer_details: {
      email: ""
    },
    customer_email: "",
    metadata: {
      url: website,
      businessName: "",
      quickAuditScore: "",
      aiVerdict: "Internal bypass mode",
      summary: "Internal intake test submitted without Stripe session."
    }
  };
}

async function triggerBackgroundReportGeneration({ event, sessionId, intake, bypassMode }) {
  const baseUrl = getBaseUrl(event);

  if (!baseUrl) {
    return {
      ok: false,
      error: "Unable to determine site URL for paid report generation."
    };
  }

  const targetUrl = `${baseUrl}/.netlify/functions/generate-paid-report-background`;
  const payload = {
    sessionId,
    intake,
    bypass: bypassMode,
    internal: bypassMode ? 1 : 0,
    email: intake.email || ""
  };

  console.log(
    JSON.stringify({
      type: "paid-report-background-trigger",
      url: targetUrl,
      method: "POST",
      sessionId,
      bypassMode,
      website: intake.website
    })
  );

  const triggerPromise = fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then(async (response) => {
      const responseText = await response.text();
      const contentType = response.headers.get("content-type") || "";

      console.log(
        JSON.stringify({
          type: "paid-report-background-trigger-response",
          url: targetUrl,
          status: response.status,
          ok: response.ok,
          contentType,
          bodySnippet: responseText.slice(0, 300)
        })
      );

      return {
        ok: response.ok,
        debug: {
          targetUrl,
          status: response.status,
          contentType,
          bodySnippet: responseText.slice(0, 300)
        }
      };
    })
    .catch((error) => {
      console.error("Background report trigger failed", error);
      return {
        ok: false,
        error: error.message || "Unable to trigger background report generation.",
        debug: {
          targetUrl
        }
      };
    });

  return Promise.race([
    triggerPromise,
    wait(1200).then(() => ({
      ok: true,
      debug: {
        targetUrl,
        timeoutSafe: true
      }
    }))
  ]);
}

async function queuePaidReportGeneration({ event, session, intake, bypassMode }) {
  const baseUrl = getBaseUrl(event);

  if (!baseUrl) {
    return {
      ok: false,
      error: "Unable to determine site URL for paid report generation."
    };
  }

  const targetUrl = `${baseUrl}/.netlify/functions/generate-paid-report-background`;
  const payload = {
    sessionId: session.id,
    intake,
    bypass: bypassMode
  };

  console.log(
    JSON.stringify({
      type: "paid-report-queue-request",
      url: targetUrl,
      method: "POST",
      sessionId: session.id,
      bypassMode,
      website: intake.website
    })
  );

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const responseBodySnippet = responseText.slice(0, 700);
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {};
  }

  console.log(
    JSON.stringify({
      type: "paid-report-queue-response",
      url: targetUrl,
      status: response.status,
      ok: response.ok,
      contentType,
      accepted:
        response.status === 202 ||
        data.success === true ||
        data.delivered === true,
      bodySnippet: responseBodySnippet
    })
  );

  const accepted =
    response.status === 202 ||
    data.success === true ||
    data.delivered === true;
  const htmlFallback = /text\/html/i.test(contentType) || /^<!doctype html/i.test(responseText.trim());

  if (!response.ok || !accepted || htmlFallback) {
    return {
      ok: false,
      error:
        data.error ||
        `Unable to queue paid report generation. Status ${response.status}. Body: ${responseBodySnippet || "Empty response."}`,
      debug: {
        targetUrl,
        status: response.status,
        contentType,
        bodySnippet: responseBodySnippet
      }
    };
  }

  return {
    ok: true,
    data,
    debug: {
      targetUrl,
      status: response.status,
      contentType,
      bodySnippet: responseBodySnippet
    }
  };
}

function getBaseUrl(event) {
  const explicitUrl = String(process.env.URL || "").trim();
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");

  const protocol = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["x-forwarded-host"] || event.headers.host || "";
  return host ? `${protocol}://${host}` : "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderInternalPaidIntakeEmail({ session, intake, implementationPlanSeed, bookingUrl, reportQueueResult }) {
  const recommendations = implementationPlanSeed.recommendations
    .map((recommendation) => `<li><strong>${escapeHtml(recommendation.title)}</strong> (${escapeHtml(recommendation.priority)})</li>`)
    .join("");
  const driveUrl = String(reportQueueResult?.data?.driveUrl || "").trim();
  const downloadUrl = String(reportQueueResult?.data?.downloadUrl || "").trim();

  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto;">
      <h2 style="margin:0 0 12px;">Paid Intake Submitted</h2>
      <p><strong>Website:</strong> ${escapeHtml(intake.website || session.metadata?.url || "Unknown")}</p>
      <p><strong>Business:</strong> ${escapeHtml(session.metadata?.businessName || "Unknown")}</p>
      <p><strong>Customer Email:</strong> ${escapeHtml(session.customer_details?.email || session.customer_email || "Unknown")}</p>
      <p><strong>Stripe Session:</strong> ${escapeHtml(session.id || "Unknown")}</p>
      <p><strong>Quick Audit Score:</strong> ${escapeHtml(session.metadata?.quickAuditScore || "Unknown")}</p>
      <p><strong>Report queued:</strong> ${escapeHtml(reportQueueResult?.ok ? "Yes" : "No")}</p>
      ${driveUrl ? `<p><strong>View Report:</strong> <a href="${escapeHtml(driveUrl)}">${escapeHtml(driveUrl)}</a></p>` : ""}
      ${downloadUrl ? `<p><strong>Download PDF:</strong> <a href="${escapeHtml(downloadUrl)}">${escapeHtml(downloadUrl)}</a></p>` : ""}

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
