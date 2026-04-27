const { stripeRequest } = require("./_paid-utils");
const {
  generatePaidReport,
  sendPaidReportEmails
} = require("./_paid-report");
const { generatePdfReport } = require("./generate-pdf");
const { uploadPdfToDrive } = require("./upload-to-drive");

async function runPaidReportPipeline({
  sessionId,
  intake,
  bypassMode = false,
  input = {},
  logger = console.log
}) {
  logger("RUNNER STARTED");
  const openAiKey = process.env.OPENAI_API_KEY;
  const pageSpeedKey = process.env.PAGESPEED_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const googleServiceAccountJson = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  const googleDriveFolderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
  const shouldUploadToDrive = Boolean(googleServiceAccountJson && googleDriveFolderId);

  if (!openAiKey) {
    logger("ENV ERROR: Missing OPENAI_API_KEY");
    throw createPipelineError("validate-openai", "Missing OPENAI_API_KEY.");
  }

  if (!resendKey) {
    logger("ENV ERROR: Missing RESEND_API_KEY");
    throw createPipelineError("validate-resend", "Missing RESEND_API_KEY.");
  }

  if (!stripeSecretKey && !bypassMode) {
    logger("ENV ERROR: Missing STRIPE_SECRET_KEY");
    throw createPipelineError("validate-stripe", "Missing STRIPE_SECRET_KEY.");
  }

  if (!sessionId && !bypassMode) {
    logger("ENV ERROR: Missing checkout session ID");
    throw createPipelineError("validate-session", "Missing checkout session ID.");
  }

  if (!process.env.AUDIT_EMAIL_FROM) {
    logger("ENV NOTICE: AUDIT_EMAIL_FROM missing, using default sender");
  }

  if (!process.env.AUDIT_NOTIFICATION_TO && !process.env.AUDIT_ALERT_EMAIL) {
    logger("ENV NOTICE: AUDIT_NOTIFICATION_TO/AUDIT_ALERT_EMAIL missing, using default notification recipient");
  }

  if (!shouldUploadToDrive) {
    logger("Google Drive upload skipped: missing credentials");
  }

  const effectiveIntake = {
    ...(intake || {}),
    website: String(intake?.website || input.website || input.url || "").trim()
  };

  logger(
    JSON.stringify({
      type: "paid-report-runner-input",
      sessionId: sessionId || "internal-bypass",
      bypassMode,
      website: effectiveIntake.website || "missing",
      email: String(effectiveIntake.email || input.email || "").trim() || "missing"
    })
  );

  const status = {
    success: false,
    reportGenerated: false,
    pdfGenerated: false,
    emailSent: false,
    emailError: "",
    driveUrl: "",
    downloadUrl: "",
    fileName: "",
    fileId: "",
    sessionId: sessionId || "internal-bypass"
  };

  try {
    const delayMs = clampDelay(
      input.delayMs ?? (bypassMode ? 0 : process.env.PAID_REPORT_DELAY_MS || 240000),
      bypassMode
    );

    if (delayMs > 0) {
      logger(`Waiting ${delayMs}ms before running paid report pipeline`);
      await wait(delayMs);
    }

    const session = bypassMode
      ? buildBypassSession({ input, sessionId, intake: effectiveIntake })
      : await fetchPaidSession({ stripeSecretKey, sessionId });

    status.sessionId = session.id;

    logger("Starting OpenAI report generation");
    const report = await generatePaidReport({
      openAiKey,
      pageSpeedKey,
      serperKey,
      session,
      intake: effectiveIntake
    });
    status.reportGenerated = true;
    logger("Report content generated");
    logger("OpenAI report generation complete");

    let pdf = null;
    try {
      logger("Starting PDF generation");
      pdf = await generatePdfReport({ report });
      status.pdfGenerated = true;
      status.fileName = pdf.fileName;
      logger("PDF generation complete");
    } catch (error) {
      status.pdfGenerated = false;
      logger(`PDF skipped or failed: ${error.message || "Unknown error"}`);
    }

    let driveUpload = {
      fileId: "",
      driveUrl: "",
      downloadUrl: ""
    };

    if (shouldUploadToDrive && pdf?.buffer) {
      try {
        logger("Starting Drive upload");
        driveUpload = await uploadPdfToDrive({
          buffer: pdf.buffer,
          fileName: pdf.fileName,
          mimeType: pdf.mimeType
        });
        status.driveUrl = driveUpload.driveUrl || "";
        status.downloadUrl = driveUpload.downloadUrl || "";
        status.fileId = driveUpload.fileId || "";
        logger("Drive upload complete");
      } catch (error) {
        status.driveUrl = "";
        status.downloadUrl = "";
        status.fileId = "";
        logger(`Drive skipped or upload failed: ${error.message || "Unknown error"}`);
      }
    } else if (!shouldUploadToDrive) {
      status.driveUrl = "";
      status.downloadUrl = "";
      status.fileId = "";
      logger("Drive skipped: missing credentials");
    } else {
      status.driveUrl = "";
      status.downloadUrl = "";
      status.fileId = "";
      logger("Drive skipped: PDF unavailable");
    }

    report.assets = {
      fileName: pdf?.fileName || "",
      filePath: pdf?.filePath || "",
      fileId: driveUpload.fileId,
      driveUrl: driveUpload.driveUrl,
      downloadUrl: driveUpload.downloadUrl,
      pdfBase64: pdf?.buffer ? pdf.buffer.toString("base64") : "",
      pdfGenerated: Boolean(pdf?.buffer),
      driveUploaded: Boolean(driveUpload.driveUrl || driveUpload.downloadUrl)
    };

    logger("Starting report email send");
    try {
      await sendPaidReportEmails({
        resendKey,
        report,
        session
      });
      status.emailSent = true;
      logger("Report email send complete");
    } catch (error) {
      status.emailSent = false;
      status.emailError = error.message || "Unknown email delivery error";
      logger(`Email failed with exact provider response: ${status.emailError}`);
      throw error;
    }

    logger(
      JSON.stringify({
        type: "paid-report-delivered",
        sessionId: session.id,
        url: report.url,
        businessName: report.businessName,
        customerEmail: session.customer_details?.email || session.customer_email || "",
        delayMs,
        pdfGenerated: status.pdfGenerated,
        driveUrl: report.assets.driveUrl,
        downloadUrl: report.assets.downloadUrl,
        emailSent: status.emailSent,
        emailError: status.emailError
      })
    );
    logger("PIPELINE COMPLETE");

    return {
      ...status,
      success: true,
      delivered: true
    };
  } catch (error) {
    logger(`RUNNER FAILED: ${error.message || "Unknown error"}`);
    error.pipelineStatus = status;
    throw error;
  }
}

async function fetchPaidSession({ stripeSecretKey, sessionId }) {
  const sessionResponse = await stripeRequest({
    secretKey: stripeSecretKey,
    path: `checkout/sessions/${encodeURIComponent(sessionId)}`
  });

  if (!sessionResponse.ok) {
    throw createPipelineError(
      "fetch-session",
      sessionResponse.json?.error?.message || "Unable to retrieve Stripe checkout session."
    );
  }

  const session = sessionResponse.json;
  if (session.payment_status !== "paid") {
    throw createPipelineError("validate-paid", "Checkout session is not marked as paid.");
  }

  return session;
}

function buildBypassSession({ input, sessionId, intake }) {
  const website = String(intake.website || input.website || input.url || "").trim();
  const businessName = String(intake.businessName || input.businessName || "").trim()
    || getBusinessNameFromWebsite(website);
  const email = String(intake.email || input.email || "").trim();

  return {
    id: sessionId || "internal-bypass",
    payment_status: "paid",
    customer_details: {
      email
    },
    customer_email: email,
    metadata: {
      url: website,
      businessName,
      quickAuditScore: "",
      aiVerdict: "Internal bypass mode",
      summary: "Internal intake test submitted without Stripe session."
    }
  };
}

function getBusinessNameFromWebsite(website) {
  try {
    const hostname = new URL(website).hostname.replace(/^www\./i, "");
    return hostname
      .split(".")[0]
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}

function clampDelay(value, bypassMode = false) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return bypassMode ? 0 : 240000;
  if (bypassMode) return Math.max(0, Math.round(numeric));
  return Math.max(60000, Math.min(600000, Math.round(numeric)));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPipelineError(step, message) {
  const error = new Error(message);
  error.pipelineStep = step;
  return error;
}

module.exports = {
  runPaidReportPipeline
};
