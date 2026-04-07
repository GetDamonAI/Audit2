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

function normalizeUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function setThinkingStep(message) {
  thinkingStatus.hidden = false;
  thinkingText.textContent = message;
}

function clearThinkingStep() {
  thinkingStatus.hidden = true;
  thinkingText.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  submitButton.disabled = true;
  submitButton.textContent = "Checking...";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  payload.url = normalizeUrl(payload.url);
  payload.email = (payload.email || "").trim();
  payload.businessName = (payload.businessName || "").trim();
  payload.industry = (payload.industry || "").trim();
  payload.service = (payload.service || "").trim();

  try {
    if (!payload.email || !payload.url) {
      throw new Error("Please enter both your website URL and email.");
    }

    const startedAt = Date.now();

    setThinkingStep("Checking site structure...");
    await new Promise((resolve) => setTimeout(resolve, 700));

    setThinkingStep("Reviewing search visibility...");
    await new Promise((resolve) => setTimeout(resolve, 700));

    setThinkingStep("Scoring AI recommendation likelihood...");
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

    const minDuration = 2600;
    const elapsed = Date.now() - startedAt;
    if (elapsed < minDuration) {
      await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
    }

    scoreValue.textContent = data.score ?? "0";
    summary.textContent = data.summary || "";

    breakdown.innerHTML = "";
    (data.breakdown || []).forEach((item) => {
      const row = document.createElement("div");
      row.className = "breakdown-row";
      row.innerHTML = `<p>${item.label}</p><p>${item.value} / 100</p>`;
      breakdown.appendChild(row);
    });

    priorities.innerHTML = "";
    (data.priorities || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      priorities.appendChild(li);
    });

    opportunity.textContent =
      data.opportunity ||
      "The clearest upside is improving how your site communicates its offer, trust signals, and structure so AI systems can understand and recommend it more confidently.";

    techSpeed.textContent = data.tech?.speed || "—";
    techMobile.textContent = data.tech?.mobile || "—";
    techMeta.textContent = data.tech?.meta || "—";
    techIndex.textContent = data.tech?.indexability || "—";
    aiRecommendation.textContent = data.recommendation?.likelihood || "—";
    serpPresence.textContent = data.serp?.presence || "—";

    clearThinkingStep();
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });

    const emailPayload = {
      email: payload.email,
      businessName: payload.businessName,
      url: payload.url,
      industry: payload.industry,
      service: payload.service,
      score: data.score ?? 0,
      summary: data.summary || "",
      breakdown: data.breakdown || [],
      priorities: data.priorities || [],
      opportunity: data.opportunity || "",
      recommendation: data.recommendation || {},
      tech: data.tech || {},
      serp: data.serp || {}
    };

    const emailResponse = await fetch("/.netlify/functions/send-audit-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(emailPayload)
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      throw new Error(emailData.error || "Email send failed.");
    }
  } catch (error) {
    clearThinkingStep();
    alert(error.message || "Something went wrong.");
    console.error(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Find Out How You Show Up in AI";
  }
});
