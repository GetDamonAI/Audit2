const shell = document.querySelector(".audit-shell");
const landingView = document.getElementById("landing-view");
const auditExperience = document.getElementById("audit-experience");
const heroCopy = document.querySelector(".hero-copy");
const heroTool = document.querySelector(".hero-tool");
const landingSections = Array.from(
  document.querySelectorAll(".platform-band, .insight-section, .checks-section")
);

const stateLoading = document.getElementById("state-loading");
const statePreview = document.getElementById("state-preview");
const statePaidIntake = document.getElementById("state-paid-intake");

const urlForm = document.getElementById("url-form");
const emailForm = document.getElementById("email-form");
const paidIntakeForm = document.getElementById("paid-intake-form");

const urlInput = document.getElementById("url");
const emailInput = document.getElementById("email");
const paidSessionIdInput = document.getElementById("paid-session-id");

const urlSubmit = document.getElementById("url-submit");
const emailSubmit = document.getElementById("email-submit");
const paidIntakeSubmit = document.getElementById("paid-intake-submit");

const urlMessage = document.getElementById("url-message");
const emailMessage = document.getElementById("email-message");
const paidIntakeMessage = document.getElementById("paid-intake-message");

const loadingDetail = document.getElementById("loading-detail");
const loadingPhaseLabel = document.getElementById("loading-phase-label");
const loadingProgressValue = document.getElementById("loading-progress-value");
const loadingProgressBar = document.getElementById("loading-progress-bar");

const previewScore = document.getElementById("preview-score");
const previewDomain = document.getElementById("preview-domain");
const previewStatus = document.getElementById("preview-status");
const previewSupport = document.getElementById("preview-support");
const previewFindings = document.getElementById("preview-findings");

const paidOffer = document.getElementById("paid-offer");
const paidOfferSubmit = document.getElementById("paid-offer-submit");
const paidOfferFallback = document.getElementById("paid-offer-fallback");
const paidOfferMessage = document.getElementById("paid-offer-message");

const emailGate = document.getElementById("email-gate");
const deliverySuccess = document.getElementById("delivery-success");
const resultsCta = document.getElementById("results-cta");
const paidFinalState = document.getElementById("paid-final-state");
const paidBookingLink = document.getElementById("paid-booking-link");
const paidSessionNote = document.getElementById("paid-session-note");

const loadingPhases = [
  {
    title: "Checking AI answer visibility",
    detail: "Checking whether your brand is making it into AI answers.",
    progress: 20
  },
  {
    title: "Reviewing trust and authority signals",
    detail: "Looking for the kinds of signals answer engines would trust enough to cite.",
    progress: 42
  },
  {
    title: "Looking for structured brand understanding",
    detail: "Seeing whether the machines can tell what you do at a glance.",
    progress: 68
  },
  {
    title: "Evaluating citation readiness",
    detail: "Pressure-testing whether your brand would make the shortlist.",
    progress: 90
  }
];

let auditContext = {
  url: "",
  businessName: "",
  data: null,
  email: "",
  industry: "",
  service: "",
  checkoutSessionId: ""
};

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidUrl(value) {
  try {
    const candidate = new URL(normalizeUrl(value));
    return Boolean(candidate.hostname);
  } catch {
    return false;
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function hostnameToName(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
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

function getDocumentHeight() {
  return Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight
  );
}

function notifyParentHeight() {
  const height = getDocumentHeight();
  window.parent.postMessage({ type: "ssm-audit-resize", height }, "*");
  window.parent.postMessage({ type: "ssm-audit-height", height }, "*");
  window.parent.postMessage({ type: "ssm-audit-stage", stage: shell?.dataset.stage || "landing", height }, "*");
}

function queueHeightSync() {
  window.requestAnimationFrame(() => {
    notifyParentHeight();
    window.setTimeout(notifyParentHeight, 120);
    window.setTimeout(notifyParentHeight, 320);
    window.setTimeout(notifyParentHeight, 700);
    window.setTimeout(notifyParentHeight, 1100);
  });
}

function revealNodeAtTop(node) {
  if (!node) return;

  const top = Math.max(
    0,
    Math.round(node.getBoundingClientRect().top + window.scrollY)
  );

  window.scrollTo({
    top,
    behavior: window.innerWidth <= 640 ? "auto" : "smooth"
  });

  window.parent.postMessage({ type: "ssm-audit-scroll", top }, "*");
  queueHeightSync();
}

function setMessage(element, message, type = "error") {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-success", type === "success");
  queueHeightSync();
}

function clearMessage(element) {
  setMessage(element, "", "error");
}

function setBlockVisibility(element, visible) {
  if (!element) return;
  element.hidden = !visible;
  element.style.display = visible ? "" : "none";
}

function setLoadingButton(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
}

function setAppStage(stage) {
  shell.dataset.stage = stage;
  document.body.dataset.auditStage = stage;

  const isLanding = stage === "landing";
  landingView.hidden = false;
  auditExperience.hidden = isLanding;
  heroCopy.hidden = !isLanding;
  heroTool.hidden = !isLanding;
  landingSections.forEach((section) => {
    section.hidden = !isLanding;
  });

  stateLoading.hidden = stage !== "loading";
  statePreview.hidden = stage !== "preview" && stage !== "sent";
  statePaidIntake.hidden = stage !== "paid-intake";

  if (stage !== "sent") {
    setBlockVisibility(deliverySuccess, false);
    setBlockVisibility(resultsCta, false);
  }

  stateLoading.classList.toggle("audit-panel-active", stage === "loading");
  statePreview.classList.toggle("audit-panel-active", stage === "preview" || stage === "sent");
  statePaidIntake.classList.toggle("audit-panel-active", stage === "paid-intake");

  window.parent.postMessage({ type: "ssm-audit-state-change", stage }, "*");
  queueHeightSync();
}

function setActiveLoadingStep(index) {
  const phase = loadingPhases[index] || loadingPhases[loadingPhases.length - 1];
  const phaseNumber = Math.min(index + 1, loadingPhases.length);

  loadingDetail.textContent = phase.detail;
  loadingPhaseLabel.textContent = `Phase ${phaseNumber} of ${loadingPhases.length}`;
  loadingProgressValue.textContent = `${phase.progress}%`;
  loadingProgressBar.style.width = `${phase.progress}%`;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function describeScore(score) {
  if (score >= 75) {
    return {
      title: "AI sees strong signals, with room to sharpen visibility",
      support: "Here’s what AI currently sees when it evaluates your site. Your full report shows what to fix next."
    };
  }

  if (score >= 50) {
    return {
      title: "Some visibility, but meaningful gaps remain",
      support: "Your quick audit found visibility gaps worth addressing, and your site may be missing signals that affect AI recommendations."
    };
  }

  return {
    title: "Low visibility in AI-generated answers",
    support: "Your site may be missing signals that affect AI recommendations. Your full report shows what to fix next."
  };
}

function getCurrentStatus(data) {
  const aiVerdict = String(data.aiVerdict || "").trim();
  if (aiVerdict) {
    return aiVerdict;
  }

  return describeScore(Number(data.score ?? 0)).title;
}

function getStatusSupport(data) {
  const summary = String(data.summary || "").trim();
  if (summary) {
    return summary;
  }

  const recommendationReason = String(data.recommendation?.reason || "").trim();
  if (recommendationReason) {
    return recommendationReason;
  }

  return describeScore(Number(data.score ?? 0)).support;
}

function buildFallbackFindings(data) {
  const breakdownItems = Array.isArray(data.breakdown) ? [...data.breakdown] : [];
  const sorted = breakdownItems.sort((a, b) => (a?.value ?? 0) - (b?.value ?? 0));

  return sorted.slice(0, 3).map((item) => {
    const label = item?.label || "Answer-engine visibility";
    const value = item?.value ?? 0;
    if (/entity/i.test(label)) {
      return `Entity clarity is still weak at ${value}/100, which makes it harder for answer engines to confidently understand and surface your brand.`;
    }

    if (/authority/i.test(label)) {
      return `Authority and trust signals are only ${value}/100, limiting how credible your brand looks in AI-led discovery.`;
    }

    if (/answer/i.test(label)) {
      return `Answer readiness is currently ${value}/100, so your site may not be giving AI systems enough extractable language to cite or recommend.`;
    }

    return `${label} sits at ${value}/100, which is limiting how strongly your brand is likely to surface in AI-generated answers.`;
  });
}

function toAiNativeFinding(text) {
  const value = String(text || "").trim();
  if (!value) return "";

  return value
    .replace(/\bSEO\b/gi, "AI visibility")
    .replace(/\bsearch results\b/gi, "AI-generated answers")
    .replace(/\bsearch engine\b/gi, "answer engine")
    .replace(/\bsearch engines\b/gi, "answer engines")
    .replace(/\brankings\b/gi, "answer-engine visibility");
}

function getPreviewFindings(data) {
  const aiIssues = Array.isArray(data.aiIssues)
    ? data.aiIssues.map(toAiNativeFinding).filter(Boolean)
    : [];

  const combined = [...aiIssues, ...buildFallbackFindings(data)];
  return combined.slice(0, 3);
}

function formatPreviewDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return `Audited live: ${hostname}`;
  } catch {
    return "";
  }
}

function fillPreview(data) {
  const score = Number(data.score ?? 0);
  const findings = getPreviewFindings(data);

  previewScore.textContent = String(score);
  previewDomain.textContent = formatPreviewDomain(auditContext.url);
  previewStatus.textContent = getCurrentStatus(data);
  previewSupport.textContent = getStatusSupport(data);

  previewFindings.innerHTML = "";
  findings.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    previewFindings.appendChild(li);
  });

  if (!findings.length) {
    const li = document.createElement("li");
    li.textContent = "Your brand is not yet giving answer engines enough confidence to understand, trust, and surface it consistently.";
    previewFindings.appendChild(li);
  }
}

function persistAuditContext() {
  try {
    window.sessionStorage.setItem("ssm-ai-audit-context", JSON.stringify(auditContext));
  } catch {
    // Session storage is optional in embed contexts.
  }
}

function resetPostAuditState() {
  clearMessage(paidOfferMessage);
  clearMessage(emailMessage);

  if (emailInput) {
    emailInput.value = "";
  }

  setBlockVisibility(paidOffer, true);
  setBlockVisibility(emailGate, false);
  setBlockVisibility(deliverySuccess, false);
  setBlockVisibility(resultsCta, false);
  emailForm.hidden = false;
}

function showSentState() {
  setBlockVisibility(paidOffer, false);
  setBlockVisibility(emailGate, false);
  emailForm.hidden = true;
  setBlockVisibility(deliverySuccess, true);
  setBlockVisibility(resultsCta, true);
}

function showEmailFallback() {
  setBlockVisibility(emailGate, true);
  emailForm.hidden = false;
  clearMessage(emailMessage);
  queueHeightSync();

  if (emailInput) {
    window.setTimeout(() => {
      emailInput.focus({ preventScroll: true });
      revealNodeAtTop(emailGate);
    }, 40);
  }
}

function getSearchParams() {
  return new URLSearchParams(window.location.search);
}

function isPaidReturn() {
  return getSearchParams().get("paid") === "1";
}

function getPaidSessionId() {
  return String(getSearchParams().get("session_id") || "").trim();
}

function initializePaidReturnState() {
  const sessionId = getPaidSessionId();

  if (paidSessionIdInput) {
    paidSessionIdInput.value = sessionId;
  }

  if (paidSessionNote) {
    paidSessionNote.textContent = sessionId
      ? "Add a few details below so Damon can tailor the implementation plan to your business, priorities, and market."
      : "Your payment looks complete, but we could not find the Stripe session ID in this page URL. If this page was reloaded manually, return from the Stripe success link or contact us and we will match it up.";
  }

  if (paidFinalState) {
    setBlockVisibility(paidFinalState, false);
  }

  if (paidIntakeForm) {
    paidIntakeForm.hidden = false;
  }

  clearMessage(paidIntakeMessage);
  setAppStage("paid-intake");
}

async function notifyQuickAuditAdmin() {
  if (!auditContext.url || !auditContext.data) {
    return;
  }

  try {
    const response = await fetch("/.netlify/functions/send-audit-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      keepalive: true,
      body: JSON.stringify({
        mode: "quick-audit-notify",
        businessName: auditContext.businessName,
        url: auditContext.url,
        score: auditContext.data.score ?? 0,
        summary: auditContext.data.summary || "",
        aiVerdict: auditContext.data.aiVerdict || "",
        breakdown: auditContext.data.breakdown || [],
        aiIssues: auditContext.data.aiIssues || [],
        priorities: auditContext.data.priorities || [],
        topAiQueries: auditContext.data.topAiQueries || [],
        competitorAdvantage: auditContext.data.competitorAdvantage || [],
        opportunity: auditContext.data.opportunity || "",
        recommendation: auditContext.data.recommendation || {},
        entityConfidence: auditContext.data.entityConfidence ?? 0,
        tech: auditContext.data.tech || {},
        serp: auditContext.data.serp || {}
      })
    });

    const result = await readJson(response);
    if (!response.ok || result.success !== true) {
      throw new Error(result.error || "Quick audit admin notification failed.");
    }
  } catch (error) {
    console.error("Quick audit admin notification failed.", error);
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
    throw new Error("The audit service returned an invalid response.");
  }
}

if (window.ResizeObserver && shell) {
  const resizeObserver = new ResizeObserver(() => {
    notifyParentHeight();
  });
  resizeObserver.observe(shell);
}

window.addEventListener("load", queueHeightSync);
window.addEventListener("resize", queueHeightSync);
window.addEventListener("orientationchange", queueHeightSync);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", queueHeightSync);
}

resetPostAuditState();

if (isPaidReturn()) {
  initializePaidReturnState();
}

urlForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(urlMessage);

  const url = normalizeUrl(urlInput.value);
  if (!url || !isValidUrl(url)) {
    setMessage(urlMessage, "Enter a valid website URL.");
    return;
  }

  auditContext = {
    url,
    businessName: hostnameToName(url),
    data: null,
    email: "",
    industry: "",
    service: "",
    checkoutSessionId: ""
  };

  urlInput.blur();
  setLoadingButton(urlSubmit, true);
  setAppStage("loading");
  setActiveLoadingStep(0);

  let phaseIndex = 0;
  const loadingInterval = window.setInterval(() => {
    phaseIndex = (phaseIndex + 1) % loadingPhases.length;
    setActiveLoadingStep(phaseIndex);
  }, 1600);

  try {
    const startedAt = Date.now();

    const auditResponse = await fetch("/.netlify/functions/generate-audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: auditContext.url,
        businessName: auditContext.businessName
      })
    });

    const data = await readJson(auditResponse);

    if (!auditResponse.ok) {
      throw new Error(data.error || "Audit generation failed.");
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < 1700) {
      await delay(1700 - elapsed);
    }

    setActiveLoadingStep(loadingPhases.length - 1);
    loadingProgressValue.textContent = "100%";
    loadingProgressBar.style.width = "100%";

    auditContext.data = data;
    fillPreview(data);
    persistAuditContext();
    resetPostAuditState();
    notifyQuickAuditAdmin();

    window.clearInterval(loadingInterval);
    await delay(220);

    setAppStage("preview");

    const height = getDocumentHeight();
    window.parent.postMessage({ type: "ssm-audit-quick-audit-ready", height }, "*");
    window.parent.postMessage({ type: "ssm-audit-complete", height }, "*");
    queueHeightSync();
  } catch (error) {
    window.clearInterval(loadingInterval);
    setAppStage("landing");
    setMessage(urlMessage, error.message || "Something went wrong. Please try again.");
    console.error(error);
  } finally {
    setLoadingButton(urlSubmit, false);
    setActiveLoadingStep(0);
    queueHeightSync();
  }
});

paidOfferFallback.addEventListener("click", () => {
  showEmailFallback();
});

paidOfferSubmit.addEventListener("click", async () => {
  clearMessage(paidOfferMessage);

  if (!auditContext.url || !auditContext.data) {
    setMessage(paidOfferMessage, "Run the audit first.");
    return;
  }

  setLoadingButton(paidOfferSubmit, true);

  try {
    persistAuditContext();

    const response = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: auditContext.url,
        businessName: auditContext.businessName,
        industry: auditContext.industry || "",
        service: auditContext.service || "",
        email: auditContext.email || "",
        quickAuditScore: auditContext.data.score ?? 0,
        aiVerdict: auditContext.data.aiVerdict || "",
        summary: auditContext.data.summary || ""
      })
    });

    const checkoutData = await readJson(response);

    if (!response.ok || checkoutData.success !== true || !checkoutData.url) {
      throw new Error(checkoutData.error || "Checkout setup failed.");
    }

    auditContext.checkoutSessionId = String(checkoutData.sessionId || "").trim();
    persistAuditContext();
    if (window.top && window.top !== window.self) {
      window.top.location.href = checkoutData.url;
    } else {
      window.location.href = checkoutData.url;
    }
  } catch (error) {
    setMessage(paidOfferMessage, error.message || "Checkout setup failed.");
    console.error(error);
  } finally {
    setLoadingButton(paidOfferSubmit, false);
    queueHeightSync();
  }
});

if (paidIntakeForm) {
  paidIntakeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(paidIntakeMessage);

    const formData = new FormData(paidIntakeForm);
    const payload = {
      sessionId: String(formData.get("sessionId") || "").trim(),
      businessGoal: String(formData.get("businessGoal") || "").trim(),
      topServices: String(formData.get("topServices") || "").trim(),
      priorityPages: String(formData.get("priorityPages") || "").trim(),
      targetLocations: String(formData.get("targetLocations") || "").trim(),
      topCompetitors: String(formData.get("topCompetitors") || "").trim(),
      hasBlog: String(formData.get("hasBlog") || "").trim(),
      cmsPlatform: String(formData.get("cmsPlatform") || "").trim(),
      canEditCode: String(formData.get("canEditCode") || "").trim(),
      marketingSupport: String(formData.get("marketingSupport") || "").trim(),
      reportQuestions: String(formData.get("reportQuestions") || "").trim()
    };

    if (!payload.sessionId) {
      setMessage(paidIntakeMessage, "We couldn’t verify your payment session. Return from the Stripe success page or contact us and we’ll help manually.");
      return;
    }

    setLoadingButton(paidIntakeSubmit, true);

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

      paidIntakeForm.hidden = true;
      setBlockVisibility(paidFinalState, true);

      if (paidBookingLink && data.bookingUrl) {
        paidBookingLink.href = data.bookingUrl;
      }

      setMessage(paidIntakeMessage, "Details received.", "success");
      revealNodeAtTop(statePaidIntake);
    } catch (error) {
      setMessage(paidIntakeMessage, error.message || "Intake submission failed.");
      console.error(error);
    } finally {
      setLoadingButton(paidIntakeSubmit, false);
      queueHeightSync();
    }
  });
}

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(emailMessage);

  const email = String(emailInput.value || "").trim();
  if (!email || !isValidEmail(email)) {
    setMessage(emailMessage, "Enter a valid email address.");
    return;
  }

  if (!auditContext.url || !auditContext.data) {
    setMessage(emailMessage, "Run the audit first.");
    return;
  }

  auditContext.email = email;
  emailInput.blur();
  setLoadingButton(emailSubmit, true);

  try {
    const emailResponse = await fetch("/.netlify/functions/send-audit-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        businessName: auditContext.businessName,
        url: auditContext.url,
        score: auditContext.data.score ?? 0,
        summary: auditContext.data.summary || "",
        aiVerdict: auditContext.data.aiVerdict || "",
        breakdown: auditContext.data.breakdown || [],
        aiIssues: auditContext.data.aiIssues || [],
        priorities: auditContext.data.priorities || [],
        topAiQueries: auditContext.data.topAiQueries || [],
        competitorAdvantage: auditContext.data.competitorAdvantage || [],
        opportunity: auditContext.data.opportunity || "",
        recommendation: auditContext.data.recommendation || {},
        entityConfidence: auditContext.data.entityConfidence ?? 0,
        tech: auditContext.data.tech || {},
        serp: auditContext.data.serp || {}
      })
    });

    const emailData = await readJson(emailResponse);

    if (!emailResponse.ok || emailData.success !== true || emailData.mode !== "full-report") {
      throw new Error(emailData.error || "Email send failed.");
    }

    setAppStage("sent");
    showSentState();

    const height = getDocumentHeight();
    window.parent.postMessage({ type: "ssm-audit-report-sent", height }, "*");
    queueHeightSync();
  } catch (error) {
    setMessage(emailMessage, error.message || "Email send failed.");
    console.error(error);
  } finally {
    setLoadingButton(emailSubmit, false);
    queueHeightSync();
  }
});
