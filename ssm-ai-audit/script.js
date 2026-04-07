const form = document.getElementById("audit-form");
const results = document.getElementById("results");
const submitButton = document.getElementById("submit-button");
const scoreValue = document.getElementById("score-value");
const summary = document.getElementById("summary");
const breakdown = document.getElementById("breakdown");
const priorities = document.getElementById("priorities");
const aiRecommendation = document.getElementById("ai-recommendation");
const entityConfidence = document.getElementById("entity-confidence");
const aiIssues = document.getElementById("ai-issues");
const thinkingStatus = document.getElementById("thinking-status");
const thinkingText = document.getElementById("thinking-text");

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
    }, 300);
  });
}

function fillList(el, items) {
  if (!el) return;
  el.innerHTML = "";
  (items || []).slice(0, 3).forEach((item) => {
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

    const startedAt = Date.now();

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

    const elapsed = Date.now() - startedAt;
    if (elapsed < 2600) {
      await delay(2600 - elapsed);
    }

    scoreValue.textContent = data.score ?? "0";
    summary.textContent = data.summary || "";
    aiRecommendation.textContent = data.recommendation?.likelihood || "—";
    entityConfidence.textContent = `${data.entityConfidence ?? 0}/100`;

    breakdown.innerHTML = "";
    (data.breakdown || []).slice(0, 4).forEach((item) => {
      const row = document.createElement("div");
      row.className = "breakdown-row";
      row.innerHTML = `<p>${item.label}</p><p>${item.value} / 100</p>`;
      breakdown.appendChild(row);
    });

    fillList(aiIssues, data.aiIssues);
    fillList(priorities, data.priorities);

    clearInterval(thinkingInterval);
    clearThinkingStep();

    await fadeOutForm();
    results.hidden = false;
    results.classList.add("results-visible");
    results.scrollIntoView({ behavior: "smooth", block: "start" });

    window.parent.postMessage({ type: "ssm-audit-complete" }, "*");

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
        summary: data.summary || "",
        aiVerdict: data.aiVerdict || "",
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
    });
  } catch (error) {
    clearInterval(thinkingInterval);
    clearThinkingStep();
    alert(error.message || "Something went wrong.");
    console.error(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Get My AI Visibility Score";
  }
});
