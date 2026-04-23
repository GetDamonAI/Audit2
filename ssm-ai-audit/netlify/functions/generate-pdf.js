const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const TEST_HTML = `
<html>
  <body style="font-family: Arial; padding: 40px;">
    <h1>AI Visibility Audit</h1>
    <p>This is a test PDF to confirm generation is working.</p>
  </body>
</html>
`;

exports.handler = async () => {
  try {
    const pdf = await generatePdfReport();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="ai-visibility-audit-test.pdf"'
      },
      isBase64Encoded: true,
      body: pdf.buffer.toString("base64")
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: error.message || "PDF generation failed."
      })
    };
  }
};

async function generatePdfReport({ report } = {}) {
  const html = report ? renderReportHtml(report) : TEST_HTML;
  const fileName = report
    ? sanitizeFileName(`${report.businessName || report.url || "ai-visibility-audit"}-ai-visibility-audit.pdf`)
    : "ai-visibility-audit-test.pdf";
  const buffer = await renderPdfBuffer(html);
  const filePath = path.join("/tmp", fileName);

  fs.writeFileSync(filePath, buffer);

  return {
    fileName,
    filePath,
    mimeType: "application/pdf",
    buffer
  };
}

async function renderPdfBuffer(html) {
  let browser;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    return await page.pdf({
      format: "A4",
      printBackground: true
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function renderReportHtml(report) {
  const sections = [
    ["AI Visibility Summary", renderParagraph(report.executiveSummary?.overallDiagnosis)],
    ["Positioning Analysis", renderDiagnosisList(report.aiVisibilityDiagnosis)],
    ["Opportunity Map", renderOpportunityList(report.opportunityMap)],
    ["Priority Fixes", renderPriorityList(report.priorityActions)],
    ["Content Strategy", renderRecommendationList(report.tacticalRecommendations)],
    ["Technical + Structure", renderWorkstreams(report.workstreams)],
    ["60-Day Plan", renderCalendar(report.sixtyDayCalendar)],
    ["Implementation Checklist", renderChecklist(report.implementationChecklist)],
    ["Quick Wins", renderSimpleList(report.quickWins)],
    ["Coaching Notes", renderCoachingNotes(report.coachingNotes)]
  ];

  return `
    <html>
      <body style="font-family: Arial, sans-serif; padding: 40px; color: #171717; line-height: 1.55;">
        <h1 style="margin: 0 0 10px; font-size: 28px;">${escapeHtml(report.businessName || "AI Visibility Audit")}</h1>
        <p style="margin: 0 0 8px; color: #5f5a53;"><strong>Website:</strong> ${escapeHtml(report.url || "Unknown")}</p>
        <p style="margin: 0 0 28px; color: #5f5a53;"><strong>Generated:</strong> ${escapeHtml(formatDate(report.generatedAt))}</p>
        ${sections
          .filter(([, content]) => content)
          .map(
            ([title, content]) => `
              <section style="margin-top: 28px; page-break-inside: avoid;">
                <h2 style="margin: 0 0 12px; font-size: 20px;">${escapeHtml(title)}</h2>
                ${content}
              </section>
            `
          )
          .join("")}
      </body>
    </html>
  `;
}

function renderParagraph(value) {
  return value ? `<p style="margin: 0;">${escapeHtml(value)}</p>` : "";
}

function renderSimpleList(items) {
  const values = normalizeArray(items);
  if (!values.length) return "";
  return `<ul style="margin: 0; padding-left: 20px;">${values.map((item) => `<li style="margin: 0 0 8px;">${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderDiagnosisList(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return values
    .map(
      (item) => `
        <div style="margin-bottom: 14px;">
          <p style="margin: 0 0 4px;"><strong>${escapeHtml(item.area || "Area")}</strong> (${escapeHtml(item.severity || "Medium")})</p>
          <p style="margin: 0 0 4px;">${escapeHtml(item.diagnosis || "")}</p>
          <p style="margin: 0; color: #5f5a53;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMattersForAiSearch || "")}</p>
        </div>
      `
    )
    .join("");
}

function renderOpportunityList(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return `<ul style="margin: 0; padding-left: 20px;">${values
    .map(
      (item) => `
        <li style="margin: 0 0 10px;">
          <strong>${escapeHtml(item.query || "")}</strong><br />
          ${escapeHtml(item.whyItMatters || "")}
        </li>
      `
    )
    .join("")}</ul>`;
}

function renderPriorityList(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return `<ol style="margin: 0; padding-left: 20px;">${values
    .map(
      (item) => `
        <li style="margin: 0 0 10px;">
          <strong>${escapeHtml(item.title || "")}</strong><br />
          ${escapeHtml(item.whyItMatters || "")}
        </li>
      `
    )
    .join("")}</ol>`;
}

function renderRecommendationList(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return values
    .slice(0, 8)
    .map(
      (item) => `
        <div style="margin-bottom: 14px;">
          <p style="margin: 0 0 4px;"><strong>${escapeHtml(item.title || "")}</strong></p>
          <p style="margin: 0 0 4px;">${escapeHtml(item.whatToChange || item.diagnosis || "")}</p>
          ${renderSimpleList(item.stepByStepImplementation || [])}
        </div>
      `
    )
    .join("");
}

function renderWorkstreams(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return values
    .map(
      (item) => `
        <div style="margin-bottom: 14px;">
          <p style="margin: 0 0 4px;"><strong>${escapeHtml(item.title || "")}</strong></p>
          <p style="margin: 0 0 4px;">${escapeHtml(item.summary || "")}</p>
          ${renderSimpleList(item.items || [])}
        </div>
      `
    )
    .join("");
}

function renderCalendar(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return values
    .map(
      (phase) => `
        <div style="margin-bottom: 14px;">
          <p style="margin: 0 0 4px;"><strong>${escapeHtml(phase.phase || "")}</strong></p>
          <ul style="margin: 0; padding-left: 20px;">
            ${(Array.isArray(phase.items) ? phase.items : [])
              .map(
                (item) => `
                  <li style="margin: 0 0 8px;">
                    <strong>${escapeHtml(item.task || "")}</strong><br />
                    ${escapeHtml(item.whyItMatters || "")}
                  </li>
                `
              )
              .join("")}
          </ul>
        </div>
      `
    )
    .join("");
}

function renderChecklist(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return `<ul style="margin: 0; padding-left: 20px;">${values
    .map(
      (item) => `
        <li style="margin: 0 0 8px;">
          ${escapeHtml(item.task || "")} (${escapeHtml(item.priority || "Medium")})
        </li>
      `
    )
    .join("")}</ul>`;
}

function renderCoachingNotes(notes) {
  if (!notes) return "";
  return `
    ${renderSimpleList(notes.whatMattersMost || [])}
    ${renderSimpleList(notes.whatToIgnore || [])}
    ${notes.whereToFocusFirst ? `<p style="margin: 12px 0 0;"><strong>Where to focus first:</strong> ${escapeHtml(notes.whereToFocusFirst)}</p>` : ""}
  `;
}

function normalizeArray(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileName(value) {
  const base = String(value || "")
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return base ? `${base}.pdf` : "ai-visibility-audit.pdf";
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

module.exports = {
  generatePdfReport
};
