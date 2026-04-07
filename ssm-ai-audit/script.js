const form = document.getElementById("audit-form");
const results = document.getElementById("results");
const submitButton = document.getElementById("submit-button");
const scoreValue = document.getElementById("score-value");
const summary = document.getElementById("summary");
const breakdown = document.getElementById("breakdown");
const priorities = document.getElementById("priorities");
const opportunity = document.getElementById("opportunity");

const techSpeed = document.getElementById("tech-speed");
const techMobile = document.getElementById("tech-mobile");
const techMeta = document.getElementById("tech-meta");
const techIndex = document.getElementById("tech-index");
const aiRecommendation = document.getElementById("ai-recommendation");
const serpPresence = document.getElementById("serp-presence");
const thinkingStatus = document.getElementById("thinking-status");
const thinkingText = document.getElementById("thinking-text");

const aiVerdict = document.getElementById("ai-verdict");
const entityConfidence = document.getElementById("entity-confidence");
const aiIssues = document.getElementById("ai-issues");
const topAiQueries = document.getElementById("top-ai-queries");
const competitorAdvantage = document.getElementById("competitor-advantage");

function normalizeUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function setThinkingStep(message) {
  if (thinkingStatus) thinkingStatus.hidden = false;
  if (thinkingText) thinkingText.textContent = message;
}

function clearThinkingStep() {
  if (thinkingStatus) thinkingStatus.hidden = true;
  if (thinkingText) thinkingText.textContent = "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fadeOutForm() {
  form.classList.add("form-fade-out");
  return new Promise((resolve) => {
    setTimeout(() => {
      form.style.display = "none";
      resolve();
    }, 350);
  });
}

function showResults() {
  results.hidden = false;
  results.classList.add("results-visible");
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillList(el, items) {
  if (!el) return;
  el.innerHTML = "";
  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    el.appendChild(li);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  submitButton.disabled = true;
  submitButton.textContent = "Running Audit...";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.url = normalizeUrl(payload.url);

  let thinkingInterval;

  try {
    const startedAt = Date.now();
    const steps = [
      "Checking site structure...",
      "Reviewing search visibility...",
      "Scoring AI recommendation likelihood...",
      "Building your audit report..."
    ];

    let stepIndex = 0;
    setThinkingStep(steps[stepIndex]);

    thinkingInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      setThinkingStep(steps[stepIndex]);
    }, 1200);

    const auditResponse = await fetch("/.netlify/functions/generate-audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await auditResponse.json();

    if (!auditResponse.ok) {
      throw new Error(data.error || "Audit generation failed.");
    }

    const minDuration = 3200;
    const elapsed = Date.now() - startedAt;
    if (elapsed < minDuration) {
      await delay(minDuration - elapsed);
    }

    scoreValue.textContent = data.score ?? "0";
    summary.textContent = data.summary || "";

    if (aiVerdict) aiVerdict.textContent = data.aiVerdict || "";
    if (entityConfidence) entityConfidence.textContent = `${data.entityConfidence ?? 0}/100`;

    breakdown.innerHTML = "";
    (data.breakdown || []).forEach((item) => {
      const row = document.createElement("div");
      row.className = "breakdown-row";
      row.innerHTML = `<p>${item.label}</p><p>${item.value} / 100</p>`;
      breakdown.appendChild(row);
    });

    fillList(aiIssues, data.aiIssues);
    fillList(priorities, data.priorities);
    fillList(topAiQueries, data.topAiQueries);
    fillList(competitorAdvantage, data.competitorAdvantage);

    if (opportunity) {
      opportunity.textContent = data.opportunity || "";
    }

    if (techSpeed) techSpeed.textContent = data.tech?.speed || "—";
    if (techMobile) techMobile.textContent = data.tech?.mobile || "—";
    if (techMeta) techMeta.textContent = data.tech?.meta || "—";
    if (techIndex) techIndex.textContent = data.tech?.indexability || "—";
    if (aiRecommendation) aiRecommendation.textContent = data.recommendation?.likelihood || "—";
    if (serpPresence) serpPresence.textContent = data.serp?.presence || "—";

    clearInterval(thinkingInterval);
    clearThinkingStep();

    await fadeOutForm();
showResults();

// META PIXEL — AUDIT COMPLETED (LEAD EVENT)
if (typeof fbq !== "undefined") {
  fbq("track", "Lead", {
    content_name: "AI Audit Completed",
    content_category: "AI Visibility Audit",
    value: data.score || 0,
    currency: "USD"
  });
}

    await fetch("/.netlify/functions/send-audit-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
  email: payload.email,
  businessName: payload.businessName,
  url: payload.url,
  score: data.score ?? 0,
  aiVerdict: data.aiVerdict || "",
  summary: data.summary || "",
  breakdown: data.breakdown || [],
  aiIssues: data.aiIssues || [],
  priorities: data.priorities || [],
  topAiQueries: data.topAiQueries || [],
  competitorAdvantage: data.competitorAdvantage || [],
  opportunity: data.opportunity || "",
  recommendation: data.recommendation || {},
  entityConfidence: data.entityConfidence ?? 0,
  tech: data.tech || {},
  serp: data.serp || {}
})
  } catch (error) {
    clearInterval(thinkingInterval);
    clearThinkingStep();
    alert(error.message || "Something went wrong.");
    console.error(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Find Out How You Show Up in AI";
  }
});
