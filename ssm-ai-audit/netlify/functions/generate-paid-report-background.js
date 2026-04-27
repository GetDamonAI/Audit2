console.log("MODULE LOADED: generate-paid-report-background");

const { stripeRequest, respond } = require("./_paid-utils");

exports.handler = async (event) => {
  console.log("HANDLER STARTED: generate-paid-report-background");

  try {
    const {
      sendPaidReportFailureEmail
    } = require("./_paid-report");
    const { runPaidReportPipeline } = require("./_paid-report-runner");
    const openAiKey = process.env.OPENAI_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const input = JSON.parse(event.body || "{}");
    const bypassMode = input.bypass === true || String(input.internal || "").trim() === "1";
    const intake = {
      ...(input.intake || {}),
      website: String(input.intake?.website || input.website || input.url || "").trim(),
      email: String(input.intake?.email || input.email || "").trim()
    };

    console.log(
      JSON.stringify({
        type: "generate-paid-report-background-payload",
        sessionId: String(input.sessionId || "").trim() || "missing",
        bypassMode,
        hasIntake: Boolean(input.intake),
        hasImplementationPlanSeed: Boolean(input.implementationPlanSeed),
        website: intake.website || "missing",
        email: intake.email || "missing"
      })
    );

    if (!openAiKey) {
      throw new Error("Missing OPENAI_API_KEY.");
    }

    if (!resendKey) {
      throw new Error("Missing RESEND_API_KEY.");
    }

    if (!stripeSecretKey && !bypassMode) {
      throw new Error("Missing STRIPE_SECRET_KEY.");
    }

    if (!process.env.AUDIT_EMAIL_FROM) {
      console.log("ENV NOTICE: AUDIT_EMAIL_FROM missing, using default sender");
    }

    if (!process.env.AUDIT_NOTIFICATION_TO && !process.env.AUDIT_ALERT_EMAIL) {
      console.log("ENV NOTICE: AUDIT_NOTIFICATION_TO/AUDIT_ALERT_EMAIL missing, using default notification recipient");
    }

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
      console.log("Google Drive upload skipped: missing credentials");
    }

    if (bypassMode) {
      console.log("Bypass mode detected in paid report background");
      console.log("Triggering paid report generation without Stripe verification");
    }

    console.log("CALLING runPaidReportPipeline");

    const result = await runPaidReportPipeline({
      sessionId: String(input.sessionId || "").trim(),
      intake,
      bypassMode,
      input,
      logger: (message) => console.log(String(message || "RUNNER LOG: empty message"))
    });

    console.log("runPaidReportPipeline COMPLETE");

    return respond(200, {
      ...result
    });
  } catch (error) {
    console.error("generate-paid-report-background FAILED");
    console.error(error?.stack || error);
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
      console.error("generate-paid-report-background secondary failure");
      console.error(secondaryError?.stack || secondaryError);
    }

    if (error.pipelineStep) {
      console.error(`Paid report pipeline failed at ${error.pipelineStep}`);
    }
    return respond(500, { error: error.message || "Paid report generation failed." });
  }
};
