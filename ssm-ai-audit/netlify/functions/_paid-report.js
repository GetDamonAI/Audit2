const { createImplementationPlanSeed } = require("./_implementation-plan");
const {
  escapeHtml,
  getAuditBookingUrl,
  getAuditNotificationTo,
  sendResendEmail
} = require("./_paid-utils");
const {
  collectSiteIntelligence,
  getHostname: getSharedHostname,
  normalizeUrl: normalizeSharedUrl
} = require("./_site-intelligence");

const DEFAULT_MODEL = process.env.PAID_REPORT_OPENAI_MODEL || "gpt-4o";

async function generatePaidReport({
  openAiKey,
  pageSpeedKey,
  serperKey,
  session,
  intake
}) {
  const metadata = session?.metadata || {};
  const url = normalizeSharedUrl(intake.website || metadata.url || "");
  const businessName = String(metadata.businessName || "").trim() || getSharedHostname(url);
  const serviceSeed = String(intake.topServices || metadata.service || "").trim();
  const siteIntelligence = await collectSiteIntelligence({
    url,
    businessName,
    industry: metadata.industry || "",
    service: serviceSeed,
    competitors: intake.topCompetitors || "",
    targetLocations: intake.targetLocations || "",
    aiQuestionTargeting: intake.aiQuestionTargeting || "",
    desiredVisibility: intake.desiredVisibility || "",
    serperKey
  });
  const htmlChecks = siteIntelligence.htmlChecks;
  const pageSpeed = pageSpeedKey ? await getPageSpeed(url, pageSpeedKey) : null;
  const serper = siteIntelligence.serper;
  const crawl = siteIntelligence.crawl;
  const implementationPlanSeed = createImplementationPlanSeed({ metadata, intake });

  const prompt = buildPaidReportPrompt({
    url,
    businessName,
    metadata,
    intake,
    htmlChecks,
    pageSpeed,
    serper,
    crawl,
    implementationPlanSeed
  });

  console.log("PAID REPORT PROMPT UPGRADED: using comprehensive strategy plan");

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
    serper,
    crawl
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
  serper,
  crawl
}) {
  const executiveSummary = normalizeExecutiveSummaryV2(parsed.executiveSummary, businessName);
  const aiVisibilityDiagnosis = normalizeAiVisibilityDiagnosisV2(parsed.aiVisibilityDiagnosis);
  const searchIntentPromptMap = normalizeSearchIntentPromptMap(parsed.searchIntentPromptMap, {
    businessName,
    priorityPages: intake.priorityPages || "",
    questionsToShowUpFor: intake.aiQuestionTargeting || intake.questionsToShowUpFor || ""
  });
  const websiteContentFindings = normalizeWebsiteContentFindings(parsed.websiteContentFindings);
  const schemaTechnicalRecommendations = normalizeSchemaTechnicalRecommendations(
    parsed.schemaTechnicalRecommendations
  );
  const contentThoughtStarters = normalizeContentThoughtStarters(
    parsed.contentThoughtStarters,
    {
      website: url,
      conversionGoal: intake.conversionGoal || "",
      priorityPages: intake.priorityPages || "",
      topServices: intake.topServices || ""
    }
  );
  const priorityFixes = normalizePriorityFixes(
    parsed.priorityFixes,
    implementationPlanSeed.recommendations
  );
  const ninetyDayImplementationPlan = normalizeNinetyDayImplementationPlan(
    parsed.ninetyDayImplementationPlan,
    implementationPlanSeed.recommendations
  );
  const implementationChecklist = normalizeImplementationChecklistV2(
    parsed.implementationChecklist
  );
  const coachingNotes = normalizeCoachingNotesV2(parsed.coachingNotes);
  const assumptions = normalizeStringArray(parsed.assumptions, 10);
  const signals = {
    structure: {
      titleTag: htmlChecks.hasTitle,
      metaDescription: htmlChecks.hasMetaDescription,
      h1: htmlChecks.hasH1,
      canonical: htmlChecks.hasCanonical,
      schema: htmlChecks.hasSchema,
      noindex: htmlChecks.hasNoindex,
      schemaTypes: htmlChecks.schemaTypes || []
    },
    pageSpeed: pageSpeed?.score ?? null,
    searchPresence: serper?.presence || "Unavailable",
    searchQuery: serper?.query || "",
    searchQueries: serper?.queries || [],
    crawlSummary: crawl.summary,
    schemaSummary: crawl.schema,
    contentDepth: crawl.contentDepth
  };
  const scorecard = buildPaidReportScorecard({
    businessName,
    intake,
    signals,
    executiveSummary,
    aiVisibilityDiagnosis,
    searchIntentPromptMap,
    websiteContentFindings,
    schemaTechnicalRecommendations
  });

  const report = {
    reportVersion: 2,
    generatedAt: new Date().toISOString(),
    url,
    businessName,
    quickAuditScore: Number(metadata.quickAuditScore ?? 0),
    quickAuditStatus: String(metadata.aiVerdict || "").trim(),
    quickAuditSummary: String(metadata.summary || "").trim(),
    overallScore: scorecard.overallScore,
    scoreBreakdown: scorecard.scoreBreakdown,
    intake,
    signals,
    assumptions,
    executiveSummary,
    aiVisibilityDiagnosis,
    searchIntentPromptMap,
    websiteContentFindings,
    schemaTechnicalRecommendations,
    contentThoughtStarters,
    priorityFixes,
    ninetyDayImplementationPlan,
    implementationChecklist,
    coachingNotes,
    opportunityMap: flattenPromptMap(searchIntentPromptMap),
    priorityActions: mapPriorityFixesToLegacy(priorityFixes),
    tacticalRecommendations: mapRecommendationsToLegacy({
      websiteContentFindings,
      schemaTechnicalRecommendations,
      contentThoughtStarters,
      fallbackRecommendations: implementationPlanSeed.recommendations
    }),
    workstreams: mapWorkstreamsToLegacy({
      ninetyDayImplementationPlan,
      fallbackRecommendations: implementationPlanSeed.recommendations
    }),
    sixtyDayCalendar: mapCalendarToLegacy(ninetyDayImplementationPlan),
    quickWins: priorityFixes
      .filter((item) => item.priorityLevel === "High")
      .slice(0, 6)
      .map((item) => item.tactic),
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
  crawl,
  implementationPlanSeed
}) {
  const crawlSnapshot = crawl.pages.slice(0, 12).map((page) => ({
    url: page.url,
    pageType: page.pageType,
    path: page.path,
    title: page.title,
    metaDescription: page.metaDescription,
    h1: page.headings?.h1?.slice(0, 2) || [],
    h2: page.headings?.h2?.slice(0, 4) || [],
    wordCount: page.wordCount,
    internalLinkCount: page.internalLinkCount,
    questionCount: page.questionCount,
    questionStyleHeadings: page.questionStyleHeadings?.slice(0, 4) || [],
    schemaTypes: page.schemaTypes
  }));
  const serpSnapshot = (serper?.queries || []).map((query) => ({
    label: query.label,
    query: query.query,
    brandFound: query.brandFound,
    rankPosition: query.rankPosition,
    competitorOverlap: query.competitorOverlap,
    topResults: (query.topResults || []).slice(0, 5)
  }));

  return `
You are creating a premium paid deliverable:
"AI Visibility Audit + Implementation Plan"

This is for a real paying client, so the output should feel like a strategist wrote it: thoughtful, practical, prioritized, and tailored.
Do not write generic SEO filler. Focus on AI search visibility, answer-engine recommendation readiness, implementation clarity, and commercial usefulness.

BUSINESS
- Website: ${url}
- Business name: ${businessName}
- Industry: ${metadata.industry || ""}
- Core service: ${metadata.service || ""}
- Quick audit score: ${metadata.quickAuditScore || 0}
- Quick audit status: ${metadata.aiVerdict || ""}
- Quick audit summary: ${metadata.summary || ""}

INTAKE CONTEXT
- What they are trying to sell or inform people about: ${intake.businessGoal || ""}
- Ideal customer: ${intake.idealCustomer || ""}
- Top services or products: ${intake.topServices || ""}
- Key pages or services to drive traffic to: ${intake.priorityPages || ""}
- Target locations: ${intake.targetLocations || ""}
- Main competitors: ${intake.topCompetitors || ""}
- Blog/resources section: ${intake.hasBlog || ""}
- CMS/platform: ${intake.cmsPlatform || ""}
- Can edit code/schema: ${intake.canEditCode || ""}
- Internal marketing support: ${intake.marketingSupport || ""}
- Questions they want to show up for in AI: ${intake.aiQuestionTargeting || ""}
- Current marketing focus: ${intake.currentMarketingFocus || ""}
- Biggest challenge right now: ${intake.biggestChallenge || ""}
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
- Homepage schema types: ${(htmlChecks.schemaTypes || []).join(", ") || "None detected"}
- Has canonical: ${htmlChecks.hasCanonical}
- Has noindex: ${htmlChecks.hasNoindex}
- PageSpeed mobile score: ${pageSpeed?.score ?? "Unknown"}
- Search presence: ${serper?.presence || "Unavailable"}
- Search query checked: ${serper?.query || "Unavailable"}
- Brand found in search results: ${serper?.brandFound ?? "Unknown"}
- Best rank found: ${serper?.bestRank ?? "Not found"}
- Organic result count checked: ${serper?.organicCount ?? 0}
- People Also Ask count checked: ${serper?.paaCount ?? 0}

SITE CRAWL SUMMARY
- Pages crawled: ${crawl.summary?.pagesCrawled ?? 0}
- Average word count: ${crawl.summary?.averageWordCount ?? 0}
- Pages with question signals: ${crawl.summary?.pagesWithQuestions ?? 0}
- Pages with strong heading structure: ${crawl.summary?.pagesWithStrongHeadings ?? 0}
- Pages with schema: ${crawl.summary?.pagesWithSchema ?? 0}
- Sitewide schema types: ${(crawl.schema?.schemaTypes || []).join(", ") || "None detected"}
- Schema missing opportunities: ${(crawl.schema?.missingOpportunities || []).join(" | ") || "No obvious opportunities inferred"}
- Content depth score: ${crawl.contentDepth?.score ?? 0}/100
- Content depth read: ${crawl.contentDepth?.summary || "Unavailable"}
- Question-answer readiness: ${crawl.contentDepth?.questionAnswerReadiness ?? 0}/100
- Service-page clarity: ${crawl.contentDepth?.servicePageClarity ?? 0}/100
- Topic cluster maturity: ${crawl.contentDepth?.topicClusterMaturity ?? 0}/100

CRAWLED PAGE SNAPSHOT
${JSON.stringify(crawlSnapshot, null, 2)}

SEARCH PRESENCE ACROSS MULTIPLE QUERY TYPES
${JSON.stringify(serpSnapshot, null, 2)}

IMPLEMENTATION PLAN SEED
${JSON.stringify(implementationPlanSeed, null, 2)}

OUTPUT RULES
- Return valid JSON only.
- Tailor the report to the intake and the site signals.
- Be practical, not theoretical.
- Make the report feel premium, strategic, and actionable enough to justify a paid engagement.
- Use the crawl, schema, content-depth, and multi-query search signals to make the report more specific.
- Reference actual services/products from the intake when making recommendations.
- Reference specific crawled URLs or page types when recommending fixes.
- Reference missing schema types or schema opportunities when relevant.
- Reference actual query patterns, rank gaps, and competitor overlap from the search snapshot when relevant.
- Reference AI question targeting and desired visibility themes when recommending question-led content.
- Every recommendation should explain what to change and how to implement it.
- Use AI-search-native language: entity clarity, answer readiness, citation readiness, trust signals, recommendation likelihood, question-led coverage.
- Make the 60-day plan realistic for a small business or lean marketing team.
- Include 5-10 high-value AI-search queries in the opportunity map that are grounded in the intake and business context.
- Prioritize clarity, ranked action, and scannable insight over long paragraphs.
- Avoid vague advice like "improve SEO" unless you explain exactly what to do and why it matters for AI search.
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
  "opportunityMap": [
    {
      "query": "string",
      "whyItMatters": "string",
      "recommendedIntent": "string",
      "priority": "High|Medium|Low"
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
  ],
  "implementationChecklist": [
    {
      "task": "string",
      "priority": "High|Medium|Low",
      "owner": "string"
    }
  ],
  "quickWins": [
    "string",
    "string"
  ],
  "coachingNotes": {
    "whatMattersMost": ["string", "string"],
    "whatToIgnore": ["string", "string"],
    "whereToFocusFirst": "string"
  }
}

ADDITIONAL UPGRADE RULES
- Expand this into a comprehensive AI Visibility Audit + Implementation Plan, not a short audit summary.
- Include 15-25 prompts/questions in the Search Intent + AI Prompt Map across the five required intent groups.
- Include at least 10 article ideas, 10 FAQ questions, 5 comparison ideas, 5 proof/case-study ideas, 5 social/LinkedIn ideas, and 5 AI answer-ready content blocks.
- Include a full 90-day implementation plan with the six required phases.
- Make every recommendation specific to this business and grounded in the intake + crawl + search evidence.
- When information is missing, state the assumption clearly instead of pretending certainty.

IGNORE THE EARLIER SCHEMA ABOVE.
USE THIS UPGRADED PAID-REPORT SCHEMA INSTEAD, AND RETURN VALID JSON IN THIS EXACT SHAPE:
{
  "assumptions": ["string"],
  "executiveSummary": {
    "whatTheBusinessDoes": "string",
    "currentAiSearchVisibilityProblem": "string",
    "topOpportunities": ["string", "string", "string"],
    "topRisks": ["string", "string", "string"],
    "plainEnglishSummary": "string"
  },
  "aiVisibilityDiagnosis": {
    "whereTheBrandIsClear": ["string"],
    "whereTheBrandIsUnclear": ["string"],
    "whyAiSystemsMayOrMayNotRecommendIt": ["string"],
    "entityClarityIssues": ["string"],
    "contentGaps": ["string"],
    "trustAuthorityGaps": ["string"]
  },
  "searchIntentPromptMap": {
    "buyingIntent": [{"prompt": "string", "whyItMatters": "string", "recommendedPageOrContent": "string"}],
    "comparisonIntent": [{"prompt": "string", "whyItMatters": "string", "recommendedPageOrContent": "string"}],
    "educationalIntent": [{"prompt": "string", "whyItMatters": "string", "recommendedPageOrContent": "string"}],
    "localCategoryIntent": [{"prompt": "string", "whyItMatters": "string", "recommendedPageOrContent": "string"}],
    "problemAwareIntent": [{"prompt": "string", "whyItMatters": "string", "recommendedPageOrContent": "string"}]
  },
  "websiteContentFindings": {
    "homepageClarity": ["string"],
    "serviceOrProductPageClarity": ["string"],
    "faqOpportunities": ["string"],
    "internalLinkingOpportunities": ["string"],
    "missingProofTrustSignals": ["string"],
    "contentDepthGaps": ["string"]
  },
  "schemaTechnicalRecommendations": {
    "schemaRecommendations": [
      {
        "schemaType": "string",
        "whereItShouldGo": "string",
        "whyItMatters": "string",
        "exampleFields": ["string"]
      }
    ],
    "metadataImprovements": ["string"],
    "headingStructure": ["string"],
    "crawlabilityIndexability": ["string"],
    "pageSpeedNotes": ["string"],
    "validationSteps": ["string"]
  },
  "contentThoughtStarters": {
    "articleIdeas": [{"title": "string", "targetQuestionOrPrompt": "string", "whyItMatters": "string", "suggestedCtaOrInternalLink": "string"}],
    "faqQuestions": [{"title": "string", "targetQuestionOrPrompt": "string", "whyItMatters": "string", "suggestedCtaOrInternalLink": "string"}],
    "comparisonIdeas": [{"title": "string", "targetQuestionOrPrompt": "string", "whyItMatters": "string", "suggestedCtaOrInternalLink": "string"}],
    "proofCaseStudyIdeas": [{"title": "string", "targetQuestionOrPrompt": "string", "whyItMatters": "string", "suggestedCtaOrInternalLink": "string"}],
    "socialLinkedInPostIdeas": [{"title": "string", "targetQuestionOrPrompt": "string", "whyItMatters": "string", "suggestedCtaOrInternalLink": "string"}],
    "aiAnswerReadyContentBlocks": [{"title": "string", "targetQuestionOrPrompt": "string", "whyItMatters": "string", "suggestedCtaOrInternalLink": "string"}]
  },
  "priorityFixes": [
    {
      "priorityLevel": "High|Medium|Low",
      "tactic": "string",
      "whyItMatters": "string",
      "howToImplement": "string",
      "effortLevel": "Low|Medium|High",
      "expectedImpact": "string",
      "owner": "string",
      "successLooksLike": "string"
    }
  ],
  "ninetyDayImplementationPlan": [
    {
      "phase": "Days 1-15",
      "objective": "string",
      "exactTasks": ["string"],
      "rationale": "string",
      "deliverables": ["string"],
      "owner": "string",
      "successMetric": "string"
    }
  ],
  "implementationChecklist": {
    "strategy": [{"task": "string", "whyItMatters": "string", "owner": "string"}],
    "website": [{"task": "string", "whyItMatters": "string", "owner": "string"}],
    "content": [{"task": "string", "whyItMatters": "string", "owner": "string"}],
    "schema": [{"task": "string", "whyItMatters": "string", "owner": "string"}],
    "authority": [{"task": "string", "whyItMatters": "string", "owner": "string"}],
    "measurement": [{"task": "string", "whyItMatters": "string", "owner": "string"}]
  },
  "coachingNotes": {
    "whatToDoFirst": ["string"],
    "whatToIgnoreForNow": ["string"],
    "biggestLeverageAreas": ["string"],
    "whatDamonShouldWalkThroughOnTheCall": ["string"]
  }
}
`;
}

async function sendPaidReportEmails({ resendKey, report, session }) {
  const customerEmail = session.customer_details?.email || session.customer_email || "";
  const bookingUrl = getAuditBookingUrl();
  const sends = [];
  const attachments = getPdfAttachments(report);
  const fallbackMode = !report.assets?.driveUrl || !report.assets?.downloadUrl;

  if (customerEmail) {
    if (fallbackMode) {
      console.log("Sending fallback report email");
    }
    sends.push(
      sendResendEmail({
        resendKey,
        to: customerEmail,
        subject: `Your Full AI Visibility Audit + Implementation Plan${report.businessName ? ` - ${report.businessName}` : ""}`,
        html: renderCustomerPaidReportEmail({ report, bookingUrl }),
        attachments
      })
    );
  }

  sends.push(
    sendResendEmail({
      resendKey,
      to: getAuditNotificationTo(),
      subject: `Paid Report Delivered - ${report.businessName || report.url}`,
      html: renderInternalPaidReportEmail({ report, customerEmail, bookingUrl }),
      attachments
    })
  );

  const results = await Promise.all(sends);
  if (results.some((result) => !result.ok)) {
    const details = results
      .filter((result) => !result.ok)
      .map((result) => {
        const providerError =
          result.result?.error?.message ||
          result.result?.message ||
          result.result?.raw ||
          JSON.stringify(result.result || {});
        return `status ${result.status || "unknown"}: ${providerError}`;
      })
      .join(" | ");
    console.error(`Email failed with exact provider response: ${details}`);
    const error = new Error(`Paid report email delivery failed: ${details}`);
    error.providerResults = results;
    throw error;
  }

  if (fallbackMode) {
    console.log("Fallback report email sent");
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
  const driveUrl = report.assets?.driveUrl || "";
  const downloadUrl = report.assets?.downloadUrl || "";
  const deliveryNote = renderDeliveryAvailabilityNote(report);

  return `
    <div style="font-family: Arial, sans-serif; background:#f7f5f2; padding:24px 16px;">
      <div style="max-width:760px; margin:0 auto; background:#ffffff; border:1px solid rgba(23,23,23,0.08); border-radius:24px; padding:32px 28px;">
        <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">AI Visibility Audit</p>
        <h2 style="margin:0 0 12px; font-size:34px; line-height:1.05; color:#1a1a1a;">Your full AI Visibility Audit + Implementation Plan is ready</h2>
        <p style="margin:0 0 20px; font-size:16px; line-height:1.6; color:#555555;">
          We’ve finished the deeper report for ${escapeHtml(report.businessName || report.url)}. Below you’ll find the full diagnosis, search-intent map, schema recommendations, content strategy, priority fixes, 90-day implementation plan, and coaching notes.
        </p>

        ${renderReportAccessSection({ driveUrl, downloadUrl })}
        ${deliveryNote}

        ${renderComprehensivePaidReportSections(report)}

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
  const driveUrl = report.assets?.driveUrl || "";
  const downloadUrl = report.assets?.downloadUrl || "";
  const deliveryNote = renderDeliveryAvailabilityNote(report);

  return `
    <div style="font-family: Arial, sans-serif; padding:24px; max-width:760px; margin:0 auto;">
      <h2 style="margin:0 0 12px;">Paid Report Delivered</h2>
      <p><strong>Website:</strong> ${escapeHtml(report.url)}</p>
      <p><strong>Business:</strong> ${escapeHtml(report.businessName || "Unknown")}</p>
      <p><strong>Customer Email:</strong> ${escapeHtml(customerEmail || "Unknown")}</p>
      <p><strong>Quick Audit Score:</strong> ${escapeHtml(String(report.quickAuditScore || 0))}</p>
      <p><strong>Quick Audit Status:</strong> ${escapeHtml(report.quickAuditStatus || "Not available")}</p>
      <p><strong>Booking URL:</strong> <a href="${escapeHtml(bookingUrl)}">${escapeHtml(bookingUrl)}</a></p>
      ${driveUrl ? `<p><strong>View Report:</strong> <a href="${escapeHtml(driveUrl)}">${escapeHtml(driveUrl)}</a></p>` : ""}
      ${downloadUrl ? `<p><strong>Download PDF:</strong> <a href="${escapeHtml(downloadUrl)}">${escapeHtml(downloadUrl)}</a></p>` : ""}
      ${deliveryNote}
      ${renderComprehensivePaidReportSections(report)}
    </div>
  `;
}

function renderReportAccessSection({ driveUrl, downloadUrl }) {
  if (!driveUrl && !downloadUrl) return "";

  return `
    <div style="margin:0 0 24px; padding:18px 20px; border:1px solid rgba(23,23,23,0.08); border-radius:20px; background:rgba(247,245,242,0.72);">
      <p style="margin:0 0 12px; font-size:14px; line-height:1.55; color:#555555;">Your full AI Visibility Audit is ready. You can view the shareable version online or download the PDF below.</p>
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        ${driveUrl ? `<a href="${escapeHtml(driveUrl)}" style="display:inline-block; padding:12px 18px; background:#232323; color:#ffffff; text-decoration:none; border-radius:999px; font-weight:600;">View Report</a>` : ""}
        ${downloadUrl ? `<a href="${escapeHtml(downloadUrl)}" style="display:inline-block; padding:12px 18px; background:#f1efeb; color:#171717; text-decoration:none; border-radius:999px; border:1px solid rgba(23,23,23,0.12); font-weight:600;">Download PDF</a>` : ""}
      </div>
    </div>
  `;
}

function renderDeliveryAvailabilityNote(report) {
  const notes = [];

  if (report.assets?.pdfGenerated === false) {
    notes.push("PDF generation was skipped or failed, so the full report is included directly in this email.");
  }

  if (report.assets?.driveUploaded === false) {
    notes.push("Google Drive delivery was skipped, so there is no hosted link for this report.");
  }

  if (!notes.length) return "";

  return `
    <div style="margin:0 0 24px; padding:16px 18px; border:1px solid rgba(23,23,23,0.08); border-radius:18px; background:rgba(247,245,242,0.72);">
      ${notes.map((note) => `<p style="margin:0 0 8px; font-size:14px; line-height:1.55; color:#555555;">${escapeHtml(note)}</p>`).join("")}
    </div>
  `;
}

function renderComprehensivePaidReportSections(report) {
  return [
    renderAssumptionsSection(report.assumptions),
    renderExecutiveSummarySectionV2(report.executiveSummary),
    renderScorecardSection(report.overallScore, report.scoreBreakdown),
    renderAiVisibilityDiagnosisSectionV2(report.aiVisibilityDiagnosis),
    renderSearchIntentPromptMapSection(report.searchIntentPromptMap),
    renderWebsiteContentFindingsSection(report.websiteContentFindings),
    renderSchemaTechnicalRecommendationsSection(report.schemaTechnicalRecommendations),
    renderContentThoughtStartersSection(report.contentThoughtStarters),
    renderPriorityFixesSection(report.priorityFixes),
    renderNinetyDayImplementationPlanSection(report.ninetyDayImplementationPlan),
    renderChecklistSectionV2(report.implementationChecklist),
    renderCoachingNotesSectionV2(report.coachingNotes)
  ]
    .filter(Boolean)
    .join("");
}

function renderScorecardSection(overallScore, scoreBreakdown) {
  if (typeof overallScore !== "number" || !scoreBreakdown) return "";

  const categories = Array.isArray(scoreBreakdown.categories) ? scoreBreakdown.categories : [];
  const legend = Array.isArray(scoreBreakdown.legend) ? scoreBreakdown.legend : [];

  return renderLabeledSection(
    "AI Visibility Scorecard",
    `Overall AI Visibility Score: ${escapeHtml(String(overallScore))} / 100`,
    `
      ${scoreBreakdown.summary ? `<p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:#555555;">${escapeHtml(scoreBreakdown.summary)}</p>` : ""}
      ${legend.length ? `
        <div style="margin:0 0 18px; padding:14px 16px; border:1px solid rgba(23,23,23,0.08); border-radius:16px; background:rgba(247,245,242,0.72);">
          <p style="margin:0 0 8px; font-size:14px; line-height:1.5; color:#777777; text-transform:uppercase; letter-spacing:0.08em;">Scoring legend</p>
          <ul style="margin:0; padding-left:20px; font-size:14px; line-height:1.6; color:#555555;">
            ${legend.map((item) => `<li style="margin:0 0 6px;"><strong>${escapeHtml(item.range)}</strong>: ${escapeHtml(item.label)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${categories
        .map(
          (item) => `
            <div style="padding-top:16px; margin-top:16px; border-top:1px solid rgba(23,23,23,0.08);">
              <p style="margin:0 0 6px; font-size:18px; line-height:1.4; color:#1a1a1a;"><strong>${escapeHtml(item.title)}</strong> <span style="color:#777777; font-size:14px;">${escapeHtml(String(item.score))} / 100 · ${escapeHtml(item.band)}</span></p>
              <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>Diagnosis:</strong> ${escapeHtml(item.diagnosis)}</p>
              <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</p>
              <p style="margin:0; font-size:15px; line-height:1.6; color:#555555;"><strong>What would improve the score:</strong> ${escapeHtml(item.whatWouldImprove)}</p>
            </div>
          `
        )
        .join("")}
    `
  );
}

function renderAssumptionsSection(items) {
  return renderBulletsSection("Assumptions", "Assumptions", items);
}

function renderExecutiveSummarySectionV2(summary) {
  if (!summary) return "";

  return renderLabeledSection(
    "Executive Summary",
    "Executive Summary",
    `
      ${renderKeyValueParagraph("What the business does", summary.whatTheBusinessDoes)}
      ${renderKeyValueParagraph(
        "Current AI/search visibility problem",
        summary.currentAiSearchVisibilityProblem
      )}
      ${renderBullets("Top 3 opportunities", summary.topOpportunities)}
      ${renderBullets("Top 3 risks", summary.topRisks)}
      ${renderKeyValueParagraph("Plain-English summary", summary.plainEnglishSummary)}
    `
  );
}

function renderAiVisibilityDiagnosisSectionV2(diagnosis) {
  if (!diagnosis) return "";

  return renderLabeledSection(
    "AI Visibility Diagnosis",
    "AI Visibility Diagnosis",
    `
      ${renderBullets("Where the brand is likely clear", diagnosis.whereTheBrandIsClear)}
      ${renderBullets("Where the brand is unclear", diagnosis.whereTheBrandIsUnclear)}
      ${renderBullets(
        "Why AI systems may or may not recommend it",
        diagnosis.whyAiSystemsMayOrMayNotRecommendIt
      )}
      ${renderBullets("Entity clarity issues", diagnosis.entityClarityIssues)}
      ${renderBullets("Content gaps", diagnosis.contentGaps)}
      ${renderBullets("Trust and authority gaps", diagnosis.trustAuthorityGaps)}
    `
  );
}

function renderSearchIntentPromptMapSection(promptMap) {
  if (!promptMap) return "";

  return renderLabeledSection(
    "Search Intent + AI Prompt Map",
    "Search Intent + AI Prompt Map",
    [
      renderPromptGroup("Buying intent", promptMap.buyingIntent),
      renderPromptGroup("Comparison intent", promptMap.comparisonIntent),
      renderPromptGroup("Educational intent", promptMap.educationalIntent),
      renderPromptGroup("Local/category intent", promptMap.localCategoryIntent),
      renderPromptGroup("Problem-aware intent", promptMap.problemAwareIntent)
    ]
      .filter(Boolean)
      .join("")
  );
}

function renderWebsiteContentFindingsSection(findings) {
  if (!findings) return "";

  return renderLabeledSection(
    "Website + Content Structure Findings",
    "Website + Content Structure Findings",
    `
      ${renderBullets("Homepage clarity", findings.homepageClarity)}
      ${renderBullets("Service or product page clarity", findings.serviceOrProductPageClarity)}
      ${renderBullets("FAQ opportunities", findings.faqOpportunities)}
      ${renderBullets("Internal linking opportunities", findings.internalLinkingOpportunities)}
      ${renderBullets("Missing proof and trust signals", findings.missingProofTrustSignals)}
      ${renderBullets("Content depth gaps", findings.contentDepthGaps)}
    `
  );
}

function renderSchemaTechnicalRecommendationsSection(section) {
  if (!section) return "";

  const schemaRows = (Array.isArray(section.schemaRecommendations)
    ? section.schemaRecommendations
    : []
  )
    .map(
      (item) => `
        <div style="padding-top:16px; margin-top:16px; border-top:1px solid rgba(23,23,23,0.08);">
          <p style="margin:0 0 6px; font-size:18px; line-height:1.4; color:#1a1a1a;"><strong>${escapeHtml(item.schemaType)}</strong></p>
          <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>Where it should go:</strong> ${escapeHtml(item.whereItShouldGo)}</p>
          <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</p>
          ${renderBullets("Example fields to include", item.exampleFields)}
        </div>
      `
    )
    .join("");

  return renderLabeledSection(
    "Schema + Technical Recommendations",
    "Schema + Technical Recommendations",
    `
      ${schemaRows}
      ${renderBullets("Metadata improvements", section.metadataImprovements)}
      ${renderBullets("Heading structure", section.headingStructure)}
      ${renderBullets("Crawlability and indexability", section.crawlabilityIndexability)}
      ${renderBullets("Page speed notes", section.pageSpeedNotes)}
      ${renderBullets("Structured-data validation steps", section.validationSteps)}
    `
  );
}

function renderContentThoughtStartersSection(section) {
  if (!section) return "";

  return renderLabeledSection(
    "Content Strategy + Thought Starters",
    "Content Strategy + Thought Starters",
    [
      renderIdeaGroup("Article ideas", section.articleIdeas),
      renderIdeaGroup("FAQ questions", section.faqQuestions),
      renderIdeaGroup("Comparison and alternative ideas", section.comparisonIdeas),
      renderIdeaGroup("Proof and case-study ideas", section.proofCaseStudyIdeas),
      renderIdeaGroup("Social and LinkedIn post ideas", section.socialLinkedInPostIdeas),
      renderIdeaGroup("AI answer-ready content blocks", section.aiAnswerReadyContentBlocks)
    ]
      .filter(Boolean)
      .join("")
  );
}

function renderPriorityFixesSection(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";

  const rows = values
    .map(
      (item) => `
        <div style="padding-top:16px; margin-top:16px; border-top:1px solid rgba(23,23,23,0.08);">
          <p style="margin:0 0 6px; font-size:18px; line-height:1.4; color:#1a1a1a;"><strong>${escapeHtml(item.tactic)}</strong> <span style="color:#777777; font-size:14px;">${escapeHtml(item.priorityLevel)} priority</span></p>
          <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</p>
          <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>How to implement:</strong> ${escapeHtml(item.howToImplement)}</p>
          <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#555555;"><strong>Success looks like:</strong> ${escapeHtml(item.successLooksLike)}</p>
          <p style="margin:0; font-size:14px; line-height:1.55; color:#777777;">Effort: ${escapeHtml(item.effortLevel)} | Expected impact: ${escapeHtml(item.expectedImpact)} | Owner: ${escapeHtml(item.owner)}</p>
        </div>
      `
    )
    .join("");

  return renderLabeledSection("Priority Fixes", "Priority Fixes", rows);
}

function renderNinetyDayImplementationPlanSection(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";

  const rows = values
    .map(
      (phase) => `
        <div style="padding-top:16px; margin-top:16px; border-top:1px solid rgba(23,23,23,0.08);">
          <p style="margin:0 0 6px; font-size:18px; line-height:1.4; color:#1a1a1a;"><strong>${escapeHtml(phase.phase)}</strong></p>
          ${renderKeyValueParagraph("Objective", phase.objective)}
          ${renderBullets("Exact tasks", phase.exactTasks)}
          ${renderKeyValueParagraph("Rationale", phase.rationale)}
          ${renderBullets("Deliverables", phase.deliverables)}
          <p style="margin:10px 0 0; font-size:14px; line-height:1.55; color:#777777;">Owner: ${escapeHtml(phase.owner)} | Success metric: ${escapeHtml(phase.successMetric)}</p>
        </div>
      `
    )
    .join("");

  return renderLabeledSection(
    "90-Day Implementation Plan",
    "90-Day Implementation Plan",
    rows
  );
}

function renderChecklistSectionV2(groups) {
  const entries = Object.entries(groups || {});
  if (!entries.length) return "";

  return renderLabeledSection(
    "Step-by-Step Checklist",
    "Step-by-Step Checklist",
    entries
      .map(([group, items]) => renderChecklistGroup(group, items))
      .filter(Boolean)
      .join("")
  );
}

function renderCoachingNotesSectionV2(notes) {
  if (!notes) return "";

  return renderLabeledSection(
    "Coaching Notes",
    "Coaching Notes",
    `
      ${renderBullets("What to do first", notes.whatToDoFirst)}
      ${renderBullets("What to ignore for now", notes.whatToIgnoreForNow)}
      ${renderBullets("Where the biggest leverage is", notes.biggestLeverageAreas)}
      ${renderBullets(
        "What Damon should walk through on the coaching call",
        notes.whatDamonShouldWalkThroughOnTheCall
      )}
    `
  );
}

function renderLabeledSection(label, title, body) {
  if (!String(body || "").trim()) return "";

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">${escapeHtml(label)}</p>
      ${title ? `<p style="margin:0 0 14px; font-size:24px; line-height:1.2; color:#1a1a1a;"><strong>${escapeHtml(title)}</strong></p>` : ""}
      ${body}
    </div>
  `;
}

function renderBulletsSection(label, title, items) {
  const content = renderBullets(title, items);
  if (!content) return "";
  return renderLabeledSection(label, "", content);
}

function renderKeyValueParagraph(label, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `<p style="margin:0 0 10px; font-size:15px; line-height:1.6; color:#555555;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(text)}</p>`;
}

function renderPromptGroup(title, items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";

  return `
    <div style="margin-top:16px;">
      <p style="margin:0 0 8px; font-size:16px; line-height:1.5; color:#1a1a1a;"><strong>${escapeHtml(title)}</strong></p>
      <ol style="margin:0; padding-left:20px; font-size:15px; line-height:1.6; color:#555555;">
        ${values
          .map(
            (item) => `
              <li style="margin:0 0 12px;">
                <strong>${escapeHtml(item.prompt)}</strong><br />
                <span style="color:#555555;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</span><br />
                <span style="color:#777777;"><strong>What should answer it:</strong> ${escapeHtml(item.recommendedPageOrContent)}</span>
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
    <div style="margin-top:16px;">
      <p style="margin:0 0 8px; font-size:16px; line-height:1.5; color:#1a1a1a;"><strong>${escapeHtml(title)}</strong></p>
      <ol style="margin:0; padding-left:20px; font-size:15px; line-height:1.6; color:#555555;">
        ${values
          .map(
            (item) => `
              <li style="margin:0 0 12px;">
                <strong>${escapeHtml(item.title)}</strong><br />
                <span style="color:#555555;"><strong>Target prompt:</strong> ${escapeHtml(item.targetQuestionOrPrompt)}</span><br />
                <span style="color:#555555;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</span><br />
                <span style="color:#777777;"><strong>Suggested CTA/internal link:</strong> ${escapeHtml(item.suggestedCtaOrInternalLink)}</span>
              </li>
            `
          )
          .join("")}
      </ol>
    </div>
  `;
}

function renderChecklistGroup(group, items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";

  return `
    <div style="margin-top:16px;">
      <p style="margin:0 0 8px; font-size:16px; line-height:1.5; color:#1a1a1a;"><strong>${escapeHtml(startCase(group))}</strong></p>
      <ul style="margin:0; padding-left:20px; font-size:15px; line-height:1.6; color:#555555;">
        ${values
          .map(
            (item) => `
              <li style="margin:0 0 12px;">
                <strong>${escapeHtml(item.task)}</strong><br />
                <span style="color:#555555;">${escapeHtml(item.whyItMatters)}</span><br />
                <span style="color:#777777;">Owner: ${escapeHtml(item.owner)}</span>
              </li>
            `
          )
          .join("")}
      </ul>
    </div>
  `;
}

function getPdfAttachments(report) {
  const pdfBase64 = String(report.assets?.pdfBase64 || "").trim();
  const fileName = String(report.assets?.fileName || "ai-visibility-audit.pdf").trim();

  if (!pdfBase64) return [];

  return [
    {
      filename: fileName,
      content: pdfBase64
    }
  ];
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

function renderOpportunityMapSection(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";

  const rows = values.map((item) => `
    <li style="margin:0 0 14px;">
      <strong>${escapeHtml(item.query)}</strong><br />
      <span style="color:#555555;">${escapeHtml(item.whyItMatters)}</span><br />
      <span style="color:#777777;">Intent: ${escapeHtml(item.recommendedIntent)} | Priority: ${escapeHtml(item.priority)}</span>
    </li>
  `).join("");

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">Opportunity Map</p>
      <ol style="margin:0; padding-left:20px; font-size:16px; line-height:1.6; color:#1a1a1a;">${rows}</ol>
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

function renderChecklistSection(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return "";

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">Implementation Checklist</p>
      <ul style="margin:0; padding-left:20px; font-size:15px; line-height:1.6; color:#555555;">
        ${values.map((item) => `<li style="margin:0 0 10px;"><strong>${escapeHtml(item.task)}</strong> <span style="color:#777777;">(${escapeHtml(item.priority)} · ${escapeHtml(item.owner)})</span></li>`).join("")}
      </ul>
    </div>
  `;
}

function renderQuickWinsSection(items) {
  return renderBullets("Quick Wins", items);
}

function renderCoachingNotesSection(notes) {
  if (!notes) return "";

  return `
    <div style="padding-top:18px; margin-top:18px; border-top:1px solid rgba(23,23,23,0.08);">
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#777777;">Coaching Notes</p>
      ${renderBullets("What matters most", notes.whatMattersMost)}
      ${renderBullets("What to ignore", notes.whatToIgnore)}
      <p style="margin:14px 0 0; font-size:16px; line-height:1.6; color:#1a1a1a;"><strong>Where to focus first:</strong> ${escapeHtml(notes.whereToFocusFirst || "")}</p>
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

function normalizeExecutiveSummaryV2(summary, businessName) {
  return {
    whatTheBusinessDoes: String(
      summary?.whatTheBusinessDoes ||
        `${businessName || "The business"} needs a clearer, more recommendation-ready explanation of what it does, who it helps, and why it is the best fit.`
    ).trim(),
    currentAiSearchVisibilityProblem: String(
      summary?.currentAiSearchVisibilityProblem ||
        "The site is not yet sending strong enough entity, trust, and answer-readiness signals for AI systems to recommend it consistently."
    ).trim(),
    topOpportunities: normalizeStringArray(summary?.topOpportunities, 3),
    topRisks: normalizeStringArray(summary?.topRisks, 3),
    plainEnglishSummary: String(
      summary?.plainEnglishSummary ||
        "The opportunity is real, but the site needs sharper positioning, stronger trust signals, and more question-led content before AI systems can cite it with confidence."
    ).trim()
  };
}

function normalizeAiVisibilityDiagnosisV2(section) {
  return {
    whereTheBrandIsClear: normalizeStringArray(section?.whereTheBrandIsClear, 6),
    whereTheBrandIsUnclear: normalizeStringArray(section?.whereTheBrandIsUnclear, 6),
    whyAiSystemsMayOrMayNotRecommendIt: normalizeStringArray(
      section?.whyAiSystemsMayOrMayNotRecommendIt,
      6
    ),
    entityClarityIssues: normalizeStringArray(section?.entityClarityIssues, 6),
    contentGaps: normalizeStringArray(section?.contentGaps, 6),
    trustAuthorityGaps: normalizeStringArray(section?.trustAuthorityGaps, 6)
  };
}

function normalizeSearchIntentPromptMap(section, context = {}) {
  return {
    buyingIntent: normalizePromptGroup(section?.buyingIntent, "buying intent", context),
    comparisonIntent: normalizePromptGroup(section?.comparisonIntent, "comparison intent", context),
    educationalIntent: normalizePromptGroup(section?.educationalIntent, "educational intent", context),
    localCategoryIntent: normalizePromptGroup(
      section?.localCategoryIntent,
      "local/category intent",
      context
    ),
    problemAwareIntent: normalizePromptGroup(
      section?.problemAwareIntent,
      "problem-aware intent",
      context
    )
  };
}

function normalizePromptGroup(items, label, context = {}) {
  const values = Array.isArray(items) ? items : [];
  if (values.length) {
    return values.slice(0, 6).map((item) => ({
      prompt: String(item?.prompt || `${startCase(label)} prompt`).trim(),
      whyItMatters: String(
        item?.whyItMatters || "This prompt maps to a meaningful AI-driven discovery moment."
      ).trim(),
      recommendedPageOrContent: String(
        item?.recommendedPageOrContent ||
          context.priorityPages ||
          "A focused service, solution, or FAQ page"
      ).trim()
    }));
  }

  return [
    {
      prompt: `${startCase(label)} query for ${context.businessName || "the business"}`,
      whyItMatters: "This is a high-value query type the site should be easier to surface for.",
      recommendedPageOrContent:
        context.priorityPages || "Create or strengthen a relevant commercial or support page"
    }
  ];
}

function normalizeWebsiteContentFindings(section) {
  return {
    homepageClarity: normalizeStringArray(section?.homepageClarity, 6),
    serviceOrProductPageClarity: normalizeStringArray(
      section?.serviceOrProductPageClarity,
      6
    ),
    faqOpportunities: normalizeStringArray(section?.faqOpportunities, 8),
    internalLinkingOpportunities: normalizeStringArray(
      section?.internalLinkingOpportunities,
      8
    ),
    missingProofTrustSignals: normalizeStringArray(section?.missingProofTrustSignals, 8),
    contentDepthGaps: normalizeStringArray(section?.contentDepthGaps, 8)
  };
}

function normalizeSchemaTechnicalRecommendations(section) {
  const schemaRecommendations = Array.isArray(section?.schemaRecommendations)
    ? section.schemaRecommendations.slice(0, 10).map((item) => ({
        schemaType: String(item?.schemaType || "Schema recommendation").trim(),
        whereItShouldGo: String(
          item?.whereItShouldGo || "On the most relevant template or page type"
        ).trim(),
        whyItMatters: String(
          item?.whyItMatters ||
            "This improves machine-readable understanding and recommendation confidence."
        ).trim(),
        exampleFields: normalizeStringArray(item?.exampleFields, 8)
      }))
    : [];

  return {
    schemaRecommendations,
    metadataImprovements: normalizeStringArray(section?.metadataImprovements, 8),
    headingStructure: normalizeStringArray(section?.headingStructure, 8),
    crawlabilityIndexability: normalizeStringArray(section?.crawlabilityIndexability, 8),
    pageSpeedNotes: normalizeStringArray(section?.pageSpeedNotes, 6),
    validationSteps: normalizeStringArray(section?.validationSteps, 6)
  };
}

function normalizeContentThoughtStarters(section, context = {}) {
  return {
    articleIdeas: normalizeIdeaGroup(section?.articleIdeas, 10, context),
    faqQuestions: normalizeIdeaGroup(section?.faqQuestions, 10, context),
    comparisonIdeas: normalizeIdeaGroup(section?.comparisonIdeas, 5, context),
    proofCaseStudyIdeas: normalizeIdeaGroup(section?.proofCaseStudyIdeas, 5, context),
    socialLinkedInPostIdeas: normalizeIdeaGroup(section?.socialLinkedInPostIdeas, 5, context),
    aiAnswerReadyContentBlocks: normalizeIdeaGroup(
      section?.aiAnswerReadyContentBlocks,
      5,
      context
    )
  };
}

function normalizeIdeaGroup(items, max, context = {}) {
  const values = Array.isArray(items) ? items : [];
  if (values.length) {
    return values.slice(0, max).map((item) => ({
      title: String(item?.title || "Content idea").trim(),
      targetQuestionOrPrompt: String(
        item?.targetQuestionOrPrompt || "Target AI-search prompt"
      ).trim(),
      whyItMatters: String(
        item?.whyItMatters || "This helps the site answer valuable prompts more clearly."
      ).trim(),
      suggestedCtaOrInternalLink: String(
        item?.suggestedCtaOrInternalLink ||
          context.priorityPages ||
          context.conversionGoal ||
          "Link to the most relevant service or conversion page"
      ).trim()
    }));
  }

  return [];
}

function normalizePriorityFixes(items, fallbackRecommendations) {
  const values = Array.isArray(items) ? items : [];
  if (values.length) {
    return values.slice(0, 12).map((item) => ({
      priorityLevel: normalizeSeverity(item?.priorityLevel),
      tactic: String(item?.tactic || "Priority fix").trim(),
      whyItMatters: String(
        item?.whyItMatters || "This unlocks stronger AI visibility and recommendation readiness."
      ).trim(),
      howToImplement: String(
        item?.howToImplement || "Implement the fix directly on the relevant pages or templates."
      ).trim(),
      effortLevel: normalizeDifficulty(item?.effortLevel),
      expectedImpact: String(
        item?.expectedImpact || "Improved clarity, citation readiness, and conversion alignment."
      ).trim(),
      owner: String(item?.owner || "Marketing lead").trim(),
      successLooksLike: String(
        item?.successLooksLike || "The site sends clearer and stronger signals for AI search."
      ).trim()
    }));
  }

  return fallbackRecommendations.slice(0, 8).map((recommendation) => ({
    priorityLevel: normalizeSeverity(recommendation.priority),
    tactic: recommendation.title,
    whyItMatters: recommendation.whyItMattersForAiSearch,
    howToImplement: recommendation.stepByStepInstructions.join(" "),
    effortLevel: "Medium",
    expectedImpact: "Stronger AI-search visibility and implementation readiness.",
    owner: recommendation.recommendedOwner,
    successLooksLike:
      "The recommendation is implemented cleanly on the priority pages and improves answer readiness."
  }));
}

function normalizeNinetyDayImplementationPlan(plan, fallbackRecommendations) {
  const phases = ["Days 1-15", "Days 16-30", "Days 31-45", "Days 46-60", "Days 61-75", "Days 76-90"];
  const values = Array.isArray(plan) ? plan : [];

  const normalized = phases.map((phase, index) => {
    const match = values.find(
      (item) => String(item?.phase || "").trim().toLowerCase() === phase.toLowerCase()
    );
    const fallback = fallbackRecommendations[index] || fallbackRecommendations[0];

    return {
      phase,
      objective: String(
        match?.objective ||
          `Advance the next layer of AI visibility work for ${fallback?.workstream || "the business"}.`
      ).trim(),
      exactTasks: normalizeStringArray(
        match?.exactTasks || fallback?.stepByStepInstructions || [],
        8
      ),
      rationale: String(
        match?.rationale ||
          fallback?.whyItMattersForAiSearch ||
          "This phase builds stronger visibility and recommendation confidence."
      ).trim(),
      deliverables: normalizeStringArray(
        match?.deliverables || [fallback?.title || "Completed implementation deliverables"],
        6
      ),
      owner: String(match?.owner || fallback?.recommendedOwner || "Marketing lead").trim(),
      successMetric: String(
        match?.successMetric ||
          "Priority pages become clearer, more structured, and more recommendation-ready."
      ).trim()
    };
  });

  return normalized;
}

function normalizeImplementationChecklistV2(checklist) {
  const section = checklist || {};
  return {
    strategy: normalizeChecklistGroup(section.strategy),
    website: normalizeChecklistGroup(section.website),
    content: normalizeChecklistGroup(section.content),
    schema: normalizeChecklistGroup(section.schema),
    authority: normalizeChecklistGroup(section.authority),
    measurement: normalizeChecklistGroup(section.measurement)
  };
}

function normalizeChecklistGroup(items) {
  const values = Array.isArray(items) ? items : [];
  return values.slice(0, 10).map((item) => ({
    task: String(item?.task || "Checklist action").trim(),
    whyItMatters: String(
      item?.whyItMatters || "This supports stronger AI visibility and implementation follow-through."
    ).trim(),
    owner: String(item?.owner || "Marketing lead").trim()
  }));
}

function normalizeCoachingNotesV2(notes) {
  return {
    whatToDoFirst: normalizeStringArray(notes?.whatToDoFirst, 6),
    whatToIgnoreForNow: normalizeStringArray(notes?.whatToIgnoreForNow, 6),
    biggestLeverageAreas: normalizeStringArray(notes?.biggestLeverageAreas, 6),
    whatDamonShouldWalkThroughOnTheCall: normalizeStringArray(
      notes?.whatDamonShouldWalkThroughOnTheCall,
      6
    )
  };
}

function flattenPromptMap(promptMap) {
  const groups = [
    ["Buying intent", promptMap?.buyingIntent],
    ["Comparison intent", promptMap?.comparisonIntent],
    ["Educational intent", promptMap?.educationalIntent],
    ["Local/category intent", promptMap?.localCategoryIntent],
    ["Problem-aware intent", promptMap?.problemAwareIntent]
  ];

  return groups
    .flatMap(([label, items]) =>
      (Array.isArray(items) ? items : []).map((item) => ({
        query: item.prompt,
        whyItMatters: item.whyItMatters,
        recommendedIntent: label,
        priority: "High"
      }))
    )
    .slice(0, 15);
}

function mapPriorityFixesToLegacy(items) {
  return (Array.isArray(items) ? items : []).slice(0, 8).map((item) => ({
    title: item.tactic,
    whyItMatters: item.whyItMatters,
    expectedImpact: item.expectedImpact,
    difficulty: item.effortLevel,
    recommendedOwner: item.owner
  }));
}

function mapRecommendationsToLegacy({
  websiteContentFindings,
  schemaTechnicalRecommendations,
  contentThoughtStarters,
  fallbackRecommendations
}) {
  const derived = [
    ...(schemaTechnicalRecommendations?.schemaRecommendations || []).slice(0, 3).map((item) => ({
      title: `Implement ${item.schemaType} schema`,
      workstream: "Schema",
      diagnosis: item.whereItShouldGo,
      whyItMattersForAiSearch: item.whyItMatters,
      whatToChange: item.exampleFields.join(", "),
      stepByStepImplementation: item.exampleFields,
      examplesOrTemplates: item.exampleFields,
      timeline: "Days 1-30",
      priority: "High"
    })),
    ...(websiteContentFindings?.faqOpportunities || []).slice(0, 2).map((item) => ({
      title: "Expand FAQ coverage",
      workstream: "Question-Led Content",
      diagnosis: item,
      whyItMattersForAiSearch:
        "FAQ coverage helps AI systems match the brand to more buyer questions.",
      whatToChange: item,
      stepByStepImplementation: [item],
      examplesOrTemplates: [],
      timeline: "Days 15-45",
      priority: "Medium"
    })),
    ...(contentThoughtStarters?.articleIdeas || []).slice(0, 2).map((item) => ({
      title: item.title,
      workstream: "Topic Clusters",
      diagnosis: item.targetQuestionOrPrompt,
      whyItMattersForAiSearch: item.whyItMatters,
      whatToChange: item.suggestedCtaOrInternalLink,
      stepByStepImplementation: [item.targetQuestionOrPrompt, item.suggestedCtaOrInternalLink],
      examplesOrTemplates: [],
      timeline: "Days 30-60",
      priority: "Medium"
    }))
  ];

  if (derived.length) return derived;

  return normalizeRecommendations([], fallbackRecommendations);
}

function mapWorkstreamsToLegacy({ ninetyDayImplementationPlan, fallbackRecommendations }) {
  const values = Array.isArray(ninetyDayImplementationPlan) ? ninetyDayImplementationPlan : [];
  if (values.length) {
    return values.map((item) => ({
      title: item.phase,
      summary: item.objective,
      items: item.exactTasks
    }));
  }

  return normalizeWorkstreams([], fallbackRecommendations);
}

function mapCalendarToLegacy(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    phase: item.phase,
    items: (Array.isArray(item.exactTasks) ? item.exactTasks : []).map((task) => ({
      task,
      whyItMatters: item.rationale,
      expectedOutcome: item.successMetric,
      suggestedOwner: item.owner
    }))
  }));
}

function startCase(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildPaidReportScorecard({
  businessName,
  intake,
  signals,
  executiveSummary,
  aiVisibilityDiagnosis,
  searchIntentPromptMap,
  websiteContentFindings,
  schemaTechnicalRecommendations
}) {
  const structure = signals?.structure || {};
  const contentDepth = signals?.contentDepth || {};
  const crawlSummary = signals?.crawlSummary || {};
  const schemaSummary = signals?.schemaSummary || {};
  const foundInSearch = String(signals?.searchPresence || "")
    .toLowerCase()
    .includes("found");

  const unclearCount = countItems(aiVisibilityDiagnosis?.whereTheBrandIsUnclear);
  const entityIssuesCount = countItems(aiVisibilityDiagnosis?.entityClarityIssues);
  const contentGapCount = countItems(aiVisibilityDiagnosis?.contentGaps);
  const trustGapCount = countItems(aiVisibilityDiagnosis?.trustAuthorityGaps);
  const proofGapCount = countItems(websiteContentFindings?.missingProofTrustSignals);
  const faqCount = countItems(websiteContentFindings?.faqOpportunities);
  const internalLinkCount = countItems(websiteContentFindings?.internalLinkingOpportunities);
  const promptCount = countPromptMapItems(searchIntentPromptMap);
  const schemaRecommendationCount = countItems(
    schemaTechnicalRecommendations?.schemaRecommendations
  );
  const validationStepCount = countItems(schemaTechnicalRecommendations?.validationSteps);

  const entityClarityScore = clampScore(
    36 +
      (structure.titleTag ? 10 : 0) +
      (structure.h1 ? 10 : 0) +
      (structure.metaDescription ? 7 : 0) +
      Math.min((contentDepth.servicePageClarity || 0) * 0.22, 22) -
      unclearCount * 3 -
      entityIssuesCount * 4
  );

  const contentDepthScore = clampScore(
    20 +
      Math.min((contentDepth.score || 0) * 0.55, 55) +
      Math.min((crawlSummary.pagesWithQuestions || 0) * 2, 10) +
      Math.min((crawlSummary.averageWordCount || 0) / 120, 10) -
      contentGapCount * 3
  );

  const aiAnswerReadinessScore = clampScore(
    18 +
      Math.min((contentDepth.questionAnswerReadiness || 0) * 0.55, 55) +
      Math.min(promptCount * 1.4, 16) +
      Math.min(faqCount * 1.2, 8) -
      contentGapCount * 2
  );

  const technicalSchemaScore = clampScore(
    15 +
      (structure.schema ? 16 : 0) +
      Math.min((structure.schemaTypes || []).length * 4, 16) +
      Math.min((schemaSummary.schemaTypes || []).length * 2, 10) +
      (structure.canonical ? 8 : 0) +
      (structure.titleTag ? 6 : 0) +
      (structure.metaDescription ? 5 : 0) +
      Math.min((signals.pageSpeed || 0) * 0.18, 18) +
      Math.min(validationStepCount * 1.5, 8) -
      (structure.noindex ? 25 : 0)
  );

  const authorityTrustScore = clampScore(
    24 +
      Math.min((signals.searchQueries || []).filter((query) => query.brandFound).length * 5, 20) +
      (foundInSearch ? 10 : 0) +
      Math.min((Number(intake?.quickAuditScore) || 0) * 0.18, 12) -
      trustGapCount * 4 -
      proofGapCount * 3
  );

  const conversionReadinessScore = clampScore(
    24 +
      Math.min((contentDepth.servicePageClarity || 0) * 0.32, 32) +
      (String(intake?.conversionGoal || "").trim() ? 8 : 0) +
      (String(intake?.priorityPages || "").trim() ? 8 : 0) +
      Math.min(internalLinkCount * 1.5, 8) -
      proofGapCount * 3
  );

  const categories = [
    createScoreEntry({
      key: "entityClarityScore",
      title: "Entity Clarity Score",
      score: entityClarityScore,
      diagnosis:
        entityClarityScore >= 80
          ? `${businessName || "The business"} is communicating who it is and what it does with relatively strong clarity signals.`
          : `${businessName || "The business"} still has ambiguity around who it helps, what it offers, or how priority pages define the brand.`,
      whyItMatters:
        "AI systems need strong entity clarity before they can confidently recommend, summarize, or cite a business.",
      whatWouldImprove:
        "Tighten homepage and service-page positioning, sharpen H1/title/meta alignment, and reduce ambiguity in how the business describes its offer."
    }),
    createScoreEntry({
      key: "contentDepthScore",
      title: "Content Depth Score",
      score: contentDepthScore,
      diagnosis:
        contentDepthScore >= 80
          ? "The site shows useful depth across priority topics and can support stronger AI-driven discovery."
          : "The site needs broader and deeper coverage across the questions, topics, and proof points buyers care about.",
      whyItMatters:
        "Thin or shallow coverage limits how often AI systems can match the brand to nuanced, high-intent prompts.",
      whatWouldImprove:
        "Expand service support content, build topic clusters, deepen FAQ and supporting content, and add clearer proof-led explanations on priority pages."
    }),
    createScoreEntry({
      key: "aiAnswerReadinessScore",
      title: "AI Answer Readiness Score",
      score: aiAnswerReadinessScore,
      diagnosis:
        aiAnswerReadinessScore >= 80
          ? "The site has a strong base for answering AI-style prompts directly and clearly."
          : "The site needs more direct, question-led, answer-ready content blocks to win recommendation moments.",
      whyItMatters:
        "AI search favors content that can answer prompts directly, confidently, and with clear page-level relevance.",
      whatWouldImprove:
        "Add concise question-answer blocks, FAQ sections, comparison pages, and clearer prompt-matched content tied to priority buyer questions."
    }),
    createScoreEntry({
      key: "technicalSchemaScore",
      title: "Technical / Schema Score",
      score: technicalSchemaScore,
      diagnosis:
        technicalSchemaScore >= 80
          ? "The site has a relatively solid technical and structured-data foundation for AI interpretation."
          : "The technical and schema foundation still needs work before AI systems can read the business as cleanly as they should.",
      whyItMatters:
        "Schema, crawlability, metadata, and clean page signals help AI systems interpret, validate, and cite the site more confidently.",
      whatWouldImprove:
        "Implement the right schema types, validate structured data, clean up metadata and headings, improve crawl clarity, and raise page-speed performance where possible."
    }),
    createScoreEntry({
      key: "authorityTrustScore",
      title: "Authority & Trust Score",
      score: authorityTrustScore,
      diagnosis:
        authorityTrustScore >= 80
          ? "The brand shows a relatively healthy base of trust cues and recommendation support."
          : "The brand still needs stronger authority, proof, and external trust signals to improve recommendation confidence.",
      whyItMatters:
        "AI systems are more willing to recommend brands that show stronger proof, clarity, mentions, and signals of trust.",
      whatWouldImprove:
        "Add testimonials, case studies, brand proof, partner signals, citations, and stronger off-site authority references aligned to the core offer."
    }),
    createScoreEntry({
      key: "conversionReadinessScore",
      title: "Conversion Readiness Score",
      score: conversionReadinessScore,
      diagnosis:
        conversionReadinessScore >= 80
          ? "The site is relatively well set up to turn AI-driven discovery into a next step."
          : "The site still needs a clearer path from visibility to conversion on its highest-value pages.",
      whyItMatters:
        "AI visibility only becomes commercial value when the landing experience makes the next action obvious and credible.",
      whatWouldImprove:
        "Clarify conversion goals on priority pages, strengthen CTAs, reduce friction, add trust near actions, and improve internal links into commercial pages."
    })
  ];

  const overallScore = Math.round(
    categories.reduce((sum, item) => sum + item.score, 0) / categories.length
  );

  return {
    overallScore,
    scoreBreakdown: {
      summary: `${
        businessName || "This business"
      } currently sits in the ${getScoreBand(overallScore).toLowerCase()} range for AI visibility. The strongest gains will come from improving clarity, answer readiness, structured data, and proof signals together rather than treating them as separate fixes.`,
      legend: [
        { range: "80–100", label: "Strong" },
        { range: "60–79", label: "Good foundation, needs improvement" },
        { range: "40–59", label: "Weak visibility" },
        { range: "0–39", label: "High-risk / not AI-ready" }
      ],
      categories
    }
  };
}

function createScoreEntry({ key, title, score, diagnosis, whyItMatters, whatWouldImprove }) {
  return {
    key,
    title,
    score,
    band: getScoreBand(score),
    diagnosis,
    whyItMatters,
    whatWouldImprove
  };
}

function getScoreBand(score) {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Good foundation, needs improvement";
  if (score >= 40) return "Weak visibility";
  return "High-risk / not AI-ready";
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countItems(items) {
  return Array.isArray(items) ? items.filter(Boolean).length : 0;
}

function countPromptMapItems(promptMap) {
  if (!promptMap) return 0;
  return [
    promptMap.buyingIntent,
    promptMap.comparisonIntent,
    promptMap.educationalIntent,
    promptMap.localCategoryIntent,
    promptMap.problemAwareIntent
  ].reduce((sum, items) => sum + countItems(items), 0);
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

function normalizeOpportunityMap(items) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) {
    return [
      {
        query: "Best-fit AI search query opportunity",
        whyItMatters: "This represents a high-intent prompt the business should be easier to discover for.",
        recommendedIntent: "Commercial investigation",
        priority: "High"
      }
    ];
  }

  return values.slice(0, 10).map((item) => ({
    query: String(item?.query || "AI search opportunity").trim(),
    whyItMatters: String(item?.whyItMatters || "This query maps closely to a valuable discovery moment.").trim(),
    recommendedIntent: String(item?.recommendedIntent || "Commercial investigation").trim(),
    priority: normalizeSeverity(item?.priority)
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

function normalizeChecklist(items) {
  const values = Array.isArray(items) ? items : [];
  return values.slice(0, 12).map((item) => ({
    task: String(item?.task || "Implementation task").trim(),
    priority: normalizeSeverity(item?.priority),
    owner: String(item?.owner || "Marketing lead").trim()
  }));
}

function normalizeCoachingNotes(notes) {
  return {
    whatMattersMost: normalizeStringArray(notes?.whatMattersMost, 4),
    whatToIgnore: normalizeStringArray(notes?.whatToIgnore, 4),
    whereToFocusFirst: String(notes?.whereToFocusFirst || "Focus first on the fixes that improve entity clarity, answer readiness, and the priority commercial pages.").trim()
  };
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
