const form = document.getElementById("audit-form");
const results = document.getElementById("results");
const submitButton = document.getElementById("submit-button");
const scoreValue = document.getElementById("score-value");
const summary = document.getElementById("summary");
const breakdown = document.getElementById("breakdown");
const priorities = document.getElementById("priorities");

const techSpeed = document.getElementById("tech-speed");
const techMobile = document.getElementById("tech-mobile");
const techMeta = document.getElementById("tech-meta");
const techIndex = document.getElementById("tech-index");

function normalizeUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function setThinkingStep(message) {
  let node = document.getElementById("thinking-status");
  if (!node) {
    node = document.createElement("p");
    node.id = "thinking-status";
    node.className = "note";
    form.appendChild(node);
  }
  node.textContent = message;
}

function clearThinkingStep() {
  const node = document.getElementById("thinking-status");
  if (node) node.remove();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  submitButton.disabled = true;
  submitButton.textContent = "Checking...";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.url = normalizeUrl(payload.url);

  try {
    const startedAt = Date.now();

    setThinkingStep("Checking site structure...");
    await new Promise((resolve) => setTimeout(resolve, 700));

    setThinkingStep("Reviewing technical signals...");
    await new Promise((resolve) => setTimeout(resolve, 700));

    setThinkingStep("Scoring AI visibility...");
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

    const minDuration = 2200;
    const elapsed = Date.now() - startedAt;
    if (elapsed < minDuration) {
      await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
    }

    scoreValue.textContent = data.score;
    summary.textContent = data.summary;

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

    if (techSpeed) techSpeed.textContent = data.tech?.speed || "—";
    if (techMobile) techMobile.textContent = data.tech?.mobile || "—";
    if (techMeta) techMeta.textContent = data.tech?.meta || "—";
    if (techIndex) techIndex.textContent = data.tech?.indexability || "—";

    clearThinkingStep();
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });

    const emailResponse = await fetch("/.netlify/functions/send-audit-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: payload.email,
        businessName: payload.businessName,
        url: payload.url,
        industry: payload.industry,
        service: payload.service,
        score: data.score,
        summary: data.summary,
        breakdown: data.breakdown,
        priorities: data.priorities
      })
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
    submitButton.textContent = "Fix My Visibility";
  }
});
