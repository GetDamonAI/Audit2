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
    const response = await fetch("/.netlify/functions/generate-audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Audit generation failed.");
    }

    scoreValue.textContent = data.score;
    summary.textContent = data.summary;

    breakdown.innerHTML = "";
    data.breakdown.forEach((item) => {
      const row = document.createElement("div");
      row.className = "breakdown-row";
      row.innerHTML = `<p>${item.label}</p><p>${item.value} / 100</p>`;
      breakdown.appendChild(row);
    });

    priorities.innerHTML = "";
    data.priorities.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      priorities.appendChild(li);
    });
await fetch("/.netlify/functions/send-audit-email", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    email: payload.email,
    score: data.score,
    summary: data.summary,
    priorities: data.priorities
  })
});
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    alert(error.message || "Something went wrong generating the audit.");
    console.error(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Generate My Audit";
  }
});
