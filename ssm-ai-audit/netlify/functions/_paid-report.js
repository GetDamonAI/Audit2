const { createImplementationPlanSeed } = require("./_implementation-plan");
const {
  escapeHtml,
  getAuditBookingUrl,
  getAuditNotificationTo,
  sendResendEmail
} = require("./_paid-utils");

const DEFAULT_MODEL = process.env.PAID_REPORT_OPENAI_MODEL || "gpt-4o";

async function generatePaidReport({
  openAiKey,
  pageSpeedKey,
  serperKey,
  session,
  intake
}) {
  const metadata = session?.metadata || {};
  const url = normalizeUrl(metadata.url || "");
  const businessName = String(metadata.businessName || "").trim() || getHostname(url);

  const homepageHtml = await fetchHtml(url);
  const htmlChecks = getHtmlChecks(homepageHtml);
  const pageSpeed = pageSpeedKey ? await getPageSpeed(url, pageSpeedKey) : null;
  const serper = serperKey ? await getSerperSignals(metadata, businessName, url, serperKey) : null;
  const implementationPlanSeed = createImplementationPlanSeed({ metadata, intake });

  const prompt = buildPaidReportPrompt({
    url,
    businessName,
    metadata,
    intake,
    htmlChecks,
    pageSpeed,
    serper,
    implementationPlanSeed
  });

  const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You create premium AI visibility audits and implementation plans. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const openAiJson = await openAiResponse.json();

  if (!openAiResponse.ok) {
    throw new Error(openAiJson.error?.message || "Paid report generation failed.");
  }

  const raw = openAiJson.choices?.[0]?.message?.content || "{}";
  const cleaned = raw
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Paid report generation returned invalid JSON.");
  }

  return finalizePaidReport({
    parsed,
    url,
    businessName,
    metadata,
    intake,
    implementationPlanSeed,
    htmlChecks,
    pageSpeed,
    serper
  });
}

function finalizePaidReport({
  parsed,
  url,
  businessName,
  metadata,
  intake,
  implementationPlanSeed,
  htmlChecks,
  pageSpeed,
  serper
}) {
  const report = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    url,
    businessName,
    quickAuditScore: Number(metadata.quickAuditScore ?? 0),
    quickAuditStatus: String(metadata.aiVerdict || "").trim(),
    quickAuditSummary: String(metadata.summary || "").trim(),
    intake,
    signals: {
      structure: {
        titleTag: htmlChecks.hasTitle,
        metaDescription: htmlChecks.hasMetaDescription,
        h1: htmlChecks.hasH1,
        canonical: htmlChecks.hasCanonical,
        schema: htmlChecks.hasSchema,
        noindex: htmlChecks.hasNoindex
      },
      pageSpeed: pageSpeed?.score ?? null,
      searchPresence: serper?.presence || "Unavailable",
      searchQuery: serper?.query || ""
    },
    executiveSummary: normalizeExecutiveSummary(parsed.executiveSummary),
    aiVisibilityDiagnosis: normalizeDiagnosis(parsed.aiVisibilityDiagnosis),
    priorityActions: normalizePriorityActions(parsed.priorityActions),
    tacticalRecommendations: normalizeRecommendations(
      parsed.tacticalRecommendations,
      implementationPlanSeed.recommendations
    ),
    workstreams: normalizeWorkstreams(parsed.workstreams, implementationPlanSeed.recommendations),
    sixtyDayCalendar: normalizeCalendar(parsed.sixtyDayCalendar),
    implementationPlanSeed
  };

  return report;
}

function buildPaidReportPrompt({
  url,
  businessName,
  metadata,
  intake,
  htmlChecks,
  pageSpeed,
  serper,
  implementationPlanSeed
}) {
  return `
You are creating a premium paid deliverable:
"AI Visibility Audit + Implementation Plan"

This is for a real paying client, so the output should feel thoughtful, practical, prioritized, and tailored.
Do not write generic SEO filler. Focus on AI search visibility, answer-engine recommendation readiness, and implementation clarity.

BUSINESS
- Website: ${url}
- Business name: ${businessName}
- Industry: ${metadata.industry || ""}
- Core service: ${metadata.service || ""}
- Quick audit score: ${metadata.quickAuditScore || 0}
- Quick audit status: ${metadata.aiVerdict || ""}
- Quick audit summary: ${metadata.summary || ""}

INTAKE CONTEXT
- Primary business goal: ${intake.businessGoal || ""}
- Top services or products: ${intake.topServices || ""}
- Top priority pages: ${intake.priorityPages || ""}
- Target locations: ${intake.targetLocations || ""}
- Top competitors: ${intake.topCompetitors || ""}
- Blog/resources section: ${intake.hasBlog || ""}
- CMS/platform: ${intake.cmsPlatform || ""}
- Can edit code/schema: ${intake.canEditCode || ""}
- Internal marketing support: ${intake.marketingSupport || ""}
- Specific report questions: ${intake.reportQuestions || ""}
- AI question targeting: ${intake.aiQuestionTargeting || ""}
- Customer intent before choosing: ${intake.customerIntent || ""}
- Desired AI visibility: ${intake.desiredVisibility || ""}
- Differentiation: ${intake.differentiation || ""}
- Conversion goal: ${intake.conversionGoal || ""}
- Content maturity: ${intake.contentMaturity || ""}

AVAILABLE SIGNALS
- Has title tag: ${htmlChecks.hasTitle}
- Has meta description: ${htmlChecks.hasMetaDescription}
- Has H1: ${htmlChecks.hasH1}
- Has schema: ${htmlChecks.hasSchema}
- Has canonical: ${htmlChecks.hasCanonical}
- Has noindex: ${htmlChecks.hasNoindex}
- PageSpeed mobile score: ${pageSpeed?.score ?? "Unknown"}
- Search presence: ${serper?.presence || "Unavailable"}
- Search query checked: ${serper?.query || "Unavailable"}
- Brand found in search results: ${serper?.brandFound ?? "Unknown"}
- Organic result count checked: ${serper?.organicCount ?? 0}
- People Also Ask count checked: ${serper?.paaCount ?? 0}

IMPLEMENTATION PLAN SEED
${JSON.stringify(implementationPlanSeed, null, 2)}

OUTPUT RULES
- Return valid JSON only.
- Tailor the report to the intake and the site signals.
- Be practical, not theoretical.
- Every recommendation should explain what to change and how to implement it.
- Use AI-search-native language: entity clarity, answer readiness, citation readiness, trust signals, recommendation likelihood, question-led coverage.
- Make the 60-day plan realistic for a small business or lean marketing team.
- Priority actions should be ranked from highest leverage to lowest.
- Tactical recommendations should be specific enough that Damon could walk the client through them.

RETURN JSON IN THIS EXACT SHAPE:
{
  "executiveSummary": {
    "overallDiagnosis": "string",
    "whatIsHelping": ["string", "string", "string"],
    "whatIsHurting": ["string", "string", "string"],
    "biggestOpportunities": ["string", "string", "string"],
    "whatMattersFirst": "string"
  },
  "aiVisibilityDiagnosis": [
    {
      "area": "Entity clarity",
      "diagnosis": "string",
      "whyItMattersForAiSearch": "string",
      "severity": "High|Medium|Low",
      "whatItMeans": "string"
    }
  ],
  "priorityActions": [
    {
      "title": "string",
      "whyItMatters": "string",
      "expectedImpact": "string",
      "difficulty": "Low|Medium|High",
      "recommendedOwner": "string"
    }
  ],
  "tacticalRecommendations": [
    {
      "title": "string",
      "workstream": "string",
      "diagnosis": "string",
      "whyItMattersForAiSearch": "string",
      "whatToChange": "string",
      "stepByStepImplementation": ["string", "string", "string"],
      "examplesOrTemplates": ["string", "string"],
      "timeline": "string",
      "priority": "High|Medium|Low"
    }
  ],
  "workstreams": [
    {
      "title": "Technical fixes",
      "summary": "string",
      "items": ["string", "string", "string"]
    }
  ],
  "sixtyDayCalendar": [
    {
      "phase": "Days 1–14",
      "items": [
        {
          "task": "string",
          "whyItMatters": "string",
          "expectedOutcome": "string",
          "suggestedOwner": "string"
        }
      ]
    }
  ]
}
`;
}

async function sendPaidReportEmails({ resendKey, report, session }) {
  const customerEmail = session.customer_details?.email || session.customer_email || "";
  const bookingUrl = getAuditBookingUrl();
  const sends = [];

  if (customerEmail) {
    sends.push(
      sendResendEmail({
        resendKey,
        to: customerEmail,
        subject: `Your Full AI Visibility Audit + Implementation Plan${report.businessName ? ` - ${report.businessName}` : ""}`,
        html: renderCustomerPaidReportEmail({ report, bookingUrl })
      })
    );
  }

  sends.push(
    sendResendEmail({
      resendKey,
      to: getAuditNotificationTo(),
      subject: `Paid Report Delivered - ${report.businessName || report.url}`,
      html: renderInternalPaidReportEmail({ report, customerEmail, bookingUrl })
    })
  );

  const results = await Promise.all(sends);
  if (results.some((result) => !result.ok)) {
    throw new Error("Paid report email delivery failed.");
  }

  return {
    deliveredToCustomer: Boolean(customerEmail),
    deliveredToInternal: true
  };
}

async function sendPaidReportFailureEmail({ resendKey, session, errorMessage }) {
  return sendResendEmail({
    resendKey,
    to: getAuditNotificationTo(),
    subject: `Paid Report Generation Failed - ${session?.metadata?.businessName || session?.metadata?.url || session?.id || "Unknown"}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding:24px; max-width:720px; margin:0 auto;">
        <h2 style="margin:0 0 12px;">Paid Report Generation Failed</h2>
        <p><strong>Website:</strong> ${escapeHtml(session?.metadata?.url || "Unknown")}</p>
        <p><strong>Business:</strong> ${escapeHtml(session?.metadata?.businessName || "Unknown")}</p>
        <p><strong>Customer Email:</strong> ${escapeHtml(session?.customer_details?.email || session?.customer_email || "Unknown")}</p>
        <p><strong>Stripe Session:</strong> ${escapeHtml(session?.id || "Unknown")}</p>
        <p><strong>Error:</strong> ${escapeHtml(errorMessage || "Unknown error")}</p>
      </div>
    `
  });
}

function renderCustomerPaidReportEmail({ report, bookingUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f7f5f2; padding:24px 16px;">
      <div style="max-width:760px; margin:0 auto; background:#ffffff; border:1px solid rgba(23,23,23,0.08); border-radius:24px; padding:32px 28px;">
        <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">AI Visibility Audit</p>
        <h2 style="margin:0 0 12px; font-size:34px; line-height:1.05; color:#1a1a1a;">Your full AI Visibility Audit + Implementation Plan is ready</h2>
        <p style="margin:0 0 20px; font-size:16px; line-height:1.6; color:#555555;">
          We’ve finished the deeper report for ${escapeHtml(report.businessName || report.url)}. Below you’ll find the diagnosis, the priority actions, the tactical recommendations, and the 60-day rollout plan.
        </p>

        ${renderExecutiveSummarySection(report.executiveSummary)}
        ${renderDiagnosisSection(report.aiVisibilityDiagnosis)}
        ${renderPriorityActionsSection(report.priorityActions)}
        ${renderRecommendationsSection(report.tacticalRecommendations)}
        ${renderWorkstreamsSection(report.workstreams)}
        ${renderCalendarSection(report.sixtyDayCalendar)}

        <div style="margin-top:28px; padding-top:24px; border-top:1px solid rgba(23,23,23,0.08);">
          <p style="margin:0 0 14px; font-size:16px; line-height:1.55; color:#555555;">
            Next step: book your coaching session so Damon can walk through the report with you and help you decide what to tackle first.
          </p>
          <p style="margin:0;">
            <a href="${escapeHtml(bookingUrl)}" style="display:inline-block; padding:14px 22px; background:#232323; color:#ffffff; text-decoration:none; border-radius:999px; font-weight:600; border:1px solid #232323;">
              Book My Coaching Session
            </a>
          </p>
        </div>

        <p style="margin:28px 0 0; font-size:14px; line-height:1.6; color:#777777;">
          Generated for ${escapeHtml(report.url)} on ${escapeHtml(formatDate(report.generatedAt))}.
        </p>
      </div>
    </div>
  `;
}

function renderInternalPaidReportEmail({ report, customerEmail, bookingUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; padding:24px; max-width:760px; margin:0 auto;">
      <h2 style="margin:0 0 12px;">Paid Report Delivered</h2>
      <p><strong>Website:</strong> ${escapeHtml(report.url)}</p>
      <p><strong>Business:</strong> ${escapeHtml(report.businessName || "Unknown")}</p>
      <p><strong>Customer Email:</strong> ${escapeHtml(customerEmail || "Unknown")}</p>
      <p><strong>Quick Audit Score:</strong> ${escapeHtml(String(report.quickAuditScore || 0))}</p>
      <p><strong>Quick Audit Status:</strong> ${escapeHtml(report.quickAuditStatus || "Not available")}</p>
      <p><strong>Booking URL:</strong> <a href="${escapeHtml(bookingUrl)}">${escapeHtml(bookingUrl)}</a></p>
      ${renderExecutiveSummarySection(report.executiveSummary)}
      ${renderPriorityActionsSection(report.priorityActions)}
      ${renderCalendarSection(report.sixtyDayCalendar)}
    </div>
  `;
}

function renderExecutiveSummarySection(summary) {
  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">Executive Summary</p>
      <p style="margin:0 0 12px; font-size:16px; line-height:1.6; color:#1a1a1a;">${escapeHtml(summary.overallDiagnosis)}</p>
      ${renderBullets("What is helping", summary.whatIsHelping)}
      ${renderBullets("What is hurting", summary.whatIsHurting)}
      ${renderBullets("Biggest opportunities", summary.biggestOpportunities)}
      <p style="margin:14px 0 0; font-size:16px; line-height:1.6; color:#1a1a1a;"><strong>What matters first:</strong> ${escapeHtml(summary.whatMattersFirst)}</p>
    </div>
  `;
}

function renderDiagnosisSection(items) {
  const rows = items.map((item) => `
    <div style="padding-top:16px; margin-top:16px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 6px; font-size:18px; line-height:1.4; color:#1a1a1a;"><strong>${escapeHtml(item.area)}</strong> <span style="color:#777777; font-size:14px;">${escapeHtml(item.severity)}</span></p>
      <p style="margin:0 0 8px; font-size:16px; line-height:1.6; color:#1a1a1a;">${escapeHtml(item.diagnosis)}</p>
      <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>Why it matters for AI search:</strong> ${escapeHtml(item.whyItMattersForAiSearch)}</p>
      <p style="margin:0; font-size:15px; line-height:1.6; color:#555555;"><strong>What it means:</strong> ${escapeHtml(item.whatItMeans)}</p>
    </div>
  `).join("");

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">AI Visibility Diagnosis</p>
      ${rows}
    </div>
  `;
}

function renderPriorityActionsSection(actions) {
  const items = actions.map((action) => `
    <li style="margin:0 0 14px;">
      <strong>${escapeHtml(action.title)}</strong><br />
      <span style="color:#555555;">${escapeHtml(action.whyItMatters)}</span><br />
      <span style="color:#777777;">Impact: ${escapeHtml(action.expectedImpact)} | Difficulty: ${escapeHtml(action.difficulty)} | Owner: ${escapeHtml(action.recommendedOwner)}</span>
    </li>
  `).join("");

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">Priority Actions</p>
      <ol style="margin:0; padding-left:20px; font-size:16px; line-height:1.6; color:#1a1a1a;">${items}</ol>
    </div>
  `;
}

function renderRecommendationsSection(recommendations) {
  const sections = recommendations.map((recommendation) => `
    <div style="padding-top:16px; margin-top:16px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 6px; font-size:18px; line-height:1.4; color:#1a1a1a;"><strong>${escapeHtml(recommendation.title)}</strong></p>
      <p style="margin:0 0 6px; font-size:14px; line-height:1.5; color:#777777;">${escapeHtml(recommendation.workstream)} | ${escapeHtml(recommendation.priority)} priority | ${escapeHtml(recommendation.timeline)}</p>
      <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>Diagnosis:</strong> ${escapeHtml(recommendation.diagnosis)}</p>
      <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>Why it matters for AI search:</strong> ${escapeHtml(recommendation.whyItMattersForAiSearch)}</p>
      <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>What to change:</strong> ${escapeHtml(recommendation.whatToChange)}</p>
      ${renderBullets("Step-by-step implementation", recommendation.stepByStepImplementation)}
      ${renderBullets("Examples and templates", recommendation.examplesOrTemplates)}
    </div>
  `).join("");

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">Tactical Recommendations</p>
      ${sections}
    </div>
  `;
}

function renderWorkstreamsSection(workstreams) {
  const sections = workstreams.map((workstream) => `
    <div style="padding-top:16px; margin-top:16px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 6px; font-size:18px; line-height:1.4; color:#1a1a1a;"><strong>${escapeHtml(workstream.title)}</strong></p>
      <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;">${escapeHtml(workstream.summary)}</p>
      ${renderBullets("Focus areas", workstream.items)}
    </div>
  `).join("");

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">Detailed Implementation Plan</p>
      ${sections}
    </div>
  `;
}

function renderCalendarSection(phases) {
  const sections = phases.map((phase) => {
    const items = phase.items.map((item) => `
      <li style="margin:0 0 12px;">
        <strong>${escapeHtml(item.task)}</strong><br />
        <span style="color:#555555;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</span><br />
        <span style="color:#555555;"><strong>Expected outcome:</strong> ${escapeHtml(item.expectedOutcome)}</span><br />
        <span style="color:#777777;"><strong>Suggested owner:</strong> ${escapeHtml(item.suggestedOwner)}</span>
      </li>
    `).join("");

    return `
      <div style="padding-top:16px; margin-top:16px; border-top:1px solid rgba(23,23,23,0.08);">
        <p style="margin:0 0 8px; font-size:18px; line-height:1.4; color:#1a1a1a;"><strong>${escapeHtml(phase.phase)}</strong></p>
        <ol style="margin:0; padding-left:20px; font-size:15px; line-height:1.6; color:#1a1a1a;">${items}</ol>
      </div>
    `;
  }).join("");

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">60-Day Rollout Plan</p>
      ${sections}
    </div>
  `;
}

function renderBullets(title, items) {
  const values = Array.isArray(items) ? items.filter((item) => String(item || "").trim()) : [];
  if (!values.length) return "";

  return `
    <div style="margin-top:12px;">
      <p style="margin:0 0 6px; font-size:14px; line-height:1.5; color:#777777; text-transform:uppercase; letter-spacing:0.08em;">${escapeHtml(title)}</p>
      <ul style="margin:0; padding-left:20px; font-size:15px; line-height:1.6; color:#555555;">
        ${values.map((item) => `<li style="margin:0 0 8px;">${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function normalizeExecutiveSummary(summary) {
  return {
    overallDiagnosis: String(summary?.overallDiagnosis || "The site has real AI visibility potential, but the current signals are not yet strong enough to maximize recommendation confidence.").trim(),
    whatIsHelping: normalizeStringArray(summary?.whatIsHelping, 3),
    whatIsHurting: normalizeStringArray(summary?.whatIsHurting, 3),
    biggestOpportunities: normalizeStringArray(summary?.biggestOpportunities, 3),
    whatMattersFirst: String(summary?.whatMattersFirst || "Tighten entity clarity, strengthen question-led coverage, and make the priority pages easier for AI systems to trust and cite.").trim()
  };
}

function normalizeDiagnosis(items) {
  const defaults = [
    "Entity clarity",
    "Site structure",
    "Content clarity",
    "Search visibility",
    "Trust and authority signals",
    "Question-answer readiness",
    "Technical accessibility",
    "Recommendation likelihood"
  ];

  const values = Array.isArray(items) ? items : [];
  const normalized = values.map((item) => ({
    area: String(item?.area || "AI visibility area").trim(),
    diagnosis: String(item?.diagnosis || "This area needs clearer signals before AI systems can rely on it confidently.").trim(),
    whyItMattersForAiSearch: String(item?.whyItMattersForAiSearch || "AI systems look for clear, trustworthy signals before surfacing and recommending brands.").trim(),
    severity: normalizeSeverity(item?.severity),
    whatItMeans: String(item?.whatItMeans || "This weakens how often and how confidently the site can appear in AI-led discovery.").trim()
  }));

  defaults.forEach((area) => {
    if (!normalized.some((item) => item.area.toLowerCase() === area.toLowerCase())) {
      normalized.push({
        area,
        diagnosis: "This area needs stronger signals to support broader AI visibility and recommendation confidence.",
        whyItMattersForAiSearch: "AI systems rely on stronger structure, clarity, and trust cues to decide what to surface.",
        severity: "Medium",
        whatItMeans: "Improving this area would make the site easier to understand, quote, and recommend."
      });
    }
  });

  return normalized.slice(0, 8);
}

function normalizePriorityActions(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) {
    return [
      {
        title: "Strengthen the highest-value entity and service pages first",
        whyItMatters: "These pages shape how AI systems interpret the business and whether they can recommend it confidently.",
        expectedImpact: "Higher clarity and stronger recommendation readiness on the pages that matter most.",
        difficulty: "Medium",
        recommendedOwner: "Founder or marketing lead"
      }
    ];
  }

  return values.slice(0, 8).map((item) => ({
    title: String(item?.title || "Priority action").trim(),
    whyItMatters: String(item?.whyItMatters || "This improves AI visibility in a meaningful way.").trim(),
    expectedImpact: String(item?.expectedImpact || "Improved discoverability and recommendation likelihood.").trim(),
    difficulty: normalizeDifficulty(item?.difficulty),
    recommendedOwner: String(item?.recommendedOwner || "Marketing lead").trim()
  }));
}

function normalizeRecommendations(items, fallbackRecommendations) {
  const values = Array.isArray(items) ? items : [];
  const normalized = values.map((item) => ({
    title: String(item?.title || "Recommendation").trim(),
    workstream: String(item?.workstream || "AI Visibility").trim(),
    diagnosis: String(item?.diagnosis || "This gap is limiting AI visibility and recommendation confidence.").trim(),
    whyItMattersForAiSearch: String(item?.whyItMattersForAiSearch || "AI systems need clearer and more trustworthy signals before they cite or recommend a business.").trim(),
    whatToChange: String(item?.whatToChange || "Clarify and strengthen the signals tied to this issue.").trim(),
    stepByStepImplementation: normalizeStringArray(item?.stepByStepImplementation, 4),
    examplesOrTemplates: normalizeStringArray(item?.examplesOrTemplates, 3),
    timeline: String(item?.timeline || "Days 1–30").trim(),
    priority: normalizeSeverity(item?.priority)
  }));

  if (normalized.length) {
    return normalized.slice(0, 10);
  }

  return fallbackRecommendations.slice(0, 5).map((recommendation) => ({
    title: recommendation.title,
    workstream: recommendation.workstream,
    diagnosis: recommendation.diagnosis,
    whyItMattersForAiSearch: recommendation.whyItMattersForAiSearch,
    whatToChange: recommendation.whatToChange,
    stepByStepImplementation: recommendation.stepByStepInstructions,
    examplesOrTemplates: recommendation.examplesOrTemplates,
    timeline: recommendation.timeline,
    priority: recommendation.priority
  }));
}

function normalizeWorkstreams(workstreams, fallbackRecommendations) {
  const values = Array.isArray(workstreams) ? workstreams : [];
  if (values.length) {
    return values.slice(0, 8).map((item) => ({
      title: String(item?.title || "Workstream").trim(),
      summary: String(item?.summary || "This workstream supports stronger AI visibility and implementation follow-through.").trim(),
      items: normalizeStringArray(item?.items, 4)
    }));
  }

  const grouped = fallbackRecommendations.reduce((acc, recommendation) => {
    const key = recommendation.workstream || "Implementation";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(recommendation.title);
    return acc;
  }, {});

  return Object.entries(grouped).map(([title, items]) => ({
    title,
    summary: "This workstream groups together related improvements that support stronger AI visibility and recommendation readiness.",
    items
  }));
}

function normalizeCalendar(items) {
  const values = Array.isArray(items) ? items : [];
  const phases = ["Days 1–14", "Days 15–30", "Days 31–45", "Days 46–60"];
  const normalized = values.map((phase) => ({
    phase: String(phase?.phase || "").trim(),
    items: Array.isArray(phase?.items)
      ? phase.items.map((item) => ({
          task: String(item?.task || "Planned action").trim(),
          whyItMatters: String(item?.whyItMatters || "This supports stronger AI visibility and implementation progress.").trim(),
          expectedOutcome: String(item?.expectedOutcome || "Better clarity and readiness for recommendation.").trim(),
          suggestedOwner: String(item?.suggestedOwner || "Marketing lead").trim()
        }))
      : []
  }));

  phases.forEach((phase) => {
    if (!normalized.some((item) => item.phase === phase)) {
      normalized.push({
        phase,
        items: [
          {
            task: "Review the highest-priority recommendations and assign ownership",
            whyItMatters: "Execution clarity is what turns the report into measurable gains.",
            expectedOutcome: "The business knows what to do next and who owns it.",
            suggestedOwner: "Founder or marketing lead"
          }
        ]
      });
    }
  });

  return normalized
    .filter((phase) => phase.items.length)
    .slice(0, 4);
}

function normalizeStringArray(items, max) {
  const values = Array.isArray(items)
    ? items.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return values.slice(0, max);
}

function normalizeSeverity(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return "Medium";
}

function normalizeDifficulty(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return "Medium";
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SemanticSearchMarketingAudit/1.0)"
      },
      signal: controller.signal
    });
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function getHtmlChecks(html) {
  const hasTitle = /<title[^>]*>[\s\S]*?<\/title>/i.test(html);
  const hasMetaDescription = /<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i.test(html);
  const hasH1 = /<h1[^>]*>[\s\S]*?<\/h1>/i.test(html);
  const hasCanonical = /<link[^>]+rel=["']canonical["'][^>]*href=["'][^"']+["'][^>]*>/i.test(html);
  const hasSchema = /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i.test(html);
  const hasNoindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);

  return {
    hasTitle,
    hasMetaDescription,
    hasH1,
    hasCanonical,
    hasSchema,
    hasNoindex
  };
}

async function getPageSpeed(url, apiKey) {
  try {
    const params = new URLSearchParams({
      url,
      strategy: "mobile",
      category: "performance",
      key: apiKey
    });

    const response = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`
    );
    const json = await response.json();
    const score = json?.lighthouseResult?.categories?.performance?.score;
    return {
      score: typeof score === "number" ? Math.round(score * 100) : null
    };
  } catch {
    return null;
  }
}

async function getSerperSignals(metadata, businessName, url, apiKey) {
  const hostname = getHostname(url);
  const query = `${metadata.service || businessName || hostname} ${metadata.industry || ""}`.trim();

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: query,
        num: 10
      })
    });

    const json = await response.json();
    const organic = json.organic || [];
    const peopleAlsoAsk = json.peopleAlsoAsk || [];
    const brandFound = organic.some((item) => {
      const link = String(item.link || "").toLowerCase();
      const title = String(item.title || "").toLowerCase();
      return link.includes(hostname) || title.includes(String(businessName || "").toLowerCase());
    });

    return {
      query,
      organicCount: organic.length,
      paaCount: peopleAlsoAsk.length,
      brandFound,
      presence: brandFound ? "Found in search results" : "Not found in top results"
    };
  } catch {
    return {
      query,
      organicCount: 0,
      paaCount: 0,
      brandFound: false,
      presence: "Unavailable"
    };
  }
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return value;
  }
}

module.exports = {
  generatePaidReport,
  sendPaidReportEmails,
  sendPaidReportFailureEmail
};
