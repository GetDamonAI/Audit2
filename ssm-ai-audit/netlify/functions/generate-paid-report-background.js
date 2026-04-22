const { stripeRequest, respond } = require("./_paid-utils");
const {
  generatePaidReport,
  sendPaidReportEmails,
  sendPaidReportFailureEmail
} = require("./_paid-report");
const { generatePdfReport } = require("./generate-pdf");
const { uploadPdfToDrive } = require("./upload-to-drive");

exports.handler = async (event) => {
  try {
    const openAiKey = process.env.OPENAI_API_KEY;
    const pageSpeedKey = process.env.PAGESPEED_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!openAiKey) {
      throw new Error("Missing OPENAI_API_KEY.");
    }

    if (!resendKey) {
      throw new Error("Missing RESEND_API_KEY.");
    }

    if (!stripeSecretKey) {
      throw new Error("Missing STRIPE_SECRET_KEY.");
    }

    const input = JSON.parse(event.body || "{}");
    const sessionId = String(input.sessionId || "").trim();
    const intake = input.intake || {};

    if (!sessionId) {
      throw new Error("Missing checkout session ID.");
    }

    const delayMs = clampDelay(input.delayMs || process.env.PAID_REPORT_DELAY_MS || 240000);
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const sessionResponse = await stripeRequest({
      secretKey: stripeSecretKey,
      path: `checkout/sessions/${encodeURIComponent(sessionId)}`
    });

    if (!sessionResponse.ok) {
      throw new Error(sessionResponse.json?.error?.message || "Unable to retrieve Stripe checkout session.");
    }

    const session = sessionResponse.json;
    if (session.payment_status !== "paid") {
      throw new Error("Checkout session is not marked as paid.");
    }

    const report = await generatePaidReport({
      openAiKey,
      pageSpeedKey,
      serperKey,
      session,
      intake
    });

    const pdf = await generatePdfReport({ report });
    const driveUpload = await uploadPdfToDrive({
      buffer: pdf.buffer,
      fileName: pdf.fileName,
      mimeType: pdf.mimeType
    });

    report.assets = {
      fileName: pdf.fileName,
      filePath: pdf.filePath,
      fileId: driveUpload.fileId,
      driveUrl: driveUpload.driveUrl,
      downloadUrl: driveUpload.downloadUrl
    };

    await sendPaidReportEmails({
      resendKey,
      report,
      session
    });

    console.log(
      JSON.stringify({
        type: "paid-report-delivered",
        sessionId: session.id,
        url: report.url,
        businessName: report.businessName,
        customerEmail: session.customer_details?.email || session.customer_email || "",
        delayMs,
        driveUrl: report.assets.driveUrl,
        downloadUrl: report.assets.downloadUrl
      })
    );

    return respond(200, {
      success: true,
      delivered: true,
      sessionId: session.id,
      fileName: report.assets.fileName,
      driveUrl: report.assets.driveUrl,
      downloadUrl: report.assets.downloadUrl,
      fileId: report.assets.fileId
    });
  } catch (error) {
    try {
      const resendKey = process.env.RESEND_API_KEY;
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      const input = JSON.parse(event.body || "{}");
      const sessionId = String(input.sessionId || "").trim();

      if (resendKey && stripeSecretKey && sessionId) {
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

    console.error(error);
    return respond(500, { error: error.message || "Paid report generation failed." });
  }
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampDelay(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 240000;
  return Math.max(60000, Math.min(600000, Math.round(numeric)));
}
