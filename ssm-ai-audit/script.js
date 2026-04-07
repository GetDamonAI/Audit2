const form = document.getElementById("audit-form");
const results = document.getElementById("results");
const submitButton = document.getElementById("submit-button");
const scoreValue = document.getElementById("score-value");
const breakdown = document.getElementById("breakdown");
const priorities = document.getElementById("priorities");
const aiRecommendation = document.getElementById("ai-recommendation");
const entityConfidence = document.getElementById("entity-confidence");
const aiIssues = document.getElementById("ai-issues");
const thinkingStatus = document.getElementById("thinking-status");
const thinkingText = document.getElementById("thinking-text");
const formMessage = document.getElementById("form-message");

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

function setFormMessage(message, type = "error") {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.classList.toggle("is-success", type === "success");
}

function clearFormMessage() {
  setFormMessage("", "error");
}

function validatePayload(payload) {
  if (!payload.url || !isValidUrl(payload.url)) {
    return "Enter a valid website URL.";
  }

  if (!payload.businessName || !String(payload.businessName).trim()) {
    return "Enter your business name.";
  }

  if (!payload.email || !isValidEmail(payload.email)) {
    return "Enter a valid email address.";
  }

  return "";
}

function setThinkingStep(message) {
  if (thinkingStatus) thinkingStatus.hidden = false;
  if (thinkingText) thinkingText.textContent = message;
}

function clearThinkingStep() {
  if (thinkingStatus) thinkingStatus.hidden = true;
  if (thinkingText) thinkingText.textContent = "";
}

function setLoadingState(isLoading) {
  form.classList.toggle("is-submitting", isLoading);
  form.setAttribute("aria-busy", String(isLoading));
  submitButton.classList.toggle("is-loading", isLoading);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function fadeOutForm() {
  form.classList.add("form-fade-out");
  return new Promise((resolve) => {
    window.setTimeout(() => {
      form.hidden = true;
      resolve();
    }, 280);
  });
}

function createBreakdownRow(item) {
  const row = document.createElement("div");
  row.className = "breakdown-row";

  const label = document.createElement("p");
  label.textContent = item.label || "Signal";

  const value = document.createElement("p");
  value.textContent = `${item.value ?? 0} / 100`;

  row.append(label, value);
  return row;
}

function fillBreakdown(items) {
  breakdown.innerHTML = "";

  const values = Array.isArray(items) ? items.slice(0, 4) : [];

  if (!values.length) {
    breakdown.appendChild(createBreakdownRow({ label: "Audit signals", value: 0 }));
    return;
  }

  values.forEach((item) => {
    breakdown.appendChild(createBreakdownRow(item));
  });
}

function fillList(element, items, fallbackText) {
  if (!element) return;

  element.innerHTML = "";

  const values = Array.isArray(items)
    ? items.filter((item) => String(item || "").trim()).slice(0, 3)
    : [];

  if (!values.length) {
    const li = document.createElement("li");
    li.textContent = fallbackText;
    element.appendChild(li);
    return;
  }

  values.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    element.appendChild(li);
  });
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormMessage();

  const formData = new FormData(form);
  const payload = {
    url: normalizeUrl(formData.get("url")),
    businessName: String(formData.get("businessName") || "").trim(),
    email: String(formData.get("email") || "").trim()
  };

  const validationMessage = validatePayload(payload);
  if (validationMessage) {
    setFormMessage(validationMessage);
    return;
  }

  setLoadingState(true);
  submitButton.disabled = true;
  submitButton.textContent = "Running Audit...";

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

    thinkingInterval = window.setInterval(() => {
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

    const data = await readJson(auditResponse);

    if (!auditResponse.ok) {
      throw new Error(data.error || "Audit generation failed.");
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < 2600) {
      await delay(2600 - elapsed);
    }

    scoreValue.textContent = data.score ?? "0";
    aiRecommendation.textContent = data.recommendation?.likelihood || "—";
    entityConfidence.textContent = `${data.entityConfidence ?? 0}/100`;

    fillBreakdown(data.breakdown);
    fillList(aiIssues, data.aiIssues, "No major gaps surfaced from the quick scan.");
    fillList(priorities, data.priorities, "No immediate fixes were returned.");

    window.clearInterval(thinkingInterval);
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
    window.clearInterval(thinkingInterval);
    clearThinkingStep();
    setFormMessage(error.message || "Something went wrong. Please try again.");
    console.error(error);
  } finally {
    setLoadingState(false);
    submitButton.disabled = false;
    submitButton.textContent = "Get My AI Visibility Score";
  }
});
