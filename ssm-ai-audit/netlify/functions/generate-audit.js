const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function round(num) {
  return Math.round(Number(num) || 0);
}

function average(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return 0;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function normalizeUrl(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(normalized).toString();
}

function getHostname(url) {
  return new URL(url).hostname.replace(/^www\./i, "");
}

function safeText(value, max = 3000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html, name) {
  const regex = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(regex);
  return match ? match[1].trim() : "";
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? safeText(match[1], 300) : "";
}

function extractH1(html) {
  const match = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? safeText(stripHtml(match[1]), 300) : "";
}

function countMatches(html, regex) {
  return (String(html || "").match(regex) || []).length;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(url) {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AIVisibilityAudit/1.0; +https://semanticsearchmarketing.com)"
      }
    },
    25000
  );

  if (!response.ok) {
    throw new Error(`Could not fetch site (${response.status})`);
  }

  const html = await response.text();
  const text = stripHtml(html);

  return {
    html,
    text: safeText(text, 10000),
    title: extractTitle(html),
    metaDescription: extractMeta(html, "description"),
    ogTitle: extractMeta(html, "og:title"),
    ogDescription: extractMeta(html, "og:description"),
    h1: extractH1(html),
    canonicalCount: countMatches(html, /<link[^>]+rel=["']canonical["']/gi),
    schemaCount:
      countMatches(html, /application\/ld\+json/gi) +
      countMatches(html, /itemtype=["']https?:\/\/schema\.org/gi),
    h1Count: countMatches(html, /<h1\b/gi),
    imageAltCount: countMatches(html, /<img\b[^>]*\salt=["'][^"']*["']/gi),
    imageCount: countMatches(html, /<img\b/gi),
    internalLinkCount: countMatches(html, /<a\b[^>]*href=["']\/(?!\/)/gi)
  };
}

async function runPageSpeed(url, strategy) {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PAGESPEED_API_KEY");
  }

  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("category", "performance");
  endpoint.searchParams.append("category", "seo");
  endpoint.searchParams.append("category", "accessibility");
  endpoint.searchParams.append("category", "best-practices");

  const response = await fetchWithTimeout(endpoint.toString(), {}, 35000);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PageSpeed ${strategy} failed: ${text}`);
  }

  const data = await response.json();
  const categories = data?.lighthouseResult?.categories || {};

  return {
    performance: round((categories.performance?.score || 0) * 100),
    seo: round((categories.seo?.score || 0) * 100),
    accessibility: round((categories.accessibility?.score || 0) * 100),
    bestPractices: round((categories["best-practices"]?.score || 0) * 100)
  };
}

async function runSerperSearch(query, num = 10) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SERPER_API_KEY");
  }

  const response = await fetchWithTimeout(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: query,
        gl: "ca",
        hl: "en",
        num
      })
    },
    20000
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Serper failed: ${text}`);
  }

  return response.json();
}

function summarizeSerp(brandResults, serviceResults, hostname) {
  const organic = Array.isArray(brandResults?.organic) ? brandResults.organic : [];
  const checked = organic.slice(0, 10);

  const hostnameRegex = new RegExp(hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  let domainHits = 0;
  let homepageFound = false;
  let topMatchPosition = null;

  for (const result of checked) {
    const link = String(result?.link || "");
    if (hostnameRegex.test(link)) {
      domainHits += 1;
      homepageFound = true;
      if (topMatchPosition == null && Number.isFinite(result?.position)) {
        topMatchPosition = result.position;
      }
    }
  }

  const serviceOrganic = Array.isArray(serviceResults?.organic) ? serviceResults.organic : [];
  const serviceChecked = serviceOrganic.slice(0, 10);

  let serviceMatchPosition = null;
  for (const result of serviceChecked) {
    const link = String(result?.link || "");
    if (hostnameRegex.test(link)) {
      serviceMatchPosition = Number.isFinite(result?.position) ? result.position : null;
      break;
    }
  }

  const score = clamp(
    round(
      domainHits * 8 +
      (homepageFound ? 14 : 0) +
      (topMatchPosition ? Math.max(0, 18 - topMatchPosition * 2) : 0) +
      (serviceMatchPosition ? Math.max(0, 14 - serviceMatchPosition * 2) : 0)
    ),
    0,
    100
  );

  return {
    brandDomainHits: domainHits,
    brandTopResultsChecked: checked.length || 10,
    homepageFound,
    topMatchPosition,
    serviceMatchPosition,
    score
  };
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        instructions:
          "You are an expert in AI search visibility, technical SEO, entity clarity, citation potential, and brand discoverability. Return only valid JSON.",
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "audit_result",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                executiveSummary: { type: "string" },
                strengths: {
                  type: "array",
                  items: { type: "string" }
                },
                priorityFixes: {
                  type: "array",
                  items: { type: "string" }
                },
                aiVisibilityReadout: {
                  type: "array",
                  items: { type: "string" }
                },
                adjustment: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    overallScore: { type: "number" },
                    performanceScore: { type: "number" },
                    seoScore: { type: "number" },
                    serpScore: { type: "number" }
                  },
                  required: [
                    "overallScore",
                    "performanceScore",
                    "seoScore",
                    "serpScore"
                  ]
                }
              },
              required: [
                "executiveSummary",
                "strengths",
                "priorityFixes",
                "aiVisibilityReadout",
                "adjustment"
              ]
            }
          }
        }
      })
    },
    45000
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI failed: ${text}`);
  }

  const data = await response.json();

  let parsed = null;

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    parsed = JSON.parse(data.output_text);
  } else {
    const output = Array.isArray(data.output) ? data.output : [];
    const textParts = [];

    for (const item of output) {
      if (item.type !== "message") continue;
      const content = Array.isArray(item.content) ? item.content : [];
      for (const c of content) {
        if (c.type === "output_text" && c.text) textParts.push(c.text);
      }
    }

    if (!textParts.length) {
      throw new Error("OpenAI returned no structured output");
    }

    parsed = JSON.parse(textParts.join("\n"));
  }

  return parsed;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = JSON.parse(event.body || "{}");
    const lead = {
      url: normalizeUrl(body.url),
      businessName: safeText(body.businessName, 200),
      industry: safeText(body.industry, 200),
      service: safeText(body.service, 200),
      email: safeText(body.email, 200)
    };

    if (!lead.url || !lead.businessName || !lead.industry || !lead.service || !lead.email) {
      return json(400, { error: "Missing required fields" });
    }

    const hostname = getHostname(lead.url);

    const [page, mobilePSI, desktopPSI, brandResults, serviceResults] = await Promise.all([
      fetchPage(lead.url),
      runPageSpeed(lead.url, "mobile"),
      runPageSpeed(lead.url, "desktop"),
      runSerperSearch(`"${lead.businessName}" ${hostname}`, 10),
      runSerperSearch(`"${lead.businessName}" ${lead.service}`, 10)
    ]);

    const serp = summarizeSerp(brandResults, serviceResults, hostname);

    const performanceScore = round(average([mobilePSI.performance, desktopPSI.performance]));
    const seoScore = round(average([mobilePSI.seo, desktopPSI.seo]));

    const technicalSignals = {
      titlePresent: Boolean(page.title),
      metaDescriptionPresent: Boolean(page.metaDescription),
      h1Present: Boolean(page.h1),
      h1Count: page.h1Count,
      schemaCount: page.schemaCount,
      canonicalCount: page.canonicalCount,
      imageAltCoverage:
        page.imageCount > 0 ? round((page.imageAltCount / page.imageCount) * 100) : 100,
      internalLinkCount: page.internalLinkCount
    };

    const prompt = `
Evaluate this website for AI search visibility and return strict JSON.

Lead context:
${JSON.stringify(lead, null, 2)}

Page summary:
${JSON.stringify({
  hostname,
  title: page.title,
  metaDescription: page.metaDescription,
  ogTitle: page.ogTitle,
  ogDescription: page.ogDescription,
  h1: page.h1,
  textExcerpt: page.text,
  technicalSignals
}, null, 2)}

PageSpeed:
${JSON.stringify({
  mobile: mobilePSI,
  desktop: desktopPSI
}, null, 2)}

SERP:
${JSON.stringify({
  serp,
  topBrandResults: (brandResults.organic || []).slice(0, 5).map((r) => ({
    position: r.position,
    title: r.title,
    link: r.link,
    snippet: r.snippet
  })),
  topServiceResults: (serviceResults.organic || []).slice(0, 5).map((r) => ({
    position: r.position,
    title: r.title,
    link: r.link,
    snippet: r.snippet
  }))
}, null, 2)}

Scoring guidance:
- Keep scores realistic.
- overallScore must be 0-100.
- Use the supplied raw scores as anchors, not replacements.
- Reflect AI interpretation, brand/entity clarity, trust/citation readiness, and discoverability.
- Do not invent facts outside the supplied evidence.

Baseline scoring anchors:
{
  "performanceScore": ${performanceScore},
  "seoScore": ${seoScore},
  "serpScore": ${serp.score}
}
`;

    const modelAudit = await callOpenAI(prompt);

    const categoryScores = {
      performance: clamp(
        round(modelAudit?.adjustment?.performanceScore || performanceScore),
        0,
        100
      ),
      seo: clamp(round(modelAudit?.adjustment?.seoScore || seoScore), 0, 100),
      serp: clamp(round(modelAudit?.adjustment?.serpScore || serp.score), 0, 100)
    };

    const weightedOverall = clamp(
      round(
        modelAudit?.adjustment?.overallScore ||
          categoryScores.performance * 0.35 +
          categoryScores.seo * 0.30 +
          categoryScores.serp * 0.20 +
          (technicalSignals.schemaCount > 0 ? 8 : 0) +
          (technicalSignals.metaDescriptionPresent ? 4 : 0) +
          (technicalSignals.h1Present ? 3 : 0)
      ),
      0,
      100
    );

    const audit = {
      analyzedAt: new Date().toISOString(),
      overallScore: weightedOverall,
      executiveSummary: safeText(modelAudit.executiveSummary, 800),
      categoryScores,
      strengths: Array.isArray(modelAudit.strengths) ? modelAudit.strengths.slice(0, 5).map((s) => safeText(s, 240)) : [],
      priorityFixes: Array.isArray(modelAudit.priorityFixes) ? modelAudit.priorityFixes.slice(0, 5).map((s) => safeText(s, 240)) : [],
      aiVisibilityReadout: Array.isArray(modelAudit.aiVisibilityReadout) ? modelAudit.aiVisibilityReadout.slice(0, 5).map((s) => safeText(s, 240)) : [],
      pagespeed: {
        mobile: mobilePSI,
        desktop: desktopPSI
      },
      serp,
      page: {
        hostname,
        title: page.title,
        metaDescription: page.metaDescription,
        h1: page.h1,
        schemaCount: page.schemaCount,
        canonicalCount: page.canonicalCount,
        h1Count: page.h1Count,
        internalLinkCount: page.internalLinkCount,
        imageAltCoverage: technicalSignals.imageAltCoverage
      },
      bookingUrl: process.env.AUDIT_BOOKING_URL || "https://calendar.app.google/XtiHBsQCKT1hSoJe6",
      contactUrl: process.env.AUDIT_CONTACT_URL || "https://www.semanticsearchmarketing.com/contact"
    };

    return json(200, { audit });
  } catch (error) {
    console.error("run-audit error:", error);
    return json(500, {
      error: error.message || "Audit failed"
    });
  }
};
