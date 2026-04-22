const shell = document.querySelector(".audit-shell");
const landingView = document.getElementById("landing-view");
const auditExperience = document.getElementById("audit-experience");
const heroCopy = document.querySelector(".hero-copy");
const heroTool = document.querySelector(".hero-tool");
const partnerLogo = document.getElementById("partner-logo");
const partnerEyebrow = document.getElementById("partner-eyebrow");
const heroSubhead = document.getElementById("hero-subhead");
const landingSections = Array.from(
  document.querySelectorAll(".platform-band, .insight-section, .checks-section")
);

const stateLoading = document.getElementById("state-loading");
const statePreview = document.getElementById("state-preview");
const statePaidIntake = document.getElementById("state-paid-intake");

const urlForm = document.getElementById("url-form");
const emailForm = document.getElementById("email-form");
const paidIntakeForm = document.getElementById("paid-intake-form");
const paidIntakeHeader = document.getElementById("paid-intake-header");

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
const paidReportActions = document.getElementById("paid-report-actions");
const paidReportViewLink = document.getElementById("paid-report-view-link");
const paidReportDownloadLink = document.getElementById("paid-report-download-link");
const paidSessionNote = document.getElementById("paid-session-note");
const PAID_PLAN_VALUE = 149;
const DEFAULT_HERO_SUBHEAD = heroSubhead?.textContent?.trim() || "";
const PARTNER_HOST_SUFFIX = "semanticsearchmarketing.com";
const PARTNER_CONFIG = {
  telus: {
    name: "TELUS",
    logoPath: "/partners/telus.png",
    eyebrowText: "In partnership with TELUS",
    subhead: ""
  },
  bctech: {
    name: "BC Tech",
    logoPath: "/partners/bctech.png",
    eyebrowText: "In partnership with BC Tech",
    subhead: ""
  }
};

const loadingPhases = [
  {
    title: "Checking site structure",
    detail: "Checking site structure and the signals AI systems can read first.",
    progress: 8
  },
  {
    title: "Reviewing search visibility signals",
    detail: "Reviewing search visibility signals that can shape AI discovery.",
    progress: 24
  },
  {
    title: "Evaluating AI interpretation patterns",
    detail: "Evaluating how answer engines are likely to interpret what your site is about.",
    progress: 43
  },
  {
    title: "Looking for missing trust and authority signals",
    detail: "Looking for missing trust and authority signals that affect whether you get cited.",
    progress: 62
  },
  {
    title: "Pulling together your visibility findings",
    detail: "Pulling together your visibility findings into a quick read of what matters most.",
    progress: 81
  },
  {
    title: "Building your quick audit result",
    detail: "Building your quick audit result so you can see where visibility is breaking down.",
    progress: 94
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

function getPartnerKeyFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const queryPartner = (params.get("partner") || "").trim().toLowerCase();
  if (queryPartner) {
    return queryPartner;
  }

  const hostname = window.location.hostname.toLowerCase();
  if (
    hostname.endsWith(`.${PARTNER_HOST_SUFFIX}`) &&
    hostname !== PARTNER_HOST_SUFFIX
  ) {
    const subdomain = hostname.slice(
      0,
      -1 * (`.${PARTNER_HOST_SUFFIX}`).length
    );
    return subdomain.split(".").filter(Boolean)[0] || "";
  }

  return "";
}

function hidePartnerBranding() {
  if (partnerLogo) {
    partnerLogo.style.display = "none";
    partnerLogo.removeAttribute("src");
    partnerLogo.alt = "";
  }

  if (partnerEyebrow) {
    partnerEyebrow.hidden = true;
    partnerEyebrow.textContent = "";
  }

  if (heroSubhead) {
    heroSubhead.textContent = DEFAULT_HERO_SUBHEAD;
  }
}

function applyPartnerBranding() {
  const partnerKey = getPartnerKeyFromLocation();
  const partner = PARTNER_CONFIG[partnerKey];

  if (!partner) {
    hidePartnerBranding();
    return;
  }

  if (partnerEyebrow) {
    partnerEyebrow.textContent = partner.eyebrowText || "";
    partnerEyebrow.hidden = !partner.eyebrowText;
  }

  if (heroSubhead) {
    heroSubhead.textContent = partner.subhead || DEFAULT_HERO_SUBHEAD;
  }

  if (partnerLogo && partner.logoPath) {
    partnerLogo.onload = () => {
      partnerLogo.style.display = "block";
      queueHeightSync();
    };
    partnerLogo.onerror = () => {
      partnerLogo.style.display = "none";
      partnerLogo.removeAttribute("src");
      partnerLogo.alt = "";
    };
    partnerLogo.src = partner.logoPath;
    partnerLogo.alt = partner.name ? `${partner.name} logo` : "Partner logo";
  } else if (partnerLogo) {
    partnerLogo.style.display = "none";
    partnerLogo.removeAttribute("src");
    partnerLogo.alt = "";
  }
}

function trackEvent(name, params = {}) {
  if (typeof window.trackAuditEvent === "function") {
    window.trackAuditEvent(name, params);
  }
}

function trackPurchaseSuccess(sessionId) {
  const key = `ssm-audit-purchase-tracked:${sessionId || "unknown"}`;

  try {
    if (window.sessionStorage.getItem(key)) {
      return;
    }
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Session storage is optional in embed contexts.
  }

  trackEvent("purchase_success", {
    value: PAID_PLAN_VALUE,
    currency: "USD",
    session_id: sessionId || ""
  });
}

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

function applyPaidReportLinks(data) {
  const driveUrl = String(data?.driveUrl || "").trim();
  const downloadUrl = String(data?.downloadUrl || "").trim();
  const hasLinks = Boolean(driveUrl || downloadUrl);

  setBlockVisibility(paidReportActions, hasLinks);

  if (paidReportViewLink) {
    if (driveUrl) {
      paidReportViewLink.href = driveUrl;
      paidReportViewLink.hidden = false;
      paidReportViewLink.style.display = "";
    } else {
      paidReportViewLink.removeAttribute("href");
      paidReportViewLink.hidden = true;
      paidReportViewLink.style.display = "none";
    }
  }

  if (paidReportDownloadLink) {
    if (downloadUrl) {
      paidReportDownloadLink.href = downloadUrl;
      paidReportDownloadLink.hidden = false;
      paidReportDownloadLink.style.display = "";
    } else {
      paidReportDownloadLink.removeAttribute("href");
      paidReportDownloadLink.hidden = true;
      paidReportDownloadLink.style.display = "none";
    }
  }
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

function setLoadingProgress(progress) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  const phaseIndex = loadingPhases.reduce((activeIndex, phase, index) => {
    return safeProgress >= phase.progress ? index : activeIndex;
  }, 0);
  const phase = loadingPhases[phaseIndex] || loadingPhases[loadingPhases.length - 1];

  loadingDetail.textContent = phase.detail;
  loadingPhaseLabel.textContent = `Step ${Math.min(phaseIndex + 1, loadingPhases.length)} of ${loadingPhases.length}`;
  loadingProgressValue.textContent = `${Math.round(safeProgress)}%`;
  loadingProgressBar.style.width = `${safeProgress}%`;
}

function createLoadingRun() {
  let progress = loadingPhases[0]?.progress || 8;
  let settled = false;

  setLoadingProgress(progress);

  const interval = window.setInterval(() => {
    if (settled) return;

    let increment = 0.9;
    if (progress < 20) increment = 2.6;
    else if (progress < 38) increment = 1.9;
    else if (progress < 56) increment = 1.45;
    else if (progress < 74) increment = 1.05;
    else if (progress < 88) increment = 0.72;
    else if (progress < 95) increment = 0.34;
    else increment = 0.12;

    progress = Math.min(96, progress + increment);
    setLoadingProgress(progress);
  }, 240);

  return {
    async complete() {
      settled = true;
      window.clearInterval(interval);

      const target = 100;
      while (progress < target) {
        progress = Math.min(target, progress + 3);
        setLoadingProgress(progress);
        if (progress < target) {
          await delay(45);
        }
      }
    },
    stop() {
      settled = true;
      window.clearInterval(interval);
    },
    reset() {
      progress = loadingPhases[0]?.progress || 8;
      setLoadingProgress(progress);
    }
  };
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

  if (paidIntakeHeader) {
    paidIntakeHeader.hidden = false;
  }

  if (paidSessionIdInput) {
    paidSessionIdInput.value = sessionId;
  }

  if (paidSessionNote) {
    paidSessionNote.hidden = false;
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

  if (paidIntakeMessage) {
    paidIntakeMessage.hidden = false;
  }

  clearMessage(paidIntakeMessage);
  setAppStage("paid-intake");
  trackPurchaseSuccess(sessionId);
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
applyPartnerBranding();

if (isPaidReturn()) {
  initializePaidReturnState();
}

if (urlInput) {
  urlInput.addEventListener(
    "focus",
    () => {
      trackEvent("url_field_focus", {
        location: "hero_url_input"
      });
    },
    { once: true }
  );
}

if (urlSubmit) {
  urlSubmit.addEventListener("click", () => {
    trackEvent("scan_clicked", {
      cta: "Show me how I rank in AI →"
    });
  });
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
  trackEvent("audit_started", {
    url: auditContext.url
  });
  setLoadingButton(urlSubmit, true);
  setAppStage("loading");
  setLoadingProgress(loadingPhases[0]?.progress || 8);
  window.requestAnimationFrame(() => {
    revealNodeAtTop(stateLoading);
  });
  const loadingRun = createLoadingRun();

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
    if (elapsed < 1400) {
      await delay(1400 - elapsed);
    }

    await loadingRun.complete();

    auditContext.data = data;
    fillPreview(data);
    persistAuditContext();
    resetPostAuditState();
    notifyQuickAuditAdmin();
    trackEvent("audit_completed", {
      url: auditContext.url,
      score: Number(data.score ?? 0),
      ai_verdict: data.aiVerdict || ""
    });

    setAppStage("preview");
    await delay(80);
    revealNodeAtTop(statePreview);

    const height = getDocumentHeight();
    window.parent.postMessage({ type: "ssm-audit-quick-audit-ready", height }, "*");
    window.parent.postMessage({ type: "ssm-audit-complete", height }, "*");
    queueHeightSync();
  } catch (error) {
    loadingRun.stop();
    setAppStage("landing");
    setMessage(urlMessage, error.message || "Something went wrong. Please try again.");
    console.error(error);
  } finally {
    setLoadingButton(urlSubmit, false);
    if (!auditContext.data) {
      loadingRun.reset();
    }
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
  trackEvent("paid_cta_clicked", {
    url: auditContext.url,
    score: Number(auditContext.data.score ?? 0),
    offer: "Full AI Visibility Audit + Implementation Plan"
  });

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

      if (paidIntakeHeader) {
        paidIntakeHeader.hidden = true;
      }

      if (paidSessionNote) {
        paidSessionNote.hidden = true;
      }

      paidIntakeForm.hidden = true;
      paidIntakeMessage.hidden = true;
      setBlockVisibility(paidFinalState, true);

      if (paidBookingLink && data.bookingUrl) {
        paidBookingLink.href = data.bookingUrl;
      }

      applyPaidReportLinks(data);

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

    trackEvent("free_lead_submitted", {
      url: auditContext.url,
      email_domain: email.split("@")[1] || "",
      score: Number(auditContext.data.score ?? 0)
    });
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
