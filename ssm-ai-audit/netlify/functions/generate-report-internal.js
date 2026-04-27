/**
 * Internal-only full report generation endpoint.
 *
 * Example:
 * curl -X POST https://auditform2.netlify.app/.netlify/functions/generate-report-internal \
 *   -H "Content-Type: application/json" \
 *   -d '{"website":"https://example.com","email":"getdamonai@gmail.com","businessName":"Example Business"}'
 */

const { respond } = require("./_paid-utils");

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

    console.log("INTERNAL REPORT REQUEST ACCEPTED");
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
    const triggerResult = await triggerBackgroundReportGeneration({
      event,
      sessionId: `internal-${Date.now()}`,
      intake,
      input: {
        ...input,
        bypass: true,
        internal: 1,
        website: intake.website,
        email: intake.email,
        businessName: intake.businessName || ""
      }
    });

    if (!triggerResult.ok) {
      throw new Error(triggerResult.error || "Unable to start internal report generation.");
    }

    console.log("BACKGROUND REPORT TRIGGER SENT");

    return successResponse("Report generation started", {
      reportQueued: true
    });
  } catch (error) {
    console.error("Internal report generation failed");
    console.error(error?.stack || error);

    return failureResponse(
      "Full report generation failed",
      error.message || String(error),
      {
        reportGenerated: false,
        pdfGenerated: false,
        emailSent: false
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

async function triggerBackgroundReportGeneration({ event, sessionId, intake, input }) {
  const baseUrl = getBaseUrl(event);

  if (!baseUrl) {
    return {
      ok: false,
      error: "Unable to determine site URL for internal report generation."
    };
  }

  const targetUrl = `${baseUrl}/.netlify/functions/generate-paid-report-background`;
  const payload = {
    ...input,
    sessionId,
    intake,
    bypass: true,
    internal: 1,
    website: intake.website || "",
    email: intake.email || ""
  };

  const triggerPromise = fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then(async (response) => {
      const responseText = await response.text();
      return {
        ok: response.ok,
        debug: {
          targetUrl,
          status: response.status,
          bodySnippet: responseText.slice(0, 300)
        }
      };
    })
    .catch((error) => ({
      ok: false,
      error: error.message || "Unable to trigger internal background report generation."
    }));

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

function getBaseUrl(event) {
  const explicitUrl = String(process.env.URL || "").trim();
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");

  const protocol = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.["x-forwarded-host"] || event.headers?.host || "";
  return host ? `${protocol}://${host}` : "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      reportQueued: Boolean(data.reportQueued)
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
