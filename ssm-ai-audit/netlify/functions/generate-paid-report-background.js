console.log("Entered generate-paid-report-background");

const { stripeRequest, respond } = require("./_paid-utils");
const {
  sendPaidReportFailureEmail
} = require("./_paid-report");
const { runPaidReportPipeline } = require("./_paid-report-runner");

exports.handler = async (event) => {
  console.log("Entered generate-paid-report-background handler");

  try {
    const openAiKey = process.env.OPENAI_API_KEY;
    const pageSpeedKey = process.env.PAGESPEED_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const input = JSON.parse(event.body || "{}");
    const bypassMode = input.bypass === true || String(input.internal || "").trim() === "1";

    if (!openAiKey) {
      throw new Error("Missing OPENAI_API_KEY.");
    }

    if (!resendKey) {
      throw new Error("Missing RESEND_API_KEY.");
    }

    if (!stripeSecretKey && !bypassMode) {
      throw new Error("Missing STRIPE_SECRET_KEY.");
    }

    if (bypassMode) {
      console.log("Bypass mode detected in paid report background");
      console.log("Triggering paid report generation without Stripe verification");
    }

    const result = await runPaidReportPipeline({
      sessionId: String(input.sessionId || "").trim(),
      intake: {
        ...(input.intake || {}),
        website: String(input.intake?.website || input.website || input.url || "").trim()
      },
      bypassMode,
      input,
      logger: console.log
    });

    return respond(200, {
      ...result
    });
  } catch (error) {
    try {
      const resendKey = process.env.RESEND_API_KEY;
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      const input = JSON.parse(event.body || "{}");
      const sessionId = String(input.sessionId || "").trim();
      const bypassMode = input.bypass === true || String(input.internal || "").trim() === "1";

      if (!bypassMode && resendKey && stripeSecretKey && sessionId) {
        const sessionResponse = await stripeRequest({
          secretKey: stripeSecretKey,
          path: `checkout/sessions/${encodeURIComponent(sessionId)}`
        });

        if (sessionResponse.ok) {
          await sendPaidReportFailureEmail({
            resendKey,
            session: sessionResponse.json,
            errorMessage: error.message || "Unknown error"
          });
        }
      }
    } catch (secondaryError) {
      console.error(secondaryError);
    }

    if (error.pipelineStep) {
      console.error(`Paid report pipeline failed at ${error.pipelineStep}`);
    }
    console.error(error);
    return respond(500, { error: error.message || "Paid report generation failed." });
  }
};
