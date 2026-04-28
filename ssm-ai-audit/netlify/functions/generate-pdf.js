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
    ["Assumptions", renderSimpleList(report.assumptions)],
    ["Executive Summary", renderExecutiveSummary(report.executiveSummary)],
    ["AI Visibility Diagnosis", renderVisibilityDiagnosis(report.aiVisibilityDiagnosis)],
    ["Search Intent + AI Prompt Map", renderPromptMap(report.searchIntentPromptMap)],
    ["Website + Content Structure Findings", renderWebsiteFindings(report.websiteContentFindings)],
    ["Schema + Technical Recommendations", renderSchemaTechnical(report.schemaTechnicalRecommendations)],
    ["Content Strategy + Thought Starters", renderThoughtStarters(report.contentThoughtStarters)],
    ["Priority Fixes", renderPriorityFixes(report.priorityFixes)],
    ["90-Day Implementation Plan", renderNinetyDayPlan(report.ninetyDayImplementationPlan)],
    ["Step-by-Step Checklist", renderChecklistGroups(report.implementationChecklist)],
    ["Coaching Notes", renderCoachingNotesV2(report.coachingNotes)]
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

function renderExecutiveSummary(summary) {
  if (!summary) return "";
  return `
    ${renderParagraph(`<strong>What the business does:</strong> ${escapeHtml(summary.whatTheBusinessDoes || "")}`)}
    ${renderParagraph(`<strong>Current AI/search visibility problem:</strong> ${escapeHtml(summary.currentAiSearchVisibilityProblem || "")}`)}
    ${renderTitledList("Top opportunities", summary.topOpportunities)}
    ${renderTitledList("Top risks", summary.topRisks)}
    ${renderParagraph(`<strong>Plain-English summary:</strong> ${escapeHtml(summary.plainEnglishSummary || "")}`)}
  `;
}

function renderVisibilityDiagnosis(section) {
  if (!section) return "";
  return [
    renderTitledList("Where the brand is clear", section.whereTheBrandIsClear),
    renderTitledList("Where the brand is unclear", section.whereTheBrandIsUnclear),
    renderTitledList(
      "Why AI systems may or may not recommend it",
      section.whyAiSystemsMayOrMayNotRecommendIt
    ),
    renderTitledList("Entity clarity issues", section.entityClarityIssues),
    renderTitledList("Content gaps", section.contentGaps),
    renderTitledList("Trust and authority gaps", section.trustAuthorityGaps)
  ]
    .filter(Boolean)
    .join("");
}

function renderPromptMap(map) {
  if (!map) return "";
  return [
    renderPromptGroup("Buying intent", map.buyingIntent),
    renderPromptGroup("Comparison intent", map.comparisonIntent),
    renderPromptGroup("Educational intent", map.educationalIntent),
    renderPromptGroup("Local/category intent", map.localCategoryIntent),
    renderPromptGroup("Problem-aware intent", map.problemAwareIntent)
  ]
    .filter(Boolean)
    .join("");
}

function renderWebsiteFindings(section) {
  if (!section) return "";
  return [
    renderTitledList("Homepage clarity", section.homepageClarity),
    renderTitledList("Service or product page clarity", section.serviceOrProductPageClarity),
    renderTitledList("FAQ opportunities", section.faqOpportunities),
    renderTitledList("Internal linking opportunities", section.internalLinkingOpportunities),
    renderTitledList("Missing proof and trust signals", section.missingProofTrustSignals),
    renderTitledList("Content depth gaps", section.contentDepthGaps)
  ]
    .filter(Boolean)
    .join("");
}

function renderSchemaTechnical(section) {
  if (!section) return "";
  const schemaRows = (Array.isArray(section.schemaRecommendations)
    ? section.schemaRecommendations
    : []
  )
    .map(
      (item) => `
        <div style="margin-bottom: 14px;">
          <p style="margin: 0 0 4px;"><strong>${escapeHtml(item.schemaType || "")}</strong></p>
          <p style="margin: 0 0 4px;"><strong>Where it should go:</strong> ${escapeHtml(item.whereItShouldGo || "")}</p>
          <p style="margin: 0 0 4px;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters || "")}</p>
          ${renderSimpleList(item.exampleFields || [])}
        </div>
      `
    )
    .join("");

  return [
    schemaRows,
    renderTitledList("Metadata improvements", section.metadataImprovements),
    renderTitledList("Heading structure", section.headingStructure),
    renderTitledList("Crawlability and indexability", section.crawlabilityIndexability),
    renderTitledList("Page speed notes", section.pageSpeedNotes),
    renderTitledList("Validation steps", section.validationSteps)
  ]
    .filter(Boolean)
    .join("");
}

function renderThoughtStarters(section) {
  if (!section) return "";
  return [
    renderIdeaGroup("Article ideas", section.articleIdeas),
    renderIdeaGroup("FAQ questions", section.faqQuestions),
    renderIdeaGroup("Comparison ideas", section.comparisonIdeas),
    renderIdeaGroup("Proof and case-study ideas", section.proofCaseStudyIdeas),
    renderIdeaGroup("Social and LinkedIn post ideas", section.socialLinkedInPostIdeas),
    renderIdeaGroup("AI answer-ready content blocks", section.aiAnswerReadyContentBlocks)
  ]
    .filter(Boolean)
    .join("");
}

function renderPriorityFixes(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return values
    .map(
      (item) => `
        <div style="margin-bottom: 14px;">
          <p style="margin: 0 0 4px;"><strong>${escapeHtml(item.tactic || "")}</strong> (${escapeHtml(item.priorityLevel || "Medium")})</p>
          <p style="margin: 0 0 4px;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters || "")}</p>
          <p style="margin: 0 0 4px;"><strong>How to implement:</strong> ${escapeHtml(item.howToImplement || "")}</p>
          <p style="margin: 0;"><strong>Success looks like:</strong> ${escapeHtml(item.successLooksLike || "")}</p>
        </div>
      `
    )
    .join("");
}

function renderNinetyDayPlan(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return values
    .map(
      (phase) => `
        <div style="margin-bottom: 16px;">
          <p style="margin: 0 0 4px;"><strong>${escapeHtml(phase.phase || "")}</strong></p>
          <p style="margin: 0 0 4px;"><strong>Objective:</strong> ${escapeHtml(phase.objective || "")}</p>
          ${renderTitledList("Exact tasks", phase.exactTasks)}
          <p style="margin: 0 0 4px;"><strong>Rationale:</strong> ${escapeHtml(phase.rationale || "")}</p>
          ${renderTitledList("Deliverables", phase.deliverables)}
          <p style="margin: 0;"><strong>Owner / success metric:</strong> ${escapeHtml(phase.owner || "")} / ${escapeHtml(phase.successMetric || "")}</p>
        </div>
      `
    )
    .join("");
}

function renderChecklistGroups(groups) {
  const entries = Object.entries(groups || {});
  if (!entries.length) return "";
  return entries
    .map(([group, items]) => {
      const values = Array.isArray(items) ? items : [];
      if (!values.length) return "";
      return `
        <div style="margin-bottom: 14px;">
          <p style="margin: 0 0 4px;"><strong>${escapeHtml(startCase(group))}</strong></p>
          <ul style="margin: 0; padding-left: 20px;">
            ${values
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
      `;
    })
    .join("");
}

function renderCoachingNotesV2(notes) {
  if (!notes) return "";
  return [
    renderTitledList("What to do first", notes.whatToDoFirst),
    renderTitledList("What to ignore for now", notes.whatToIgnoreForNow),
    renderTitledList("Biggest leverage areas", notes.biggestLeverageAreas),
    renderTitledList(
      "What Damon should walk through on the call",
      notes.whatDamonShouldWalkThroughOnTheCall
    )
  ]
    .filter(Boolean)
    .join("");
}

function renderTitledList(title, items) {
  const values = normalizeArray(items);
  if (!values.length) return "";
  return `<div style="margin-bottom: 12px;"><p style="margin: 0 0 4px;"><strong>${escapeHtml(title)}</strong></p>${renderSimpleList(values)}</div>`;
}

function renderPromptGroup(title, items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return `
    <div style="margin-bottom: 14px;">
      <p style="margin: 0 0 4px;"><strong>${escapeHtml(title)}</strong></p>
      <ol style="margin: 0; padding-left: 20px;">
        ${values
          .map(
            (item) => `
              <li style="margin: 0 0 8px;">
                <strong>${escapeHtml(item.prompt || "")}</strong><br />
                ${escapeHtml(item.whyItMatters || "")}<br />
                <span style="color: #5f5a53;">${escapeHtml(item.recommendedPageOrContent || "")}</span>
              </li>
            `
          )
          .join("")}
      </ol>
    </div>
  `;
}

function renderIdeaGroup(title, items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";
  return `
    <div style="margin-bottom: 14px;">
      <p style="margin: 0 0 4px;"><strong>${escapeHtml(title)}</strong></p>
      <ol style="margin: 0; padding-left: 20px;">
        ${values
          .map(
            (item) => `
              <li style="margin: 0 0 8px;">
                <strong>${escapeHtml(item.title || "")}</strong><br />
                <span>${escapeHtml(item.targetQuestionOrPrompt || "")}</span><br />
                <span>${escapeHtml(item.whyItMatters || "")}</span><br />
                <span style="color: #5f5a53;">${escapeHtml(item.suggestedCtaOrInternalLink || "")}</span>
              </li>
            `
          )
          .join("")}
      </ol>
    </div>
  `;
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

function startCase(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
