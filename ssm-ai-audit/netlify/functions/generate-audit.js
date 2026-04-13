const {
  collectSiteIntelligence,
  getHostname: getSharedHostname,
  normalizeUrl: normalizeSharedUrl
} = require("./_site-intelligence");

exports.handler = async (event) => {
  try {
    const input = JSON.parse(event.body || "{}");
    const openAiKey = process.env.OPENAI_API_KEY;
    const pageSpeedKey = process.env.PAGESPEED_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!openAiKey) {
      return json(500, { error: "Missing OPENAI_API_KEY" });
    }

    const url = normalizeSharedUrl(input.url);
    const hostname = getSharedHostname(url);
    const businessName = String(input.businessName || "").trim() || hostname;
    const siteIntelligence = await collectSiteIntelligence({
      url,
      businessName,
      industry: input.industry || "",
      service: input.service || "",
      competitors: input.topCompetitors || "",
      targetLocations: input.targetLocations || "",
      serperKey
    });
    const htmlChecks = siteIntelligence.htmlChecks;
    const pageSpeed = pageSpeedKey ? await getPageSpeed(url, pageSpeedKey) : null;
    const serper = siteIntelligence.serper;
    const crawl = siteIntelligence.crawl;

    const tech = {
      speed: pageSpeed?.speedText || "Unavailable",
      mobile: pageSpeed?.mobileText || "Unknown",
      meta: htmlChecks.metaText,
      indexability: htmlChecks.indexabilityText,
      schemaTypes: htmlChecks.schemaTypes || [],
      contentDepthScore: crawl.contentDepth?.score ?? 0,
      pagesCrawled: crawl.summary?.pagesCrawled ?? 0
    };

    const serp = {
      presence: serper?.presence || "Unknown",
      query: serper?.query || "",
      queries: serper?.queries || []
    };

    const crawlSnapshot = crawl.pages.slice(0, 8).map((page) => ({
      path: page.path,
      title: page.title,
      metaDescription: page.metaDescription,
      h1: page.headings?.h1?.slice(0, 2) || [],
      h2Count: page.headings?.h2?.length || 0,
      wordCount: page.wordCount,
      questionCount: page.questionCount,
      schemaTypes: page.schemaTypes
    }));

    const prompt = `
You are an expert in AI search visibility, semantic search, and how LLMs like ChatGPT, Gemini, and Perplexity discover and recommend brands.

This is NOT a traditional SEO audit.

Your job is to evaluate whether this business is understandable, trustworthy, and recommendable by AI systems.

BUSINESS
Website: ${url}
Business name: ${businessName}
Industry: ${input.industry || ""}
Product/Service: ${input.service || ""}

REAL SIGNALS AVAILABLE

STRUCTURE
- Title: ${htmlChecks.hasTitle}
- Meta description: ${htmlChecks.hasMetaDescription}
- H1: ${htmlChecks.hasH1}
- Schema: ${htmlChecks.hasSchema}
- Schema types on homepage: ${(htmlChecks.schemaTypes || []).join(", ") || "None detected"}
- Canonical: ${htmlChecks.hasCanonical}

INDEXABILITY
- Noindex present: ${htmlChecks.hasNoindex}

PERFORMANCE
- PageSpeed mobile score: ${pageSpeed?.score ?? "Unknown"}

SITE CRAWL SUMMARY
- Pages crawled: ${crawl.summary?.pagesCrawled ?? 0}
- Average word count: ${crawl.summary?.averageWordCount ?? 0}
- Pages with question signals: ${crawl.summary?.pagesWithQuestions ?? 0}
- Pages with strong heading structure: ${crawl.summary?.pagesWithStrongHeadings ?? 0}
- Pages with schema: ${crawl.summary?.pagesWithSchema ?? 0}
- Sitewide schema types: ${(crawl.schema?.schemaTypes || []).join(", ") || "None detected"}
- Content depth score: ${crawl.contentDepth?.score ?? 0}/100
- Content depth read: ${crawl.contentDepth?.summary || "Unavailable"}

CRAWLED PAGE SNAPSHOT
${JSON.stringify(crawlSnapshot, null, 2)}

SEARCH PRESENCE ACROSS MULTIPLE QUERY TYPES
${JSON.stringify(serper?.queries || [], null, 2)}

Evaluate this through an AI visibility lens:

1. Can AI clearly understand what this business is?
2. Can AI confidently recommend it as a solution?
3. Does the site reinforce entity clarity?
4. Does the site provide content that can be extracted into answers?
5. Are there signs of authority, trust, and citation readiness?
6. Would a competitor with stronger topic clusters, entity signals, and authority likely outrank this business in AI recommendations?

Return valid JSON ONLY with this exact shape:

{
  "score": number,
  "entityConfidence": number,
  "aiVerdict": "string",
  "summary": "string",
  "breakdown": [
    { "label": "Entity Clarity", "value": number },
    { "label": "Topic Coverage", "value": number },
    { "label": "Authority Signals", "value": number },
    { "label": "Answer Readiness", "value": number }
  ],
  "aiIssues": [
    "string",
    "string",
    "string"
  ],
  "priorities": [
    "string",
    "string",
    "string"
  ],
  "topAiQueries": [
    "string",
    "string",
    "string"
  ],
  "competitorAdvantage": [
    "string",
    "string"
  ],
  "opportunity": "string",
  "recommendation": {
    "likelihood": "Likely|Possible|Unlikely",
    "reason": "string"
  }
}

RULES:
- DO NOT lead with generic SEO advice
- Lead with AI discoverability issues first
- Use the crawl and multi-query data, not just the homepage, when judging topic coverage, entity clarity, answer readiness, and authority signals
- Use AI-first language like:
  - visibility in AI-generated answers
  - answer-engine understanding
  - brand or entity clarity
  - authority, trust, and citation readiness
  - surfaced in AI-led discovery
- aiVerdict should be a memorable, concise current-status line that sounds like an AI visibility readout
- summary should explain the overall AI discoverability picture in plain English
- aiIssues MUST be short, crisp, and explicitly about AI visibility or answer-engine readiness
- priorities MUST be AI-first, action-oriented, and clearly tied to answer-engine discoverability
- topAiQueries should be realistic natural-language prompts a prospect might ask AI
- competitorAdvantage should explain why a stronger competitor would be surfaced first
- Avoid generic phrases like "improve SEO" or "optimize rankings" unless explicitly tied to AI answers
- Keep tone concise, strategic, and modern
- Do not use markdown fences
`;

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are an expert in AI search visibility, semantic SEO, and technical site readiness. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const aiJson = await aiResponse.json();

    if (!aiResponse.ok) {
      return json(500, {
        error: aiJson.error?.message || "OpenAI request failed."
      });
    }

    const raw = aiJson.choices?.[0]?.message?.content || "{}";
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
      return json(500, {
        error: "OpenAI returned invalid JSON",
        raw: cleaned
      });
    }

    parsed.tech = tech;
    parsed.serp = serp;
    parsed.crawl = {
      summary: crawl.summary,
      schema: crawl.schema,
      contentDepth: crawl.contentDepth,
      pages: crawlSnapshot
    };
    parsed.recommendation = parsed.recommendation || {
      likelihood: serper?.brandFound ? "Possible" : "Unlikely",
      reason: "Based on available search and site signals."
    };
    parsed.entityConfidence = parsed.entityConfidence ?? 0;
    parsed.aiIssues = Array.isArray(parsed.aiIssues) ? parsed.aiIssues : [];
    parsed.priorities = Array.isArray(parsed.priorities) ? parsed.priorities : [];
    parsed.topAiQueries = Array.isArray(parsed.topAiQueries) ? parsed.topAiQueries : [];
    parsed.competitorAdvantage = Array.isArray(parsed.competitorAdvantage)
      ? parsed.competitorAdvantage
      : [];
    parsed.summary = String(parsed.summary || "").trim();
    parsed.aiVerdict = String(parsed.aiVerdict || "").trim();
    parsed.breakdown = Array.isArray(parsed.breakdown) ? parsed.breakdown : [];

    if (resendKey) {
      sendQuickAuditNotification({
        resendKey,
        businessName,
        url,
        parsed
      }).catch(() => {});
    }

    return json(200, parsed);
  } catch (error) {
    return json(500, { error: error.message || "Audit generation failed." });
  }
};

async function sendQuickAuditNotification({ resendKey, businessName, url, parsed }) {
  const alertTo = process.env.AUDIT_NOTIFICATION_TO || process.env.AUDIT_ALERT_EMAIL || "hello@semanticsearchmarketing.com";
  const fromEmail = process.env.AUDIT_EMAIL_FROM || "audit@semanticsearchmarketing.com";
  const submittedAt = new Date().toISOString();
  const findings = renderList(parsed.aiIssues, "No quick findings returned.");
  const priorities = renderList(parsed.priorities, "No priorities returned.");
  const breakdown = renderBreakdown(parsed.breakdown);
  const recommendation = escapeHtml(formatRecommendation(parsed.recommendation));

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 680px; margin: 0 auto;">
      <h2 style="margin:0 0 12px;">Quick Audit Completed</h2>
      <p><strong>Website:</strong> ${escapeHtml(url)}</p>
      <p><strong>Business:</strong> ${escapeHtml(businessName || "Unknown")}</p>
      <p><strong>Timestamp:</strong> ${escapeHtml(submittedAt)}</p>
      <p><strong>Score:</strong> ${escapeHtml(String(parsed.score ?? 0))}/100</p>
      <p><strong>Current Status:</strong> ${escapeHtml(String(parsed.aiVerdict || "Not available"))}</p>
      <p><strong>Summary:</strong> ${escapeHtml(String(parsed.summary || "Not available"))}</p>
      <p><strong>Entity Confidence:</strong> ${escapeHtml(String(parsed.entityConfidence ?? 0))}/100</p>
      <p><strong>Recommendation:</strong> ${recommendation}</p>
      <div style="margin-top:18px;">
        <p><strong>Breakdown</strong></p>
        <ul>${breakdown}</ul>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Main Findings</strong></p>
        <ol>${findings}</ol>
      </div>
      <div style="margin-top:18px;">
        <p><strong>Priorities</strong></p>
        <ol>${priorities}</ol>
      </div>
    </div>
  `;

  await sendEmail({
    resendKey,
    fromEmail,
    to: alertTo,
    subject: `Quick Audit Completed - ${businessName || url}`,
    html
  });
}

async function sendEmail({ resendKey, fromEmail, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail || "audit@semanticsearchmarketing.com",
      to: [to],
      subject,
      html
    })
  });

  if (!res.ok) {
    throw new Error("Notification send failed");
  }
}

function renderBreakdown(items) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!rows.length) {
    return "<li>No breakdown returned.</li>";
  }

  return rows
    .map((item) => {
      const label = escapeHtml(String(item?.label || "Signal"));
      const value = escapeHtml(String(item?.value ?? 0));
      return `<li>${label}: ${value}/100</li>`;
    })
    .join("");
}

function renderList(items, fallback) {
  const values = Array.isArray(items) ? items.filter((item) => String(item || "").trim()) : [];
  const entries = values.length ? values : [fallback];
  return entries.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("");
}

function formatRecommendation(recommendation) {
  const likelihood = String(recommendation?.likelihood || "").trim();
  const reason = String(recommendation?.reason || "").trim();

  if (likelihood && reason) {
    return `${likelihood}: ${reason}`;
  }

  return likelihood || reason || "Not available";
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function normalizeUrl(value) {
  const trimmed = (value || "").trim();
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
    hasNoindex,
    metaText: hasTitle && hasMetaDescription ? "Good" : hasTitle || hasMetaDescription ? "Partial" : "Weak",
    indexabilityText: hasNoindex ? "Restricted" : "Valid"
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
    const numeric = typeof score === "number" ? Math.round(score * 100) : null;

    return {
      score: numeric,
      speedText: numeric !== null ? `${numeric}/100` : "Unavailable",
      mobileText:
        numeric !== null
          ? numeric >= 90
            ? "Strong"
            : numeric >= 50
              ? "Moderate"
              : "Needs work"
          : "Unknown"
    };
  } catch {
    return null;
  }
}

async function getSerperSignals(input, hostname, apiKey) {
  const query = `${input.service || input.businessName || hostname} ${input.industry || ""}`.trim();

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
      const link = (item.link || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return (
        link.includes(hostname) ||
        title.includes((input.businessName || "").toLowerCase())
      );
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
