/**
 * Internal-only full report generation endpoint.
 *
 * Example:
 * curl -X POST https://auditform2.netlify.app/.netlify/functions/generate-report-internal \
 *   -H "Content-Type: application/json" \
 *   -d '{"website":"https://example.com","email":"getdamonai@gmail.com","businessName":"Example Business"}'
 */

const { respond } = require("./_paid-utils");
const { runPaidReportPipeline } = require("./_paid-report-runner");

exports.handler = async (event) => {
  try {
    if (String(event.httpMethod || "POST").toUpperCase() !== "POST") {
      return failureResponse("Full report generation failed", "Method not allowed.");
    }

    const input = JSON.parse(event.body || "{}");
    const intake = buildInternalIntake(input);

    if (!intake.website) {
      return failureResponse("Full report generation failed", "Missing website.");
    }

    if (!intake.email) {
      return failureResponse("Full report generation failed", "Missing email.");
    }

    console.log("INTERNAL FULL REPORT TRIGGERED");
    console.log(
      JSON.stringify({
        type: "internal-full-report-payload",
        website: intake.website,
        email: intake.email,
        businessName: intake.businessName || "",
        hasTopServices: Boolean(intake.topServices),
        hasCompetitors: Boolean(intake.topCompetitors)
      })
    );
    console.log("Running paid report pipeline");

    const result = await runPaidReportPipeline({
      sessionId: `internal-${Date.now()}`,
      intake,
      bypassMode: true,
      input: {
        ...input,
        bypass: true,
        internal: 1,
        website: intake.website,
        email: intake.email,
        businessName: intake.businessName || "",
        delayMs: 0
      },
      logger: (message) => console.log(String(message || "INTERNAL RUNNER LOG: empty message"))
    });

    if (result.reportGenerated) {
      console.log("Full report generated");
    }

    if (result.pdfGenerated) {
      console.log("PDF generated");
    }

    if (result.driveUrl || result.downloadUrl) {
      console.log("Drive upload completed");
    }

    if (result.emailSent) {
      console.log("Email sent");
    }

    return successResponse("Full report generated", {
      reportGenerated: Boolean(result.reportGenerated),
      pdfGenerated: Boolean(result.pdfGenerated),
      emailSent: Boolean(result.emailSent),
      driveUrl: String(result.driveUrl || "").trim(),
      downloadUrl: String(result.downloadUrl || "").trim(),
      reportFileName: String(result.fileName || "").trim()
    });
  } catch (error) {
    const pipelineStatus = error.pipelineStatus || {};
    console.error("Internal report generation failed");
    console.error(error?.stack || error);

    return failureResponse(
      "Full report generation failed",
      error.message || String(error),
      {
        reportGenerated: Boolean(pipelineStatus.reportGenerated),
        pdfGenerated: Boolean(pipelineStatus.pdfGenerated),
        emailSent: Boolean(pipelineStatus.emailSent),
        driveUrl: String(pipelineStatus.driveUrl || "").trim(),
        downloadUrl: String(pipelineStatus.downloadUrl || "").trim(),
        reportFileName: String(pipelineStatus.fileName || "").trim()
      }
    );
  }
};

function buildInternalIntake(input) {
  const normalizedQuestions = String(
    input.questionsToShowUpFor || input.aiQuestionTargeting || ""
  ).trim();
  const normalizedCompetitors = String(
    input.competitors || input.topCompetitors || ""
  ).trim();

  return {
    website: String(input.website || input.url || "").trim(),
    email: String(input.email || "").trim(),
    businessName: String(input.businessName || "").trim(),
    businessGoal: String(input.businessGoal || "").trim(),
    idealCustomer: String(input.idealCustomer || "").trim(),
    aiQuestionTargeting: normalizedQuestions,
    priorityPages: String(input.priorityPages || "").trim(),
    cmsPlatform: String(input.cmsPlatform || "").trim(),
    canEditCode: String(input.canEditCode || "").trim(),
    topCompetitors: normalizedCompetitors,
    currentMarketingFocus: String(input.currentMarketingFocus || "").trim(),
    biggestChallenge: String(input.biggestChallenge || "").trim(),
    customerIntent: String(input.customerIntent || "").trim(),
    desiredVisibility: String(input.desiredVisibility || "").trim(),
    differentiation: String(input.differentiation || "").trim(),
    conversionGoal: String(input.conversionGoal || "").trim(),
    contentMaturity: String(input.contentMaturity || "").trim(),
    targetLocations: String(input.targetLocations || "").trim(),
    topServices: String(input.topServices || "").trim(),
    marketingSupport: String(input.marketingSupport || "").trim(),
    hasBlog: String(input.hasBlog || "").trim()
  };
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
      reportFileName: String(data.reportFileName || "").trim()
    }
  });
}

function failureResponse(message, error, data = {}) {
  return respond(200, {
    success: false,
    message,
    error: String(error || "Full report generation failed."),
    data: {
      reportGenerated: Boolean(data.reportGenerated),
      pdfGenerated: Boolean(data.pdfGenerated),
      emailSent: Boolean(data.emailSent),
      driveUrl: String(data.driveUrl || "").trim(),
      downloadUrl: String(data.downloadUrl || "").trim(),
      reportFileName: String(data.reportFileName || "").trim()
    }
  });
}
