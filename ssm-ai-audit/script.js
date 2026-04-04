const form = document.getElementById("audit-form");
const results = document.getElementById("results");
const submitButton = document.getElementById("submit-button");
const scoreValue = document.getElementById("score-value");
const summary = document.getElementById("summary");
const breakdown = document.getElementById("breakdown");
const priorities = document.getElementById("priorities");

function normalizeUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  submitButton.disabled = true;
  submitButton.textContent = "Generating...";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.url = normalizeUrl(payload.url);

  try {
    const auditResponse = await fetch("/.netlify/functions/generate-audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await auditResponse.json();

    if (!auditResponse.ok) {
      throw new Error(JSON.stringify(emailData));
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

    const techSpeed = document.getElementById("tech-speed");
    const techMobile = document.getElementById("tech-mobile");
    const techMeta = document.getElementById("tech-meta");
    const techIndex = document.getElementById("tech-index");

    if (techSpeed) techSpeed.textContent = "78%";
    if (techMobile) techMobile.textContent = "Good";
    if (techMeta) techMeta.textContent = "Partial";
    if (techIndex) techIndex.textContent = "Valid";

    results.hidden = false;

    const emailResponse = await fetch("/.netlify/functions/send-audit-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: payload.email,
        businessName: payload.businessName,
        url: payload.url,
        score: data.score,
        summary: data.summary,
        breakdown: data.breakdown,
        priorities: data.priorities
      })
    });

    const emailData = await emailResponse.json();
    console.log("email response", emailData);

    if (!emailResponse.ok) {
      throw new Error(emailData.error || "Email send failed.");
    }

    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    alert(error.message || "Something went wrong.");
    console.error(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Fix My Visibility";
  }
});
