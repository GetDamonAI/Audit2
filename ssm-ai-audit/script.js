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
  if (thinkingStatus) thinkingStatus.hidden = false;
  if (thinkingText) thinkingText.textContent = message;
}

function clearThinkingStep() {
  if (thinkingStatus) thinkingStatus.hidden = true;
  if (thinkingText) thinkingText.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  submitButton.disabled = true;
  submitButton.textContent = "Checking...";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.url = normalizeUrl(payload.url);

  try {
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

    if (opportunity) {
      opportunity.textContent = data.opportunity || "";
    }

    if (techSpeed) techSpeed.textContent = data.tech?.speed || "—";
    if (techMobile) techMobile.textContent = data.tech?.mobile || "—";
    if (techMeta) techMeta.textContent = data.tech?.meta || "—";
    if (techIndex) techIndex.textContent = data.tech?.indexability || "—";
    if (aiRecommendation) aiRecommendation.textContent = data.recommendation?.likelihood || "—";
    if (serpPresence) serpPresence.textContent = data.serp?.presence || "—";

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
