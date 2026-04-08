const shell = document.querySelector(".audit-shell");

const inputState = document.getElementById("state-input");
const loadingState = document.getElementById("state-loading");
const previewState = document.getElementById("state-preview");

const urlForm = document.getElementById("url-form");
const emailForm = document.getElementById("email-form");

const urlInput = document.getElementById("url");
const emailInput = document.getElementById("email");

const urlSubmit = document.getElementById("url-submit");
const emailSubmit = document.getElementById("email-submit");

const urlMessage = document.getElementById("url-message");
const emailMessage = document.getElementById("email-message");

const loadingSteps = Array.from(document.querySelectorAll(".loading-step"));

const previewScore = document.getElementById("preview-score");
const previewStatus = document.getElementById("preview-status");
const previewSupport = document.getElementById("preview-support");
const previewFindings = document.getElementById("preview-findings");

const emailGate = document.getElementById("email-gate");
const deliverySuccess = document.getElementById("delivery-success");
const resultsCta = document.getElementById("results-cta");

let auditContext = {
  url: "",
  businessName: "",
  data: null
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
    Math.round(node.getBoundingClientRect().top + window.scrollY - 8)
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

function setActiveLoadingStep(index) {
  loadingSteps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === index);
  });
}

function setLoadingState(isLoading, button) {
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
}

function setPanelState(activePanel) {
  [inputState, loadingState, previewState].forEach((panel) => {
    if (!panel) return;
    const isActive = panel === activePanel;
    panel.hidden = !isActive;
    panel.classList.toggle("state-panel-active", isActive);
  });

  queueHeightSync();
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function describeScore(score) {
  if (score >= 75) {
    return {
      title: "Strong footing in AI discovery",
      support: "Your brand is showing useful signals, but there is still room to improve recommendation strength."
    };
  }

  if (score >= 50) {
    return {
      title: "Some visibility, but clear gaps",
      support: "AI systems can find signals, but your authority, clarity, or answer-readiness still needs work."
    };
  }

  return {
    title: "Low visibility in AI answers",
    support: "Your brand is not yet giving answer engines enough confidence to surface or recommend it consistently."
  };
}

function buildFallbackFindings(data) {
  const breakdownItems = Array.isArray(data.breakdown) ? [...data.breakdown] : [];
  const sorted = breakdownItems.sort((a, b) => (a?.value ?? 0) - (b?.value ?? 0));

  return sorted.slice(0, 3).map((item) => {
    const label = item?.label || "AI visibility";
    const value = item?.value ?? 0;
    return `${label} is currently weak at ${value}/100.`;
  });
}

function getPreviewFindings(data) {
  const aiIssues = Array.isArray(data.aiIssues)
    ? data.aiIssues.filter((item) => String(item || "").trim())
    : [];

  if (aiIssues.length >= 3) {
    return aiIssues.slice(0, 3);
  }

  const combined = [
    ...aiIssues,
    ...buildFallbackFindings(data)
  ];

  return combined.filter(Boolean).slice(0, 3);
}

function fillPreview(data) {
  const score = Number(data.score ?? 0);
  const scoreSummary = describeScore(score);
  const findings = getPreviewFindings(data);

  previewScore.textContent = String(score);
  previewStatus.textContent = scoreSummary.title;
  previewSupport.textContent = scoreSummary.support;

  previewFindings.innerHTML = "";
  findings.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    previewFindings.appendChild(li);
  });

  if (!findings.length) {
    const li = document.createElement("li");
    li.textContent = "We found a few important gaps in how AI systems understand and recommend your brand.";
    previewFindings.appendChild(li);
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

function resetEmailGate() {
  if (emailForm) {
    emailForm.hidden = false;
  }

  if (emailGate) {
    emailGate.hidden = false;
  }

  if (deliverySuccess) {
    deliverySuccess.hidden = true;
  }

  if (resultsCta) {
    resultsCta.hidden = true;
  }

  if (emailInput) {
    emailInput.value = "";
  }

  clearMessage(emailMessage);
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
    data: null
  };

  setLoadingState(true, urlSubmit);
  setPanelState(loadingState);
  revealNodeAtTop(loadingState);

  const steps = [
    "Checking AI search visibility",
    "Scanning authority and trust signals",
    "Looking for brand mentions and citations",
    "Reviewing structure, entities, and discoverability"
  ];

  let stepIndex = 0;
  setActiveLoadingStep(stepIndex);

  const loadingInterval = window.setInterval(() => {
    stepIndex = (stepIndex + 1) % steps.length;
    setActiveLoadingStep(stepIndex);
  }, 1200);

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
    if (elapsed < 2600) {
      await delay(2600 - elapsed);
    }

    auditContext.data = data;
    fillPreview(data);
    resetEmailGate();

    window.clearInterval(loadingInterval);
    setPanelState(previewState);
    revealNodeAtTop(previewState);

    const height = getDocumentHeight();
    window.parent.postMessage({ type: "ssm-audit-partial-ready", height }, "*");
    window.parent.postMessage({ type: "ssm-audit-complete", height }, "*");
    queueHeightSync();
  } catch (error) {
    window.clearInterval(loadingInterval);
    setPanelState(inputState);
    setMessage(urlMessage, error.message || "Something went wrong. Please try again.");
    console.error(error);
  } finally {
    setLoadingState(false, urlSubmit);
    setActiveLoadingStep(0);
    queueHeightSync();
  }
});

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

  setLoadingState(true, emailSubmit);

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

    if (!emailResponse.ok) {
      throw new Error(emailData.error || "Email send failed.");
    }

    emailForm.hidden = true;
    emailGate.hidden = true;
    deliverySuccess.hidden = false;
    resultsCta.hidden = false;

    const height = getDocumentHeight();
    window.parent.postMessage({ type: "ssm-audit-report-sent", height }, "*");
    queueHeightSync();
    revealNodeAtTop(previewState);
  } catch (error) {
    setMessage(emailMessage, error.message || "Email send failed.");
    console.error(error);
  } finally {
    setLoadingState(false, emailSubmit);
    queueHeightSync();
  }
});
