const intakeForm = document.getElementById("paid-intake-form");
const sessionIdInput = document.getElementById("paid-session-id");
const intakeSubmit = document.getElementById("paid-intake-submit");
const intakeMessage = document.getElementById("paid-intake-message");
const finalState = document.getElementById("paid-final-state");
const bookingLink = document.getElementById("paid-booking-link");
const reportActions = document.getElementById("paid-report-actions");
const reportViewLink = document.getElementById("paid-report-view-link");
const reportDownloadLink = document.getElementById("paid-report-download-link");
const sessionNote = document.getElementById("paid-session-note");

function isBypassMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bypass") === "true" || params.get("internal") === "1";
}

function setMessage(element, message, type = "error") {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-success", type === "success");
}

function clearMessage(element) {
  setMessage(element, "", "error");
}

function setLoadingButton(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
}

function setBlockVisibility(element, visible) {
  if (!element) return;
  element.hidden = !visible;
  element.style.display = visible ? "" : "none";
}

function applyReportLinks(data) {
  const driveUrl = String(data?.driveUrl || "").trim();
  const downloadUrl = String(data?.downloadUrl || "").trim();
  const hasLinks = Boolean(driveUrl || downloadUrl);

  setBlockVisibility(reportActions, hasLinks);

  if (reportViewLink) {
    if (driveUrl) {
      reportViewLink.href = driveUrl;
      reportViewLink.hidden = false;
      reportViewLink.style.display = "";
    } else {
      reportViewLink.removeAttribute("href");
      reportViewLink.hidden = true;
      reportViewLink.style.display = "none";
    }
  }

  if (reportDownloadLink) {
    if (downloadUrl) {
      reportDownloadLink.href = downloadUrl;
      reportDownloadLink.hidden = false;
      reportDownloadLink.style.display = "";
    } else {
      reportDownloadLink.removeAttribute("href");
      reportDownloadLink.hidden = true;
      reportDownloadLink.style.display = "none";
    }
  }
}

async function readJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The intake service returned an invalid response.");
  }
}

const searchParams = new URLSearchParams(window.location.search);
const sessionId = String(searchParams.get("session_id") || "").trim();
const bypassMode = isBypassMode();

if (sessionIdInput) {
  sessionIdInput.value = sessionId || (bypassMode ? "internal-bypass" : "");
}

if (sessionNote) {
  sessionNote.textContent = bypassMode
    ? "Internal Test Mode Enabled"
    : sessionId
      ? "Add a few details below so Damon can tailor the implementation plan to your business, priorities, and market."
      : "Your payment looks complete, but we could not find the Stripe session ID in this page URL. If this page was reloaded manually, return from the Stripe success link or contact us and we will match it up.";
}

if (intakeForm) {
  intakeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(intakeMessage);

    const formData = new FormData(intakeForm);
    const payload = {
      sessionId: String(formData.get("sessionId") || "").trim(),
      bypass: bypassMode,
      website: String(formData.get("website") || "").trim(),
      businessGoal: String(formData.get("businessGoal") || "").trim(),
      idealCustomer: String(formData.get("idealCustomer") || "").trim(),
      topServices: String(formData.get("topServices") || "").trim(),
      priorityPages: String(formData.get("priorityPages") || "").trim(),
      targetLocations: String(formData.get("targetLocations") || "").trim(),
      topCompetitors: String(formData.get("topCompetitors") || "").trim(),
      hasBlog: String(formData.get("hasBlog") || "").trim(),
      cmsPlatform: String(formData.get("cmsPlatform") || "").trim(),
      canEditCode: String(formData.get("canEditCode") || "").trim(),
      marketingSupport: String(formData.get("marketingSupport") || "").trim(),
      aiQuestionTargeting: String(formData.get("aiQuestionTargeting") || "").trim(),
      currentMarketingFocus: String(formData.get("currentMarketingFocus") || "").trim(),
      biggestChallenge: String(formData.get("biggestChallenge") || "").trim(),
      customerIntent: String(formData.get("customerIntent") || "").trim(),
      desiredVisibility: String(formData.get("desiredVisibility") || "").trim(),
      differentiation: String(formData.get("differentiation") || "").trim(),
      conversionGoal: String(formData.get("conversionGoal") || "").trim(),
      contentMaturity: String(formData.get("contentMaturity") || "").trim()
    };

    if (!payload.website) {
      setMessage(intakeMessage, "Enter your main website URL.");
      return;
    }

    if (!bypassMode && !payload.sessionId) {
      setMessage(intakeMessage, "We couldn’t verify your payment session. Return from the Stripe success page or contact us and we’ll help manually.");
      return;
    }

    setLoadingButton(intakeSubmit, true);

    try {
      const response = await fetch("/.netlify/functions/submit-paid-intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await readJson(response);

      if (!response.ok || data.success !== true) {
        throw new Error(data.error || "Intake submission failed.");
      }

      intakeForm.hidden = true;
      setBlockVisibility(finalState, true);

      if (bookingLink && data.bookingUrl) {
        bookingLink.href = data.bookingUrl;
      }

      applyReportLinks(data);

      setMessage(intakeMessage, "Details received.", "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(intakeMessage, error.message || "Intake submission failed.");
      console.error(error);
    } finally {
      setLoadingButton(intakeSubmit, false);
    }
  });
}
